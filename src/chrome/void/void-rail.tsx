import { useState } from "react";
import {
  BookOpen,
  CalendarDays,
  Clapperboard,
  Compass,
  Download,
  Film,
  FolderOpen,
  Gamepad2,
  House,
  LibraryBig,
  LockKeyhole,
  MonitorPlay,
  Music2,
  Puzzle,
  Radio,
  Settings2,
  Shapes,
  Sparkles,
  Tv,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { useView, type View } from "@/lib/view";
import { useParental } from "@/lib/parental";
import { ParentalPinModal } from "@/components/parental-pin-modal";
import { useContextMenu } from "@/lib/context-menu";
import { useSidebarNavigation } from "@/chrome/context-page-navigation";
import { NavEditableItem, useNavDrag } from "@/chrome/nav-edit";
import { useNavEditMode } from "@/chrome/nav-edit-mode";
import type { NavItem, NavItemId } from "@/chrome/nav-items";

// Deliberately static. Animated navigation icons made the previous theme pay
// for animation work in every category, even when only one section was active.
const GLYPH: Record<NavItemId, LucideIcon> = {
  home: House,
  discover: Compass,
  catalogs: Shapes,
  plugins: Puzzle,
  movies: Film,
  shows: Tv,
  music: Music2,
  games: Gamepad2,
  kids: Sparkles,
  anime: Clapperboard,
  manga: BookOpen,
  ebook: BookOpen,
  live: Radio,
  sports: MonitorPlay,
  vod: MonitorPlay,
  calendar: CalendarDays,
  library: LibraryBig,
  collections: FolderOpen,
  downloads: Download,
  addons: Puzzle,
  settings: Settings2,
};

type Entry = { item: NavItem; primary: boolean; gated?: boolean };

function VoidRailLink({
  item,
  active,
  gated,
  navigate,
}: {
  item: NavItem;
  active: boolean;
  gated: boolean;
  navigate: () => void;
}) {
  const t = useT();
  const { open: openContextMenu } = useContextMenu();
  const editing = useNavEditMode();
  const drag = useNavDrag(item.id, "vertical");
  const Icon = GLYPH[item.id];
  const label = t(item.label);
  return (
    <NavEditableItem itemId={item.id}>
      <button
        type="button"
        data-harbor-nav={item.view}
        data-void-nav-item={item.id}
        data-active={active ? "" : undefined}
        aria-current={active ? "page" : undefined}
        aria-label={gated ? t("chrome.lockedRequiresPin", { label }) : label}
        title={label}
        onClick={navigate}
        onPointerDown={drag.onPointerDown}
        onKeyDown={drag.onKeyDown}
        data-nav-drop-id={item.id}
        data-tauri-drag-region={editing ? "false" : undefined}
        onContextMenu={(event) =>
          openContextMenu(event, {
            kind: "nav",
            itemId: item.id,
            view: item.view,
            label,
            onOpen: navigate,
          })
        }
        className="void-rail-link"
      >
        <span className="void-rail-icon">
          <Icon size={24} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
          {gated && <LockKeyhole size={10} className="void-rail-lock" aria-hidden="true" />}
        </span>
        <span className="void-rail-label">{label}</span>
      </button>
    </NavEditableItem>
  );
}

/**
 * VOID has its own first-class navigation layout, but uses Harbor's existing
 * route visibility, customization, context menus and parental PIN policy.
 */
export function VoidRail() {
  const { view, setView, chromeHidden } = useView();
  const { entries } = useSidebarNavigation();
  const { unlock } = useParental();
  const [pendingPinView, setPendingPinView] = useState<View | null>(null);

  const navigate = (entry: Entry) => {
    if (entry.gated) setPendingPinView(entry.item.view);
    else setView(entry.item.view);
  };
  // Primary and collection groups have space between them, not divider lines.
  const primary = entries.filter((entry) => entry.primary && entry.item.id !== "settings");
  const collection = entries.filter((entry) => !entry.primary && entry.item.id !== "settings");

  const render = (entry: Entry) => (
    <VoidRailLink
      key={entry.item.id}
      item={entry.item}
      active={view === entry.item.view}
      gated={!!entry.gated}
      navigate={() => navigate(entry)}
    />
  );

  return (
    <>
      <aside data-void-rail aria-hidden={chromeHidden} className="void-rail">
        <div className="void-rail-brand" data-tauri-drag-region>
          <span aria-hidden="true" className="void-rail-v">V</span>
          <span className="sr-only">VOID</span>
        </div>
        <nav aria-label="VOID navigation" className="void-rail-scroll">
          <div className="void-rail-group">{primary.map(render)}</div>
          <div className="void-rail-group void-rail-group-secondary">{collection.map(render)}</div>
        </nav>
      </aside>
      {pendingPinView && (
        <ParentalPinModal
          verify={unlock}
          mode={{
            kind: "unlock",
            onUnlock: () => {
              const target = pendingPinView;
              setPendingPinView(null);
              if (target) setView(target);
            },
            onCancel: () => setPendingPinView(null),
          }}
        />
      )}
    </>
  );
}
