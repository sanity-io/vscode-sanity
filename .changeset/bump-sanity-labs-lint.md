---
'vscode-sanity': patch
---

GROQ formatting follows `@sanity-labs/groq-wasm` 1.2.7 (`@sanity-labs/groq-lsp` 1.4.5). A `|` pipeline stays on one line when it fits, and otherwise each stage goes on its own line with a leading `|`. There is no space between `->` and a projection, a projection that does not fit breaks one member per line, and a trailing `//` comment stays on the line it follows.
