import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type OnConnect,
  type ReactFlowInstance,
  Handle,
  Position,
} from "@xyflow/react";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowLeft,
  Crown,
  Database,
  Download,
  FilePlus2,
  FolderOpen,
  Focus,
  GitBranch,
  Home,
  Moon,
  RotateCcw,
  Save,
  SearchCheck,
  Settings,
  Sun,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type {
  Branch,
  BranchingProject,
  CanonRef,
  ConditionInput,
  Consequence,
  DataFieldDefinition,
  Decision,
  EventCategoryDefinition,
  EventNode,
  EventType,
  Outcome,
  ProjectDataObject,
  RuleSet,
  Sequence,
  Transition,
  ValidationFinding,
} from "./domain.js";
import { exportRuntimePackage } from "./exportRuntime.js";
import { exportInkProject, exportSinpoGameData } from "./exportFormats.js";
import { conditionCount, conditionLabels, consequenceLabel } from "./logic.js";
import * as mutations from "./projectMutations.js";
import {
  exportRuntimeDialog,
  normalizeProject,
  openUniverseDialog,
  openUniversePath,
  projectFileName,
  exportTextDialog,
  saveWorkingCopy,
  saveUniverseStory,
  type ProjectFileState,
} from "./projectPersistence.js";
import { workingCopyPathForCanonRef, type PathBranchingWorkspace, type UniverseProfile } from "./pathBranchingWorkspace.js";
import {
  THEMES,
  isDarkTheme,
  normalizeThemeId,
  themeById,
  themeForFamilyAndMode,
  toggledThemeMode,
  type ThemeFamily,
  type ThemeId,
} from "./themes.js";
import { validateProject } from "./validate.js";
import {
  buildStoryCanvasModel,
  validateStoryCanvasEdges,
  type PathBranchingFileItem,
  type StoryCanvasEdge,
  type StoryCanvasEdgeData,
  type StoryCanvasNode,
  type StoryCanvasNodeData,
} from "./canvas/storyCanvasModel.js";
import { isTauriRuntime, shortcutMatches } from "./utils/appEnvironment.js";

type Selection =
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "canon"; id: string }
  | { type: "file"; id: string }
  | { type: "dataObject"; id: string };

type CanvasMode = "branching" | "focus";
type AppView = "home" | "workspace";
type ExportPreviewMode = "runtime" | "ink" | "gameData";
type MarkdownDraftFormat = "markdown" | "ink" | "gameData" | "frontmatter";

type MarkdownEditorTab = {
  id: string;
  canonRefId: string;
  title: string;
  sourcePath?: string;
  workingCopyPath?: string;
  format: MarkdownDraftFormat;
  content: string;
  dirty: boolean;
  saving?: boolean;
  lastSavedAt?: number;
  modifiedMs?: number;
};

const SETTINGS_KEY = "pathbranching.settings.v1";
const DEFAULT_PANEL_WIDTH = 282;
const MIN_PANEL_WIDTH = 220;
const MAX_PANEL_WIDTH = 420;
const COLLAPSED_RAIL_WIDTH = 36;
const NEW_SEQUENCE_SELECT_VALUE = "__new_sequence__";

type PathBranchingWorkspaceSession = {
  view?: AppView;
  selection?: Selection;
  canonOpen?: boolean;
  filesOpen?: boolean;
  canonWidth?: number;
  storiesWidth?: number;
  exportOpen?: boolean;
  dataOpen?: boolean;
  canvasMode?: CanvasMode;
  focusNodeId?: string;
  markdownTabs?: MarkdownEditorTab[];
  activeMarkdownTabId?: string;
};

const MARKDOWN_FORMAT_LABELS: Record<MarkdownDraftFormat, string> = {
  markdown: "Markdown",
  ink: "Ink Beat",
  gameData: "GameData",
  frontmatter: "Frontmatter",
};

function canonMarkdownDraft(ref: CanonRef): string {
  const title = ref.label ?? ref.id;
  const lines = [
    `# ${title}`,
    "",
    `> Canon source: ${ref.canonSourcePath ?? ref.id}`,
    "",
    ref.preview?.trim() ?? "",
  ];
  return `${lines.filter((line, index) => index < 4 || line.length > 0).join("\n")}\n`;
}

function markdownFormatTemplate(format: MarkdownDraftFormat, ref: CanonRef): string {
  const title = ref.label ?? ref.id;
  switch (format) {
    case "ink":
      return `# ${title}\n\n## Ink Beat\n\n\`\`\`ink\n=== ${ref.id.replace(/[^a-zA-Z0-9_]+/g, "_")} ===\n${title}\n+ [Continue]\n  -> DONE\n\`\`\`\n`;
    case "gameData":
      return `# ${title}\n\n## GameData Note\n\n\`\`\`json\n{\n  "canonRef": "${ref.id}",\n  "source": "${ref.canonSourcePath ?? ""}",\n  "tags": []\n}\n\`\`\`\n`;
    case "frontmatter":
      return `---\ncanonRef: ${ref.id}\ncanonSourcePath: ${ref.canonSourcePath ?? ""}\nformat: pathbranching-working-copy\n---\n\n# ${title}\n\n`;
    case "markdown":
    default:
      return canonMarkdownDraft(ref);
  }
}

type AppSettings = {
  theme: ThemeId;
  recentProjects: string[];
  lastOpenedProject?: string;
  lastView?: AppView;
  workspaceSessions?: Record<string, PathBranchingWorkspaceSession>;
};

function loadSettings(): AppSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<AppSettings>;
    const workspaceSessions =
      parsed.workspaceSessions && typeof parsed.workspaceSessions === "object" ? parsed.workspaceSessions : {};
    return {
      theme: normalizeThemeId(parsed.theme),
      recentProjects: Array.isArray(parsed.recentProjects)
        ? parsed.recentProjects.filter((item): item is string => typeof item === "string")
        : [],
      lastOpenedProject: typeof parsed.lastOpenedProject === "string" ? parsed.lastOpenedProject : undefined,
      lastView: parsed.lastView === "workspace" || parsed.lastView === "home" ? parsed.lastView : "home",
      workspaceSessions,
    };
  } catch {
    return { theme: "worldnotion-light", recentProjects: [], lastView: "home", workspaceSessions: {} };
  }
}

function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function badgeText(value: string) {
  return value.length > 22 ? `${value.slice(0, 19)}...` : value;
}

function clampPanelWidth(value: unknown) {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_PANEL_WIDTH;
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(numericValue)));
}

function rememberRecentProject(settings: AppSettings, path: string): AppSettings {
  return {
    ...settings,
    lastOpenedProject: path,
    recentProjects: [path, ...settings.recentProjects.filter((candidate) => candidate !== path)].slice(0, 8),
    workspaceSessions: settings.workspaceSessions ?? {},
  };
}

function storableMarkdownTabs(tabs: MarkdownEditorTab[]): MarkdownEditorTab[] {
  return tabs.map((tab) => ({ ...tab, saving: false })).slice(-5);
}

function isSelection(value: unknown): value is Selection {
  if (!value || typeof value !== "object" || !("type" in value) || !("id" in value)) return false;
  const selection = value as { type?: unknown; id?: unknown };
  return (
    typeof selection.id === "string" &&
    (selection.type === "node" ||
      selection.type === "edge" ||
      selection.type === "canon" ||
      selection.type === "file" ||
      selection.type === "dataObject")
  );
}

function sessionMarkdownTabs(value: unknown): MarkdownEditorTab[] {
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
        (tab.format === "markdown" || tab.format === "ink" || tab.format === "gameData" || tab.format === "frontmatter")
      );
    })
    .map((tab) => ({ ...tab, saving: false }))
    .slice(-5);
}

function normalizeWorkspaceSession(session: PathBranchingWorkspaceSession | undefined): PathBranchingWorkspaceSession {
  if (!session) return {};
  return {
    view: session.view === "home" || session.view === "workspace" ? session.view : undefined,
    selection: isSelection(session.selection) ? session.selection : undefined,
    canonOpen: typeof session.canonOpen === "boolean" ? session.canonOpen : undefined,
    filesOpen: typeof session.filesOpen === "boolean" ? session.filesOpen : undefined,
    canonWidth: session.canonWidth === undefined ? undefined : clampPanelWidth(session.canonWidth),
    storiesWidth: session.storiesWidth === undefined ? undefined : clampPanelWidth(session.storiesWidth),
    exportOpen: typeof session.exportOpen === "boolean" ? session.exportOpen : undefined,
    dataOpen: typeof session.dataOpen === "boolean" ? session.dataOpen : undefined,
    canvasMode: session.canvasMode === "branching" || session.canvasMode === "focus" ? session.canvasMode : undefined,
    focusNodeId: typeof session.focusNodeId === "string" ? session.focusNodeId : undefined,
    markdownTabs: sessionMarkdownTabs(session.markdownTabs),
    activeMarkdownTabId: typeof session.activeMarkdownTabId === "string" ? session.activeMarkdownTabId : undefined,
  };
}

function StoryNode({ data, selected }: NodeProps<StoryCanvasNode>) {
  const nodeData = data as StoryCanvasNodeData;
  const isFinalEvent = nodeData.kind === "event" && nodeData.badges.includes("terminal");
  const focusClass = typeof nodeData.focusState === "string" ? ` focus-${nodeData.focusState}` : "";
  const canReceive = nodeData.kind !== "start" && nodeData.kind !== "sequence";
  const canSource = nodeData.kind === "start" || (nodeData.kind !== "sequence" && !isFinalEvent);

  if (nodeData.isContainer) {
    return (
      <div className={`story-node branch-container${focusClass} ${selected ? "selected" : ""}`}>
        {canReceive ? <Handle type="target" position={Position.Left} /> : null}
        <div className="node-kind">{nodeData.kind}</div>
        <div className="node-title">{nodeData.title}</div>
        {nodeData.subtitle ? <div className="node-subtitle">{nodeData.subtitle}</div> : null}
        {nodeData.badges.length > 0 ? (
          <div className="node-badges">
            {nodeData.badges.slice(0, 5).map((badge) => (
              <span key={badge}>{badgeText(badge)}</span>
            ))}
          </div>
        ) : null}
        {canSource ? <Handle type="source" position={Position.Right} /> : null}
      </div>
    );
  }

  return (
    <div className={`story-node ${nodeData.kind}${focusClass}${isFinalEvent ? " terminal" : ""}${selected ? " selected" : ""}`}>
      {canReceive ? <Handle type="target" position={Position.Left} /> : null}
      <div className="node-kind">{nodeData.kind}</div>
      <div className="node-title">{nodeData.title}</div>
      {nodeData.subtitle ? <div className="node-subtitle">{nodeData.subtitle}</div> : null}
      {nodeData.badges.length > 0 ? (
        <div className="node-badges">
          {nodeData.badges.slice(0, 4).map((badge) => (
            <span key={badge}>{badgeText(badge)}</span>
          ))}
        </div>
      ) : null}
      {canSource ? <Handle type="source" position={Position.Right} /> : null}
    </div>
  );
}

const nodeTypes = {
  story: StoryNode,
} satisfies NodeTypes;

function groupCanon(project: BranchingProject) {
  return project.canonRefs.reduce<Record<string, typeof project.canonRefs>>((groups, ref) => {
    const kind = ref.kind ?? "canon";
    groups[kind] ??= [];
    groups[kind].push(ref);
    return groups;
  }, {});
}

type CanonTreeNode = {
  kind: "folder" | "ref";
  name: string;
  path: string;
  ref?: CanonRef;
  children: CanonTreeNode[];
};

function pathDirectory(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

function pathBasename(path: string) {
  return path.replace(/\\/g, "/").split("/").pop()?.replace(/\.md$/i, "") ?? path;
}

function canonRefPath(ref: CanonRef) {
  return ref.canonSourcePath ?? ref.id;
}

function canonRefMatches(ref: CanonRef, query: string) {
  if (!query) return true;
  return [ref.id, ref.label, ref.kind, ref.status, ref.canonSourcePath, ref.identityWarning, ...(ref.tags ?? [])]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

function folderPathForFolderDescription(ref: CanonRef) {
  if (!ref.folderDescription) return undefined;
  const sourcePath = canonRefPath(ref).replace(/\\/g, "/");
  const folderPath = pathDirectory(sourcePath);
  if (folderPath) return folderPath;
  const normalized = sourcePath.replace(/\.md$/i, "");
  return normalized.includes("/") ? undefined : normalized;
}

function buildCanonFileTree(refs: CanonRef[]): CanonTreeNode[] {
  const root: CanonTreeNode[] = [];
  const folders = new Map<string, CanonTreeNode>();

  const ensureFolder = (folderPath: string) => {
    const existing = folders.get(folderPath);
    if (existing) return existing;
    const node: CanonTreeNode = {
      kind: "folder",
      name: pathBasename(folderPath),
      path: folderPath,
      children: [],
    };
    folders.set(folderPath, node);
    const parentPath = pathDirectory(folderPath);
    if (parentPath) {
      ensureFolder(parentPath).children.push(node);
    } else {
      root.push(node);
    }
    return node;
  };

  refs.forEach((ref) => {
    const describedFolder = folderPathForFolderDescription(ref);
    if (describedFolder) {
      const folder = ensureFolder(describedFolder);
      folder.ref = ref;
      return;
    }

    const refPath = canonRefPath(ref);
    const folderPath = pathDirectory(refPath);
    const node: CanonTreeNode = {
      kind: "ref",
      name: ref.label ?? pathBasename(refPath),
      path: refPath,
      ref,
      children: [],
    };
    if (folderPath) {
      ensureFolder(folderPath).children.push(node);
    } else {
      root.push(node);
    }
  });

  const sort = (nodes: CanonTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => sort(node.children));
  };

  sort(root);
  return root;
}

function groupCanonByTag(refs: CanonRef[]) {
  return refs.reduce<Record<string, CanonRef[]>>((groups, ref) => {
    const tags = ref.tags?.length ? ref.tags : ["_untagged"];
    tags.forEach((tag) => {
      groups[tag] ??= [];
      groups[tag].push(ref);
    });
    return groups;
  }, {});
}

function universeDisplayName(project?: BranchingProject, fileState?: ProjectFileState) {
  return fileState?.universeProfile?.name ?? project?.name ?? project?.projectId ?? "No universe loaded";
}

function universeDisplayPath(fileState?: ProjectFileState) {
  const universePath = projectFileName(fileState?.universePath ?? fileState?.path);
  const storyPath = projectFileName(fileState?.storyPath ?? fileState?.path);
  return [universePath, storyPath].filter(Boolean).join(" / ");
}

function UniverseIconFrame({ profile, size = 28 }: { profile?: UniverseProfile; size?: number }) {
  const icon = profile?.icon;
  if (icon?.type === "image" && icon.value) {
    return (
      <span className="pathbranching-universe-icon" style={{ width: size, height: size }}>
        <img src={icon.value} alt="" />
      </span>
    );
  }

  return (
    <span className="pathbranching-universe-icon" style={{ width: size, height: size }}>
      {icon?.type === "preset" && icon.value ? <span className="universe-preset-icon">{icon.value.slice(0, 2).toUpperCase()}</span> : <GitBranch size={16} />}
    </span>
  );
}

function updateProjectCanvas(project: BranchingProject, nodes: StoryCanvasNode[]): BranchingProject {
  return {
    ...project,
    canvas: {
      ...project.canvas,
      nodes: Object.fromEntries(
        nodes.map((node) => [
          node.id,
          {
            ...project.canvas?.nodes?.[node.id],
            position: node.position,
          },
        ]),
      ),
    },
  };
}

function activeSequenceId(project: BranchingProject) {
  const preferred = project.canvas?.activeSequenceId ?? project.entrySequenceId ?? project.sequences[0]?.id;
  return project.sequences.some((sequence) => sequence.id === preferred) ? preferred : project.sequences[0]?.id;
}

function canonDisplay(project: BranchingProject, id: string) {
  const ref = project.canonRefs.find((canonRef) => canonRef.id === id);
  return ref ? `${ref.kind ?? "canon"} - ${ref.id}` : id;
}

function findSequence(project: BranchingProject, id: string): Sequence | undefined {
  return project.sequences.find((sequence) => sequence.id === id);
}

function findEvent(project: BranchingProject, id: string): EventNode | undefined {
  return project.events.find((event) => event.id === id);
}

function findBranch(project: BranchingProject, id: string): Branch | undefined {
  return project.branches.find((branch) => branch.id === id);
}

function eventIdFromSelection(project: BranchingProject, nodes: StoryCanvasNode[], selection?: Selection): string | undefined {
  if (!selection) return undefined;
  if (selection.type === "node") {
    if (findEvent(project, selection.id)) return selection.id;
    const selectedNode = nodes.find((node) => node.id === selection.id);
    const detailEventId = selectedNode?.data.details?.eventId;
    return typeof detailEventId === "string" && findEvent(project, detailEventId) ? detailEventId : undefined;
  }
  if (selection.type === "file" && selection.id.startsWith("file:event:")) {
    const eventId = selection.id.slice("file:event:".length);
    return findEvent(project, eventId) ? eventId : undefined;
  }
  return undefined;
}

function storyExplorerSelectionId(project: BranchingProject, selection?: Selection) {
  if (selection?.type === "file") return selection.id;
  if (selection?.type === "dataObject") return `file:data-object:${selection.id}`;
  if (selection?.type === "node") {
    if (project.sequences.some((sequence) => sequence.id === selection.id)) return `file:sequence:${selection.id}`;
    if (project.branches.some((branch) => branch.id === selection.id)) return `file:branch:${selection.id}`;
    if (project.events.some((event) => event.id === selection.id)) return `file:event:${selection.id}`;
  }
  return `file:sequence:${activeSequenceId(project) ?? ""}`;
}

function slugify(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function uniqueId(base: string, existingIds: Iterable<string>) {
  const existing = new Set(existingIds);
  if (!existing.has(base)) {
    return base;
  }

  let index = 2;
  while (existing.has(`${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}

function withoutValue(values: string[] | undefined, value: string) {
  return (values ?? []).filter((item) => item !== value);
}

function withValue(values: string[] | undefined, value: string) {
  return Array.from(new Set([...(values ?? []), value]));
}

function nodeStoryId(node: StoryCanvasNode | undefined) {
  return typeof node?.data.storyObjectId === "string" ? node.data.storyObjectId : node?.id;
}

function ownerEventIdForNode(node: StoryCanvasNode | undefined) {
  if (!node) {
    return undefined;
  }
  if (node.data.kind === "event") {
    return nodeStoryId(node);
  }
  return typeof node.data.details?.eventId === "string" ? node.data.details.eventId : undefined;
}

function transitionFrom(sourceId: string, targetId: string, existing: Transition[] | undefined) {
  const count = (existing ?? []).filter((transition) => transition.to === targetId).length + 1;
  return uniqueId(`transition:${sourceId}:${targetId}:${count}`, (existing ?? []).map((transition) => transition.id));
}

function isPointInside(node: StoryCanvasNode, x: number, y: number) {
  const width = Number(node.width ?? node.measured?.width ?? node.style?.width ?? 0);
  const height = Number(node.height ?? node.measured?.height ?? node.style?.height ?? 0);
  return x >= node.position.x && x <= node.position.x + width && y >= node.position.y && y <= node.position.y + height;
}

function canvasGraph(
  nodes: StoryCanvasNode[],
  edges: StoryCanvasEdge[],
  mode: CanvasMode,
  focusNodeId: string | undefined,
) {
  if (mode === "branching") {
    const visibleKinds = new Set<StoryCanvasNodeData["kind"]>(["sequence", "start", "branch", "event"]);
    const visibleEdgeKinds = new Set<StoryCanvasEdgeData["kind"]>(["entry", "transition"]);
    const visibleNodes = nodes.filter((node) => visibleKinds.has(node.data.kind));
    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    return {
      nodes: visibleNodes,
      edges: edges.filter((edgeItem) => {
        const kind = edgeItem.data?.kind;
        return Boolean(kind && visibleEdgeKinds.has(kind) && visibleIds.has(edgeItem.source) && visibleIds.has(edgeItem.target));
      }),
    };
  }

  if (!focusNodeId || !nodes.some((node) => node.id === focusNodeId)) {
    return { nodes, edges };
  }

  const adjacentIds = new Set<string>();
  edges.forEach((edgeItem) => {
    if (edgeItem.source === focusNodeId) adjacentIds.add(edgeItem.target);
    if (edgeItem.target === focusNodeId) adjacentIds.add(edgeItem.source);
  });

  return {
    nodes: nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        focusState: node.id === focusNodeId ? "focused" : adjacentIds.has(node.id) ? "adjacent" : "dimmed",
      },
    })),
    edges: edges.map((edgeItem) => {
      const direct = edgeItem.source === focusNodeId || edgeItem.target === focusNodeId;
      return {
        ...edgeItem,
        animated: direct || edgeItem.animated,
        style: {
          ...edgeItem.style,
          opacity: direct ? 1 : 0.22,
        },
      };
    }),
  };
}

function groupDataObjects(project: BranchingProject) {
  return (project.projectDataObjects ?? []).reduce<Record<string, ProjectDataObject[]>>((groups, dataObject) => {
    groups[dataObject.classId] ??= [];
    groups[dataObject.classId].push(dataObject);
    return groups;
  }, {});
}

function fieldSummary(value: unknown) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

function coerceDataFieldValue(type: string, value: string) {
  if (type === "number") {
    const numberValue = Number(value);
    return Number.isNaN(numberValue) ? value : numberValue;
  }
  if (type === "boolean") {
    return value === "true";
  }
  if (type === "multiSelect" || type === "canonRefList" || type === "dataRefList") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value;
}

function conditionSummary(input: ConditionInput | undefined) {
  const labels = conditionLabels(input);
  if (labels.length === 0) {
    return "No conditions.";
  }
  return labels.join(", ");
}

function consequenceSummary(consequences: Consequence[] | undefined) {
  if (!consequences?.length) {
    return "No consequences.";
  }
  return consequences.map(consequenceLabel).join(", ");
}

function LogicSection({
  title,
  availability,
  consequences,
  ruleSets,
}: {
  title?: string;
  availability?: ConditionInput;
  consequences?: Consequence[];
  ruleSets?: RuleSet[];
}) {
  const availabilityCount = conditionCount(availability);

  return (
    <section className="inspector-section">
      <h2>{title ?? "Logic"}</h2>
      <div className="logic-grid">
        <div className="mini-card">
          <strong>Conditions</strong>
          <span>{availabilityCount > 0 ? conditionSummary(availability) : "Always available."}</span>
        </div>
        <div className="mini-card">
          <strong>Consequences</strong>
          <span>{consequenceSummary(consequences)}</span>
        </div>
        <div className="mini-card">
          <strong>RuleSets</strong>
          <span>{ruleSets?.length ? `${ruleSets.length} if/then/else rule(s)` : "No advanced rules."}</span>
        </div>
      </div>
      {ruleSets?.length ? (
        <div className="stack-list">
          {ruleSets.map((ruleSet) => (
            <div className="mini-card" key={ruleSet.id}>
              <strong>{ruleSet.label ?? ruleSet.id}</strong>
              <span>when: {conditionSummary(ruleSet.when)}</span>
              <span>then: {consequenceSummary(ruleSet.then)}</span>
              {ruleSet.else?.length ? <span>else: {consequenceSummary(ruleSet.else)}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function firstSimpleCondition(input: ConditionInput | undefined): Record<string, unknown> | undefined {
  if (!input) {
    return undefined;
  }
  const expression = Array.isArray(input) ? input[0] : input;
  if ("all" in expression || "any" in expression || "not" in expression) {
    return undefined;
  }
  return expression;
}

function conditionInputKind(input: ConditionInput | undefined) {
  if (!input) {
    return "none";
  }
  const expression = Array.isArray(input) ? input[0] : input;
  if ("all" in expression) {
    return "all";
  }
  if ("any" in expression) {
    return "any";
  }
  if ("not" in expression) {
    return "not";
  }
  return typeof expression.type === "string" ? expression.type : "none";
}

function defaultCanonCondition(canonRefs: string[]) {
  return { type: "canonEntryUnlocked" as const, ref: canonRefs[0] ?? "" };
}

function BasicConditionEditor({
  label = "Availability",
  value,
  canonRefs,
  dataObjects,
  onChange,
}: {
  label?: string;
  value?: ConditionInput;
  canonRefs: string[];
  dataObjects: ProjectDataObject[];
  onChange: (value: ConditionInput | undefined) => void;
}) {
  const condition = firstSimpleCondition(value);
  const type = conditionInputKind(value);

  return (
    <section className="inspector-section">
      <h2>{label}</h2>
      <label className="field-label">
        Condition Type
        <select
          value={type}
          onChange={(event) => {
            const nextType = event.target.value;
            if (nextType === "none") {
              onChange(undefined);
            } else if (nextType === "canonEntryUnlocked") {
              onChange({ type: "canonEntryUnlocked", ref: canonRefs[0] ?? "" });
            } else if (nextType === "variable") {
              onChange({ type: "variable", name: "flag", operator: "==", value: true });
            } else if (nextType === "dataObjectExists") {
              onChange({ type: "dataObjectExists", objectId: dataObjects[0]?.id ?? "" });
            } else if (nextType === "visited") {
              onChange({ type: "visited", targetType: "event", targetId: "" });
            } else if (nextType === "all") {
              onChange({ all: [defaultCanonCondition(canonRefs)] });
            } else if (nextType === "any") {
              onChange({ any: [defaultCanonCondition(canonRefs)] });
            } else if (nextType === "not") {
              onChange({ not: defaultCanonCondition(canonRefs) });
            }
          }}
        >
          <option value="none">always available</option>
          <option value="canonEntryUnlocked">canon unlocked</option>
          <option value="variable">variable check</option>
          <option value="dataObjectExists">data object exists</option>
          <option value="visited">visited target</option>
          <option value="all">all condition set</option>
          <option value="any">any condition set</option>
          <option value="not">not condition set</option>
        </select>
      </label>

      {type === "all" || type === "any" || type === "not" ? (
        <div className="mini-card">
          <strong>{type.toUpperCase()}</strong>
          <span>Initial structured condition set. Add detailed nested logic in the RuleSet builder as it grows.</span>
          <button
            type="button"
            onClick={() => {
              if (type === "all") {
                onChange({ all: [defaultCanonCondition(canonRefs)] });
              } else if (type === "any") {
                onChange({ any: [defaultCanonCondition(canonRefs)] });
              } else {
                onChange({ not: defaultCanonCondition(canonRefs) });
              }
            }}
          >
            Seed with canon condition
          </button>
        </div>
      ) : null}

      {type === "canonEntryUnlocked" ? (
        <label className="field-label">
          Canon Ref
          <select
            value={String(condition?.ref ?? "")}
            onChange={(event) => onChange({ type: "canonEntryUnlocked", ref: event.target.value })}
          >
            <option value="">missing ref</option>
            {canonRefs.map((ref) => (
              <option key={ref} value={ref}>
                {ref}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {type === "variable" ? (
        <div className="logic-grid">
          <label className="field-label">
            Variable
            <input
              value={String(condition?.name ?? "")}
              onChange={(event) =>
                onChange({ type: "variable", name: event.target.value, operator: "==", value: condition?.value ?? true })
              }
            />
          </label>
          <label className="field-label">
            Value
            <input
              value={String(condition?.value ?? "")}
              onChange={(event) =>
                onChange({ type: "variable", name: String(condition?.name ?? "flag"), operator: "==", value: event.target.value })
              }
            />
          </label>
        </div>
      ) : null}

      {type === "dataObjectExists" ? (
        <label className="field-label">
          Data Object
          <select
            value={String(condition?.objectId ?? "")}
            onChange={(event) => onChange({ type: "dataObjectExists", objectId: event.target.value })}
          >
            <option value="">missing object</option>
            {dataObjects.map((dataObject) => (
              <option key={dataObject.id} value={dataObject.id}>
                {dataObject.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {type === "visited" ? (
        <div className="logic-grid">
          <label className="field-label">
            Target Type
            <select
              value={String(condition?.targetType ?? "event")}
              onChange={(event) =>
                onChange({ type: "visited", targetType: event.target.value as "sequence" | "branch" | "event" | "decision" | "outcome", targetId: String(condition?.targetId ?? "") })
              }
            >
              <option value="sequence">sequence</option>
              <option value="branch">branch</option>
              <option value="event">event</option>
              <option value="decision">decision</option>
              <option value="outcome">outcome</option>
            </select>
          </label>
          <label className="field-label">
            Target ID
            <input
              value={String(condition?.targetId ?? "")}
              onChange={(event) =>
                onChange({ type: "visited", targetType: (condition?.targetType as "sequence" | "branch" | "event" | "decision" | "outcome") ?? "event", targetId: event.target.value })
              }
            />
          </label>
        </div>
      ) : null}
    </section>
  );
}

function ConsequenceEditor({
  title = "Consequences",
  value,
  canonRefs,
  dataObjects,
  onChange,
}: {
  title?: string;
  value?: Consequence[];
  canonRefs: string[];
  dataObjects: ProjectDataObject[];
  onChange: (value: Consequence[] | undefined) => void;
}) {
  const consequences = value ?? [];
  const update = (index: number, consequence: Consequence) => {
    onChange(consequences.map((item, itemIndex) => (itemIndex === index ? consequence : item)));
  };

  return (
    <section className="inspector-section">
      <h2>{title}</h2>
      <div className="stack-list">
        {consequences.map((consequence, index) => (
          <div className="mini-card" key={`${consequence.type}:${index}`}>
            <label className="field-label">
              Type
              <select
                value={consequence.type}
                onChange={(event) => {
                  const nextType = event.target.value;
                  if (nextType === "unlockCanonEntry") {
                    update(index, { type: "unlockCanonEntry", ref: canonRefs[0] ?? "" });
                  } else if (nextType === "unlockDataObject") {
                    update(index, { type: "unlockDataObject", objectId: dataObjects[0]?.id ?? "" });
                  } else if (nextType === "setVariable") {
                    update(index, { type: "setVariable", name: "flag", value: true });
                  } else {
                    update(index, { type: "engineSignal", name: "signal" });
                  }
                }}
              >
                <option value="unlockCanonEntry">unlock canon</option>
                <option value="unlockDataObject">unlock data</option>
                <option value="setVariable">set variable</option>
                <option value="engineSignal">engine signal</option>
              </select>
            </label>
            {consequence.type === "unlockCanonEntry" ? (
              <label className="field-label">
                Canon Ref
                <select value={String(consequence.ref ?? "")} onChange={(event) => update(index, { ...consequence, ref: event.target.value })}>
                  <option value="">missing ref</option>
                  {canonRefs.map((ref) => (
                    <option key={ref} value={ref}>
                      {ref}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {consequence.type === "unlockDataObject" ? (
              <label className="field-label">
                Data Object
                <select value={String(consequence.objectId ?? "")} onChange={(event) => update(index, { ...consequence, objectId: event.target.value })}>
                  <option value="">missing object</option>
                  {dataObjects.map((dataObject) => (
                    <option key={dataObject.id} value={dataObject.id}>
                      {dataObject.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {consequence.type === "setVariable" ? (
              <div className="logic-grid">
                <label className="field-label">
                  Variable
                  <input value={String(consequence.name ?? "")} onChange={(event) => update(index, { ...consequence, name: event.target.value })} />
                </label>
                <label className="field-label">
                  Value
                  <input value={String(consequence.value ?? "")} onChange={(event) => update(index, { ...consequence, value: event.target.value })} />
                </label>
              </div>
            ) : null}
            {consequence.type === "engineSignal" ? (
              <label className="field-label">
                Signal
                <input value={String(consequence.name ?? "")} onChange={(event) => update(index, { ...consequence, name: event.target.value })} />
              </label>
            ) : null}
            <button type="button" className="danger" onClick={() => onChange(consequences.filter((_, itemIndex) => itemIndex !== index))}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="inspector-actions">
        <button type="button" onClick={() => onChange([...consequences, { type: "unlockCanonEntry", ref: canonRefs[0] ?? "" }])}>
          Add Consequence
        </button>
      </div>
    </section>
  );
}

function RuleSetEditor({
  value,
  canonRefs,
  dataObjects,
  onChange,
}: {
  value?: RuleSet[];
  canonRefs: string[];
  dataObjects: ProjectDataObject[];
  onChange: (value: RuleSet[] | undefined) => void;
}) {
  const ruleSets = value ?? [];
  const update = (index: number, ruleSet: RuleSet) => {
    onChange(ruleSets.map((item, itemIndex) => (itemIndex === index ? ruleSet : item)));
  };

  return (
    <section className="inspector-section">
      <h2>RuleSets</h2>
      <div className="stack-list">
        {ruleSets.map((ruleSet, index) => (
          <div className="mini-card" key={ruleSet.id}>
            <label className="field-label">
              Label
              <input value={ruleSet.label ?? ruleSet.id} onChange={(event) => update(index, { ...ruleSet, label: event.target.value })} />
            </label>
            <BasicConditionEditor
              label="When"
              value={ruleSet.when}
              canonRefs={canonRefs}
              dataObjects={dataObjects}
              onChange={(when) => update(index, { ...ruleSet, when: when ?? { all: [] } })}
            />
            <ConsequenceEditor
              title="Then"
              value={ruleSet.then}
              canonRefs={canonRefs}
              dataObjects={dataObjects}
              onChange={(then) => update(index, { ...ruleSet, then: then ?? [] })}
            />
            <ConsequenceEditor
              title="Else"
              value={ruleSet.else}
              canonRefs={canonRefs}
              dataObjects={dataObjects}
              onChange={(elseConsequences) => update(index, { ...ruleSet, else: elseConsequences })}
            />
            <button type="button" className="danger" onClick={() => onChange(ruleSets.filter((_, itemIndex) => itemIndex !== index))}>
              Remove RuleSet
            </button>
          </div>
        ))}
        {ruleSets.length === 0 ? <span className="empty-line">No rule sets yet.</span> : null}
      </div>
      <div className="inspector-actions">
        <button
          type="button"
          onClick={() =>
            onChange([
              ...ruleSets,
              {
                id: `rule:${ruleSets.length + 1}`,
                label: "New Rule",
                when: { type: "canonEntryUnlocked", ref: canonRefs[0] ?? "" },
                then: [],
              },
            ])
          }
        >
          Add RuleSet
        </button>
      </div>
    </section>
  );
}

function CanonRefsPicker({
  title = "Canon Refs",
  value,
  canonRefs,
  onChange,
}: {
  title?: string;
  value?: string[];
  canonRefs: CanonRef[];
  onChange: (value: string[] | undefined) => void;
}) {
  const [query, setQuery] = useState("");
  const refs = value ?? [];
  const refSet = new Set(refs);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = normalizedQuery
    ? canonRefs
        .filter((ref) =>
          [ref.id, ref.label, ref.kind, ref.canonSourcePath]
            .filter(Boolean)
            .some((candidate) => String(candidate).toLowerCase().includes(normalizedQuery)),
        )
        .slice(0, 24)
    : [];
  const addRef = (id: string) => {
    if (!id || refSet.has(id)) return;
    onChange([...refs, id]);
    setQuery("");
  };
  const removeRef = (id: string) => {
    const nextRefs = refs.filter((ref) => ref !== id);
    onChange(nextRefs.length ? nextRefs : undefined);
  };

  return (
    <div
      className="inspector-section canon-ref-dropzone"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/x-pathbranching-canon-ref") || event.dataTransfer.types.includes("text/plain")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(event) => {
        const id =
          event.dataTransfer.getData("application/x-pathbranching-canon-ref") ||
          event.dataTransfer.getData("text/plain");
        if (!id) return;
        event.preventDefault();
        addRef(id.trim());
      }}
    >
      <h2>{title}</h2>
      <div className="canon-ref-search">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search or drop canon ref"
          aria-label={`Search ${title}`}
        />
        {normalizedQuery ? (
          <div className="canon-ref-results">
            {matches.map((ref) => (
              <button key={ref.id} type="button" disabled={refSet.has(ref.id)} onClick={() => addRef(ref.id)}>
                <strong>{ref.label ?? ref.id}</strong>
                <span>{ref.kind ?? "canon"}</span>
              </button>
            ))}
            {matches.length === 0 ? <span className="empty-line">No canon refs found.</span> : null}
          </div>
        ) : null}
      </div>
      <div className="tag-list canon-ref-chips">
        {refs.map((ref) => (
          <button key={ref} type="button" onClick={() => removeRef(ref)} title="Remove canon ref">
            {canonRefs.find((canonRef) => canonRef.id === ref)?.label ?? ref}
          </button>
        ))}
        {refs.length === 0 ? <span className="empty-line">Drop canon refs here or search to add them.</span> : null}
      </div>
    </div>
  );
}

function Topbar({
  project,
  fileState,
  findings,
  exportOpen,
  dataOpen,
  theme,
  onOpenSettings,
  onToggleTheme,
  onOpenProject,
  onSaveProject,
  onSaveProjectAs,
  onExportRuntime,
  onHome,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onCreateSequence,
  onValidate,
  onToggleExport,
  onToggleData,
  onCreateDataObject,
  onResetLayout,
}: {
  project?: BranchingProject;
  fileState?: ProjectFileState;
  findings: ValidationFinding[];
  exportOpen: boolean;
  dataOpen: boolean;
  theme: ThemeId;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
  onOpenProject: () => void;
  onSaveProject: () => void;
  onSaveProjectAs: () => void;
  onExportRuntime: () => void;
  onHome: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onCreateSequence: () => void;
  onValidate: () => void;
  onToggleExport: () => void;
  onToggleData: () => void;
  onCreateDataObject: () => void;
  onResetLayout: () => void;
}) {
  const errorCount = findings.filter((finding) => finding.severity === "error").length;
  const status = findings.length === 0 ? "Clean" : `${findings.length} findings`;
  const universeName = universeDisplayName(project, fileState);
  const universePath = universeDisplayPath(fileState);

  return (
    <header className="topbar dock-top-bar pathbranching-topbar" aria-label="Workspace controls">
      <div className="dock-top-left">
        <div className="forge-corner-menu">
          <button type="button" className="forge-corner-button" title="Everend Forge">
            <Crown size={16} />
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
      </div>

      <div className="dock-top-right">
        <div className="dock-command-group" aria-label="Universe">
          <button type="button" title="Open universe" onClick={onOpenProject}>
            <FolderOpen size={14} />
            <span>Open</span>
          </button>
          <button type="button" title="Save branching story" onClick={onSaveProject}>
            <Save size={14} />
            <span>Save</span>
          </button>
          <button type="button" title="Export current preview" onClick={onExportRuntime}>
            <Download size={14} />
            <span>Export</span>
          </button>
        </div>

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

        <div className="dock-command-group" aria-label="Authoring">
          <button type="button" title="New sequence" onClick={onCreateSequence}>
            <FilePlus2 size={14} />
            <span>Sequence</span>
          </button>
          <button type="button" title="Validate project" onClick={onValidate}>
            <SearchCheck size={14} />
            <span>Validate</span>
          </button>
        </div>

        <div className="dock-command-group" aria-label="Panels">
          <button type="button" title="Toggle runtime export preview" className={exportOpen ? "active" : ""} onClick={onToggleExport}>
            <Download size={14} />
            <span>Export View</span>
          </button>
          <button type="button" title="Toggle project data drawer" className={dataOpen ? "active" : ""} onClick={onToggleData}>
            <Database size={14} />
            <span>Data</span>
          </button>
          <button type="button" title="Create knowledge data object" onClick={onCreateDataObject}>
            <FilePlus2 size={14} />
            <span>Knowledge</span>
          </button>
          <button type="button" title="Reset canvas layout" onClick={onResetLayout}>
            <RotateCcw size={14} />
            <span>Layout</span>
          </button>
        </div>

        <span className={`pathbranching-status ${errorCount > 0 ? "has-errors" : ""}`} title={status}>
          {status}
          {errorCount > 0 ? ` (${errorCount})` : ""}
        </span>

        <button type="button" className="dock-icon-button" onClick={onToggleTheme} title={`Toggle theme (${themeById(theme).label})`}>
          {isDarkTheme(theme) ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
}

function HomeDashboard({
  project,
  fileState,
  settings,
  missingRecentProjects,
  findings,
  theme,
  onOpenSettings,
  onToggleTheme,
  onEnterWorkspace,
  onOpenProject,
  onOpenRecentProject,
  onRemoveRecentProject,
  onSaveProject,
  onSaveProjectAs,
  onExportRuntime,
}: {
  project?: BranchingProject;
  fileState: ProjectFileState;
  settings: AppSettings;
  missingRecentProjects: Set<string>;
  findings: ValidationFinding[];
  theme: ThemeId;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
  onEnterWorkspace: () => void;
  onOpenProject: () => void;
  onOpenRecentProject: (path: string) => void;
  onRemoveRecentProject: (path: string) => void;
  onSaveProject: () => void;
  onSaveProjectAs: () => void;
  onExportRuntime: () => void;
}) {
  const errorCount = findings.filter((finding) => finding.severity === "error").length;
  const warningCount = findings.filter((finding) => finding.severity === "warning").length;
  const activeSequence =
    project?.sequences.find((sequence) => sequence.id === activeSequenceId(project)) ?? project?.sequences[0];

  return (
    <main className="home-shell">
      <header className="home-topbar">
        <div className="brand">
          <GitBranch size={22} />
          <div>
            <h1>PathBranching</h1>
            <p>Story-flow authoring workspace</p>
          </div>
        </div>
        <div className="home-topbar-actions">
          <button type="button" className="dock-icon-button" onClick={onOpenSettings} title="PathBranching settings">
            <Settings size={15} />
          </button>
          <button type="button" className="dock-icon-button" onClick={onToggleTheme} title={`Toggle theme (${themeById(theme).label})`}>
            {isDarkTheme(theme) ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      <section className="home-panel">
        <div className="home-hero">
          <div className="home-copy">
            <p className="eyebrow">Dashboard</p>
            <h2>Open a universe</h2>
            <p>
              PathBranching reads the same universe folder as WorldNotion, previews its Markdown canon, and stores branching
              stories in `.everend/.pathbranching`.
            </p>
          </div>

          {project ? (
            <button type="button" className="active-project-card" onClick={onEnterWorkspace}>
              <span className="recent-icon">
                <GitBranch size={17} />
              </span>
              <span>
                <strong>{project.name ?? project.projectId}</strong>
                <small>{projectFileName(fileState.universePath)}{fileState.dirty ? " - unsaved changes" : ""}</small>
              </span>
              <Home size={16} />
            </button>
          ) : null}
        </div>

        <div className="home-actions">
          <button type="button" className="primary-action" onClick={onOpenProject}>
            <FolderOpen size={16} />
            Open Universe
          </button>
          <button type="button" onClick={onEnterWorkspace} disabled={!project}>
            <GitBranch size={16} />
            Workspace
          </button>
          <button type="button" onClick={onSaveProject} disabled={!project}>
            <Save size={16} />
            Save
          </button>
          <button type="button" onClick={onSaveProjectAs} disabled={!project}>
            <Save size={16} />
            Save Into Universe
          </button>
          <button type="button" onClick={onExportRuntime} disabled={!project}>
            <Download size={16} />
            Export Runtime
          </button>
        </div>

        <div className="home-metrics">
          <div>
            <strong>{project?.sequences.length ?? 0}</strong>
            <span>Sequences</span>
          </div>
          <div>
            <strong>{project?.branches.length ?? 0}</strong>
            <span>Branches</span>
          </div>
          <div>
            <strong>{project?.events.length ?? 0}</strong>
            <span>Events</span>
          </div>
          <div>
            <strong>{project?.projectDataObjects?.length ?? 0}</strong>
            <span>Data objects</span>
          </div>
          <div>
            <strong>{activeSequence?.name ?? "None"}</strong>
            <span>Active sequence</span>
          </div>
          <div>
            <strong>{findings.length ? `${errorCount}/${warningCount}` : "Clean"}</strong>
            <span>Errors / warnings</span>
          </div>
        </div>

        {findings.length ? (
          <section className="dashboard-findings">
            <h3>Validation</h3>
            <div className="stack-list">
              {findings.slice(0, 5).map((finding) => (
                <div className={`finding ${finding.severity}`} key={`${finding.code}:${finding.id ?? ""}:${finding.ref ?? ""}`}>
                  <strong>{finding.code}</strong>
                  <span>{finding.message}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {settings.recentProjects.length ? (
          <section className="recent-section">
            <h3>Recent universes</h3>
            <div className="recent-list">
              {settings.recentProjects.map((path, itemIndex) => (
                <button
                  key={path}
                  type="button"
                  className={missingRecentProjects.has(path) ? "missing" : ""}
                  style={{ animationDelay: `${120 + itemIndex * 45}ms` }}
                  onClick={() => missingRecentProjects.has(path) ? onRemoveRecentProject(path) : onOpenRecentProject(path)}
                >
                  <span className="recent-icon">
                    <GitBranch size={16} />
                  </span>
                  <span>
                    <strong>{projectFileName(path)}</strong>
                    <small>{missingRecentProjects.has(path) ? "Missing folder - click to remove" : path}</small>
                  </span>
                  {missingRecentProjects.has(path) ? <span>x</span> : <FolderOpen size={14} />}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function DiscardChangesDialog({
  open,
  onDiscard,
  onCancel,
}: {
  open: boolean;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <section className="modal-dialog">
        <h2>Unsaved changes</h2>
        <p>This project has unsaved changes. Discard them and continue?</p>
        <div className="inspector-actions">
          <button type="button" className="danger" onClick={onDiscard}>
            Discard
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

type PathBranchingSettingsSection = "overview" | "authoring" | "markdown" | "workspace" | "recents";

function EventCategoriesSettings({
  categories,
  usedCategoryIds,
  onChange,
}: {
  categories: EventCategoryDefinition[];
  usedCategoryIds: Set<string>;
  onChange: (categories: EventCategoryDefinition[]) => void;
}) {
  const fixedCategoryIds = new Set(["normal", "final"]);
  const updateCategory = (id: string, updates: Partial<EventCategoryDefinition>) => {
    onChange(
      categories.map((category) =>
        category.id === id
          ? {
              ...category,
              ...updates,
              terminal: category.id === "final" ? true : category.id === "normal" ? false : updates.terminal ?? category.terminal,
            }
          : category,
      ),
    );
  };
  const addCategory = () => {
    const id = uniqueId("custom", categories.map((category) => category.id));
    onChange([...categories, { id, label: "Custom" }]);
  };
  const deleteCategory = (id: string) => {
    if (fixedCategoryIds.has(id) || usedCategoryIds.has(id)) return;
    onChange(categories.filter((category) => category.id !== id));
  };

  return (
    <section className="settings-subsection">
      <div className="settings-page-title compact">
        <h3>Event categories</h3>
        <p>Project-level categories used by event nodes. Terminal categories cannot create outgoing transitions.</p>
      </div>
      <div className="settings-category-list">
        {categories.map((category) => {
          const isFixed = fixedCategoryIds.has(category.id);
          const isUsed = usedCategoryIds.has(category.id);
          return (
            <div className="mini-card category-editor" key={category.id}>
              <label className="field-label">
                Label
                <input value={category.label} onChange={(event) => updateCategory(category.id, { label: event.target.value })} />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={Boolean(category.terminal)}
                  disabled={category.id === "final" || category.id === "normal"}
                  onChange={(event) => updateCategory(category.id, { terminal: event.target.checked })}
                />
                Terminal
              </label>
              <span>{category.id}{isUsed ? " - in use" : ""}</span>
              <button
                type="button"
                className="danger"
                disabled={isFixed || isUsed}
                title={isFixed ? "Default categories cannot be deleted." : isUsed ? "Category is used by one or more events." : "Delete category"}
                onClick={() => deleteCategory(category.id)}
              >
                Delete
              </button>
            </div>
          );
        })}
      </div>
      <div className="inspector-actions">
        <button type="button" onClick={addCategory}>
          Add Category
        </button>
      </div>
    </section>
  );
}

function PathBranchingSettingsModal({
  project,
  fileState,
  settings,
  findings,
  theme,
  onUpdateEventCategories,
  onThemeChange,
  onToggleTheme,
  onOpenUniverse,
  onOpenRecentUniverse,
  onRemoveRecentUniverse,
  onClose,
}: {
  project?: BranchingProject;
  fileState: ProjectFileState;
  settings: AppSettings;
  findings: ValidationFinding[];
  theme: ThemeId;
  onUpdateEventCategories: (categories: EventCategoryDefinition[]) => void;
  onThemeChange: (theme: ThemeId) => void;
  onToggleTheme: () => void;
  onOpenUniverse: () => void;
  onOpenRecentUniverse: (path: string) => void;
  onRemoveRecentUniverse: (path: string) => void;
  onClose: () => void;
}) {
  const [activeSection, setActiveSection] = useState<PathBranchingSettingsSection>(project ? "overview" : "workspace");
  const errorCount = findings.filter((finding) => finding.severity === "error").length;
  const warningCount = findings.filter((finding) => finding.severity === "warning").length;
  const universeName = universeDisplayName(project, fileState);
  const universePath = universeDisplayPath(fileState);

  return (
    <div className="settings-backdrop" role="dialog" aria-modal="true" aria-label="PathBranching settings">
      <div className="settings-modal pathbranching-settings-modal">
        <header className="settings-header">
          <div>
            <p className="eyebrow">{project ? "Universe settings" : "Application settings"}</p>
            <h2>{project ? universeName : "PathBranching"}</h2>
          </div>
          <button type="button" onClick={onClose} title="Close settings">
            <X size={16} />
          </button>
        </header>

        <div className="settings-body">
          <nav className="settings-nav">
            <div className="settings-nav-group">
              <p>Universe</p>
              <button className={activeSection === "overview" ? "active" : ""} onClick={() => setActiveSection("overview")} type="button">
                <Settings size={14} />
                Overview
              </button>
              <button className={activeSection === "authoring" ? "active" : ""} onClick={() => setActiveSection("authoring")} type="button">
                <GitBranch size={14} />
                Branching
              </button>
              <button className={activeSection === "markdown" ? "active" : ""} onClick={() => setActiveSection("markdown")} type="button">
                <FilePlus2 size={14} />
                Markdown
              </button>
            </div>

            <div className="settings-nav-group app-settings-group">
              <p>Application</p>
              <button className={activeSection === "workspace" ? "active" : ""} onClick={() => setActiveSection("workspace")} type="button">
                <Home size={14} />
                Workspace
              </button>
              <button className={activeSection === "recents" ? "active" : ""} onClick={() => setActiveSection("recents")} type="button">
                <FolderOpen size={14} />
                Recents
              </button>
            </div>
          </nav>

          <section className="settings-section">
            {activeSection === "overview" ? (
              <div className="settings-panel">
                <div className="settings-page-title universe-profile-summary">
                  <UniverseIconFrame profile={fileState.universeProfile} size={42} />
                  <div>
                    <h3>{universeName}</h3>
                    <p>{fileState.universePath ?? "Open a universe folder to begin."}</p>
                  </div>
                </div>
                <div className="settings-grid">
                  <label>
                    <span>Universe metadata</span>
                    <input value={fileState.universeProfile ? ".everend/universe.json" : "No WorldNotion metadata found"} readOnly />
                  </label>
                  <label>
                    <span>Universe profile</span>
                    <input value={fileState.universeProfile?.name ?? "Unnamed universe"} readOnly />
                  </label>
                  <label>
                    <span>Taxonomy version</span>
                    <input value={fileState.universeProfile?.taxonomyVersion ?? "Not specified"} readOnly />
                  </label>
                </div>
                <div className="universe-stats">
                  <div>
                    <strong>{project?.sequences.length ?? 0}</strong>
                    <span>Sequences</span>
                  </div>
                  <div>
                    <strong>{project?.branches.length ?? 0}</strong>
                    <span>Branches</span>
                  </div>
                  <div>
                    <strong>{project?.events.length ?? 0}</strong>
                    <span>Events</span>
                  </div>
                  <div>
                    <strong>{errorCount}/{warningCount}</strong>
                    <span>Errors / warnings</span>
                  </div>
                </div>
                <div className="settings-action-list">
                  <button type="button" onClick={onOpenUniverse}>
                    <FolderOpen size={15} />
                    Open universe folder
                  </button>
                  <button type="button" onClick={onToggleTheme}>
                    {isDarkTheme(theme) ? <Sun size={15} /> : <Moon size={15} />}
                    Toggle {isDarkTheme(theme) ? "light" : "dark"} mode
                  </button>
                </div>
              </div>
            ) : null}

            {activeSection === "authoring" ? (
              <div className="settings-panel">
                <div className="settings-page-title">
                  <h3>Branching authoring</h3>
                  <p>{universePath || "PathBranching stores story graph data inside `.everend/.pathbranching`."}</p>
                </div>
                <div className="settings-grid">
                  <label>
                    <span>Story file</span>
                    <input value={fileState.storyPath ?? "Not created yet"} readOnly />
                  </label>
                  <label>
                    <span>Runtime validation</span>
                    <input value={findings.length ? `${findings.length} finding(s)` : "Clean"} readOnly />
                  </label>
                  <label>
                    <span>Unsaved changes</span>
                    <input value={fileState.dirty ? "Yes" : "No"} readOnly />
                  </label>
                </div>
                {project ? (
                  <EventCategoriesSettings
                    categories={project.eventCategories ?? []}
                    usedCategoryIds={new Set(project.events.map((event) => event.type))}
                    onChange={onUpdateEventCategories}
                  />
                ) : null}
              </div>
            ) : null}

            {activeSection === "markdown" ? (
              <div className="settings-panel">
                <div className="settings-page-title">
                  <h3>Markdown working copies</h3>
                  <p>Canon Markdown remains owned by WorldNotion. Editable variants are saved as working copies.</p>
                </div>
                <div className="settings-grid">
                  <label>
                    <span>Working copy folder</span>
                    <input value=".everend/.pathbranching/working-copies" readOnly />
                  </label>
                  <label>
                    <span>Supported draft formats</span>
                    <input value="Markdown, Ink Beat, GameData, Frontmatter" readOnly />
                  </label>
                  <label>
                    <span>Canon editing</span>
                    <input value="Read-only from PathBranching" readOnly />
                  </label>
                </div>
              </div>
            ) : null}

            {activeSection === "workspace" ? (
              <div className="settings-panel">
                <div className="settings-page-title">
                  <h3>Workspace</h3>
                  <p>Theme and onboarding behavior are shared with the desktop shell.</p>
                </div>
                <div className="settings-grid">
                  <label>
                    <span>Active style</span>
                    <select value={theme} onChange={(event) => onThemeChange(normalizeThemeId(event.target.value))}>
                      {THEMES.map((themeOption) => (
                        <option key={themeOption.id} value={themeOption.id}>
                          {themeOption.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Theme mode</span>
                    <button type="button" onClick={onToggleTheme}>
                      {isDarkTheme(theme) ? "Switch to light" : "Switch to dark"}
                    </button>
                  </label>
                  <label>
                    <span>Last universe</span>
                    <input value={settings.lastOpenedProject ?? "None"} readOnly />
                  </label>
                </div>
              </div>
            ) : null}

            {activeSection === "recents" ? (
              <div className="settings-panel">
                <div className="settings-page-title">
                  <h3>Recent universes</h3>
                  <p>PathBranching opens the latest valid universe automatically on startup.</p>
                </div>
                <div className="space-list">
                  {settings.recentProjects.map((path) => (
                    <button type="button" key={path} onClick={() => onOpenRecentUniverse(path)}>
                      <GitBranch size={15} />
                      <span>{path}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemoveRecentUniverse(path);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            onRemoveRecentUniverse(path);
                          }
                        }}
                      >
                        remove
                      </span>
                    </button>
                  ))}
                  {settings.recentProjects.length === 0 ? <span className="empty-line">No recent universes yet.</span> : null}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function PanelShell({
  title,
  open,
  railLabel,
  onToggle,
  resizable,
  onResize,
  onResetWidth,
  onResizeStateChange,
  children,
}: {
  title: string;
  open: boolean;
  railLabel: string;
  onToggle: () => void;
  resizable?: boolean;
  onResize?: (width: number) => void;
  onResetWidth?: () => void;
  onResizeStateChange?: (resizing: boolean) => void;
  children: ReactNode;
}) {
  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!resizable || !onResize) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = event.currentTarget.closest(".side-panel")?.getBoundingClientRect().width ?? DEFAULT_PANEL_WIDTH;
    onResizeStateChange?.(true);

    const move = (moveEvent: PointerEvent) => {
      onResize(startWidth + moveEvent.clientX - startX);
    };
    const end = () => {
      onResizeStateChange?.(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  if (!open) {
    return (
      <aside className="side-rail">
        <button type="button" title={`Open ${title}`} onClick={onToggle}>
          <span>{railLabel}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="side-panel">
      <div className="panel-title">
        <div>
          <strong>{title}</strong>
        </div>
        <button type="button" title={`Collapse ${title}`} onClick={onToggle}>
          <span aria-hidden="true">&lt;</span>
        </button>
      </div>
      {children}
      {resizable ? (
        <button
          type="button"
          className="resize-handle"
          aria-label={`Resize ${title}`}
          title={`Resize ${title}`}
          onPointerDown={startResize}
          onDoubleClick={onResetWidth}
        />
      ) : null}
    </aside>
  );
}

function CanonPanel({
  project,
  open,
  selectedId,
  onToggle,
  onResize,
  onResetWidth,
  onResizeStateChange,
  onSelect,
}: {
  project: BranchingProject;
  open: boolean;
  selectedId?: string;
  onToggle: () => void;
  onResize: (width: number) => void;
  onResetWidth: () => void;
  onResizeStateChange: (resizing: boolean) => void;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRefs = project.canonRefs.filter((ref) => {
    return canonRefMatches(ref, normalizedQuery);
  });
  const fileTree = buildCanonFileTree(filteredRefs);

  const dragProps = (ref: CanonRef) => ({
    draggable: true,
    onDragStart: (event: ReactDragEvent<HTMLButtonElement>) => {
      event.dataTransfer.setData("application/x-pathbranching-canon-ref", ref.id);
      event.dataTransfer.setData("text/plain", ref.id);
      event.dataTransfer.effectAllowed = "copy";
    },
  });

  const renderRefButton = (ref: CanonRef) => (
    <button
      className={`list-item explorer-item canon-file-item ${selectedId === ref.id ? "active" : ""}`}
      type="button"
      key={ref.id}
      {...dragProps(ref)}
      onClick={() => onSelect(ref.id)}
      title={canonRefPath(ref)}
    >
      <span className="explorer-item-title">
        <strong>
          {ref.missingIdentity ? <span className="canon-warning-mark" title={ref.identityWarning ?? "Missing canon identity"}>!</span> : null}
          {ref.label ?? pathBasename(canonRefPath(ref))}
        </strong>
        {ref.missingIdentity ? <em>no id</em> : null}
        {ref.folderDescription ? <em>folder note</em> : null}
        {ref.workingCopyPath ? <em>draft</em> : null}
      </span>
    </button>
  );

  const renderTreeNodes = (nodes: CanonTreeNode[], depth = 0): ReactNode =>
    nodes.map((node) => {
      if (node.kind === "ref" && node.ref) {
        return (
          <div className="canon-tree-row" style={{ "--depth": depth } as CSSProperties} key={node.path}>
            {renderRefButton(node.ref)}
          </div>
        );
      }

      const expanded = expandedFolders[node.path] ?? true;
      const toggleExpanded = () => setExpandedFolders((current) => ({ ...current, [node.path]: !expanded }));
      return (
        <div className="canon-tree-folder" key={node.path}>
          <button
            type="button"
            className={`canon-folder-button ${node.ref && selectedId === node.ref.id ? "active" : ""}`}
            style={{ "--depth": depth } as CSSProperties}
            {...(node.ref ? dragProps(node.ref) : {})}
            onClick={() => {
              if (node.ref) {
                onSelect(node.ref.id);
                return;
              }
              toggleExpanded();
            }}
            title={node.ref ? canonRefPath(node.ref) : node.path}
          >
            <span
              aria-hidden="true"
              onClick={(event) => {
                event.stopPropagation();
                toggleExpanded();
              }}
            >
              {expanded ? "v" : ">"}
            </span>
            <strong>{node.name}</strong>
            {node.ref?.missingIdentity ? <em>! no id</em> : null}
            {node.ref ? <em>folder note</em> : null}
            {node.ref?.workingCopyPath ? <em>draft</em> : null}
          </button>
          {expanded ? renderTreeNodes(node.children, depth + 1) : null}
        </div>
      );
    });

  return (
    <PanelShell
      title="Canon"
      open={open}
      railLabel="Canon"
      onToggle={onToggle}
      resizable
      onResize={onResize}
      onResetWidth={onResetWidth}
      onResizeStateChange={onResizeStateChange}
    >
      <div className="explorer-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search canon"
          aria-label="Search canon refs"
        />
        <span>{filteredRefs.length}/{project.canonRefs.length}</span>
      </div>
      <div className="panel-scroll">
        <section className="panel-group canon-file-tree">
          {fileTree.length ? renderTreeNodes(fileTree) : <span className="empty-line">No canon files match this search.</span>}
        </section>
      </div>
    </PanelShell>
  );
}

type StoryExplorerItem = {
  id: string;
  label: string;
  detail?: string;
  badges?: string[];
};

type StoryExplorerSection = {
  id: string;
  label: string;
  items: StoryExplorerItem[];
};

function buildStoryExplorerSections(project: BranchingProject): StoryExplorerSection[] {
  const sequenceId = activeSequenceId(project);
  const activeSequence = sequenceId ? findSequence(project, sequenceId) : undefined;
  const activeEventIds = new Set(activeSequence?.eventIds ?? []);
  const sequenceEvents = project.events.filter((event) => activeEventIds.has(event.id));
  const declaredBranchIds = new Set(activeSequence?.branchIds ?? []);
  const sequenceBranches = project.branches.filter((branch) => declaredBranchIds.has(branch.id) || branch.eventIds.some((eventId) => activeEventIds.has(eventId)));
  const activeBranchIds = new Set([...(activeSequence?.branchIds ?? []), ...sequenceBranches.map((branch) => branch.id)]);
  return [
    {
      id: "sequence",
      label: "Active Sequence",
      items: activeSequence
        ? [
            {
              id: `file:sequence:${activeSequence.id}`,
              label: activeSequence.name,
              detail: activeSequence.entryEventId ? `entry ${activeSequence.entryEventId}` : "no entry event",
              badges: [
                activeSequence.id === project.entrySequenceId ? "entry" : "",
                `${activeSequence.branchIds?.length ?? 0} branches`,
                `${activeSequence.eventIds.length} events`,
              ].filter(Boolean),
            },
          ]
        : [],
    },
    {
      id: "branches",
      label: "Branches",
      items: sequenceBranches.map((branch) => ({
        id: `file:branch:${branch.id}`,
        label: branch.title,
        detail: branch.description || branch.id,
        badges: [`${branch.eventIds.filter((eventId) => activeEventIds.has(eventId)).length} events`],
      })),
    },
    {
      id: "events",
      label: "Events",
      items: sequenceEvents.map((event) => ({
        id: `file:event:${event.id}`,
        label: event.name,
        detail: event.script?.sourcePath || event.branchRef || event.id,
        badges: [event.type, event.script ? "ink" : "", event.canonRefs?.length ? `${event.canonRefs.length} refs` : ""].filter(Boolean),
      })),
    },
    {
      id: "scripts",
      label: "Scripts",
      items: project.scripts
        .filter((script) =>
          sequenceEvents.some((event) => event.script ? event.script.id === script.id || Boolean(event.script.sourcePath && event.script.sourcePath === script.sourcePath) : false),
        )
        .map((script) => ({
          id: `file:script:${script.id}`,
          label: script.id,
          detail: script.sourcePath ?? script.entrySection ?? script.format,
          badges: [script.format],
        })),
    },
    {
      id: "data",
      label: "Data Objects",
      items: (project.projectDataObjects ?? [])
        .filter((dataObject) => {
          const scope = dataObject.scope;
          return !scope || scope.global || scope.sequenceId === activeSequence?.id || (scope.branchId ? activeBranchIds.has(scope.branchId) : false) || (scope.eventId ? activeEventIds.has(scope.eventId) : false);
        })
        .map((dataObject) => ({
          id: `file:data-object:${dataObject.id}`,
          label: dataObject.name,
          detail: dataObject.classId,
          badges: [dataObject.scope?.global ? "global" : "", dataObject.canonRefs?.length ? `${dataObject.canonRefs.length} refs` : ""].filter(Boolean),
        })),
    },
  ].filter((section) => section.items.length > 0);
}

function FilesPanel({
  project,
  files,
  open,
  selectedId,
  onToggle,
  onResize,
  onResetWidth,
  onResizeStateChange,
  onSequenceChange,
  onCreateSequence,
  onSelect,
}: {
  project: BranchingProject;
  files: PathBranchingFileItem[];
  open: boolean;
  selectedId?: string;
  onToggle: () => void;
  onResize: (width: number) => void;
  onResetWidth: () => void;
  onResizeStateChange: (resizing: boolean) => void;
  onSequenceChange: (id: string) => void;
  onCreateSequence: () => void;
  onSelect: (id: string) => void;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const currentSequenceId = activeSequenceId(project) ?? "";
  const activeSequence = currentSequenceId ? findSequence(project, currentSequenceId) : undefined;
  const sections = buildStoryExplorerSections(project);
  const totalItems = sections.reduce((total, section) => total + section.items.length, 0);

  return (
    <PanelShell
      title="Stories"
      open={open}
      railLabel="Stories"
      onToggle={onToggle}
      resizable
      onResize={onResize}
      onResetWidth={onResetWidth}
      onResizeStateChange={onResizeStateChange}
    >
      <div className="stories-sequence-toolbar">
        <label>
          <span>Sequence</span>
          <select
            value={currentSequenceId}
            onChange={(event) => {
              if (event.target.value === NEW_SEQUENCE_SELECT_VALUE) {
                onCreateSequence();
                return;
              }
              onSequenceChange(event.target.value);
            }}
            aria-label="Select active sequence"
          >
            {project.sequences.map((sequence) => (
              <option key={sequence.id} value={sequence.id}>
                {sequence.name}
              </option>
            ))}
            <option value={NEW_SEQUENCE_SELECT_VALUE}>Create new sequence...</option>
          </select>
        </label>
        <button type="button" onClick={onCreateSequence}>
          New
        </button>
        <p>
          {activeSequence ? `${activeSequence.eventIds.length} events` : "No sequence loaded"}
          {totalItems ? ` / ${totalItems} files` : ""}
        </p>
      </div>
      <div className="panel-scroll">
        {sections.map((section) => (
          <section className="panel-group" key={section.id}>
            <button
              className="explorer-section-heading"
              type="button"
              onClick={() => setCollapsedGroups((current) => ({ ...current, [section.id]: !current[section.id] }))}
            >
              <span>{collapsedGroups[section.id] ? ">" : "v"} {section.label}</span>
              <span>{section.items.length}</span>
            </button>
            {!collapsedGroups[section.id] ? (
              <div className="panel-list">
                {section.items.map((item) => (
                  <button
                    className={`list-item explorer-item ${selectedId === item.id ? "active" : ""}`}
                    type="button"
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                  >
                    <span className="explorer-item-title">
                      <strong>{item.label}</strong>
                    </span>
                    {item.detail ? <span>{item.detail}</span> : null}
                    {item.badges?.length ? (
                      <span className="explorer-meta">
                        {item.badges.map((badge) => (
                          <small key={badge}>{badge}</small>
                        ))}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ))}
        {totalItems === 0 ? <span className="empty-line">No story objects match this search.</span> : null}
      </div>
    </PanelShell>
  );
}

function DataDrawer({
  project,
  selectedId,
  onSelect,
  onClose,
}: {
  project: BranchingProject;
  selectedId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const groups = groupDataObjects(project);
  const dataObjectCount = project.projectDataObjects?.length ?? 0;

  return (
    <aside className="data-drawer">
      <div className="inspector-header">
        <div>
          <strong>Project Data</strong>
          <span>{dataObjectCount} object(s)</span>
        </div>
        <button type="button" title="Close data drawer" onClick={onClose}>
          x
        </button>
      </div>
      <div className="inspector-scroll">
        {Object.entries(groups).map(([classId, objects]) => (
          <section className="inspector-section" key={classId}>
            <h2>{project.dataClasses?.find((dataClass) => dataClass.id === classId)?.label ?? classId}</h2>
            <div className="stack-list">
              {objects.map((dataObject) => (
                <button
                  className={`list-item ${selectedId === dataObject.id ? "active" : ""}`}
                  key={dataObject.id}
                  type="button"
                  onClick={() => onSelect(dataObject.id)}
                >
                  <strong>{dataObject.name}</strong>
                  <span>{dataObject.canonRefs?.join(", ") ?? "manual project data"}</span>
                  <span>{Object.keys(dataObject.fields).length} field(s)</span>
                </button>
              ))}
            </div>
          </section>
        ))}
        {dataObjectCount === 0 ? (
          <section className="inspector-section">
            <h2>No project data yet</h2>
            <span className="empty-line">Create Knowledge entries or manual data objects from canon refs.</span>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function MarkdownEditorDock({
  tabs,
  activeTabId,
  onActivate,
  onClose,
  onChangeContent,
  onChangeFormat,
  onSave,
}: {
  tabs: MarkdownEditorTab[];
  activeTabId?: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onChangeContent: (id: string, content: string) => void;
  onChangeFormat: (id: string, format: MarkdownDraftFormat) => void;
  onSave: (id: string) => void;
}) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  if (!activeTab) return null;

  return (
    <aside className="markdown-dock" aria-label="Markdown working copy editor">
      <div className="markdown-tab-stack" role="tablist" aria-label="Open Markdown drafts">
        {tabs.map((tab, index) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab.id}
            className={tab.id === activeTab.id ? "active" : ""}
            key={tab.id}
            style={{ transform: `translateY(${index * -3}px)` }}
            onClick={() => onActivate(tab.id)}
          >
            <span>{tab.title}</span>
            {tab.dirty ? <i aria-label="unsaved changes" /> : null}
          </button>
        ))}
      </div>

      <div className="markdown-editor-panel">
        <div className="markdown-editor-header">
          <div>
            <strong>{activeTab.title}</strong>
            <span>{activeTab.workingCopyPath ?? activeTab.sourcePath ?? "new working copy"}</span>
          </div>
          <div className="markdown-editor-actions">
            <select
              value={activeTab.format}
              title="Draft format"
              onChange={(event) => onChangeFormat(activeTab.id, event.target.value as MarkdownDraftFormat)}
            >
              {Object.entries(MARKDOWN_FORMAT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button type="button" title="Save working copy" disabled={activeTab.saving} onClick={() => onSave(activeTab.id)}>
              <Save size={14} />
              <span>{activeTab.saving ? "Saving" : "Save"}</span>
            </button>
            <button type="button" title="Close tab" onClick={() => onClose(activeTab.id)}>
              x
            </button>
          </div>
        </div>

        <textarea
          spellCheck
          value={activeTab.content}
          onChange={(event) => onChangeContent(activeTab.id, event.target.value)}
        />
      </div>
    </aside>
  );
}

function EventAuthoringDock({
  project,
  nodes,
  selection,
  onSelect,
  onUpdateEvent,
  children,
}: {
  project: BranchingProject;
  nodes: StoryCanvasNode[];
  selection?: Selection;
  onSelect: (selection?: Selection) => void;
  onUpdateEvent: (id: string, updates: Partial<EventNode>) => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const currentSequence = project.sequences.find((sequence) => sequence.id === activeSequenceId(project));
  const eventIds = new Set(currentSequence?.eventIds ?? []);
  const eventTabs = project.events.filter((event) => eventIds.has(event.id));
  const selectedEventId = eventIdFromSelection(project, nodes, selection);
  const activeEvent =
    (selectedEventId ? project.events.find((event) => event.id === selectedEventId) : undefined) ??
    (currentSequence?.entryEventId ? project.events.find((event) => event.id === currentSequence.entryEventId) : undefined) ??
    eventTabs[0];

  return (
    <aside className={`event-authoring-dock ${collapsed ? "collapsed" : ""}`} aria-label="Event authoring dock">
      <div className="event-dock-tabs" role="tablist" aria-label="Sequence events">
        <button
          type="button"
          className="event-dock-toggle"
          title={collapsed ? "Open event dock" : "Collapse event dock"}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? "<" : ">"}
        </button>
        {eventTabs.map((event) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeEvent?.id === event.id}
            className={`event-tab-button ${activeEvent?.id === event.id ? "active" : ""}`}
            key={event.id}
            title={event.name}
            onClick={() => {
              setCollapsed(false);
              onSelect({ type: "node", id: event.id });
            }}
          >
            <span>{event.name}</span>
            {event.type === "final" ? <i>final</i> : null}
          </button>
        ))}
      </div>

      {!collapsed ? (
        <div className="event-dock-panels">
          <div className="event-dock-inspector">{children}</div>
          <section className="event-editor-panel" aria-label="Event text editor">
            <div className="event-editor-header">
              <div>
                <strong>{activeEvent?.name ?? "No event selected"}</strong>
                <span>{activeEvent ? `${activeEvent.type} event` : "Create or select an event to write."}</span>
              </div>
              {activeEvent ? (
                <select
                  value={activeEvent.text?.format ?? "plain"}
                  title="Story text format"
                  onChange={(event) =>
                    onUpdateEvent(activeEvent.id, {
                      text: { format: event.target.value, content: activeEvent.text?.content ?? "" },
                    })
                  }
                >
                  <option value="plain">plain</option>
                  <option value="ink">ink</option>
                  <option value="harlowe">harlowe</option>
                  <option value="sugarcube">sugarcube</option>
                </select>
              ) : null}
            </div>
            {activeEvent ? (
              <textarea
                spellCheck
                value={activeEvent.text?.content ?? ""}
                placeholder="Write the playable event text here."
                onChange={(event) =>
                  onUpdateEvent(activeEvent.id, {
                    text: { format: activeEvent.text?.format ?? "plain", content: event.target.value },
                  })
                }
              />
            ) : (
              <div className="event-editor-empty">No event available in this sequence.</div>
            )}
          </section>
        </div>
      ) : null}
    </aside>
  );
}

function Inspector({
  project,
  nodes,
  edges,
  files,
  selection,
  findings,
  exportOpen,
  exportPreviewMode,
  embedded = false,
  onExportPreviewModeChange,
  onClose,
  onUpdateSequence,
  onSetEntrySequence,
  onUpdateBranch,
  onCreateEventInBranch,
  onUpdateEvent,
  onCreateDecision,
  onUpdateDecision,
  onDeleteDecision,
  onCreateOutcome,
  onUpdateOutcome,
  onDeleteOutcome,
  onUpdateTransition,
  onDeleteTransition,
  onUpdateDataObject,
  onDeleteDataObject,
  onEditCanonRef,
  onUpdateEdgeLabel,
  onDeleteSelection,
}: {
  project: BranchingProject;
  nodes: StoryCanvasNode[];
  edges: StoryCanvasEdge[];
  files: PathBranchingFileItem[];
  selection?: Selection;
  findings: ValidationFinding[];
  exportOpen: boolean;
  exportPreviewMode: ExportPreviewMode;
  embedded?: boolean;
  onExportPreviewModeChange: (mode: ExportPreviewMode) => void;
  onClose: () => void;
  onUpdateSequence: (id: string, updates: Partial<Sequence>) => void;
  onSetEntrySequence: (id: string) => void;
  onUpdateBranch: (id: string, updates: Partial<Branch>) => void;
  onCreateEventInBranch: (branchId: string, type?: EventType) => void;
  onUpdateEvent: (id: string, updates: Partial<EventNode>) => void;
  onCreateDecision: (eventId: string) => void;
  onUpdateDecision: (eventId: string, decisionId: string, updates: Partial<Decision>) => void;
  onDeleteDecision: (eventId: string, decisionId: string) => void;
  onCreateOutcome: (eventId: string, decisionId: string) => void;
  onUpdateOutcome: (eventId: string, decisionId: string, outcomeId: string, updates: Partial<Outcome>) => void;
  onDeleteOutcome: (eventId: string, decisionId: string, outcomeId: string) => void;
  onUpdateTransition: (transitionId: string, updates: Partial<Transition>) => void;
  onDeleteTransition: (transitionId: string) => void;
  onUpdateDataObject: (id: string, updates: Partial<ProjectDataObject>) => void;
  onDeleteDataObject: (id: string) => void;
  onEditCanonRef: (ref: CanonRef) => void;
  onUpdateEdgeLabel: (edgeId: string, label: string) => void;
  onDeleteSelection: (selection: Selection) => void;
}) {
  const runtimePackage = useMemo(() => exportRuntimePackage(project), [project]);
  const inkExport = useMemo(() => exportInkProject(project), [project]);
  const gameDataExport = useMemo(() => exportSinpoGameData(project), [project]);
  const exportPreview =
    exportPreviewMode === "ink"
      ? inkExport.files.map((file) => `// ${file.path}\n${file.content}`).join("\n\n")
      : JSON.stringify(exportPreviewMode === "gameData" ? gameDataExport : runtimePackage, null, 2);
  const selectedNode = selection?.type === "node" ? nodes.find((node) => node.id === selection.id) : undefined;
  const selectedEdge = selection?.type === "edge" ? edges.find((edgeItem) => edgeItem.id === selection.id) : undefined;
  const selectedCanon =
    selection?.type === "canon" ? project.canonRefs.find((canonRef) => canonRef.id === selection.id) : undefined;
  const selectedFile = selection?.type === "file" ? files.find((file) => file.id === selection.id) : undefined;
  const selectedDataObject =
    selection?.type === "dataObject"
      ? project.projectDataObjects?.find((dataObject) => dataObject.id === selection.id)
      : undefined;

  const sequence = selectedNode ? findSequence(project, selectedNode.id) : undefined;
  const branch = selectedNode ? findBranch(project, selectedNode.id) : undefined;
  const event = selectedNode ? findEvent(project, selectedNode.id) : undefined;
  const selectedDecisionContext =
    selectedNode?.data.kind === "decision" && typeof selectedNode.data.details?.eventId === "string"
      ? {
          eventId: selectedNode.data.details.eventId,
          decision: findEvent(project, selectedNode.data.details.eventId)?.decisions?.find(
            (decision) => decision.id === (selectedNode.data.details?.decision as { id?: string } | undefined)?.id,
          ),
        }
      : undefined;
  const selectedOutcomeContext =
    selectedNode?.data.kind === "outcome" && typeof selectedNode.data.details?.eventId === "string"
      ? {
          eventId: selectedNode.data.details.eventId,
          decisionId: String(selectedNode.data.details.decisionId ?? "").replace(`decision:${selectedNode.data.details.eventId}:`, ""),
          outcome: selectedNode.data.details.outcome as Outcome | undefined,
        }
      : undefined;
  const selectedTransitionId = selectedEdge?.id.startsWith("edge:transition:")
    ? selectedEdge.id.replace("edge:transition:", "")
    : undefined;
  const selectedTransition = selectedTransitionId
    ? project.events.flatMap((eventNode) => eventNode.transitions ?? []).find((transition) => transition.id === selectedTransitionId)
    : undefined;
  const selectedDataClass = selectedDataObject
    ? project.dataClasses?.find((dataClass) => dataClass.id === selectedDataObject.classId)
    : undefined;
  const canonRefIds = project.canonRefs.map((canonRef) => canonRef.id);
  const eventCategories = project.eventCategories ?? [];
  const dataObjects = project.projectDataObjects ?? [];

  return (
    <aside className={`canvas-inspector ${embedded ? "embedded" : ""}`}>
      <div className="inspector-header">
        <div>
          <strong>Inspector</strong>
          <span>{selection ? selection.type : "project"}</span>
        </div>
        <button type="button" title="Close inspector" onClick={onClose}>
          x
        </button>
      </div>

      <div className="inspector-scroll">
        {sequence ? (
          <section className="inspector-section">
            <h2>Sequence</h2>
            <label className="field-label">
              Name
              <input value={sequence.name} onChange={(event) => onUpdateSequence(sequence.id, { name: event.target.value })} />
            </label>
            <label className="field-label">
              Entry Event
              <select
                value={sequence.entryEventId}
                onChange={(event) => onUpdateSequence(sequence.id, { entryEventId: event.target.value })}
              >
                {sequence.eventIds.map((eventId) => (
                  <option key={eventId} value={eventId}>
                    {findEvent(project, eventId)?.name ?? eventId}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Character Ref
              <input
                value={sequence.characterRef ?? ""}
                placeholder="optional speaker/character ref"
                onChange={(event) => onUpdateSequence(sequence.id, { characterRef: event.target.value || undefined })}
              />
            </label>
            <dl>
              <div>
                <dt>ID</dt>
                <dd>{sequence.id}</dd>
              </div>
              <div>
                <dt>Events</dt>
                <dd>{sequence.eventIds.length}</dd>
              </div>
              <div>
                <dt>Branches</dt>
                <dd>{sequence.branchIds?.length ?? 0}</dd>
              </div>
            </dl>
            <div className="inspector-actions">
              <button type="button" onClick={() => onSetEntrySequence(sequence.id)}>
                Mark Entry Sequence
              </button>
              <button type="button" className="danger" onClick={() => onDeleteSelection({ type: "node", id: sequence.id })}>
                Delete
              </button>
            </div>
          </section>
        ) : null}

        {sequence ? (
          <>
            <BasicConditionEditor
              value={sequence.availability}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(availability) => onUpdateSequence(sequence.id, { availability })}
            />
            <RuleSetEditor
              value={sequence.ruleSets}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(ruleSets) => onUpdateSequence(sequence.id, { ruleSets })}
            />
            <LogicSection availability={sequence.availability} ruleSets={sequence.ruleSets} />
          </>
        ) : null}

        {branch ? (
          <>
            <section className="inspector-section">
              <h2>Branch</h2>
              <label className="field-label">
                Title
                <input value={branch.title} onChange={(event) => onUpdateBranch(branch.id, { title: event.target.value })} />
              </label>
              <label className="field-label">
                Description
                <textarea
                  value={branch.description ?? ""}
                  rows={3}
                  onChange={(event) => onUpdateBranch(branch.id, { description: event.target.value || undefined })}
                />
              </label>
              <dl>
                <div>
                  <dt>ID</dt>
                  <dd>{branch.id}</dd>
                </div>
                <div>
                  <dt>Events</dt>
                  <dd>{branch.eventIds.length}</dd>
                </div>
              </dl>
              <div className="inspector-actions">
                <button type="button" onClick={() => onCreateEventInBranch(branch.id)}>
                  New Event Inside
                </button>
                <button type="button" onClick={() => onCreateEventInBranch(branch.id, "final")}>
                  New Final Inside
                </button>
                <button type="button" className="danger" onClick={() => onDeleteSelection({ type: "node", id: branch.id })}>
                  Delete
                </button>
              </div>
            </section>
            <BasicConditionEditor
              value={branch.availability}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(availability) => onUpdateBranch(branch.id, { availability })}
            />
            <RuleSetEditor
              value={branch.ruleSets}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(ruleSets) => onUpdateBranch(branch.id, { ruleSets })}
            />
            <LogicSection availability={branch.availability} ruleSets={branch.ruleSets} />
          </>
        ) : null}

        {event ? (
          <>
            <section className="inspector-section">
              <h2>Event</h2>
              <label className="field-label">
                Name
                <input value={event.name} onChange={(inputEvent) => onUpdateEvent(event.id, { name: inputEvent.target.value })} />
              </label>
              <label className="field-label">
                Category
                <select value={event.type} onChange={(inputEvent) => onUpdateEvent(event.id, { type: inputEvent.target.value })}>
                  {eventCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}{category.terminal ? " (terminal)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <dl>
                <div>
                  <dt>ID</dt>
                  <dd>{event.id}</dd>
                </div>
                <div>
                  <dt>Branch</dt>
                  <dd>{event.branchRef ?? "none"}</dd>
                </div>
                <div>
                  <dt>Engine Target</dt>
                  <dd>{project.engineTargets?.unity?.adapter ?? "none"}</dd>
                </div>
              </dl>
            </section>

            <CanonRefsPicker
              value={event.canonRefs}
              canonRefs={project.canonRefs}
              onChange={(canonRefs) => onUpdateEvent(event.id, { canonRefs })}
            />

            <section className="inspector-section">
              <h2>Script</h2>
              <label className="field-label">
                Ink Source
                <input
                  value={event.script?.sourcePath ?? ""}
                  placeholder="Assets/Ink/scene.ink"
                  onChange={(inputEvent) => {
                    const value = inputEvent.target.value;
                    onUpdateEvent(event.id, {
                      script: value
                        ? {
                            id: event.script?.id ?? `script:${event.id}`,
                            format: event.script?.format ?? "ink",
                            sourcePath: value,
                            compiledPath: event.script?.compiledPath,
                            entrySection: event.script?.entrySection,
                          }
                        : undefined,
                    });
                  }}
                />
              </label>
              <label className="field-label">
                Ink Entry
                <input
                  value={event.script?.entrySection ?? ""}
                  placeholder="opening_signal"
                  onChange={(inputEvent) =>
                    onUpdateEvent(event.id, {
                      script: {
                        id: event.script?.id ?? `script:${event.id}`,
                        format: event.script?.format ?? "ink",
                        sourcePath: event.script?.sourcePath,
                        compiledPath: event.script?.compiledPath,
                        entrySection: inputEvent.target.value || undefined,
                      },
                    })
                  }
                />
              </label>
              <dl>
                <div>
                  <dt>Source</dt>
                  <dd>{event.script?.sourcePath ?? "none"}</dd>
                </div>
                <div>
                  <dt>Compiled</dt>
                  <dd>{event.script?.compiledPath ?? "none"}</dd>
                </div>
                <div>
                  <dt>Entry</dt>
                  <dd>{event.script?.entrySection ?? "none"}</dd>
                </div>
              </dl>
            </section>

            <section className="inspector-section">
              <h2>Unlocks</h2>
              <div className="stack-list">
                {(event.unlocks ?? []).map((unlock, index) => (
                  <div className="mini-card" key={`${unlock.type}:${index}`}>
                    <strong>{unlock.type}</strong>
                    {"ref" in unlock && typeof unlock.ref === "string" ? <span>{unlock.ref}</span> : null}
                    {"sourceFunction" in unlock && typeof unlock.sourceFunction === "string" ? (
                      <span>{unlock.sourceFunction}</span>
                    ) : null}
                  </div>
                ))}
                {(event.unlocks ?? []).length === 0 ? <span className="empty-line">No unlock consequences.</span> : null}
              </div>
            </section>

            <BasicConditionEditor
              value={event.availability}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(availability) => onUpdateEvent(event.id, { availability })}
            />
            <ConsequenceEditor
              title="Unlocks / Runtime Actions"
              value={event.unlocks}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(unlocks) => onUpdateEvent(event.id, { unlocks })}
            />
            <RuleSetEditor
              value={event.ruleSets}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(ruleSets) => onUpdateEvent(event.id, { ruleSets })}
            />
            <section className="inspector-section">
              <h2>Decisions</h2>
              <div className="stack-list">
                {(event.decisions ?? []).map((decision) => (
                  <div className="mini-card" key={decision.id}>
                    <strong>{decision.name}</strong>
                    <span>{decision.type} - {decision.outcomes.length} outcomes</span>
                    <div className="inspector-actions">
                      <button type="button" onClick={() => onCreateOutcome(event.id, decision.id)}>
                        Add Outcome
                      </button>
                      <button type="button" className="danger" onClick={() => onDeleteDecision(event.id, decision.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {(event.decisions ?? []).length === 0 ? <span className="empty-line">No decisions yet.</span> : null}
              </div>
              <div className="inspector-actions">
                <button type="button" onClick={() => onCreateDecision(event.id)}>
                  Add Decision
                </button>
              </div>
            </section>
            <section className="inspector-section">
              <h2>Transitions</h2>
              <div className="stack-list">
                {(event.transitions ?? []).map((transition) => (
                  <div className="mini-card" key={transition.id}>
                    <strong>{transition.label ?? transition.id}</strong>
                    <span>{transition.from} {"->"} {transition.to}</span>
                    <button type="button" className="danger" onClick={() => onDeleteTransition(transition.id)}>
                      Delete Transition
                    </button>
                  </div>
                ))}
                {(event.transitions ?? []).length === 0 ? <span className="empty-line">No outgoing transitions.</span> : null}
              </div>
            </section>
            <LogicSection availability={event.availability} consequences={event.unlocks} ruleSets={event.ruleSets} />
            <section className="inspector-section">
              <div className="inspector-actions">
                <button type="button" className="danger" onClick={() => onDeleteSelection({ type: "node", id: event.id })}>
                  Delete
                </button>
              </div>
            </section>
          </>
        ) : null}

        {selectedDecisionContext?.decision ? (
          <>
            <section className="inspector-section">
              <h2>Decision</h2>
              <label className="field-label">
                Name
                <input
                  value={selectedDecisionContext.decision!.name}
                  onChange={(inputEvent) =>
                    onUpdateDecision(selectedDecisionContext.eventId, selectedDecisionContext.decision!.id, {
                      name: inputEvent.target.value,
                    })
                  }
                />
              </label>
              <label className="field-label">
                Type
                <input
                  value={selectedDecisionContext.decision!.type}
                  onChange={(inputEvent) =>
                    onUpdateDecision(selectedDecisionContext.eventId, selectedDecisionContext.decision!.id, {
                      type: inputEvent.target.value,
                    })
                  }
                />
              </label>
              <label className="field-label">
                Description
                <textarea
                  value={selectedDecisionContext.decision!.description ?? ""}
                  rows={3}
                  onChange={(inputEvent) =>
                    onUpdateDecision(selectedDecisionContext.eventId, selectedDecisionContext.decision!.id, {
                      description: inputEvent.target.value || undefined,
                    })
                  }
                />
              </label>
              <div className="inspector-actions">
                <button type="button" onClick={() => onCreateOutcome(selectedDecisionContext.eventId, selectedDecisionContext.decision!.id)}>
                  Add Outcome
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => onDeleteDecision(selectedDecisionContext.eventId, selectedDecisionContext.decision!.id)}
                >
                  Delete
                </button>
              </div>
            </section>
            <BasicConditionEditor
              value={selectedDecisionContext.decision!.availability}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(availability) =>
                onUpdateDecision(selectedDecisionContext.eventId, selectedDecisionContext.decision!.id, { availability })
              }
            />
            <RuleSetEditor
              value={selectedDecisionContext.decision!.ruleSets}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(ruleSets) =>
                onUpdateDecision(selectedDecisionContext.eventId, selectedDecisionContext.decision!.id, { ruleSets })
              }
            />
          </>
        ) : null}

        {selectedOutcomeContext?.outcome ? (
          <>
            <section className="inspector-section">
              <h2>Outcome</h2>
              <label className="field-label">
                Name
                <input
                  value={selectedOutcomeContext.outcome!.name}
                  onChange={(inputEvent) =>
                    onUpdateOutcome(selectedOutcomeContext.eventId, selectedOutcomeContext.decisionId, selectedOutcomeContext.outcome!.id, {
                      name: inputEvent.target.value,
                    })
                  }
                />
              </label>
              <label className="field-label">
                Description
                <textarea
                  value={selectedOutcomeContext.outcome!.description ?? ""}
                  rows={3}
                  onChange={(inputEvent) =>
                    onUpdateOutcome(selectedOutcomeContext.eventId, selectedOutcomeContext.decisionId, selectedOutcomeContext.outcome!.id, {
                      description: inputEvent.target.value || undefined,
                    })
                  }
                />
              </label>
              <CanonRefsPicker
                title="Required Canon Refs"
                value={selectedOutcomeContext.outcome!.requiredCanonRefs}
                canonRefs={project.canonRefs}
                onChange={(requiredCanonRefs) =>
                  onUpdateOutcome(selectedOutcomeContext.eventId, selectedOutcomeContext.decisionId, selectedOutcomeContext.outcome!.id, {
                    requiredCanonRefs,
                  })
                }
              />
              <button
                type="button"
                className="danger"
                onClick={() =>
                  onDeleteOutcome(selectedOutcomeContext.eventId, selectedOutcomeContext.decisionId, selectedOutcomeContext.outcome!.id)
                }
              >
                Delete
              </button>
            </section>
            <BasicConditionEditor
              value={selectedOutcomeContext.outcome!.conditions}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(conditions) =>
                onUpdateOutcome(selectedOutcomeContext.eventId, selectedOutcomeContext.decisionId, selectedOutcomeContext.outcome!.id, {
                  conditions,
                })
              }
            />
            <ConsequenceEditor
              value={selectedOutcomeContext.outcome!.consequences}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(consequences) =>
                onUpdateOutcome(selectedOutcomeContext.eventId, selectedOutcomeContext.decisionId, selectedOutcomeContext.outcome!.id, {
                  consequences,
                })
              }
            />
            <RuleSetEditor
              value={selectedOutcomeContext.outcome!.ruleSets}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(ruleSets) =>
                onUpdateOutcome(selectedOutcomeContext.eventId, selectedOutcomeContext.decisionId, selectedOutcomeContext.outcome!.id, {
                  ruleSets,
                })
              }
            />
          </>
        ) : null}

        {selectedNode && !sequence && !branch && !event && !selectedDecisionContext?.decision && !selectedOutcomeContext?.outcome ? (
          <section className="inspector-section">
            <h2>{selectedNode.data.title}</h2>
            <dl>
              <div>
                <dt>Kind</dt>
                <dd>{selectedNode.data.kind}</dd>
              </div>
              <div>
                <dt>ID</dt>
                <dd>{selectedNode.id}</dd>
              </div>
            </dl>
            <pre>{JSON.stringify(selectedNode.data.details ?? {}, null, 2)}</pre>
          </section>
        ) : null}

        {selectedEdge ? (
          <>
            <section className="inspector-section">
              <h2>{selectedEdge.data?.label ?? selectedEdge.label ?? "Edge"}</h2>
              <label className="field-label">
                Label
                <input
                  value={String(selectedEdge.data?.label ?? selectedEdge.label ?? "")}
                  onChange={(event) => onUpdateEdgeLabel(selectedEdge.id, event.target.value)}
                />
              </label>
              <dl>
                <div>
                  <dt>Kind</dt>
                  <dd>{selectedEdge.data?.kind ?? "edge"}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{selectedEdge.source}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>{selectedEdge.target}</dd>
                </div>
              </dl>
              {selectedTransition ? (
                <>
                  <label className="field-label">
                    Target Event
                    <select
                      value={selectedTransition.to}
                      onChange={(event) => onUpdateTransition(selectedTransition.id, { to: event.target.value })}
                    >
                      {project.events.map((eventNode) => (
                        <option key={eventNode.id} value={eventNode.id}>
                          {eventNode.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="inspector-actions">
                    <button type="button" className="danger" onClick={() => onDeleteTransition(selectedTransition.id)}>
                      Delete Transition
                    </button>
                  </div>
                </>
              ) : null}
            </section>
            {selectedTransition ? (
              <>
                <BasicConditionEditor
                  value={selectedTransition.conditions}
                  canonRefs={canonRefIds}
                  dataObjects={dataObjects}
                  onChange={(conditions) => onUpdateTransition(selectedTransition.id, { conditions })}
                />
                <ConsequenceEditor
                  value={selectedTransition.consequences}
                  canonRefs={canonRefIds}
                  dataObjects={dataObjects}
                  onChange={(consequences) => onUpdateTransition(selectedTransition.id, { consequences })}
                />
              </>
            ) : null}
            <LogicSection availability={selectedEdge.data?.conditions} consequences={selectedEdge.data?.consequences} />
          </>
        ) : null}

        {selectedCanon ? (
          <section className="inspector-section">
            <h2>{selectedCanon.label ?? selectedCanon.kind ?? "Canon"}</h2>
            <dl>
              <div>
                <dt>ID</dt>
                <dd>{selectedCanon.id}</dd>
              </div>
              <div>
                <dt>Kind</dt>
                <dd>{selectedCanon.kind ?? "canon"}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{selectedCanon.source ?? "unknown"}</dd>
              </div>
              <div>
                <dt>Canon Path</dt>
                <dd>{selectedCanon.canonSourcePath ?? "none"}</dd>
              </div>
              <div>
                <dt>Working Copy</dt>
                <dd>{selectedCanon.workingCopyPath ?? "not created"}</dd>
              </div>
              {selectedCanon.missingIdentity ? (
                <div>
                  <dt>Identity</dt>
                  <dd className="warning-text">{selectedCanon.identityWarning ?? "Missing WorldNotion id/frontmatter."}</dd>
                </div>
              ) : null}
            </dl>
            <div className="inspector-actions">
              <button type="button" onClick={() => onEditCanonRef(selectedCanon)}>
                Edit in Branch
              </button>
            </div>
            <div className="readonly-preview-label">Read-only canon preview</div>
            {selectedCanon.preview ? <pre>{selectedCanon.preview}</pre> : <span className="empty-line">No preview available.</span>}
          </section>
        ) : null}

        {selectedFile ? (
          <section className="inspector-section">
            <h2>{selectedFile.label}</h2>
            <dl>
              <div>
                <dt>Group</dt>
                <dd>{selectedFile.group}</dd>
              </div>
              <div>
                <dt>Detail</dt>
                <dd>{selectedFile.detail ?? "none"}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        {selectedDataObject ? (
          <>
            <section className="inspector-section">
              <h2>Project Data Object</h2>
              <label className="field-label">
                Name
                <input
                  value={selectedDataObject.name}
                  onChange={(event) => onUpdateDataObject(selectedDataObject.id, { name: event.target.value })}
                />
              </label>
              <label className="field-label">
                Class
                <select
                  value={selectedDataObject.classId}
                  onChange={(event) => onUpdateDataObject(selectedDataObject.id, { classId: event.target.value })}
                >
                  {(project.dataClasses ?? []).map((dataClass) => (
                    <option key={dataClass.id} value={dataClass.id}>
                      {dataClass.label}
                    </option>
                  ))}
                </select>
              </label>
              <CanonRefsPicker
                value={selectedDataObject.canonRefs}
                canonRefs={project.canonRefs}
                onChange={(canonRefs) => onUpdateDataObject(selectedDataObject.id, { canonRefs })}
              />
              <label className="field-label">
                Tags
                <input
                  value={(selectedDataObject.tags ?? []).join(", ")}
                  onChange={(event) =>
                    onUpdateDataObject(selectedDataObject.id, {
                      tags: event.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <dl>
                <div>
                  <dt>ID</dt>
                  <dd>{selectedDataObject.id}</dd>
                </div>
                <div>
                  <dt>Class</dt>
                  <dd>{selectedDataObject.classId}</dd>
                </div>
                <div>
                  <dt>Canon</dt>
                  <dd>{selectedDataObject.canonRefs?.join(", ") || "manual"}</dd>
                </div>
              </dl>
              <div className="inspector-actions">
                <button type="button" className="danger" onClick={() => onDeleteDataObject(selectedDataObject.id)}>
                  Delete Data Object
                </button>
              </div>
            </section>
            <section className="inspector-section">
              <h2>Fields</h2>
              <div className="stack-list">
                {(selectedDataClass?.fields.length
                  ? selectedDataClass.fields
                  : Object.keys(selectedDataObject.fields).map((field): DataFieldDefinition => ({ name: field, type: "text" }))
                ).map((fieldDefinition) => {
                  const value = selectedDataObject.fields[fieldDefinition.name] ?? fieldDefinition.defaultValue ?? "";
                  return (
                    <div className="mini-card" key={fieldDefinition.name}>
                      <label className="field-label">
                        {fieldDefinition.label ?? fieldDefinition.name}
                        {fieldDefinition.type === "boolean" ? (
                          <select
                            value={String(Boolean(value))}
                            onChange={(event) =>
                              onUpdateDataObject(selectedDataObject.id, {
                                fields: {
                                  ...selectedDataObject.fields,
                                  [fieldDefinition.name]: event.target.value === "true",
                                },
                              })
                            }
                          >
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : fieldDefinition.type === "select" && fieldDefinition.options?.length ? (
                          <select
                            value={String(value)}
                            onChange={(event) =>
                              onUpdateDataObject(selectedDataObject.id, {
                                fields: { ...selectedDataObject.fields, [fieldDefinition.name]: event.target.value },
                              })
                            }
                          >
                            {fieldDefinition.options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={Array.isArray(value) ? value.join(", ") : fieldSummary(value)}
                            onChange={(event) =>
                              onUpdateDataObject(selectedDataObject.id, {
                                fields: {
                                  ...selectedDataObject.fields,
                                  [fieldDefinition.name]: coerceDataFieldValue(fieldDefinition.type, event.target.value),
                                },
                              })
                            }
                          />
                        )}
                      </label>
                      {fieldDefinition.description ? <span>{fieldDefinition.description}</span> : null}
                    </div>
                  );
                })}
              </div>
            </section>
            <BasicConditionEditor
              value={selectedDataObject.availability}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(availability) => onUpdateDataObject(selectedDataObject.id, { availability })}
            />
            <RuleSetEditor
              value={selectedDataObject.ruleSets}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(ruleSets) => onUpdateDataObject(selectedDataObject.id, { ruleSets })}
            />
            <LogicSection availability={selectedDataObject.availability} ruleSets={selectedDataObject.ruleSets} />
          </>
        ) : null}

        <section className="inspector-section">
          <h2>Validation</h2>
          <div className="stack-list">
            {findings.length === 0 ? <span className="clean">No findings.</span> : null}
            {findings.map((finding) => (
              <div className={`finding ${finding.severity}`} key={`${finding.code}:${finding.id ?? ""}:${finding.ref ?? ""}`}>
                <strong>{finding.code}</strong>
                <span>{finding.message}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="inspector-section">
          <h2>Export Preview</h2>
          <label className="field-label">
            Format
            <select value={exportPreviewMode} onChange={(event) => onExportPreviewModeChange(event.target.value as ExportPreviewMode)}>
              <option value="runtime">Runtime JSON</option>
              <option value="ink">Ink</option>
              <option value="gameData">SINPO GameData</option>
            </select>
          </label>
          <dl>
            <div>
              <dt>Package</dt>
              <dd>{runtimePackage.packageId}</dd>
            </div>
            <div>
              <dt>Entry</dt>
              <dd>{runtimePackage.entryNodeId}</dd>
            </div>
            <div>
              <dt>Nodes</dt>
              <dd>{runtimePackage.nodes.length}</dd>
            </div>
            <div>
              <dt>Ink files</dt>
              <dd>{inkExport.files.length}</dd>
            </div>
          </dl>
          {exportOpen ? <pre>{exportPreview}</pre> : null}
        </section>
      </div>
    </aside>
  );
}

type CanvasContextMenu = {
  x: number;
  y: number;
  flowX: number;
  flowY: number;
};

function StoryCanvas({
  project,
  files,
  nodes,
  edges,
  selection,
  findings,
  message,
  canvasMode,
  focusNodeId,
  exportOpen,
  exportPreviewMode,
  dataOpen,
  markdownTabs,
  activeMarkdownTabId,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeDragStop,
  onSelect,
  onEnterFocus,
  onExitFocus,
  onExportPreviewModeChange,
  onToggleData,
  onCreateBranch,
  onCreateEvent,
  onUpdateSequence,
  onSetEntrySequence,
  onUpdateBranch,
  onCreateEventInBranch,
  onUpdateEvent,
  onCreateDecision,
  onUpdateDecision,
  onDeleteDecision,
  onCreateOutcome,
  onUpdateOutcome,
  onDeleteOutcome,
  onUpdateTransition,
  onDeleteTransition,
  onUpdateDataObject,
  onDeleteDataObject,
  onEditCanonRef,
  onUpdateEdgeLabel,
  onDeleteSelection,
  onActivateMarkdownTab,
  onCloseMarkdownTab,
  onChangeMarkdownContent,
  onChangeMarkdownFormat,
  onSaveMarkdownTab,
}: {
  project: BranchingProject;
  files: PathBranchingFileItem[];
  nodes: StoryCanvasNode[];
  edges: StoryCanvasEdge[];
  selection?: Selection;
  findings: ValidationFinding[];
  message?: string;
  canvasMode: CanvasMode;
  focusNodeId?: string;
  exportOpen: boolean;
  exportPreviewMode: ExportPreviewMode;
  dataOpen: boolean;
  markdownTabs: MarkdownEditorTab[];
  activeMarkdownTabId?: string;
  onNodesChange: (changes: NodeChange<StoryCanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<StoryCanvasEdge>[]) => void;
  onConnect: OnConnect;
  onNodeDragStop: (event: MouseEvent | TouchEvent | ReactMouseEvent, node: StoryCanvasNode) => void;
  onSelect: (selection?: Selection) => void;
  onEnterFocus: (nodeId: string) => void;
  onExitFocus: () => void;
  onExportPreviewModeChange: (mode: ExportPreviewMode) => void;
  onToggleData: () => void;
  onCreateBranch: (position?: { x: number; y: number }) => void;
  onCreateEvent: (type?: EventType, position?: { x: number; y: number }, branchId?: string) => void;
  onUpdateSequence: (id: string, updates: Partial<Sequence>) => void;
  onSetEntrySequence: (id: string) => void;
  onUpdateBranch: (id: string, updates: Partial<Branch>) => void;
  onCreateEventInBranch: (branchId: string, type?: EventType) => void;
  onUpdateEvent: (id: string, updates: Partial<EventNode>) => void;
  onCreateDecision: (eventId: string) => void;
  onUpdateDecision: (eventId: string, decisionId: string, updates: Partial<Decision>) => void;
  onDeleteDecision: (eventId: string, decisionId: string) => void;
  onCreateOutcome: (eventId: string, decisionId: string) => void;
  onUpdateOutcome: (eventId: string, decisionId: string, outcomeId: string, updates: Partial<Outcome>) => void;
  onDeleteOutcome: (eventId: string, decisionId: string, outcomeId: string) => void;
  onUpdateTransition: (transitionId: string, updates: Partial<Transition>) => void;
  onDeleteTransition: (transitionId: string) => void;
  onUpdateDataObject: (id: string, updates: Partial<ProjectDataObject>) => void;
  onDeleteDataObject: (id: string) => void;
  onEditCanonRef: (ref: CanonRef) => void;
  onUpdateEdgeLabel: (edgeId: string, label: string) => void;
  onDeleteSelection: (selection: Selection) => void;
  onActivateMarkdownTab: (id: string) => void;
  onCloseMarkdownTab: (id: string) => void;
  onChangeMarkdownContent: (id: string, content: string) => void;
  onChangeMarkdownFormat: (id: string, format: MarkdownDraftFormat) => void;
  onSaveMarkdownTab: (id: string) => void;
}) {
  const shellRef = useRef<HTMLElement | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<StoryCanvasNode, StoryCanvasEdge>>();
  const [contextMenu, setContextMenu] = useState<CanvasContextMenu>();
  const [draggingEvent, setDraggingEvent] = useState(false);
  const [paletteCategoryId, setPaletteCategoryId] = useState("normal");
  const graph = useMemo(() => canvasGraph(nodes, edges, canvasMode, focusNodeId), [canvasMode, edges, focusNodeId, nodes]);
  const currentSequence = project.sequences.find((sequence) => sequence.id === activeSequenceId(project));
  const focusedNode = graph.nodes.find((node) => node.id === focusNodeId) ?? nodes.find((node) => node.id === focusNodeId);
  const sequenceEvents = currentSequence?.eventIds.length ?? 0;
  const sequenceBranches = currentSequence?.branchIds?.length ?? nodes.filter((node) => node.data.kind === "branch").length;
  const errorCount = findings.filter((finding) => finding.severity === "error").length;
  const selectedNodeId = selection?.type === "node" ? selection.id : undefined;

  useEffect(() => {
    if (!reactFlowInstance) {
      return;
    }
    window.requestAnimationFrame(() => {
      reactFlowInstance.fitView({ padding: canvasMode === "focus" ? 0.32 : 0.24, duration: 180 });
    });
  }, [canvasMode, focusNodeId, graph.nodes.length, reactFlowInstance]);

  const openContextMenu = useCallback(
    (event: MouseEvent | ReactMouseEvent) => {
      event.preventDefault();
      if (!reactFlowInstance) {
        return;
      }
      const shellRect = shellRef.current?.getBoundingClientRect();
      const flowPosition = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setContextMenu({
        x: event.clientX - (shellRect?.left ?? 0),
        y: event.clientY - (shellRect?.top ?? 0),
        flowX: flowPosition.x,
        flowY: flowPosition.y,
      });
    },
    [reactFlowInstance],
  );

  return (
    <main className={`canvas-shell ${canvasMode === "focus" ? "focus-mode" : ""} ${draggingEvent ? "dragging-event" : ""}`} ref={shellRef}>
      <div className="canvas-status">
        <strong>{canvasMode === "focus" ? `Focus: ${focusedNode?.data.title ?? "Node"}` : currentSequence?.name ?? project.name ?? project.projectId}</strong>
        <span>
          {canvasMode === "focus"
            ? `${graph.nodes.length} components - ${graph.edges.length} links`
            : `${sequenceBranches} branches - ${sequenceEvents} events - ${findings.length} findings`}
          {errorCount > 0 ? ` (${errorCount} errors)` : ""}
        </span>
      </div>

      {message ? <div className="canvas-message">{message}</div> : null}

      <div className="canvas-modebar">
        <button type="button" className={canvasMode === "branching" ? "active" : ""} onClick={onExitFocus}>
          <GitBranch size={14} />
          <span>Branching</span>
        </button>
        <button
          type="button"
          className={canvasMode === "focus" ? "active" : ""}
          disabled={!focusNodeId && !selectedNodeId}
          onClick={() => {
            if (focusNodeId) {
              onEnterFocus(focusNodeId);
              return;
            }
            if (selectedNodeId) {
              onEnterFocus(selectedNodeId);
            }
          }}
        >
          <Focus size={14} />
          <span>Focus</span>
        </button>
        {canvasMode === "focus" ? (
          <button type="button" onClick={onExitFocus}>
            <ArrowLeft size={14} />
            <span>Exit</span>
          </button>
        ) : null}
      </div>

      {canvasMode === "branching" ? (
        <div className="canvas-palette">
          <select value={paletteCategoryId} onChange={(event) => setPaletteCategoryId(event.target.value)} aria-label="Event category">
            {(project.eventCategories ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => onCreateBranch()}>
            Branch
          </button>
          <button type="button" onClick={() => onCreateEvent(paletteCategoryId)}>
            Event
          </button>
          <button type="button" onClick={() => onCreateEvent("final")}>
            Final Event
          </button>
        </div>
      ) : null}

      <ReactFlowProvider>
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onNodeDrag={(_, node) => setDraggingEvent(node.data.kind === "event")}
          onNodeDragStop={(event, node) => {
            setDraggingEvent(false);
            onNodeDragStop(event, node);
          }}
          onNodeClick={(_, node) => {
            onSelect({ type: "node", id: node.id });
            if (canvasMode === "focus") {
              onEnterFocus(node.id);
            }
          }}
          onNodeDoubleClick={(_, node) => onEnterFocus(node.id)}
          onEdgeClick={(_, edgeItem) => onSelect({ type: "edge", id: edgeItem.id })}
          onPaneClick={() => {
            setContextMenu(undefined);
            onSelect(undefined);
          }}
          onPaneContextMenu={canvasMode === "branching" ? openContextMenu : undefined}
          fitView
          fitViewOptions={{ padding: 0.24 }}
          defaultViewport={project.canvas?.viewport}
          proOptions={{ hideAttribution: true }}
        >
          <MiniMap pannable zoomable nodeStrokeWidth={3} />
          <Controls />
          <Background gap={28} size={1} />
        </ReactFlow>
      </ReactFlowProvider>

      {contextMenu ? (
        <div className="canvas-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button
            type="button"
            onClick={() => {
              onCreateBranch({ x: contextMenu.flowX, y: contextMenu.flowY });
              setContextMenu(undefined);
            }}
          >
            Create Branch
          </button>
          <button
            type="button"
            onClick={() => {
              onCreateEvent(paletteCategoryId, { x: contextMenu.flowX, y: contextMenu.flowY });
              setContextMenu(undefined);
            }}
          >
            Create Event
          </button>
          <button
            type="button"
            onClick={() => {
              onCreateEvent("final", { x: contextMenu.flowX, y: contextMenu.flowY });
              setContextMenu(undefined);
            }}
          >
            Create Final Event
          </button>
        </div>
      ) : null}

      {dataOpen ? (
        <DataDrawer
          project={project}
          selectedId={selection?.type === "dataObject" ? selection.id : undefined}
          onSelect={(id) => onSelect({ type: "dataObject", id })}
          onClose={onToggleData}
        />
      ) : null}

      <EventAuthoringDock
        project={project}
        nodes={nodes}
        selection={selection}
        onSelect={onSelect}
        onUpdateEvent={onUpdateEvent}
      >
        <Inspector
          project={project}
          nodes={nodes}
          edges={edges}
          files={files}
          selection={selection}
          findings={findings}
          exportOpen={exportOpen}
          exportPreviewMode={exportPreviewMode}
          embedded
          onExportPreviewModeChange={onExportPreviewModeChange}
          onClose={() => onSelect(undefined)}
          onUpdateSequence={onUpdateSequence}
          onSetEntrySequence={onSetEntrySequence}
          onUpdateBranch={onUpdateBranch}
          onCreateEventInBranch={onCreateEventInBranch}
          onUpdateEvent={onUpdateEvent}
          onCreateDecision={onCreateDecision}
          onUpdateDecision={onUpdateDecision}
          onDeleteDecision={onDeleteDecision}
          onCreateOutcome={onCreateOutcome}
          onUpdateOutcome={onUpdateOutcome}
          onDeleteOutcome={onDeleteOutcome}
          onUpdateTransition={onUpdateTransition}
          onDeleteTransition={onDeleteTransition}
          onUpdateDataObject={onUpdateDataObject}
          onDeleteDataObject={onDeleteDataObject}
          onEditCanonRef={onEditCanonRef}
          onUpdateEdgeLabel={onUpdateEdgeLabel}
          onDeleteSelection={onDeleteSelection}
        />
      </EventAuthoringDock>
    </main>
  );
}

export function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [view, setView] = useState<AppView>(() => loadSettings().lastView ?? "home");
  const settingsRef = useRef(settings);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [workspace, setWorkspace] = useState<PathBranchingWorkspace>();
  const [project, setProject] = useState<BranchingProject>();
  const [fileState, setFileState] = useState<ProjectFileState>({ dirty: false });
  const [nodes, setNodes] = useState<StoryCanvasNode[]>([]);
  const [edges, setEdges] = useState<StoryCanvasEdge[]>([]);
  const [files, setFiles] = useState<PathBranchingFileItem[]>([]);
  const [selection, setSelection] = useState<Selection>();
  const [canonOpen, setCanonOpen] = useState(true);
  const [filesOpen, setFilesOpen] = useState(true);
  const [canonWidth, setCanonWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [storiesWidth, setStoriesWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [panelResizing, setPanelResizing] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPreviewMode, setExportPreviewMode] = useState<ExportPreviewMode>("runtime");
  const [dataOpen, setDataOpen] = useState(false);
  const [markdownTabs, setMarkdownTabs] = useState<MarkdownEditorTab[]>([]);
  const [activeMarkdownTabId, setActiveMarkdownTabId] = useState<string>();
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("branching");
  const [focusNodeId, setFocusNodeId] = useState<string>();
  const [undoStack, setUndoStack] = useState<BranchingProject[]>([]);
  const [redoStack, setRedoStack] = useState<BranchingProject[]>([]);
  const [discardDialog, setDiscardDialog] = useState<{ resolve: (discard: boolean) => void }>();
  const [missingRecentProjects, setMissingRecentProjects] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const autoSaveTokenRef = useRef(0);
  const projectRef = useRef<BranchingProject | undefined>(undefined);
  const workspaceRef = useRef<PathBranchingWorkspace | undefined>(undefined);
  const fileStateRef = useRef<ProjectFileState>({ dirty: false });
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const projectRevisionRef = useRef(0);
  const savedRevisionRef = useRef(0);

  const applyProject = useCallback((nextProject: BranchingProject, options: { dirty?: boolean; path?: string; universePath?: string; storyPath?: string; modifiedMs?: number } = {}) => {
    const normalizedProject = normalizeProject(nextProject);
    const model = buildStoryCanvasModel(normalizedProject);
    if (options.dirty) {
      projectRevisionRef.current += 1;
    }
    projectRef.current = normalizedProject;
    workspaceRef.current = workspaceRef.current
      ? {
          ...workspaceRef.current,
          activeProject: normalizedProject,
        }
      : workspaceRef.current;
    setProject(normalizedProject);
    setNodes(model.nodes);
    setEdges(model.edges);
    setFiles(model.files);
    setFileState((current) => {
      const nextState = {
        path: options.path ?? current.path,
        universePath: options.universePath ?? current.universePath,
        storyPath: options.storyPath ?? current.storyPath,
        dirty: options.dirty ?? current.dirty,
        lastSavedAt: options.dirty === false ? Date.now() : current.lastSavedAt,
        modifiedMs: options.modifiedMs ?? current.modifiedMs,
        universeProfile: current.universeProfile,
      };
      fileStateRef.current = nextState;
      return nextState;
    });
    if (options.dirty) {
      setWorkspace((current) =>
        current
          ? {
              ...current,
              activeProject: normalizedProject,
            }
          : current,
      );
    }
  }, []);

  const applyWorkspace = useCallback(
    (nextWorkspace: PathBranchingWorkspace, universePath: string) => {
      const savedSession = normalizeWorkspaceSession(settingsRef.current.workspaceSessions?.[universePath]);
      const activeProject = normalizeProject({
        ...nextWorkspace.activeProject,
        universeRootPath: universePath,
      });
      const model = buildStoryCanvasModel(activeProject);
      workspaceRef.current = nextWorkspace;
      projectRef.current = activeProject;
      projectRevisionRef.current = 0;
      savedRevisionRef.current = 0;
      setWorkspace(nextWorkspace);
      setProject(activeProject);
      setNodes(model.nodes);
      setEdges(model.edges);
      setFiles(model.files);
      const nextFileState = {
        path: nextWorkspace.activeStory?.path,
        storyPath: nextWorkspace.activeStory?.path,
        universePath,
        dirty: false,
        lastSavedAt: nextWorkspace.createdDefaultStory ? undefined : Date.now(),
        modifiedMs: nextWorkspace.storyModifiedMs,
        universeProfile: nextWorkspace.universeProfile,
      };
      fileStateRef.current = nextFileState;
      setFileState(nextFileState);
      setUndoStack([]);
      setRedoStack([]);
      setMarkdownTabs(savedSession.markdownTabs ?? []);
      setActiveMarkdownTabId(savedSession.activeMarkdownTabId);
      setCanonOpen(savedSession.canonOpen ?? activeProject.panels?.canonOpen ?? true);
      setFilesOpen(savedSession.filesOpen ?? activeProject.panels?.filesOpen ?? true);
      setCanonWidth(clampPanelWidth(savedSession.canonWidth));
      setStoriesWidth(clampPanelWidth(savedSession.storiesWidth));
      setExportOpen(savedSession.exportOpen ?? false);
      setDataOpen(savedSession.dataOpen ?? false);
      const initialSelectionId = activeProject.canvas?.activeSequenceId ?? activeProject.entrySequenceId ?? activeProject.sequences[0]?.id ?? model.nodes[0]?.id;
      setSelection(savedSession.selection ?? (initialSelectionId ? { type: "node", id: initialSelectionId } : undefined));
      setCanvasMode(savedSession.canvasMode ?? "branching");
      setFocusNodeId(savedSession.focusNodeId);
      setError(undefined);
    },
    [],
  );

  const markProjectDirty = useCallback((nextProject: BranchingProject) => {
    const normalizedProject = normalizeProject(nextProject);
    projectRevisionRef.current += 1;
    projectRef.current = normalizedProject;
    workspaceRef.current = workspaceRef.current
      ? {
          ...workspaceRef.current,
          activeProject: normalizedProject,
        }
      : workspaceRef.current;
    setProject(normalizedProject);
    setWorkspace((current) =>
      current
        ? {
            ...current,
            activeProject: normalizedProject,
          }
        : current,
    );
    setFileState((current) => {
      const nextState = { ...current, dirty: true };
      fileStateRef.current = nextState;
      return nextState;
    });
    return normalizedProject;
  }, []);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    fileStateRef.current = fileState;
  }, [fileState]);

  const updateProject = useCallback(
    (nextProject: BranchingProject, nextSelection?: Selection) => {
      if (project) {
        setUndoStack((current) => [...current.slice(-49), project]);
        setRedoStack([]);
      }
      applyProject(nextProject, { dirty: true });
      if (nextSelection) {
        setSelection(nextSelection);
      }
      setMessage(undefined);
    },
    [applyProject, project],
  );

  const runMutation = useCallback(
    (result: mutations.MutationResult) => {
      if (project && result.project !== project) {
        setUndoStack((current) => [...current.slice(-49), project]);
        setRedoStack([]);
      }
      applyProject(result.project, { dirty: result.project !== project });
      if (result.selection) {
        setSelection(result.selection as Selection);
      }
      setMessage(result.message);
    },
    [applyProject, project],
  );

  const editCanonRefInBranch = useCallback((ref: CanonRef) => {
    const tabId = `canon:${ref.id}`;
    setMarkdownTabs((current) => {
      if (current.some((tab) => tab.id === tabId)) {
        return current;
      }
      return [
        ...current,
        {
          id: tabId,
          canonRefId: ref.id,
          title: ref.label ?? ref.id,
          sourcePath: ref.canonSourcePath,
          workingCopyPath: ref.workingCopyPath,
          format: "markdown" as const,
          content: canonMarkdownDraft(ref),
          dirty: false,
        },
      ].slice(-5);
    });
    setActiveMarkdownTabId(tabId);
  }, []);

  const changeMarkdownContent = useCallback((id: string, content: string) => {
    setMarkdownTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, content, dirty: true } : tab)));
  }, []);

  const changeMarkdownFormat = useCallback(
    (id: string, format: MarkdownDraftFormat) => {
      setMarkdownTabs((current) =>
        current.map((tab) => {
          if (tab.id !== id) return tab;
          const ref = project?.canonRefs.find((canonRef) => canonRef.id === tab.canonRefId);
          if (!ref) return { ...tab, format };
          const template = markdownFormatTemplate(format, ref);
          return {
            ...tab,
            format,
            content: tab.dirty ? `${tab.content.trimEnd()}\n\n---\n\n${template}` : template,
            dirty: true,
          };
        }),
      );
    },
    [project],
  );

  const closeMarkdownTab = useCallback((id: string) => {
    setMarkdownTabs((current) => {
      const nextTabs = current.filter((tab) => tab.id !== id);
      setActiveMarkdownTabId((activeId) => {
        if (activeId !== id) return activeId;
        return nextTabs[nextTabs.length - 1]?.id;
      });
      return nextTabs;
    });
  }, []);

  const saveMarkdownTab = useCallback(
    async (id: string) => {
      const tab = markdownTabs.find((item) => item.id === id);
      if (!tab || !fileState.universePath) {
        setMessage("Open a universe before saving a Markdown working copy.");
        return;
      }

      setMarkdownTabs((current) => current.map((item) => (item.id === id ? { ...item, saving: true } : item)));
      try {
        const result = await saveWorkingCopy(fileState.universePath, tab.canonRefId, tab.content, tab.modifiedMs);
        if (!result.ok) {
          throw new Error(result.message ?? "Could not save Markdown working copy.");
        }
        const workingCopyPath = workingCopyPathForCanonRef(tab.canonRefId);
        setMarkdownTabs((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  workingCopyPath,
                  dirty: false,
                  saving: false,
                  lastSavedAt: Date.now(),
                  modifiedMs: result.modifiedMs,
                }
              : item,
          ),
        );
        if (projectRef.current) {
          markProjectDirty({
            ...projectRef.current,
            canonRefs: projectRef.current.canonRefs.map((ref) =>
              ref.id === tab.canonRefId ? { ...ref, workingCopyPath } : ref,
            ),
          });
        }
        setMessage(`Saved working copy: ${workingCopyPath}.`);
      } catch (saveError) {
        setMarkdownTabs((current) => current.map((item) => (item.id === id ? { ...item, saving: false } : item)));
        setMessage(saveError instanceof Error ? saveError.message : String(saveError));
      }
    },
    [fileState.universePath, markProjectDirty, markdownTabs],
  );

  const confirmDiscardChanges = useCallback(async () => {
    if (!fileState.dirty) {
      return true;
    }
    return new Promise<boolean>((resolve) => {
      setDiscardDialog({ resolve });
    });
  }, [fileState.dirty]);

  const resolveDiscardDialog = useCallback(
    (discard: boolean) => {
      discardDialog?.resolve(discard);
      setDiscardDialog(undefined);
    },
    [discardDialog],
  );

  const setActiveSequence = useCallback(
    (sequenceId: string) => {
      if (!project) {
        return;
      }
      updateProject(
        {
          ...project,
          canvas: {
            ...project.canvas,
            activeSequenceId: sequenceId,
          },
        },
        { type: "node", id: sequenceId },
      );
      setCanvasMode("branching");
      setFocusNodeId(undefined);
    },
    [project, updateProject],
  );

  useEffect(() => {
    let disposed = false;
    async function loadInitialProject() {
      if (settings.lastOpenedProject) {
        try {
          const opened = await openUniversePath(settings.lastOpenedProject);
          if (disposed) {
            return;
          }
          applyWorkspace(opened.workspace, opened.path);
          setSettings((current) => rememberRecentProject(current, opened.path));
          setView("workspace");
          setInitialLoading(false);
          return;
        } catch {
          setMissingRecentProjects((current) => new Set(current).add(settings.lastOpenedProject as string));
        }
      }
      setProject(undefined);
      setWorkspace(undefined);
      setFileState({ dirty: false });
      setView("home");
      setInitialLoading(false);
    }
    void loadInitialProject();
    return () => {
      disposed = true;
    };
    // Initial load only. The settings object is persisted separately after startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
    document.documentElement.dataset.theme = settings.theme;
    saveSettings({ ...settings, lastView: view });
  }, [settings, view]);

  const changeTheme = useCallback((theme: ThemeId) => {
    setSettings((current) => ({ ...current, theme }));
  }, []);

  useEffect(() => {
    if (!fileState.universePath || initialLoading) return;
    const session: PathBranchingWorkspaceSession = {
      view,
      selection,
      canonOpen,
      filesOpen,
      canonWidth,
      storiesWidth,
      exportOpen,
      dataOpen,
      canvasMode,
      focusNodeId,
      markdownTabs: storableMarkdownTabs(markdownTabs),
      activeMarkdownTabId,
    };
    setSettings((current) => {
      const currentSession = current.workspaceSessions?.[fileState.universePath as string];
      if (JSON.stringify(currentSession ?? {}) === JSON.stringify(session)) {
        return current;
      }
      return {
        ...current,
        workspaceSessions: {
          ...(current.workspaceSessions ?? {}),
          [fileState.universePath as string]: session,
        },
      };
    });
  }, [
    activeMarkdownTabId,
    canonOpen,
    canonWidth,
    canvasMode,
    dataOpen,
    exportOpen,
    fileState.universePath,
    filesOpen,
    focusNodeId,
    initialLoading,
    markdownTabs,
    selection,
    storiesWidth,
    view,
  ]);

  const toggleTheme = useCallback(() => {
    setSettings((current) => ({ ...current, theme: toggledThemeMode(current.theme) }));
  }, []);

  const changeThemeFamily = useCallback((family: ThemeFamily) => {
    setSettings((current) => ({ ...current, theme: themeForFamilyAndMode(family, themeById(current.theme).mode) }));
  }, []);

  const openProject = useCallback(async () => {
    if (!(await confirmDiscardChanges())) {
      return;
    }
    try {
      const opened = await openUniverseDialog();
      if (!opened) {
        return;
      }
      applyWorkspace(opened.workspace, opened.path);
      setSettings((current) => rememberRecentProject(current, opened.path));
      setView("workspace");
      setError(undefined);
      setMessage(
        opened.workspace.createdDefaultStory
          ? `Opened ${projectFileName(opened.path)}. Save to create PathBranching metadata.`
          : `Opened ${projectFileName(opened.path)}.`,
      );
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : String(openError));
    }
  }, [applyWorkspace, confirmDiscardChanges]);

  const persistProject = useCallback(
    (options: { manual?: boolean } = {}) => {
      const run = async () => {
        const currentProject = projectRef.current;
        const currentWorkspace = workspaceRef.current;
        const currentFileState = fileStateRef.current;
        const saveRevision = projectRevisionRef.current;

        if (!currentProject) {
          return;
        }
        if (!currentWorkspace || !currentFileState.universePath) {
          throw new Error("Open a universe before saving a PathBranching story.");
        }

        const result = await saveUniverseStory(
          currentFileState.universePath,
          currentWorkspace,
          currentProject,
          currentFileState.modifiedMs,
        );
        if (!result.ok) {
          throw new Error(result.message ?? "Could not save project.");
        }

        const savedProject = normalizeProject({
          ...currentProject,
          storyId: currentWorkspace.activeStory?.id ?? currentProject.storyId,
          universeRootPath: currentFileState.universePath,
        });
        const isStillCurrentRevision = projectRevisionRef.current === saveRevision;
        const nextFileState: ProjectFileState = {
          ...fileStateRef.current,
          path: result.storyPath ?? fileStateRef.current.storyPath,
          storyPath: result.storyPath ?? fileStateRef.current.storyPath,
          dirty: isStillCurrentRevision ? false : true,
          lastSavedAt: Date.now(),
          modifiedMs: result.storyModifiedMs ?? result.modifiedMs,
        };
        fileStateRef.current = nextFileState;
        setFileState(nextFileState);
        setSettings((current) => rememberRecentProject(current, currentFileState.universePath as string));
        setWorkspace((current) => {
          const nextWorkspace = current
            ? {
                ...current,
                manifest: result.manifest ?? current.manifest,
                activeProject: isStillCurrentRevision ? savedProject : projectRef.current ?? current.activeProject,
                createdDefaultStory: false,
                storyModifiedMs: result.storyModifiedMs ?? result.modifiedMs,
              }
            : current;
          workspaceRef.current = nextWorkspace;
          return nextWorkspace;
        });
        if (isStillCurrentRevision) {
          savedRevisionRef.current = saveRevision;
        }
        setError(undefined);
        if (options.manual) {
          setMessage(
            isStillCurrentRevision
              ? `Saved branching story in ${projectFileName(currentFileState.universePath)}.`
              : "Saved current snapshot. Newer changes are still pending.",
          );
        }
        if (!isStillCurrentRevision && isTauriRuntime()) {
          window.setTimeout(() => {
            if (fileStateRef.current.dirty) {
              void persistProject();
            }
          }, 180);
        }
      };

      const queuedSave = saveQueueRef.current.catch(() => undefined).then(run);
      saveQueueRef.current = queuedSave;
      return queuedSave;
    },
    [],
  );

  const saveProject = useCallback(async () => {
    try {
      await persistProject({ manual: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  }, [persistProject]);

  useEffect(() => {
    if (
      initialLoading ||
      !isTauriRuntime() ||
      !project ||
      !workspace ||
      !fileState.universePath ||
      !fileState.dirty
    ) {
      return;
    }

    const token = autoSaveTokenRef.current + 1;
    autoSaveTokenRef.current = token;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await persistProject();
          if (autoSaveTokenRef.current !== token) {
            return;
          }
        } catch (autoSaveError) {
          if (autoSaveTokenRef.current !== token) {
            return;
          }
          setError(autoSaveError instanceof Error ? autoSaveError.message : String(autoSaveError));
        }
      })();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [fileState.dirty, fileState.modifiedMs, fileState.universePath, initialLoading, persistProject, project, workspace]);

  const saveProjectAs = useCallback(async () => {
    if (!project) {
      return;
    }
    try {
      await saveProject();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  }, [project, saveProject]);

  const exportRuntime = useCallback(async (mode: ExportPreviewMode = exportPreviewMode) => {
    if (!project) {
      return;
    }
    try {
      const runtimePackage = exportRuntimePackage(project);
      const inkExport = exportInkProject(project);
      const gameDataExport = exportSinpoGameData(project);
      const result =
        mode === "ink"
          ? await exportTextDialog(inkExport.files.map((file) => `// ${file.path}\n${file.content}`).join("\n\n"), "story.ink")
          : mode === "gameData"
            ? await exportTextDialog(`${JSON.stringify(gameDataExport, null, 2)}\n`, "sinpo-game-data.json")
            : await exportRuntimeDialog(runtimePackage);
      if (!result) {
        return;
      }
      if (!result.ok) {
        throw new Error(result.message ?? "Could not export runtime package.");
      }
      setMessage(`Exported ${projectFileName(result.path)}.`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    }
  }, [exportPreviewMode, project]);

  const openRecentProject = useCallback(
    async (path: string) => {
      if (fileState.universePath === path) {
        setView("workspace");
        return;
      }
      if (!(await confirmDiscardChanges())) {
        return;
      }
      try {
        const opened = await openUniversePath(path);
        applyWorkspace(opened.workspace, opened.path);
        setSettings((current) => rememberRecentProject(current, opened.path));
        setView("workspace");
        setError(undefined);
        setMessage(`Opened ${projectFileName(opened.path)}.`);
      } catch (openError) {
        setMissingRecentProjects((current) => new Set(current).add(path));
        setError(openError instanceof Error ? openError.message : String(openError));
      }
    },
    [applyWorkspace, confirmDiscardChanges, fileState.universePath],
  );

  const removeRecentProject = useCallback((path: string) => {
    setSettings((current) => ({
      ...current,
      recentProjects: current.recentProjects.filter((candidate) => candidate !== path),
      lastOpenedProject: current.lastOpenedProject === path ? undefined : current.lastOpenedProject,
    }));
    setMissingRecentProjects((current) => {
      const next = new Set(current);
      next.delete(path);
      return next;
    });
  }, []);

  const undoProject = useCallback(() => {
    if (!project || undoStack.length === 0) {
      return;
    }
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current.slice(-49), project]);
    applyProject(previous, { dirty: true });
    setMessage("Undo.");
  }, [applyProject, project, undoStack]);

  const redoProject = useCallback(() => {
    if (!project || redoStack.length === 0) {
      return;
    }
    const next = redoStack[redoStack.length - 1];
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current.slice(-49), project]);
    applyProject(next, { dirty: true });
    setMessage("Redo.");
  }, [applyProject, project, redoStack]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shortcutMatches(event, "Mod+S")) {
        event.preventDefault();
        void saveProject();
      }
      if (shortcutMatches(event, "Mod+Z")) {
        event.preventDefault();
        undoProject();
      }
      if (shortcutMatches(event, "Mod+Shift+Z")) {
        event.preventDefault();
        redoProject();
      }
      if (shortcutMatches(event, "Mod+O")) {
        event.preventDefault();
        void openProject();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [openProject, redoProject, saveProject, undoProject]);

  const enterFocus = useCallback((nodeId: string) => {
    setFocusNodeId(nodeId);
    setCanvasMode("focus");
    setSelection({ type: "node", id: nodeId });
  }, []);

  const exitFocus = useCallback(() => {
    setCanvasMode("branching");
    setFocusNodeId(undefined);
  }, []);

  const findings = useMemo(() => {
    if (!project) {
      return [];
    }
    return [...validateProject(project), ...validateStoryCanvasEdges(nodes, edges)];
  }, [project, nodes, edges]);

  const createSequence = useCallback(() => {
    if (!project) {
      return;
    }
    runMutation(mutations.createSequence(project));
  }, [project, runMutation]);

  const createBranch = useCallback(
    (position?: { x: number; y: number }) => {
      if (!project) {
        return;
      }

      runMutation(mutations.createBranch(project, position));
    },
    [project, runMutation],
  );

  const createEvent = useCallback(
    (type: EventType = "normal", position?: { x: number; y: number }, branchId?: string) => {
      if (!project) {
        return;
      }

      runMutation(mutations.createEvent(project, type, position, branchId));
    },
    [project, runMutation],
  );

  const createEventInBranch = useCallback(
    (branchId: string, type: EventType = "normal") => {
      createEvent(type, undefined, branchId);
    },
    [createEvent],
  );

  const updateSequence = useCallback(
    (id: string, updates: Partial<Sequence>) => {
      if (!project) {
        return;
      }
      runMutation(mutations.updateSequence(project, id, updates));
    },
    [project, runMutation],
  );

  const setEntrySequence = useCallback(
    (id: string) => {
      if (!project) {
        return;
      }
      runMutation(mutations.setEntrySequence(project, id));
    },
    [project, runMutation],
  );

  const updateBranch = useCallback(
    (id: string, updates: Partial<Branch>) => {
      if (!project) {
        return;
      }
      runMutation(mutations.updateBranch(project, id, updates));
    },
    [project, runMutation],
  );

  const updateEvent = useCallback(
    (id: string, updates: Partial<EventNode>) => {
      if (!project) {
        return;
      }
      runMutation(mutations.updateEvent(project, id, updates));
    },
    [project, runMutation],
  );

  const createDecision = useCallback(
    (eventId: string) => {
      if (!project) {
        return;
      }
      runMutation(mutations.createDecision(project, eventId));
    },
    [project, runMutation],
  );

  const updateDecision = useCallback(
    (eventId: string, decisionId: string, updates: Partial<Decision>) => {
      if (!project) {
        return;
      }
      runMutation(mutations.updateDecision(project, eventId, decisionId, updates));
    },
    [project, runMutation],
  );

  const deleteDecision = useCallback(
    (eventId: string, decisionId: string) => {
      if (!project) {
        return;
      }
      runMutation(mutations.deleteDecision(project, eventId, decisionId));
    },
    [project, runMutation],
  );

  const createOutcome = useCallback(
    (eventId: string, decisionId: string) => {
      if (!project) {
        return;
      }
      runMutation(mutations.createOutcome(project, eventId, decisionId));
    },
    [project, runMutation],
  );

  const updateOutcome = useCallback(
    (eventId: string, decisionId: string, outcomeId: string, updates: Partial<Outcome>) => {
      if (!project) {
        return;
      }
      runMutation(mutations.updateOutcome(project, eventId, decisionId, outcomeId, updates));
    },
    [project, runMutation],
  );

  const deleteOutcome = useCallback(
    (eventId: string, decisionId: string, outcomeId: string) => {
      if (!project) {
        return;
      }
      runMutation(mutations.deleteOutcome(project, eventId, decisionId, outcomeId));
    },
    [project, runMutation],
  );

  const updateTransition = useCallback(
    (transitionId: string, updates: Partial<Transition>) => {
      if (!project) {
        return;
      }
      runMutation(mutations.updateTransition(project, transitionId, updates));
    },
    [project, runMutation],
  );

  const deleteTransition = useCallback(
    (transitionId: string) => {
      if (!project) {
        return;
      }
      runMutation(mutations.deleteTransition(project, transitionId));
    },
    [project, runMutation],
  );

  const updateDataObject = useCallback(
    (id: string, updates: Partial<ProjectDataObject>) => {
      if (!project) {
        return;
      }
      runMutation(mutations.updateDataObject(project, id, updates));
    },
    [project, runMutation],
  );

  const updateEventCategories = useCallback(
    (eventCategories: EventCategoryDefinition[]) => {
      if (!project) {
        return;
      }
      updateProject({ ...project, eventCategories });
    },
    [project, updateProject],
  );

  const deleteDataObject = useCallback(
    (id: string) => {
      if (!project) {
        return;
      }
      runMutation(mutations.deleteDataObject(project, id));
    },
    [project, runMutation],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<StoryCanvasNode>[]) => {
      setNodes((currentNodes) => {
        const nextNodes = applyNodeChanges(changes, currentNodes);
        if (projectRef.current) {
          markProjectDirty(updateProjectCanvas(projectRef.current, nextNodes));
        }
        return nextNodes;
      });
    },
    [markProjectDirty],
  );

  const handleEdgesChange = useCallback((changes: EdgeChange<StoryCanvasEdge>[]) => {
    setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges));
  }, []);

  const handleConnect = useCallback<OnConnect>(
    (connection: Connection) => {
      if (!project || !connection.source || !connection.target) {
        return;
      }

      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);
      const targetEventId = targetNode?.data.kind === "event" ? nodeStoryId(targetNode) : undefined;

      if (!sourceNode || !targetEventId) {
        setMessage("Connections must target an event in this MVP.");
        return;
      }

      const sequenceId = activeSequenceId(project);
      const sourceKind = sourceNode.data.kind;

      if (sourceKind === "start") {
        const sourceSequenceId =
          typeof sourceNode.data.details?.sequenceId === "string" ? sourceNode.data.details.sequenceId : nodeStoryId(sourceNode);
        if (!sourceSequenceId) {
          setMessage("Start node source could not be resolved.");
          return;
        }
        updateProject(
          {
            ...project,
            sequences: project.sequences.map((sequence) =>
              sequence.id === sourceSequenceId
                ? { ...sequence, entryEventId: targetEventId, eventIds: withValue(sequence.eventIds, targetEventId) }
                : sequence,
            ),
          },
          { type: "edge", id: `edge:entry:${sourceNode.id}:${targetEventId}` },
        );
        return;
      }

      if (sourceKind === "branch") {
        const branchId = nodeStoryId(sourceNode);
        if (!branchId || !sequenceId) {
          setMessage("Branch connection could not be resolved.");
          return;
        }
        updateProject(
          {
            ...project,
            sequences: project.sequences.map((sequence) =>
              sequence.id === sequenceId
                ? {
                    ...sequence,
                    eventIds: withValue(sequence.eventIds, targetEventId),
                    branchIds: withValue(sequence.branchIds, branchId),
                  }
                : sequence,
            ),
            branches: project.branches.map((branch) =>
              branch.id === branchId ? { ...branch, eventIds: withValue(branch.eventIds, targetEventId) } : branch,
            ),
            events: project.events.map((event) => (event.id === targetEventId ? { ...event, branchRef: branchId } : event)),
          },
          { type: "node", id: targetEventId },
        );
        return;
      }

      const sourceEventId = ownerEventIdForNode(sourceNode);
      const sourceEvent = sourceEventId ? findEvent(project, sourceEventId) : undefined;
      if (!sourceEventId || !sourceEvent) {
        setMessage("Only events and outcomes can create runtime transitions.");
        return;
      }

      if (mutations.isTerminalEventType(project, sourceEvent.type)) {
        setMessage("Terminal events cannot create outgoing transitions.");
        return;
      }

      const transitionId = transitionFrom(sourceNode.id, targetEventId, sourceEvent.transitions);
      const transition: Transition = {
        id: transitionId,
        from: sourceNode.data.kind === "outcome" ? sourceNode.id : sourceEventId,
        to: targetEventId,
        label: sourceNode.data.kind === "outcome" ? "outcome transition" : "transition",
        source: "graph",
      };

      updateProject(
        {
          ...project,
          sequences: sequenceId
            ? project.sequences.map((sequence) =>
                sequence.id === sequenceId ? { ...sequence, eventIds: withValue(sequence.eventIds, targetEventId) } : sequence,
              )
            : project.sequences,
          events: project.events.map((event) =>
            event.id === sourceEventId ? { ...event, transitions: [...(event.transitions ?? []), transition] } : event,
          ),
        },
        { type: "edge", id: `edge:transition:${transitionId}` },
      );
    },
    [nodes, project, updateProject],
  );

  const handleNodeDragStop = useCallback(
    (_: MouseEvent | TouchEvent | ReactMouseEvent, node: StoryCanvasNode) => {
      if (!project || node.data.kind !== "event") {
        return;
      }

      const eventId = nodeStoryId(node);
      const sequenceId = activeSequenceId(project);
      if (!eventId || !sequenceId) {
        return;
      }
      const branchNodes = nodes.filter((item) => item.data.kind === "branch");
      const absolute = node.parentId
        ? {
            x: (nodes.find((item) => item.id === node.parentId)?.position.x ?? 0) + node.position.x,
            y: (nodes.find((item) => item.id === node.parentId)?.position.y ?? 0) + node.position.y,
          }
        : node.position;
      const center = {
        x: absolute.x + Number(node.width ?? node.measured?.width ?? 230) / 2,
        y: absolute.y + Number(node.height ?? node.measured?.height ?? 118) / 2,
      };
      const targetBranch = branchNodes.find((branchNode) => isPointInside(branchNode, center.x, center.y));
      const targetBranchId = targetBranch?.id;
      const currentEvent = findEvent(project, eventId);

      if (!currentEvent || (currentEvent.branchRef ?? undefined) === targetBranchId) {
        return;
      }

      updateProject(
        {
          ...project,
          sequences: project.sequences.map((sequence) =>
            sequence.id === sequenceId
              ? {
                  ...sequence,
                  eventIds: withValue(sequence.eventIds, eventId),
                  branchIds: targetBranchId ? withValue(sequence.branchIds, targetBranchId) : sequence.branchIds,
                }
              : sequence,
          ),
          branches: project.branches.map((branch) => {
            if (branch.id === targetBranchId) {
              return { ...branch, eventIds: withValue(branch.eventIds, eventId) };
            }
            if (currentEvent.branchRef && branch.id === currentEvent.branchRef) {
              return { ...branch, eventIds: withoutValue(branch.eventIds, eventId) };
            }
            return branch;
          }),
          events: project.events.map((event) => (event.id === eventId ? { ...event, branchRef: targetBranchId } : event)),
        },
        { type: "node", id: eventId },
      );
    },
    [nodes, project, updateProject],
  );

  const updateEdgeLabel = useCallback(
    (edgeId: string, label: string) => {
      if (!project) {
        return;
      }
      const transitionId = edgeId.startsWith("edge:transition:") ? edgeId.replace("edge:transition:", "") : undefined;
      if (!transitionId) {
        setEdges((currentEdges) =>
          currentEdges.map((edgeItem) =>
            edgeItem.id === edgeId ? { ...edgeItem, label, data: edgeItem.data ? { ...edgeItem.data, label } : edgeItem.data } : edgeItem,
          ),
        );
        return;
      }
      updateProject({
        ...project,
        events: project.events.map((event) => ({
          ...event,
          transitions: event.transitions?.map((transition) =>
            transition.id === transitionId ? { ...transition, label } : transition,
          ),
        })),
      });
    },
    [project, updateProject],
  );

  const resetLayout = useCallback(() => {
    if (!project) {
      return;
    }
    const resetProject = { ...project, canvas: { activeSequenceId: activeSequenceId(project) } };
    const model = buildStoryCanvasModel(resetProject);
    markProjectDirty(resetProject);
    setNodes(model.nodes);
    setEdges(model.edges);
    setFiles(model.files);
  }, [markProjectDirty, project]);

  const deleteSelection = useCallback(
    (targetSelection: Selection) => {
      if (!project || targetSelection.type !== "node") {
        return;
      }

      const id = targetSelection.id;
      const sequence = findSequence(project, id);
      if (sequence) {
        if (project.entrySequenceId === sequence.id || sequence.eventIds.length > 0) {
          setMessage("Sequence deletion is blocked while it is entry or still contains events.");
          return;
        }
        const nextSequences = project.sequences.filter((item) => item.id !== sequence.id);
        updateProject(
          {
            ...project,
            sequences: nextSequences,
            canvas: {
              ...project.canvas,
              activeSequenceId: project.canvas?.activeSequenceId === sequence.id ? nextSequences[0]?.id : project.canvas?.activeSequenceId,
            },
          },
          nextSequences[0] ? { type: "node", id: nextSequences[0].id } : undefined,
        );
        return;
      }

      const branch = findBranch(project, id);
      if (branch) {
        if (branch.eventIds.length > 0) {
          setMessage("Branch deletion is blocked while it still contains events.");
          return;
        }
        updateProject(
          {
            ...project,
            branches: project.branches.filter((item) => item.id !== branch.id),
            sequences: project.sequences.map((item) => ({ ...item, branchIds: withoutValue(item.branchIds, branch.id) })),
          },
          undefined,
        );
        setSelection(undefined);
        return;
      }

      const event = findEvent(project, id);
      if (event) {
        const incoming = project.events.some((item) => item.transitions?.some((transition) => transition.to === event.id));
        const outgoing = (event.transitions ?? []).length > 0;
        const entryOwner = project.sequences.find((item) => item.entryEventId === event.id);
        if (incoming || outgoing || entryOwner) {
          setMessage("Event deletion is blocked while it is connected or used as a sequence entry.");
          return;
        }
        updateProject(
          {
            ...project,
            sequences: project.sequences.map((item) => ({
              ...item,
              eventIds: withoutValue(item.eventIds, event.id),
            })),
            branches: project.branches.map((item) => ({ ...item, eventIds: withoutValue(item.eventIds, event.id) })),
            events: project.events.filter((item) => item.id !== event.id),
          },
          undefined,
        );
        setSelection(undefined);
      }
    },
    [project, updateProject],
  );

  const createKnowledgeObject = useCallback(() => {
    if (!project) {
      return;
    }

    const canonRefId = selection?.type === "canon" ? selection.id : undefined;
    const result = mutations.createKnowledgeObject(project, canonRefId);
    applyProject(result.project, { dirty: true });
    setDataOpen(true);
    if (result.selection) {
      setSelection(result.selection as Selection);
    }
  }, [applyProject, project, selection]);

  const toggleCanon = useCallback(() => {
    setCanonOpen((open) => {
      const nextOpen = !open;
      if (projectRef.current) {
        markProjectDirty({ ...projectRef.current, panels: { ...projectRef.current.panels, canonOpen: nextOpen } });
      }
      return nextOpen;
    });
  }, [markProjectDirty]);

  const toggleFiles = useCallback(() => {
    setFilesOpen((open) => {
      const nextOpen = !open;
      if (projectRef.current) {
        markProjectDirty({ ...projectRef.current, panels: { ...projectRef.current.panels, filesOpen: nextOpen } });
      }
      return nextOpen;
    });
  }, [markProjectDirty]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listen<string>("pathbranching-menu", (event) => {
      switch (event.payload) {
        case "pb:file:open":
          void openProject();
          break;
        case "pb:file:save":
          void saveProject();
          break;
        case "pb:file:save-as":
          void saveProjectAs();
          break;
        case "pb:file:export-runtime":
          void exportRuntime("runtime");
          break;
        case "pb:file:export-ink":
          void exportRuntime("ink");
          break;
        case "pb:file:export-game-data":
          void exportRuntime("gameData");
          break;
        case "pb:edit:undo":
          undoProject();
          break;
        case "pb:edit:redo":
          redoProject();
          break;
        case "pb:view:home":
          setView("home");
          break;
        case "pb:view:workspace":
          setView("workspace");
          break;
        case "pb:view:toggle-canon":
          toggleCanon();
          break;
        case "pb:view:toggle-files":
          toggleFiles();
          break;
        case "pb:view:toggle-data":
          setDataOpen((open) => !open);
          break;
        case "pb:view:toggle-export":
          setExportOpen((open) => !open);
          break;
        case "pb:view:reset-layout":
          resetLayout();
          break;
        case "pb:style:worldnotion":
          changeThemeFamily("worldnotion");
          break;
        case "pb:style:github":
          changeThemeFamily("github");
          break;
        case "pb:style:one":
          changeThemeFamily("one");
          break;
        case "pb:style:dracula":
          changeThemeFamily("dracula");
          break;
        case "pb:style:owl":
          changeThemeFamily("owl");
          break;
        case "pb:style:material":
          changeThemeFamily("material");
          break;
        case "pb:style:toggle-mode":
          toggleTheme();
          break;
        case "pb:help:about":
          setMessage("Everend PathBranching 0.1.0 - branching narrative editor for the Everend Forge suite.");
          break;
        case "pb:help:docs":
          setMessage("Docs live in the PathBranching README and docs folder for now.");
          break;
      }
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
        return;
      }
      unlisten = nextUnlisten;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [
    changeThemeFamily,
    exportRuntime,
    openProject,
    redoProject,
    resetLayout,
    saveProject,
    saveProjectAs,
    toggleCanon,
    toggleFiles,
    toggleTheme,
    undoProject,
  ]);

  const handleFileSelect = useCallback(
    (id: string) => {
      const sequencePrefix = "file:sequence:";
      if (id.startsWith(sequencePrefix)) {
        setActiveSequence(id.slice(sequencePrefix.length));
        return;
      }

      const eventPrefix = "file:event:";
      if (id.startsWith(eventPrefix)) {
        setSelection({ type: "node", id: id.slice(eventPrefix.length) });
        return;
      }

      const branchPrefix = "file:branch:";
      if (id.startsWith(branchPrefix)) {
        setSelection({ type: "node", id: id.slice(branchPrefix.length) });
        return;
      }

      const dataPrefix = "file:data-object:";
      if (id.startsWith(dataPrefix)) {
        setSelection({ type: "dataObject", id: id.slice(dataPrefix.length) });
        setDataOpen(true);
        return;
      }

      setSelection({ type: "file", id });
    },
    [setActiveSequence],
  );

  const resizeCanon = useCallback((width: number) => {
    setCanonWidth(clampPanelWidth(width));
  }, []);

  const resizeStories = useCallback((width: number) => {
    setStoriesWidth(clampPanelWidth(width));
  }, []);

  const settingsModal = showSettings ? (
    <PathBranchingSettingsModal
      project={project}
      fileState={fileState}
      settings={settings}
      findings={findings}
      theme={settings.theme}
      onUpdateEventCategories={updateEventCategories}
      onThemeChange={changeTheme}
      onToggleTheme={toggleTheme}
      onOpenUniverse={openProject}
      onOpenRecentUniverse={openRecentProject}
      onRemoveRecentUniverse={removeRecentProject}
      onClose={() => setShowSettings(false)}
    />
  ) : null;

  if (error) {
    return (
      <>
        <div className="app-shell">
          <Topbar
            fileState={fileState}
            findings={[]}
            exportOpen={exportOpen}
            dataOpen={dataOpen}
            theme={settings.theme}
            onOpenSettings={() => setShowSettings(true)}
            onToggleTheme={toggleTheme}
            onOpenProject={openProject}
            onSaveProject={saveProject}
            onSaveProjectAs={saveProjectAs}
            onExportRuntime={exportRuntime}
            onHome={() => setView("home")}
            onUndo={undoProject}
            onRedo={redoProject}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onCreateSequence={createSequence}
            onValidate={() => setSelection(undefined)}
            onToggleExport={() => setExportOpen((open) => !open)}
            onToggleData={() => setDataOpen((open) => !open)}
            onCreateDataObject={createKnowledgeObject}
            onResetLayout={resetLayout}
          />
          <div className="error-state">{error}</div>
        </div>
        {settingsModal}
        <DiscardChangesDialog open={Boolean(discardDialog)} onDiscard={() => resolveDiscardDialog(true)} onCancel={() => resolveDiscardDialog(false)} />
      </>
    );
  }

  if (initialLoading) {
    return (
      <>
        <div className="app-shell">
          <Topbar
            fileState={fileState}
            findings={[]}
            exportOpen={exportOpen}
            dataOpen={dataOpen}
            theme={settings.theme}
            onOpenSettings={() => setShowSettings(true)}
            onToggleTheme={toggleTheme}
            onOpenProject={openProject}
            onSaveProject={saveProject}
            onSaveProjectAs={saveProjectAs}
            onExportRuntime={exportRuntime}
            onHome={() => setView("home")}
            onUndo={undoProject}
            onRedo={redoProject}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onCreateSequence={createSequence}
            onValidate={() => setSelection(undefined)}
            onToggleExport={() => setExportOpen((open) => !open)}
            onToggleData={() => setDataOpen((open) => !open)}
            onCreateDataObject={createKnowledgeObject}
            onResetLayout={resetLayout}
          />
          <div className="loading-state">
            {settings.lastOpenedProject ? "Loading last universe..." : "Preparing dashboard..."}
          </div>
        </div>
        {settingsModal}
        <DiscardChangesDialog open={Boolean(discardDialog)} onDiscard={() => resolveDiscardDialog(true)} onCancel={() => resolveDiscardDialog(false)} />
      </>
    );
  }

  if (view === "home" || !project) {
    return (
      <>
        <HomeDashboard
          project={project}
          fileState={fileState}
          settings={settings}
          missingRecentProjects={missingRecentProjects}
          findings={findings}
          theme={settings.theme}
          onOpenSettings={() => setShowSettings(true)}
          onToggleTheme={toggleTheme}
          onEnterWorkspace={() => setView("workspace")}
          onOpenProject={openProject}
          onOpenRecentProject={openRecentProject}
          onRemoveRecentProject={removeRecentProject}
          onSaveProject={saveProject}
          onSaveProjectAs={saveProjectAs}
          onExportRuntime={exportRuntime}
        />
        {settingsModal}
        <DiscardChangesDialog open={Boolean(discardDialog)} onDiscard={() => resolveDiscardDialog(true)} onCancel={() => resolveDiscardDialog(false)} />
      </>
    );
  }

  return (
    <>
      <div className="app-shell">
        <Topbar
        project={project}
        fileState={fileState}
        findings={findings}
        exportOpen={exportOpen}
        dataOpen={dataOpen}
        theme={settings.theme}
        onOpenSettings={() => setShowSettings(true)}
        onToggleTheme={toggleTheme}
        onOpenProject={openProject}
        onSaveProject={saveProject}
        onSaveProjectAs={saveProjectAs}
        onExportRuntime={exportRuntime}
        onHome={() => setView("home")}
        onUndo={undoProject}
        onRedo={redoProject}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onCreateSequence={createSequence}
        onValidate={() => setSelection(undefined)}
        onToggleExport={() => setExportOpen((open) => !open)}
        onToggleData={() => setDataOpen((open) => !open)}
        onCreateDataObject={createKnowledgeObject}
        onResetLayout={resetLayout}
      />

        <div
        className={`workspace ${panelResizing ? "resizing" : ""}`}
        style={{
          gridTemplateColumns: `${canonOpen ? canonWidth : COLLAPSED_RAIL_WIDTH}px ${filesOpen ? storiesWidth : COLLAPSED_RAIL_WIDTH}px minmax(0, 1fr)`,
        }}
      >
        <CanonPanel
          project={project}
          open={canonOpen}
          selectedId={selection?.type === "canon" ? selection.id : undefined}
          onToggle={toggleCanon}
          onResize={resizeCanon}
          onResetWidth={() => setCanonWidth(DEFAULT_PANEL_WIDTH)}
          onResizeStateChange={setPanelResizing}
          onSelect={(id) => setSelection({ type: "canon", id })}
        />
        <FilesPanel
          project={project}
          files={files}
          open={filesOpen}
          selectedId={storyExplorerSelectionId(project, selection)}
          onToggle={toggleFiles}
          onResize={resizeStories}
          onResetWidth={() => setStoriesWidth(DEFAULT_PANEL_WIDTH)}
          onResizeStateChange={setPanelResizing}
          onSequenceChange={setActiveSequence}
          onCreateSequence={createSequence}
          onSelect={handleFileSelect}
        />
        <StoryCanvas
          project={project}
          files={files}
          nodes={nodes}
          edges={edges}
          selection={selection}
          findings={findings}
          message={message}
          canvasMode={canvasMode}
          focusNodeId={focusNodeId}
          exportOpen={exportOpen}
          exportPreviewMode={exportPreviewMode}
          dataOpen={dataOpen}
          markdownTabs={markdownTabs}
          activeMarkdownTabId={activeMarkdownTabId}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onNodeDragStop={handleNodeDragStop}
          onSelect={setSelection}
          onEnterFocus={enterFocus}
          onExitFocus={exitFocus}
          onExportPreviewModeChange={setExportPreviewMode}
          onToggleData={() => setDataOpen((open) => !open)}
          onCreateBranch={createBranch}
          onCreateEvent={createEvent}
          onUpdateSequence={updateSequence}
          onSetEntrySequence={setEntrySequence}
          onUpdateBranch={updateBranch}
          onCreateEventInBranch={createEventInBranch}
          onUpdateEvent={updateEvent}
          onCreateDecision={createDecision}
          onUpdateDecision={updateDecision}
          onDeleteDecision={deleteDecision}
          onCreateOutcome={createOutcome}
          onUpdateOutcome={updateOutcome}
          onDeleteOutcome={deleteOutcome}
        onUpdateTransition={updateTransition}
        onDeleteTransition={deleteTransition}
        onUpdateDataObject={updateDataObject}
        onDeleteDataObject={deleteDataObject}
        onEditCanonRef={editCanonRefInBranch}
        onUpdateEdgeLabel={updateEdgeLabel}
        onDeleteSelection={deleteSelection}
          onActivateMarkdownTab={setActiveMarkdownTabId}
          onCloseMarkdownTab={closeMarkdownTab}
          onChangeMarkdownContent={changeMarkdownContent}
          onChangeMarkdownFormat={changeMarkdownFormat}
          onSaveMarkdownTab={saveMarkdownTab}
        />
        </div>
      </div>
      {settingsModal}
      <DiscardChangesDialog open={Boolean(discardDialog)} onDiscard={() => resolveDiscardDialog(true)} onCancel={() => resolveDiscardDialog(false)} />
    </>
  );
}
