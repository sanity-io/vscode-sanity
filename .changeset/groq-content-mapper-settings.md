---
'vscode-sanity': minor
---

The GROQ language server reads groq-content-mapper's settings from the nearest `tsconfig.json`. When `groq.schemaPath` is empty and no well-known schema file is found, the mapper's `schema` or `schemas` gives the schema. Queries in `.groq` files that call shared custom functions from the mapper's `functions` option are linted with those definitions prepended, instead of reporting a parse error.
