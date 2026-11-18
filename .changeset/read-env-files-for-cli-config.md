---
'vscode-sanity': patch
---

Execute GROQ query now loads the `.env` files next to `sanity.cli.ts` the way the Sanity CLI does, so a `projectId` or `dataset` that comes from an environment variable such as `SANITY_STUDIO_PROJECT_ID` is found. `.env`, `.env.local`, `.env.<mode>` and `.env.<mode>.local` are read, where the mode is `SANITY_ACTIVE_ENV` or `development`, and variables that are already set take priority.
