---
'vscode-sanity': minor
---

Queries that interpolate fragments, such as ``defineQuery(`*[_type == "article"]{ author->${author} }`)``, are linted with the fragments inlined instead of reporting a parse error, and editing an open fragment re-lints the queries that use it. Execute Query, Copy Query and the linter now also follow fragments imported from workspace packages in `node_modules`. Fragment resolution comes from `@sanity-labs/groq-lsp` 1.2.

author: @torjusb
