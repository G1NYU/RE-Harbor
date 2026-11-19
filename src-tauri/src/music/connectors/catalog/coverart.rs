pub fn safe_mbid(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.len() != 36
        || !trimmed
            .chars()
            .all(|character| character.is_ascii_hexdigit() || character == '-')
    {
        return None;
    }
    Some(trimmed.to_ascii_lowercase())
}

pub fn release_artwork(release_mbid: &str, caa_id: u64) -> String {
    // Use the CAA-supported thumbnail endpoint instead of guessing archive.org filenames.
    // Its resolver handles the current thumbnail naming and redirects to the real asset.
    format!("https://coverartarchive.org/release/{release_mbid}/{caa_id}-500")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mbids_reject_paths_and_normalize_case() {
        assert_eq!(
            safe_mbid("A74B1B7F-71A5-4011-9441-D0B5E4122711").expect("valid mbid"),
            "a74b1b7f-71a5-4011-9441-d0b5e4122711"
        );
        assert!(safe_mbid("../../etc/passwd").is_none());
        assert!(safe_mbid("a74b1b7f-71a5-4011-9441-d0b5e412271").is_none());
        assert!(safe_mbid("a74b1b7f-71a5-4011-9441-d0b5e4122711/x").is_none());
    }

    #[test]
    fn artwork_points_straight_at_the_archive_item() {
        assert_eq!(
            release_artwork("cd21d4e9-af51-4e7c-bd9f-a5f31d5cfe1a", 34059386237),
            "https://coverartarchive.org/release/cd21d4e9-af51-4e7c-bd9f-a5f31d5cfe1a/34059386237-500"
        );
    }
}
