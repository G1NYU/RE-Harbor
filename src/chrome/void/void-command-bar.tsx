import { useState } from "react";
import { Ellipsis, Maximize2, Minus, Search, Settings2, Square, X } from "lucide-react";
import { AccountMenu } from "@/chrome/account-menu/account-menu";
import { BackChrome } from "@/chrome/back-chrome";
import { DownloadsButton } from "@/components/downloads-popover";
import { BookmarksButton } from "@/components/bookmarks-popover";
import { NotificationCenter } from "@/components/notification-center/notification-center";
import { RecordingPill } from "@/chrome/recording-pill";
import { SleepTimerButton } from "@/chrome/sleep-timer-button";
import { TogetherButton } from "@/chrome/topbar";
import { useSidebarNavigation } from "@/chrome/context-page-navigation";
import { ParentalPinModal } from "@/components/parental-pin-modal";
import { useParental } from "@/lib/parental";
import { useSearchActions } from "@/lib/search-context";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";
import { close, minimize, toggleMaximize, useMaximized } from "@/lib/window";

const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** The command bar belongs to the workspace, not to Harbor's original topbar. */
export function VoidCommandBar() {
  const { view, topKind, setView, chromeHidden } = useView();
  const { settings } = useSettings();
  const { entries } = useSidebarNavigation();
  const { locked, unlock } = useParental();
  const { setOpen: openSearch } = useSearchActions();
  const t = useT();
  const maximized = useMaximized();
  const [settingsPin, setSettingsPin] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  if (chromeHidden) return null;
  const section = entries.find(({ item }) => item.view === view)?.item;
  // A hidden Settings nav item must not become a parental-control bypass.
  const isSettingsGated = locked || !!entries.find(({ item }) => item.id === "settings")?.gated;
  const openSettings = () => {
    if (isSettingsGated) setSettingsPin(true);
    else setView("settings");
  };

  return (
    <>
      <header data-void-command-bar className="void-command-bar">
        <div className="void-command-start">
          <BackChrome />
          <span className="void-command-context" aria-hidden="true">
            <span className="void-command-context-parent">VOID</span>
            <span className="void-command-context-separator">/</span>
            {section ? t(section.label) : topKind === "settings" ? t("nav.settings") : t("nav.home")}
          </span>
        </div>
        <div className="void-command-actions" data-tauri-drag-region="false">
          <button
            type="button"
            className="void-command-search"
            onClick={() => openSearch(true)}
            aria-label={t("search.placeholder")}
          >
            <Search size={17} strokeWidth={1.8} aria-hidden="true" />
            <span>{t("search.placeholder")}</span>
          </button>
          <div className="void-command-extra">
            <DownloadsButton />
            <NotificationCenter />
          </div>
          <div className="void-command-overflow-wrap">
            <button
              className="void-command-icon"
              type="button"
              aria-label={t("More")}
              aria-expanded={toolsOpen}
              onClick={() => setToolsOpen((current) => !current)}
            >
              <Ellipsis size={19} aria-hidden="true" />
            </button>
            {toolsOpen && (
              <div className="void-command-overflow">
                <BookmarksButton />
                <RecordingPill />
                {settings.navbarSleepTimer && <SleepTimerButton />}
                <TogetherButton />
              </div>
            )}
          </div>
          <button
            type="button"
            className="void-command-icon"
            onClick={openSettings}
            aria-label={t("nav.settings")}
            aria-current={view === "settings" ? "page" : undefined}
          >
            <Settings2 size={19} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <AccountMenu
            trigger="avatar"
            placement="down"
            align="end"
            showSettings
            onOpenSettings={openSettings}
            settingsActive={view === "settings"}
            triggerClassName="void-command-avatar"
          />
          {IS_TAURI && !settings.useNativeTitleBar && (
            <div className="void-window-controls">
              <button type="button" aria-label={t("chrome.minimize")} onClick={minimize}><Minus size={15} /></button>
              <button type="button" aria-label={maximized ? t("chrome.restore") : t("chrome.maximize")} onClick={() => void toggleMaximize()}>
                {maximized ? <Maximize2 size={15} /> : <Square size={14} />}
              </button>
              <button type="button" aria-label={t("common.close")} onClick={close}><X size={17} /></button>
            </div>
          )}
        </div>
      </header>
      {settingsPin && (
        <ParentalPinModal
          verify={unlock}
          mode={{
            kind: "unlock",
            onUnlock: () => { setSettingsPin(false); setView("settings"); },
            onCancel: () => setSettingsPin(false),
          }}
        />
      )}
    </>
  );
}
