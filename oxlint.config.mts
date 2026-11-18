import nkzw from '@nkzw/oxlint-config'
import {defineConfig} from 'oxlint'

export default defineConfig({
  extends: [nkzw],
  ignorePatterns: ['dist', 'out', 'node_modules', '.vscode-test', 'fixtures'],
  overrides: [
    {
      files: [
        'src/apiVersion.test.ts',
        'src/clearRequireCache.test.ts',
        'src/client.test.ts',
        'src/format.test.ts',
        'src/hover/groq-in-hover.test.ts',
      ],
      rules: {
        // node:test's it() and describe() return promises the runner already tracks.
        '@typescript-eslint/no-floating-promises': 'off',
      },
    },
  ],
})
