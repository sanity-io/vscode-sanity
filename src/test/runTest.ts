import {spawnSync} from 'node:child_process'
import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import {get} from 'node:https'
import path from 'node:path'
import {gunzipSync} from 'node:zlib'
import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests,
} from '@vscode/test-electron'

const root = path.resolve(__dirname, '../..')
const cacheDir = path.join(root, '.vscode-test')
const NATIVE_PREVIEW = {id: 'TypeScriptTeam.native-preview', version: '1.0.2'}

function download(url: string, file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, file).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`GET ${url} failed with ${res.statusCode}`))
        return
      }
      res.pipe(createWriteStream(file)).on('finish', resolve).on('error', reject)
    }).on('error', reject)
  })
}

/**
 * Installs the TypeScript 7 (tsgo) extension, points it at the TypeScript 7.1 devDependency, and
 * copies the `.groq` fixture project next to `node_modules` so the content mapper resolves.
 */
async function prepareTsgo(vscodeExecutablePath: string) {
  const [, publisher, name] = /^(.+)\.(.+)$/.exec(NATIVE_PREVIEW.id) ?? []
  const vsix = path.join(
    cacheDir,
    `${NATIVE_PREVIEW.id}-${NATIVE_PREVIEW.version}-${process.platform}-${process.arch}.vsix`
  )
  if (!existsSync(vsix)) {
    const target = `${process.platform}-${process.arch}`
    const url = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${name}/${NATIVE_PREVIEW.version}/vspackage?targetPlatform=${target}`
    await download(url, vsix + '.download')
    // The marketplace serves the vsix gzip-compressed.
    const raw = readFileSync(vsix + '.download')
    writeFileSync(vsix, raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw)
    rmSync(vsix + '.download')
  }

  const extensionsDir = path.join(cacheDir, 'tsgo-extensions')
  const userDataDir = path.join(cacheDir, 'tsgo-user-data')
  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath)
  const install = spawnSync(
    cli,
    [
      ...cliArgs,
      `--extensions-dir=${extensionsDir}`,
      `--user-data-dir=${userDataDir}`,
      '--install-extension',
      vsix,
      '--force',
    ],
    {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    }
  )
  if (install.status !== 0) {
    throw new Error(`Installing ${NATIVE_PREVIEW.id} failed:\n${install.stdout}${install.stderr}`)
  }

  mkdirSync(path.join(userDataDir, 'User'), {recursive: true})
  writeFileSync(
    path.join(userDataDir, 'User', 'settings.json'),
    JSON.stringify({
      'js/ts.experimental.useTsgo': true,
      'js/ts.tsdk.path': path.join(root, 'node_modules', 'typescript-7'),
      'window.restoreWindows': 'none',
    })
  )

  const project = path.join(cacheDir, 'hover-project')
  rmSync(project, {recursive: true, force: true})
  cpSync(path.join(root, 'fixtures', 'hover-project'), project, {recursive: true})
  return {extensionsDir, userDataDir, project}
}

/**
 * Installs the packaged vsix into a clean extensions directory, so the tests run against what is
 * published. VS Code still needs an extension under development to host the tests, so an empty one
 * is created for that.
 */
function installVsix(vscodeExecutablePath: string, vsix: string, launchArgs: Array<string>) {
  const extensionsDir = path.join(cacheDir, 'vsix-extensions')
  const userDataDir = path.join(cacheDir, 'vsix-user-data')
  rmSync(extensionsDir, {recursive: true, force: true})
  rmSync(userDataDir, {recursive: true, force: true})
  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath)
  const install = spawnSync(
    cli,
    [
      ...cliArgs,
      `--extensions-dir=${extensionsDir}`,
      `--user-data-dir=${userDataDir}`,
      '--install-extension',
      vsix,
      '--force',
    ],
    {encoding: 'utf8', shell: process.platform === 'win32'}
  )
  if (install.status !== 0) {
    throw new Error(`Installing ${vsix} failed:\n${install.stdout}${install.stderr}`)
  }

  const host = path.join(cacheDir, 'vsix-test-host')
  mkdirSync(host, {recursive: true})
  writeFileSync(
    path.join(host, 'package.json'),
    JSON.stringify({
      name: 'vsix-test-host',
      publisher: 'local',
      version: '0.0.0',
      engines: {vscode: '*'},
    })
  )
  launchArgs.push(`--extensions-dir=${extensionsDir}`, `--user-data-dir=${userDataDir}`)
  return host
}

async function main() {
  const tsgo = process.argv.includes('--tsgo')
  const launchArgs = ['--disable-workspace-trust']
  const vscodeVersion = process.argv
    .find((arg) => arg.startsWith('--vscode='))
    ?.slice('--vscode='.length)
  const vsix = process.argv.find((arg) => arg.startsWith('--vsix='))?.slice('--vsix='.length)
  const extensionTestsEnv: Record<string, string> = {}
  const vscodeExecutablePath = await downloadAndUnzipVSCode(vscodeVersion)

  if (tsgo) {
    const {extensionsDir, userDataDir, project} = await prepareTsgo(vscodeExecutablePath)
    launchArgs.push(`--extensions-dir=${extensionsDir}`, `--user-data-dir=${userDataDir}`, project)
    extensionTestsEnv.SANITY_TEST_TSGO = project
  } else {
    // A workspace folder that is not the process cwd, so a relative schema path only resolves if
    // the client joins it to the folder. The execute-query fixture is a second folder so
    // sanity.cli.ts is in the workspace too. lsp-workspace stays first.
    const workspaceDir = path.join(cacheDir, 'lsp-workspace')
    mkdirSync(workspaceDir, {recursive: true})
    // A copy, because the .env file tests write .env files next to its sanity.cli.ts.
    const executeProject = path.join(cacheDir, 'execute-project')
    rmSync(executeProject, {recursive: true, force: true})
    cpSync(path.join(root, 'fixtures', 'execute-project'), executeProject, {recursive: true})
    launchArgs.push(workspaceDir, executeProject)
    extensionTestsEnv.SANITY_TEST_EXECUTE_PROJECT = executeProject
  }

  let extensionDevelopmentPath = root
  if (vsix) {
    extensionDevelopmentPath = installVsix(vscodeExecutablePath, path.resolve(vsix), launchArgs)
  }

  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, 'suite/index'),
    extensionTestsEnv,
    launchArgs,
  })
}

// This file is compiled to CommonJS and run directly, so it cannot use top-level await.
// oxlint-disable-next-line unicorn/prefer-top-level-await
main().catch((error: unknown) => {
  // oxlint-disable-next-line no-console -- the integration runner has no other logger
  console.error(error)
  process.exit(1)
})
