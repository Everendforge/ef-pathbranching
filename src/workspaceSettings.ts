import { normalizeThemeId, type ThemeId } from "./themes.js";
import type {
  AppView,
  CanvasMode,
  MarkdownEditorTab,
  InspectorTab,
  Selection,
} from "./appTypes.js";
import type { CanvasScope } from "./domain.js";
import type { StoryOutlineTab } from "./storyOutlineModel.js";

export const SETTINGS_KEY = "pathbranching.settings.v1";
export const DEFAULT_PANEL_WIDTH = 282;
export const MIN_PANEL_WIDTH = 220;
export const MAX_PANEL_WIDTH = 420;
export const DEFAULT_EXPLORER_WIDTH = 360;
export const MIN_EXPLORER_WIDTH = 300;
export const MAX_EXPLORER_WIDTH = 640;
export const COLLAPSED_RAIL_WIDTH = 36;
export const NEW_SEQUENCE_SELECT_VALUE = "__new_sequence__";

export const WORKSPACE_PANEL_IDS = [
  "assets",
  "logic",
  "player",
  "outline",
  "export",
  "connect",
] as const;

export type WorkspacePanelId = (typeof WORKSPACE_PANEL_IDS)[number];
export type WorkspacePanelState = Record<WorkspacePanelId, boolean>;

export const DEFAULT_WORKSPACE_PANEL_VISIBILITY: WorkspacePanelState = {
  outline: true,
  assets: true,
  logic: true,
  player: true,
  export: true,
  connect: true,
};

export const DEFAULT_WORKSPACE_PANEL_COLLAPSED: WorkspacePanelState = {
  outline: false,
  assets: false,
  logic: true,
  player: true,
  export: true,
  connect: true,
};

export type CanvasBackgroundSettings = {
  showDots: boolean;
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;
  opacity: number;
  connectionPadding: number;
};

export type CanvasLayoutMode = "branching" | "timeline" | "branches";

export type NodeColorSettings = {
  sequence: string;
  start: string;
  boundary: string;
  branch: string;
  event: string;
  decision: string;
  dialogue: string;
  outcome: string;
  inkSection: string;
  knowledge: string;
  runtimeAction: string;
};

export type WorldNotionBridgeSettings = {
  connected: boolean;
  lastCheckedAt?: number;
  lastStatus?: "ok" | "error" | "disconnected";
  lastMessage?: string;
};

export type EventInspectorTabGroup = {
  id: string;
  name: string;
  eventIds: string[];
  expandedEventId?: string;
  createdAt: number;
  updatedAt: number;
  inspectorTabs?: InspectorTab[];
  inspectorExpandedTabId?: string;
};

export const DEFAULT_CANVAS_BACKGROUND_SETTINGS: CanvasBackgroundSettings = {
  showDots: true,
  showGrid: false,
  snapToGrid: false,
  gridSize: 24,
  opacity: 0.5,
  connectionPadding: 18,
};

export const DEFAULT_NODE_COLOR_SETTINGS: NodeColorSettings = {
  sequence: "#7c8da5",
  start: "#2da66f",
  boundary: "#7c8da5",
  branch: "#b062d6",
  event: "#4f8cff",
  decision: "#c7832f",
  dialogue: "#8d93ff",
  outcome: "#19a7a1",
  inkSection: "#8d93ff",
  knowledge: "#7ca83a",
  runtimeAction: "#d45d78",
};

export type PathBranchingWorkspaceSession = {
  view?: AppView;
  selection?: Selection;
  canonOpen?: boolean;
  filesOpen?: boolean;
  canonWidth?: number;
  storiesWidth?: number;
  exportOpen?: boolean;
  dataOpen?: boolean;
  eventInspectorOpen?: boolean;
  eventInspectorOpenEventIds?: string[];
  eventInspectorExpandedEventId?: string;
  eventInspectorTabGroups?: EventInspectorTabGroup[];
  inspectorTabs?: InspectorTab[];
  inspectorExpandedTabId?: string;
  inspectorMaximized?: boolean;
  activeScope?: CanvasScope;
  canvasMode?: CanvasMode;
  focusNodeId?: string;
  markdownTabs?: MarkdownEditorTab[];
  activeMarkdownTabId?: string;
  storyOutlineTab?: StoryOutlineTab;
  panelVisibility?: Partial<WorkspacePanelState>;
  panelCollapsed?: Partial<WorkspacePanelState>;
};

export type AppSettings = {
  theme: ThemeId;
  recentProjects: string[];
  lastOpenedProject?: string;
  lastView?: AppView;
  canvasBackground: CanvasBackgroundSettings;
  canvasLayout: CanvasLayoutMode;
  nodeColors: NodeColorSettings;
  worldnotionBridge: WorldNotionBridgeSettings;
  workspaceSessions?: Record<string, PathBranchingWorkspaceSession>;
  inspectorTabCloseSelectsNext: boolean;
  collapseInspectorTabOnCanvasClick: boolean;
  inspectorDebugEnabled: boolean;
};

export function normalizeCanvasBackgroundSettings(
  value: unknown,
): CanvasBackgroundSettings {
  const settings =
    value && typeof value === "object"
      ? (value as Partial<CanvasBackgroundSettings>)
      : {};
  const gridSize =
    typeof settings.gridSize === "number" && Number.isFinite(settings.gridSize)
      ? Math.min(80, Math.max(8, Math.round(settings.gridSize)))
      : DEFAULT_CANVAS_BACKGROUND_SETTINGS.gridSize;
  const opacity =
    typeof settings.opacity === "number" && Number.isFinite(settings.opacity)
      ? Math.min(1, Math.max(0.05, settings.opacity))
      : DEFAULT_CANVAS_BACKGROUND_SETTINGS.opacity;
  const connectionPadding =
    typeof settings.connectionPadding === "number" && Number.isFinite(settings.connectionPadding)
      ? Math.min(64, Math.max(0, Math.round(settings.connectionPadding)))
      : DEFAULT_CANVAS_BACKGROUND_SETTINGS.connectionPadding;
  return {
    showDots:
      typeof settings.showDots === "boolean"
        ? settings.showDots
        : DEFAULT_CANVAS_BACKGROUND_SETTINGS.showDots,
    showGrid:
      typeof settings.showGrid === "boolean"
        ? settings.showGrid
        : DEFAULT_CANVAS_BACKGROUND_SETTINGS.showGrid,
    snapToGrid:
      typeof settings.snapToGrid === "boolean"
        ? settings.snapToGrid
        : DEFAULT_CANVAS_BACKGROUND_SETTINGS.snapToGrid,
    gridSize,
    opacity,
    connectionPadding,
  };
}

export function normalizeCanvasLayoutMode(value: unknown): CanvasLayoutMode {
  return value === "timeline" || value === "branches" || value === "branching"
    ? value
    : "branching";
}

function normalizeColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value
    : fallback;
}

export function normalizeNodeColorSettings(value: unknown): NodeColorSettings {
  const settings =
    value && typeof value === "object"
      ? (value as Partial<NodeColorSettings>)
      : {};
  return {
    sequence: normalizeColor(
      settings.sequence,
      DEFAULT_NODE_COLOR_SETTINGS.sequence,
    ),
    start: normalizeColor(settings.start, DEFAULT_NODE_COLOR_SETTINGS.start),
    boundary: normalizeColor(
      settings.boundary,
      DEFAULT_NODE_COLOR_SETTINGS.boundary,
    ),
    branch: normalizeColor(settings.branch, DEFAULT_NODE_COLOR_SETTINGS.branch),
    event: normalizeColor(settings.event, DEFAULT_NODE_COLOR_SETTINGS.event),
    decision: normalizeColor(
      settings.decision,
      DEFAULT_NODE_COLOR_SETTINGS.decision,
    ),
    dialogue: normalizeColor(
      settings.dialogue,
      DEFAULT_NODE_COLOR_SETTINGS.dialogue,
    ),
    outcome: normalizeColor(
      settings.outcome,
      DEFAULT_NODE_COLOR_SETTINGS.outcome,
    ),
    inkSection: normalizeColor(
      settings.inkSection,
      DEFAULT_NODE_COLOR_SETTINGS.inkSection,
    ),
    knowledge: normalizeColor(
      settings.knowledge,
      DEFAULT_NODE_COLOR_SETTINGS.knowledge,
    ),
    runtimeAction: normalizeColor(
      settings.runtimeAction,
      DEFAULT_NODE_COLOR_SETTINGS.runtimeAction,
    ),
  };
}

export function normalizeWorldNotionBridgeSettings(
  value: unknown,
): WorldNotionBridgeSettings {
  const settings =
    value && typeof value === "object"
      ? (value as Partial<WorldNotionBridgeSettings>)
      : {};
  return {
    connected:
      typeof settings.connected === "boolean" ? settings.connected : false,
    lastCheckedAt:
      typeof settings.lastCheckedAt === "number" &&
      Number.isFinite(settings.lastCheckedAt)
        ? settings.lastCheckedAt
        : undefined,
    lastStatus:
      settings.lastStatus === "ok" ||
      settings.lastStatus === "error" ||
      settings.lastStatus === "disconnected"
        ? settings.lastStatus
        : undefined,
    lastMessage:
      typeof settings.lastMessage === "string"
        ? settings.lastMessage
        : undefined,
  };
}

export function loadSettings(): AppSettings {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) ?? "{}",
    ) as Partial<AppSettings>;
    const workspaceSessions =
      parsed.workspaceSessions && typeof parsed.workspaceSessions === "object"
        ? parsed.workspaceSessions
        : {};
    return {
      theme: normalizeThemeId(parsed.theme),
      recentProjects: Array.isArray(parsed.recentProjects)
        ? parsed.recentProjects.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      lastOpenedProject:
        typeof parsed.lastOpenedProject === "string"
          ? parsed.lastOpenedProject
          : undefined,
      lastView:
        parsed.lastView === "workspace" || parsed.lastView === "home"
          ? parsed.lastView
          : "home",
      canvasBackground: normalizeCanvasBackgroundSettings(
        parsed.canvasBackground,
      ),
      canvasLayout: normalizeCanvasLayoutMode(parsed.canvasLayout),
      nodeColors: normalizeNodeColorSettings(parsed.nodeColors),
      worldnotionBridge: normalizeWorldNotionBridgeSettings(
        parsed.worldnotionBridge,
      ),
      workspaceSessions,
      inspectorTabCloseSelectsNext:
        typeof parsed.inspectorTabCloseSelectsNext === "boolean"
          ? parsed.inspectorTabCloseSelectsNext
          : false,
      collapseInspectorTabOnCanvasClick:
        typeof parsed.collapseInspectorTabOnCanvasClick === "boolean"
          ? parsed.collapseInspectorTabOnCanvasClick
          : true,
      inspectorDebugEnabled:
        typeof parsed.inspectorDebugEnabled === "boolean"
          ? parsed.inspectorDebugEnabled
          : false,
    };
  } catch {
    return {
      theme: "worldnotion-light",
      recentProjects: [],
      lastView: "home",
      canvasBackground: DEFAULT_CANVAS_BACKGROUND_SETTINGS,
      canvasLayout: "branching",
      nodeColors: normalizeNodeColorSettings(undefined),
      worldnotionBridge: normalizeWorldNotionBridgeSettings(undefined),
      workspaceSessions: {},
      inspectorTabCloseSelectsNext: false,
      collapseInspectorTabOnCanvasClick: true,
      inspectorDebugEnabled: false,
    };
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function clampPanelWidth(value: unknown) {
  const numericValue =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : DEFAULT_PANEL_WIDTH;
  return Math.min(
    MAX_PANEL_WIDTH,
    Math.max(MIN_PANEL_WIDTH, Math.round(numericValue)),
  );
}

export function clampExplorerWidth(value: unknown) {
  const numericValue =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : DEFAULT_EXPLORER_WIDTH;
  return Math.min(
    MAX_EXPLORER_WIDTH,
    Math.max(MIN_EXPLORER_WIDTH, Math.round(numericValue)),
  );
}

export function rememberRecentProject(
  settings: AppSettings,
  path: string,
): AppSettings {
  return {
    ...settings,
    lastOpenedProject: path,
    recentProjects: [
      path,
      ...settings.recentProjects.filter((candidate) => candidate !== path),
    ].slice(0, 8),
    workspaceSessions: settings.workspaceSessions ?? {},
  };
}

export function storableMarkdownTabs(
  tabs: MarkdownEditorTab[],
): MarkdownEditorTab[] {
  return tabs.map((tab) => ({ ...tab, saving: false })).slice(-5);
}

export function isSelection(value: unknown): value is Selection {
  if (
    !value ||
    typeof value !== "object" ||
    !("type" in value) ||
    !("id" in value)
  )
    return false;
  const selection = value as { type?: unknown; id?: unknown };
  return (
    typeof selection.id === "string" &&
    (selection.type === "node" ||
      selection.type === "edge" ||
      selection.type === "canon" ||
      selection.type === "file" ||
      selection.type === "dataObject" ||
      selection.type === "canonSuggestion" ||
      selection.type === "explorerEntity" ||
      selection.type === "explorerType" ||
      selection.type === "explorerProperty")
  );
}

function isCanvasScope(value: unknown): value is CanvasScope {
  if (!value || typeof value !== "object") return false;
  const scope = value as { kind?: unknown; id?: unknown; eventId?: unknown };
  return (
    typeof scope.id === "string" &&
    (scope.kind === "sequence" ||
      scope.kind === "event" ||
      (scope.kind === "dialogue" && typeof scope.eventId === "string"))
  );
}

export function sessionMarkdownTabs(value: unknown): MarkdownEditorTab[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((tab): tab is MarkdownEditorTab => {
      return (
        tab &&
        typeof tab === "object" &&
        typeof tab.id === "string" &&
        typeof tab.canonRefId === "string" &&
        typeof tab.title === "string" &&
        typeof tab.content === "string" &&
        (tab.format === "markdown" ||
          tab.format === "ink" ||
          tab.format === "gameData" ||
          tab.format === "frontmatter")
      );
    })
    .map((tab) => ({ ...tab, saving: false }))
    .slice(-5);
}

export function sessionStringIds(value: unknown, limit = 5): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
  return Number.isFinite(limit) ? ids.slice(-limit) : ids;
}

function uniqueSessionStringIds(value: unknown) {
  const seen = new Set<string>();
  return sessionStringIds(value, Number.POSITIVE_INFINITY).filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function sessionInspectorTabs(value: unknown): InspectorTab[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const tab = candidate as Partial<InspectorTab>;
    if (
      typeof tab.id !== "string" ||
      typeof tab.title !== "string" ||
      !isSelection(tab.selection) ||
      seen.has(tab.id)
    ) {
      return [];
    }
    seen.add(tab.id);
    return [
      {
        id: tab.id,
        title: tab.title,
        selection: tab.selection,
        mode: tab.mode === "debug" ? "debug" : "normal",
      },
    ];
  });
}

export function sessionEventInspectorTabGroups(
  value: unknown,
): EventInspectorTabGroup[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((group): group is Partial<EventInspectorTabGroup> => {
      return Boolean(
        group &&
        typeof group === "object" &&
        typeof group.id === "string" &&
        typeof group.name === "string",
      );
    })
    .map((group) => {
      const eventIds = uniqueSessionStringIds(group.eventIds);
      const expandedEventId =
        typeof group.expandedEventId === "string" &&
        eventIds.includes(group.expandedEventId)
          ? group.expandedEventId
          : undefined;
      const createdAt =
        typeof group.createdAt === "number" && Number.isFinite(group.createdAt)
          ? group.createdAt
          : Date.now();
      const updatedAt =
        typeof group.updatedAt === "number" && Number.isFinite(group.updatedAt)
          ? group.updatedAt
          : createdAt;
      const inspectorTabs = sessionInspectorTabs(group.inspectorTabs);
      const inspectorExpandedTabId =
        typeof group.inspectorExpandedTabId === "string" &&
        inspectorTabs.some((tab) => tab.id === group.inspectorExpandedTabId)
          ? group.inspectorExpandedTabId
          : undefined;
      return {
        id: group.id as string,
        name: group.name as string,
        eventIds,
        expandedEventId,
        createdAt,
        updatedAt,
        inspectorTabs,
        inspectorExpandedTabId,
      };
    })
    .filter(
      (group) =>
        group.eventIds.length > 0 || (group.inspectorTabs?.length ?? 0) > 0,
    );
}

export function normalizeWorkspaceSession(
  session: PathBranchingWorkspaceSession | undefined,
): PathBranchingWorkspaceSession {
  if (!session) return {};
  const legacyExplorerCollapsed =
    session.panelCollapsed &&
    typeof (session.panelCollapsed as Record<string, unknown>).explorer === "boolean"
      ? (session.panelCollapsed as Record<string, boolean>).explorer
      : undefined;
  const inspectorTabs = sessionInspectorTabs(session.inspectorTabs);
  const inspectorExpandedTabId =
    typeof session.inspectorExpandedTabId === "string" &&
    inspectorTabs.some((tab) => tab.id === session.inspectorExpandedTabId)
      ? session.inspectorExpandedTabId
      : undefined;
  const eventInspectorOpenEventIds = uniqueSessionStringIds(
    session.eventInspectorOpenEventIds,
  );
  const eventInspectorExpandedEventId =
    !inspectorExpandedTabId &&
    typeof session.eventInspectorExpandedEventId === "string" &&
    eventInspectorOpenEventIds.includes(session.eventInspectorExpandedEventId)
      ? session.eventInspectorExpandedEventId
      : undefined;
  return {
    view:
      session.view === "home" || session.view === "workspace"
        ? session.view
        : undefined,
    selection: isSelection(session.selection) ? session.selection : undefined,
    canonOpen:
      typeof session.canonOpen === "boolean" ? session.canonOpen : undefined,
    filesOpen:
      typeof session.filesOpen === "boolean" ? session.filesOpen : undefined,
    canonWidth:
      session.canonWidth === undefined
        ? undefined
        : clampExplorerWidth(session.canonWidth),
    storiesWidth:
      session.storiesWidth === undefined
        ? undefined
        : clampPanelWidth(session.storiesWidth),
    exportOpen:
      typeof session.exportOpen === "boolean" ? session.exportOpen : undefined,
    dataOpen:
      typeof session.dataOpen === "boolean" ? session.dataOpen : undefined,
    eventInspectorOpen:
      typeof session.eventInspectorOpen === "boolean"
        ? session.eventInspectorOpen
        : undefined,
    eventInspectorOpenEventIds,
    eventInspectorExpandedEventId,
    eventInspectorTabGroups: sessionEventInspectorTabGroups(
      session.eventInspectorTabGroups,
    ),
    inspectorTabs,
    inspectorExpandedTabId,
    inspectorMaximized:
      typeof session.inspectorMaximized === "boolean"
        ? session.inspectorMaximized
        : undefined,
    activeScope: isCanvasScope(session.activeScope)
      ? session.activeScope
      : undefined,
    canvasMode:
      session.canvasMode === "branching" || session.canvasMode === "focus"
        ? session.canvasMode
        : undefined,
    focusNodeId:
      typeof session.focusNodeId === "string" ? session.focusNodeId : undefined,
    markdownTabs: sessionMarkdownTabs(session.markdownTabs),
    activeMarkdownTabId:
      typeof session.activeMarkdownTabId === "string"
        ? session.activeMarkdownTabId
        : undefined,
    storyOutlineTab:
      session.storyOutlineTab === "sequence" ||
      session.storyOutlineTab === "branches" ||
      session.storyOutlineTab === "paths"
        ? session.storyOutlineTab
        : undefined,
    panelVisibility: normalizePanelState(session.panelVisibility),
    panelCollapsed: {
      ...normalizePanelState(session.panelCollapsed),
      ...(legacyExplorerCollapsed === undefined
        ? {}
        : { assets: legacyExplorerCollapsed }),
    },
  };
}

function normalizePanelState(value: unknown): Partial<WorkspacePanelState> {
  if (!value || typeof value !== "object") return {};
  const candidate = value as Partial<Record<WorkspacePanelId, unknown>>;
  return WORKSPACE_PANEL_IDS.reduce<Partial<WorkspacePanelState>>((state, id) => {
    if (typeof candidate[id] === "boolean") state[id] = candidate[id] as boolean;
    return state;
  }, {});
}
