# vscode-sanity

## 0.10.2

### Patch Changes

- [#108](https://github.com/sanity-io/vscode-sanity/pull/108) [`21215f8`](https://github.com/sanity-io/vscode-sanity/commit/21215f80487e3374fb9247e6817af4f597e60711) Thanks [@stipsan](https://github.com/stipsan)! - Go to Definition on a `.groq` import only opens the file when it exists. With `baseUrl` set, a missing package import or unmapped alias is no longer a jump target.

- [#109](https://github.com/sanity-io/vscode-sanity/pull/109) [`010dd7f`](https://github.com/sanity-io/vscode-sanity/commit/010dd7fd41a543fedb64eadf08688e9e1629ed81) Thanks [@stipsan](https://github.com/stipsan)! - GROQ hovers use `groq-js` 2.0.2 and `@sanity/codegen` 8.3.2. A field the schema makes nullable now hovers as non-null under a `defined(field)` or `field != null` filter even when the filter has terms that cannot be decided, such as `_type == $type`, and `defined(path.to.field)` narrows a path through a named type.

- [#111](https://github.com/sanity-io/vscode-sanity/pull/111) [`7d134a6`](https://github.com/sanity-io/vscode-sanity/commit/7d134a6a0f988bb7a8935f0fa7306506eb758a60) Thanks [@stipsan](https://github.com/stipsan)! - GROQ hovers show the type the generated types give more of a query, via `@sanity-labs/groq-lsp` 1.4.1 (`@sanity-labs/groq-lint` 1.3.1 and `@sanity-labs/lint-core` 1.0.3). A call to a built-in such as `count(…)`, `defined(…)`, `coalesce(…)`, `select(…)` or `pt::text(…)` shows what the call returns next to the function's documentation, and a pipe function such as `| order(…)` shows the array it returns. The start of a chain that continues after it shows its type: `slug` in `*[_type == "post"].slug.current` or `showcaseProjects[]->slug.current`, `order` in `*[…] | order(…) {…}`, and `tags` in `{tags[0]}` or `{tags[]}`. String and number literals print the way the generated types do, so `'It\'s'` shows `"It's"` and `2.50` shows `2.5`. A query parameter hovers as the `QueryParams` type the content mapper generates for it, including a parameter in a query whose root is an object, the bounds of `x in $min..$max`, an arithmetic operand, and a comparison with a literal. A field read through `^` in a filter over an array of strings or numbers, such as `tags` in `tags[@ in ^.tags]`, shows its type. Field, projection key and custom function call hovers follow the query's syntax tree, so they match `QueryResponse` on queries whose root is an object, after a `//` comment, and inside `select()` and conditional attributes. A missing field hovers as `null`, `true`, `false` and `null` hover as literals, and types print as `sanity typegen` does (`never` for an empty union, quoted names, `_key` on arrays of named types).

## 0.10.1

### Patch Changes

- [#106](https://github.com/sanity-io/vscode-sanity/pull/106) [`7278ffb`](https://github.com/sanity-io/vscode-sanity/commit/7278ffb64fc15fb14623a0f9d2265e2557970926) Thanks [@stipsan](https://github.com/stipsan)! - GROQ hovers are more accurate, via `@sanity-labs/groq-lsp` 1.4.0 (`@sanity-labs/groq-lint` 1.3.0). A field inside a filter `[]` hovers as the type it has before the filter is applied, so `_type` in `*[_type == "post"]` shows every document type while `_type` in the projection is still narrowed to `"post"`. Fields inside `...@-> { … }` spreads and other `->` projections resolve against the dereferenced document type, query parameters such as `$slug` hover as the type the query uses them as, and string literals and quoted projection keys no longer hover as the type of the whole query. `invalid-type-filter` now also checks the names in `_type in [...]`.

- [#104](https://github.com/sanity-io/vscode-sanity/pull/104) [`3323cb1`](https://github.com/sanity-io/vscode-sanity/commit/3323cb123b1c040734806e8d5193bd8d230c73cb) Thanks [@stipsan](https://github.com/stipsan)! - GROQ queries in TypeScript hovers are formatted to 40 columns by default instead of 80, so a long line no longer gets cut mid-expression by the narrow tooltip and the query breaks at `&&`, `{` and other GROQ boundaries instead. Set `sanity.formatGroqInHoverWidth` to `80` to get the previous width back. Format Query and the file formatter still use 80 columns. Thanks to Cody Olsen for reporting this.

## 0.10.0

### Minor Changes

- [#101](https://github.com/sanity-io/vscode-sanity/pull/101) [`43ea6cc`](https://github.com/sanity-io/vscode-sanity/commit/43ea6cce4e88b3b72c235fdfe5fc2b6c387dfda2) Thanks [@stipsan](https://github.com/stipsan)! - A `.groq` file of only custom function definitions, such as a shared `image.groq`, can be formatted with Format Query, and shows no Execute Query or Copy Query lens since it has no query to run. Each definition gets a Find References lens. Execute Query and Copy Query prepend the custom functions a query calls, and those they call in turn, from groq-content-mapper's `functions` setting, so a query that calls `image::richText(body)` runs instead of failing with "Undefined namespace: image", and the copied text runs on its own. Go to definition on a custom function call opens its definition, and Find All References lists its calls in the other `.groq` files. These come from `@sanity-labs/groq-lsp` 1.3 and `@sanity-labs/groq-wasm` 1.2.4.

- [#100](https://github.com/sanity-io/vscode-sanity/pull/100) [`0b86c3e`](https://github.com/sanity-io/vscode-sanity/commit/0b86c3e9c681b1e578a3b97df2920d400f4ab1e0) Thanks [@stipsan](https://github.com/stipsan)! - Suggest the known values of a query parameter when Execute GROQ query asks for it. A parameter compared with `_type` (or with any field that has a closed set of values in your schema, such as a string literal union) is offered as a pick list that still accepts any typed value. Parameters without known values keep the plain input.

### Patch Changes

- [#99](https://github.com/sanity-io/vscode-sanity/pull/99) [`824102f`](https://github.com/sanity-io/vscode-sanity/commit/824102f5185192b6f3ce335608dfd963a8aa4415) Thanks [@stipsan](https://github.com/stipsan)! - The language server reports when a GROQ projection writes the same key more than once, via `@sanity-labs/groq-lsp` 1.2.3 (`@sanity-labs/groq-lint` 1.1.0 `duplicate-projection-key`).

## 0.9.2

### Patch Changes

- [#97](https://github.com/sanity-io/vscode-sanity/pull/97) [`e98de58`](https://github.com/sanity-io/vscode-sanity/commit/e98de58fabb2fefc3c58b9f62856e7996a43875c) Thanks [@stipsan](https://github.com/stipsan)! - Hover over a field in a GROQ query shows the type the schema gives that field, such as `title: string`, instead of the type of the whole query. `_type` shows the document type the query filters to, such as `post`. This comes from `@sanity-labs/groq-lsp` 1.2.2.

## 0.9.1

### Patch Changes

- [`613d4fe`](https://github.com/sanity-io/vscode-sanity/commit/613d4fe2b7a41de41e4586060192b253014c2b68) Thanks [@stipsan](https://github.com/stipsan)! - Completion lists each field once. Schemas from `sanity schema extract` declare system fields such as `_id`, `_rev` and `_createdAt`, which used to appear twice next to the built-in system field items.

## 0.9.0

### Minor Changes

- [#91](https://github.com/sanity-io/vscode-sanity/pull/91) [`66666e4`](https://github.com/sanity-io/vscode-sanity/commit/66666e436f1e34c14ee8f75d73dfab022c347c44) Thanks [@torjusb](https://github.com/torjusb)! - Queries that interpolate fragments, such as ``defineQuery(`*[_type == "article"]{ author->${author} }`)``, are linted with the fragments inlined instead of reporting a parse error, and editing an open fragment re-lints the queries that use it. Execute Query, Copy Query and the linter now also follow fragments imported from workspace packages in `node_modules`. Fragment resolution comes from `@sanity-labs/groq-lsp` 1.2.

## 0.8.0

### Minor Changes

- [#88](https://github.com/sanity-io/vscode-sanity/pull/88) [`50364aa`](https://github.com/sanity-io/vscode-sanity/commit/50364aa32e7e1acb2963eee40ba44805153b25b6) Thanks [@stipsan](https://github.com/stipsan)! - The GROQ language server reads groq-content-mapper's settings from the nearest `tsconfig.json`. When `groq.schemaPath` is empty and no well-known schema file is found, the mapper's `schema` or `schemas` gives the schema. Queries in `.groq` files that call shared custom functions from the mapper's `functions` option are linted with those definitions prepended, instead of reporting a parse error.

- [#86](https://github.com/sanity-io/vscode-sanity/pull/86) [`7b0e7df`](https://github.com/sanity-io/vscode-sanity/commit/7b0e7df57862918015c358a88d95415b9e993d47) Thanks [@stipsan](https://github.com/stipsan)! - Go to Definition, and Cmd/Ctrl+click, on a `.groq` import such as `import query from '#queries/slugPage.groq'` now opens the file. Relative paths and the `paths` and `baseUrl` of the nearest `tsconfig.json` are followed, which TypeScript does not do for `.groq` files.

### Patch Changes

- [#89](https://github.com/sanity-io/vscode-sanity/pull/89) [`66eeccb`](https://github.com/sanity-io/vscode-sanity/commit/66eeccbecd7695d8772c60a1d907407f86551910) Thanks [@stipsan](https://github.com/stipsan)! - Update `@sanity-labs/groq-lsp` to 1.0.11 for GROQ formatting, `defineQuery` linting, and schema file watching fixes.

## 0.7.0

### Minor Changes

- [#84](https://github.com/sanity-io/vscode-sanity/pull/84) [`e897a21`](https://github.com/sanity-io/vscode-sanity/commit/e897a21cbdd51c3f0271c261d8932b0f033c8254) Thanks [@torjusb](https://github.com/torjusb)! - Copy GROQ queries to the clipboard. Every detected query gets a "Copy Query" CodeLens next to "Execute Query", and the "Copy GROQ query" command copies the selection, or the whole file when nothing is selected.

- [#69](https://github.com/sanity-io/vscode-sanity/pull/69) [`216bc1d`](https://github.com/sanity-io/vscode-sanity/commit/216bc1d91fac6710a4e3d386b3aa522e3eeb8eac) Thanks [@msafi](https://github.com/msafi)! - The query result view shows how many results an array query returned, as in "Query result (3)". Queries that return `0`, `null` or another non-array value are now shown as that value instead of an empty array.

### Patch Changes

- [#73](https://github.com/sanity-io/vscode-sanity/pull/73) [`73631b0`](https://github.com/sanity-io/vscode-sanity/commit/73631b09508ff2d99be2d0ef5e4e345c22db0110) Thanks [@stipsan](https://github.com/stipsan)! - GROQ queries in `.astro` files now get the Execute Query codelens and formatted GROQ in hovers, and opening an `.astro` file activates the extension. The README explains how to point Execute Query at a project in an Astro project that uses `@sanity/astro`.

- [#68](https://github.com/sanity-io/vscode-sanity/pull/68) [`2500dc8`](https://github.com/sanity-io/vscode-sanity/commit/2500dc835a758c81489ceb920845cb815e1023c4) Thanks [@stipsan](https://github.com/stipsan)! - Execute GROQ query now loads the `.env` files next to `sanity.cli.ts` the way the Sanity CLI does, so a `projectId` or `dataset` that comes from an environment variable such as `SANITY_STUDIO_PROJECT_ID` is found. `.env`, `.env.local`, `.env.<mode>` and `.env.<mode>.local` are read, where the mode is `SANITY_ACTIVE_ENV` or `development`, and variables that are already set take priority.

## 0.6.0

### Minor Changes

- [#67](https://github.com/sanity-io/vscode-sanity/pull/67) [`8b7bb85`](https://github.com/sanity-io/vscode-sanity/commit/8b7bb859a1587305c3e01a85567699fb04aea564) Thanks [@stipsan](https://github.com/stipsan)! - Add the `sanity.apiVersion` setting for the API version used by Execute GROQ query. It takes a date such as `v2025-02-19`, `v1` or `vX`, and is checked when you edit it in settings. It defaults to `v2025-02-19`, so newer GROQ functions like `pt::text()` work without configuration. Executing a query no longer fails with "Invalid API version" because no version was set.

- [#70](https://github.com/sanity-io/vscode-sanity/pull/70) [`4f9a56a`](https://github.com/sanity-io/vscode-sanity/commit/4f9a56a30cc9427f0563929e9ef5f44cce7b0ea3) Thanks [@torjusb](https://github.com/torjusb)! - Execute Query now works on queries that interpolate fragments, such as ``groq`*[_type == "post"]{${fragment}}` `` and `defineQuery()` calls with a template literal. The fragment is inlined before the query runs, whether it is declared in the same file or imported from another one, through relative paths or tsconfig `paths`. Fragments can be `groq` templates, `defineQuery()` calls, plain strings, concatenations of those, or `.groq` files. Anything that cannot be resolved is left as written.

### Patch Changes

- [#81](https://github.com/sanity-io/vscode-sanity/pull/81) [`11ffce3`](https://github.com/sanity-io/vscode-sanity/commit/11ffce307c3df055b963dad81b796c5d8b3e1459) Thanks [@stipsan](https://github.com/stipsan)! - **Format Query** keeps the indent of the line a query starts on. Continuation lines of a formatted `groq` or `defineQuery` template no longer jump back to column 0.

- [#76](https://github.com/sanity-io/vscode-sanity/pull/76) [`75cfe31`](https://github.com/sanity-io/vscode-sanity/commit/75cfe315aa1e9b6699b70869ff99c4c36088c331) Thanks [@stipsan](https://github.com/stipsan)! - GROQ formatting (`Format Document` in `.groq` files and **GROQ: Format GROQ Queries**) now uses groq-format through `@sanity-labs/groq-wasm`, the formatter GROQ hovers already use, instead of Prettier. Formatted queries are indented with the editor's tab size, and with tabs when the editor indents with tabs. The language server no longer bundles Prettier, so the extension is smaller.

- [#74](https://github.com/sanity-io/vscode-sanity/pull/74) [`12ae8e5`](https://github.com/sanity-io/vscode-sanity/commit/12ae8e55c008ec3e8896ecd147cad41134919b76) Thanks [@stipsan](https://github.com/stipsan)! - Execute GROQ query works with `sanity.cli.ts` files that import `defineCliConfig` from `sanity/cli` in Sanity v3. It used to fail with "does not provide an export named 'defineCliConfig'", and every later attempt failed with "Unexpected module status 0. Cannot require() ES Module".

- [#82](https://github.com/sanity-io/vscode-sanity/pull/82) [`b63a760`](https://github.com/sanity-io/vscode-sanity/commit/b63a760e29719ec92e099b3aea66420c667ef3a7) Thanks [@stipsan](https://github.com/stipsan)! - Rewrite the Marketplace README around what the extension does: running queries, diagnostics, completion and formatting. It now includes screenshots and a settings reference.

## 0.5.0

### Minor Changes

- [#71](https://github.com/sanity-io/vscode-sanity/pull/71) [`2e30f51`](https://github.com/sanity-io/vscode-sanity/commit/2e30f51720295bf6a5135567e17ed3ff38dc45a2) Thanks [@runeb](https://github.com/runeb)! - Add a **Format Query** code lens next to **Execute Query**. It formats that one GROQ query in place: a `groq` template literal, a `defineQuery` template literal, or a whole `.groq` file. Unlike **GROQ: Format GROQ Queries**, it also formats `defineQuery` queries, and it works when the GROQ language server is off. It is hidden when `groq.enableFormatting` or `sanity.useCodelens` is off, and for queries with `${}` interpolations or backslash escapes, which cannot be rewritten safely.

- [#63](https://github.com/sanity-io/vscode-sanity/pull/63) [`0975e38`](https://github.com/sanity-io/vscode-sanity/commit/0975e389493a47af92314cdca999a4abd7da6da7) Thanks [@stipsan](https://github.com/stipsan)! - Add GROQ linting, completion and formatting. The extension now runs the GROQ language server on `.groq` files and `groq` template literals in JavaScript and TypeScript: syntax errors and lint warnings show up as you type, completion suggests fields and functions (and your schema's types and fields when a `schema.json` is found or set with `groq.schemaPath`), and `Format Document` formats `.groq` files. In JavaScript and TypeScript files, run **GROQ: Format GROQ Queries** to format the queries without touching the rest of the file. It also adds GROQ snippets, the `groq.enable`, `groq.schemaPath`, `groq.maxDiagnostics`, `groq.enableFormatting` and `groq.trace.server` settings, and fixes "Execute GROQ query" failing on queries that contain `null`.

## 0.4.1

### Patch Changes

- [#60](https://github.com/sanity-io/vscode-sanity/pull/60) [`425651a`](https://github.com/sanity-io/vscode-sanity/commit/425651a8697cc670675081c8f09ea0a1c277f5cd) Thanks [@stipsan](https://github.com/stipsan)! - Smaller, faster-loading extension. It is now bundled into minified JavaScript, so the package is about 0.6 MB with 21 files instead of 10.7 MB with over 3,500. It no longer starts with every VS Code window, only when a GROQ, JavaScript or TypeScript file is opened, and activating it is much quicker: the TypeScript compiler is no longer loaded at startup, and the Sanity client and result view load the first time a query is executed. `sanity.cli.ts` is now compiled with Sucrase, which also handles configs that import other local `.ts` files.

- [#62](https://github.com/sanity-io/vscode-sanity/pull/62) [`0e69ae2`](https://github.com/sanity-io/vscode-sanity/commit/0e69ae269efc756909c748d580a10df037303c99) Thanks [@stipsan](https://github.com/stipsan)! - Running a query again picks up edits in local files that `sanity.cli.ts` imports. Previously only the config file itself was reloaded.

## 0.4.0

### Minor Changes

- [#57](https://github.com/sanity-io/vscode-sanity/pull/57) [`1687b37`](https://github.com/sanity-io/vscode-sanity/commit/1687b379c849611df5ffae3f7a6300265660ff25) Thanks [@stipsan](https://github.com/stipsan)! - Format and highlight GROQ queries in TypeScript hovers

### Patch Changes

- [#58](https://github.com/sanity-io/vscode-sanity/pull/58) [`3a76a25`](https://github.com/sanity-io/vscode-sanity/commit/3a76a25349388cb42158798759a61ce10651f731) Thanks [@stipsan](https://github.com/stipsan)! - enable trusted publishing

## 0.3.0 - 2026-04-15

- Format JSON before opening ([#34](https://github.com/sanity-io/vscode-sanity/pull/34))
- Update and externalize the GROQ grammars, upgrade dependencies ([#52](https://github.com/sanity-io/vscode-sanity/pull/52))

## 0.2.5 - 2026-01-05

- Require VS Code 1.107 and update dependencies ([#40](https://github.com/sanity-io/vscode-sanity/pull/40), [#42](https://github.com/sanity-io/vscode-sanity/pull/42))

## 0.2.4 - 2025-10-20

- Make the README less specific to VS Code

## 0.2.3 - 2025-10-20

- Update the logo in the README

## 0.2.2 - 2025-10-20

- Support GROQ syntax highlighting in Astro files
- Publish to the Open VSX registry ([#36](https://github.com/sanity-io/vscode-sanity/pull/36))

## 0.2.1 - 2024-09-12

- Treat `defineQuery` contents as GROQ ([#28](https://github.com/sanity-io/vscode-sanity/pull/28))

## 0.2.0 - 2024-08-06

- BREAKING CHANGE: Drop support for Sanity Studio v2
- Support Sanity Studio v3 and new groq `defineQuery` method

## 0.1.4 - 2021-01-19

- Fix Mac key binding for 'sanity.executeGroq' to not conflict with VSCode default keybindings

## 0.1.1 - 2020-10-13

- Upgraded `@sanity/client`

## 0.1.0 - 2020-10-13

- Added support for running GROQ-queries

## 0.0.3 - 2020-03-15

- Added syntax highlighting for GROQ inside `.svelte`, `.php` files (#3)

## 0.0.2 - 2018-12-11

- Update package description

## 0.0.1 - 2018-12-11

- Initial release
