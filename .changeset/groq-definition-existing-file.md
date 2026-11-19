---
'vscode-sanity': patch
---

Go to Definition on a `.groq` import only opens the file when it exists. With `baseUrl` set, a missing package import or unmapped alias is no longer a jump target.
