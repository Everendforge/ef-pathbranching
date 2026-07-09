import {
  ArrowLeft,
  Download,
  FolderOpen,
  Home,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import forgeLogoOnDark from "../assets/everend-forge-logo-on-dark.png";
import forgeLogoOnLight from "../assets/everend-forge-logo-on-light.png";
import type { BranchingProject } from "../domain.js";
import { projectFileName, type ProjectFileState } from "../projectPersistence.js";
import { isDarkTheme, themeById, type ThemeId } from "../themes.js";
import { UniverseIconFrame } from "./UniverseIconFrame.js";

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
  onUndo,
  onRedo,
  canUndo,
  canRedo,
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
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const universeName = universeDisplayName(project, fileState);
  const universePath = universeDisplayPath(fileState);
  const [forgeMenuOpen, setForgeMenuOpen] = useState(false);
  const forgeMenuRef = useRef<HTMLDivElement | null>(null);

  const openExternalUrl = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    setForgeMenuOpen(false);
  };

  useEffect(() => {
    if (!forgeMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (forgeMenuRef.current?.contains(event.target as Node)) return;
      setForgeMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setForgeMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [forgeMenuOpen]);

  return (
    <header className="topbar dock-top-bar pathbranching-topbar" aria-label="Workspace controls">
      <div className="dock-top-left">
        <div ref={forgeMenuRef} className={`forge-corner-menu ${forgeMenuOpen ? "open" : ""}`}>
          <div className="forge-orbit-panel" aria-label="Everend menu">
            <button type="button" onClick={() => openExternalUrl(EVEREND_FORGE_GITHUB_URL)}>
              Github
            </button>
            <button type="button" onClick={() => openExternalUrl(BUY_SUITE_URL)}>
              Buy Suite
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

        <button type="button" className="dock-icon-button" title="Home" onClick={onHome}>
          <Home size={15} />
        </button>

        <div className="dock-top-divider" />

        <button type="button" className="dock-universe-button" onClick={onOpenSettings} title="Universe settings">
          <UniverseIconFrame profile={fileState?.universeProfile} />
          <span className="dock-universe-copy">
            <strong>{universeName}</strong>
            <span>
              {universePath || "Open a universe"}
              {fileState?.dirty ? " *" : ""}
            </span>
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
        <div className="dock-command-group" aria-label="History">
          <button type="button" title="Undo" onClick={onUndo} disabled={!canUndo}>
            <ArrowLeft size={14} />
            <span>Undo</span>
          </button>
          <button type="button" title="Redo" onClick={onRedo} disabled={!canRedo}>
            <ArrowLeft size={14} style={{ transform: "scaleX(-1)" }} />
            <span>Redo</span>
          </button>
        </div>

        <div className="dock-command-group" aria-label="Panels">
          <button type="button" title="Export current story" className={exportOpen ? "active" : ""} onClick={onExportRuntime}>
            <Download size={14} />
            <span>Export</span>
          </button>
        </div>

        <button type="button" className="dock-icon-button" onClick={onToggleTheme} title={`Toggle theme (${themeById(theme).label})`}>
          {isDarkTheme(theme) ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
}
