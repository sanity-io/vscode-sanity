use wasm_bindgen::prelude::*;

/// The query as groq-format prints it, wrapped to `width` columns, comments kept. A query that
/// does not parse gives `undefined`.
#[wasm_bindgen]
pub fn format(query: &str, width: usize) -> Option<String> {
    groq_format::format_query(query, width).ok()
}
