import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {canFormatInSource, formatGroq, formatQuerySource} from './format'

const QUERY =
  '*[_type=="post"&&defined(slug.current)]{_id,title,"author":author->{name,"avatar":avatar.asset->url},"categories":categories[]->{title,"slug":slug.current}}|order(_createdAt desc)[0...10]'

describe('formatGroq', () => {
  it('puts a minified query on real lines, wrapped to 80 columns', () => {
    const formatted = formatGroq(QUERY)
    assert.equal(
      formatted,
      [
        '*[_type == "post" && defined(slug.current)] {',
        '  _id,',
        '  title,',
        '  "author": author-> { name, "avatar": avatar.asset->url },',
        '  "categories": categories[]-> { title, "slug": slug.current }',
        '}',
        '  | order(_createdAt desc)[0...10]',
      ].join('\n'),
    )
    for (const line of formatted!.split('\n')) {
      assert.ok(line.length <= 80, line)
    }
  })

  it('wraps to a narrower width when asked', () => {
    const formatted = formatGroq(QUERY, 40)!
    assert.ok(formatted.split('\n').length > formatGroq(QUERY)!.split('\n').length)
    assert.ok(formatted.includes('"author": author-> {\n    name,'), formatted)
  })

  it('keeps comments', () => {
    assert.equal(
      formatGroq('*[_type == "post"]{_id, // the id\ntitle}'),
      '*[_type == "post"] {\n  _id, // the id\n  title\n}',
    )
  })

  it('formats custom function definitions and leading comments together with the query', () => {
    const query =
      'fn image::asset($asset) = $asset->{url, metadata};\n' +
      'fn image::field($image) = $image{crop, hotspot, "asset": image::asset(asset)};\n' +
      '// All published posts\n' +
      '*[_type=="post"]{_id,"image":image::field(mainImage)}'
    assert.equal(
      formatGroq(query),
      [
        'fn image::asset($asset) = $asset-> { url, metadata };',
        'fn image::field($image) = $image { crop, hotspot, "asset": image::asset(asset) };',
        '',
        '// All published posts',
        '*[_type == "post"] { _id, "image": image::field(mainImage) }',
      ].join('\n'),
    )
  })

  it('keeps comments between and after function definitions', () => {
    assert.equal(
      formatGroq('fn a::b($x) = $x{c}; // note\n// lead\nfn a::d($y) = $y{e};\n*[]{"d": a::b(@)}'),
      [
        'fn a::b($x) = $x { c };',
        '// note',
        '// lead',
        'fn a::d($y) = $y { e };',
        '',
        '*[] { "d": a::b(@) }',
      ].join('\n'),
    )
  })

  it('passes the width on to function definitions too', () => {
    const query = 'fn a::b($x) = $x{aaaaaaaaaa, bbbbbbbbbb, cccccccccc, dddddddddd};\n*[]'
    assert.equal(
      formatGroq(query, 80)!.split('\n')[0],
      'fn a::b($x) = $x { aaaaaaaaaa, bbbbbbbbbb, cccccccccc, dddddddddd };',
    )
    assert.ok(formatGroq(query, 30)!.split('\n').length > 3)
  })

  it('returns undefined for text that is not GROQ', () => {
    assert.equal(formatGroq('*[_type == '), undefined)
  })
})

describe('formatQuerySource', () => {
  it('formats a query and keeps the whitespace around it', () => {
    assert.equal(
      formatQuerySource('\n  *[_type == "post"]{  title,body}\n'),
      '\n  *[_type == "post"] { title, body }\n',
    )
  })

  it('indents every continuation line to the line the query starts on', () => {
    assert.equal(
      formatQuerySource(
        '\n  *[_type == "post"]{title,"author":author->{name,"avatar":avatar.asset->url}}\n',
      ),
      [
        '',
        '  *[_type == "post"] {',
        '    title,',
        '    "author": author-> { name, "avatar": avatar.asset->url }',
        '  }',
        '',
      ].join('\n'),
    )
  })

  it('returns undefined for blank text and text that is not GROQ', () => {
    assert.equal(formatQuerySource('  \n'), undefined)
    assert.equal(formatQuerySource('*[_type == ]'), undefined)
  })
})

describe('canFormatInSource', () => {
  it('rejects template literals with interpolations or escapes', () => {
    assert.equal(canFormatInSource('*[_type == "post"]'), true)
    assert.equal(canFormatInSource('*[_type == "${type}"]'), false)
    assert.equal(canFormatInSource(String.raw`*[title == "a\"b"]`), false)
  })
})
