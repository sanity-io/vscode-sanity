---
'vscode-sanity': minor
---

Add GROQ linting, completion and formatting. The extension now runs the GROQ language server on `.groq` files and `groq` template literals in JavaScript and TypeScript: syntax errors and lint warnings show up as you type, completion suggests fields and functions (and your schema's types and fields when a `schema.json` is found or set with `groq.schemaPath`), and `Format Document` formats `.groq` files. In JavaScript and TypeScript files, run **GROQ: Format GROQ Queries** to format the queries without touching the rest of the file. It also adds GROQ snippets, the `groq.enable`, `groq.schemaPath`, `groq.maxDiagnostics`, `groq.enableFormatting` and `groq.trace.server` settings, and fixes "Execute GROQ query" failing on queries that contain `null`.
