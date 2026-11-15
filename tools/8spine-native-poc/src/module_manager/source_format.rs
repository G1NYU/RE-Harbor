//! Inert source preparation for the documented plain 8SPINE formats.
//! This is intentionally a subset parser, not a JavaScript syntax checker.
use super::MAX_PACKAGE;

fn trivia(mut s: &str) -> Result<&str, &'static str> {
    loop {
        s = s.trim_start();
        if let Some(comment) = s.strip_prefix("//") {
            s = comment.find(['\n', '\r']).map_or("", |i| &comment[i..]);
        } else if let Some(comment) = s.strip_prefix("/*") {
            s = comment.find("*/").map(|i| &comment[i + 2..]).ok_or("unsupported-source")?;
        } else { return Ok(s); }
    }
}

fn ident_char(c: char) -> bool { c.is_ascii_alphanumeric() || c == '_' || c == '$' }

fn keyword<'a>(s: &'a str, word: &str) -> Option<&'a str> {
    let rest = s.strip_prefix(word)?;
    if rest.chars().next().is_some_and(ident_char) { None } else { Some(rest) }
}

fn candidate(s: &str) -> Result<(), &'static str> {
    let head = trivia(s)?;
    // Declaration-first bodies are common in the documented module contract.
    // Recognizing a prefix does not prove the source returns a music module.
    if ["return", "const", "let", "var", "function", "async", "class"].iter()
        .any(|word| keyword(head, word).is_some()) { Ok(()) }
    else if head.starts_with("\"use strict\";") || head.starts_with("'use strict';") { Ok(()) }
    else { Err("unsupported-source") }
}

fn unwrap_export(head: &str) -> Result<String, &'static str> {
    let tail = trivia(keyword(head, "export").ok_or("unsupported-source")?)?;
    let tail = trivia(keyword(tail, "const").ok_or("unsupported-source")?)?;
    let first = tail.chars().next().ok_or("unsupported-source")?;
    if !first.is_ascii_alphabetic() && first != '_' && first != '$' { return Err("unsupported-source"); }
    let end = tail.find(|c: char| !ident_char(c)).unwrap_or(tail.len());
    let tail = trivia(&tail[end..])?;
    let tail = trivia(tail.strip_prefix('=').ok_or("unsupported-source")?)?;
    let literal = tail.strip_prefix('`').ok_or("unsupported-source")?;
    let mut body = String::new();
    let mut chars = literal.char_indices().peekable();
    while let Some((index, ch)) = chars.next() {
        match ch {
            '`' => {
                let tail = trivia(&literal[index + 1..])?;
                let tail = trivia(tail.strip_prefix(';').unwrap_or(tail))?;
                if !tail.is_empty() { return Err("unsupported-source"); }
                candidate(&body)?;
                return Ok(body);
            }
            '$' if chars.peek().is_some_and(|(_, next)| *next == '{') => return Err("unsupported-source"),
            '\\' => match chars.next().map(|(_, next)| next) {
                Some(next @ ('`' | '\\' | '$')) => body.push(next),
                _ => return Err("unsupported-source"),
            },
            '\r' => {
                if chars.peek().is_some_and(|(_, next)| *next == '\n') { chars.next(); }
                body.push('\n');
            }
            _ => body.push(ch),
        }
    }
    Err("unsupported-source")
}

pub(super) fn module_body(bytes: &[u8]) -> Result<String, &'static str> {
    if bytes.is_empty() || bytes.len() > MAX_PACKAGE { return Err("package-limit"); }
    if bytes.starts_with(b"8SM1.") { return Err("unsupported-package"); }
    let text = std::str::from_utf8(bytes).map_err(|_| "unsupported-source")?;
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    if text.chars().any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t')) {
        return Err("unsupported-source");
    }
    let head = trivia(text)?;
    if keyword(head, "export").is_some() { return unwrap_export(head); }
    candidate(text)?;
    Ok(text.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_documented_direct_and_constant_wrapped_bodies() {
        let raw = b"// Music module\nconst MODULE = {id: 'fixture'};\nreturn MODULE;";
        assert_eq!(module_body(raw).unwrap().as_bytes(), raw);
        assert_eq!(module_body(b"/* comment */ export const MODULE = `return {};`; // end").unwrap(), "return {};");
        assert_eq!(module_body(b"export const M = `return { title: \\`hello \\${name}\\` };`;").unwrap(),
            "return { title: `hello ${name}` };");
        assert_eq!(module_body(b"export const M = `return {};\r\n`;").unwrap(), "return {};\n");
    }

    #[test]
    fn rejects_opaque_and_ambiguous_sources_without_evaluation() {
        for input in [
            b"8SM1.opaque".as_slice(), b"\xff\x00", b"<html>error</html>",
            b"/* unclosed", b"export default {};", b"export const M = `return ${x};`;",
            b"export const M = `return {};`; invoke();", b"export const M = `return \\n;`;",
            b"export const M = `return {};", b"export const 9 = `return {};`;",
            b"returning something", b"return \x00;",
        ] { assert!(module_body(input).is_err()); }
        assert_eq!(module_body(&vec![b'x'; MAX_PACKAGE + 1]), Err("package-limit"));
    }
}
