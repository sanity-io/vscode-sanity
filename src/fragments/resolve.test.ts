import assert from 'node:assert'
import {describe, it} from 'node:test'
import {extractQueries} from './resolve'
import type {FragmentHost} from './types'

function hostOf(files: Record<string, string>): FragmentHost {
  return {readFile: async (file) => files[file]}
}

async function contents(source: string, files: Record<string, string> = {}) {
  const queries = await extractQueries(source, '/app/src/query.ts', hostOf(files))
  return queries.map((query) => query.content)
}

describe('extractQueries', () => {
  it('keeps a query without interpolation as written', async () => {
    assert.deepStrictEqual(await contents('const q = groq`*[_type == "post"]`'), [
      '*[_type == "post"]',
    ])
    assert.deepStrictEqual(await contents('defineQuery(\'*[_type == "post"]\')'), [
      '*[_type == "post"]',
    ])
    assert.deepStrictEqual(await contents('defineQuery(`*[_type == "post"]`)'), [
      '*[_type == "post"]',
    ])
  })

  it('reports where the query starts', async () => {
    const source = 'const a = 1\nconst q = groq`*`'
    const [query] = await extractQueries(source, '/app/q.ts', hostOf({}))
    assert.strictEqual(query.offset, source.indexOf('groq'))
  })

  it('inlines fragments from the issue example', async () => {
    const source = [
      'const image = groq`',
      '"image": image{',
      '  ...,',
      '  "asset": asset->,',
      '}',
      '`',
      'const CONTACT_US_PAGE = groq`',
      "*[_id == 'contactUsPage'][0]{",
      '  ...,',
      '  ${image}',
      '}`',
    ].join('\n')
    const queries = await contents(source)
    assert.strictEqual(queries.length, 2)
    assert.strictEqual(
      queries[1],
      [
        "\n*[_id == 'contactUsPage'][0]{",
        '  ...,',
        '  \n"image": image{',
        '  ...,',
        '  "asset": asset->,',
        '}\n',
        '}',
      ].join('\n'),
    )
  })

  it('inlines fragments written as plain strings, with comments and type annotations', async () => {
    const source = [
      'export const fragmentA = /* groq */ `"id": _id,`',
      "export const fragmentB: string = 'title,'",
      'const query = defineQuery(`*[_type == "artist"][0]{${fragmentA} ${fragmentB}}`)',
    ].join('\n')
    assert.deepStrictEqual(
      (await contents(source)).at(-1),
      '*[_type == "artist"][0]{"id": _id, title,}',
    )
  })

  it('resolves fragments that use other fragments, however deep', async () => {
    const source = [
      'const a = groq`name`',
      'const b = groq`author->{${a}}`',
      'const c = defineQuery(`book{${b}}`)',
    ].join('\n')
    assert.deepStrictEqual((await contents(source)).at(-1), 'book{author->{name}}')
  })

  it('resolves concatenation and wrapping', async () => {
    const source = [
      "const a = 'title,'",
      'const b = (a + " slug," + `${a}`) as const',
      'const c = defineQuery("*{" + b + "}" satisfies string)',
    ].join('\n')
    assert.deepStrictEqual((await contents(source)).at(-1), '*{title, slug,title,}')
  })

  it('resolves named, aliased, default and re-exported imports', async () => {
    const files = {
      '/app/src/fragments.ts': [
        'export const named = groq`named`',
        'const local = groq`local`',
        'export {local as aliased}',
        'export default groq`byDefault`',
        "export {far as reexported} from './far'",
        "export * from './all'",
      ].join('\n'),
      '/app/src/far.ts': 'export const far = "far"',
      '/app/src/all.ts': 'export const everything = "all"',
    }
    const source = [
      "import byDefault, {named, aliased as renamed, reexported, everything} from './fragments'",
      'defineQuery(`${byDefault},${named},${renamed},${reexported},${everything}`)',
    ].join('\n')
    assert.deepStrictEqual(await contents(source, files), ['byDefault,named,local,far,all'])
  })

  it('resolves imports through folders, index files and .js specifiers', async () => {
    const files = {
      '/app/src/lib/index.ts': 'export const fromIndex = "index"',
      '/app/src/other.tsx': 'export const other = "other"',
    }
    const source = [
      "import {fromIndex} from './lib'",
      "import {other} from './other.js'",
      'groq`${fromIndex} ${other}`',
    ].join('\n')
    assert.deepStrictEqual(await contents(source, files), ['index other'])
  })

  it('resolves tsconfig paths and baseUrl', async () => {
    const files = {
      '/app/tsconfig.json':
        '{\n // comment\n "compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["src/*"],},},\n}',
      '/app/src/queries/fragments.ts': 'export const frag = "frag"',
      '/app/src/shared.ts': 'export const shared = "shared"',
    }
    const source = [
      "import {frag} from '@/queries/fragments'",
      "import {shared} from 'src/shared'",
      'groq`${frag} ${shared}`',
    ].join('\n')
    assert.deepStrictEqual(await contents(source, files), ['frag shared'])
  })

  it('inlines .groq files', async () => {
    const files = {'/app/src/image.groq': '"image": image'}
    const source = "import image from './image.groq'\ngroq`{${image}}`"
    assert.deepStrictEqual(await contents(source, files), ['{"image": image}'])
  })

  it('leaves what it cannot resolve as written', async () => {
    const files = {'/app/src/dynamic.ts': 'export const dynamic = build()'}
    const source = [
      "import {dynamic} from './dynamic'",
      "import {missing} from './missing'",
      "import {pkg} from 'some-package'",
      'groq`${dynamic} ${missing} ${pkg} ${fn(1)} ${obj.prop} ${undeclared}`',
    ].join('\n')
    assert.deepStrictEqual(await contents(source, files), [
      '${dynamic} ${missing} ${pkg} ${fn(1)} ${obj.prop} ${undeclared}',
    ])
  })

  it('does not follow a fragment that is not a plain string', async () => {
    const source = [
      'const a = cond ? groq`x` : groq`y`',
      'const b = groq`x`.trim()',
      'groq`${a} ${b}`',
    ].join('\n')
    assert.deepStrictEqual((await contents(source)).at(-1), '${a} ${b}')
  })

  it('survives fragments that refer to each other', async () => {
    const files = {
      '/app/src/a.ts': "import {b} from './b'\nexport const a = groq`a${b}`",
      '/app/src/b.ts': "import {a} from './a'\nexport const b = groq`b${a}`",
      '/app/src/star.ts': "export * from './star'",
    }
    const source = "import {a} from './a'\nimport {nothing} from './star'\ngroq`${a} ${nothing}`"
    assert.deepStrictEqual(await contents(source, files), ['ab${a} ${nothing}'])
  })

  it('only sees top-level declarations and ignores code in comments and strings', async () => {
    const source = [
      'function f() { const inner = groq`inner` }',
      '// const commented = groq`commented`',
      'const text = "groq`not a query`"',
      'groq`${inner} ${commented}`',
    ].join('\n')
    assert.deepStrictEqual(await contents(source), ['inner', '${inner} ${commented}'])
  })

  it('finds queries after regular expressions and nested templates', async () => {
    const source = [
      'const re = /`[/]`/g',
      'const half = a / b / c',
      'const nested = `x ${`y ${1}`}`',
      'groq`last`',
    ].join('\n')
    assert.deepStrictEqual(await contents(source), ['last'])
  })

  it('does not throw on unfinished code', async () => {
    assert.deepStrictEqual(await contents('const a = groq`one`\nconst q = groq`*[_type == ${a'), [
      'one',
      '*[_type == one',
    ])
    assert.deepStrictEqual(await contents('defineQuery('), [])
  })

  it('ignores groq that is not the tag and defineQuery that is not a call', async () => {
    const source =
      "import {defineQuery} from 'groq'\nobj.groq`a`\nobj.defineQuery('b')\nconst groq = 1"
    assert.deepStrictEqual(await contents(source), [])
  })
})
