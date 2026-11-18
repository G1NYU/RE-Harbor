import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bell, BookmarkCheck, Check, Clapperboard, Download, Heart, ListPlus, ListVideo, Play, Plus, X } from "lucide-react";
import { ensureNotifyPermission, playTone, removeReminder, setReminder, useReminder, type ReminderTone } from "@/lib/reminders";
import { MAX_LISTS, createListWithItem, setListMembership, useCustomLists, useListsContaining, type ListItemInput } from "@/lib/custom-lists";
import { captureMembershipProfile } from "@/lib/membership-operations";
import "./title-tools.css";

type VoidTitleToolsProps = {
  name: string;
  item: ListItemInput;
  isMovie: boolean;
  isWatched: boolean;
  isFavorite: boolean;
  showWatched: boolean;
  onClose: () => void;
  onChooseSource: () => void;
  hasTrailer: boolean;
  onTrailer: () => void;
  onDownload: () => void;
  onToggleWatched: () => void;
  onToggleFavorite: () => void;
  onAdvanced: () => void;
};

/** VOID's own title actions. Existing Harbor controllers perform the actual mutations. */
export function VoidTitleTools({
  name,
  item,
  isMovie,
  isWatched,
  isFavorite,
  showWatched,
  onClose,
  onChooseSource,
  hasTrailer,
  onTrailer,
  onDownload,
  onToggleWatched,
  onToggleFavorite,
  onAdvanced,
}: VoidTitleToolsProps) {
  const panel = useRef<HTMLElement>(null);
  const dismiss = useRef<HTMLButtonElement>(null);
  const membershipProfile = useRef(captureMembershipProfile());
  const lists = useCustomLists();
  const memberships = useListsContaining(item.id);
  const reminder = useReminder(item.id);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [remindEpisodes, setRemindEpisodes] = useState(reminder?.episodes ?? true);
  const [remindSeasons, setRemindSeasons] = useState(reminder?.seasons ?? true);
  const [reminderTone, setReminderTone] = useState<ReminderTone>(reminder?.tone ?? "chime");
  const [listPanelOpen, setListPanelOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [listError, setListError] = useState("");

  useEffect(() => {
    if (!reminderOpen) return;
    setRemindEpisodes(reminder?.episodes ?? true);
    setRemindSeasons(reminder?.seasons ?? true);
    setReminderTone(reminder?.tone ?? "chime");
  }, [reminderOpen, reminder]);

  const saveReminder = () => {
    const now = Date.now();
    setReminder({
      id: item.id,
      name: item.name || name,
      poster: item.poster,
      type: "series",
      episodes: remindEpisodes,
      seasons: remindSeasons,
      tone: reminderTone,
      lastNotifiedAt: reminder?.lastNotifiedAt ?? now,
      createdAt: reminder?.createdAt ?? now,
      seenKeys: reminder?.seenKeys,
    });
    setReminderOpen(false);
    void ensureNotifyPermission();
  };
  const clearReminder = () => {
    removeReminder(item.id);
    setReminderOpen(false);
  };

  const changeMembership = (listId: string) => {
    const profile = membershipProfile.current;
    if (!profile) {
      setListError("The active profile could not be verified.");
      return;
    }
    const present = !memberships.has(listId);
    const result = setListMembership(listId, item, present, profile);
    setListError(result.status === (present ? "added" : "removed") ? "" :
      "Could not update this list. Check your profile and available storage.");
  };

  const createAndAdd = (event: FormEvent) => {
    event.preventDefault();
    const name = newListName.trim();
    const profile = membershipProfile.current;
    if (!name || !profile || lists.length >= MAX_LISTS) {
      setListError("The list name, active profile, or available list capacity is invalid.");
      return;
    }
    const result = createListWithItem(name, item, profile);
    if (result.result.status === "added") {
      setNewListName("");
      setListError("");
    } else {
      setListError("Could not create the list. Check your profile and available storage.");
    }
  };

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dismiss.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
      if (event.key !== "Tab") return;
      const buttons = panel.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("keydown", handleKey, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [onClose]);

  const run = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <div className="void-title-tools-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside ref={panel} className="void-title-tools-panel" role="dialog" aria-modal="true" aria-label="Title actions">
        <header className="void-title-tools-head">
          <div>
            <span>VOID / TITLE CONTROLS</span>
            <h2>What next?</h2>
            <p>{name}</p>
          </div>
          <button ref={dismiss} type="button" data-tv-modal-close onClick={onClose} aria-label="Close title actions">
            <X size={20} />
          </button>
        </header>
        <div className="void-title-tools-actions">
          <button type="button" className="void-title-tools-highlight" onClick={() => run(onChooseSource)}>
            <Play size={20} />
            <span><strong>Choose a source</strong><small>Browse available playback options</small></span>
          </button>
          {hasTrailer && (
            <button type="button" onClick={() => run(onTrailer)}>
              <Clapperboard size={20} />
              <span><strong>Watch trailer</strong><small>Play the official video preview</small></span>
            </button>
          )}
          <button type="button" aria-pressed={isFavorite} onClick={onToggleFavorite}>
            <Heart size={20} fill={isFavorite ? "currentColor" : "none"} />
            <span><strong>{isFavorite ? "Remove favorite" : "Add to favorites"}</strong><small>Keep this title close</small></span>
            {isFavorite && <Check size={17} />}
          </button>
          {isMovie && showWatched && (
            <button type="button" aria-pressed={isWatched} onClick={onToggleWatched}>
              <BookmarkCheck size={20} />
              <span><strong>{isWatched ? "Mark as unwatched" : "Mark as watched"}</strong><small>Update your existing tracking services</small></span>
              {isWatched && <Check size={17} />}
            </button>
          )}
          {isMovie && (
            <button type="button" onClick={() => run(onDownload)}>
              <Download size={20} />
              <span><strong>Download a copy</strong><small>Use Harbor's existing download engine</small></span>
            </button>
          )}
        </div>
        {!isMovie && (
          <section className="void-title-tools-reminders" aria-label="Episode reminders">
            <button type="button" className="void-title-tools-reminders-trigger" aria-expanded={reminderOpen}
              onClick={() => setReminderOpen((open) => !open)}>
              <Bell size={20} />
              <span><strong>Episode reminders</strong><small>New episodes and season notifications</small></span>
              <span>{reminder ? "On" : "Off"}</span>
            </button>
            {reminderOpen && (
              <div className="void-title-tools-reminders-form">
                <label><input type="checkbox" checked={remindEpisodes}
                  onChange={(event) => setRemindEpisodes(event.target.checked)} /> New episodes</label>
                <label><input type="checkbox" checked={remindSeasons}
                  onChange={(event) => setRemindSeasons(event.target.checked)} /> New seasons</label>
                <label>Notification tone
                  <select value={reminderTone} onChange={(event) => {
                    const next = event.target.value as ReminderTone;
                    setReminderTone(next);
                    playTone(next);
                  }}>
                    <option value="chime">Chime</option>
                    <option value="pulse">Pulse</option>
                    <option value="silent">Silent</option>
                  </select>
                </label>
                <div className="void-title-tools-reminders-buttons">
                  <button type="button" disabled={!remindEpisodes && !remindSeasons} onClick={saveReminder}>Save reminder</button>
                  {reminder && <button type="button" onClick={clearReminder}>Remove reminder</button>}
                </div>
              </div>
            )}
          </section>
        )}
        <section className="void-title-tools-lists" aria-label="Custom lists">
          <button type="button" className="void-title-tools-lists-trigger" aria-expanded={listPanelOpen}
            onClick={() => setListPanelOpen((open) => !open)}>
            <ListPlus size={20} />
            <span><strong>Save to a list</strong><small>Organize this title without leaving VOID</small></span>
            <span>{memberships.size > 0 ? memberships.size : "+"}</span>
          </button>
          {listPanelOpen && (
            <div className="void-title-tools-lists-body">
              {lists.length === 0 && <p>No lists yet. Create your first list below.</p>}
              {lists.map((list) => (
                <button key={list.id} type="button" aria-pressed={memberships.has(list.id)}
                  onClick={() => changeMembership(list.id)}>
                  <span><strong>{list.name}</strong><small>{list.items.length} titles</small></span>
                  {memberships.has(list.id) ? <Check size={18} /> : <Plus size={18} />}
                </button>
              ))}
              <form onSubmit={createAndAdd}>
                <label htmlFor="void-title-new-list">New list</label>
                <div>
                  <input id="void-title-new-list" value={newListName} maxLength={60}
                    onChange={(event) => { setNewListName(event.target.value); setListError(""); }}
                    placeholder="List name" disabled={lists.length >= MAX_LISTS} />
                  <button type="submit" disabled={!newListName.trim() || lists.length >= MAX_LISTS}>Create & add</button>
                </div>
              </form>
              {listError && <p role="alert">{listError}</p>}
            </div>
          )}
        </section>
        <div className="void-title-tools-footer">
          <p>Additional sync and provider tools remain accessible during the redesign.</p>
          <button type="button" onClick={() => run(onAdvanced)}>
            <ListVideo size={17} /> Open remaining tools
          </button>
        </div>
      </aside>
    </div>
  );
}
