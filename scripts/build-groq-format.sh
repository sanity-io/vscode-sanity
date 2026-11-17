#!/usr/bin/env bash
# Builds groq-format-wasm/ to groq-format-wasm/pkg/, which is committed so that building the
# extension needs no Rust. Needs rustup, which installs the toolchain rust-toolchain.toml pins,
# and wasm-bindgen-cli at the version Cargo.toml pins:
# `cargo install wasm-bindgen-cli --locked --version 0.2.130`.
set -euo pipefail

crate="$(cd "$(dirname "${BASH_SOURCE[0]}")/../groq-format-wasm" && pwd)"

# Panic messages carry source paths; without this they would name the building machine.
export RUSTFLAGS="--remap-path-prefix=${CARGO_HOME:-$HOME/.cargo}=.cargo --remap-path-prefix=$crate=."

cd "$crate"
cargo build --release --target wasm32-unknown-unknown
wasm-bindgen --target nodejs --remove-name-section --remove-producers-section \
  --out-dir "$crate/pkg" --out-name groq_format \
  "$crate/target/wasm32-unknown-unknown/release/groq_format_wasm.wasm"
