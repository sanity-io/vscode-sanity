import * as path from 'path'
import {runTests} from '@vscode/test-electron'

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '../..')
  const extensionTestsPath = path.resolve(__dirname, 'suite/index')
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ['--disable-workspace-trust'],
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
