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

type Inspection = {
  entry: Entry;
  fingerprint: string;
  format: "javascript-candidate" | "packed8sm1" | "unknown";
  executionAvailable: boolean;
};

const sourceKey = (entry: Entry) => JSON.stringify([entry.key.repository, entry.key.id, entry.version, entry.download]);
const formatLabel = (format: Inspection["format"]) =>
  format === "javascript-candidate"
    ? "JavaScript detected — runtime pending"
    : format === "packed8sm1"
      ? "Packed module — unsupported"
      : "Unrecognized package format";

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
  const [inspections, setInspections] = useState<Record<string, Inspection>>({});
  const [selected, setSelected] = useState<Entry | null>(null);

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
      setInspections((current) =>
        Object.fromEntries(Object.entries(current).filter(([, item]) => item.entry.key.repository !== result.repository)),
      );
      setSelected(null);
      setLoaded((current) => [...new Set([...current, result.repository])]);
      setUrl("");
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function inspect(entry: Entry) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    const key = sourceKey(entry);
    setInspections((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== key)));
    try {
      const result = await invoke<Inspection>("music_8spine_inspect_source", { entry });
      if (sourceKey(result.entry) !== key || result.executionAvailable) {
        throw new Error("Unexpected source inspection response.");
      }
      setInspections((current) => ({ ...current, [key]: result }));
      setSelected(null);
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
    setInspections((current) => Object.fromEntries(Object.entries(current).filter(([, item]) => item.entry.key.repository !== repository)));
    setSelected(null);
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
      {selected && (
        <div className="flex flex-col gap-2 rounded-md border border-edge-soft bg-surface p-3">
          <strong className="text-sm text-ink">Inspect {selected.name}?</strong>
          <p className="break-all text-xs text-ink-muted">{selected.download}</p>
          <p className="text-xs text-ink-muted">
            Download this exact package to identify its format. It will not be executed.
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={pending} className={SECONDARY_BUTTON} onClick={() => void inspect(selected)}>
              {pending ? "Inspecting…" : "Inspect package"}
            </button>
            <button type="button" disabled={pending} className={SECONDARY_BUTTON} onClick={() => setSelected(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
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
              <div className="flex flex-wrap items-center justify-end gap-2">
                {inspections[sourceKey(entry)] && (
                  <span className="text-xs text-ink-muted" title={inspections[sourceKey(entry)].fingerprint}>
                    {formatLabel(inspections[sourceKey(entry)].format)}
                  </span>
                )}
                <button type="button" disabled={pending} className={SECONDARY_BUTTON} onClick={() => setSelected(entry)}>
                  {inspections[sourceKey(entry)] ? "Reinspect" : "Inspect"}
                </button>
              <label className="flex items-center gap-2 text-xs text-ink-muted">
                Not available yet
                <input type="checkbox" role="switch" checked={false} disabled aria-label={`Enable ${entry.name}`} />
              </label>
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
