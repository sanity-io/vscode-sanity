import nkzw from '@nkzw/oxlint-config'
import {defineConfig} from 'oxlint'

export default defineConfig({
  extends: [nkzw],
  ignorePatterns: ['dist', 'out', 'node_modules', '.vscode-test', 'fixtures'],
  overrides: [
    {
      files: ['src/format.test.ts', 'src/hover/groq-in-hover.test.ts'],
      rules: {
        // node:test's it() and describe() return promises the runner already tracks.
        '@typescript-eslint/no-floating-promises': 'off',
      },
    },
  ],
})
