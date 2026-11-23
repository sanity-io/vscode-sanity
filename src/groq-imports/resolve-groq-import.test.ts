import assert from 'node:assert'
import path from 'node:path'
import {describe, it} from 'node:test'
import {resolveGroqImport} from './resolve-groq-import'
import type {GroqImportHost} from './resolve-groq-import'

const p = (...parts: Array<string>) => path.resolve('/app', ...parts)

function hostOf(files: Record<string, string>): GroqImportHost {
  const known = Object.fromEntries(Object.entries(files).map(([file, text]) => [p(file), text]))
  const dirs = new Set(Object.keys(known).flatMap(dirsOf))
  return {
    readFile: async (file) => known[file],
    directoryExists: async (dir) => dirs.has(dir),
  }
}

function dirsOf(file: string): Array<string> {
  const dirs: Array<string> = []
  for (let dir = path.dirname(file); !dirs.includes(dir); dir = path.dirname(dir)) {
    dirs.push(dir)
  }
  return dirs
}

const NEXT_TSCONFIG = JSON.stringify({
  compilerOptions: {
    // comments are fine in tsconfig
    paths: {'#queries/*': ['./src/queries/*'], '#queries/slugPage.groq': ['./src/special.groq']},
  },
})
const FROM = p('src/app/page.tsx')

describe('resolveGroqImport', () => {
  it('resolves relative specifiers', async () => {
    const host = hostOf({'src/app/foo.groq': '*', 'src/bar.groq': '*'})
    assert.deepStrictEqual(await resolveGroqImport(FROM, './foo.groq', host), {
      file: p('src/app/foo.groq'),
      exists: true,
    })
    assert.deepStrictEqual(await resolveGroqImport(FROM, '../bar.groq', host), {
      file: p('src/bar.groq'),
      exists: true,
    })
  })

  it('resolves a paths alias from the nearest tsconfig', async () => {
    const host = hostOf({
      'tsconfig.json': NEXT_TSCONFIG,
      'src/queries/slugPageMetadata.groq': '*',
    })
    assert.deepStrictEqual(await resolveGroqImport(FROM, '#queries/slugPageMetadata.groq', host), {
      file: p('src/queries/slugPageMetadata.groq'),
      exists: true,
    })
  })

  it('prefers the most specific pattern, an exact one over a wildcard', async () => {
    const host = hostOf({
      'tsconfig.json': NEXT_TSCONFIG,
      'src/queries/slugPage.groq': '*',
      'src/special.groq': '*',
    })
    assert.deepStrictEqual(await resolveGroqImport(FROM, '#queries/slugPage.groq', host), {
      file: p('src/special.groq'),
      exists: true,
    })
  })

  it('uses a tsconfig closer to the file over one further up', async () => {
    const host = hostOf({
      'tsconfig.json': NEXT_TSCONFIG,
      'src/tsconfig.json': JSON.stringify({
        compilerOptions: {paths: {'#queries/*': ['./other/*']}},
      }),
      'src/other/a.groq': '*',
      'src/queries/a.groq': '*',
    })
    assert.strictEqual(
      (await resolveGroqImport(FROM, '#queries/a.groq', host))?.file,
      p('src/other/a.groq'),
    )
  })

  it('prefers a mapping target that exists', async () => {
    const host = hostOf({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {paths: {'@q/*': ['./missing/*', './queries/*']}},
      }),
      'queries/a.groq': '*',
    })
    assert.deepStrictEqual(await resolveGroqImport(FROM, '@q/a.groq', host), {
      file: p('queries/a.groq'),
      exists: true,
    })
  })

  it('resolves paths from baseUrl, and bare specifiers from baseUrl alone', async () => {
    const host = hostOf({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {baseUrl: 'src', paths: {'@q/*': ['queries/*']}},
      }),
      'src/queries/a.groq': '*',
      'src/lib/b.groq': '*',
    })
    assert.strictEqual(
      (await resolveGroqImport(FROM, '@q/a.groq', host))?.file,
      p('src/queries/a.groq'),
    )
    assert.strictEqual(
      (await resolveGroqImport(FROM, 'lib/b.groq', host))?.file,
      p('src/lib/b.groq'),
    )
  })

  it('does not resolve bare specifiers from the tsconfig folder without a baseUrl', async () => {
    const host = hostOf({
      'tsconfig.json': JSON.stringify({compilerOptions: {paths: {'@q/*': ['queries/*']}}}),
      'lib/b.groq': '*',
    })
    assert.strictEqual(await resolveGroqImport(FROM, 'lib/b.groq', host), undefined)
  })

  it('returns the best path for a file that does not exist, preferring one in an existing folder', async () => {
    const host = hostOf({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {paths: {'@q/*': ['./nowhere/*', './queries/*']}},
      }),
      'queries/other.groq': '*',
    })
    assert.deepStrictEqual(await resolveGroqImport(FROM, '@q/new.groq', host), {
      file: p('queries/new.groq'),
      exists: false,
    })
  })

  it('returns the first candidate when no folder exists, and relative paths as written', async () => {
    const host = hostOf({
      'tsconfig.json': JSON.stringify({compilerOptions: {paths: {'@q/*': ['./a/*', './b/*']}}}),
    })
    assert.deepStrictEqual(await resolveGroqImport(FROM, '@q/new.groq', host), {
      file: p('a/new.groq'),
      exists: false,
    })
    assert.deepStrictEqual(await resolveGroqImport(FROM, './new.groq', host), {
      file: p('src/app/new.groq'),
      exists: false,
    })
  })

  it('does not resolve specifiers that no mapping covers', async () => {
    const host = hostOf({'tsconfig.json': NEXT_TSCONFIG})
    assert.strictEqual(await resolveGroqImport(FROM, 'some-package/q.groq', host), undefined)
    assert.strictEqual(await resolveGroqImport(FROM, '#other/q.groq', host), undefined)
    assert.strictEqual(await resolveGroqImport(FROM, 'q.groq', hostOf({})), undefined)
  })
})
