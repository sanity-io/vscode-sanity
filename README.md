# vscode-sanity

Extension for [Visual Studio Code](https://code.visualstudio.com/) / [Cursor](https://cursor.com/) that makes developing applications for [Sanity.io](https://www.sanity.io/) that much more awesome.

## Features

### GROQ syntax highlighting

Syntax highlighting for the GROQ query language is available in the following situations:

- Files with the `.groq` extension
- Fenced code blocks in Markdown with the `groq` tag
- Tagged template literals with the `groq` tag
- Queries using the `defineQuery` method
- Template literals prefixed with the `/* groq */` comment
- Template literals starting with a `// groq` comment

### Execute GROQ-queries

When GROQ-queries are detected, the extension will allow you to run the query and displays the result as JSON in a separate tab.

The project ID and dataset used is determined by finding `sanity.cli.ts` in the workspace. If multiple files are found, the extension will prompt you to select one.

If the GROQ file/query has any variables, then extension asks for a relative filename of a JSON-file containing an object of key-value mappings. It autofills the param filename based on the current file with a `.json` extension, if it exists.

![Execute GROQ](https://raw.githubusercontent.com/sanity-io/vscode-sanity/main/screenshots/previewofquery.png)

### GROQ in TypeScript hovers

TypeScript prints the type of a GROQ query (for example a `.groq` import typed as `/* groq */` template literal) as a single double-quoted string with `\n` escapes. When you hover such a type, or a value of that type, the extension adds a second section to the hover with the query formatted onto real lines and syntax highlighted as GROQ. VS Code cannot hide the language server's own section, so both are shown.

Detection works on the hover text itself: a string or template literal in a code block that parses as GROQ and references the dataset (`*[...]`) is picked up, as is a fenced `groq` block from the query's documentation (groq-content-mapper adds one with the query as authored). The mapper's prettify option is not needed: the extension formats the query with [groq-format](https://github.com/atombender/groq-format), wrapped to 80 columns by default (`sanity.formatGroqInHoverWidth`). Custom function definitions (`fn image::asset($asset) = ...;`) and comments that come before the query are shown as written; only the query is reformatted, and comments inside it are kept.

TypeScript 7 cuts long types off after about 5,000 characters, in the middle of the query. If the hover also has the query's documentation block, that full copy is formatted instead. Otherwise the extension does not format half a query: it says the hover was truncated, and the full query is in the `.groq` file.

Turn the whole feature off with `sanity.formatGroqInHover`.

## Usage

Install the extension for [VSCode](https://marketplace.visualstudio.com/items?itemName=sanity-io.vscode-sanity) or [Cursor](https://open-vsx.org/extension/sanity-io/vscode-sanity) by searching for `sanity`. This extension adds syntax highlighting for GROQ-files and `groq` tags.

## Development

1.  Clone the repository - https://github.com/sanity-io/vscode-sanity
2.  `npm install`
3.  Open it in VSCode
4.  Go to the debugging section and run the launch program "Extension"
5.  This will open another VSCode instance with extension enabled
6.  Open a file that should be syntax highlighted
7.  Make changes to the extension code, then press (`Ctrl+R` or `Cmd+R` on Mac) in the syntax highlighted file to test the changes

> We follow the principles of semantic versioning and conventional commits, meaning that the commits are used as the basis for determining if it's a patch/minor/major when building and releasing new version, as well as for generating the release notes. A good explanation of what commit messages translate to what version bumps can be found in the [`semantic release`](https://github.com/semantic-release/semantic-release?tab=readme-ov-file#commit-message-format) docs.

Run `npm test` for the unit tests. `npm run test:integration` downloads VS Code and checks the hover end to end against the built-in TypeScript extension. `npm run test:integration:tsgo` does the same with the TypeScript 7 extension (`TypeScriptTeam.native-preview`, downloaded from the Marketplace) running TypeScript 7.1 and `@sanity-labs/groq-content-mapper` on the `.groq` files in `fixtures/hover-project`. On Linux without a display, run either with `xvfb-run -a`.

The formatter is groq-format compiled to WebAssembly; the build output is committed in `groq-format-wasm/pkg`. Rebuild it with `scripts/build-groq-format.sh` (needs Rust with the `wasm32-unknown-unknown` target and `wasm-bindgen-cli` 0.2.130).

If you want to build/inspect the vsix file, you can do `npm run package`. It can then be "installed from location" in either Cursor or VS Code.

## Publishing

The extension is built whenever new code is pushed to the `main` branch of the repo. The release notes and tagging is done automatically in CI by `semantic-release` and the extension is pushed to Open VSX registry and [Visual Studio marketplace](https://marketplace.visualstudio.com/items?itemName=sanity-io.vscode-sanity).

If you want to dry run the release, you can do 👇 to have `semantic-release` parse the git history and see if everything is ok. Since you're running locally it'll skip the actual steps of packaging and pushing etc. You need to set `GITHUB_TOKEN` + `OVSX_PAT` and/or `VSCE_PAT` env vars for the dry run release to complete.

```sh
# you can dry-run using
npm run release:dryrun

# and when all is good you do
npm run release
```

> ⚠️ The `release` script will not publish from your local machine (unless you do `--no-ci`). The publishing should be handled in CI – if you need to do it, see the workflow file for details on what ENV vars you need to provide.

## License

MIT
