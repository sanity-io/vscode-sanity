---
'vscode-sanity': patch
---

GROQ queries in TypeScript hovers are formatted to 40 columns by default instead of 80, so a long line no longer gets cut mid-expression by the narrow tooltip and the query breaks at `&&`, `{` and other GROQ boundaries instead. Set `sanity.formatGroqInHoverWidth` to `80` to get the previous width back. Format Query and the file formatter still use 80 columns. Thanks to Cody Olsen for reporting this.
