import {createRequire} from 'node:module'
import {defineConfig} from 'tsdown'
import type {Plugin} from 'tsdown'

const require = createRequire(import.meta.url)

// groq-wasm finds its .wasm next to its package through `import.meta.url`. The language server is
// bundled into dist/, so point that lookup at the copy in dist/ instead.
const groqWasmPath: Plugin = {
  name: 'groq-wasm-path',
  transform(code, id) {
    if (!/groq-wasm[\\/]dist[\\/]index\.js$/.test(id)) {
      return
    }
    const replaced = code.replace('"../wasm/groq_wasm_bg.wasm"', '"./groq_wasm_bg.wasm"')
    // The edit moves one string literal, so the map only needs to be present, not precise.
    return {code: replaced, map: {version: 3, sources: [id], names: [], mappings: ''}}
  },
}

// `entry` is a map on purpose: another entry, such as a language server, is one more key and is
// emitted as dist/<key>.js, which .vscodeignore already ships.
export default defineConfig({
  entry: {
    extension: 'src/extension.ts',
    server: 'src/lsp/server.ts',
  },
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  minify: true,
  // Linked maps stay out of the vsix: .vscodeignore is an allowlist.
  sourcemap: true,
  dts: false,
  // tsdown externalizes package.json dependencies by default. An extension has to ship them, so
  // everything except vscode is bundled. onlyBundle: false turns off the "was this intentional" hint.
  deps: {
    alwaysBundle: [/.*/],
    neverBundle: ['vscode'],
    onlyBundle: false,
  },
  // Lets the bundled server use `import.meta.url` and `require` as the CJS output does not provide them.
  shims: true,
  plugins: [groqWasmPath],
  outputOptions: {
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/[name]-[hash].js',
  },
  // vsce --no-dependencies does not walk node_modules, so the wasm and the grammars package.json
  // points at are copied here. `to` is the destination directory. groq-wasm's /lazy entry reads the
  // wasm bytes from dist/groq_wasm_bg.wasm.
  copy: [
    {from: require.resolve('@sanity-labs/groq-wasm/wasm'), to: 'dist', rename: 'groq_wasm_bg.wasm'},
    {from: require.resolve('@sanity/textmate-groq'), to: 'dist/textmate'},
    {from: require.resolve('@sanity/textmate-groq/injections/javascript'), to: 'dist/textmate'},
    {from: require.resolve('@sanity/textmate-groq/injections/markdown'), to: 'dist/textmate'},
  ],
})
