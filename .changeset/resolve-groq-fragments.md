---
'vscode-sanity': minor
---

Execute Query now works on queries that interpolate fragments, such as ``groq`*[_type == "post"]{${fragment}}` `` and `defineQuery()` calls with a template literal. The fragment is inlined before the query runs, whether it is declared in the same file or imported from another one, through relative paths or tsconfig `paths`. Fragments can be `groq` templates, `defineQuery()` calls, plain strings, concatenations of those, or `.groq` files. Anything that cannot be resolved is left as written.

author: @torjusb
