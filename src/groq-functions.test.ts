import assert from 'node:assert/strict'
import {mkdirSync, mkdtempSync, realpathSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {describe, it} from 'node:test'
import {parse} from 'groq-js'
import {invalidateCustomFunctions, withCustomFunctions} from './groq-functions'
import {findVariablesInQuery} from './variables'

const ASSET = 'fn image::asset($asset) = $asset->{url, metadata{lqip, dimensions}};'
const FIELD = 'fn image::field($image) = $image{crop, hotspot, "asset": image::asset(asset)};'
const RICH_TEXT = `fn image::richText($blocks) = $blocks[]{
  ...,
  _type == "image" => {_key, _type, alt, caption, crop, hotspot, "asset": image::asset(asset)},
  _type == "timeline" => {
    ...,
    items[]{
      ...,
      milestones[]{
        ...,
        "image": image::field(image)
      }
    }
  }
};`

const SLUG_PAGE = `*[_type == "page" && slug.current == $slug][0] {
  _id,
  _type,
  "body": image::richText(body),
  overview,
  title,
  "slug": slug.current
}
`

function project(): string {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'vscode-sanity-functions-')))
  mkdirSync(path.join(dir, 'groq'))
  mkdirSync(path.join(dir, 'queries'))
  writeFileSync(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify({
      contentMappers: [
        {
          package: '@sanity-labs/groq-content-mapper',
          extensions: ['.groq'],
          options: {functions: ['groq/*.groq']},
        },
      ],
    }),
  )
  writeFileSync(
    path.join(dir, 'groq', 'image.groq'),
    `// Image helpers\n${ASSET}\n${FIELD}\n${RICH_TEXT}\n`,
  )
  return dir
}

describe('withCustomFunctions', () => {
  it('prepends the functions a query calls and those they call, so it runs on its own', () => {
    const file = path.join(project(), 'queries', 'slugPage.groq')
    const query = withCustomFunctions(SLUG_PAGE, file)
    assert.equal(query, `${ASSET}\n${FIELD}\n${RICH_TEXT}\n${SLUG_PAGE}`)
    assert.doesNotThrow(() => parse(query))
    assert.deepEqual(findVariablesInQuery(query), ['slug'])
  })

  it('prepends nothing a second time, nor for a query that calls no custom functions', () => {
    const file = path.join(project(), 'queries', 'slugPage.groq')
    const once = withCustomFunctions(SLUG_PAGE, file)
    assert.equal(withCustomFunctions(once, file), once)
    assert.equal(withCustomFunctions('*[_type == "page"]', file), '*[_type == "page"]')
  })

  it('reads a new functions file that the functions glob matches after invalidation', () => {
    const dir = project()
    const file = path.join(dir, 'queries', 'card.groq')
    const query = '*[_type == "card"]{"author": author::name(author)}'
    assert.equal(withCustomFunctions(query, file), query)

    const definition = 'fn author::name($author) = $author->{name};'
    writeFileSync(path.join(dir, 'groq', 'author.groq'), `${definition}\n`)
    assert.equal(withCustomFunctions(query, file), query)

    invalidateCustomFunctions()
    assert.equal(withCustomFunctions(query, file), `${definition}\n${query}`)
  })

  it('leaves the query alone without groq-content-mapper settings or a file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vscode-sanity-no-functions-'))
    writeFileSync(path.join(dir, 'tsconfig.json'), '{}')
    assert.equal(withCustomFunctions(SLUG_PAGE, path.join(dir, 'slugPage.groq')), SLUG_PAGE)
    assert.equal(withCustomFunctions(SLUG_PAGE, undefined), SLUG_PAGE)
  })
})
