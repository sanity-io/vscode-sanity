# vscode-sanity

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
