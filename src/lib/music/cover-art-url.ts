/**
 * The Open Catalog returns a few legacy archive.org thumbnail paths from cached
 * ListenBrainz rows. Never guess archive.org filenames: Cover Art Archive owns
 * the redirects and the supported 250/500/1200 variants.
 */
const MBID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const RELEASE = new RegExp(`^musicbrainz:release:(${MBID})$`, "i");
const GROUP = new RegExp(`^musicbrainz:release-group:(${MBID})$`, "i");
const ARCHIVE_THUMB = new RegExp(
  `^https://archive\\.org/download/mbid-(${MBID})/mbid-(${MBID})-(\\d+)_thumb500\\.jpg$`,
  "i",
);

export function catalogCoverArt(id: string, artwork: string | null | undefined): {
  src: string | undefined;
  fallbacks: string[];
  stableMissing: boolean;
} {
  const release = id.match(RELEASE)?.[1]?.toLowerCase();
  const group = id.match(GROUP)?.[1]?.toLowerCase();
  const raw = artwork?.trim() || undefined;
  if (!release && !group) return { src: raw, fallbacks: [], stableMissing: false };

  // Old successful rows remain in the local 6h cache, so upgrade on display.
  const legacy = raw?.match(ARCHIVE_THUMB);
  const corrected = legacy && legacy[1].toLowerCase() === legacy[2].toLowerCase()
    ? `https://coverartarchive.org/release/${legacy[1].toLowerCase()}/${legacy[3]}-500`
    : raw;
  const front = release
    ? `https://coverartarchive.org/release/${release}/front-500`
    : `https://coverartarchive.org/release-group/${group}/front-500`;
  return {
    src: corrected || front,
    fallbacks: corrected && corrected !== front ? [front] : [],
    stableMissing: true,
  };
}
