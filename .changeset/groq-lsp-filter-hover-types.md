---
'vscode-sanity': patch
---

GROQ hovers are more accurate, via `@sanity-labs/groq-lsp` 1.4.0 (`@sanity-labs/groq-lint` 1.3.0). A field inside a filter `[]` hovers as the type it has before the filter is applied, so `_type` in `*[_type == "post"]` shows every document type while `_type` in the projection is still narrowed to `"post"`. Fields inside `...@-> { … }` spreads and other `->` projections resolve against the dereferenced document type, query parameters such as `$slug` hover as the type the query uses them as, and string literals and quoted projection keys no longer hover as the type of the whole query. `invalid-type-filter` now also checks the names in `_type in [...]`.
