import {
  ArrowLeft,
  Download,
  FolderOpen,
  Home,
  History,
  Moon,
  MessageSquareText,
  Settings,
  Sun,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Check, Eye } from "lucide-react";
import forgeLogoOnDark from "../assets/everend-forge-logo-on-dark.png";
import forgeLogoOnLight from "../assets/everend-forge-logo-on-light.png";
import type { BranchingProject } from "../domain.js";
import { feedbackUrl } from "../feedback.js";
import { projectFileName, type ProjectFileState } from "../projectPersistence.js";
import type { SuiteChrome } from "../suiteChrome.js";
import { isDarkTheme, themeById, type ThemeId } from "../themes.js";
import { UniverseIconFrame } from "./UniverseIconFrame.js";
import type { WorkspacePanelId, WorkspacePanelState } from "../workspaceSettings.js";

const panelLabels: Record<WorkspacePanelId, string> = {
  assets: "Assets", logic: "Logic", player: "Player", outline: "Stories", export: "Export & Import", connect: "Connect",
};

const EVEREND_FORGE_GITHUB_URL = "https://github.com/Everendforge/everend-forge";
const BUY_SUITE_URL = "https://everendforge.com/buy-suite";

function ForgeLogoMark() {
  return (
    <>
      <img className="forge-logo forge-logo-on-light" src={forgeLogoOnLight} alt="" aria-hidden="true" />
      <img className="forge-logo forge-logo-on-dark" src={forgeLogoOnDark} alt="" aria-hidden="true" />
    </>
  );
}

function universeDisplayName(project?: BranchingProject, fileState?: ProjectFileState) {
  return fileState?.universeProfile?.name ?? project?.name ?? project?.projectId ?? "No universe";
}

function universeDisplayPath(fileState?: ProjectFileState) {
  const universePath = projectFileName(fileState?.universePath ?? fileState?.path);
  const storyPath = projectFileName(fileState?.storyPath ?? fileState?.path);
  return [universePath, storyPath].filter(Boolean).join(" / ");
}

export function Topbar({
  project,
  fileState,
  exportOpen,
  theme,
  onOpenSettings,
  onRevealUniverse,
  onToggleTheme,
  onExportRuntime,
  onHome,
  onFeedback,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  recentActions = [],
  suiteChrome,
  panelVisibility,
  onTogglePanelVisibility,
}: {
  project?: BranchingProject;
  fileState?: ProjectFileState;
  exportOpen: boolean;
  theme: ThemeId;
  onOpenSettings: () => void;
  onRevealUniverse: () => void;
  onToggleTheme: () => void;
  onExportRuntime: () => void;
  onHome: () => void;
  onFeedback?: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  recentActions?: string[];
  suiteChrome?: SuiteChrome;
  panelVisibility?: WorkspacePanelState;
  onTogglePanelVisibility?: (panel: WorkspacePanelId) => void;
}) {
  const universeName = universeDisplayName(project, fileState);
  const universePath = universeDisplayPath(fileState);
  const [forgeMenuOpen, setForgeMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
  const forgeMenuRef = useRef<HTMLDivElement | null>(null);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);
  const historyMenuRef = useRef<HTMLDivElement | null>(null);

  const openExternalUrl = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    setForgeMenuOpen(false);
  };

  useEffect(() => {
    if (!forgeMenuOpen && !viewMenuOpen && !historyMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        forgeMenuRef.current?.contains(event.target as Node) ||
        viewMenuRef.current?.contains(event.target as Node) ||
        historyMenuRef.current?.contains(event.target as Node)
      ) return;
      setForgeMenuOpen(false);
      setViewMenuOpen(false);
      setHistoryMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setForgeMenuOpen(false);
        setViewMenuOpen(false);
        setHistoryMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [forgeMenuOpen, historyMenuOpen, viewMenuOpen]);

  const toggleHistoryMenu = () => {
    setForgeMenuOpen(false);
    setViewMenuOpen(false);
    setHistoryMenuOpen((open) => !open);
  };

  const toggleViewMenu = () => {
    setForgeMenuOpen(false);
    setHistoryMenuOpen(false);
    setViewMenuOpen((open) => !open);
  };

  return (
    <header className="topbar dock-top-bar pathbranching-topbar" aria-label="Workspace controls">
      <div className="dock-top-left">
        {suiteChrome ? (
          suiteChrome.renderAppSwitcher()
        ) : (
          <div ref={forgeMenuRef} className={`forge-corner-menu ${forgeMenuOpen ? "open" : ""}`}>
            <div className="forge-orbit-panel" aria-label="Everend menu">
              <button type="button" onClick={() => openExternalUrl(EVEREND_FORGE_GITHUB_URL)}>
                Github
              </button>
              <button type="button" onClick={() => openExternalUrl(BUY_SUITE_URL)}>
                Buy Suite
              </button>
              <button type="button" onClick={() => onFeedback ? onFeedback() : openExternalUrl(feedbackUrl("workspace"))}>
                Enviar feedback
              </button>
            </div>
            <button
              type="button"
              className="forge-corner-button"
              onClick={() => setForgeMenuOpen((open) => !open)}
              aria-expanded={forgeMenuOpen}
              aria-label="Open Everend menu"
              title="Everend menu"
            >
              <ForgeLogoMark />
            </button>
          </div>
        )}

        <button type="button" className="dock-icon-button" title="Home" onClick={suiteChrome?.onHome ?? onHome}>
          <Home size={15} />
        </button>

        <div className="dock-top-divider" />

        <button type="button" className="dock-universe-button" onClick={onOpenSettings} title="Universe settings">
          <UniverseIconFrame profile={fileState?.universeProfile} />
          <span className="dock-universe-copy">
            <strong>{universeName}</strong>
            <span>{universePath || "Open a universe"}</span>
          </span>
        </button>
        <button type="button" className="dock-icon-button dock-settings-button" onClick={onOpenSettings} title="Application settings">
          <Settings size={14} />
        </button>
        <button
          type="button"
          className="dock-icon-button"
          onClick={onRevealUniverse}
          disabled={!fileState?.universePath}
          title={fileState?.universePath ? "Reveal universe folder" : "Open a universe first"}
        >
          <FolderOpen size={14} />
        </button>
      </div>

      <div className="dock-top-right">
        <div ref={historyMenuRef} className="topbar-view-menu">
          <button
            type="button"
            className={`topbar-menu-trigger ${historyMenuOpen ? "active" : ""}`}
            title="History"
            aria-haspopup="menu"
            onClick={toggleHistoryMenu}
            aria-expanded={historyMenuOpen}
          >
            <History size={14} /><span>History</span>
          </button>
          {historyMenuOpen ? <div className="topbar-menu-popover panel-picker" role="menu">
            <strong>History</strong>
            <button className="topbar-menu-option" type="button" onClick={() => { onUndo(); setHistoryMenuOpen(false); }} disabled={!canUndo}><ArrowLeft size={14} /> Undo</button>
            <button className="topbar-menu-option" type="button" onClick={() => { onRedo(); setHistoryMenuOpen(false); }} disabled={!canRedo}><ArrowLeft size={14} style={{ transform: "scaleX(-1)" }} /> Redo</button>
            {recentActions.length ? <>
              <span className="topbar-history-label">Recent actions</span>
              <div className="topbar-history-actions">
                {recentActions.map((action, index) => <span key={`${action}-${index}`}>{action}</span>)}
              </div>
            </> : <span className="topbar-history-empty">No actions yet.</span>}
          </div> : null}
        </div>

        <div className="dock-command-group" aria-label="Panels">
          {panelVisibility && onTogglePanelVisibility ? <div ref={viewMenuRef} className="topbar-view-menu">
            <button
              type="button"
              className={`topbar-menu-trigger ${viewMenuOpen ? "active" : ""}`}
              title="View panels"
              aria-haspopup="menu"
              onClick={toggleViewMenu}
              aria-expanded={viewMenuOpen}
            >
              <Eye size={14} /><span>View</span>
            </button>
            {viewMenuOpen ? <div className="topbar-menu-popover panel-picker" role="menu">
              <strong>Panels</strong>
              {(Object.keys(panelLabels) as WorkspacePanelId[]).map((panel) => <button className="topbar-menu-option" key={panel} type="button" role="menuitemcheckbox" aria-checked={panelVisibility[panel]} onClick={() => onTogglePanelVisibility(panel)}>
                <Check size={14} className={panelVisibility[panel] ? "visible" : "hidden"} /> {panelLabels[panel]}
              </button>)}
            </div> : null}
          </div> : null}
          <button type="button" title="Export & Import" className={exportOpen ? "active" : ""} onClick={onExportRuntime}>
            <Download size={14} />
            <span>Export & Import</span>
          </button>
        </div>

        {onFeedback ? (
          <button type="button" className="dock-icon-button" onClick={onFeedback} title="Enviar feedback" aria-label="Enviar feedback">
            <MessageSquareText size={15} />
          </button>
        ) : null}
        <button type="button" className="dock-icon-button" onClick={onToggleTheme} title={`Toggle theme (${themeById(theme).label})`} aria-label="Toggle theme">
          {isDarkTheme(theme) ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
}
