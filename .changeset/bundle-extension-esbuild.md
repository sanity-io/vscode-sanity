---
'vscode-sanity': patch
---

Smaller, faster-loading extension. It is now bundled into minified JavaScript, so the package is about 0.6 MB with 21 files instead of 10.7 MB with over 3,500. It no longer starts with every VS Code window, only when a GROQ, JavaScript or TypeScript file is opened, and activating it is much quicker: the TypeScript compiler is no longer loaded at startup, and the Sanity client and result view load the first time a query is executed. `sanity.cli.ts` is now compiled with Sucrase, which also handles configs that import other local `.ts` files.
