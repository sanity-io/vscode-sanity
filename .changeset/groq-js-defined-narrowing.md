---
'vscode-sanity': patch
---

GROQ hovers use `groq-js` 2.0.2 and `@sanity/codegen` 8.3.2. A field the schema makes nullable now hovers as non-null under a `defined(field)` or `field != null` filter even when the filter has terms that cannot be decided, such as `_type == $type`, and `defined(path.to.field)` narrows a path through a named type.
