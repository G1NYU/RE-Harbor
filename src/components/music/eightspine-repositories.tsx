import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { readMusicPreference, writeMusicPreference } from "@/lib/music/preferences";
import { SECONDARY_BUTTON, errorText } from "./music-connections/connection-row";

type Entry = {
  key: { repository: string; id: string };
  name: string;
  version: string;
  download: string;
  author: string | null;
};

type Preview = {
  repository: string;
  entries: Entry[];
  executionAvailable: boolean;
};

const KEY = "harbor.music.8spine-repositories.preview.v1";
const MAX_REPOSITORIES = 32;

function savedRepositories(): Preview[] {
  try {
    const urls: unknown = JSON.parse(readMusicPreference(KEY) ?? "[]");
    if (!Array.isArray(urls)) return [];
    return [...new Set(urls.filter((url): url is string => typeof url === "string" && url.length <= 4096))]
      .slice(0, MAX_REPOSITORIES)
      .map((repository) => ({ repository, entries: [], executionAvailable: false }));
  } catch {
    return [];
  }
}

export function EightSpineRepositories() {
  const [repositories, setRepositories] = useState<Preview[]>(savedRepositories);
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState<string[]>([]);

  function save(next: Preview[]) {
    setRepositories(next);
    writeMusicPreference(KEY, JSON.stringify(next.map((repository) => repository.repository)));
  }

  async function load(input: string) {
    if (busy.current || !input.trim()) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const result = await invoke<Preview>("music_8spine_preview_repository", { url: input.trim() });
      const existing = repositories.findIndex((row) => row.repository === result.repository);
      if (existing < 0 && repositories.length >= MAX_REPOSITORIES) {
        setError("Repository limit reached.");
        return;
      }
      const next =
        existing < 0
          ? [...repositories, result]
          : repositories.map((row) => (row.repository === result.repository ? result : row));
      save(next);
      setLoaded((current) => [...new Set([...current, result.repository])]);
      setUrl("");
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  function remove(repository: string) {
    if (busy.current) return;
    save(repositories.filter((item) => item.repository !== repository));
    setLoaded((current) => current.filter((item) => item !== repository));
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="eightspine-heading">
      <h3 id="eightspine-heading" className="text-lg font-semibold text-ink">
        8SPINE repositories
      </h3>
      <p className="text-[13px] text-ink-muted">
        Add an HTTPS JSON repository to discover music sources. Preview only: playback and source
        activation are not available yet.
      </p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void load(url);
        }}
      >
        <input
          aria-label="8SPINE repository URL"
          type="text"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={pending}
          maxLength={4096}
          placeholder="https://example.com/index.json"
          className="min-w-0 flex-1 rounded-md border border-edge-soft bg-surface px-3 py-2 text-sm text-ink"
        />
        <button type="submit" disabled={pending || !url.trim()} className={SECONDARY_BUTTON}>
          {pending ? "Loading…" : "Add repository"}
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {repositories.map((repository) => (
        <div key={repository.repository} className="overflow-hidden rounded-lg bg-surface">
          <div className="flex flex-wrap items-center gap-2 p-3">
            <p className="min-w-0 flex-1 break-all text-xs text-ink-muted">{repository.repository}</p>
            <button type="button" disabled={pending} className={SECONDARY_BUTTON} onClick={() => void load(repository.repository)}>
              {loaded.includes(repository.repository) ? "Refresh" : "Load sources"}
            </button>
            <button type="button" disabled={pending} className={SECONDARY_BUTTON} onClick={() => remove(repository.repository)}>
              Remove
            </button>
          </div>
          {loaded.includes(repository.repository) && repository.entries.length === 0 && (
            <p className="p-3 text-sm text-ink-muted">No music sources found.</p>
          )}
          {repository.entries.map((entry) => (
            <div key={entry.key.id} className="flex items-center gap-3 border-t border-edge-soft p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{entry.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  {entry.version}{entry.author ? ` · ${entry.author}` : ""}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-ink-muted">
                Not available yet
                <input type="checkbox" role="switch" checked={false} disabled aria-label={`Enable ${entry.name}`} />
              </label>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
