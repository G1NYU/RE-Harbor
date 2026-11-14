use harbor_8spine_native_poc::{envelope, MAX_INPUT};
use serde_json::json;
use std::io::{self, Read, Write};

fn main() {
    // Read at most the input limit plus one byte, then emit a single JSON message.
    let mut input = Vec::new();
    let reply = if io::stdin()
        .lock()
        .take((MAX_INPUT + 1) as u64)
        .read_to_end(&mut input)
        .is_ok()
    {
        envelope(&input)
    } else {
        json!({ "ok": false, "error": "input-error" })
    };
    let _ = writeln!(io::stdout().lock(), "{reply}");
}
