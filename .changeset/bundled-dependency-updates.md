---
'vscode-sanity': patch
---

Updates the dependencies bundled into the extension. `@sanity-labs/groq-content-mapper` moves from 0.7.3 to 0.7.6, which also brings `@sanity/codegen` 8.3.4 and the WebAssembly the mapper rebuilt in 0.7.5. The language client and server move to `vscode-languageclient` and `vscode-languageserver` 11.0.1, with `vscode-languageserver-protocol` 3.18.6 and `vscode-jsonrpc` 10.0.1. The Babel packages used for type generation move to 7.29.15 and 8.1.3. There are no intended changes to hovers, diagnostics or formatting.
