import { normalizeThemeId, type ThemeId } from "./themes.js";
import {
  normalizeAuthoringDisplaySettings,
  normalizeCanvasBackgroundSettings,
  normalizeCanvasLayoutMode,
  normalizeNodeColorSettings,
  type AppSettings,
  type AuthoringDisplaySettings,
  type CanvasBackgroundSettings,
  type CanvasLayoutMode,
  type NodeColorSettings,
} from "./workspaceSettings.js";

/** Namespaced under `.pathbranching` so it can't collide with WorldNotion's own `.everend/settings.json`. */
export const VAULT_APPEARANCE_SETTINGS_PATH = ".everend/.pathbranching/settings.json";

/**
 * The slice of {@link AppSettings} that represents how a universe's
 * PathBranching workspace looks and behaves, rather than machine-local state
 * (recent projects, last view, the WorldNotion bridge status, open tabs).
 * Persisted inside the universe itself so opening it anywhere reproduces the
 * same style.
 */
export type PathBranchingVaultAppearanceSettings = {
  version: 1;
  theme: ThemeId;
  canvasBackground: CanvasBackgroundSettings;
  canvasLayout: CanvasLayoutMode;
  nodeColors: NodeColorSettings;
  authoringDisplay: AuthoringDisplaySettings;
  inspectorTabCloseSelectsNext: boolean;
  collapseInspectorTabOnCanvasClick: boolean;
  showStatusMessages: boolean;
};

export function extractVaultAppearanceSettings(
  settings: AppSettings,
): PathBranchingVaultAppearanceSettings {
  return {
    version: 1,
    theme: settings.theme,
    canvasBackground: settings.canvasBackground,
    canvasLayout: settings.canvasLayout,
    nodeColors: settings.nodeColors,
    authoringDisplay: settings.authoringDisplay,
    inspectorTabCloseSelectsNext: settings.inspectorTabCloseSelectsNext,
    collapseInspectorTabOnCanvasClick: settings.collapseInspectorTabOnCanvasClick,
    showStatusMessages: settings.showStatusMessages,
  };
}

export function serializeVaultAppearance(appearance: PathBranchingVaultAppearanceSettings): string {
  return `${JSON.stringify(appearance, null, 2)}\n`;
}

export function serializeVaultAppearanceSettings(settings: AppSettings): string {
  return serializeVaultAppearance(extractVaultAppearanceSettings(settings));
}

/** Merges a universe's stored appearance over the current app settings; the universe wins. */
export function applyVaultAppearanceSettings(
  base: AppSettings,
  appearance: PathBranchingVaultAppearanceSettings | undefined,
): AppSettings {
  if (!appearance) return base;
  return {
    ...base,
    theme: appearance.theme,
    canvasBackground: appearance.canvasBackground,
    canvasLayout: appearance.canvasLayout,
    nodeColors: appearance.nodeColors,
    authoringDisplay: appearance.authoringDisplay,
    inspectorTabCloseSelectsNext: appearance.inspectorTabCloseSelectsNext,
    collapseInspectorTabOnCanvasClick: appearance.collapseInspectorTabOnCanvasClick,
    showStatusMessages: appearance.showStatusMessages,
  };
}

export function parseVaultAppearanceSettings(
  files: Array<{ relativePath: string; content: string }>,
  loadWarnings?: string[],
): PathBranchingVaultAppearanceSettings | undefined {
  const file = files.find((candidate) => candidate.relativePath === VAULT_APPEARANCE_SETTINGS_PATH);
  if (!file) return undefined;

  try {
    const parsed = JSON.parse(file.content) as Partial<PathBranchingVaultAppearanceSettings> | null;
    if (!parsed || typeof parsed !== "object") return undefined;
    return {
      version: 1,
      theme: normalizeThemeId(parsed.theme),
      canvasBackground: normalizeCanvasBackgroundSettings(parsed.canvasBackground),
      canvasLayout: normalizeCanvasLayoutMode(parsed.canvasLayout),
      nodeColors: normalizeNodeColorSettings(parsed.nodeColors),
      authoringDisplay: normalizeAuthoringDisplaySettings(parsed.authoringDisplay),
      inspectorTabCloseSelectsNext:
        typeof parsed.inspectorTabCloseSelectsNext === "boolean"
          ? parsed.inspectorTabCloseSelectsNext
          : false,
      collapseInspectorTabOnCanvasClick:
        typeof parsed.collapseInspectorTabOnCanvasClick === "boolean"
          ? parsed.collapseInspectorTabOnCanvasClick
          : true,
      showStatusMessages:
        typeof parsed.showStatusMessages === "boolean" ? parsed.showStatusMessages : false,
    };
  } catch (error) {
    loadWarnings?.push(
      `Could not parse ${VAULT_APPEARANCE_SETTINGS_PATH}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}
