import type { MetadataSourceChain } from "./metadata-sources";

type MetadataSettings = {
  addonOnlyMetadata?: boolean;
  searchTmdbTopMatch?: boolean;
  cinemetaEnabled?: boolean;
  metadataSources?: MetadataSourceChain;
};

const defaults: Readonly<MetadataSettings> = {};
let previousRaw: string | null = null;
let previousSettings = defaults;

/** Read the profile mirror without running settings migrations on the artwork path. */
export function readMetadataSettings(): Readonly<MetadataSettings> {
  try {
    const raw = localStorage.getItem("harbor.settings");
    if (raw !== previousRaw) {
      previousRaw = raw;
      previousSettings = defaults;
      if (raw) previousSettings = (JSON.parse(raw) as MetadataSettings | null) ?? defaults;
    }
    return previousSettings;
  } catch {
    return defaults;
  }
}

export function addonOnlyMetadata(): boolean {
  return readMetadataSettings().addonOnlyMetadata === true;
}

export function useTmdbTopMatch(): boolean {
  return readMetadataSettings().searchTmdbTopMatch !== false;
}
