---
'vscode-sanity': minor
---

Go to Definition, and Cmd/Ctrl+click, on a `.groq` import such as `import query from '#queries/slugPage.groq'` now opens the file. Relative paths and the `paths` and `baseUrl` of the nearest `tsconfig.json` are followed, which TypeScript does not do for `.groq` files.
