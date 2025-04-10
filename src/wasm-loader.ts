import * as path from 'path';
import * as fs from 'fs';
import * as util from 'util';

import '@groqfmt/wasm/dist/wasm-exec';

const go = new (global as any).Go();

async function loadWasm() {
  const wasmPath = path.resolve(__dirname, '../vendor/groqfmt.wasm');

  const wasmData = await util.promisify(fs.readFile)(wasmPath);
  const { instance } = await WebAssembly.instantiate(wasmData, go.importObject);
  go.run(instance);
}

export { loadWasm };
