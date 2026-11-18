---
'vscode-sanity': minor
---

Add the `sanity.apiVersion` setting for the API version used by Execute GROQ query. It takes a date such as `v2025-02-19`, `v1` or `vX`, and is checked when you edit it in settings. It defaults to `v2025-02-19`, so newer GROQ functions like `pt::text()` work without configuration. Executing a query no longer fails with "Invalid API version" because no version was set.
