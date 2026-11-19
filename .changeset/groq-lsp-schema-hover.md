---
'vscode-sanity': patch
---

Hover over a field in a GROQ query shows the type the schema gives that field, such as `title: string`, instead of the type of the whole query. `_type` shows the document type the query filters to, such as `post`. This comes from `@sanity-labs/groq-lsp` 1.2.2.
