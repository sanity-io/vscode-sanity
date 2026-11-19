---
'vscode-sanity': patch
---

Completion lists each field once. Schemas from `sanity schema extract` declare system fields such as `_id`, `_rev` and `_createdAt`, which used to appear twice next to the built-in system field items.
