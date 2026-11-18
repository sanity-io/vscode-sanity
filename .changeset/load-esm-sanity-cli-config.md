---
'vscode-sanity': patch
---

Execute GROQ query works with `sanity.cli.ts` files that import `defineCliConfig` from `sanity/cli` in Sanity v3. It used to fail with "does not provide an export named 'defineCliConfig'", and every later attempt failed with "Unexpected module status 0. Cannot require() ES Module".
