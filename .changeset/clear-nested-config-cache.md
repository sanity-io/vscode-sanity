---
'vscode-sanity': patch
---

Running a query again picks up edits in local files that `sanity.cli.ts` imports. Previously only the config file itself was reloaded.
