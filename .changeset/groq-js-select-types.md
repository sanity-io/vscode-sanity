---
'vscode-sanity': patch
---

GROQ hovers use `groq-js` 2.0.3. A `select()` at the root of a query now shows the type of each alternative whose condition can be true, instead of only the fallback. A `select()` with no fallback hovers as nullable, since it is `null` when no alternative matches.
