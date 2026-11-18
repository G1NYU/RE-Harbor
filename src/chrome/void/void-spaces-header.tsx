import { useEffect, useRef, useState } from "react";
import {
  BookOpenText, Clapperboard, Gamepad2, Headphones, Home,
  LayoutGrid, LockKeyhole, Radio, Search, Settings2, type LucideIcon,
} from "lucide-react";
import { AccountMenu } from "@/chrome/account-menu/account-menu";
import { BackChrome } from "@/chrome/back-chrome";
import { useSidebarNavigation } from "@/chrome/context-page-navigation";
import { DownloadsButton } from "@/components/downloads-popover";
import { ParentalPinModal } from "@/components/parental-pin-modal";
import { useSearchActions } from "@/lib/search-context";
import { useParental } from "@/lib/parental";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { useView, type View } from "@/lib/view";
import { close, minimize, toggleMaximize, useMaximized } from "@/lib/window";
import type { NavItemId } from "@/chrome/nav-items";

type Space = {
  id: string;
  label: string;
  view: View;
  icon: LucideIcon;
  members: readonly NavItemId[];
};

const SPACES: readonly Space[] = [
  { id: "start", label: "Start", view: "home", icon: Home, members: ["home", "discover", "catalogs"] },
  { id: "watch", label: "Watch", view: "movies", icon: Clapperboard, members: ["movies", "shows", "anime", "vod"] },
  { id: "listen", label: "Listen", view: "music", icon: Headphones, members: ["music"] },
  { id: "read", label: "Read", view: "manga", icon: BookOpenText, members: ["manga", "ebook"] },
  { id: "play", label: "Play", view: "games", icon: Gamepad2, members: ["games"] },
  { id: "live", label: "Live", view: "live", icon: Radio, members: ["live", "sports"] },
];

const GROUPS: { title: string; ids: readonly NavItemId[] }[] = [
  { title: "Explore", ids: ["home", "discover", "catalogs", "movies", "shows", "anime", "music", "manga", "ebook", "games", "live", "sports", "vod"] },
  { title: "Your space", ids: ["library", "collections", "downloads", "calendar"] },
  { title: "Tools", ids: ["addons", "plugins", "settings"] },
];

const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function VoidSpacesHeader() {
  const { view, setView, topKind, chromeHidden } = useView();
  const { entries } = useSidebarNavigation();
  const { locked, unlock } = useParental();
  const { settings } = useSettings();
  const { setOpen: openSearch } = useSearchActions();
  const t = useT();
  const maximized = useMaximized();
  const [open, setOpen] = useState(false);
  const [pendingPinView, setPendingPinView] = useState<View | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (chromeHidden) return null;

  const available = (id: NavItemId) => entries.find(({ item }) => item.id === id);
  const navigate = (id: NavItemId) => {
    const entry = available(id);
    if (!entry) return;
    setOpen(false);
    if (entry.gated || (id === "settings" && locked)) {
      setPendingPinView(entry.item.view);
    } else {
      setView(entry.item.view);
    }
  };
  const spaceOf = SPACES.find((space) =>
    space.members.some((id) => available(id)?.item.view === view)
  );
  const activeSpace = spaceOf?.id ?? (
    ["meta", "person", "episode-detail", "player"].includes(topKind) ? "watch" : "start"
  );

  return (
    <>
      <header className="void-spaces-header" data-void-spaces>
        <div className="void-spaces-brand" data-tauri-drag-region>
          <span className="void-spaces-wordmark">VOID<span className="void-spaces-brand-dot">.</span></span>
          <span className="void-spaces-brand-note">YOUR UNIVERSE</span>
        </div>
        <nav className="void-spaces-nav" aria-label="Media spaces">
          {SPACES.filter((space) => space.members.some((id) => available(id))).map((space) => {
            const Icon = space.icon;
            const destination = space.members.find((id) => available(id)) ?? space.members[0];
            return (
              <button
                key={space.id}
                type="button"
                data-active={activeSpace === space.id ? "" : undefined}
                aria-current={activeSpace === space.id ? "page" : undefined}
                className="void-spaces-tab"
                onClick={() => navigate(destination)}
              >
                <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                <span>{space.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="void-spaces-utilities">
          <BackChrome />
          <button
            className="void-spaces-utility"
            type="button"
            title={t("search.placeholder")}
            aria-label={t("search.placeholder")}
            onClick={() => openSearch(true)}
          >
            <Search size={20} strokeWidth={1.7} aria-hidden="true" />
          </button>
          <div ref={menuRef} className="void-spaces-all-wrap">
            <button
              type="button"
              className="void-spaces-utility"
              aria-expanded={open}
              aria-haspopup="menu"
              aria-label="All destinations"
              title="All destinations"
              onClick={() => setOpen((current) => !current)}
            >
              <LayoutGrid size={20} strokeWidth={1.7} aria-hidden="true" />
            </button>
            {open && (
              <div className="void-spaces-destinations" role="menu" aria-label="All destinations">
                {GROUPS.map((group) => {
                  const destinations = group.ids.map((id) => available(id)).filter((entry) => !!entry);
                  if (!destinations.length) return null;
                  return (
                    <section key={group.title} className="void-spaces-destinations-group">
                      <h3>{group.title}</h3>
                      {destinations.map((entry) => (
                        <button
                          type="button"
                          role="menuitem"
                          key={entry.item.id}
                          data-selected={view === entry.item.view ? "" : undefined}
                          onClick={() => navigate(entry.item.id)}
                        >
                          <span>{t(entry.item.label)}</span>
                          {entry.gated && <LockKeyhole size={14} aria-label="Locked" />}
                        </button>
                      ))}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
          <DownloadsButton />
          <button
            className="void-spaces-utility"
            type="button"
            title={t("nav.settings")}
            aria-label={t("nav.settings")}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={20} strokeWidth={1.7} aria-hidden="true" />
          </button>
          <AccountMenu
            trigger="avatar"
            placement="down"
            align="end"
            showSettings
            onOpenSettings={() => navigate("settings")}
            triggerClassName="void-spaces-avatar"
          />
          {IS_TAURI && !settings.useNativeTitleBar && !settings.hybridTitleBar && (
            <div className="void-spaces-window-controls" data-tauri-drag-region="false">
              <button type="button" aria-label={t("chrome.minimize")} onClick={minimize}>—</button>
              <button type="button" aria-label={maximized ? t("chrome.restore") : t("chrome.maximize")} onClick={() => void toggleMaximize()}>□</button>
              <button type="button" aria-label={t("common.close")} onClick={close}>×</button>
            </div>
          )}
        </div>
      </header>
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
