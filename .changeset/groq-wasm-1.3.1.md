---
'vscode-sanity': patch
---

GROQ lint findings and formatting follow `@sanity-labs/groq-wasm` 1.3.1 (`@sanity-labs/groq-lsp` 1.4.7). Lint findings match how the Content Lake query planner runs a query: a correlated `count()` whose `^` condition is `==` or `references()` is no longer reported, since it is batched into one index read, and slices of one document's attribute array no longer count as deep pagination. `join-in-filter` suggests `a._ref in *[b == "c"]._id` instead of a `count()` rewrite. A `|` pipe chain is formatted all or nothing: it stays on one line when it fits, and otherwise every stage goes on its own line with a leading `|`.
