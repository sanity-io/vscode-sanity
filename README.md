# vscode-sanity

Extension for [Visual Studio Code](https://code.visualstudio.com/) that makes developing applications for [Sanity.io](https://www.sanity.io/) that much more awesome.

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

![Execute GROQ in VS Code](https://raw.githubusercontent.com/sanity-io/vscode-sanity/main/screenshots/previewofquery.png)

## Usage

Install the [VSCode Sanity.io Extension](https://marketplace.visualstudio.com/items?itemName=sanity-io.vscode-sanity). This extension adds syntax highlighting for GROQ-files and `groq` tags.

## Development

1.  Clone the repository - https://github.com/sanity-io/vscode-sanity
2.  `npm install`
3.  Open it in VSCode
4.  Go to the debugging section and run the launch program "Extension"
5.  This will open another VSCode instance with extension enabled
6.  Open a file that should be syntax highlighted
7.  Make changes to the extension code, then press (`Ctrl+R` or `Cmd+R` on Mac) in the syntax highlighted file to test the changes

> We follow the principles of semantic versioning and the commits are used as the basis for determining if it's a patch/minor/major when building and releasing new version, as well as for the release notes. A good explanation of what commit messages translate to what version bumps can be found in the [`semantic release`](https://github.com/semantic-release/semantic-release?tab=readme-ov-file#commit-message-format) docs.

If you want to build/inspect the vsix file, you can do `npm run package`.

## Publishing

The extension is built whenever new code is pushed to the `main` branch of the repo. The release notes and tagging is done automatically in CI by `semantic-release` and the extension is pushed to Open VSX registry and [Visual Studio marketplace](https://marketplace.visualstudio.com/items?itemName=sanity-io.vscode-sanity).

If you want to dry run the release, you can do 👇 to have `semantic-release` parse the git history and see if everything is ok. Since you're running locally it'll skip the actual steps of packaging and pushing etc. You need to set `GITHUB_TOKEN` + `OVSX_PAT` and/or `VSCE_PAT` env vars for the dry run release to complete.

```sh
npm run release:dry-run
```

## License

MIT
