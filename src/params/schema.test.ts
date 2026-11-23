import assert from 'node:assert/strict'
import {mkdtemp, mkdir, readFile, realpath, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {after, describe, it} from 'node:test'
import {findKnownParamValues} from './known-values'
import {
  CONTENT_MAPPER_PACKAGE,
  cliSchemaPath,
  findMapperSchemaPath,
  loadProjectSchema,
  loadSchemaFrom,
} from './schema'

const SCHEMA = [{type: 'document', name: 'post', attributes: {}}]

const roots: Array<string> = []
after(() => Promise.all(roots.map((root) => rm(root, {recursive: true, force: true}))))

async function project(files: Record<string, string>) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'vscode-sanity-schema-')))
  roots.push(root)
  for (const [file, contents] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), {recursive: true})
    await writeFile(path.join(root, file), contents)
  }
  return root
}

const mapper = (options: unknown) => ({
  package: CONTENT_MAPPER_PACKAGE,
  extensions: ['.groq'],
  options,
})
const tsconfig = (options: unknown) => JSON.stringify({contentMappers: [mapper(options)]})

describe('findMapperSchemaPath', () => {
  it('reads the schema from the content mapper options of the tsconfig, relative to it', async () => {
    const root = await project({'tsconfig.json': tsconfig({schema: './generated/schema.json'})})
    assert.equal(
      findMapperSchemaPath(path.join(root, 'src/posts.groq')),
      path.join(root, 'generated/schema.json'),
    )
  })

  it('does not need a schema.json next to the file or anywhere above it', async () => {
    const root = await project({
      'studio/tsconfig.json': tsconfig({schema: '../schemas/main.json'}),
      'schemas/main.json': JSON.stringify(SCHEMA),
    })
    const found = findMapperSchemaPath(path.join(root, 'studio/src/a/b/posts.ts'))
    assert.equal(found, path.join(root, 'schemas/main.json'))
    assert.deepEqual(await loadSchemaFrom([found]), SCHEMA)
  })

  it('reads a tsconfig with comments and the mapper entry it inherits through extends', async () => {
    const root = await project({
      'base.json': `{
        // shared by every package
        "contentMappers": [${JSON.stringify(mapper({schema: './schema.json'}))}]
      }`,
      'app/tsconfig.json': '{"extends": "../base.json", /* app */ "compilerOptions": {}}',
    })
    assert.equal(
      findMapperSchemaPath(path.join(root, 'app/src/a.ts')),
      path.join(root, 'app/schema.json'),
    )
  })

  it('uses the nearest tsconfig', async () => {
    const root = await project({
      'tsconfig.json': tsconfig({schema: 'root.json'}),
      'packages/blog/tsconfig.json': tsconfig({schema: 'blog.json'}),
    })
    assert.equal(
      findMapperSchemaPath(path.join(root, 'packages/blog/src/a.groq')),
      path.join(root, 'packages/blog/blog.json'),
    )
    assert.equal(findMapperSchemaPath(path.join(root, 'src/a.groq')), path.join(root, 'root.json'))
  })

  it('picks the schemas entry with the deepest folder, then falls back to schema', async () => {
    const root = await project({
      'tsconfig.json': tsconfig({
        schema: 'default.json',
        schemas: [
          {include: 'src/queries/blog', schema: 'blog.json'},
          {include: ['src/queries/shop', 'src/*/checkout'], schema: 'shop.json'},
          {include: 'src/queries/blog/archive', schema: 'archive.json'},
          {include: 'src/**/reports/**', schema: 'reports.json'},
        ],
      }),
    })
    const schemaOf = (file: string) =>
      path.relative(root, findMapperSchemaPath(path.join(root, file)) ?? '')
    assert.equal(schemaOf('src/queries/blog/a.groq'), 'blog.json')
    assert.equal(schemaOf('src/queries/blog/archive/a.groq'), 'archive.json')
    assert.equal(schemaOf('src/queries/shop/deep/a.groq'), 'shop.json')
    assert.equal(schemaOf('src/pages/checkout/a.groq'), 'shop.json')
    assert.equal(schemaOf('src/x/y/reports/q1/a.groq'), 'reports.json')
    assert.equal(schemaOf('src/reports/a.groq'), 'reports.json')
    assert.equal(schemaOf('src/reportsx/a.groq'), 'default.json')
    assert.equal(schemaOf('src/queries/other/a.groq'), 'default.json')
    assert.equal(schemaOf('lib/a.groq'), 'default.json')
  })

  it('has no schema without a schemas entry covering the file and no schema option', async () => {
    const root = await project({
      'tsconfig.json': tsconfig({schemas: [{include: 'src/blog', schema: 'blog.json'}]}),
    })
    assert.equal(findMapperSchemaPath(path.join(root, 'src/shop/a.groq')), undefined)
  })

  it('has no schema without a tsconfig, a mapper entry or options', async () => {
    assert.equal(findMapperSchemaPath(path.join(await project({}), 'a.groq')), undefined)
    const other = await project({
      'tsconfig.json': JSON.stringify({
        contentMappers: [{package: 'another-mapper', options: {schema: 'x.json'}}],
      }),
    })
    assert.equal(findMapperSchemaPath(path.join(other, 'a.groq')), undefined)
    const bare = await project({
      'tsconfig.json': JSON.stringify({contentMappers: [mapper(undefined)]}),
    })
    assert.equal(findMapperSchemaPath(path.join(bare, 'a.groq')), undefined)
  })

  it('has no schema when the tsconfig cannot be read', async () => {
    const broken = await project({'tsconfig.json': '{"contentMappers": ['})
    assert.equal(findMapperSchemaPath(path.join(broken, 'a.groq')), undefined)
    const missingBase = await project({'tsconfig.json': '{"extends": "./nope.json"}'})
    assert.equal(findMapperSchemaPath(path.join(missingBase, 'a.groq')), undefined)
    const circular = await project({
      'tsconfig.json': '{"extends": "./a.json"}',
      'a.json': '{"extends": "./tsconfig.json"}',
    })
    assert.equal(findMapperSchemaPath(path.join(circular, 'a.groq')), undefined)
  })
})

describe('cliSchemaPath', () => {
  it('is schema.json next to sanity.cli.ts unless schemaExtraction says otherwise', () => {
    assert.equal(cliSchemaPath('/p', undefined), '/p/schema.json')
    assert.equal(cliSchemaPath('/p', {}), '/p/schema.json')
    assert.equal(cliSchemaPath('/p', {path: './out/types.json'}), '/p/out/types.json')
    assert.equal(cliSchemaPath('/p', {path: 'out'}), '/p/out/schema.json')
  })
})

describe('loadSchemaFrom', () => {
  it('reads the first file that is an extracted schema', async () => {
    const root = await project({
      'missing-is-skipped/other.json': JSON.stringify({type: 'object'}),
      'schema.json': JSON.stringify(SCHEMA),
      'broken.json': '{',
    })
    assert.deepEqual(
      await loadSchemaFrom([
        path.join(root, 'nope.json'),
        path.join(root, 'broken.json'),
        path.join(root, 'missing-is-skipped/other.json'),
        path.join(root, 'schema.json'),
      ]),
      SCHEMA,
    )
  })

  it('returns undefined without one', async () => {
    assert.equal(await loadSchemaFrom([]), undefined)
    assert.equal(await loadSchemaFrom(['/nope/schema.json']), undefined)
  })
})

describe('loadProjectSchema', () => {
  const post = {
    type: 'document',
    name: 'post',
    attributes: {_type: {type: 'objectAttribute', value: {type: 'string', value: 'post'}}},
  }
  const query = '*[_type == $type]'

  it('gives _type suggestions for a project whose schema is only declared in the mapper config', async () => {
    const root = await project({
      'sanity.cli.ts': '',
      'tsconfig.json': tsconfig({schema: './extracted/content.json'}),
      'extracted/content.json': JSON.stringify([post]),
    })
    const schema = await loadProjectSchema({
      file: path.join(root, 'src/posts.groq'),
      configDir: root,
      schemaExtraction: undefined,
    })
    assert.deepEqual(findKnownParamValues(query, schema!), new Map([['type', ['post']]]))
  })

  it('prefers the mapper schema and falls back to the one sanity.cli.ts extracts', async () => {
    const root = await project({
      'tsconfig.json': tsconfig({schema: 'mapper.json'}),
      'mapper.json': JSON.stringify([
        {...post, name: 'mapped', attributes: {_type: post.attributes._type}},
      ]),
      'schema.json': JSON.stringify([post]),
    })
    const options = {file: path.join(root, 'a.groq'), configDir: root, schemaExtraction: undefined}
    assert.deepEqual(
      await loadProjectSchema(options),
      JSON.parse(await readFile(path.join(root, 'mapper.json'), 'utf8')),
    )
    assert.deepEqual(await loadProjectSchema({...options, file: undefined}), [post])
    await rm(path.join(root, 'mapper.json'))
    assert.deepEqual(await loadProjectSchema(options), [post])
  })

  it('has no schema when nothing is configured', async () => {
    const root = await project({})
    assert.equal(
      await loadProjectSchema({
        file: path.join(root, 'a.groq'),
        configDir: root,
        schemaExtraction: undefined,
      }),
      undefined,
    )
  })
})
