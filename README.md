# vscode-sanity

Extension for [Visual Studio Code](https://code.visualstudio.com/) that makes developing applications for [Sanity.io](https://www.sanity.io/) that much more awesome.

## Features

### GROQ syntax highlighting

Syntax highlighting for the GROQ query language is available in the following situations:

- Files with the `.groq` extension
- Fenced code blocks in Markdown with the `groq` tag
- Tagged template literals with the `groq` tag
- Template literals prefixed with the `/* groq */` comment
- Template literals starting with a `// groq` comment

### Execute GROQ-queries

When GROQ-queries are detected, the extension will allow you to run the query and displays the result as JSON in a separate tab.

The project ID and dataset used is determined by looking at `sanity.json`.

If groq file has any variables, then extension asks for a relative file name of a json file which has all variables key-values. It autofills param file name which uses same name as groq file but with `.json` extension, if it exists.

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

## License

MIT
