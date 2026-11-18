---
'vscode-sanity': minor
---

author: @runeb

Add a **Format Query** code lens next to **Execute Query**. It formats that one GROQ query in place: a `groq` template literal, a `defineQuery` template literal, or a whole `.groq` file. Unlike **GROQ: Format GROQ Queries**, it also formats `defineQuery` queries, and it works when the GROQ language server is off. It is hidden when `groq.enableFormatting` or `sanity.useCodelens` is off, and for queries with `${}` interpolations or backslash escapes, which cannot be rewritten safely.
