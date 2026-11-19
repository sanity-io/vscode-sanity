---
'vscode-sanity': minor
---

A `.groq` file of only custom function definitions, such as a shared `image.groq`, can be formatted with Format Query, and shows no Execute Query or Copy Query lens since it has no query to run. Each definition gets a Find References lens. Execute Query and Copy Query prepend the custom functions a query calls, and those they call in turn, from groq-content-mapper's `functions` setting, so a query that calls `image::richText(body)` runs instead of failing with "Undefined namespace: image", and the copied text runs on its own. Go to definition on a custom function call opens its definition, and Find All References lists its calls in the other `.groq` files. These come from `@sanity-labs/groq-lsp` 1.3 and `@sanity-labs/groq-wasm` 1.2.4.
