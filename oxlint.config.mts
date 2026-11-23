import cloudflare from '@cloudflare/oxlint-config'
import {defineConfig} from 'oxlint'

export default defineConfig({
  extends: [cloudflare],
  env: cloudflare.env,
  ignorePatterns: [...cloudflare.ignorePatterns, 'dist', 'out', '.vscode-test', 'fixtures'],
  overrides: [
    {
      files: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      rules: {
        // node:test's it() and describe() return promises the runner already tracks.
        '@typescript-eslint/no-floating-promises': 'off',
      },
    },
    {
      // Outside tsconfig.json, so the type-aware rules see no types for it.
      files: ['tsdown.config.mts'],
      rules: {
        'typescript/no-unsafe-argument': 'off',
        'typescript/no-unsafe-assignment': 'off',
        'typescript/no-unsafe-call': 'off',
        'typescript/no-unsafe-member-access': 'off',
      },
    },
  ],
})
