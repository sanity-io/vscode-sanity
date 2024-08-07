import { loadWasm } from "./wasm-loader"

let isWasmLoaded = false;

async function formatGroq(groq: string): Promise<string> {
  if (!isWasmLoaded) {
    await loadWasm();
    isWasmLoaded = true;
  }

  const formattedGroq = (global as any).groqfmt(groq); // Assuming groqfmt is exposed globally by the WASM module
  return formattedGroq.result;
}

export { formatGroq };
