---
'vscode-sanity': patch
---

GROQ formatting (`Format Document` in `.groq` files and **GROQ: Format GROQ Queries**) now uses groq-format through `@sanity-labs/groq-wasm`, the formatter GROQ hovers already use, instead of Prettier. Formatted queries are indented with the editor's tab size, and with tabs when the editor indents with tabs. The language server no longer bundles Prettier, so the extension is smaller.
