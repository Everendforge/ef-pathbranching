import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnConnect,
  type OnConnectEnd,
  type ReactFlowInstance,
} from "@xyflow/react";
import { listen } from "@tauri-apps/api/event";
import {
  canonMarkdownDraft,
  markdownFormatTemplate,
} from "./canonWorkingCopy.js";
import { changeSetPath, createCanonChangeSet } from "./canonChanges.js";
import { CanonWorkingCopyEditor } from "./components/CanonWorkingCopyEditor.js";
import { DataDrawer } from "./components/DataDrawer.js";
import { ReferencePicker } from "./components/ReferencePicker.js";
import { AssetsPanel } from "./components/AssetsPanel.js";
import { LogicPanel } from "./components/LogicPanel.js";
import { PlayerPanel } from "./components/PlayerPanel.js";
import { ExportPanel } from "./components/ExportPanel.js";
import { ConnectPanel } from "./components/ConnectPanel.js";
import { MarkdownEditorDock } from "./components/MarkdownEditorDock.js";
import { editableCanvasEdgeTypes } from "./components/EditableCanvasEdge.js";
import { nodeTypes } from "./components/StoryNode.js";
import { Topbar } from "./components/Topbar.js";
import { UniverseIconFrame } from "./components/UniverseIconFrame.js";
import {
  createLocalExplorerEntity,
  localEntityPath,
  serializeLocalExplorerEntity,
} from "./explorerEntities.js";
import {
  canonExplorerProperties,
  flattenCanonExplorerProperties,
  canonExplorerTypes,
  createLocalExplorerProperty,
  createLocalExplorerType,
} from "./explorerSchema.js";
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Castle,
  CircleDot,
  Database,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  Focus,
  Globe2,
  GitBranch,
  Home,
  Link,
  Maximize2,
  MessageSquare,
  Minimize2,
  Moon,
  OctagonAlert,
  SearchCheck,
  Settings,
  Split,
  SlidersHorizontal,
  Sun,
  Sparkles,
  Upload,
  Pencil,
  Power,
  Trash2,
  X,
} from "lucide-react";
import pathbranchingIcon from "./assets/pathbranching-icon.png";
import {
  useCallback,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type ReactElement,
} from "react";
import type {
  Branch,
  BranchingProject,
  CanvasScope,
  CanonEditSuggestion,
  CanonWorkingCopy,
  CanonRef,
  ConditionInput,
  Consequence,
  DataFieldDefinition,
  Decision,
  DialogueBeat,
  DialogueNode,
  EventCategoryDefinition,
  EventNode,
  EventType,
  LocalExplorerEntity,
  LocalExplorerProperty,
  LocalExplorerType,
  LogicPropertyOverride,
  Outcome,
  ProjectDataObject,
  RuleLibraryRule,
  RuleSetBinding,
  RuleSetPhase,
  RuleSet,
  ScriptBlock,
  Sequence,
  Transition,
  ValidationFinding,
} from "./domain.js";
import { defaultRuleSetPhase, ruleSetPhasesByOwner, type RuleBindingOwnerKind } from "./ruleLibrary.js";
import type {
  AppView,
  CanvasMode,
  MarkdownDraftFormat,
  MarkdownEditorTab,
  InspectorTab,
  Selection,
} from "./appTypes.js";
import {
  createBranchingStory,
  deleteBranchingStory,
  renameBranchingStory,
  saveBranchingDocument,
} from "./documentController.js";
import {
  applyEventDraftToProject,
  createEventDraftFromSelection,
  updateEventDraft,
  type EventDraft,
} from "./eventDraft.js";
import {
  DEFAULT_EVENT_INSPECTOR_STATE,
  closeAllEventInspectorTabs,
  closeEventInspectorTab,
  closeEventInspectorTabsAbove,
  closeEventInspectorTabsBelow,
  closeOtherEventInspectorTabs,
  collapseEventInspectorTab,
  deleteEventInspectorTabGroup,
  loadEventInspectorTabGroup,
  openEventInspectorTab,
  pruneEventInspectorTabGroups,
  pruneEventInspectorState,
  restoreEventInspectorState,
  saveEventInspectorTabGroup,
  type EventInspectorState,
} from "./eventInspectorState.js";
import { buildExportPreview, type ExportPreviewMode } from "./exportPreview.js";
import {
  conditionCount,
  conditionLabels,
  consequenceLabel,
  isConditionSet,
} from "./logic.js";
import { canonRefHasRole, mergeIntegrationConfigs } from "./integrationConfig.js";
import * as mutations from "./projectMutations.js";
import {
  exportRuntimeDialog,
  normalizeProject,
  openUniverseDialog,
  openUniversePath,
  openUniverseStory,
  projectFileName,
  revealUniverseFolder,
  exportTextDialog,
  importUniverseAssets,
  indexCanonAssets,
  saveWorkingCopy,
  saveUniverseTextFile,
  verifyDesktopBridge,
  type ProjectFileState,
} from "./projectPersistence.js";
import {
  workingCopyPathForCanonRef,
  type PathBranchingWorkspace,
  type UniverseProfile,
} from "./pathBranchingWorkspace.js";
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
import {
  activeCanvasScope,
  activeSequenceId,
  canvasScopeKey,
  findBranch,
  findEvent,
  findSequence,
  rootSequenceScope,
} from "./storySelection.js";
import type { SuiteChrome } from "./suiteChrome.js";
import {
  buildPathTree,
  buildSequenceConnectionPreview,
  assignEventToBranch,
  branchesForSequence,
  eventsForBranch,
  type PathTreeNode,
  type StoryOutlineTab,
} from "./storyOutlineModel.js";
import {
  COLLAPSED_RAIL_WIDTH,
  DEFAULT_WORKSPACE_PANEL_COLLAPSED,
  DEFAULT_WORKSPACE_PANEL_VISIBILITY,
  WORKSPACE_PANEL_IDS,
  DEFAULT_EXPLORER_WIDTH,
  DEFAULT_PANEL_WIDTH,
  NEW_SEQUENCE_SELECT_VALUE,
  clampPanelWidth,
  clampExplorerWidth,
  loadSettings,
  normalizeCanvasBackgroundSettings,
  normalizeCanvasLayoutMode,
  normalizeNodeColorSettings,
  normalizeWorkspaceSession,
  rememberRecentProject,
  saveSettings,
  storableMarkdownTabs,
  type AppSettings,
  type CanvasBackgroundSettings,
  type CanvasLayoutMode,
  type EventInspectorTabGroup,
  type NodeColorSettings,
  type PathBranchingWorkspaceSession,
  type WorldNotionBridgeSettings,
  type WorkspacePanelId,
  type WorkspacePanelState,
} from "./workspaceSettings.js";
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

function groupCanon(project: BranchingProject) {
  return project.canonRefs.reduce<Record<string, typeof project.canonRefs>>(
    (groups, ref) => {
      const kind = ref.kind ?? "canon";
      groups[kind] ??= [];
      groups[kind].push(ref);
      return groups;
    },
    {},
  );
}

type FloatingBounds = Pick<DOMRect, "left" | "top" | "right" | "bottom">;

function clampFloatingMenuPosition(
  x: number,
  y: number,
  bounds: FloatingBounds,
  width = 220,
  height = 220,
) {
  const gutter = 8;
  const maxX = Math.max(bounds.left + gutter, bounds.right - width - gutter);
  const maxY = Math.max(bounds.top + gutter, bounds.bottom - height - gutter);
  return {
    x: Math.min(Math.max(x, bounds.left + gutter), maxX),
    y: Math.min(Math.max(y, bounds.top + gutter), maxY),
  };
}

function viewportBounds(): FloatingBounds {
  return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
}

const WORKSPACE_PANEL_LABELS: Record<WorkspacePanelId, string> = {
  outline: "Stories",
  assets: "Assets",
  logic: "Logic",
  player: "Player",
  export: "Export",
  connect: "Connect",
};

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
  return (
    path.replace(/\\/g, "/").split("/").pop()?.replace(/\.md$/i, "") ?? path
  );
}

function canonRefPath(ref: CanonRef) {
  return ref.canonSourcePath ?? ref.id;
}

function searchablePropertyValues(value: unknown): string[] {
  if (value == null) return [];
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap(searchablePropertyValues);
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, nested]) => [key, ...searchablePropertyValues(nested)],
    );
  }
  return [];
}

function canonRefMatches(ref: CanonRef, query: string) {
  if (!query) return true;
  return [
    ref.id,
    ref.label,
    ref.kind,
    ref.status,
    ref.canonSourcePath,
    ref.identityWarning,
    ref.parentId,
    ...(ref.tags ?? []),
    ...(ref.aliases ?? []),
    ...(ref.childrenIds ?? []),
    ...searchablePropertyValues(ref.properties),
    ...searchablePropertyValues(ref.frontmatter),
  ]
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

function universeDisplayName(
  project?: BranchingProject,
  fileState?: ProjectFileState,
) {
  return (
    fileState?.universeProfile?.name ??
    project?.name ??
    project?.projectId ??
    "No universe loaded"
  );
}

function universeDisplayPath(fileState?: ProjectFileState) {
  const universePath = projectFileName(
    fileState?.universePath ?? fileState?.path,
  );
  const storyPath = projectFileName(fileState?.storyPath ?? fileState?.path);
  return [universePath, storyPath].filter(Boolean).join(" / ");
}

function workspaceLoadWarningMessage(workspace: PathBranchingWorkspace) {
  return workspace.loadWarnings?.length
    ? workspace.loadWarnings.join(" ")
    : undefined;
}

function updateProjectCanvas(
  project: BranchingProject,
  nodes: StoryCanvasNode[],
  scope = activeCanvasScope(project),
): BranchingProject {
  const scopeKey = scope ? canvasScopeKey(scope) : undefined;
  const nextNodes = Object.fromEntries(
    nodes.map((node) => [
      node.id,
      {
        ...(scopeKey
          ? project.canvas?.scopes?.[scopeKey]?.nodes?.[node.id]
          : project.canvas?.nodes?.[node.id]),
        position: node.position,
      },
    ]),
  );
  return {
    ...project,
    canvas: {
      ...project.canvas,
      nodes:
        scope?.kind === "sequence" || !scope
          ? {
              ...(project.canvas?.nodes ?? {}),
              ...nextNodes,
            }
          : project.canvas?.nodes,
      scopes: scopeKey
        ? {
            ...(project.canvas?.scopes ?? {}),
            [scopeKey]: {
              ...(project.canvas?.scopes?.[scopeKey] ?? {}),
              nodes: {
                ...(project.canvas?.scopes?.[scopeKey]?.nodes ?? {}),
                ...nextNodes,
              },
            },
          }
        : project.canvas?.scopes,
    },
  };
}

type CanvasPoint = { x: number; y: number };

function snapCanvasPoint(
  point: CanvasPoint,
  snapToGrid: boolean,
  gridSize: number,
): CanvasPoint {
  if (!snapToGrid) return point;
  const size = Math.max(1, gridSize);
  return {
    x: Math.round(point.x / size) * size,
    y: Math.round(point.y / size) * size,
  };
}

function eventDepthsForSequence(project: BranchingProject, sequence: Sequence) {
  const depths = new Map<string, number>();
  const eventIds = new Set(sequence.eventIds);
  const queue: string[] = [];
  const entryId =
    sequence.entryEventId && eventIds.has(sequence.entryEventId)
      ? sequence.entryEventId
      : sequence.eventIds[0];
  if (entryId) {
    depths.set(entryId, 0);
    queue.push(entryId);
  }

  while (queue.length) {
    const eventId = queue.shift() as string;
    const depth = depths.get(eventId) ?? 0;
    const eventNode = findEvent(project, eventId);
    eventNode?.transitions?.forEach((transition) => {
      if (!eventIds.has(transition.to)) return;
      const nextDepth = depth + 1;
      if (!depths.has(transition.to)) {
        depths.set(transition.to, nextDepth);
        queue.push(transition.to);
      }
    });
  }

  sequence.eventIds.forEach((eventId, index) => {
    if (!depths.has(eventId)) {
      depths.set(eventId, index);
    }
  });

  return depths;
}

function canvasLayoutPositions(
  project: BranchingProject,
  mode: CanvasLayoutMode,
  snapToGrid: boolean,
  gridSize: number,
) {
  const sequenceId = activeSequenceId(project);
  const sequence = sequenceId ? findSequence(project, sequenceId) : undefined;
  if (!sequence) return {};

  const positions: Record<string, CanvasPoint> = {};
  const activeEvents = sequence.eventIds
    .map((eventId) => findEvent(project, eventId))
    .filter((eventNode): eventNode is EventNode => Boolean(eventNode));
  const point = (x: number, y: number) =>
    snapCanvasPoint({ x, y }, snapToGrid, gridSize);
  const startId = `start:${sequence.id}`;
  positions[startId] = point(80, 80);

  if (mode === "timeline") {
    activeEvents.forEach((eventNode, index) => {
      positions[eventNode.id] = point(360, 80 + index * 188);
    });
    return positions;
  }

  if (mode === "branches") {
    const branchIds = Array.from(
      new Set([
        ...(sequence.branchIds ?? []),
        ...activeEvents
          .map((eventNode) => eventNode.branchRef)
          .filter((branchId): branchId is string => Boolean(branchId)),
      ]),
    );
    const lanes = [...branchIds, "__unbranched__"];
    const laneCounts = new Map<string, number>();
    activeEvents.forEach((eventNode, sequenceIndex) => {
      const laneId =
        eventNode.branchRef && branchIds.includes(eventNode.branchRef)
          ? eventNode.branchRef
          : "__unbranched__";
      const laneIndex = lanes.indexOf(laneId);
      const indexInLane = laneCounts.get(laneId) ?? 0;
      laneCounts.set(laneId, indexInLane + 1);
      positions[eventNode.id] = point(
        360 + indexInLane * 292,
        80 + Math.max(0, laneIndex) * 190 + (sequenceIndex % 2) * 10,
      );
    });
    return positions;
  }

  const depths = eventDepthsForSequence(project, sequence);
  const depthCounts = new Map<number, number>();
  activeEvents
    .slice()
    .sort((left, right) => {
      const depthDelta =
        (depths.get(left.id) ?? 0) - (depths.get(right.id) ?? 0);
      if (depthDelta !== 0) return depthDelta;
      return (
        sequence.eventIds.indexOf(left.id) - sequence.eventIds.indexOf(right.id)
      );
    })
    .forEach((eventNode) => {
      const depth = depths.get(eventNode.id) ?? 0;
      const indexInDepth = depthCounts.get(depth) ?? 0;
      depthCounts.set(depth, indexInDepth + 1);
      positions[eventNode.id] = point(
        360 + depth * 292,
        80 + indexInDepth * 176,
      );
    });
  return positions;
}

function applyCanvasLayoutToProject(
  project: BranchingProject,
  mode: CanvasLayoutMode,
  options: { snapToGrid: boolean; gridSize: number },
): BranchingProject {
  const layoutPositions = canvasLayoutPositions(
    project,
    mode,
    options.snapToGrid,
    options.gridSize,
  );
  const nextNodes = {
    ...(project.canvas?.nodes ?? {}),
    ...Object.fromEntries(
      Object.entries(layoutPositions).map(([id, position]) => [
        id,
        {
          ...(project.canvas?.nodes?.[id] ?? {}),
          position,
        },
      ]),
    ),
  };
  return {
    ...project,
    canvas: {
      ...project.canvas,
      activeSequenceId: activeSequenceId(project),
      nodes: nextNodes,
    },
  };
}

function canonDisplay(project: BranchingProject, id: string) {
  const ref = project.canonRefs.find((canonRef) => canonRef.id === id);
  return ref ? `${ref.kind ?? "canon"} - ${ref.id}` : id;
}

function eventIdFromSelection(
  project: BranchingProject,
  nodes: StoryCanvasNode[],
  selection?: Selection,
): string | undefined {
  if (!selection) return undefined;
  if (selection.type === "node") {
    if (findEvent(project, selection.id)) return selection.id;
    const node = nodes.find((candidate) => candidate.id === selection.id);
    const ownerEventId =
      typeof node?.data.details?.eventId === "string"
        ? node.data.details.eventId
        : undefined;
    if (ownerEventId && findEvent(project, ownerEventId)) return ownerEventId;
  }
  if (selection.type === "file" && selection.id.startsWith("file:event:")) {
    const eventId = selection.id.slice("file:event:".length);
    return findEvent(project, eventId) ? eventId : undefined;
  }
  return undefined;
}

function storyExplorerSelectionId(
  project: BranchingProject,
  selection?: Selection,
) {
  if (selection?.type === "file") return selection.id;
  if (selection?.type === "dataObject")
    return `file:data-object:${selection.id}`;
  if (selection?.type === "node") {
    if (project.sequences.some((sequence) => sequence.id === selection.id))
      return `file:sequence:${selection.id}`;
    if (project.branches.some((branch) => branch.id === selection.id))
      return `file:branch:${selection.id}`;
    if (project.events.some((event) => event.id === selection.id))
      return `file:event:${selection.id}`;
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
  return typeof node?.data.storyObjectId === "string"
    ? node.data.storyObjectId
    : node?.id;
}

function ownerEventIdForNode(node: StoryCanvasNode | undefined) {
  if (!node) {
    return undefined;
  }
  if (node.data.kind === "event") {
    return nodeStoryId(node);
  }
  return typeof node.data.details?.eventId === "string"
    ? node.data.details.eventId
    : undefined;
}

function transitionFrom(
  sourceId: string,
  targetId: string,
  existing: Transition[] | undefined,
) {
  const count =
    (existing ?? []).filter((transition) => transition.to === targetId).length +
    1;
  return uniqueId(
    `transition:${sourceId}:${targetId}:${count}`,
    (existing ?? []).map((transition) => transition.id),
  );
}

function isPointInside(node: StoryCanvasNode, x: number, y: number) {
  const width = Number(
    node.width ?? node.measured?.width ?? node.style?.width ?? 0,
  );
  const height = Number(
    node.height ?? node.measured?.height ?? node.style?.height ?? 0,
  );
  return (
    x >= node.position.x &&
    x <= node.position.x + width &&
    y >= node.position.y &&
    y <= node.position.y + height
  );
}

function canvasGraph(
  nodes: StoryCanvasNode[],
  edges: StoryCanvasEdge[],
  mode: CanvasMode,
  focusNodeId: string | undefined,
) {
  if (mode === "branching") {
    const visibleKinds = new Set<StoryCanvasNodeData["kind"]>([
      "sequence",
      "start",
      "branch",
      "event",
    ]);
    const visibleEdgeKinds = new Set<StoryCanvasEdgeData["kind"]>([
      "entry",
      "transition",
    ]);
    const visibleNodes = nodes.filter((node) =>
      visibleKinds.has(node.data.kind),
    );
    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    return {
      nodes: visibleNodes,
      edges: edges.filter((edgeItem) => {
        const kind = edgeItem.data?.kind;
        return Boolean(
          kind &&
          visibleEdgeKinds.has(kind) &&
          visibleIds.has(edgeItem.source) &&
          visibleIds.has(edgeItem.target),
        );
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
        focusState:
          node.id === focusNodeId
            ? "focused"
            : adjacentIds.has(node.id)
              ? "adjacent"
              : "dimmed",
      },
    })),
    edges: edges.map((edgeItem) => {
      const direct =
        edgeItem.source === focusNodeId || edgeItem.target === focusNodeId;
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

function canvasBreadcrumb(
  project: BranchingProject,
  scope: CanvasScope | undefined,
): Array<{ scope: CanvasScope; label: string }> {
  const sequenceScope = rootSequenceScope(project);
  const sequence = sequenceScope
    ? findSequence(project, sequenceScope.id)
    : undefined;
  const crumbs: Array<{ scope: CanvasScope; label: string }> = sequenceScope
    ? [{ scope: sequenceScope, label: sequence?.name ?? "Sequence" }]
    : [];
  if (scope?.kind !== "event" && scope?.kind !== "dialogue") {
    return crumbs;
  }

  const eventChain: EventNode[] = [];
  let cursor = findEvent(project, scope.kind === "dialogue" ? scope.eventId : scope.id);
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    eventChain.unshift(cursor);
    cursor = cursor.parentEventId
      ? findEvent(project, cursor.parentEventId)
      : undefined;
  }

  eventChain.forEach((eventNode) => {
    crumbs.push({
      scope: { kind: "event", id: eventNode.id },
      label: eventNode.name,
    });
  });
  if (scope.kind === "dialogue") {
    const owner = findEvent(project, scope.eventId);
    const dialogue = owner?.dialogues?.find((item) => item.id === scope.id);
    crumbs.push({ scope, label: dialogue?.title ?? "Dialogue" });
  }
  return crumbs;
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
  if (
    type === "multiSelect" ||
    type === "canonRefList" ||
    type === "dataRefList"
  ) {
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
  ruleSetBindings,
}: {
  title?: string;
  availability?: ConditionInput;
  consequences?: Consequence[];
  ruleSets?: RuleSet[];
  ruleSetBindings?: RuleSetBinding[];
}) {
  const availabilityCount = conditionCount(availability);

  return (
    <section className="inspector-section">
      <h2>{title ?? "Logic"}</h2>
      <div className="logic-grid">
        <div className="mini-card">
          <strong>Conditions</strong>
          <span>
            {availabilityCount > 0
              ? conditionSummary(availability)
              : "No conditions (always valid)."}
          </span>
        </div>
        <div className="mini-card">
          <strong>Consequences</strong>
          <span>{consequenceSummary(consequences)}</span>
        </div>
        <div className="mini-card">
          <strong>RuleSets</strong>
          <span>
            {ruleSetBindings?.length || ruleSets?.length
              ? `${ruleSetBindings?.length ?? ruleSets?.length} shared rule(s)`
              : "No advanced rules."}
          </span>
        </div>
      </div>
      {ruleSets?.length ? (
        <div className="stack-list">
          {ruleSets.map((ruleSet) => (
            <div className="mini-card" key={ruleSet.id}>
              <strong>{ruleSet.label ?? ruleSet.id}</strong>
              <span>when: {conditionSummary(ruleSet.when)}</span>
              <span>then: {consequenceSummary(ruleSet.then)}</span>
              {ruleSet.else?.length ? (
                <span>else: {consequenceSummary(ruleSet.else)}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function firstSimpleCondition(
  input: ConditionInput | undefined,
): Record<string, unknown> | undefined {
  if (!input) {
    return undefined;
  }
  const expression = Array.isArray(input) ? input[0] : input;
  if ("all" in expression || "any" in expression || "not" in expression) {
    return undefined;
  }
  return expression;
}

function firstConditionSetChild(
  input: ConditionInput | undefined,
): ConditionInput | undefined {
  if (!input) {
    return undefined;
  }
  const expression = Array.isArray(input) ? input[0] : input;
  if (!isConditionSet(expression)) {
    return undefined;
  }
  if ("all" in expression) {
    return expression.all[0];
  }
  if ("any" in expression) {
    return expression.any[0];
  }
  if ("not" in expression) {
    return expression.not;
  }
  return undefined;
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
  label = "Conditions",
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
              onChange({
                type: "variable",
                name: "flag",
                operator: "==",
                value: true,
              });
            } else if (nextType === "canonProperty") {
              onChange({
                type: "canonProperty",
                ref: canonRefs[0] ?? "",
                property: "affiliation",
                operator: "==",
                value: "",
              });
            } else if (nextType === "canonState") {
              onChange({
                type: "canonState",
                ref: canonRefs[0] ?? "",
                state: "known",
                operator: "==",
                value: true,
              });
            } else if (nextType === "dataObjectExists") {
              onChange({
                type: "dataObjectExists",
                objectId: dataObjects[0]?.id ?? "",
              });
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
          <option value="canonProperty">canon property</option>
          <option value="canonState">canon runtime state</option>
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
          <span>
            {type === "not"
              ? "Negates the child condition."
              : `Evaluates the child condition as part of a ${type} set.`}
          </span>
          <BasicConditionEditor
            label="Child Condition"
            value={firstConditionSetChild(value)}
            canonRefs={canonRefs}
            dataObjects={dataObjects}
            onChange={(child) => {
              const nextChild = child ?? defaultCanonCondition(canonRefs);
              if (type === "all") {
                onChange({
                  all: Array.isArray(nextChild) ? nextChild : [nextChild],
                });
              } else if (type === "any") {
                onChange({
                  any: Array.isArray(nextChild) ? nextChild : [nextChild],
                });
              } else {
                onChange({
                  not: Array.isArray(nextChild)
                    ? (nextChild[0] ?? defaultCanonCondition(canonRefs))
                    : nextChild,
                });
              }
            }}
          />
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
            onChange={(event) =>
              onChange({ type: "canonEntryUnlocked", ref: event.target.value })
            }
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

      {type === "canonProperty" ? (
        <div className="logic-grid">
          <label className="field-label">
            Canon Ref
            <select
              value={String(condition?.ref ?? "")}
              onChange={(event) =>
                onChange({
                  type: "canonProperty",
                  ref: event.target.value,
                  property: String(condition?.property ?? "affiliation"),
                  operator: "==",
                  value: condition?.value ?? "",
                })
              }
            >
              <option value="">missing ref</option>
              {canonRefs.map((ref) => <option key={ref} value={ref}>{ref}</option>)}
            </select>
          </label>
          <label className="field-label">
            Property
            <input
              value={String(condition?.property ?? "")}
              onChange={(event) =>
                onChange({
                  type: "canonProperty",
                  ref: String(condition?.ref ?? ""),
                  property: event.target.value,
                  operator: "==",
                  value: condition?.value ?? "",
                })
              }
            />
          </label>
          <label className="field-label">
            Value
            <input
              value={String(condition?.value ?? "")}
              onChange={(event) =>
                onChange({
                  type: "canonProperty",
                  ref: String(condition?.ref ?? ""),
                  property: String(condition?.property ?? "affiliation"),
                  operator: "==",
                  value: event.target.value,
                })
              }
            />
          </label>
        </div>
      ) : null}

      {type === "canonState" ? (
        <div className="logic-grid">
          <label className="field-label">
            Canon Ref
            <select
              value={String(condition?.ref ?? "")}
              onChange={(event) =>
                onChange({
                  type: "canonState",
                  ref: event.target.value,
                  state: String(condition?.state ?? "known"),
                  operator: "==",
                  value: condition?.value ?? true,
                })
              }
            >
              <option value="">missing ref</option>
              {canonRefs.map((ref) => <option key={ref} value={ref}>{ref}</option>)}
            </select>
          </label>
          <label className="field-label">
            State
            <input
              value={String(condition?.state ?? "")}
              onChange={(event) =>
                onChange({
                  type: "canonState",
                  ref: String(condition?.ref ?? ""),
                  state: event.target.value,
                  operator: "==",
                  value: condition?.value ?? true,
                })
              }
            />
          </label>
          <label className="field-label">
            Value
            <input
              value={String(condition?.value ?? "")}
              onChange={(event) =>
                onChange({
                  type: "canonState",
                  ref: String(condition?.ref ?? ""),
                  state: String(condition?.state ?? "known"),
                  operator: "==",
                  value: event.target.value,
                })
              }
            />
          </label>
        </div>
      ) : null}

      {type === "variable" ? (
        <div className="logic-grid">
          <label className="field-label">
            Variable
            <input
              value={String(condition?.name ?? "")}
              onChange={(event) =>
                onChange({
                  type: "variable",
                  name: event.target.value,
                  operator: "==",
                  value: condition?.value ?? true,
                })
              }
            />
          </label>
          <label className="field-label">
            Value
            <input
              value={String(condition?.value ?? "")}
              onChange={(event) =>
                onChange({
                  type: "variable",
                  name: String(condition?.name ?? "flag"),
                  operator: "==",
                  value: event.target.value,
                })
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
            onChange={(event) =>
              onChange({
                type: "dataObjectExists",
                objectId: event.target.value,
              })
            }
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
                onChange({
                  type: "visited",
                  targetType: event.target.value as
                    "sequence" | "branch" | "event" | "decision" | "outcome",
                  targetId: String(condition?.targetId ?? ""),
                })
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
                onChange({
                  type: "visited",
                  targetType:
                    (condition?.targetType as
                      | "sequence"
                      | "branch"
                      | "event"
                      | "decision"
                      | "outcome") ?? "event",
                  targetId: event.target.value,
                })
              }
            />
          </label>
        </div>
      ) : null}
    </section>
  );
}

function TransitionConditionEditor({
  value,
  canonRefs,
  dataObjects,
  onChange,
}: {
  value?: ConditionInput;
  canonRefs: string[];
  dataObjects: ProjectDataObject[];
  onChange: (value: ConditionInput | undefined) => void;
}) {
  if (!value) {
    return (
      <section className="inspector-section transition-condition-empty">
        <h2>Condition</h2>
        <p className="inspector-connection-hint">None — this route is always eligible.</p>
        <button
          type="button"
          onClick={() =>
            onChange({ type: "variable", name: "flag", operator: "==", value: true })
          }
        >
          Add If
        </button>
      </section>
    );
  }

  return (
    <BasicConditionEditor
      label="If"
      value={value}
      canonRefs={canonRefs}
      dataObjects={dataObjects}
      onChange={onChange}
    />
  );
}

function InspectorContentTabs({
  value,
  tabs,
  onChange,
}: {
  value: string;
  tabs: Array<{ id: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <nav className="inspector-subtabs" aria-label="Inspector sections">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={value === tab.id ? "active" : ""}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
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
    onChange(
      consequences.map((item, itemIndex) =>
        itemIndex === index ? consequence : item,
      ),
    );
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
                    update(index, {
                      type: "unlockCanonEntry",
                      ref: canonRefs[0] ?? "",
                    });
                  } else if (nextType === "unlockDataObject") {
                    update(index, {
                      type: "unlockDataObject",
                      objectId: dataObjects[0]?.id ?? "",
                    });
                  } else if (nextType === "setVariable") {
                    update(index, {
                      type: "setVariable",
                      name: "flag",
                      value: true,
                    });
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
                <select
                  value={String(consequence.ref ?? "")}
                  onChange={(event) =>
                    update(index, { ...consequence, ref: event.target.value })
                  }
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
            {consequence.type === "unlockDataObject" ? (
              <label className="field-label">
                Data Object
                <select
                  value={String(consequence.objectId ?? "")}
                  onChange={(event) =>
                    update(index, {
                      ...consequence,
                      objectId: event.target.value,
                    })
                  }
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
            {consequence.type === "setVariable" ? (
              <div className="logic-grid">
                <label className="field-label">
                  Variable
                  <input
                    value={String(consequence.name ?? "")}
                    onChange={(event) =>
                      update(index, {
                        ...consequence,
                        name: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="field-label">
                  Value
                  <input
                    value={String(consequence.value ?? "")}
                    onChange={(event) =>
                      update(index, {
                        ...consequence,
                        value: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            ) : null}
            {consequence.type === "engineSignal" ? (
              <label className="field-label">
                Signal
                <input
                  value={String(consequence.name ?? "")}
                  onChange={(event) =>
                    update(index, { ...consequence, name: event.target.value })
                  }
                />
              </label>
            ) : null}
            <button
              type="button"
              className="danger"
              onClick={() =>
                onChange(
                  consequences.filter((_, itemIndex) => itemIndex !== index),
                )
              }
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="inspector-actions">
        <button
          type="button"
          onClick={() =>
            onChange([
              ...consequences,
              { type: "unlockCanonEntry", ref: canonRefs[0] ?? "" },
            ])
          }
        >
          Add Consequence
        </button>
      </div>
    </section>
  );
}

function RuleSetBindingEditor({ project, value, ownerKind, onChange, onOpenRule }: {
  project: BranchingProject; value?: RuleSetBinding[]; ownerKind: RuleBindingOwnerKind;
  onChange: (value: RuleSetBinding[] | undefined) => void; onOpenRule: (id: string) => void;
}) {
  const bindings = [...(value ?? [])].sort((left, right) => left.order - right.order);
  const rules = project.ruleLibrary?.rules ?? [];
  const phases = ruleSetPhasesByOwner[ownerKind];
  const update = (index: number, changes: Partial<RuleSetBinding>) => onChange(bindings.map((binding, position) => position === index ? { ...binding, ...changes } : binding).map((binding, order) => ({ ...binding, order })));
  return <section className="inspector-section"><h2>Rulesets</h2><p className="inspector-connection-hint">Shared actions from Logic. They never select a route; Route Gate owns navigation.</p>
    <div className="stack-list">{bindings.map((binding, index) => <div className="mini-card" key={binding.id}>
      <label className="field-label">Rule<select value={binding.ruleId} onChange={(event) => update(index, { ruleId: event.target.value })}><option value="">Select rule…</option>{rules.map((rule) => <option value={rule.id} key={rule.id}>{rule.label ?? rule.id}</option>)}</select></label>
      <label className="field-label">Phase<select value={binding.phase} onChange={(event) => update(index, { phase: event.target.value as RuleSetPhase })}>{phases.map((phase) => <option key={phase} value={phase}>{phase}</option>)}</select></label>
      <div className="inspector-actions"><button type="button" disabled={index === 0} onClick={() => onChange(bindings.map((item, position) => position === index ? { ...item, order: index - 1 } : position === index - 1 ? { ...item, order: index } : item))}>Move up</button><button type="button" disabled={index === bindings.length - 1} onClick={() => onChange(bindings.map((item, position) => position === index ? { ...item, order: index + 1 } : position === index + 1 ? { ...item, order: index } : item))}>Move down</button><button type="button" onClick={() => onOpenRule(binding.ruleId)}>Open in Logic</button><button type="button" className="danger" onClick={() => onChange(bindings.filter((_, position) => position !== index).map((item, order) => ({ ...item, order })))}>Remove</button></div>
    </div>)}</div>
    <div className="inspector-actions"><button type="button" disabled={!rules.length} onClick={() => onChange([...bindings, { id: `rule-binding:${crypto.randomUUID()}`, ruleId: rules[0]?.id ?? "", phase: defaultRuleSetPhase[ownerKind], order: bindings.length }])}>Add shared rule</button></div>
  </section>;
}

function LocalRuleSetEditor({ value, canonRefs, dataObjects, onChange }: { value?: RuleSet[]; canonRefs: string[]; dataObjects: ProjectDataObject[]; onChange: (value: RuleSet[] | undefined) => void }) {
  const rules = value ?? [];
  return <section className="inspector-section"><h2>Rulesets</h2><p className="inspector-connection-hint">Local if/then/else actions for this item. Route Gate remains responsible for navigation.</p>
    <div className="stack-list">{rules.map((rule, index) => <div className="mini-card" key={rule.id}>
      <label className="field-label">Name<input value={rule.label ?? rule.id} onChange={(event) => onChange(rules.map((item, position) => position === index ? { ...item, label: event.target.value } : item))} /></label>
      <BasicConditionEditor label="If" value={rule.when} canonRefs={canonRefs} dataObjects={dataObjects} onChange={(when) => onChange(rules.map((item, position) => position === index ? { ...item, when: when ?? { all: [] } } : item))} />
      <ConsequenceEditor title="Then" value={rule.then} canonRefs={canonRefs} dataObjects={dataObjects} onChange={(then) => onChange(rules.map((item, position) => position === index ? { ...item, then: then ?? [] } : item))} />
      <ConsequenceEditor title="Else" value={rule.else} canonRefs={canonRefs} dataObjects={dataObjects} onChange={(elseConsequences) => onChange(rules.map((item, position) => position === index ? { ...item, else: elseConsequences } : item))} />
      <button type="button" className="danger" onClick={() => onChange(rules.filter((_, position) => position !== index))}>Remove Rule</button>
    </div>)}</div>
    <div className="inspector-actions"><button type="button" onClick={() => onChange([...rules, { id: `rule:${crypto.randomUUID()}`, label: "New local rule", when: { all: [] }, then: [] }])}>Add local rule</button></div>
  </section>;
}

function RuleLibraryEditor({ rule, canonRefs, dataObjects, onChange }: { rule?: RuleLibraryRule; canonRefs: string[]; dataObjects: ProjectDataObject[]; onChange: (rule: RuleLibraryRule) => void }) {
  if (!rule) return null;
  return <section className="inspector-section"><h2>Rule editor</h2>
    <label className="field-label">Name<input value={rule.label ?? ""} onChange={(event) => onChange({ ...rule, label: event.target.value })} /></label>
    <label className="field-label">Tags<input value={(rule.tags ?? []).join(", ")} placeholder="combat, quest" onChange={(event) => onChange({ ...rule, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} /></label>
    <BasicConditionEditor label="When" value={rule.when} canonRefs={canonRefs} dataObjects={dataObjects} onChange={(when) => onChange({ ...rule, when: when ?? { all: [] } })} />
    <ConsequenceEditor title="Then" value={rule.then} canonRefs={canonRefs} dataObjects={dataObjects} onChange={(then) => onChange({ ...rule, then: then ?? [] })} />
    <ConsequenceEditor title="Else" value={rule.else} canonRefs={canonRefs} dataObjects={dataObjects} onChange={(elseConsequences) => onChange({ ...rule, else: elseConsequences })} />
  </section>;
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
            .some((candidate) =>
              String(candidate).toLowerCase().includes(normalizedQuery),
            ),
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
        if (
          event.dataTransfer.types.includes(
            "application/x-pathbranching-canon-ref",
          ) ||
          event.dataTransfer.types.includes("text/plain")
        ) {
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
              <button
                key={ref.id}
                type="button"
                disabled={refSet.has(ref.id)}
                onClick={() => addRef(ref.id)}
              >
                <strong>{ref.label ?? ref.id}</strong>
                <span>{ref.kind ?? "canon"}</span>
              </button>
            ))}
            {matches.length === 0 ? (
              <span className="empty-line">No canon refs found.</span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="tag-list canon-ref-chips">
        {refs.map((ref) => (
          <button
            key={ref}
            type="button"
            onClick={() => removeRef(ref)}
            title="Remove canon ref"
          >
            {canonRefs.find((canonRef) => canonRef.id === ref)?.label ?? ref}
          </button>
        ))}
        {refs.length === 0 ? (
          <span className="empty-line">
            Drop canon refs here or search to add them.
          </span>
        ) : null}
      </div>
    </div>
  );
}

function CanonContextList({
  title = "WorldNotion Context",
  refs,
  canonRefs,
  onSelectCanon,
  onSuggestEdit,
}: {
  title?: string;
  refs?: string[];
  canonRefs: CanonRef[];
  onSelectCanon: (id: string) => void;
  onSuggestEdit: (id: string) => void;
}) {
  const linkedRefs = (refs ?? [])
    .map((id) => canonRefs.find((ref) => ref.id === id))
    .filter((ref): ref is CanonRef => Boolean(ref));

  return (
    <section className="inspector-section canon-context-list">
      <h2>{title}</h2>
      <div className="stack-list">
        {linkedRefs.map((ref) => (
          <div className="mini-card canon-context-card" key={ref.id}>
            <strong>{ref.label ?? ref.id}</strong>
            <span>
              {ref.kind ?? "canon"} - {ref.canonSourcePath ?? ref.id}
            </span>
            {ref.missingIdentity ? (
              <span className="warning-text">
                {ref.identityWarning ?? "Missing WorldNotion identity."}
              </span>
            ) : null}
            {ref.preview ? (
              <p>
                {ref.preview.slice(0, 180)}
                {ref.preview.length > 180 ? "..." : ""}
              </p>
            ) : null}
            <div className="inspector-actions wrap">
              <button type="button" onClick={() => onSelectCanon(ref.id)}>
                Preview Canon
              </button>
              <button type="button" onClick={() => onSuggestEdit(ref.id)}>
                Suggest Edit
              </button>
            </div>
          </div>
        ))}
        {linkedRefs.length === 0 ? (
          <span className="empty-line">
            Add canon refs to pull live WorldNotion context into this story
            object.
          </span>
        ) : null}
      </div>
    </section>
  );
}

function HomeDashboard({
  project,
  workspace,
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
  onExportRuntime,
}: {
  project?: BranchingProject;
  workspace?: PathBranchingWorkspace;
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
  onExportRuntime: () => void;
}) {
  const activeSequence =
    project?.sequences.find(
      (sequence) => sequence.id === activeSequenceId(project),
    ) ?? project?.sequences[0];
  const hasTransientStory = Boolean(workspace?.createdDefaultStory);
  const canEnterWorkspace = Boolean(project);
  const documentStatus = !project
    ? "No universe"
    : hasTransientStory
      ? "No story yet"
      : "Ready";

  return (
    <main className="home-shell">
      <header className="home-topbar">
        <div className="brand">
          <img
            className="app-brand-icon"
            src={pathbranchingIcon}
            alt=""
            aria-hidden="true"
          />
          <div>
            <h1>Pathbranching</h1>
            <p>Story-flow authoring workspace</p>
          </div>
        </div>
        <div className="home-topbar-actions">
          <button
            type="button"
            className="dock-icon-button"
            onClick={onOpenSettings}
            title="Pathbranching settings"
          >
            <Settings size={15} />
          </button>
          <button
            type="button"
            className="dock-icon-button"
            onClick={onToggleTheme}
            title={`Toggle theme (${themeById(theme).label})`}
          >
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
              Pathbranching reads the same universe folder as Worldnotion,
              previews its Markdown canon, and stores branching stories in
              `.everend/.pathbranching`.
            </p>
          </div>

          {project ? (
            <button
              type="button"
              className="active-project-card"
              onClick={onEnterWorkspace}
            >
              <UniverseIconFrame profile={fileState.universeProfile} size={34} />
              <span>
                <strong>
                  {fileState.universeProfile?.name ??
                    project.name ??
                    project.projectId}
                </strong>
                <small>
                  {projectFileName(fileState.universePath)} - {documentStatus}
                </small>
              </span>
              <Home size={16} />
            </button>
          ) : null}
        </div>

        <div className="home-actions">
          <button
            type="button"
            className="primary-action"
            onClick={onOpenProject}
          >
            <FolderOpen size={16} />
            Open Universe
          </button>
          <button
            type="button"
            onClick={onEnterWorkspace}
            disabled={!canEnterWorkspace}
          >
            <GitBranch size={16} />
            Workspace
          </button>
          <button
            type="button"
            onClick={onExportRuntime}
            disabled={!canEnterWorkspace}
          >
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
            <strong>{documentStatus}</strong>
            <span>Document</span>
          </div>
        </div>

        {findings.length ? (
          <section className="dashboard-findings">
            <h3>Validation</h3>
            <div className="stack-list">
              {findings.slice(0, 5).map((finding) => (
                <div
                  className={`finding ${finding.severity}`}
                  key={`${finding.code}:${finding.id ?? ""}:${finding.ref ?? ""}`}
                >
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
                <div
                  key={path}
                  className={`recent-row ${missingRecentProjects.has(path) ? "missing" : ""}`}
                  style={{ animationDelay: `${120 + itemIndex * 45}ms` }}
                >
                  <button
                    type="button"
                    className="recent-open-button"
                    onClick={() =>
                      missingRecentProjects.has(path)
                        ? onRemoveRecentProject(path)
                        : onOpenRecentProject(path)
                    }
                  >
                    <span className="recent-icon">
                      <GitBranch size={16} />
                    </span>
                    <span>
                      <strong>{projectFileName(path)}</strong>
                      <small>
                        {missingRecentProjects.has(path)
                          ? "Missing folder"
                          : path}
                      </small>
                    </span>
                    <FolderOpen size={14} />
                  </button>
                  <button
                    type="button"
                    className="recent-remove-button"
                    onClick={() => onRemoveRecentProject(path)}
                    title="Remove recent universe"
                  >
                    <X size={14} />
                  </button>
                </div>
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
        <p>This event has unsaved edits. Discard them and continue?</p>
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

function EventDraftChangesDialog({
  open,
  description = "This event has unsaved text or component edits. Save them before changing selection?",
  onSave,
  onDiscard,
  onCancel,
}: {
  open: boolean;
  description?: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <section className="modal-dialog">
        <h2>Unsaved event edits</h2>
        <p>{description}</p>
        <div className="inspector-actions">
          <button type="button" onClick={onSave}>
            Save
          </button>
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

function NamePromptDialog({
  open,
  title,
  label,
  initialValue,
  confirmLabel = "Save",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue ?? "");

  useEffect(() => {
    if (open) {
      setValue(initialValue ?? "");
    }
  }, [initialValue, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <form
        className="modal-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = value.trim();
          if (trimmed) {
            onConfirm(trimmed);
          }
        }}
      >
        <h2>{title}</h2>
        <label className="field-label">
          {label}
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoFocus
          />
        </label>
        <div className="inspector-actions">
          <button type="submit" disabled={!value.trim()}>
            {confirmLabel}
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function ConfirmActionDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <section className="modal-dialog">
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="inspector-actions">
          <button type="button" className="danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

type PathBranchingSettingsSection =
  "suite" | "overview" | "authoring" | "markdown" | "bridge" | "workspace" | "recents";

const primaryFontOptions = [
  ["sans", "Sans serif"],
  ["serif", "Serif editorial"],
  ["humanist", "Humanist"],
] as const;

const NODE_COLOR_FIELDS: Array<{
  key: keyof NodeColorSettings;
  label: string;
}> = [
  { key: "sequence", label: "Sequence" },
  { key: "start", label: "Start" },
  { key: "branch", label: "Branch" },
  { key: "event", label: "Event" },
  { key: "decision", label: "Decision" },
  { key: "outcome", label: "Outcome" },
  { key: "inkSection", label: "Ink" },
  { key: "knowledge", label: "Knowledge" },
  { key: "runtimeAction", label: "Runtime action" },
];

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
  const updateCategory = (
    id: string,
    updates: Partial<EventCategoryDefinition>,
  ) => {
    onChange(
      categories.map((category) =>
        category.id === id
          ? {
              ...category,
              ...updates,
              terminal:
                category.id === "final"
                  ? true
                  : category.id === "normal"
                    ? false
                    : (updates.terminal ?? category.terminal),
            }
          : category,
      ),
    );
  };
  const addCategory = () => {
    const id = uniqueId(
      "custom",
      categories.map((category) => category.id),
    );
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
        <p>
          Project-level categories used by event nodes. Terminal categories
          cannot create outgoing transitions.
        </p>
      </div>
      <div className="settings-category-list">
        {categories.map((category) => {
          const isFixed = fixedCategoryIds.has(category.id);
          const isUsed = usedCategoryIds.has(category.id);
          return (
            <div className="mini-card category-editor" key={category.id}>
              <label className="field-label">
                Label
                <input
                  value={category.label}
                  onChange={(event) =>
                    updateCategory(category.id, { label: event.target.value })
                  }
                />
              </label>
              <label className="field-label color-field">
                Color
                <input
                  type="color"
                  value={category.color ?? "#4f8cff"}
                  onChange={(event) =>
                    updateCategory(category.id, { color: event.target.value })
                  }
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={Boolean(category.terminal)}
                  disabled={category.id === "final" || category.id === "normal"}
                  onChange={(event) =>
                    updateCategory(category.id, {
                      terminal: event.target.checked,
                    })
                  }
                />
                Terminal
              </label>
              <span>
                {category.id}
                {isUsed ? " - in use" : ""}
              </span>
              <button
                type="button"
                className="danger"
                disabled={isFixed || isUsed}
                title={
                  isFixed
                    ? "Default categories cannot be deleted."
                    : isUsed
                      ? "Category is used by one or more events."
                      : "Delete category"
                }
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

function bridgeLastCheckedLabel(value?: number) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function bridgeStatusLabel(settings: WorldNotionBridgeSettings) {
  if (!settings.connected) return "Disconnected";
  if (settings.lastStatus === "ok") return "Connected";
  if (settings.lastStatus === "error") return "Connection issue";
  return "Connected, not verified";
}

function PathBranchingSettingsModal({
  project,
  fileState,
  settings,
  findings,
  theme,
  onUpdateEventCategories,
  onCanvasBackgroundChange,
  onNodeColorChange,
  onThemeChange,
  onToggleTheme,
  onInspectorTabCloseSelectsNextChange,
  onCollapseInspectorTabOnCanvasClickChange,
  onInspectorDebugEnabledChange,
  onConnectBridge,
  onVerifyBridge,
  onDisconnectBridge,
  onOpenUniverse,
  onOpenRecentUniverse,
  onRemoveRecentUniverse,
  onSaveUniverseProfile,
  onClose,
  suiteSettings,
}: {
  project?: BranchingProject;
  fileState: ProjectFileState;
  settings: AppSettings;
  findings: ValidationFinding[];
  theme: ThemeId;
  onUpdateEventCategories: (categories: EventCategoryDefinition[]) => void;
  onCanvasBackgroundChange: (
    updates: Partial<CanvasBackgroundSettings>,
  ) => void;
  onNodeColorChange: (updates: Partial<NodeColorSettings>) => void;
  onThemeChange: (theme: ThemeId) => void;
  onToggleTheme: () => void;
  onInspectorTabCloseSelectsNextChange: (value: boolean) => void;
  onCollapseInspectorTabOnCanvasClickChange: (value: boolean) => void;
  onInspectorDebugEnabledChange: (value: boolean) => void;
  onConnectBridge: () => void;
  onVerifyBridge: () => void;
  onDisconnectBridge: () => void;
  onOpenUniverse: () => void;
  onOpenRecentUniverse: (path: string) => void;
  onRemoveRecentUniverse: (path: string) => void;
  onSaveUniverseProfile: (profile: UniverseProfile) => Promise<void>;
  onClose: () => void;
  suiteSettings?: {
    primaryFont: string;
    onPrimaryFontChange: (font: string) => void;
    style: string;
    onStyleChange: (style: string) => void;
  };
}) {
  const [activeSection, setActiveSection] =
    useState<PathBranchingSettingsSection>(project ? "overview" : "workspace");
  const errorCount = findings.filter(
    (finding) => finding.severity === "error",
  ).length;
  const warningCount = findings.filter(
    (finding) => finding.severity === "warning",
  ).length;
  const universeName = universeDisplayName(project, fileState);
  const universePath = universeDisplayPath(fileState);
  const [profileDraft, setProfileDraft] = useState<UniverseProfile>(() => ({
    name: fileState.universeProfile?.name ?? universeName,
    icon: fileState.universeProfile?.icon ?? { type: "preset", value: "book" },
  }));
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    setProfileDraft({
      name: fileState.universeProfile?.name ?? universeName,
      icon: fileState.universeProfile?.icon ?? { type: "preset", value: "book" },
    });
  }, [fileState.universeProfile, universeName]);

  return (
    <div
      className="settings-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Everend PathBranching settings"
    >
      <div className="settings-modal pathbranching-settings-modal">
        <header className="settings-header">
          <div>
            <p className="eyebrow">
              {project ? "Universe settings" : "Application settings"}
            </p>
            <h2>{project ? universeName : "Everend PathBranching"}</h2>
          </div>
          <button type="button" onClick={onClose} title="Close settings">
            <X size={16} />
          </button>
        </header>

        <div className="settings-body">
          <nav className="settings-nav">
            {suiteSettings ? (
              <div className="settings-nav-group">
                <p>Forge</p>
                <button
                  className={activeSection === "suite" ? "active" : ""}
                  onClick={() => setActiveSection("suite")}
                  type="button"
                >
                  <Settings size={14} />
                  Suite
                </button>
              </div>
            ) : null}
            <div className="settings-nav-group">
              <p>Universe</p>
              <button
                className={activeSection === "overview" ? "active" : ""}
                onClick={() => setActiveSection("overview")}
                type="button"
              >
                <Settings size={14} />
                Overview
              </button>
              <button
                className={activeSection === "authoring" ? "active" : ""}
                onClick={() => setActiveSection("authoring")}
                type="button"
              >
                <GitBranch size={14} />
                Branching
              </button>
              <button
                className={activeSection === "markdown" ? "active" : ""}
                onClick={() => setActiveSection("markdown")}
                type="button"
              >
                <FilePlus2 size={14} />
                Markdown
              </button>
              <button
                className={activeSection === "bridge" ? "active" : ""}
                onClick={() => setActiveSection("bridge")}
                type="button"
              >
                <Link size={14} />
                Bridge
              </button>
            </div>

            <div className="settings-nav-group app-settings-group">
              <p>Application</p>
              <button
                className={activeSection === "workspace" ? "active" : ""}
                onClick={() => setActiveSection("workspace")}
                type="button"
              >
                <Home size={14} />
                Workspace
              </button>
              <button
                className={activeSection === "recents" ? "active" : ""}
                onClick={() => setActiveSection("recents")}
                type="button"
              >
                <FolderOpen size={14} />
                Recents
              </button>
            </div>
          </nav>

          <section className="settings-section">
            {activeSection === "suite" && suiteSettings ? (
              <div className="settings-panel">
                <div className="settings-page-title">
                  <h3>Everend Forge Suite</h3>
                  <p>Shared preferences applied to every app in this Suite.</p>
                </div>
                <div className="settings-grid">
                  <label>
                    <span>Style</span>
                    <select
                      value={suiteSettings.style}
                      onChange={(event) => suiteSettings.onStyleChange(event.target.value)}
                    >
                      {THEMES.map((themeOption) => (
                        <option key={themeOption.id} value={themeOption.id}>
                          {themeOption.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Primary typeface</span>
                    <select
                      value={suiteSettings.primaryFont}
                      onChange={(event) => suiteSettings.onPrimaryFontChange(event.target.value)}
                    >
                      {primaryFontOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            ) : null}
            {activeSection === "overview" ? (
              <div className="settings-panel">
                <div className="settings-page-title universe-profile-summary">
                  <UniverseIconFrame
                    profile={fileState.universeProfile}
                    size={42}
                  />
                  <div>
                    <h3>{universeName}</h3>
                    <p>
                      {fileState.universePath ??
                        "Open a universe folder to begin."}
                    </p>
                  </div>
                </div>
                <div className="universe-profile-editor">
                  <UniverseIconFrame profile={profileDraft} size={48} />
                  <div className="universe-profile-fields">
                    <label>
                      <span>Universe name</span>
                      <input value={profileDraft.name ?? ""} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} placeholder={universeName} />
                    </label>
                    <div className="icon-preset-row">
                      {[["book", BookOpen], ["globe", Globe2], ["castle", Castle], ["sparkles", Sparkles]].map(([value, Icon]) => (
                        <button key={value as string} type="button" className={profileDraft.icon?.type === "preset" && profileDraft.icon.value === value ? "active" : ""} onClick={() => setProfileDraft((current) => ({ ...current, icon: { type: "preset", value: value as string } }))} title={`Use ${value} icon`}><Icon size={16} /></button>
                      ))}
                      <label className="image-upload-button" title="Use PNG or JPG"><Upload size={16} /><input type="file" accept="image/png,image/jpeg" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setProfileDraft((current) => ({ ...current, icon: { type: "image", value: String(reader.result ?? "") } })); reader.readAsDataURL(file); }} /></label>
                    </div>
                    <button type="button" onClick={async () => { setProfileSaving(true); try { await onSaveUniverseProfile(profileDraft); } finally { setProfileSaving(false); } }} disabled={profileSaving}>Save customization</button>
                  </div>
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
                    <strong>
                      {errorCount}/{warningCount}
                    </strong>
                    <span>Errors / warnings</span>
                  </div>
                </div>
                <div className="settings-action-list">
                  <button type="button" onClick={onOpenUniverse}>
                    <FolderOpen size={15} />
                    Open universe folder
                  </button>
                  <button type="button" onClick={onToggleTheme}>
                    {isDarkTheme(theme) ? (
                      <Sun size={15} />
                    ) : (
                      <Moon size={15} />
                    )}
                    Toggle {isDarkTheme(theme) ? "light" : "dark"} mode
                  </button>
                </div>
              </div>
            ) : null}

            {activeSection === "authoring" ? (
              <div className="settings-panel">
                <div className="settings-page-title">
                  <h3>Branching authoring</h3>
                  <p>
                    {universePath ||
                      "Everend PathBranching stores story graph data inside `.everend/.pathbranching`."}
                  </p>
                </div>
                <div className="settings-grid">
                  <label>
                    <span>Story file</span>
                    <input
                      value={fileState.storyPath ?? "Not created yet"}
                      readOnly
                    />
                  </label>
                  <label>
                    <span>Runtime validation</span>
                    <input
                      value={
                        findings.length
                          ? `${findings.length} finding(s)`
                          : "Clean"
                      }
                      readOnly
                    />
                  </label>
                  <label>
                    <span>Unsaved changes</span>
                    <input value={fileState.dirty ? "Yes" : "No"} readOnly />
                  </label>
                </div>
                {project ? (
                  <EventCategoriesSettings
                    categories={project.eventCategories ?? []}
                    usedCategoryIds={
                      new Set(project.events.map((event) => event.type))
                    }
                    onChange={onUpdateEventCategories}
                  />
                ) : null}
              </div>
            ) : null}

            {activeSection === "markdown" ? (
              <div className="settings-panel">
                <div className="settings-page-title">
                  <h3>Markdown working copies</h3>
                  <p>
                    Canon Markdown remains owned by WorldNotion. Editable
                    variants are saved as working copies.
                  </p>
                </div>
                <div className="settings-grid">
                  <label>
                    <span>Working copy folder</span>
                    <input
                      value=".everend/.pathbranching/working-copies"
                      readOnly
                    />
                  </label>
                  <label>
                    <span>Supported draft formats</span>
                    <input
                      value="Markdown, Ink Beat, GameData, Frontmatter"
                      readOnly
                    />
                  </label>
                  <label>
                    <span>Canon editing</span>
                    <input
                      value="Read-only from Everend PathBranching"
                      readOnly
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {activeSection === "bridge" ? (
              <div className="settings-panel">
                <div className="settings-page-title">
                  <h3>WorldNotion bridge</h3>
                  <p>
                    Use the bridge only when Everend PathBranching should read a
                    local WorldNotion universe folder.
                  </p>
                </div>
                <div className="settings-grid">
                  <label>
                    <span>Status</span>
                    <input
                      value={bridgeStatusLabel(settings.worldnotionBridge)}
                      readOnly
                    />
                  </label>
                  <label>
                    <span>Runtime</span>
                    <input
                      value={
                        isTauriRuntime() ? "Tauri desktop IPC" : "Web preview"
                      }
                      readOnly
                    />
                  </label>
                  <label>
                    <span>Last check</span>
                    <input
                      value={bridgeLastCheckedLabel(
                        settings.worldnotionBridge.lastCheckedAt,
                      )}
                      readOnly
                    />
                  </label>
                  <label>
                    <span>Last universe</span>
                    <input
                      value={settings.lastOpenedProject ?? "None"}
                      readOnly
                    />
                  </label>
                </div>
                <div className="settings-action-list">
                  <button type="button" onClick={onConnectBridge}>
                    <Link size={15} />
                    Connect bridge
                  </button>
                  <button type="button" onClick={onVerifyBridge}>
                    <SearchCheck size={15} />
                    Verify connection
                  </button>
                  <button type="button" onClick={onDisconnectBridge}>
                    <X size={15} />
                    Disconnect bridge
                  </button>
                </div>
                {settings.worldnotionBridge.lastMessage ? (
                  <p
                    className={`bridge-status-note ${settings.worldnotionBridge.lastStatus ?? "disconnected"}`}
                  >
                    {settings.worldnotionBridge.lastMessage}
                  </p>
                ) : null}
              </div>
            ) : null}

            {activeSection === "workspace" ? (
              <div className="settings-panel">
                <div className="settings-page-title">
                  <h3>Workspace</h3>
                  <p>
                    Theme and onboarding behavior are shared with the desktop
                    shell.
                  </p>
                </div>
                <div className="settings-grid">
                  <label>
                    <span>Active style</span>
                    <select
                      value={theme}
                      onChange={(event) =>
                        onThemeChange(normalizeThemeId(event.target.value))
                      }
                    >
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
                      {isDarkTheme(theme)
                        ? "Switch to light"
                        : "Switch to dark"}
                    </button>
                  </label>
                  <label>
                    <span>Last universe</span>
                    <input
                      value={settings.lastOpenedProject ?? "None"}
                      readOnly
                    />
                  </label>
                  <label>
                    <span>Open next tab on close</span>
                    <input
                      type="checkbox"
                      checked={settings.inspectorTabCloseSelectsNext}
                      onChange={(event) =>
                        onInspectorTabCloseSelectsNextChange(
                          event.target.checked,
                        )
                      }
                    />
                  </label>
                  <label>
                    <span>Collapse tab on canvas click</span>
                    <input
                      type="checkbox"
                      checked={settings.collapseInspectorTabOnCanvasClick}
                      onChange={(event) =>
                        onCollapseInspectorTabOnCanvasClickChange(
                          event.target.checked,
                        )
                      }
                    />
                  </label>
                  <label>
                    <span>Inspector Debug</span>
                    <input
                      type="checkbox"
                      checked={settings.inspectorDebugEnabled}
                      onChange={(event) =>
                        onInspectorDebugEnabledChange(event.target.checked)
                      }
                    />
                  </label>
                  <label>
                    <span>Canvas circles</span>
                    <input
                      type="checkbox"
                      checked={settings.canvasBackground.showDots}
                      onChange={(event) =>
                        onCanvasBackgroundChange({
                          showDots: event.target.checked,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Canvas grid</span>
                    <input
                      type="checkbox"
                      checked={settings.canvasBackground.showGrid}
                      onChange={(event) =>
                        onCanvasBackgroundChange({
                          showGrid: event.target.checked,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Align to grid</span>
                    <input
                      type="checkbox"
                      checked={settings.canvasBackground.snapToGrid}
                      onChange={(event) =>
                        onCanvasBackgroundChange({
                          snapToGrid: event.target.checked,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Grid size</span>
                    <input
                      type="number"
                      min={8}
                      max={80}
                      step={2}
                      value={settings.canvasBackground.gridSize}
                      onChange={(event) =>
                        onCanvasBackgroundChange({
                          gridSize: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Grid opacity</span>
                    <input
                      type="range"
                      min={0.05}
                      max={1}
                      step={0.05}
                      value={settings.canvasBackground.opacity}
                      onChange={(event) =>
                        onCanvasBackgroundChange({
                          opacity: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <div className="settings-subsection">
                  <div className="settings-page-title compact">
                    <h3>Node colors</h3>
                    <p>
                      Canvas node types use these colors as their left outline.
                    </p>
                  </div>
                  <div className="settings-grid node-color-grid">
                    {NODE_COLOR_FIELDS.map((field) => (
                      <label key={field.key}>
                        <span>{field.label}</span>
                        <input
                          type="color"
                          value={settings.nodeColors[field.key]}
                          onChange={(event) =>
                            onNodeColorChange({
                              [field.key]: event.target.value,
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {activeSection === "recents" ? (
              <div className="settings-panel">
                <div className="settings-page-title">
                  <h3>Recent universes</h3>
                  <p>
                    Everend PathBranching opens the latest valid universe
                    automatically on startup.
                  </p>
                </div>
                <div className="space-list">
                  {settings.recentProjects.map((path) => (
                    <button
                      type="button"
                      key={path}
                      onClick={() => onOpenRecentUniverse(path)}
                    >
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
                  {settings.recentProjects.length === 0 ? (
                    <span className="empty-line">No recent universes yet.</span>
                  ) : null}
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
  onContextMenu,
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
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
  children: ReactNode;
}) {
  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!resizable || !onResize) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth =
      event.currentTarget.closest(".side-panel")?.getBoundingClientRect()
        .width ?? DEFAULT_PANEL_WIDTH;
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
      <aside className="side-rail" onContextMenu={onContextMenu}>
        <button type="button" title={`Open ${title}`} onClick={onToggle}>
          <span>{railLabel}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="side-panel" onContextMenu={onContextMenu}>
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
  const [expandedFolders, setExpandedFolders] = useState<
    Record<string, boolean>
  >({});
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRefs = project.canonRefs.filter((ref) => {
    return canonRefMatches(ref, normalizedQuery);
  });
  const fileTree = buildCanonFileTree(filteredRefs);

  const dragProps = (ref: CanonRef) => ({
    draggable: true,
    onDragStart: (event: ReactDragEvent<HTMLButtonElement>) => {
      event.dataTransfer.setData(
        "application/x-pathbranching-canon-ref",
        ref.id,
      );
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
          {ref.missingIdentity ? (
            <span
              className="canon-warning-mark"
              title={ref.identityWarning ?? "Missing canon identity"}
            >
              !
            </span>
          ) : null}
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
          <div
            className="canon-tree-row"
            style={{ "--depth": depth } as CSSProperties}
            key={node.path}
          >
            {renderRefButton(node.ref)}
          </div>
        );
      }

      const expanded = expandedFolders[node.path] ?? true;
      const toggleExpanded = () =>
        setExpandedFolders((current) => ({
          ...current,
          [node.path]: !expanded,
        }));
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
        <span>
          {filteredRefs.length}/{project.canonRefs.length}
        </span>
      </div>
      <div className="panel-scroll">
        <section className="panel-group canon-file-tree">
          {fileTree.length ? (
            renderTreeNodes(fileTree)
          ) : (
            <span className="empty-line">
              No canon files match this search.
            </span>
          )}
        </section>
      </div>
    </PanelShell>
  );
}

function OutlineBadges({ badges }: { badges: string[] }) {
  const visibleBadges = badges.filter(Boolean);
  if (!visibleBadges.length) return null;
  return (
    <span className="explorer-meta">
      {visibleBadges.map((badge) => (
        <small key={badge}>{badge}</small>
      ))}
    </span>
  );
}

function SequenceOutlinePanel({
  project,
  sequence,
  selectedId,
  onSelect,
  onUpdateSequence,
}: {
  project: BranchingProject;
  sequence?: Sequence;
  selectedId?: string;
  onSelect: (id: string) => void;
  onUpdateSequence: (id: string, updates: Partial<Sequence>) => void;
}) {
  const connections = buildSequenceConnectionPreview(project).filter(
    (connection) =>
      connection.fromSequenceId === sequence?.id ||
      connection.toSequenceId === sequence?.id,
  );

  if (!sequence) {
    return (
      <span className="empty-line">
        Create a sequence to start outlining this story.
      </span>
    );
  }

  return (
    <div className="story-outline-map">
      <button
        type="button"
        className={`outline-card primary ${selectedId === `file:sequence:${sequence.id}` ? "active" : ""}`}
        onClick={() => onSelect(`file:sequence:${sequence.id}`)}
      >
        <strong>{sequence.name}</strong>
        <span>{sequence.id}</span>
        <OutlineBadges
          badges={[
            sequence.id === project.entrySequenceId ? "entry sequence" : "",
            `${sequence.eventIds.length} events`,
            `${sequence.branchIds?.length ?? 0} branches`,
            conditionCount(sequence.availability)
              ? `${conditionCount(sequence.availability)} conditions`
              : "",
            sequence.ruleSets?.length
              ? `${sequence.ruleSets.length} rules`
              : "",
          ]}
        />
      </button>
      <section className="outline-editor">
        <label className="field-label">
          Name
          <input
            value={sequence.name}
            onChange={(event) =>
              onUpdateSequence(sequence.id, { name: event.target.value })
            }
          />
        </label>
        <label className="field-label">
          Entry Event
          <select
            value={sequence.entryEventId}
            onChange={(event) =>
              onUpdateSequence(sequence.id, {
                entryEventId: event.target.value,
              })
            }
          >
            {sequence.eventIds.map((eventId) => (
              <option key={eventId} value={eventId}>
                {findEvent(project, eventId)?.name ?? eventId}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="outline-section">
        <h3>Sequence Connections</h3>
        {connections.length ? (
          connections.map((connection) => (
            <button
              type="button"
              className="outline-card relation"
              key={connection.id}
              onClick={() => onSelect(`file:event:${connection.fromEventId}`)}
            >
              <strong>
                {connection.fromSequenceName} {"->"} {connection.toSequenceName}
              </strong>
              <span>
                {connection.fromEventName} {"->"} {connection.toEventName}
              </span>
              <OutlineBadges
                badges={[
                  connection.label,
                  connection.conditionCount
                    ? `${connection.conditionCount} conditions`
                    : "",
                ]}
              />
            </button>
          ))
        ) : (
          <span className="empty-line">No cross-sequence transitions yet.</span>
        )}
      </section>
    </div>
  );
}

function BranchTagPanel({
  project,
  sequence,
  selectedId,
  onSelect,
  onCreateBranch,
  onUpdateBranch,
  onDeleteBranch,
  onCreateEventInBranch,
  onAssignEventToBranch,
}: {
  project: BranchingProject;
  sequence?: Sequence;
  selectedId?: string;
  onSelect: (id: string) => void;
  onCreateBranch: () => void;
  onUpdateBranch: (id: string, updates: Partial<Branch>) => void;
  onDeleteBranch: (id: string) => void;
  onCreateEventInBranch: (branchId: string, type?: EventType) => void;
  onAssignEventToBranch: (eventId: string, branchId?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [expandedBranches, setExpandedBranches] = useState<
    Record<string, boolean>
  >({});
  const normalizedQuery = query.trim().toLowerCase();
  const sequenceBranches = branchesForSequence(project, sequence?.id);
  const sequenceBranchIds = new Set(
    sequenceBranches.map((branch) => branch.id),
  );
  const branches = project.branches.filter((branch) =>
    [branch.id, branch.title, branch.description]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
  );
  const activeSequenceEventIds = new Set(sequence?.eventIds ?? []);

  return (
    <div className="story-outline-map">
      <div className="outline-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search branches"
          aria-label="Search branches"
        />
        <button type="button" onClick={onCreateBranch}>
          <FilePlus2 size={13} />
          Branch
        </button>
      </div>
      {branches.map((branch) => {
        const activeEvents = eventsForBranch(project, branch.id, sequence?.id);
        const allEvents = eventsForBranch(project, branch.id);
        const branchSelectionId = `file:branch:${branch.id}`;
        const expanded =
          expandedBranches[branch.id] ?? selectedId === branchSelectionId;
        return (
          <section
            className={`branch-capsule ${expanded ? "expanded" : ""}`}
            key={branch.id}
          >
            <button
              type="button"
              className={`branch-capsule-header ${selectedId === branchSelectionId ? "active" : ""}`}
              onClick={() => {
                onSelect(branchSelectionId);
                setExpandedBranches((current) => ({
                  ...current,
                  [branch.id]: !expanded,
                }));
              }}
              aria-expanded={expanded}
            >
              <span className="branch-capsule-caret">
                {expanded ? "v" : ">"}
              </span>
              <strong>{branch.title}</strong>
              <OutlineBadges
                badges={[
                  `${activeEvents.length} here`,
                  `${allEvents.length} total`,
                ]}
              />
            </button>
            {expanded ? (
              <div className="branch-capsule-body">
                <span className="branch-capsule-description">
                  {branch.description || branch.id}
                  {sequenceBranchIds.has(branch.id)
                    ? " / active sequence"
                    : " / story branch"}
                </span>
                <div className="outline-editor compact">
                  <input
                    value={branch.title}
                    aria-label="Branch title"
                    onChange={(event) =>
                      onUpdateBranch(branch.id, { title: event.target.value })
                    }
                  />
                  <label className="color-field branch-color-field">
                    <span>Branch color</span>
                    <input
                      type="color"
                      value={branch.color ?? "#b062d6"}
                      aria-label={`Color for ${branch.title}`}
                      onChange={(event) =>
                        onUpdateBranch(branch.id, { color: event.target.value })
                      }
                    />
                  </label>
                  <textarea
                    value={branch.description ?? ""}
                    rows={2}
                    aria-label="Branch description"
                    placeholder="Branch description"
                    onChange={(event) =>
                      onUpdateBranch(branch.id, {
                        description: event.target.value || undefined,
                      })
                    }
                  />
                  <div className="inspector-actions">
                    <button
                      type="button"
                      onClick={() => onCreateEventInBranch(branch.id)}
                    >
                      New Event
                    </button>
                    <button
                      type="button"
                      onClick={() => onCreateEventInBranch(branch.id, "final")}
                    >
                      New Final
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => onDeleteBranch(branch.id)}
                      disabled={allEvents.length > 0}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="outline-children branch-capsule-events">
                  {project.events
                    .filter(
                      (event) =>
                        activeSequenceEventIds.has(event.id) &&
                        (event.branchRef === branch.id || !event.branchRef),
                    )
                    .map((event) => (
                      <div className="outline-row" key={event.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(`file:event:${event.id}`)}
                        >
                          {event.name}
                        </button>
                        <select
                          value={event.branchRef ?? ""}
                          aria-label={`Branch for ${event.name}`}
                          onChange={(selectEvent) =>
                            onAssignEventToBranch(
                              event.id,
                              selectEvent.target.value || undefined,
                            )
                          }
                        >
                          <option value="">No branch</option>
                          {project.branches.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
      {!branches.length ? (
        <span className="empty-line">No branches match this search.</span>
      ) : null}
    </div>
  );
}

function pathTreeNodeIcon(kind: PathTreeNode["kind"]) {
  if (kind === "decision") return <Split size={13} />;
  if (kind === "dialogue") return <MessageSquare size={13} />;
  return <GitBranch size={13} />;
}

function collectPathTreeIds(node: PathTreeNode): string[] {
  return [node.id, ...node.children.flatMap(collectPathTreeIds)];
}

function PathTreeRow({
  node,
  depth,
  expanded,
  onToggle,
  onNavigate,
  isActive,
}: {
  node: PathTreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onNavigate: (node: PathTreeNode) => void;
  isActive: (node: PathTreeNode) => boolean;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);

  return (
    <div className="path-tree-node">
      <div
        className={`path-tree-row ${isActive(node) ? "active" : ""}`}
        style={{ paddingLeft: 6 + depth * 16 }}
      >
        <button
          type="button"
          className="path-tree-toggle"
          onClick={(event) => {
            event.stopPropagation();
            if (hasChildren) onToggle(node.id);
          }}
          aria-label={
            hasChildren ? (isExpanded ? "Collapse" : "Expand") : undefined
          }
          tabIndex={hasChildren ? 0 : -1}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown size={13} />
            ) : (
              <ChevronRight size={13} />
            )
          ) : (
            <span className="path-tree-toggle-spacer" />
          )}
        </button>
        <button
          type="button"
          className="path-tree-label"
          onClick={() => onNavigate(node)}
        >
          {pathTreeNodeIcon(node.kind)}
          <span className="path-tree-title">{node.label}</span>
          {node.subtitle ? (
            <span className="path-tree-subtitle">{node.subtitle}</span>
          ) : null}
          {node.badges.length ? (
            <span className="path-tree-badges">
              {node.badges.map((badge) => (
                <small key={badge}>{badge}</small>
              ))}
            </span>
          ) : null}
        </button>
      </div>
      {hasChildren && isExpanded ? (
        <div className="path-tree-children">
          {node.children.map((child) => (
            <PathTreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onNavigate={onNavigate}
              isActive={isActive}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PathOutlinePanel({
  project,
  sequence,
  selectedId,
  onNavigate,
}: {
  project: BranchingProject;
  sequence?: Sequence;
  selectedId?: string;
  onNavigate: (node: PathTreeNode) => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const tree = useMemo(
    () => buildPathTree(project, sequence),
    [project, sequence],
  );
  const normalizedQuery = query.trim().toLowerCase();

  const toggle = useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const matchesQuery = useCallback(
    (node: PathTreeNode): boolean =>
      !normalizedQuery ||
      [node.label, node.subtitle, ...node.badges]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(normalizedQuery),
        ) ||
      node.children.some((child) => matchesQuery(child)),
    [normalizedQuery],
  );

  const filteredTree = normalizedQuery
    ? tree.filter((node) => matchesQuery(node))
    : tree;
  const effectiveExpanded = normalizedQuery
    ? new Set(tree.flatMap(collectPathTreeIds))
    : expanded;
  const isActive = (node: PathTreeNode) =>
    node.kind === "event" && selectedId === `file:event:${node.selectId}`;

  return (
    <div className="story-outline-map">
      <div className="outline-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search paths"
          aria-label="Search paths"
        />
        <span>
          {tree.length} root event{tree.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="path-tree">
        {filteredTree.map((node) => (
          <PathTreeRow
            key={node.id}
            node={node}
            depth={0}
            expanded={effectiveExpanded}
            onToggle={toggle}
            onNavigate={onNavigate}
            isActive={isActive}
          />
        ))}
      </div>
      {!filteredTree.length ? (
        <span className="empty-line">No paths match this search.</span>
      ) : null}
    </div>
  );
}

function FilesPanel({
  project,
  files,
  stories = [],
  activeStoryId,
  storyName,
  open,
  selectedId,
  onToggle,
  onResize,
  onResetWidth,
  onResizeStateChange,
  onSequenceChange,
  onStoryChange = () => undefined,
  onCreateStory,
  onRenameStory,
  onDeleteStory,
  onCreateSequence,
  onRenameSequence,
  onDeleteSequence,
  onUpdateSequence,
  onCreateBranch,
  onUpdateBranch,
  onDeleteBranch,
  onCreateEventInBranch,
  onAssignEventToBranch,
  onSelect,
  activeOutlineTab,
  onOutlineTabChange,
  onNavigatePathNode,
  onContextMenu,
}: {
  project: BranchingProject;
  files: PathBranchingFileItem[];
  stories: Array<{ id: string; name: string }>;
  activeStoryId?: string;
  storyName?: string;
  open: boolean;
  selectedId?: string;
  onNavigatePathNode: (node: PathTreeNode) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
  onToggle: () => void;
  onResize: (width: number) => void;
  onResetWidth: () => void;
  onResizeStateChange: (resizing: boolean) => void;
  onSequenceChange: (id: string) => void;
  onStoryChange: (id: string) => void;
  onCreateStory: () => void;
  onRenameStory: () => void;
  onDeleteStory: () => void;
  onCreateSequence: () => void;
  onRenameSequence: () => void;
  onDeleteSequence: () => void;
  onUpdateSequence: (id: string, updates: Partial<Sequence>) => void;
  onCreateBranch: () => void;
  onUpdateBranch: (id: string, updates: Partial<Branch>) => void;
  onDeleteBranch: (id: string) => void;
  onCreateEventInBranch: (branchId: string, type?: EventType) => void;
  onAssignEventToBranch: (eventId: string, branchId?: string) => void;
  onSelect: (id: string) => void;
  activeOutlineTab: StoryOutlineTab;
  onOutlineTabChange: (tab: StoryOutlineTab) => void;
}) {
  const currentSequenceId = activeSequenceId(project) ?? "";
  const activeSequence = currentSequenceId
    ? findSequence(project, currentSequenceId)
    : undefined;
  const totalItems =
    (activeSequence?.eventIds.length ?? 0) +
    branchesForSequence(project, activeSequence?.id).length +
    1;

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
      onContextMenu={onContextMenu}
    >
      <div className="stories-sequence-toolbar story-management-toolbar">
        <label>
          <span>Story</span>
          <select
            value={activeStoryId ?? project.storyId ?? ""}
            onChange={(event) => onStoryChange(event.target.value)}
            aria-label="Select active story"
          >
            {stories.map((story) => (
              <option key={story.id} value={story.id}>
                {story.name}
              </option>
            ))}
            {stories.length === 0 ? (
              <option value="">
                {storyName ??
                  project.name ??
                  project.storyId ??
                  "Branching Story"}
              </option>
            ) : null}
          </select>
        </label>
        <div className="toolbar-button-row">
          <button type="button" onClick={onCreateStory} title="Create story">
            <FilePlus2 size={13} />
          </button>
          <button
            type="button"
            onClick={onRenameStory}
            title="Rename story"
            disabled={!activeStoryId}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={onDeleteStory}
            title="Delete story"
            disabled={stories.length <= 1}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div className="stories-sequence-toolbar story-management-toolbar">
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
            <option value={NEW_SEQUENCE_SELECT_VALUE}>
              Create new sequence...
            </option>
          </select>
        </label>
        <div className="toolbar-button-row">
          <button
            type="button"
            onClick={onCreateSequence}
            title="Create sequence"
            disabled={!activeStoryId}
          >
            <FilePlus2 size={13} />
          </button>
          <button
            type="button"
            onClick={onRenameSequence}
            title="Rename sequence"
            disabled={!activeSequence}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={onDeleteSequence}
            title="Delete sequence"
            disabled={!activeSequence}
          >
            <Trash2 size={13} />
          </button>
        </div>
        <p>
          {activeSequence
            ? `${activeSequence.eventIds.length} events`
            : "No sequence loaded"}
          {totalItems ? ` / ${totalItems} files` : ""}
        </p>
      </div>
      <div className="panel-scroll">
        <div
          className="story-outline-tabs"
          role="tablist"
          aria-label="Story outline tabs"
        >
          {(["sequence", "branches", "paths"] as StoryOutlineTab[]).map(
            (tab) => (
              <button
                type="button"
                role="tab"
                aria-selected={activeOutlineTab === tab}
                className={activeOutlineTab === tab ? "active" : ""}
                key={tab}
                onClick={() => onOutlineTabChange(tab)}
              >
                {tab === "sequence"
                  ? "Sequence"
                  : tab === "branches"
                    ? "Branches"
                    : "Paths"}
              </button>
            ),
          )}
        </div>
        {activeOutlineTab === "sequence" ? (
          <SequenceOutlinePanel
            project={project}
            sequence={activeSequence}
            selectedId={selectedId}
            onSelect={onSelect}
            onUpdateSequence={onUpdateSequence}
          />
        ) : null}
        {activeOutlineTab === "branches" ? (
          <BranchTagPanel
            project={project}
            sequence={activeSequence}
            selectedId={selectedId}
            onSelect={onSelect}
            onCreateBranch={onCreateBranch}
            onUpdateBranch={onUpdateBranch}
            onDeleteBranch={onDeleteBranch}
            onCreateEventInBranch={onCreateEventInBranch}
            onAssignEventToBranch={onAssignEventToBranch}
          />
        ) : null}
        {activeOutlineTab === "paths" ? (
          <PathOutlinePanel
            project={project}
            sequence={activeSequence}
            selectedId={selectedId}
            onNavigate={onNavigatePathNode}
          />
        ) : null}
        {totalItems === 0 ? (
          <span className="empty-line">No story objects yet.</span>
        ) : null}
      </div>
    </PanelShell>
  );
}

function explorerInspectorTab(
  selection: Selection,
  project: BranchingProject,
  nodes: StoryCanvasNode[],
): InspectorTab | undefined {
  if (selection.type === "node") {
    if (project.events.some((event) => event.id === selection.id)) return undefined;
    const node = nodes.find((candidate) => candidate.id === selection.id);
    if (!node) return undefined;
    const kind = node.data.kind;
    if (kind === "start" || kind === "boundary") return undefined;
    const details = node.data.details as
      | {
          decision?: { name?: string };
          dialogue?: { title?: string; text?: { content?: string } };
          outcome?: { name?: string };
        }
      | undefined;
    const title =
      kind === "dialogue"
        ? details?.dialogue?.title ||
          details?.dialogue?.text?.content?.slice(0, 48) ||
          "Dialogue"
          : kind === "decision"
          ? details?.decision?.name || "Decision"
          : kind === "speechBeat"
            ? "Speech Beat"
            : kind === "directionBeat"
              ? "Direction Beat"
          : kind === "routeGate"
            ? "Route Gate"
          : kind === "outcome"
            ? details?.outcome?.name || "Outcome"
            : kind === "branch"
              ? "Branch"
              : kind === "sequence"
                ? "Sequence"
                : "Inspector item";
    return { id: `${kind}:${selection.id}`, selection, title };
  }
  if (selection.type === "edge") {
    return { id: `edge:${selection.id}`, selection, title: "Transition" };
  }
  const title =
    selection.type === "canon"
      ? project.canonRefs.find((item) => item.id === selection.id)?.label ?? selection.id
      : selection.type === "explorerEntity"
        ? project.localExplorerEntities?.find((item) => item.id === selection.id)?.name ?? selection.id
        : selection.type === "explorerType"
          ? selection.id
          : selection.type === "explorerProperty"
            ? selection.id
            : selection.type === "dataObject"
              ? project.projectDataObjects?.find((item) => item.id === selection.id)?.name ?? selection.id
              : selection.id;
  const source = "source" in selection ? `:${selection.source}` : "";
  return { id: `${selection.type}:${selection.id}${source}`, selection, title };
}

function inspectorTabIcon(tab: InspectorTab) {
  if (tab.id.startsWith("dialogue:")) return MessageSquare;
  if (tab.id.startsWith("routeGate:")) return GitBranch;
  if (tab.id.startsWith("decision:") || tab.id.startsWith("outcome:"))
    return Split;
  if (tab.id.startsWith("edge:")) return GitBranch;
  if (tab.selection.type === "dataObject") return Database;
  if (tab.selection.type === "canon") return BookOpen;
  if (tab.selection.type === "canonSuggestion") return AlertTriangle;
  if (tab.selection.type === "explorerEntity") return Globe2;
  if (
    tab.selection.type === "explorerType" ||
    tab.selection.type === "explorerProperty"
  )
    return Boxes;
  return FilePlus2;
}

function DebugInspector({
  project,
  nodes,
  selection,
}: {
  project: BranchingProject;
  nodes: StoryCanvasNode[];
  selection: Selection;
}) {
  const node = selection.type === "node" ? nodes.find((item) => item.id === selection.id) : undefined;
  const payload = {
    selection,
    node,
    event: selection.type === "node" ? project.events.find((item) => item.id === selection.id) : undefined,
    canon: selection.type === "canon" ? project.canonRefs.find((item) => item.id === selection.id) : undefined,
    localEntity: selection.type === "explorerEntity" ? project.localExplorerEntities?.find((item) => item.id === selection.id) : undefined,
    dataObject: selection.type === "dataObject" ? project.projectDataObjects?.find((item) => item.id === selection.id) : undefined,
    workingCopy: selection.type === "canon" ? project.canonWorkingCopies?.find((item) => item.canonRefId === selection.id) : undefined,
    changeSets: selection.type === "canon" ? project.canonChangeSets?.filter((item) => item.target.entityId === selection.id) : undefined,
  };
  return <section className="inspector-section debug-inspector"><h2>Debug</h2><pre>{JSON.stringify(payload, null, 2)}</pre></section>;
}

function EventAuthoringDock({
  project,
  nodes,
  selection,
  eventDraft,
  eventInspector,
  tabGroups,
  onOpenEvent,
  onCollapseEvent,
  onCloseEvent,
  onCloseAllEvents,
  onCloseEventsAbove,
  onCloseEventsBelow,
  onCloseOtherEvents,
  onPruneEvents,
  onSaveGroup,
  onLoadGroup,
  onDeleteGroup,
  onSelect,
  onSaveEventDraft,
  inspectorTabs,
  expandedInspectorTabId,
  inspectorMaximized,
  onOpenInspectorTab,
  onCloseInspectorTab,
  onCloseAllInspectorTabs,
  onDisableInspectorDebug,
  onToggleInspectorMaximized,
  children,
}: {
  project: BranchingProject;
  nodes: StoryCanvasNode[];
  selection?: Selection;
  eventDraft?: EventDraft;
  eventInspector: EventInspectorState;
  tabGroups: EventInspectorTabGroup[];
  onOpenEvent: (eventId: string) => void;
  onCollapseEvent: (eventId: string) => void;
  onCloseEvent: (eventId: string) => void;
  onCloseAllEvents: () => void;
  onCloseEventsAbove: (eventId: string) => void;
  onCloseEventsBelow: (eventId: string) => void;
  onCloseOtherEvents: (eventId: string) => void;
  onPruneEvents: (eventIds: readonly string[]) => void;
  onSaveGroup: () => void;
  onLoadGroup: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onSelect: (selection?: Selection) => void;
  onSaveEventDraft: () => void;
  inspectorTabs: InspectorTab[];
  expandedInspectorTabId?: string;
  inspectorMaximized: boolean;
  onOpenInspectorTab: (id: string) => void;
  onCloseInspectorTab: (id: string) => void;
  onCloseAllInspectorTabs: () => void;
  onDisableInspectorDebug: () => void;
  onToggleInspectorMaximized: () => void;
  children: ReactNode;
}) {
  const tabContextMenuRef = useRef<HTMLDivElement | null>(null);
  const manuallyCollapsedEventIdRef = useRef<string | undefined>(undefined);
  const manuallyClosedEventIdRef = useRef<string | undefined>(undefined);
  const [selectedTabGroupId, setSelectedTabGroupId] = useState("");
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [inspectorHeights, setInspectorHeights] = useState<Record<string, number>>({});
  const [tabContextMenu, setTabContextMenu] = useState<
    | { kind: "event"; eventId: string; x: number; y: number }
    | { kind: "inspector"; x: number; y: number }
  >();
  const currentSequence = project.sequences.find(
    (sequence) => sequence.id === activeSequenceId(project),
  );
  const validEventIds = useMemo(
    () => currentSequence?.eventIds ?? [],
    [currentSequence?.eventIds],
  );
  const eventIds = useMemo(() => new Set(validEventIds), [validEventIds]);
  const selectedEventId = eventIdFromSelection(project, nodes, selection);
  const selectedDirectEventId =
    selection?.type === "node" &&
    project.events.some((event) => event.id === selection.id)
      ? selection.id
      : undefined;
  const selectedEvent = selectedEventId
    ? project.events.find((event) => event.id === selectedEventId)
    : undefined;
  const openEvents = eventInspector.openEventIds
    .map((eventId) => project.events.find((event) => event.id === eventId))
    .filter((event): event is EventNode => Boolean(event));
  const selectedTabGroup = tabGroups.find(
    (group) => group.id === selectedTabGroupId,
  );
  const hasInspectorTabs = openEvents.length + inspectorTabs.length > 0;
  const resizeInspectorCard = useCallback((event: ReactPointerEvent<HTMLDivElement>, tabId: string) => {
    if (inspectorMaximized) return;
    event.preventDefault();
    event.stopPropagation();
    const card = event.currentTarget.parentElement;
    const startY = event.clientY;
    const startHeight = card?.getBoundingClientRect().height ?? inspectorHeights[tabId] ?? 440;
    const onMove = (moveEvent: PointerEvent) => {
      setInspectorHeights((current) => ({
        ...current,
        [tabId]: Math.min(window.innerHeight - 70, Math.max(180, startHeight + startY - moveEvent.clientY)),
      }));
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
  }, [inspectorHeights, inspectorMaximized]);
  const renderGroupMenu = useCallback(
    (variant: "stack" | "collapsed") => (
      <div
        className={`event-inspector-group-menu ${variant} ${groupMenuOpen ? "open" : ""}`}
        aria-label="Inspector tab groups"
      >
        <button
          type="button"
          className="event-inspector-group-trigger"
          title="Inspector tab groups"
          aria-label="Inspector tab groups"
          aria-expanded={groupMenuOpen}
          onClick={(event) => {
            event.stopPropagation();
            setGroupMenuOpen((open) => !open);
          }}
        >
          <FolderOpen size={15} />
        </button>
        {groupMenuOpen ? <div className="event-inspector-group-popover">
          <div className="event-inspector-group-popover-header">
            <strong>Tab groups</strong>
            <span>{tabGroups.length}</span>
          </div>
          {variant === "stack" ? (
            <button
              type="button"
              disabled={!hasInspectorTabs}
              onClick={onSaveGroup}
            >
              Save current group
            </button>
          ) : null}
          <select
            aria-label="Saved inspector tab groups"
            disabled={tabGroups.length === 0}
            value={selectedTabGroupId}
            onChange={(event) => setSelectedTabGroupId(event.target.value)}
          >
            {tabGroups.length === 0 ? (
              <option value="">No saved groups</option>
            ) : null}
            {tabGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <div className="event-inspector-group-actions">
            <button
              type="button"
              disabled={!selectedTabGroup}
              onClick={() =>
                selectedTabGroup && onLoadGroup(selectedTabGroup.id)
              }
            >
              Load
            </button>
            {variant === "stack" ? (
              <button
                type="button"
                disabled={!selectedTabGroup}
                onClick={() =>
                  selectedTabGroup && onDeleteGroup(selectedTabGroup.id)
                }
              >
                Delete
              </button>
            ) : null}
          </div>
        </div> : null}
      </div>
    ),
    [
      onDeleteGroup,
      onLoadGroup,
      onSaveGroup,
      hasInspectorTabs,
      groupMenuOpen,
      selectedTabGroup,
      selectedTabGroupId,
      tabGroups,
    ],
  );

  useEffect(() => {
    onPruneEvents(validEventIds);
  }, [currentSequence?.id, onPruneEvents, validEventIds]);

  useEffect(() => {
    if (
      selectedTabGroupId &&
      tabGroups.some((group) => group.id === selectedTabGroupId)
    ) {
      return;
    }
    setSelectedTabGroupId(tabGroups[0]?.id ?? "");
  }, [selectedTabGroupId, tabGroups]);

  useEffect(() => {
    if (!eventInspector.open) {
      return;
    }
    if (selectedDirectEventId && eventIds.has(selectedDirectEventId)) {
      if (
        manuallyClosedEventIdRef.current &&
        manuallyClosedEventIdRef.current !== selectedDirectEventId
      ) {
        manuallyClosedEventIdRef.current = undefined;
      }
      if (manuallyClosedEventIdRef.current === selectedDirectEventId) {
        return;
      }
      if (
        manuallyCollapsedEventIdRef.current &&
        manuallyCollapsedEventIdRef.current !== selectedDirectEventId
      ) {
        manuallyCollapsedEventIdRef.current = undefined;
      }
      if (!eventInspector.openEventIds.includes(selectedDirectEventId)) {
        onOpenEvent(selectedDirectEventId);
        manuallyCollapsedEventIdRef.current = undefined;
      }
      if (manuallyCollapsedEventIdRef.current === selectedDirectEventId) {
        return;
      }
      if (eventInspector.expandedEventId !== selectedDirectEventId) {
        onOpenEvent(selectedDirectEventId);
      }
      return;
    }
  }, [
    eventInspector.expandedEventId,
    eventInspector.open,
    eventInspector.openEventIds,
    onOpenEvent,
    selectedDirectEventId,
    eventIds,
  ]);

  const toggleInspector = useCallback(
    (eventId: string) => {
      manuallyCollapsedEventIdRef.current = undefined;
      manuallyClosedEventIdRef.current = undefined;
      onOpenEvent(eventId);
      onSelect({ type: "node", id: eventId });
    },
    [onOpenEvent, onSelect],
  );

  const closeInspector = useCallback(
    (eventId: string) => {
      manuallyClosedEventIdRef.current = eventId;
      onCloseEvent(eventId);
    },
    [onCloseEvent],
  );

  const minimizeInspector = useCallback(
    (eventId: string) => {
      if (eventInspector.expandedEventId === eventId) {
        manuallyCollapsedEventIdRef.current = eventId;
      }
      onCollapseEvent(eventId);
    },
    [eventInspector.expandedEventId, onCollapseEvent],
  );

  const openTabCloseMenu = useCallback(
    (contextEvent: ReactMouseEvent<HTMLButtonElement>, eventId: string) => {
      contextEvent.preventDefault();
      contextEvent.stopPropagation();
      setTabContextMenu({
        kind: "event",
        eventId,
        ...clampFloatingMenuPosition(
          contextEvent.clientX,
          contextEvent.clientY,
          viewportBounds(),
        ),
      });
    },
    [],
  );

  const openInspectorTabCloseMenu = useCallback(
    (contextEvent: ReactMouseEvent<HTMLButtonElement>) => {
      contextEvent.preventDefault();
      contextEvent.stopPropagation();
      setTabContextMenu({
        kind: "inspector",
        ...clampFloatingMenuPosition(
          contextEvent.clientX,
          contextEvent.clientY,
          viewportBounds(),
        ),
      });
    },
    [],
  );

  useEffect(() => {
    if (!tabContextMenu) return;
    function handlePointerDown(event: PointerEvent) {
      if (tabContextMenuRef.current?.contains(event.target as Node)) return;
      setTabContextMenu(undefined);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setTabContextMenu(undefined);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [tabContextMenu]);

  if (!eventInspector.open || openEvents.length === 0) {
    if (inspectorTabs.length > 0) {
      return (
        <aside
          className={`event-authoring-dock explorer-inspector-dock ${inspectorMaximized ? "maximized" : ""}`}
          aria-label="Inspector dock"
        >
          <div className="event-inspector-stack">
            <div className="event-inspector-tab-cluster">
            <div className="inspector-stack-tools">
              {renderGroupMenu("stack")}
              <button
                type="button"
                className="inspector-maximize-button"
                title={inspectorMaximized ? "Restore inspector" : "Expand inspector"}
                onClick={onToggleInspectorMaximized}
              >
                {inspectorMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>
            <div className="event-inspector-cards" role="list">
            {inspectorTabs.map((tab, index) => {
              const expanded = expandedInspectorTabId === tab.id;
              const TabIcon = inspectorTabIcon(tab);
              return (
                <section
                  className={`event-editor-panel event-inspector-card ${expanded ? "expanded" : "minimized"}`}
                  key={tab.id}
                  role="listitem"
                  data-inspector-kind={tab.selection.type}
                  data-active={expanded || undefined}
                  style={{ "--stack-index": index + 1, "--inspector-card-height": `${inspectorHeights[tab.id] ?? 440}px` } as CSSProperties}
                >
                  {expanded ? <div className="event-inspector-card-resize-border" onPointerDown={(event) => resizeInspectorCard(event, tab.id)} title="Drag top border to resize" /> : null}
                  <div className="event-editor-header">
                    <button
                      type="button"
                      className="event-minimized-title"
                      title={tab.title}
                      onClick={() => onOpenInspectorTab(tab.id)}
                    >
                      <strong><TabIcon className="event-header-icon" size={14} /><span className="event-header-copy"><span className="event-header-name">{tab.title}</span></span></strong>
                    </button>
                    <div className="event-editor-actions">
                      <button type="button" title={expanded ? "Minimize inspector" : "Expand inspector"} onClick={() => onOpenInspectorTab(tab.id)}>
                        {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                      </button>
                      {tab.mode === "debug" ? (
                        <button type="button" title="Disable Inspector Debug" onClick={onDisableInspectorDebug}><Power size={14} /></button>
                      ) : <button type="button" title="Close inspector" onClick={() => onCloseInspectorTab(tab.id)} onContextMenu={openInspectorTabCloseMenu}><X size={14} /></button>}
                    </div>
                  </div>
                  {expanded ? <div className="event-inspector-body"><div className="event-inspector-body-scroll">{tab.mode === "debug" ? <DebugInspector project={project} nodes={nodes} selection={tab.selection} /> : isValidElement(children) ? cloneElement(children as ReactElement<{ selection?: Selection }>, { selection: tab.selection }) : children}</div></div> : null}
                </section>
              );
            })}
            </div>
            </div>
          </div>
        </aside>
      );
    }
    return selectedEvent ||
      eventInspector.openEventIds.length > 0 ||
      tabGroups.length > 0 ? (
      <aside
        className="event-authoring-dock collapsed"
        aria-label="Event authoring dock"
      >
        <div className="event-inspector-collapsed-controls">
          <button
            type="button"
            className="event-stack-launcher icon-only"
            disabled={
              !selectedEvent && eventInspector.openEventIds.length === 0
            }
            title="Open inspector"
            aria-label="Open inspector"
            onClick={() => {
              if (eventInspector.openEventIds.length > 0) {
                onOpenEvent(eventInspector.openEventIds[0]);
                return;
              }
              if (selectedEvent) {
                toggleInspector(selectedEvent.id);
              }
            }}
          >
            <ChevronUp size={14} />
          </button>
          {renderGroupMenu("collapsed")}
        </div>
      </aside>
    ) : null;
  }

  return (
    <aside
      className={`event-authoring-dock ${inspectorMaximized ? "maximized" : ""}`}
      aria-label="Event inspector stack"
    >
      <div className="event-inspector-stack">
        <div className="event-inspector-tab-cluster">
          {hasInspectorTabs ? (
            <div className="inspector-stack-tools">
              {renderGroupMenu("stack")}
              <button
                type="button"
                className="inspector-maximize-button"
                title={inspectorMaximized ? "Restore inspector" : "Expand inspector"}
                onClick={onToggleInspectorMaximized}
              >
                {inspectorMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>
          ) : null}
          <div className="event-inspector-cards" role="list">
          {inspectorTabs.map((tab, index) => {
            const expanded = expandedInspectorTabId === tab.id;
            const TabIcon = inspectorTabIcon(tab);
            return (
              <section
                className={`event-editor-panel event-inspector-card ${expanded ? "expanded" : "minimized"}`}
                key={tab.id}
                role="listitem"
                data-inspector-kind={tab.selection.type}
                data-active={expanded || undefined}
                style={{ "--stack-index": index + openEvents.length + 1, "--inspector-card-height": `${inspectorHeights[tab.id] ?? 440}px` } as CSSProperties}
              >
                {expanded ? <div className="event-inspector-card-resize-border" onPointerDown={(event) => resizeInspectorCard(event, tab.id)} title="Drag top border to resize" /> : null}
                <div className="event-editor-header">
                  <button type="button" className="event-minimized-title" title={tab.title} onClick={() => onOpenInspectorTab(tab.id)}>
                    <strong><TabIcon className="event-header-icon" size={14} /><span className="event-header-copy"><span className="event-header-name">{tab.title}</span></span></strong>
                  </button>
                  <div className="event-editor-actions">
                    <button type="button" title={expanded ? "Minimize inspector" : "Expand inspector"} onClick={() => onOpenInspectorTab(tab.id)}>{expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button>
                    {tab.mode === "debug" ? (
                      <button type="button" title="Disable Inspector Debug" onClick={onDisableInspectorDebug}><Power size={14} /></button>
                    ) : <button type="button" title="Close inspector" onClick={() => onCloseInspectorTab(tab.id)} onContextMenu={openInspectorTabCloseMenu}><X size={14} /></button>}
                  </div>
                </div>
                {expanded ? <div className="event-inspector-body"><div className="event-inspector-body-scroll">{tab.mode === "debug" ? <DebugInspector project={project} nodes={nodes} selection={tab.selection} /> : isValidElement(children) ? cloneElement(children as ReactElement<{ selection?: Selection }>, { selection: tab.selection }) : children}</div></div> : null}
              </section>
            );
          })}
          {openEvents.map((event, index) => {
            const isExpanded = eventInspector.expandedEventId === event.id;
            const isDraftEvent = eventDraft?.eventId === event.id;
            const cardEvent =
              isExpanded && isDraftEvent
                ? (eventDraft?.draftEvent ?? event)
                : event;
            return (
              <section
                className={`event-editor-panel event-inspector-card ${isExpanded ? "expanded" : "minimized"}`}
                aria-label={`${event.name} inspector`}
                key={event.id}
                role="listitem"
                data-inspector-kind="event"
                data-active={isExpanded || undefined}
                style={{ "--stack-index": index + 1, "--inspector-card-height": `${inspectorHeights[`event:${event.id}`] ?? 440}px` } as CSSProperties}
              >
                {isExpanded ? <div className="event-inspector-card-resize-border" onPointerDown={(pointerEvent) => resizeInspectorCard(pointerEvent, `event:${event.id}`)} title="Drag top border to resize" /> : null}
                <div className="event-editor-header">
                  {isExpanded ? (
                    <div className="event-header-title">
                      <strong title={cardEvent.name ?? "No event selected"}>
                        <GitBranch
                          className="event-header-icon"
                          size={15}
                          aria-hidden="true"
                        />
                        <span className="event-header-copy">
                          <span className="event-header-name">
                            {cardEvent.name ?? "No event selected"}
                          </span>
                        </span>
                        {isDraftEvent && eventDraft?.dirty ? (
                          <span
                            className="event-dirty-star"
                            aria-label="unsaved edits"
                          >
                            *
                          </span>
                        ) : null}
                      </strong>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="event-minimized-title"
                      onClick={() => toggleInspector(event.id)}
                      title={`Open ${event.name}`}
                    >
                      <strong>
                        <GitBranch
                          className="event-header-icon"
                          size={14}
                          aria-hidden="true"
                        />
                        <span className="event-header-copy">
                          <span className="event-header-name">{event.name}</span>
                        </span>
                        {isDraftEvent && eventDraft?.dirty ? (
                          <span
                            className="event-dirty-star"
                            aria-label="unsaved edits"
                          >
                            *
                          </span>
                        ) : null}
                      </strong>
                    </button>
                  )}
                  <div className="event-editor-actions">
                    {isExpanded ? (
                      <button
                        type="button"
                        disabled={
                          !eventDraft?.dirty ||
                          !isDraftEvent ||
                          eventDraft.saving
                        }
                        onClick={onSaveEventDraft}
                      >
                        {isDraftEvent && eventDraft?.dirty ? (
                          <span className="event-dirty-star" aria-hidden="true">
                            *
                          </span>
                        ) : null}
                        {eventDraft?.saving && isDraftEvent
                          ? "Saving..."
                          : "Save"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      title={
                        isExpanded ? "Minimize inspector" : "Expand inspector"
                      }
                      onClick={() =>
                        isExpanded
                          ? minimizeInspector(event.id)
                          : toggleInspector(event.id)
                      }
                    >
                      {isExpanded ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronUp size={14} />
                      )}
                    </button>
                    <button
                      type="button"
                      title={
                        isDraftEvent && eventDraft?.dirty
                          ? "Save or discard edits before closing"
                          : "Close inspector"
                      }
                      onClick={() => closeInspector(event.id)}
                      onContextMenu={(contextEvent) =>
                        openTabCloseMenu(contextEvent, event.id)
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="event-inspector-body" aria-hidden={!isExpanded}>
                  {isExpanded ? (
                    <div className="event-inspector-body-scroll">
                      <div className="event-dock-inspector">{children}</div>
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      </div>
      {tabContextMenu ? (
        <div
          ref={tabContextMenuRef}
          className="canvas-menu tab-context-menu"
          style={{ left: tabContextMenu.x, top: tabContextMenu.y }}
        >
          {tabContextMenu.kind === "event" ? <>
          <button
            type="button"
            onClick={() => {
              onCloseEventsAbove(tabContextMenu.eventId);
              setTabContextMenu(undefined);
            }}
          >
            Close tabs above
          </button>
          <button
            type="button"
            onClick={() => {
              onCloseEventsBelow(tabContextMenu.eventId);
              setTabContextMenu(undefined);
            }}
          >
            Close tabs below
          </button>
          <button
            type="button"
            onClick={() => {
              onCloseOtherEvents(tabContextMenu.eventId);
              setTabContextMenu(undefined);
            }}
          >
            Close other tabs
          </button>
          <button
            type="button"
            onClick={() => {
              onCloseAllEvents();
              setTabContextMenu(undefined);
            }}
          >
            Close all tabs
          </button>
          </> : <button type="button" onClick={() => {
            onCloseAllInspectorTabs();
            setTabContextMenu(undefined);
          }}>
            Close all inspector tabs
          </button>}
        </div>
      ) : null}
    </aside>
  );
}

function Inspector({
  project,
  scope,
  propertiesConfig,
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
  onUpdateBranch,
  onCreateEventInBranch,
  onUpdateEvent,
  onCreateDecision,
  onUpdateDecision,
  onUpdateDialogue,
  onUpdateDialogueBeat,
  onUpdateEventDialogueBeat,
  onUpdateScriptBlock,
  onDeleteDialogueBeat,
  onDeleteEventDialogueBeat,
  onDeleteDecision,
  onDeleteDialogue,
  onCreateOutcome,
  onUpdateOutcome,
  onDeleteOutcome,
  onUpdateTransition,
  onDeleteTransition,
  onCreateCanonSuggestion,
  onUpdateCanonSuggestion,
  onDeleteCanonSuggestion,
  onUpdateDataObject,
  onDeleteDataObject,
  onSelectCanon,
  onSelectSuggestion,
  onEditCanonRef,
  onCreateCanonWorkingCopy,
  onSaveCanonWorkingCopy,
  onExportCanonChangeSet,
  onApplyCanonWorkingCopy,
  onUpdateLocalExplorerEntity,
  onPublishLocalExplorerEntity,
  onUpdateLocalExplorerType,
  onUpdateLocalExplorerProperty,
  onUpdateLogicPropertyOverride,
  onUpdateCharacterCategories,
  onUpdateEdgeLabel,
  onDeleteSelection,
  onOpenRule,
}: {
  project: BranchingProject;
  scope?: CanvasScope;
  propertiesConfig?: Record<string, unknown>;
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
  onUpdateBranch: (id: string, updates: Partial<Branch>) => void;
  onCreateEventInBranch: (branchId: string, type?: EventType) => void;
  onUpdateEvent: (id: string, updates: Partial<EventNode>) => void;
  onCreateDecision: (eventId: string) => void;
  onUpdateDecision: (
    eventId: string,
    decisionId: string,
    updates: Partial<Decision>,
  ) => void;
  onUpdateDialogue: (
    eventId: string,
    dialogueId: string,
    updates: Partial<DialogueNode>,
  ) => void;
  onUpdateDialogueBeat: (
    eventId: string,
    dialogueId: string,
    beatId: string,
    updates: Partial<DialogueBeat>,
  ) => void;
  onUpdateEventDialogueBeat: (eventId: string, beatId: string, updates: Partial<DialogueBeat>) => void;
  onUpdateScriptBlock: (
    scriptId: string,
    blockId: string,
    updates: { content?: string; translations?: Record<string, string>; speakerRef?: string },
  ) => void;
  onDeleteDialogueBeat: (eventId: string, dialogueId: string, beatId: string) => void;
  onDeleteEventDialogueBeat: (eventId: string, beatId: string) => void;
  onDeleteDecision: (eventId: string, decisionId: string) => void;
  onDeleteDialogue: (eventId: string, dialogueId: string) => void;
  onCreateOutcome: (eventId: string, decisionId: string) => void;
  onUpdateOutcome: (
    eventId: string,
    decisionId: string,
    outcomeId: string,
    updates: Partial<Outcome>,
  ) => void;
  onDeleteOutcome: (
    eventId: string,
    decisionId: string,
    outcomeId: string,
  ) => void;
  onUpdateTransition: (
    transitionId: string,
    updates: Partial<Transition>,
  ) => void;
  onDeleteTransition: (transitionId: string) => void;
  onCreateCanonSuggestion: (
    canonRefId: string,
    source?: { eventId?: string; dataObjectId?: string },
  ) => void;
  onUpdateCanonSuggestion: (
    id: string,
    updates: Partial<CanonEditSuggestion>,
  ) => void;
  onDeleteCanonSuggestion: (id: string) => void;
  onUpdateDataObject: (id: string, updates: Partial<ProjectDataObject>) => void;
  onDeleteDataObject: (id: string) => void;
  onSelectCanon: (id: string) => void;
  onSelectSuggestion: (id: string) => void;
  onEditCanonRef: (ref: CanonRef) => void;
  onCreateCanonWorkingCopy: (ref: CanonRef) => void;
  onSaveCanonWorkingCopy: (canonRefId: string, content: string) => void;
  onExportCanonChangeSet: (canonRefId: string) => void;
  onApplyCanonWorkingCopy: (canonRefId: string) => void;
  onUpdateLocalExplorerEntity: (
    id: string,
    updates: Partial<LocalExplorerEntity>,
  ) => void;
  onPublishLocalExplorerEntity: (id: string) => void;
  onUpdateLocalExplorerType: (
    id: string,
    updates: Partial<LocalExplorerType>,
  ) => void;
  onUpdateLocalExplorerProperty: (
    id: string,
    updates: Partial<LocalExplorerProperty>,
  ) => void;
  onUpdateLogicPropertyOverride: (propertyId: string, source: "canon" | "local", changes: Partial<LogicPropertyOverride>) => void;
  onUpdateCharacterCategories: (categories: string[]) => void;
  onUpdateEdgeLabel: (edgeId: string, label: string) => void;
  onDeleteSelection: (selection: Selection) => void;
  onOpenRule: (id: string) => void;
}) {
  const [transitionInspectorTab, setTransitionInspectorTab] = useState<
    "route" | "if" | "effects"
  >("route");
  const [objectInspectorTab, setObjectInspectorTab] = useState("overview");
  const selectedNode =
    selection?.type === "node"
      ? nodes.find((node) => node.id === selection.id)
      : undefined;
  const selectedEdge =
    selection?.type === "edge"
      ? edges.find((edgeItem) => edgeItem.id === selection.id)
      : undefined;
  const selectedCanon =
    selection?.type === "canon"
      ? project.canonRefs.find((canonRef) => canonRef.id === selection.id)
      : undefined;
  const selectedFile =
    selection?.type === "file"
      ? files.find((file) => file.id === selection.id)
      : undefined;
  const selectedDataObject =
    selection?.type === "dataObject"
      ? project.projectDataObjects?.find(
          (dataObject) => dataObject.id === selection.id,
        )
      : undefined;
  const selectedSuggestion =
    selection?.type === "canonSuggestion"
      ? project.canonEditSuggestions?.find(
          (suggestion) => suggestion.id === selection.id,
        )
      : undefined;
  const selectedExplorerEntity =
    selection?.type === "explorerEntity"
      ? project.localExplorerEntities?.find(
          (entity) => entity.id === selection.id,
        )
      : undefined;
  const selectedExplorerSchemaSource =
    selection?.type === "explorerType" || selection?.type === "explorerProperty"
      ? selection.source
      : undefined;
  const selectedExplorerType =
    selection?.type === "explorerType"
      ? selection.source === "local"
        ? project.localExplorerTypes?.find((type) => type.id === selection.id)
        : canonExplorerTypes(propertiesConfig).find(
            (type) => type.id === selection.id,
          )
      : undefined;
  const selectedExplorerProperty =
    selection?.type === "explorerProperty"
      ? selection.source === "local"
        ? project.localExplorerProperties?.find(
            (property) => property.id === selection.id,
          )
        : flattenCanonExplorerProperties(canonExplorerProperties(propertiesConfig)).find(
            (property) => property.id === selection.id,
          )
      : undefined;
  const characterMappingId = "pathbranching:additional-characters";
  const additionalCharacterCategories = project.integrationConfigOverride?.mappings
    .find((mapping) => mapping.id === characterMappingId)?.worldnotionTypes ?? [];
  const canonCategories = Array.from(new Set(project.canonRefs
    .map((ref) => ref.kind)
    .filter((kind): kind is string => Boolean(kind)))).sort();
  const defaultCharacterCategories = mergeIntegrationConfigs(project.integrationConfig, {
    specVersion: "0.1",
    mappings: (project.integrationConfigOverride?.mappings ?? [])
      .filter((mapping) => mapping.id !== characterMappingId),
  }).mappings
    .filter((mapping) => mapping.roles.includes("speaker"))
    .flatMap((mapping) => mapping.worldnotionTypes);

  const sequence =
    selection?.type === "node"
      ? findSequence(project, selection.id)
      : undefined;
  const branch =
    selection?.type === "node" ? findBranch(project, selection.id) : undefined;
  const event =
    selection?.type === "node" ? findEvent(project, selection.id) : undefined;
  const selectedDecisionContext =
    selectedNode?.data.kind === "decision" &&
    typeof selectedNode.data.details?.eventId === "string"
      ? {
          eventId: selectedNode.data.details.eventId,
          decision: findEvent(
            project,
            selectedNode.data.details.eventId,
          )?.decisions?.find(
            (decision) =>
              decision.id ===
              (
                selectedNode.data.details?.decision as
                  { id?: string } | undefined
              )?.id,
          ),
        }
      : undefined;
  const selectedDialogueContext =
    selectedNode?.data.kind === "dialogue" &&
    typeof selectedNode.data.details?.eventId === "string"
      ? {
          eventId: selectedNode.data.details.eventId,
          dialogue: findEvent(
            project,
            selectedNode.data.details.eventId,
          )?.dialogues?.find(
            (dialogue) =>
              dialogue.id ===
              (
                selectedNode.data.details?.dialogue as
                  { id?: string } | undefined
              )?.id,
          ),
        }
      : undefined;
  const selectedOutcomeContext =
    selectedNode?.data.kind === "outcome" &&
    typeof selectedNode.data.details?.eventId === "string"
      ? {
          eventId: selectedNode.data.details.eventId,
          decisionId: String(
            selectedNode.data.details.decisionId ?? "",
          ).replace(`decision:${selectedNode.data.details.eventId}:`, ""),
          outcome: selectedNode.data.details.outcome as Outcome | undefined,
        }
      : undefined;
  const selectedMissingRefContext =
    selectedNode?.data.kind === "missingRef" &&
    typeof selectedNode.data.details?.ownerId === "string" &&
    typeof selectedNode.data.details?.missingEventId === "string"
      ? {
          ownerId: selectedNode.data.details.ownerId,
          missingEventId: selectedNode.data.details.missingEventId,
        }
      : undefined;
  const selectedTransitionId = selectedEdge?.id.startsWith("edge:transition:")
    ? selectedEdge.id.replace("edge:transition:", "")
    : undefined;
  const selectedTransition = selectedTransitionId
    ? project.events
        .flatMap((eventNode) => eventNode.transitions ?? [])
        .find((transition) => transition.id === selectedTransitionId)
    : undefined;
  const selectedTransitionOwner = selectedTransition
    ? project.events.find((eventNode) =>
        eventNode.transitions?.some(
          (transition) => transition.id === selectedTransition.id,
        ),
      )
    : undefined;
  const selectedRouteGateContext =
    selectedNode?.data.kind === "routeGate" &&
    typeof selectedNode.data.details?.routeSourceId === "string"
      ? (() => {
          const sourceId = selectedNode.data.details.routeSourceId as string;
          const owner = project.events.find((eventNode) =>
            eventNode.transitions?.some((transition) => transition.from === sourceId),
          );
          const routes = (owner?.transitions ?? [])
            .filter((transition) => transition.from === sourceId)
            .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
          return owner && routes.length
            ? { sourceId, owner, routes }
            : undefined;
        })()
      : undefined;
  const selectedTransitionTarget = selectedTransition
    ? findEvent(project, selectedTransition.to)
    : undefined;
  const selectedTransitionOutput =
    selectedTransitionOwner && selectedTransition
      ? selectedTransition.from === selectedTransitionOwner.id
        ? "Event output"
        : selectedTransitionOwner.decisions
            ?.flatMap((decision) =>
              decision.outcomes.map((outcome) => ({
                id: `outcome:${selectedTransitionOwner.id}:${decision.id}:${outcome.id}`,
                label: `${decision.name} → ${outcome.name}`,
              })),
            )
            .find((outcome) => outcome.id === selectedTransition.from)?.label ??
          "Nested output"
      : undefined;
  useEffect(() => {
    setTransitionInspectorTab("route");
  }, [selectedTransition?.id]);
  useEffect(() => {
    setObjectInspectorTab("overview");
  }, [selection?.type, selection?.id]);
  const selectedDialogueBeatContext =
    (selectedNode?.data.kind === "speechBeat" || selectedNode?.data.kind === "directionBeat") &&
    typeof selectedNode.data.details?.eventId === "string"
      ? (() => {
          const eventId = selectedNode.data.details!.eventId as string;
          const dialogueId = typeof selectedNode.data.details!.dialogueId === "string"
            ? selectedNode.data.details!.dialogueId as string
            : undefined;
          const beatId = (selectedNode.data.details?.beat as { id?: string } | undefined)?.id;
          const event = findEvent(project, eventId);
          const dialogue = dialogueId ? event?.dialogues?.find((item) => item.id === dialogueId) : undefined;
          const beat = dialogueId
            ? dialogue?.beats?.find((item) => item.id === beatId)
            : event?.dialogueBeats?.find((item) => item.id === beatId);
          const block = beat
            ? project.scriptDocuments
                ?.find((script) => script.id === beat.blockRef.scriptId)
                ?.blocks.find((item) => item.id === beat.blockRef.blockId)
            : undefined;
          return beat && block ? { eventId, dialogueId, beat, block } : undefined;
        })()
      : undefined;
  const selectedDialogueFirstBeat = selectedDialogueContext?.dialogue?.beats?.[0];
  const selectedDialogueFirstBlock = selectedDialogueFirstBeat
    ? project.scriptDocuments
        ?.find((script) => script.id === selectedDialogueFirstBeat.blockRef.scriptId)
        ?.blocks.find((block) => block.id === selectedDialogueFirstBeat.blockRef.blockId)
    : undefined;
  const isParentCanvas = scope?.kind !== "event";
  const selectedDataClass = selectedDataObject
    ? project.dataClasses?.find(
        (dataClass) => dataClass.id === selectedDataObject.classId,
      )
    : undefined;
  const canonRefIds = project.canonRefs
    .filter((canonRef) => canonRefHasRole(project, canonRef, "condition"))
    .map((canonRef) => canonRef.id);
  const speakerCanonRefs = project.canonRefs.filter((canonRef) =>
    canonRefHasRole(project, canonRef, "speaker"),
  );
  const eventCategories = project.eventCategories ?? [];
  const dataObjects = project.projectDataObjects ?? [];
  const eventSequence = event ? findSequence(project, event.id) : undefined;
  const eventBranches = eventSequence
    ? branchesForSequence(project, eventSequence.id)
    : project.branches;
  const outgoingTransitions = event?.transitions ?? [];
  const inspectorIdentity = (() => {
    if (event)
      return {
        label: event.name ?? "Untitled event",
        kind: "Event",
        Icon: GitBranch,
      };
    if (selectedDecisionContext?.decision)
      return {
        label: selectedDecisionContext.decision.name ?? "Untitled decision",
        kind: "Decision",
        Icon: Split,
      };
    if (selectedDialogueBeatContext)
      return {
        label: selectedDialogueBeatContext.block.content || (selectedDialogueBeatContext.beat.kind === "speech" ? "Speech beat" : "Direction beat"),
        kind: selectedDialogueBeatContext.beat.kind === "speech" ? "Speech Beat" : "Direction Beat",
        Icon: MessageSquare,
      };
    if (selectedDialogueContext?.dialogue)
      return {
        label:
          selectedDialogueContext.dialogue.title ||
          selectedDialogueContext.dialogue.text.content ||
          "Untitled dialogue",
        kind: "Dialogue",
        Icon: MessageSquare,
      };
    if (selectedOutcomeContext?.outcome)
      return {
        label: selectedOutcomeContext.outcome.name ?? "Untitled outcome",
        kind: "Outcome",
        Icon: Split,
      };
    if (selectedRouteGateContext)
      return {
        label: "Route Gate",
        kind: `${selectedRouteGateContext.routes.length} routes`,
        Icon: GitBranch,
      };
    if (selectedTransition)
      return {
        label: isParentCanvas
          ? "Connection"
          : selectedTransition.label ?? "Untitled transition",
        kind: isParentCanvas ? "Canvas connector" : "Transition",
        Icon: GitBranch,
      };
    if (selectedCanon)
      return {
        label: selectedCanon.label ?? selectedCanon.id,
        kind: `Canon · ${selectedCanon.kind ?? "Entity"}`,
        Icon: FilePlus2,
      };
    if (selectedExplorerEntity)
      return {
        label: selectedExplorerEntity.name,
        kind: `Local · ${selectedExplorerEntity.type}`,
        Icon: FilePlus2,
      };
    if (selectedExplorerType)
      return {
        label: selectedExplorerType.label,
        kind:
          selectedExplorerSchemaSource === "canon"
            ? "Canon type"
            : "Local type",
        Icon: CircleDot,
      };
    if (selectedExplorerProperty)
      return {
        label: selectedExplorerProperty.label,
        kind:
          selectedExplorerSchemaSource === "canon"
            ? "Canon property"
            : "Local property",
        Icon: Boxes,
      };
    if (selectedDataObject)
      return {
        label: selectedDataObject.name ?? selectedDataObject.id,
        kind: `Project Data · ${selectedDataObject.classId}`,
        Icon: Database,
      };
    if (sequence)
      return { label: sequence.name, kind: "Sequence", Icon: GitBranch };
    if (branch) return { label: branch.title, kind: "Branch", Icon: GitBranch };
    return { label: "Inspector", kind: "Project", Icon: Database };
  })();
  const InspectorIdentityIcon = inspectorIdentity.Icon;

  return (
    <aside className={`canvas-inspector ${embedded ? "embedded" : ""}`}>
      <div
        className={`inspector-header inspector-object-header ${embedded ? "embedded" : ""}`}
      >
        <div className="inspector-object-identity">
          <span className="inspector-object-icon" aria-hidden="true">
            <InspectorIdentityIcon size={16} />
          </span>
          <div>
            <strong title={inspectorIdentity.label}>
              {inspectorIdentity.label}
            </strong>
            <span>{inspectorIdentity.kind}</span>
          </div>
        </div>
        {!embedded ? (
          <button type="button" title="Close inspector" onClick={onClose}>
            x
          </button>
        ) : null}
      </div>

      <div className="inspector-scroll">
        {sequence ? (
          <section className="inspector-section">
            <h2>Sequence</h2>
            <label className="field-label">
              Name
              <input
                value={sequence.name}
                onChange={(event) =>
                  onUpdateSequence(sequence.id, { name: event.target.value })
                }
              />
            </label>
            <label className="field-label">
              Entry Event
              <select
                value={sequence.entryEventId}
                onChange={(event) =>
                  onUpdateSequence(sequence.id, {
                    entryEventId: event.target.value,
                  })
                }
              >
                {sequence.eventIds.map((eventId) => (
                  <option key={eventId} value={eventId}>
                    {findEvent(project, eventId)?.name ?? eventId}
                  </option>
                ))}
              </select>
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
              <button
                type="button"
                className="danger"
                onClick={() =>
                  onDeleteSelection({ type: "node", id: sequence.id })
                }
              >
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
              onChange={(availability) =>
                onUpdateSequence(sequence.id, { availability })
              }
            />
            <LocalRuleSetEditor value={sequence.ruleSets} canonRefs={canonRefIds} dataObjects={dataObjects} onChange={(ruleSets) => onUpdateSequence(sequence.id, { ruleSets })} />
            <LogicSection
              availability={sequence.availability}
              ruleSets={sequence.ruleSets}
            />
          </>
        ) : null}

        {branch ? (
          <>
            <section className="inspector-section">
              <h2>Branch</h2>
              <label className="field-label">
                Title
                <input
                  value={branch.title}
                  onChange={(event) =>
                    onUpdateBranch(branch.id, { title: event.target.value })
                  }
                />
              </label>
              <label className="field-label">
                Description
                <textarea
                  value={branch.description ?? ""}
                  rows={3}
                  onChange={(event) =>
                    onUpdateBranch(branch.id, {
                      description: event.target.value || undefined,
                    })
                  }
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
                <button
                  type="button"
                  onClick={() => onCreateEventInBranch(branch.id)}
                >
                  New Event Inside
                </button>
                <button
                  type="button"
                  onClick={() => onCreateEventInBranch(branch.id, "final")}
                >
                  New Final Inside
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() =>
                    onDeleteSelection({ type: "node", id: branch.id })
                  }
                >
                  Delete
                </button>
              </div>
            </section>
            <BasicConditionEditor
              value={branch.availability}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(availability) =>
                onUpdateBranch(branch.id, { availability })
              }
            />
            <LocalRuleSetEditor value={branch.ruleSets} canonRefs={canonRefIds} dataObjects={dataObjects} onChange={(ruleSets) => onUpdateBranch(branch.id, { ruleSets })} />
            <LogicSection
              availability={branch.availability}
              ruleSets={branch.ruleSets}
            />
          </>
        ) : null}

        {event ? (
          <>
            <InspectorContentTabs value={objectInspectorTab} onChange={setObjectInspectorTab} tabs={[{ id: "overview", label: "Overview" }, { id: "connections", label: "Connections" }, { id: "logic", label: "Logic" }, { id: "choices", label: "Choices" }]} />
            {objectInspectorTab === "overview" ? <>
            <section className="inspector-section">
              <h2>Event</h2>
              <label className="field-label">
                Name
                <input
                  value={event.name}
                  onChange={(inputEvent) =>
                    onUpdateEvent(event.id, { name: inputEvent.target.value })
                  }
                />
              </label>
              <label className="field-label">
                Description
                <textarea
                  rows={3}
                  value={event.description ?? ""}
                  onChange={(inputEvent) =>
                    onUpdateEvent(event.id, {
                      description: inputEvent.target.value || undefined,
                    })
                  }
                />
              </label>
              <label className="field-label">
                Category
                <select
                  value={event.type}
                  onChange={(inputEvent) =>
                    onUpdateEvent(event.id, { type: inputEvent.target.value })
                  }
                >
                  {eventCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                      {category.terminal ? " (terminal)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </section>
            </> : null}
            {objectInspectorTab === "connections" ? <>
            <section className="inspector-section">
              <h2>Connections</h2>
              <ReferencePicker
                label="Branch"
                options={eventBranches.map((branch) => ({
                  id: branch.id,
                  label: branch.title,
                  detail: branch.description,
                }))}
                value={event.branchRef ? [event.branchRef] : []}
                onChange={(ids) =>
                  onUpdateEvent(event.id, { branchRef: ids[0] ?? null })
                }
              />
              <ReferencePicker
                label="Script"
                options={project.scripts.map((script) => ({
                  id: script.id,
                  label: script.entrySection ?? script.sourcePath ?? script.id,
                  detail: script.format,
                }))}
                value={event.script?.id ? [event.script.id] : []}
                onChange={(ids) =>
                  onUpdateEvent(event.id, {
                    script: project.scripts.find((script) => script.id === ids[0]),
                  })
                }
              />
              <ReferencePicker
                label="Connected events"
                multiple
                options={project.events
                  .filter((candidate) => candidate.id !== event.id)
                  .map((candidate) => ({ id: candidate.id, label: candidate.name }))}
                value={outgoingTransitions.map((transition) => transition.to)}
                onChange={(ids) => {
                  const currentIds = new Set(outgoingTransitions.map((item) => item.to));
                  const removed = outgoingTransitions.filter((item) => !ids.includes(item.to));
                  if (
                    removed.some(
                      (item) =>
                        item.conditions ||
                        (item.consequences?.length ?? 0) > 0 ||
                        item.label ||
                        item.function,
                    ) &&
                    !window.confirm("Removing this event connection will also remove its configured transition. Continue?")
                  ) {
                    return;
                  }
                  const additions = ids
                    .filter((id) => !currentIds.has(id))
                    .map((to) => ({
                      id: `transition:${event.id}:${to}`,
                      from: event.id,
                      to,
                      source: "graph" as const,
                    }));
                  onUpdateEvent(event.id, {
                    transitions: [
                      ...outgoingTransitions.filter((item) => ids.includes(item.to)),
                      ...additions,
                    ],
                  });
                }}
              />
            </section>

            <CanonRefsPicker
              value={event.canonRefs}
              canonRefs={project.canonRefs}
              onChange={(canonRefs) => onUpdateEvent(event.id, { canonRefs })}
            />
            <CanonContextList
              refs={event.canonRefs}
              canonRefs={project.canonRefs}
              onSelectCanon={onSelectCanon}
              onSuggestEdit={(canonRefId) =>
                onCreateCanonSuggestion(canonRefId, { eventId: event.id })
              }
            />
            </> : null}
            {objectInspectorTab === "logic" ? <>
            <section className="inspector-section">
              <h2>Unlocks</h2>
              <div className="stack-list">
                {(event.unlocks ?? []).map((unlock, index) => (
                  <div className="mini-card" key={`${unlock.type}:${index}`}>
                    <strong>{unlock.type}</strong>
                    {"ref" in unlock && typeof unlock.ref === "string" ? (
                      <span>{unlock.ref}</span>
                    ) : null}
                    {"sourceFunction" in unlock &&
                    typeof unlock.sourceFunction === "string" ? (
                      <span>{unlock.sourceFunction}</span>
                    ) : null}
                  </div>
                ))}
                {(event.unlocks ?? []).length === 0 ? (
                  <span className="empty-line">No unlock consequences.</span>
                ) : null}
              </div>
            </section>

            <BasicConditionEditor
              value={event.availability}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(availability) =>
                onUpdateEvent(event.id, { availability })
              }
            />
            <ConsequenceEditor
              title="Unlocks / Runtime Actions"
              value={event.unlocks}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(unlocks) => onUpdateEvent(event.id, { unlocks })}
            />
            <LocalRuleSetEditor value={event.ruleSets} canonRefs={canonRefIds} dataObjects={dataObjects} onChange={(ruleSets) => onUpdateEvent(event.id, { ruleSets })} />
            </> : null}
            {objectInspectorTab === "choices" ? <>
            <section className="inspector-section">
              <h2>Decisions</h2>
              <div className="stack-list">
                {(event.decisions ?? []).map((decision) => (
                  <div className="mini-card" key={decision.id}>
                    <strong>{decision.name}</strong>
                    <span>
                      {decision.type} - {decision.outcomes.length} outcomes
                    </span>
                    <div className="inspector-actions">
                      <button
                        type="button"
                        onClick={() => onCreateOutcome(event.id, decision.id)}
                      >
                        Add Outcome
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => onDeleteDecision(event.id, decision.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {(event.decisions ?? []).length === 0 ? (
                  <span className="empty-line">No decisions yet.</span>
                ) : null}
              </div>
              <div className="inspector-actions">
                <button
                  type="button"
                  onClick={() => onCreateDecision(event.id)}
                >
                  Add Decision
                </button>
              </div>
            </section>
            <LogicSection
              availability={event.availability}
              consequences={event.unlocks}
              ruleSets={event.ruleSets}
            />
            <section className="inspector-section">
              <div className="inspector-actions">
                <button
                  type="button"
                  className="danger"
                  onClick={() =>
                    onDeleteSelection({ type: "node", id: event.id })
                  }
                >
                  Delete
                </button>
              </div>
            </section>
            </> : null}
          </>
        ) : null}

        {selectedDecisionContext?.decision ? (
          <>
            <InspectorContentTabs value={objectInspectorTab} onChange={setObjectInspectorTab} tabs={[{ id: "overview", label: "Overview" }, { id: "choices", label: "Choices" }, { id: "logic", label: "Logic" }]} />
            <section className="inspector-section">
              <h2>Decision</h2>
              {objectInspectorTab === "overview" ? <>
              <label className="field-label">
                Name
                <input
                  value={selectedDecisionContext.decision!.name}
                  onChange={(inputEvent) =>
                    onUpdateDecision(
                      selectedDecisionContext.eventId,
                      selectedDecisionContext.decision!.id,
                      {
                        name: inputEvent.target.value,
                      },
                    )
                  }
                />
              </label>
              <label className="field-label">
                Type
                <input
                  value={selectedDecisionContext.decision!.type}
                  onChange={(inputEvent) =>
                    onUpdateDecision(
                      selectedDecisionContext.eventId,
                      selectedDecisionContext.decision!.id,
                      {
                        type: inputEvent.target.value,
                      },
                    )
                  }
                />
              </label>
              <label className="field-label">
                Description
                <textarea
                  value={selectedDecisionContext.decision!.description ?? ""}
                  rows={3}
                  onChange={(inputEvent) =>
                    onUpdateDecision(
                      selectedDecisionContext.eventId,
                      selectedDecisionContext.decision!.id,
                      {
                        description: inputEvent.target.value || undefined,
                      },
                    )
                  }
                />
              </label>
              <label className="field-label">
                Option presentation
                <select
                  value={selectedDecisionContext.decision!.optionStyle ?? "visibleText"}
                  onChange={(inputEvent) =>
                    onUpdateDecision(
                      selectedDecisionContext.eventId,
                      selectedDecisionContext.decision!.id,
                      {
                        optionStyle: inputEvent.target.value as
                          | "visibleText"
                          | "followUpText"
                          | "iconOnly",
                      },
                    )
                  }
                >
                  <option value="visibleText">Visible option text</option>
                  <option value="followUpText">Follow-up text</option>
                  <option value="iconOnly">Icon only</option>
                </select>
              </label>
              </> : null}
              {objectInspectorTab === "choices" ? <>
              <p className="inspector-connection-hint">
                All options share this decision's input. Each option has its own output port (A, B, C…).
              </p>
              <div className="stack-list" aria-label="Decision option conditions">
                {selectedDecisionContext.decision.outcomes.map((outcome, index) => (
                  <div className="mini-card" key={outcome.id}>
                    <strong>Option {String.fromCharCode(65 + index)}</strong>
                    <label className="field-label compact-field">
                      Visible text
                      <input
                        value={outcome.name}
                        onChange={(inputEvent) =>
                          onUpdateOutcome(
                            selectedDecisionContext.eventId,
                            selectedDecisionContext.decision!.id,
                            outcome.id,
                            { name: inputEvent.target.value },
                          )
                        }
                      />
                    </label>
                    <label className="field-label compact-field">
                      Follow-up text
                      <input
                        value={outcome.description ?? ""}
                        onChange={(inputEvent) =>
                          onUpdateOutcome(
                            selectedDecisionContext.eventId,
                            selectedDecisionContext.decision!.id,
                            outcome.id,
                            { description: inputEvent.target.value || undefined },
                          )
                        }
                      />
                    </label>
                    <label className="field-label compact-field">
                      Icon
                      <input
                        value={outcome.icon ?? ""}
                        placeholder="◇"
                        onChange={(inputEvent) =>
                          onUpdateOutcome(
                            selectedDecisionContext.eventId,
                            selectedDecisionContext.decision!.id,
                            outcome.id,
                            { icon: inputEvent.target.value || undefined },
                          )
                        }
                      />
                    </label>
                    <span>
                      {outcome.availability
                        ? outcome.unavailableBehavior === "hidden"
                          ? "Conditional · hidden when unavailable"
                          : "Conditional · shown locked"
                        : "Always available"}
                    </span>
                    {outcome.lockText?.content ? <small>Lock text: {outcome.lockText.content}</small> : null}
                  </div>
                ))}
              </div>
              <div className="inspector-actions">
                <button
                  type="button"
                  onClick={() =>
                    onCreateOutcome(
                      selectedDecisionContext.eventId,
                      selectedDecisionContext.decision!.id,
                    )
                  }
                >
                  Add Outcome
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() =>
                    onDeleteDecision(
                      selectedDecisionContext.eventId,
                      selectedDecisionContext.decision!.id,
                    )
                  }
                >
                  Delete
                </button>
              </div>
              </> : null}
            </section>
            {objectInspectorTab === "logic" ? <>
            <BasicConditionEditor
              value={selectedDecisionContext.decision!.availability}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(availability) =>
                onUpdateDecision(
                  selectedDecisionContext.eventId,
                  selectedDecisionContext.decision!.id,
                  { availability },
                )
              }
            />
            <LocalRuleSetEditor value={selectedDecisionContext.decision!.ruleSets} canonRefs={canonRefIds} dataObjects={dataObjects} onChange={(ruleSets) =>
                onUpdateDecision(
                  selectedDecisionContext.eventId,
                  selectedDecisionContext.decision!.id,
                  { ruleSets },
                )
              }
            />
            </> : null}
          </>
        ) : null}

        {selectedDialogueBeatContext ? (
          <>
            <InspectorContentTabs value={objectInspectorTab} onChange={setObjectInspectorTab} tabs={[{ id: "overview", label: "Content" }, { id: "logic", label: "Logic" }]} />
            {objectInspectorTab === "overview" ? (
            <section className="inspector-section">
              <h2>{selectedDialogueBeatContext.beat.kind === "speech" ? "Speech Beat" : "Direction Beat"}</h2>
              {selectedDialogueBeatContext.beat.kind === "speech" ? (
                <label className="field-label">
                  Speaker
                  <select
                    value={selectedDialogueBeatContext.block.speakerRef ?? ""}
                    onChange={(event) =>
                      onUpdateScriptBlock(
                        selectedDialogueBeatContext.beat.blockRef.scriptId,
                        selectedDialogueBeatContext.beat.blockRef.blockId,
                        { speakerRef: event.target.value || undefined },
                      )
                    }
                  >
                    <option value="">Narrador</option>
                    {speakerCanonRefs.map((canonRef) => (
                      <option key={canonRef.id} value={canonRef.id}>
                        {canonRef.label ?? canonRef.id}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="field-label">
                {selectedDialogueBeatContext.beat.kind === "speech" ? "Dialogue text" : "Stage direction"}
                <textarea
                  rows={7}
                  value={selectedDialogueBeatContext.block.content}
                  onChange={(event) =>
                    onUpdateScriptBlock(
                      selectedDialogueBeatContext.beat.blockRef.scriptId,
                      selectedDialogueBeatContext.beat.blockRef.blockId,
                      { content: event.target.value },
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="danger"
                onClick={() => selectedDialogueBeatContext.dialogueId
                  ? onDeleteDialogueBeat(
                    selectedDialogueBeatContext.eventId,
                    selectedDialogueBeatContext.dialogueId,
                    selectedDialogueBeatContext.beat.id,
                  )
                  : onDeleteEventDialogueBeat(
                    selectedDialogueBeatContext.eventId,
                    selectedDialogueBeatContext.beat.id,
                  )}
              >
                Delete beat
              </button>
            </section>
            ) : null}
            {objectInspectorTab === "logic" ? <>
            <BasicConditionEditor
              label="Display condition"
              value={selectedDialogueBeatContext.beat.displayCondition}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(displayCondition) => selectedDialogueBeatContext.dialogueId
                ? onUpdateDialogueBeat(selectedDialogueBeatContext.eventId, selectedDialogueBeatContext.dialogueId, selectedDialogueBeatContext.beat.id, { displayCondition })
                : onUpdateEventDialogueBeat(selectedDialogueBeatContext.eventId, selectedDialogueBeatContext.beat.id, { displayCondition })}
            />
            <LocalRuleSetEditor value={selectedDialogueBeatContext.beat.ruleSets} canonRefs={canonRefIds} dataObjects={dataObjects} onChange={(ruleSets) =>
                selectedDialogueBeatContext.dialogueId
                  ? onUpdateDialogueBeat(selectedDialogueBeatContext.eventId, selectedDialogueBeatContext.dialogueId, selectedDialogueBeatContext.beat.id, { ruleSets })
                  : onUpdateEventDialogueBeat(selectedDialogueBeatContext.eventId, selectedDialogueBeatContext.beat.id, { ruleSets })
              } />
            </> : null}
          </>
        ) : null}

        {selectedDialogueContext?.dialogue ? (
          <>
            <InspectorContentTabs value={objectInspectorTab} onChange={setObjectInspectorTab} tabs={[{ id: "overview", label: "Overview" }, { id: "logic", label: "Logic" }]} />
            {objectInspectorTab === "overview" ? (
            <section className="inspector-section">
              <h2>Dialogue</h2>
              <label className="field-label">
                Title
                <input
                  value={selectedDialogueContext.dialogue.title}
                  onChange={(inputEvent) =>
                    onUpdateDialogue(
                      selectedDialogueContext.eventId,
                      selectedDialogueContext.dialogue!.id,
                      {
                        title: inputEvent.target.value,
                      },
                    )
                  }
                />
              </label>
              <label className="field-label">
                Speaker Ref
                <select
                  value={selectedDialogueFirstBlock?.speakerRef ?? ""}
                  onChange={(inputEvent) =>
                    selectedDialogueFirstBeat &&
                    onUpdateScriptBlock(
                      selectedDialogueFirstBeat.blockRef.scriptId,
                      selectedDialogueFirstBeat.blockRef.blockId,
                      { speakerRef: inputEvent.target.value || undefined },
                    )
                  }
                >
                  <option value="">Narrador</option>
                  {speakerCanonRefs.map((canonRef) => (
                    <option key={canonRef.id} value={canonRef.id}>{canonRef.label ?? canonRef.id}</option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Text
                <textarea
                  value={selectedDialogueFirstBlock?.content ?? ""}
                  rows={5}
                  onChange={(inputEvent) =>
                    selectedDialogueFirstBeat &&
                    onUpdateScriptBlock(
                      selectedDialogueFirstBeat.blockRef.scriptId,
                      selectedDialogueFirstBeat.blockRef.blockId,
                      { content: inputEvent.target.value },
                    )
                  }
                />
              </label>
              <p className="inspector-connection-hint">
                Quick edit for the first beat. Double-click this node to open the full dialogue canvas.
              </p>
              <CanonRefsPicker
                value={selectedDialogueContext.dialogue.canonRefs}
                canonRefs={project.canonRefs}
                onChange={(canonRefs) =>
                  onUpdateDialogue(
                    selectedDialogueContext.eventId,
                    selectedDialogueContext.dialogue!.id,
                    {
                      canonRefs,
                    },
                  )
                }
              />
              <button
                type="button"
                className="danger"
                onClick={() =>
                  onDeleteDialogue(
                    selectedDialogueContext.eventId,
                    selectedDialogueContext.dialogue!.id,
                  )
                }
              >
                Delete
              </button>
            </section>
            ) : null}
            {objectInspectorTab === "logic" ? <>
            <BasicConditionEditor
              value={selectedDialogueContext.dialogue.availability}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(availability) =>
                onUpdateDialogue(
                  selectedDialogueContext.eventId,
                  selectedDialogueContext.dialogue!.id,
                  { availability },
                )
              }
            />
            <LocalRuleSetEditor value={selectedDialogueContext.dialogue.ruleSets} canonRefs={canonRefIds} dataObjects={dataObjects} onChange={(ruleSets) =>
                onUpdateDialogue(
                  selectedDialogueContext.eventId,
                  selectedDialogueContext.dialogue!.id,
                  { ruleSets },
                )
              } />
            </> : null}
          </>
        ) : null}

        {selectedMissingRefContext ? (
          <section className="inspector-section">
            <h2>Missing Reference</h2>
            <p className="empty-line">
              "{selectedMissingRefContext.missingEventId}" is referenced by "
              {selectedMissingRefContext.ownerId}" but no event with that id
              exists. Recreate the event with this id to restore it, or remove
              the dangling reference.
            </p>
            <div className="inspector-actions">
              <button
                type="button"
                className="danger"
                onClick={() =>
                  onDeleteSelection({
                    type: "node",
                    id: selectedMissingRefContext.missingEventId,
                  })
                }
              >
                Remove reference
              </button>
            </div>
          </section>
        ) : null}

        {selectedOutcomeContext?.outcome ? (
          <>
            <InspectorContentTabs value={objectInspectorTab} onChange={setObjectInspectorTab} tabs={[{ id: "overview", label: "Overview" }, { id: "logic", label: "Logic" }, { id: "effects", label: "Effects" }]} />
            {objectInspectorTab === "overview" ? (
            <section className="inspector-section">
              <h2>Outcome</h2>
              <label className="field-label">
                Name
                <input
                  value={selectedOutcomeContext.outcome!.name}
                  onChange={(inputEvent) =>
                    onUpdateOutcome(
                      selectedOutcomeContext.eventId,
                      selectedOutcomeContext.decisionId,
                      selectedOutcomeContext.outcome!.id,
                      {
                        name: inputEvent.target.value,
                      },
                    )
                  }
                />
              </label>
              <label className="field-label">
                Description
                <textarea
                  value={selectedOutcomeContext.outcome!.description ?? ""}
                  rows={3}
                  onChange={(inputEvent) =>
                    onUpdateOutcome(
                      selectedOutcomeContext.eventId,
                      selectedOutcomeContext.decisionId,
                      selectedOutcomeContext.outcome!.id,
                      {
                        description: inputEvent.target.value || undefined,
                      },
                    )
                  }
                />
              </label>
              <label className="field-label">
                Icon
                <input
                  value={selectedOutcomeContext.outcome!.icon ?? ""}
                  placeholder="◇"
                  onChange={(inputEvent) =>
                    onUpdateOutcome(
                      selectedOutcomeContext.eventId,
                      selectedOutcomeContext.decisionId,
                      selectedOutcomeContext.outcome!.id,
                      { icon: inputEvent.target.value || undefined },
                    )
                  }
                />
              </label>
              <label className="field-label">
                When unavailable
                <select
                  value={selectedOutcomeContext.outcome.unavailableBehavior ?? "locked"}
                  onChange={(inputEvent) =>
                    onUpdateOutcome(
                      selectedOutcomeContext.eventId,
                      selectedOutcomeContext.decisionId,
                      selectedOutcomeContext.outcome!.id,
                      { unavailableBehavior: inputEvent.target.value as "locked" | "hidden" },
                    )
                  }
                >
                  <option value="locked">Show locked</option>
                  <option value="hidden">Hide choice</option>
                </select>
              </label>
              {selectedOutcomeContext.outcome.unavailableBehavior !== "hidden" ? (
                <label className="field-label">
                  Public lock text
                  <input
                    value={selectedOutcomeContext.outcome!.lockText?.content ?? ""}
                    placeholder="Optional — avoids revealing the real requirement"
                    onChange={(inputEvent) =>
                      onUpdateOutcome(
                        selectedOutcomeContext.eventId,
                        selectedOutcomeContext.decisionId,
                        selectedOutcomeContext.outcome!.id,
                        {
                          lockText: inputEvent.target.value
                            ? { format: "plain", content: inputEvent.target.value }
                            : undefined,
                        },
                      )
                    }
                  />
                </label>
              ) : null}
              <p className="inspector-connection-hint">
                Preview: {selectedOutcomeContext.outcome.availability
                  ? selectedOutcomeContext.outcome.unavailableBehavior === "hidden"
                    ? "conditionally hidden"
                    : "conditionally locked"
                  : "available"}
              </p>
              <CanonRefsPicker
                title="Required Canon Refs"
                value={selectedOutcomeContext.outcome!.requiredCanonRefs}
                canonRefs={project.canonRefs}
                onChange={(requiredCanonRefs) =>
                  onUpdateOutcome(
                    selectedOutcomeContext.eventId,
                    selectedOutcomeContext.decisionId,
                    selectedOutcomeContext.outcome!.id,
                    {
                      requiredCanonRefs,
                    },
                  )
                }
              />
              <button
                type="button"
                className="danger"
                onClick={() =>
                  onDeleteOutcome(
                    selectedOutcomeContext.eventId,
                    selectedOutcomeContext.decisionId,
                    selectedOutcomeContext.outcome!.id,
                  )
                }
              >
                Delete
              </button>
            </section>
            ) : null}
            {objectInspectorTab === "logic" ? <>
            <BasicConditionEditor
              label="Choice conditions"
              value={selectedOutcomeContext.outcome!.availability}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(availability) =>
                onUpdateOutcome(
                  selectedOutcomeContext.eventId,
                  selectedOutcomeContext.decisionId,
                  selectedOutcomeContext.outcome!.id,
                  { availability, conditions: availability },
                )
              }
            />
            <LocalRuleSetEditor value={selectedOutcomeContext.outcome!.ruleSets} canonRefs={canonRefIds} dataObjects={dataObjects} onChange={(ruleSets) =>
              onUpdateOutcome(
                selectedOutcomeContext.eventId,
                selectedOutcomeContext.decisionId,
                selectedOutcomeContext.outcome!.id,
                { ruleSets },
              )
            } />
            </> : null}
            {objectInspectorTab === "effects" ? <>
            <ConsequenceEditor
              value={selectedOutcomeContext.outcome!.consequences}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(consequences) =>
                onUpdateOutcome(
                  selectedOutcomeContext.eventId,
                  selectedOutcomeContext.decisionId,
                  selectedOutcomeContext.outcome!.id,
                  {
                    consequences,
                  },
                )
              }
            />
            </> : null}
          </>
        ) : null}

        {selectedNode &&
        !sequence &&
        !branch &&
        !event &&
        !selectedDecisionContext?.decision &&
        !selectedDialogueContext?.dialogue &&
        !selectedOutcomeContext?.outcome &&
        !selectedRouteGateContext &&
        !selectedMissingRefContext ? (
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
            <pre>
              {JSON.stringify(selectedNode.data.details ?? {}, null, 2)}
            </pre>
          </section>
        ) : null}

        {selectedRouteGateContext ? (
          <section className="inspector-section route-gate-inspector">
            <h2>Route rules</h2>
            <p className="inspector-connection-hint">
              Configure the ordered routes leaving this source. Draw a new edge from the Gate to add another route.
            </p>
            <div className="stack-list">
              {selectedRouteGateContext.routes.map((route, index) => (
                <div className="mini-card route-gate-route" key={route.id}>
                  <div className="logic-grid">
                    <label className="field-label">
                      Route
                      <select
                        value={route.mode ?? "conditional"}
                        onChange={(event) =>
                          onUpdateTransition(route.id, {
                            mode: event.target.value as "conditional" | "fallback",
                          })
                        }
                      >
                        <option value="conditional">If / else-if</option>
                        <option value="fallback">Else fallback</option>
                      </select>
                    </label>
                    <label className="field-label">
                      Order
                      <input
                        type="number"
                        min={1}
                        value={(route.order ?? index) + 1}
                        disabled={route.mode === "fallback"}
                        onChange={(event) =>
                          onUpdateTransition(route.id, {
                            order: Math.max(0, Number(event.target.value) - 1),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="field-label">
                    Destination
                    <select
                      value={route.to}
                      onChange={(event) =>
                        onUpdateTransition(route.id, { to: event.target.value })
                      }
                    >
                      {nodes
                        .filter(
                          (node) =>
                            node.id !== selectedRouteGateContext.sourceId &&
                            node.data.kind !== "routeGate",
                        )
                        .map((node) => (
                          <option key={node.id} value={node.id}>
                            {node.data.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  {route.mode !== "fallback" ? (
                    <BasicConditionEditor
                      value={route.conditions}
                      canonRefs={canonRefIds}
                      dataObjects={dataObjects}
                      onChange={(conditions) =>
                        onUpdateTransition(route.id, { conditions })
                      }
                    />
                  ) : (
                    <p className="inspector-connection-hint">
                      This route runs when none of the previous conditions match.
                    </p>
                  )}
                  <ConsequenceEditor
                    value={route.consequences}
                    canonRefs={canonRefIds}
                    dataObjects={dataObjects}
                    onChange={(consequences) =>
                      onUpdateTransition(route.id, { consequences })
                    }
                  />
                  <div className="inspector-actions">
                    <button
                      type="button"
                      className="danger"
                      onClick={() => onDeleteTransition(route.id)}
                    >
                      Delete route
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {selectedEdge ? (
          <>
            {selectedTransition ? (
              <nav className="inspector-subtabs" aria-label="Transition inspector sections">
                <button type="button" className={transitionInspectorTab === "route" ? "active" : ""} onClick={() => setTransitionInspectorTab("route")}>Route</button>
                <button type="button" className={transitionInspectorTab === "if" ? "active" : ""} onClick={() => setTransitionInspectorTab("if")}>If</button>
                <button type="button" className={transitionInspectorTab === "effects" ? "active" : ""} onClick={() => setTransitionInspectorTab("effects")}>Effects</button>
              </nav>
            ) : null}
            {!selectedTransition || transitionInspectorTab === "route" ? (
            <section className="inspector-section">
              <h2>
                {selectedTransition && isParentCanvas
                  ? "Connection"
                  : selectedEdge.data?.label ?? selectedEdge.label ?? "Edge"}
              </h2>
              <label className="field-label">
                Label
                <input
                  value={String(
                    selectedEdge.data?.customLabel ??
                      (selectedTransition ? selectedTransition.label : selectedEdge.data?.label ?? selectedEdge.label) ??
                      "",
                  )}
                  onChange={(event) =>
                    onUpdateEdgeLabel(selectedEdge.id, event.target.value)
                  }
                />
              </label>
              <dl>
                <div>
                  <dt>Kind</dt>
                  <dd>{selectedEdge.data?.kind ?? "edge"}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{selectedTransitionOwner?.name ?? selectedEdge.source}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>{selectedTransitionTarget?.name ?? selectedEdge.target}</dd>
                </div>
                {selectedTransition && isParentCanvas ? (
                  <div>
                    <dt>Output</dt>
                    <dd>{selectedTransitionOutput ?? "Event output"}</dd>
                  </div>
                ) : null}
              </dl>
              {selectedTransition ? (
                <>
                  <div className="logic-grid">
                    <label className="field-label">
                      Resolution
                      <select
                        value={selectedTransition.mode ?? "conditional"}
                        onChange={(event) =>
                          onUpdateTransition(selectedTransition.id, {
                            mode: event.target.value as "conditional" | "fallback",
                          })
                        }
                      >
                        <option value="conditional">If / else-if</option>
                        <option value="fallback">Else fallback</option>
                      </select>
                    </label>
                    <label className="field-label">
                      Evaluation order
                      <input
                        type="number"
                        min={1}
                        value={(selectedTransition.order ?? 0) + 1}
                        disabled={selectedTransition.mode === "fallback"}
                        onChange={(event) =>
                          onUpdateTransition(selectedTransition.id, {
                            order: Math.max(0, Number(event.target.value) - 1),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="field-label">
                    Target Event
                    <select
                      value={selectedTransition.to}
                      onChange={(event) =>
                        onUpdateTransition(selectedTransition.id, {
                          to: event.target.value,
                        })
                      }
                    >
                      {project.events.map((eventNode) => (
                        <option key={eventNode.id} value={eventNode.id}>
                          {eventNode.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
              {selectedTransition ? (
                <div className="inspector-actions">
                  <button
                    type="button"
                    className="danger"
                    onClick={() => onDeleteTransition(selectedTransition.id)}
                  >
                    Delete Connection
                  </button>
                </div>
              ) : null}
            </section>
            ) : null}
            {selectedTransition && transitionInspectorTab === "if" ? (
              <>
                {selectedTransition.mode !== "fallback" ? (
                  <TransitionConditionEditor
                    value={selectedTransition.conditions}
                    canonRefs={canonRefIds}
                    dataObjects={dataObjects}
                    onChange={(conditions) =>
                      onUpdateTransition(selectedTransition.id, { conditions })
                    }
                  />
                ) : (
                  <section className="inspector-section">
                    <h2>Fallback</h2>
                    <p className="inspector-connection-hint">
                      This route is evaluated last when no conditional transition matches.
                    </p>
                  </section>
                )}
              </>
            ) : null}
            {selectedTransition && transitionInspectorTab === "effects" ? (
              <ConsequenceEditor
                value={selectedTransition.consequences}
                canonRefs={canonRefIds}
                dataObjects={dataObjects}
                onChange={(consequences) =>
                  onUpdateTransition(selectedTransition.id, { consequences })
                }
              />
            ) : null}
            {!selectedTransition ? (
              <LogicSection
                availability={selectedEdge.data?.conditions}
                consequences={selectedEdge.data?.consequences}
              />
            ) : null}
          </>
        ) : null}

        {selectedCanon ? (
          <section className="inspector-section">
            <h2>{selectedCanon.label ?? selectedCanon.kind ?? "Canon"}</h2>
            <div className="inspector-tag-list" aria-label="Canon classification">
              <span>{selectedCanon.kind ?? "canon"}</span>
              {selectedCanon.parentId ? <span>Child of {project.canonRefs.find((ref) => ref.id === selectedCanon.parentId)?.label ?? selectedCanon.parentId}</span> : null}
              {(selectedCanon.tags ?? []).map((tag) => <span key={tag}>{tag}</span>)}
            </div>
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
                  <dd className="warning-text">
                    {selectedCanon.identityWarning ??
                      "Missing WorldNotion id/frontmatter."}
                  </dd>
                </div>
              ) : null}
            </dl>
            {selectedCanon.properties &&
            Object.keys(selectedCanon.properties).length ? (
              <section className="inspector-section">
                <h2>WorldNotion Properties</h2>
                <div className="readonly-preview-label">
                  Read-only metadata imported from WorldNotion.
                </div>
                <pre>{JSON.stringify(selectedCanon.properties, null, 2)}</pre>
              </section>
            ) : null}
            {selectedCanon.frontmatter &&
            Object.keys(selectedCanon.frontmatter).length ? (
              <section className="inspector-section">
                <h2>WorldNotion Frontmatter</h2>
                <div className="readonly-preview-label">
                  Full YAML frontmatter snapshot. Everend PathBranching does not
                  write it back.
                </div>
                <pre>{JSON.stringify(selectedCanon.frontmatter, null, 2)}</pre>
              </section>
            ) : null}
            <div className="inspector-actions">
              <button
                type="button"
                onClick={() => onCreateCanonSuggestion(selectedCanon.id)}
              >
                Suggest Edit
              </button>
              <button
                type="button"
                onClick={() => onCreateCanonWorkingCopy(selectedCanon)}
              >
                Edit working copy
              </button>
            </div>
            {(project.canonEditSuggestions ?? []).filter(
              (suggestion) => suggestion.canonRefId === selectedCanon.id,
            ).length ? (
              <div className="stack-list">
                {(project.canonEditSuggestions ?? [])
                  .filter(
                    (suggestion) => suggestion.canonRefId === selectedCanon.id,
                  )
                  .map((suggestion) => (
                    <button
                      className={`list-item ${selection?.type === "canonSuggestion" && selection.id === suggestion.id ? "active" : ""}`}
                      type="button"
                      key={suggestion.id}
                      onClick={() => onSelectSuggestion(suggestion.id)}
                    >
                      <strong>{suggestion.title}</strong>
                      <span>{suggestion.status}</span>
                    </button>
                  ))}
              </div>
            ) : null}
            <div className="readonly-preview-label">
              Read-only canon preview
            </div>
            {selectedCanon.preview ? (
              <pre>{selectedCanon.preview}</pre>
            ) : (
              <span className="empty-line">No preview available.</span>
            )}
            <CanonWorkingCopyEditor
              copy={project.canonWorkingCopies?.find(
                (copy) => copy.canonRefId === selectedCanon.id,
              )}
              sourceChanged={Boolean(
                selectedCanon.canonSourceModifiedMs &&
                project.canonWorkingCopies?.find(
                  (copy) => copy.canonRefId === selectedCanon.id,
                )?.sourceModifiedMs !== selectedCanon.canonSourceModifiedMs,
              )}
              onCreate={() => onCreateCanonWorkingCopy(selectedCanon)}
              onSave={(content) =>
                onSaveCanonWorkingCopy(selectedCanon.id, content)
              }
              onExportProposal={() => onExportCanonChangeSet(selectedCanon.id)}
              onApply={() => onApplyCanonWorkingCopy(selectedCanon.id)}
            />
          </section>
        ) : null}

        {selectedExplorerEntity ? (
          <section className="inspector-section">
            <h2>Local Entity</h2>
            <label className="field-label">
              Name
              <input
                value={selectedExplorerEntity.name}
                onChange={(event) =>
                  onUpdateLocalExplorerEntity(selectedExplorerEntity.id, {
                    name: event.target.value,
                  })
                }
              />
            </label>
            <label className="field-label">
              Type
              <input
                value={selectedExplorerEntity.type}
                onChange={(event) =>
                  onUpdateLocalExplorerEntity(selectedExplorerEntity.id, {
                    type: event.target.value,
                  })
                }
              />
            </label>
            <label className="field-label">
              Status
              <input
                value={selectedExplorerEntity.status}
                onChange={(event) =>
                  onUpdateLocalExplorerEntity(selectedExplorerEntity.id, {
                    status: event.target.value,
                  })
                }
              />
            </label>
            <label className="field-label">
              Tags
              <input
                value={(selectedExplorerEntity.tags ?? []).join(", ")}
                onChange={(event) =>
                  onUpdateLocalExplorerEntity(selectedExplorerEntity.id, {
                    tags: event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
            {(project.localExplorerProperties ?? [])
              .filter(
                (property) =>
                  !property.appliesToTypes?.length ||
                  property.appliesToTypes.includes(selectedExplorerEntity.type),
              )
              .map((property) => {
                const value = selectedExplorerEntity.properties?.[property.id];
                const setProperty = (nextValue: unknown) =>
                  onUpdateLocalExplorerEntity(selectedExplorerEntity.id, {
                    properties: {
                      ...(selectedExplorerEntity.properties ?? {}),
                      [property.id]: nextValue,
                    },
                  });
                return (
                  <label className="field-label" key={property.id}>
                    {property.label}
                    {property.valueType === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={value === true}
                        onChange={(event) => setProperty(event.target.checked)}
                      />
                    ) : (
                      <input
                        value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
                        onChange={(event) => setProperty(event.target.value)}
                        placeholder={property.description}
                      />
                    )}
                  </label>
                );
              })}
            <label className="field-label">
              Body
              <textarea
                rows={8}
                value={selectedExplorerEntity.body ?? ""}
                onChange={(event) =>
                  onUpdateLocalExplorerEntity(selectedExplorerEntity.id, {
                    body: event.target.value,
                  })
                }
              />
            </label>
            <dl>
              <div>
                <dt>ID</dt>
                <dd>{selectedExplorerEntity.id}</dd>
              </div>
              <div>
                <dt>Publication</dt>
                <dd>{selectedExplorerEntity.publishedPath ?? "local only"}</dd>
              </div>
            </dl>
            <div className="inspector-actions">
              <button
                type="button"
                onClick={() =>
                  onPublishLocalExplorerEntity(selectedExplorerEntity.id)
                }
              >
                {selectedExplorerEntity.publishedPath
                  ? "Export again"
                  : "Publish to WorldNotion"}
              </button>
            </div>
          </section>
        ) : null}

        {selectedExplorerType ? (
          <section className="inspector-section">
            <h2>{selectedExplorerSchemaSource === "canon" ? "Canon type" : "Local type"}</h2>
            {selectedExplorerSchemaSource === "local" ? (
              <>
                <label className="field-label">
                  Name
                  <input
                    value={selectedExplorerType.label}
                    onChange={(event) =>
                      onUpdateLocalExplorerType(selectedExplorerType.id, {
                        label: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="field-label">
                  Icon hint
                  <input
                    value={selectedExplorerType.icon ?? ""}
                    onChange={(event) =>
                      onUpdateLocalExplorerType(selectedExplorerType.id, {
                        icon: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="field-label">
                  Color
                  <input
                    value={selectedExplorerType.color ?? ""}
                    onChange={(event) =>
                      onUpdateLocalExplorerType(selectedExplorerType.id, {
                        color: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="field-label">
                  Suggested folder
                  <input
                    value={selectedExplorerType.suggestedFolder ?? ""}
                    onChange={(event) =>
                      onUpdateLocalExplorerType(selectedExplorerType.id, {
                        suggestedFolder: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="field-label">
                  Description
                  <textarea
                    rows={4}
                    value={selectedExplorerType.description ?? ""}
                    onChange={(event) =>
                      onUpdateLocalExplorerType(selectedExplorerType.id, {
                        description: event.target.value,
                      })
                    }
                  />
                </label>
              </>
            ) : (
              <dl>
                <div><dt>ID</dt><dd>{selectedExplorerType.id}</dd></div>
                <div><dt>Folder</dt><dd>{selectedExplorerType.suggestedFolder ?? "not specified"}</dd></div>
                <div><dt>Description</dt><dd>{selectedExplorerType.description ?? "not specified"}</dd></div>
              </dl>
            )}
          </section>
        ) : null}

        {selectedExplorerProperty ? (
          <section className="inspector-section">
            <h2>{selectedExplorerSchemaSource === "canon" ? "Canon property" : "Local property"}</h2>
            <p className="inspector-connection-hint">
              {selectedExplorerSchemaSource === "canon"
                ? "WorldNotion remains the source of truth. These capabilities are stored as Pathbranching overrides."
                : "Configure how this local property participates in Pathbranching."}
            </p>
            <InspectorContentTabs value={objectInspectorTab} onChange={setObjectInspectorTab} tabs={[{ id: "overview", label: "Overview" }, { id: "characters", label: "Characters" }]} />
            {objectInspectorTab === "overview" ? <>
            {selectedExplorerSchemaSource === "local" ? (
              <>
                <label className="field-label">
                  Name
                  <input
                    value={selectedExplorerProperty.label}
                    onChange={(event) =>
                      onUpdateLocalExplorerProperty(selectedExplorerProperty.id, {
                        label: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="field-label">
                  Value type
                  <select
                    value={selectedExplorerProperty.valueType}
                    onChange={(event) =>
                      onUpdateLocalExplorerProperty(selectedExplorerProperty.id, {
                        valueType: event.target.value,
                      })
                    }
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                    <option value="select">Select</option>
                    <option value="multiselect">Multi-select</option>
                    <option value="entity-ref">Entity reference</option>
                  </select>
                </label>
                <label className="field-label">
                  Applies to types
                  <input
                    value={(selectedExplorerProperty.appliesToTypes ?? []).join(", ")}
                    onChange={(event) =>
                      onUpdateLocalExplorerProperty(selectedExplorerProperty.id, {
                        appliesToTypes: event.target.value
                          .split(",")
                          .map((value) => value.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
                <label className="field-label">
                  Description
                  <textarea
                    rows={4}
                    value={selectedExplorerProperty.description ?? ""}
                    onChange={(event) =>
                      onUpdateLocalExplorerProperty(selectedExplorerProperty.id, {
                        description: event.target.value,
                      })
                    }
                  />
                </label>
              </>
            ) : (
              <dl>
                <div><dt>ID</dt><dd>{selectedExplorerProperty.id}</dd></div>
                <div><dt>Value type</dt><dd>{selectedExplorerProperty.valueType}</dd></div>
                <div><dt>Applies to</dt><dd>{selectedExplorerProperty.appliesToTypes?.join(", ") || "all types"}</dd></div>
              </dl>
            )}
            {(() => {
              const source = selectedExplorerSchemaSource ?? "local";
              const override = (project.logicPropertyOverrides ?? []).find(
                (item) => item.propertyId === selectedExplorerProperty.id && item.source === source,
              );
              return <>
                <label><input type="checkbox" checked={override?.conditionReadable ?? true} onChange={(event) => onUpdateLogicPropertyOverride(selectedExplorerProperty.id, source, { conditionReadable: event.target.checked })} /> Conditions</label>
                <label><input type="checkbox" checked={override?.actionWritable ?? source === "local"} onChange={(event) => onUpdateLogicPropertyOverride(selectedExplorerProperty.id, source, { actionWritable: event.target.checked })} /> Actions</label>
                <label><input type="checkbox" checked={override?.grantable ?? false} onChange={(event) => onUpdateLogicPropertyOverride(selectedExplorerProperty.id, source, { grantable: event.target.checked })} /> Grantable</label>
                <label className="field-label">Can relate to<input value={(override?.relationTargetTypes ?? []).join(", ")} placeholder="character, worldbuilding" onChange={(event) => onUpdateLogicPropertyOverride(selectedExplorerProperty.id, source, { relationTargetTypes: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
              </>;
            })()}
            </> : <section className="character-categories-editor">
              <p className="inspector-connection-hint">Choose which canon categories can be selected as a character in Speech Beats. Defaults are locked; this inspector adds the optional ones.</p>
              {canonCategories.length ? <div className="character-category-options">
                {canonCategories.map((category) => {
                  const isDefault = defaultCharacterCategories.includes(category);
                  const isAdditional = additionalCharacterCategories.includes(category);
                  return <label key={category}><input type="checkbox" checked={isDefault || isAdditional} disabled={isDefault} onChange={(event) => onUpdateCharacterCategories(event.target.checked ? [...additionalCharacterCategories, category] : additionalCharacterCategories.filter((item) => item !== category))} /> {category}</label>;
                })}
              </div> : <p className="empty-line">No canon categories are available yet.</p>}
            </section>}
          </section>
        ) : null}

        {selectedSuggestion ? (
          <section className="inspector-section">
            <h2>WorldNotion Edit Suggestion</h2>
            <div className="readonly-preview-label">
              Safe suggestion only. Everend PathBranching stores this proposal;
              WorldNotion remains the source of truth and must apply final
              edits.
            </div>
            <label className="field-label">
              Title
              <input
                value={selectedSuggestion.title}
                onChange={(event) =>
                  onUpdateCanonSuggestion(selectedSuggestion.id, {
                    title: event.target.value,
                  })
                }
              />
            </label>
            <label className="field-label">
              Status
              <select
                value={selectedSuggestion.status}
                onChange={(event) =>
                  onUpdateCanonSuggestion(selectedSuggestion.id, {
                    status: event.target.value,
                  })
                }
              >
                <option value="draft">draft</option>
                <option value="proposed">proposed</option>
                <option value="sent-to-worldnotion">sent to WorldNotion</option>
                <option value="applied-in-worldnotion">
                  applied in WorldNotion
                </option>
                <option value="dismissed">dismissed</option>
              </select>
            </label>
            <label className="field-label">
              Summary
              <textarea
                rows={3}
                value={selectedSuggestion.summary ?? ""}
                onChange={(event) =>
                  onUpdateCanonSuggestion(selectedSuggestion.id, {
                    summary: event.target.value,
                  })
                }
              />
            </label>
            <label className="field-label">
              Proposed Content
              <textarea
                rows={10}
                value={selectedSuggestion.proposedContent}
                onChange={(event) =>
                  onUpdateCanonSuggestion(selectedSuggestion.id, {
                    proposedContent: event.target.value,
                  })
                }
              />
            </label>
            <dl>
              <div>
                <dt>Canon Ref</dt>
                <dd>{selectedSuggestion.canonRefId}</dd>
              </div>
              <div>
                <dt>Target Path</dt>
                <dd>{selectedSuggestion.targetPath ?? "unknown"}</dd>
              </div>
              <div>
                <dt>Safety</dt>
                <dd>{selectedSuggestion.safety}</dd>
              </div>
            </dl>
            <div className="inspector-actions">
              <button
                type="button"
                className="danger"
                onClick={() => onDeleteCanonSuggestion(selectedSuggestion.id)}
              >
                Delete Suggestion
              </button>
            </div>
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
                  onChange={(event) =>
                    onUpdateDataObject(selectedDataObject.id, {
                      name: event.target.value,
                    })
                  }
                />
              </label>
              <label className="field-label">
                Class
                <select
                  value={selectedDataObject.classId}
                  onChange={(event) =>
                    onUpdateDataObject(selectedDataObject.id, {
                      classId: event.target.value,
                    })
                  }
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
                onChange={(canonRefs) =>
                  onUpdateDataObject(selectedDataObject.id, { canonRefs })
                }
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
                  <dd>
                    {selectedDataObject.canonRefs?.join(", ") || "manual"}
                  </dd>
                </div>
              </dl>
              <div className="inspector-actions">
                <button
                  type="button"
                  className="danger"
                  onClick={() => onDeleteDataObject(selectedDataObject.id)}
                >
                  Delete Data Object
                </button>
              </div>
            </section>
            <section className="inspector-section">
              <h2>Fields</h2>
              <div className="stack-list">
                {(selectedDataClass?.fields.length
                  ? selectedDataClass.fields
                  : Object.keys(selectedDataObject.fields).map(
                      (field): DataFieldDefinition => ({
                        name: field,
                        type: "text",
                      }),
                    )
                ).map((fieldDefinition) => {
                  const value =
                    selectedDataObject.fields[fieldDefinition.name] ??
                    fieldDefinition.defaultValue ??
                    "";
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
                                  [fieldDefinition.name]:
                                    event.target.value === "true",
                                },
                              })
                            }
                          >
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : fieldDefinition.type === "select" &&
                          fieldDefinition.options?.length ? (
                          <select
                            value={String(value)}
                            onChange={(event) =>
                              onUpdateDataObject(selectedDataObject.id, {
                                fields: {
                                  ...selectedDataObject.fields,
                                  [fieldDefinition.name]: event.target.value,
                                },
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
                            value={
                              Array.isArray(value)
                                ? value.join(", ")
                                : fieldSummary(value)
                            }
                            onChange={(event) =>
                              onUpdateDataObject(selectedDataObject.id, {
                                fields: {
                                  ...selectedDataObject.fields,
                                  [fieldDefinition.name]: coerceDataFieldValue(
                                    fieldDefinition.type,
                                    event.target.value,
                                  ),
                                },
                              })
                            }
                          />
                        )}
                      </label>
                      {fieldDefinition.description ? (
                        <span>{fieldDefinition.description}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
            <BasicConditionEditor
              value={selectedDataObject.availability}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(availability) =>
                onUpdateDataObject(selectedDataObject.id, { availability })
              }
            />
            <LocalRuleSetEditor value={selectedDataObject.ruleSets} canonRefs={canonRefIds} dataObjects={dataObjects} onChange={(ruleSets) => onUpdateDataObject(selectedDataObject.id, { ruleSets })} />
            <LogicSection
              availability={selectedDataObject.availability}
              ruleSets={selectedDataObject.ruleSets}
            />
          </>
        ) : null}
      </div>
    </aside>
  );
}

type CanvasContextMenu = {
  kind: "create" | "connect-create" | "selection" | "route-gate";
  x: number;
  y: number;
  flowX: number;
  flowY: number;
  sourceNodeId?: string;
  routeSourceId?: string;
  nodeIds?: string[];
};

function EventTypeMenuButton({
  label,
  options,
  onSelect,
}: {
  label: string;
  options: EventCategoryDefinition[];
  onSelect: (categoryId: string) => void;
}) {
  return (
    <div className="canvas-menu-submenu">
      <button type="button" className="canvas-menu-submenu-trigger">
        <span>{label}</span>
        <ChevronRight size={13} />
      </button>
      <div className="canvas-menu-submenu-flyout">
        {options.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
          >
            {category.label}
            {category.terminal ? " (final)" : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

const FIXABLE_FINDING_CODES = new Set<ValidationFinding["code"]>([
  "missing_event",
  "invalid_boundary_binding",
  "invalid_transition_order",
  "orphan_script_block",
]);

function CanvasFindingsButton({
  findings,
  onLocateFinding,
  onFixFinding,
}: {
  findings: ValidationFinding[];
  onLocateFinding: (finding: ValidationFinding) => void;
  onFixFinding: (finding: ValidationFinding) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const errorCount = findings.filter(
    (finding) => finding.severity === "error",
  ).length;
  const warningCount = findings.filter(
    (finding) => finding.severity === "warning",
  ).length;
  const status =
    errorCount > 0 ? "error" : warningCount > 0 ? "warning" : "clean";
  const label =
    status === "error"
      ? `${errorCount} error${errorCount === 1 ? "" : "s"}`
      : status === "warning"
        ? `${warningCount} warning${warningCount === 1 ? "" : "s"}`
        : "No validation issues";

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="canvas-findings-anchor" ref={wrapperRef}>
      <button
        type="button"
        className={`react-flow__controls-button canvas-findings-button ${status} ${open ? "active" : ""}`}
        onClick={() => setOpen((current) => !current)}
        title={label}
        aria-label={`Validation status: ${label}`}
        aria-expanded={open}
      >
        {status === "error" ? (
          <OctagonAlert size={14} />
        ) : status === "warning" ? (
          <AlertTriangle size={14} />
        ) : (
          <CheckCircle2 size={14} />
        )}
      </button>
      {open ? (
        <div className="canvas-findings-popup">
          <div className="canvas-findings-popup-header">
            <strong>{label}</strong>
            <span>
              {findings.length} total finding{findings.length === 1 ? "" : "s"}
            </span>
          </div>
          {findings.length ? (
            <div className="stack-list">
              {findings.map((finding) => (
                <div
                  className={`finding ${finding.severity}`}
                  key={`${finding.code}:${finding.id ?? ""}:${finding.ref ?? ""}`}
                >
                  <strong>{finding.code}</strong>
                  <span>{finding.message}</span>
                  {FIXABLE_FINDING_CODES.has(finding.code) && (finding.id || finding.ref) ? (
                    <div className="finding-actions">
                      <button
                        type="button"
                        onClick={() => onLocateFinding(finding)}
                      >
                        Locate
                      </button>
                      {finding.code === "invalid_transition_order" ? (
                        <button type="button" onClick={() => onFixFinding(finding)}>
                          Fix order
                        </button>
                      ) : finding.code === "orphan_script_block" ? (
                        <button type="button" className="danger" onClick={() => onFixFinding(finding)}>
                          Delete orphan
                        </button>
                      ) : (
                        <button type="button" className="danger" onClick={() => onFixFinding(finding)}>
                          Remove reference
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <span className="clean">Story graph is clean.</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

function BreadcrumbCrumb({
  crumb,
  index,
  isLast,
  infoBadges,
  onNavigate,
}: {
  crumb: { scope: CanvasScope; label: string };
  index: number;
  isLast: boolean;
  infoBadges: string[];
  onNavigate: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{
    left: number;
    top: number;
  }>();

  return (
    <span className="breadcrumb-crumb">
      <button
        ref={buttonRef}
        type="button"
        className={isLast ? "active" : ""}
        onClick={onNavigate}
        onMouseEnter={() => {
          const rect = buttonRef.current?.getBoundingClientRect();
          if (rect) setHoverPosition({ left: rect.left, top: rect.bottom + 6 });
        }}
        onMouseLeave={() => setHoverPosition(undefined)}
      >
        {index === 0 ? <Home size={14} /> : <GitBranch size={14} />}
        <span>{crumb.label}</span>
      </button>
      {hoverPosition && infoBadges.length ? (
        <div
          className="breadcrumb-hover-popup"
          role="tooltip"
          style={{ left: hoverPosition.left, top: hoverPosition.top }}
        >
          <strong>{crumb.label}</strong>
          {infoBadges.map((badge) => (
            <span key={badge}>{badge}</span>
          ))}
        </div>
      ) : null}
    </span>
  );
}

function StoryCanvas({
  project,
  propertiesConfig,
  files,
  nodes,
  edges,
  selection,
  findings,
  message,
  activeScope,
  exportOpen,
  exportPreviewMode,
  dataOpen,
  markdownTabs,
  activeMarkdownTabId,
  eventDraft,
  eventInspector,
  eventInspectorTabGroups,
  inspectorTabs,
  expandedInspectorTabId,
  inspectorMaximized,
  canvasBackground,
  onCanvasBackgroundChange,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeDragStop,
  onSelect,
  onNavigateScope,
  onExportPreviewModeChange,
  onToggleData,
  onCreateEvent,
  onCreateNestedEvent,
  onCreateConnectedEvent,
  onUpdateSequence,
  onUpdateBranch,
  onCreateEventInBranch,
  onUpdateEvent,
  onCreateDecision,
  onCreateDialogue,
  onCreateDialogueBeat,
  onCreateEventDialogueBeat,
  onUpdateDecision,
  onUpdateDialogue,
  onUpdateDialogueBeat,
  onUpdateEventDialogueBeat,
  onUpdateScriptBlock,
  onDeleteDialogueBeat,
  onDeleteEventDialogueBeat,
  onDeleteDecision,
  onDeleteDialogue,
  onCreateOutcome,
  onUpdateOutcome,
  onDeleteOutcome,
  onUpdateTransition,
  onDeleteTransition,
  onRemoveMissingEventReference,
  onRemoveBoundaryBinding,
  onNormalizeTransitionOrder,
  onInsertRouteGate,
  onDeleteScriptBlock,
  onFocusScriptBlock,
  onCreateCanonSuggestion,
  onUpdateCanonSuggestion,
  onDeleteCanonSuggestion,
  onCreateDataObject,
  onCreateKnowledgeObject,
  onUpdateDataObject,
  onDeleteDataObject,
  onEditCanonRef,
  onCreateCanonWorkingCopy,
  onSaveCanonWorkingCopy,
  onExportCanonChangeSet,
  onApplyCanonWorkingCopy,
  onUpdateLocalExplorerEntity,
  onPublishLocalExplorerEntity,
  onUpdateLocalExplorerType,
  onUpdateLocalExplorerProperty,
  onUpdateLogicPropertyOverride,
  onUpdateCharacterCategories,
  onUpdateEdgeLabel,
  onDeleteSelection,
  onDeleteNodeSelections,
  onActivateMarkdownTab,
  onCloseMarkdownTab,
  onChangeMarkdownContent,
  onChangeMarkdownFormat,
  onSaveMarkdownTab,
  onOpenEventInspectorEvent,
  onCollapseEventInspectorEvent,
  onCloseEventInspectorEvent,
  onCloseAllEventInspectorEvents,
  onCloseEventInspectorEventsAbove,
  onCloseEventInspectorEventsBelow,
  onCloseOtherEventInspectorEvents,
  onPruneEventInspectorEvents,
  collapseInspectorTabOnCanvasClick,
  onSaveEventInspectorTabGroup,
  onLoadEventInspectorTabGroup,
  onDeleteEventInspectorTabGroup,
  onSaveEventDraft,
  onOpenInspectorTab,
  onCloseInspectorTab,
  onCloseAllInspectorTabs,
  onDisableInspectorDebug,
  onToggleInspectorMaximized,
  onOpenRule,
}: {
  project: BranchingProject;
  propertiesConfig?: Record<string, unknown>;
  files: PathBranchingFileItem[];
  nodes: StoryCanvasNode[];
  edges: StoryCanvasEdge[];
  selection?: Selection;
  findings: ValidationFinding[];
  message?: string;
  activeScope?: CanvasScope;
  exportOpen: boolean;
  exportPreviewMode: ExportPreviewMode;
  dataOpen: boolean;
  markdownTabs: MarkdownEditorTab[];
  activeMarkdownTabId?: string;
  eventDraft?: EventDraft;
  eventInspector: EventInspectorState;
  eventInspectorTabGroups: EventInspectorTabGroup[];
  inspectorTabs: InspectorTab[];
  expandedInspectorTabId?: string;
  inspectorMaximized: boolean;
  canvasBackground: CanvasBackgroundSettings;
  onCanvasBackgroundChange: (updates: Partial<CanvasBackgroundSettings>) => void;
  onNodesChange: (changes: NodeChange<StoryCanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<StoryCanvasEdge>[]) => void;
  onConnect: OnConnect;
  onNodeDragStop: (
    event: MouseEvent | TouchEvent | ReactMouseEvent,
    node: StoryCanvasNode,
  ) => void;
  onSelect: (selection?: Selection) => void;
  onNavigateScope: (scope: CanvasScope, selection?: Selection) => void;
  onExportPreviewModeChange: (mode: ExportPreviewMode) => void;
  onToggleData: () => void;
  onCreateEvent: (
    type?: EventType,
    position?: { x: number; y: number },
    branchId?: string,
  ) => void;
  onCreateNestedEvent: (
    parentEventId: string,
    type?: EventType,
    position?: { x: number; y: number },
  ) => void;
  onCreateConnectedEvent: (
    sourceNodeId: string,
    type: EventType,
    position: { x: number; y: number },
  ) => void;
  onUpdateSequence: (id: string, updates: Partial<Sequence>) => void;
  onUpdateBranch: (id: string, updates: Partial<Branch>) => void;
  onCreateEventInBranch: (branchId: string, type?: EventType) => void;
  onUpdateEvent: (id: string, updates: Partial<EventNode>) => void;
  onCreateDecision: (eventId: string) => void;
  onCreateDialogue: (eventId: string) => void;
  onCreateDialogueBeat: (eventId: string, dialogueId: string, kind: DialogueBeat["kind"]) => void;
  onCreateEventDialogueBeat: (eventId: string, kind: DialogueBeat["kind"]) => void;
  onUpdateDecision: (
    eventId: string,
    decisionId: string,
    updates: Partial<Decision>,
  ) => void;
  onUpdateDialogue: (
    eventId: string,
    dialogueId: string,
    updates: Partial<DialogueNode>,
  ) => void;
  onUpdateDialogueBeat: (eventId: string, dialogueId: string, beatId: string, updates: Partial<DialogueBeat>) => void;
  onUpdateEventDialogueBeat: (eventId: string, beatId: string, updates: Partial<DialogueBeat>) => void;
  onUpdateScriptBlock: (scriptId: string, blockId: string, updates: { content?: string; translations?: Record<string, string>; speakerRef?: string }) => void;
  onDeleteDialogueBeat: (eventId: string, dialogueId: string, beatId: string) => void;
  onDeleteEventDialogueBeat: (eventId: string, beatId: string) => void;
  onDeleteDecision: (eventId: string, decisionId: string) => void;
  onDeleteDialogue: (eventId: string, dialogueId: string) => void;
  onCreateOutcome: (eventId: string, decisionId: string) => void;
  onUpdateOutcome: (
    eventId: string,
    decisionId: string,
    outcomeId: string,
    updates: Partial<Outcome>,
  ) => void;
  onDeleteOutcome: (
    eventId: string,
    decisionId: string,
    outcomeId: string,
  ) => void;
  onUpdateTransition: (
    transitionId: string,
    updates: Partial<Transition>,
  ) => void;
  onDeleteTransition: (transitionId: string) => void;
  onRemoveMissingEventReference: (
    ownerId: string,
    missingEventId: string,
  ) => void;
  onRemoveBoundaryBinding: (bindingId: string) => void;
  onNormalizeTransitionOrder: (sourceId: string) => void;
  onInsertRouteGate: (sourceId: string) => void;
  onDeleteScriptBlock: (blockKey: string) => void;
  onFocusScriptBlock: (target: { scriptId: string; blockId: string }) => void;
  onCreateCanonSuggestion: (
    canonRefId: string,
    source?: { eventId?: string; dataObjectId?: string },
  ) => void;
  onUpdateCanonSuggestion: (
    id: string,
    updates: Partial<CanonEditSuggestion>,
  ) => void;
  onDeleteCanonSuggestion: (id: string) => void;
  onCreateDataObject: (classId: string) => void;
  onCreateKnowledgeObject: () => void;
  onUpdateDataObject: (id: string, updates: Partial<ProjectDataObject>) => void;
  onDeleteDataObject: (id: string) => void;
  onEditCanonRef: (ref: CanonRef) => void;
  onCreateCanonWorkingCopy: (ref: CanonRef) => void;
  onSaveCanonWorkingCopy: (canonRefId: string, content: string) => void;
  onExportCanonChangeSet: (canonRefId: string) => void;
  onApplyCanonWorkingCopy: (canonRefId: string) => void;
  onUpdateLocalExplorerEntity: (
    id: string,
    updates: Partial<LocalExplorerEntity>,
  ) => void;
  onPublishLocalExplorerEntity: (id: string) => void;
  onUpdateLocalExplorerType: (
    id: string,
    updates: Partial<LocalExplorerType>,
  ) => void;
  onUpdateLocalExplorerProperty: (
    id: string,
    updates: Partial<LocalExplorerProperty>,
  ) => void;
  onUpdateLogicPropertyOverride: (propertyId: string, source: "canon" | "local", changes: Partial<LogicPropertyOverride>) => void;
  onUpdateCharacterCategories: (categories: string[]) => void;
  onUpdateEdgeLabel: (edgeId: string, label: string) => void;
  onDeleteSelection: (selection: Selection) => void;
  onDeleteNodeSelections: (nodeIds: string[]) => void;
  onActivateMarkdownTab: (id: string) => void;
  onCloseMarkdownTab: (id: string) => void;
  onChangeMarkdownContent: (id: string, content: string) => void;
  onChangeMarkdownFormat: (id: string, format: MarkdownDraftFormat) => void;
  onSaveMarkdownTab: (id: string) => void;
  onOpenEventInspectorEvent: (eventId: string) => void;
  onCollapseEventInspectorEvent: (eventId: string) => void;
  onCloseEventInspectorEvent: (eventId: string) => void;
  onCloseAllEventInspectorEvents: () => void;
  onCloseEventInspectorEventsAbove: (eventId: string) => void;
  onCloseEventInspectorEventsBelow: (eventId: string) => void;
  onCloseOtherEventInspectorEvents: (eventId: string) => void;
  onPruneEventInspectorEvents: (eventIds: readonly string[]) => void;
  collapseInspectorTabOnCanvasClick: boolean;
  onSaveEventInspectorTabGroup: () => void;
  onLoadEventInspectorTabGroup: (groupId: string) => void;
  onDeleteEventInspectorTabGroup: (groupId: string) => void;
  onSaveEventDraft: () => void;
  onOpenInspectorTab: (id: string) => void;
  onCloseInspectorTab: (id: string) => void;
  onCloseAllInspectorTabs: () => void;
  onDisableInspectorDebug: () => void;
  onToggleInspectorMaximized: () => void;
  onOpenRule: (id: string) => void;
}) {
  const shellRef = useRef<HTMLElement | null>(null);
  const nodeClickTimeoutRef = useRef<number | undefined>(undefined);
  const draggedNodeRef = useRef(false);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance<StoryCanvasNode, StoryCanvasEdge>>();
  const [contextMenu, setContextMenu] = useState<CanvasContextMenu>();
  const [editingEdgeId, setEditingEdgeId] = useState<string>();
  const [draggingEvent, setDraggingEvent] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(true);

  useEffect(() => {
    return () => {
      if (nodeClickTimeoutRef.current !== undefined) {
        window.clearTimeout(nodeClickTimeoutRef.current);
      }
    };
  }, []);
  const inspectorNodeStates = useMemo(() => {
    const states = new Map<string, "open" | "expanded">();
    eventInspector.openEventIds.forEach((id) => states.set(id, "open"));
    if (eventInspector.expandedEventId) states.set(eventInspector.expandedEventId, "expanded");
    inspectorTabs.forEach((tab) => {
      if (tab.selection.type !== "node") return;
      states.set(tab.selection.id, expandedInspectorTabId === tab.id ? "expanded" : "open");
    });
    return states;
  }, [eventInspector.expandedEventId, eventInspector.openEventIds, expandedInspectorTabId, inspectorTabs]);
  const inspectorEdgeStates = useMemo(() => {
    const states = new Map<string, "open" | "expanded">();
    inspectorTabs.forEach((tab) => {
      if (tab.selection.type === "edge") {
        states.set(tab.selection.id, expandedInspectorTabId === tab.id ? "expanded" : "open");
      }
    });
    return states;
  }, [expandedInspectorTabId, inspectorTabs]);
  const commitEdgeLabel = useCallback(
    (edgeId: string, label: string) => {
      onUpdateEdgeLabel(edgeId, label);
      setEditingEdgeId(undefined);
    },
    [onUpdateEdgeLabel],
  );
  const graph = useMemo(
    () => ({
      nodes: nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          inspectorState: inspectorNodeStates.get(node.id),
          quickEditor:
            (node.data.kind === "speechBeat" || node.data.kind === "directionBeat") &&
            typeof (node.data.details?.beat as { blockRef?: { scriptId?: unknown; blockId?: unknown } } | undefined)?.blockRef?.scriptId === "string" &&
            typeof (node.data.details?.beat as { blockRef?: { scriptId?: unknown; blockId?: unknown } } | undefined)?.blockRef?.blockId === "string"
              ? (() => {
                  const block = node.data.details?.block as ScriptBlock | undefined;
                  const blockRef = (node.data.details!.beat as DialogueBeat).blockRef;
                  return {
                    content: block?.content ?? "",
                    translations: block?.translations,
                    speakerRef: block?.speakerRef,
                    speakerOptions: project.canonRefs
                      .filter((canonRef) => canonRefHasRole(project, canonRef, "speaker"))
                      .map((canonRef) => ({ id: canonRef.id, label: canonRef.label ?? canonRef.id })),
                    onUpdate: (updates: { content?: string; translations?: Record<string, string>; speakerRef?: string }) =>
                      onUpdateScriptBlock(blockRef.scriptId, blockRef.blockId, updates),
                  };
                })()
              : undefined,
        },
      })),
      edges: edges.map((edgeItem): StoryCanvasEdge => {
        const edgeData = edgeItem.data ?? { kind: "contains" as const, label: "" };
        const customLabel =
          typeof edgeData.customLabel === "string" ? edgeData.customLabel : undefined;
        const editable =
          edgeData.kind === "transition" || edgeData.kind === "entry";
        return {
          ...edgeItem,
          type: editable ? "editable" : edgeItem.type,
          data: {
            ...edgeData,
            connectionPadding: canvasBackground.connectionPadding,
            customLabel:
              edgeData.kind === "entry" ? customLabel ?? "" : customLabel,
            inspectorState: inspectorEdgeStates.get(edgeItem.id),
            editing: editingEdgeId === edgeItem.id,
            onCommitLabel: editable
              ? (label: string) => commitEdgeLabel(edgeItem.id, label)
              : undefined,
            onCancelLabel: editable ? () => setEditingEdgeId(undefined) : undefined,
          },
        };
      }),
    }),
    [canvasBackground.connectionPadding, commitEdgeLabel, editingEdgeId, edges, inspectorEdgeStates, inspectorNodeStates, nodes, onUpdateScriptBlock, project],
  );
  const activeEventScope =
    activeScope?.kind === "event"
      ? project.events.find((event) => event.id === activeScope.id)
      : activeScope?.kind === "dialogue"
        ? project.events.find((event) => event.id === activeScope.eventId)
        : undefined;
  const activeDialogueScope = activeScope?.kind === "dialogue" ? activeScope : undefined;

  const breadcrumbs = useMemo(
    () => canvasBreadcrumb(project, activeScope),
    [activeScope, project],
  );
  const locateFinding = useCallback(
    (findingItem: ValidationFinding) => {
      if (
        findingItem.code === "missing_event" &&
        findingItem.id &&
        findingItem.ref
      ) {
        const ownerId = findingItem.id;
        const missingId = findingItem.ref;
        if (project.sequences.some((candidate) => candidate.id === ownerId)) {
          onNavigateScope(
            { kind: "sequence", id: ownerId },
            { type: "node", id: missingId },
          );
          return;
        }
        if (project.events.some((candidate) => candidate.id === ownerId)) {
          onNavigateScope(
            { kind: "event", id: ownerId },
            { type: "node", id: missingId },
          );
        }
        return;
      }
      if (findingItem.code === "invalid_boundary_binding" && findingItem.id) {
        const ownerEventId = project.events.find((event) =>
          event.boundaryBindings?.some(
            (binding) => binding.id === findingItem.id,
          ),
        )?.id;
        if (ownerEventId) {
          onNavigateScope({ kind: "event", id: ownerEventId });
        }
        return;
      }
      if (findingItem.code === "invalid_transition_order" && findingItem.id) {
        const ownerEvent = project.events.find((event) =>
          event.transitions?.some((transition) => transition.from === findingItem.id),
        );
        if (ownerEvent) {
          onNavigateScope(
            { kind: "event", id: ownerEvent.id },
            { type: "node", id: findingItem.id },
          );
        }
        return;
      }
      if (findingItem.code === "orphan_script_block" && findingItem.ref) {
        const owner = project.scriptDocuments?.find((script) =>
          script.blocks.some((block) => `${script.id}:${block.id}` === findingItem.ref),
        );
        const block = owner?.blocks.find(
          (candidate) => `${owner.id}:${candidate.id}` === findingItem.ref,
        );
        if (owner && block) onFocusScriptBlock({ scriptId: owner.id, blockId: block.id });
      }
    },
    [onFocusScriptBlock, onNavigateScope, project.events, project.scriptDocuments, project.sequences],
  );
  const fixFinding = useCallback(
    (findingItem: ValidationFinding) => {
      if (
        findingItem.code === "missing_event" &&
        findingItem.id &&
        findingItem.ref
      ) {
        onRemoveMissingEventReference(findingItem.id, findingItem.ref);
        return;
      }
      if (findingItem.code === "invalid_boundary_binding" && findingItem.id) {
        onRemoveBoundaryBinding(findingItem.id);
        return;
      }
      if (findingItem.code === "invalid_transition_order" && findingItem.id) {
        onNormalizeTransitionOrder(findingItem.id);
        return;
      }
      if (findingItem.code === "orphan_script_block" && findingItem.ref) {
        onDeleteScriptBlock(findingItem.ref);
      }
    },
    [onDeleteScriptBlock, onNormalizeTransitionOrder, onRemoveBoundaryBinding, onRemoveMissingEventReference],
  );
  const snapGrid: [number, number] = [
    canvasBackground.gridSize,
    canvasBackground.gridSize,
  ];
  const backgroundColor = `color-mix(in srgb, var(--wn-border) ${Math.round(canvasBackground.opacity * 100)}%, transparent)`;
  const inspectorProject = useMemo(
    () =>
      eventDraft ? applyEventDraftToProject(project, eventDraft) : project,
    [eventDraft, project],
  );
  const inspectorEventId =
    eventInspector.expandedEventId ?? eventInspector.openEventIds[0];
  const inspectorSelection = inspectorEventId
    ? { type: "node" as const, id: inspectorEventId }
    : selection;

  useEffect(() => {
    if (!reactFlowInstance) {
      return;
    }
    window.requestAnimationFrame(() => {
      reactFlowInstance.fitView({
        padding: activeScope?.kind === "event" ? 0.3 : 0.24,
        duration: 180,
      });
    });
  }, [activeScope, graph.nodes.length, reactFlowInstance]);

  const openContextMenu = useCallback(
    (event: MouseEvent | ReactMouseEvent) => {
      event.preventDefault();
      if (!reactFlowInstance) {
        return;
      }
      const shellRect = shellRef.current?.getBoundingClientRect();
      const flowPosition = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setContextMenu({
        kind: "create",
        ...clampFloatingMenuPosition(
          event.clientX - (shellRect?.left ?? 0),
          event.clientY - (shellRect?.top ?? 0),
          {
            left: 0,
            top: 0,
            right: shellRect?.width ?? window.innerWidth,
            bottom: shellRect?.height ?? window.innerHeight,
          },
          410,
        ),
        flowX: flowPosition.x,
        flowY: flowPosition.y,
      });
    },
    [reactFlowInstance],
  );

  const openEdgeContextMenu = useCallback(
    (event: ReactMouseEvent, edgeItem: StoryCanvasEdge) => {
      event.preventDefault();
      event.stopPropagation();
      if (edgeItem.data?.kind !== "transition" || typeof edgeItem.data.routeSourceId !== "string") {
        return;
      }
      const shellRect = shellRef.current?.getBoundingClientRect();
      setContextMenu({
        kind: "route-gate",
        routeSourceId: edgeItem.data.routeSourceId,
        x: event.clientX - (shellRect?.left ?? 0),
        y: event.clientY - (shellRect?.top ?? 0),
        flowX: 0,
        flowY: 0,
      });
    },
    [],
  );

  const openSelectionContextMenu = useCallback(
    (event: ReactMouseEvent, node: StoryCanvasNode) => {
      event.preventDefault();
      event.stopPropagation();
      const selectedNodeIds = node.selected
        ? nodes.filter((candidate) => candidate.selected).map((candidate) => candidate.id)
        : [node.id];
      if (!node.selected) {
        onNodesChange([
          ...nodes
            .filter((candidate) => candidate.selected)
            .map((candidate) => ({ type: "select" as const, id: candidate.id, selected: false })),
          { type: "select", id: node.id, selected: true },
        ]);
      }
      const shellRect = shellRef.current?.getBoundingClientRect();
      setContextMenu({
        kind: "selection",
        ...clampFloatingMenuPosition(
          event.clientX - (shellRect?.left ?? 0),
          event.clientY - (shellRect?.top ?? 0),
          {
            left: 0,
            top: 0,
            right: shellRect?.width ?? window.innerWidth,
            bottom: shellRect?.height ?? window.innerHeight,
          },
          250,
        ),
        flowX: 0,
        flowY: 0,
        nodeIds: selectedNodeIds,
      });
    },
    [nodes, onNodesChange],
  );

  const openConnectionCreateMenu = useCallback<OnConnectEnd>(
    (event, connectionState) => {
      if (
        connectionState.toNode ||
        !connectionState.fromNode ||
        !reactFlowInstance
      ) {
        return;
      }

      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      if (!point) {
        return;
      }

      const shellRect = shellRef.current?.getBoundingClientRect();
      const flowPosition = reactFlowInstance.screenToFlowPosition({
        x: point.clientX,
        y: point.clientY,
      });
      setContextMenu({
        kind: "connect-create",
        sourceNodeId: connectionState.fromNode.id,
        ...clampFloatingMenuPosition(
          point.clientX - (shellRect?.left ?? 0),
          point.clientY - (shellRect?.top ?? 0),
          {
            left: 0,
            top: 0,
            right: shellRect?.width ?? window.innerWidth,
            bottom: shellRect?.height ?? window.innerHeight,
          },
          410,
        ),
        flowX: flowPosition.x,
        flowY: flowPosition.y,
      });
    },
    [reactFlowInstance],
  );

  const eventTypeOptions: EventCategoryDefinition[] =
    (project.eventCategories?.length ?? 0) > 0
      ? (project.eventCategories ?? [])
      : [
          { id: "normal", label: "Normal" },
          { id: "final", label: "Final", terminal: true },
        ];
  const minimapNodeColor = useCallback((node: StoryCanvasNode) => {
    if (typeof node.data.minimapColor === "string")
      return node.data.minimapColor;
    if (typeof node.data.accentColor === "string") return node.data.accentColor;
    if (node.data.kind === "start") return "var(--pb-start)";
    if (node.data.kind === "boundary") return "var(--pb-sequence)";
    if (node.data.kind === "decision") return "var(--pb-decision)";
    if (node.data.kind === "dialogue") return "var(--pb-ink)";
    if (node.data.kind === "outcome") return "var(--pb-outcome)";
    return "var(--wn-muted)";
  }, []);
  const minimapNodeStrokeColor = useCallback((node: StoryCanvasNode) => {
    if (typeof node.data.accentColor === "string") return node.data.accentColor;
    if (node.data.kind === "event") return "var(--pb-event)";
    return "var(--wn-border)";
  }, []);

  return (
    <main
      className={`canvas-shell ${activeScope?.kind === "event" ? "nested-scope" : ""} ${draggingEvent ? "dragging-event" : ""}`}
      ref={shellRef}
    >
      {message ? <div className="canvas-message">{message}</div> : null}

      <div className="canvas-modebar">
        <div className="canvas-breadcrumb" aria-label="Canvas path">
          {breadcrumbs.map((crumb, index) => {
            const last = index === breadcrumbs.length - 1;
            const crumbEvent =
              crumb.scope.kind === "event"
                ? project.events.find((event) => event.id === crumb.scope.id)
                : undefined;
            const crumbSequence =
              crumb.scope.kind === "sequence"
                ? project.sequences.find((seq) => seq.id === crumb.scope.id)
                : undefined;
            const infoBadges = crumbEvent
              ? [
                  `${crumbEvent.childEventIds?.length ?? 0} nested events`,
                  `${crumbEvent.decisions?.length ?? 0} decisions`,
                  `${crumbEvent.dialogues?.length ?? 0} dialogues`,
                ]
              : crumbSequence
                ? [
                    `${crumbSequence.eventIds.length} events`,
                    `${crumbSequence.branchIds?.length ?? 0} branches`,
                  ]
                : [];
            return (
              <BreadcrumbCrumb
                key={`${crumb.scope.kind}:${crumb.scope.id}`}
                crumb={crumb}
                index={index}
                isLast={last}
                infoBadges={infoBadges}
                onNavigate={() =>
                  onNavigateScope(crumb.scope, {
                    type: "node",
                    id: crumb.scope.id,
                  })
                }
              />
            );
          })}
        </div>
      </div>

      <ReactFlowProvider>
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          edgeTypes={editableCanvasEdgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          panOnDrag={[1]}
          onConnectEnd={openConnectionCreateMenu}
          onInit={setReactFlowInstance}
          onNodeDrag={(_, node) => {
            draggedNodeRef.current = true;
            setDraggingEvent(node.data.kind === "event");
          }}
          onNodeDragStop={(event, node) => {
            setDraggingEvent(false);
            onNodeDragStop(event, node);
            window.setTimeout(() => {
              draggedNodeRef.current = false;
            }, 0);
          }}
          onNodeClick={(event, node) => {
            setContextMenu(undefined);
            setEditingEdgeId(undefined);
            if (draggedNodeRef.current || event.shiftKey) return;
            if (nodeClickTimeoutRef.current !== undefined) {
              window.clearTimeout(nodeClickTimeoutRef.current);
            }
            nodeClickTimeoutRef.current = window.setTimeout(() => {
              onSelect({ type: "node", id: node.id });
              nodeClickTimeoutRef.current = undefined;
            }, 220);
          }}
          onNodeContextMenu={openSelectionContextMenu}
          onNodeDoubleClick={(_, node) => {
            if (nodeClickTimeoutRef.current !== undefined) {
              window.clearTimeout(nodeClickTimeoutRef.current);
              nodeClickTimeoutRef.current = undefined;
            }
            if (node.data.kind === "event") {
              onNavigateScope(
                { kind: "event", id: node.id },
                { type: "node", id: node.id },
              );
            } else if (
              node.data.kind === "dialogue" &&
              typeof node.data.details?.eventId === "string" &&
              typeof (node.data.details?.dialogue as { id?: string } | undefined)?.id === "string"
            ) {
              const dialogueId = (node.data.details!.dialogue as { id: string }).id;
              onNavigateScope(
                { kind: "dialogue", id: dialogueId, eventId: node.data.details.eventId as string },
                undefined,
              );
            }
          }}
          onEdgeClick={(_, edgeItem) => {
            setContextMenu(undefined);
            setEditingEdgeId(undefined);
            onSelect({ type: "edge", id: edgeItem.id });
          }}
          onEdgeDoubleClick={(_, edgeItem) => {
            setContextMenu(undefined);
            onSelect({ type: "edge", id: edgeItem.id });
            if (
              edgeItem.data?.kind === "transition" ||
              edgeItem.data?.kind === "entry"
            ) {
              setEditingEdgeId(edgeItem.id);
            }
          }}
          onEdgeContextMenu={openEdgeContextMenu}
          onPaneClick={() => {
            setContextMenu(undefined);
            setEditingEdgeId(undefined);
            if (
              collapseInspectorTabOnCanvasClick &&
              eventInspector.expandedEventId
            ) {
              onCollapseEventInspectorEvent(eventInspector.expandedEventId);
              onSelect(undefined);
            }
          }}
          onPaneContextMenu={openContextMenu}
          fitView
          fitViewOptions={{ padding: 0.24 }}
          defaultViewport={project.canvas?.viewport}
          proOptions={{ hideAttribution: true }}
          snapToGrid={canvasBackground.snapToGrid}
          snapGrid={snapGrid}
        >
          {minimapOpen ? (
            <MiniMap
              pannable
              zoomable
              nodeColor={minimapNodeColor}
              nodeStrokeColor={minimapNodeStrokeColor}
              nodeStrokeWidth={3}
              position="bottom-left"
            />
          ) : null}
          <Controls position="bottom-left">
            <button
              type="button"
              className={`react-flow__controls-button ${minimapOpen ? "active" : ""}`}
              onClick={() => setMinimapOpen((open) => !open)}
              title={minimapOpen ? "Hide minimap" : "Show minimap"}
              aria-label={minimapOpen ? "Hide minimap" : "Show minimap"}
            >
              {minimapOpen ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            <CanvasFindingsButton
              findings={findings}
              onLocateFinding={locateFinding}
              onFixFinding={fixFinding}
            />
          </Controls>
          {canvasBackground.showGrid ? (
            <Background
              id="grid"
              variant={BackgroundVariant.Lines}
              gap={canvasBackground.gridSize}
              size={1}
              color={backgroundColor}
            />
          ) : null}
          {canvasBackground.showDots ? (
            <Background
              id="dots"
              variant={BackgroundVariant.Dots}
              gap={canvasBackground.gridSize}
              size={1.2}
              color={backgroundColor}
            />
          ) : null}
        </ReactFlow>
      </ReactFlowProvider>
      <div className="canvas-edge-adjustments">
        <button type="button" className="canvas-edge-adjustments-trigger" aria-label="Adjust connection spacing" title="Adjust connection spacing">
          <SlidersHorizontal size={15} />
        </button>
        <div className="canvas-edge-adjustments-panel">
          <label>
            Connection spacing
            <input
              type="range"
              min="0"
              max="64"
              step="2"
              value={canvasBackground.connectionPadding}
              onChange={(event) => onCanvasBackgroundChange({ connectionPadding: Number(event.target.value) })}
            />
            <output>{canvasBackground.connectionPadding}px</output>
          </label>
          <button type="button" onClick={() => onCanvasBackgroundChange({ connectionPadding: 18 })}>Reset</button>
        </div>
      </div>

      {contextMenu ? (
        <div
          className="canvas-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.kind === "selection" ? (
            <>
              <span className="canvas-menu-label">
                {contextMenu.nodeIds?.length ?? 0} selected node{(contextMenu.nodeIds?.length ?? 0) === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={() => {
                  contextMenu.nodeIds?.forEach((id) =>
                    onSelect({ type: "node", id }),
                  );
                  setContextMenu(undefined);
                }}
              >
                Open inspectors
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  onDeleteNodeSelections(contextMenu.nodeIds ?? []);
                  setContextMenu(undefined);
                }}
              >
                Delete selected
              </button>
            </>
          ) : contextMenu.kind === "route-gate" ? (
            <>
              <span className="canvas-menu-label">Transition</span>
              <button
                type="button"
                onClick={() => {
                  if (contextMenu.routeSourceId) onInsertRouteGate(contextMenu.routeSourceId);
                  setContextMenu(undefined);
                }}
              >
                Insert Route Gate
              </button>
            </>
          ) : activeDialogueScope ? (
            <>
              <span className="canvas-menu-label">Create inside dialogue</span>
              <button
                type="button"
                onClick={() => {
                  onCreateDialogueBeat(activeDialogueScope.eventId, activeDialogueScope.id, "speech");
                  setContextMenu(undefined);
                }}
              >
                Speech Beat
              </button>
              <button
                type="button"
                onClick={() => {
                  onCreateDecision(activeDialogueScope.eventId);
                  setContextMenu(undefined);
                }}
              >
                Decision
              </button>
            </>
          ) : contextMenu.kind === "connect-create" ? (
            <>
              <span className="canvas-menu-label">Create connected event</span>
              <EventTypeMenuButton
                label="Events"
                options={eventTypeOptions}
                onSelect={(categoryId) => {
                  if (contextMenu.sourceNodeId) {
                    if (activeEventScope) {
                      onCreateNestedEvent(activeEventScope.id, categoryId, {
                        x: contextMenu.flowX,
                        y: contextMenu.flowY,
                      });
                    } else {
                      onCreateConnectedEvent(
                        contextMenu.sourceNodeId,
                        categoryId,
                        { x: contextMenu.flowX, y: contextMenu.flowY },
                      );
                    }
                  }
                  setContextMenu(undefined);
                }}
              />
            </>
          ) : (
            <>
              <span className="canvas-menu-label">
                {activeEventScope ? "Create inside event" : "Create event"}
              </span>
              <EventTypeMenuButton
                label="Events"
                options={eventTypeOptions}
                onSelect={(categoryId) => {
                  if (activeEventScope) {
                    onCreateNestedEvent(activeEventScope.id, categoryId, {
                      x: contextMenu.flowX,
                      y: contextMenu.flowY,
                    });
                  } else {
                    onCreateEvent(categoryId, {
                      x: contextMenu.flowX,
                      y: contextMenu.flowY,
                    });
                  }
                  setContextMenu(undefined);
                }}
              />
              {activeEventScope ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onCreateDecision(activeEventScope.id);
                      setContextMenu(undefined);
                    }}
                  >
                    Decision
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onCreateEventDialogueBeat(activeEventScope.id, "speech");
                      setContextMenu(undefined);
                    }}
                  >
                    Speech Beat
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onCreateDialogue(activeEventScope.id);
                      setContextMenu(undefined);
                    }}
                  >
                    Dialogue
                  </button>
                </>
              ) : (
                <>
                </>
              )}
            </>
          )}
        </div>
      ) : null}

      {dataOpen ? (
        <DataDrawer
          project={project}
          selectedId={
            selection?.type === "dataObject" ? selection.id : undefined
          }
          onSelect={(id) => onSelect({ type: "dataObject", id })}
          onCreateDataObject={onCreateDataObject}
          onCreateKnowledgeObject={onCreateKnowledgeObject}
          onClose={onToggleData}
        />
      ) : null}

      <EventAuthoringDock
        project={inspectorProject}
        nodes={nodes}
        selection={selection}
        eventDraft={eventDraft}
        eventInspector={eventInspector}
        tabGroups={eventInspectorTabGroups}
        onOpenEvent={onOpenEventInspectorEvent}
        onCollapseEvent={onCollapseEventInspectorEvent}
        onCloseEvent={onCloseEventInspectorEvent}
        onCloseAllEvents={onCloseAllEventInspectorEvents}
        onCloseEventsAbove={onCloseEventInspectorEventsAbove}
        onCloseEventsBelow={onCloseEventInspectorEventsBelow}
        onCloseOtherEvents={onCloseOtherEventInspectorEvents}
        onPruneEvents={onPruneEventInspectorEvents}
        onSaveGroup={onSaveEventInspectorTabGroup}
        onLoadGroup={onLoadEventInspectorTabGroup}
        onDeleteGroup={onDeleteEventInspectorTabGroup}
        onSelect={onSelect}
        onSaveEventDraft={onSaveEventDraft}
        inspectorTabs={inspectorTabs}
        expandedInspectorTabId={expandedInspectorTabId}
        inspectorMaximized={inspectorMaximized}
        onOpenInspectorTab={onOpenInspectorTab}
        onCloseInspectorTab={onCloseInspectorTab}
        onCloseAllInspectorTabs={onCloseAllInspectorTabs}
        onDisableInspectorDebug={onDisableInspectorDebug}
        onToggleInspectorMaximized={onToggleInspectorMaximized}
      >
        <Inspector
          project={inspectorProject}
          scope={activeScope}
          propertiesConfig={propertiesConfig}
          nodes={nodes}
          edges={edges}
          files={files}
          selection={inspectorSelection}
          findings={findings}
          exportOpen={exportOpen}
          exportPreviewMode={exportPreviewMode}
          embedded
          onExportPreviewModeChange={onExportPreviewModeChange}
          onClose={() => onSelect(undefined)}
          onUpdateSequence={onUpdateSequence}
          onUpdateBranch={onUpdateBranch}
          onCreateEventInBranch={onCreateEventInBranch}
          onUpdateEvent={onUpdateEvent}
          onCreateDecision={onCreateDecision}
          onUpdateDecision={onUpdateDecision}
          onUpdateDialogue={onUpdateDialogue}
          onUpdateDialogueBeat={onUpdateDialogueBeat}
          onUpdateEventDialogueBeat={onUpdateEventDialogueBeat}
          onUpdateScriptBlock={onUpdateScriptBlock}
          onDeleteDialogueBeat={onDeleteDialogueBeat}
          onDeleteEventDialogueBeat={onDeleteEventDialogueBeat}
          onDeleteDecision={onDeleteDecision}
          onDeleteDialogue={onDeleteDialogue}
          onCreateOutcome={onCreateOutcome}
          onUpdateOutcome={onUpdateOutcome}
          onDeleteOutcome={onDeleteOutcome}
          onUpdateTransition={onUpdateTransition}
          onDeleteTransition={onDeleteTransition}
          onCreateCanonSuggestion={onCreateCanonSuggestion}
          onUpdateCanonSuggestion={onUpdateCanonSuggestion}
          onDeleteCanonSuggestion={onDeleteCanonSuggestion}
          onUpdateDataObject={onUpdateDataObject}
          onDeleteDataObject={onDeleteDataObject}
          onSelectCanon={(id) => onSelect({ type: "canon", id })}
          onSelectSuggestion={(id) => onSelect({ type: "canonSuggestion", id })}
          onEditCanonRef={onEditCanonRef}
          onCreateCanonWorkingCopy={onCreateCanonWorkingCopy}
          onSaveCanonWorkingCopy={onSaveCanonWorkingCopy}
          onExportCanonChangeSet={onExportCanonChangeSet}
          onApplyCanonWorkingCopy={onApplyCanonWorkingCopy}
          onUpdateLocalExplorerEntity={onUpdateLocalExplorerEntity}
          onPublishLocalExplorerEntity={onPublishLocalExplorerEntity}
          onUpdateLocalExplorerType={onUpdateLocalExplorerType}
          onUpdateLocalExplorerProperty={onUpdateLocalExplorerProperty}
          onUpdateLogicPropertyOverride={onUpdateLogicPropertyOverride}
          onUpdateCharacterCategories={onUpdateCharacterCategories}
          onUpdateEdgeLabel={onUpdateEdgeLabel}
          onDeleteSelection={onDeleteSelection}
          onOpenRule={onOpenRule}
        />
      </EventAuthoringDock>
    </main>
  );
}

export function App({ suiteChrome }: { suiteChrome?: SuiteChrome } = {}) {
  const desktopRuntime = isTauriRuntime();
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const activeTheme = (suiteChrome?.suiteSettings?.style ?? settings.theme) as ThemeId;
  const [view, setView] = useState<AppView>(
    () => loadSettings().lastView ?? "home",
  );
  const settingsRef = useRef(settings);
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [workspace, setWorkspace] = useState<PathBranchingWorkspace>();
  const [project, setProject] = useState<BranchingProject>();
  const [fileState, setFileState] = useState<ProjectFileState>({
    dirty: false,
  });
  const [canvasDirty, setCanvasDirty] = useState(false);
  const [nodes, setNodes] = useState<StoryCanvasNode[]>([]);
  const [edges, setEdges] = useState<StoryCanvasEdge[]>([]);
  const [files, setFiles] = useState<PathBranchingFileItem[]>([]);
  const [selection, setSelection] = useState<Selection>();
  const [canonOpen, setCanonOpen] = useState(true);
  const [filesOpen, setFilesOpen] = useState(true);
  const [panelVisibility, setPanelVisibility] = useState<WorkspacePanelState>(
    DEFAULT_WORKSPACE_PANEL_VISIBILITY,
  );
  const [panelCollapsed, setPanelCollapsed] = useState<WorkspacePanelState>(
    DEFAULT_WORKSPACE_PANEL_COLLAPSED,
  );
  const [focusedScriptBlock, setFocusedScriptBlock] = useState<{
    scriptId: string;
    blockId: string;
  }>();
  const [selectedLogicRuleId, setSelectedLogicRuleId] = useState<string>();
  const [canonWidth, setCanonWidth] = useState(DEFAULT_EXPLORER_WIDTH);
  const [storiesWidth, setStoriesWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [panelResizing, setPanelResizing] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPreviewMode, setExportPreviewMode] =
    useState<ExportPreviewMode>("runtime");
  const [dataOpen, setDataOpen] = useState(false);
  const [eventInspector, setEventInspector] = useState<EventInspectorState>(
    DEFAULT_EVENT_INSPECTOR_STATE,
  );
  const [eventInspectorTabGroups, setEventInspectorTabGroups] = useState<
    EventInspectorTabGroup[]
  >([]);
  const [inspectorTabs, setInspectorTabs] = useState<InspectorTab[]>([]);
  const [expandedInspectorTabId, setExpandedInspectorTabId] = useState<string>();
  const [inspectorMaximized, setInspectorMaximized] = useState(false);
  const [markdownTabs, setMarkdownTabs] = useState<MarkdownEditorTab[]>([]);
  const [activeMarkdownTabId, setActiveMarkdownTabId] = useState<string>();
  const [eventDraft, setEventDraft] = useState<EventDraft>();
  const [storyOutlineTab, setStoryOutlineTab] =
    useState<StoryOutlineTab>("sequence");
  const [activeScope, setActiveScopeState] = useState<CanvasScope>();
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("branching");
  const [focusNodeId, setFocusNodeId] = useState<string>();
  const [undoStack, setUndoStack] = useState<BranchingProject[]>([]);
  const [redoStack, setRedoStack] = useState<BranchingProject[]>([]);
  const [actionHistory, setActionHistory] = useState<string[]>([]);
  const [discardDialog, setDiscardDialog] = useState<{
    resolve: (discard: boolean) => void;
  }>();
  const [eventDraftDialog, setEventDraftDialog] = useState<
    | { kind: "select"; nextSelection?: Selection }
    | { kind: "closeInspectorTab"; eventId: string }
    | { kind: "loadInspectorGroup"; groupId: string }
  >();
  const [nameDialog, setNameDialog] = useState<
    | {
        kind: "createStory";
        title: string;
        label: string;
        initialValue?: string;
      }
    | {
        kind: "renameStory";
        title: string;
        label: string;
        initialValue?: string;
      }
    | {
        kind: "createSequence";
        title: string;
        label: string;
        initialValue?: string;
      }
    | {
        kind: "renameSequence";
        title: string;
        label: string;
        initialValue?: string;
      }
    | {
        kind: "saveInspectorTabGroup";
        title: string;
        label: string;
        initialValue?: string;
      }
  >();
  const [confirmDialog, setConfirmDialog] = useState<
    | { kind: "deleteStory"; title: string; message: string }
    | { kind: "deleteSequence"; title: string; message: string }
  >();
  const [missingRecentProjects, setMissingRecentProjects] = useState<
    Set<string>
  >(new Set());
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [panelContextMenu, setPanelContextMenu] = useState<{
    x: number;
    y: number;
  }>();
  const panelContextMenuRef = useRef<HTMLDivElement | null>(null);
  const projectRef = useRef<BranchingProject | undefined>(undefined);
  const workspaceRef = useRef<PathBranchingWorkspace | undefined>(undefined);
  const fileStateRef = useRef<ProjectFileState>({ dirty: false });
  const selectionRef = useRef<Selection | undefined>(undefined);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persistProjectRef = useRef<
    ((options?: { manual?: boolean }) => Promise<void>) | undefined
  >(undefined);
  const projectRevisionRef = useRef(0);
  const savedRevisionRef = useRef(0);

  useEffect(() => {
    if (!settings.inspectorDebugEnabled || !selection || !project) {
      setInspectorTabs((current) =>
        current.filter((tab) => tab.mode !== "debug"),
      );
      return;
    }
    const debugTab: InspectorTab = {
      id: "debug:active",
      title: "Debug",
      selection,
      mode: "debug",
    };
    setInspectorTabs((current) => [
      ...current.filter((tab) => tab.mode !== "debug"),
      debugTab,
    ]);
    if (!eventInspector.expandedEventId && !expandedInspectorTabId) {
      setExpandedInspectorTabId(debugTab.id);
    }
  }, [
    eventInspector.expandedEventId,
    expandedInspectorTabId,
    project,
    selection,
    settings.inspectorDebugEnabled,
  ]);

  const applyProject = useCallback(
    (
      nextProject: BranchingProject,
      options: {
        dirty?: boolean;
        revision?: boolean;
        path?: string;
        universePath?: string;
        storyPath?: string;
        modifiedMs?: number;
      } = {},
    ) => {
      const normalizedProject = normalizeProject(nextProject);
      const normalizedScope = activeCanvasScope(normalizedProject);
      const model = buildStoryCanvasModel(normalizedProject, {
        nodeColors: settingsRef.current.nodeColors,
        scope: normalizedScope,
      });
      if (options.dirty || options.revision) {
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
      setActiveScopeState(normalizedScope);
      setNodes(model.nodes);
      setEdges(model.edges);
      setFiles(model.files);
      setFileState((current) => {
        const nextState = {
          path: options.path ?? current.path,
          universePath: options.universePath ?? current.universePath,
          storyPath: options.storyPath ?? current.storyPath,
          dirty: options.dirty ?? current.dirty,
          lastSavedAt:
            options.dirty === false ? Date.now() : current.lastSavedAt,
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
    },
    [],
  );

  const applyWorkspace = useCallback(
    (nextWorkspace: PathBranchingWorkspace, universePath: string) => {
      const savedSession = normalizeWorkspaceSession(
        settingsRef.current.workspaceSessions?.[universePath],
      );
      const activeProject = normalizeProject({
        ...nextWorkspace.activeProject,
        universeRootPath: universePath,
      });
      const restoredScope =
        savedSession.activeScope ??
        activeProject.canvas?.activeScope ??
        activeCanvasScope(activeProject);
      const activeProjectWithScope = normalizeProject({
        ...activeProject,
        canvas: {
          ...activeProject.canvas,
          activeScope: restoredScope,
          activeSequenceId:
            restoredScope?.kind === "sequence"
              ? restoredScope.id
              : activeProject.canvas?.activeSequenceId,
        },
      });
      const normalizedScope = activeCanvasScope(activeProjectWithScope);
      const model = buildStoryCanvasModel(activeProjectWithScope, {
        nodeColors: settingsRef.current.nodeColors,
        scope: normalizedScope,
      });
      workspaceRef.current = nextWorkspace;
      projectRef.current = activeProjectWithScope;
      projectRevisionRef.current = 0;
      savedRevisionRef.current = 0;
      setWorkspace(nextWorkspace);
      setProject(activeProjectWithScope);
      setActiveScopeState(normalizedScope);
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
      setActionHistory([]);
      setCanvasDirty(false);
      setEventDraft(undefined);
      setMarkdownTabs(savedSession.markdownTabs ?? []);
      setActiveMarkdownTabId(savedSession.activeMarkdownTabId);
      setCanonOpen(
        savedSession.canonOpen ?? activeProject.panels?.canonOpen ?? true,
      );
      setFilesOpen(
        savedSession.filesOpen ?? activeProject.panels?.filesOpen ?? true,
      );
      setPanelVisibility({
        ...DEFAULT_WORKSPACE_PANEL_VISIBILITY,
        ...savedSession.panelVisibility,
      });
      setPanelCollapsed({
        ...DEFAULT_WORKSPACE_PANEL_COLLAPSED,
        assets: savedSession.panelCollapsed?.assets ?? !(savedSession.canonOpen ?? activeProject.panels?.canonOpen ?? true),
        outline: !(savedSession.filesOpen ?? activeProject.panels?.filesOpen ?? true),
        ...savedSession.panelCollapsed,
      });
      setCanonWidth(clampExplorerWidth(savedSession.canonWidth));
      setStoriesWidth(clampPanelWidth(savedSession.storiesWidth));
      setExportOpen(savedSession.exportOpen ?? false);
      setDataOpen(savedSession.dataOpen ?? false);
      setEventInspector(restoreEventInspectorState(savedSession));
      setEventInspectorTabGroups(savedSession.eventInspectorTabGroups ?? []);
      setInspectorTabs(savedSession.inspectorTabs ?? []);
      setExpandedInspectorTabId(savedSession.inspectorExpandedTabId);
      setInspectorMaximized(savedSession.inspectorMaximized ?? false);
      setStoryOutlineTab(savedSession.storyOutlineTab ?? "sequence");
      const initialSelectionId =
        normalizedScope?.kind === "sequence"
          ? normalizedScope.id
          : normalizedScope?.kind === "event"
            ? normalizedScope.id
            : (activeProjectWithScope.canvas?.activeSequenceId ??
              activeProjectWithScope.entrySequenceId ??
              activeProjectWithScope.sequences[0]?.id ??
              model.nodes[0]?.id);
      setSelection(
        savedSession.selection ??
          (initialSelectionId
            ? { type: "node", id: initialSelectionId }
            : undefined),
      );
      setCanvasMode(savedSession.canvasMode ?? "branching");
      setFocusNodeId(savedSession.focusNodeId);
      setError(undefined);
      setMessage(workspaceLoadWarningMessage(nextWorkspace));
    },
    [],
  );

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    fileStateRef.current = fileState;
  }, [fileState]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  const restoreStructuralSnapshot = useCallback(
    (snapshot: {
      project?: BranchingProject;
      workspace?: PathBranchingWorkspace;
      fileState: ProjectFileState;
      selection?: Selection;
      undoStack: BranchingProject[];
      redoStack: BranchingProject[];
      revision: number;
      savedRevision: number;
    }) => {
      projectRevisionRef.current = snapshot.revision;
      savedRevisionRef.current = snapshot.savedRevision;
      workspaceRef.current = snapshot.workspace;
      fileStateRef.current = snapshot.fileState;
      projectRef.current = snapshot.project;
      setWorkspace(snapshot.workspace);
      setFileState(snapshot.fileState);
      setUndoStack(snapshot.undoStack);
      setRedoStack(snapshot.redoStack);
      setSelection(snapshot.selection);
      if (snapshot.project) {
        const snapshotScope = activeCanvasScope(snapshot.project);
        const model = buildStoryCanvasModel(snapshot.project, {
          nodeColors: settingsRef.current.nodeColors,
          scope: snapshotScope,
        });
        setProject(snapshot.project);
        setActiveScopeState(snapshotScope);
        setNodes(model.nodes);
        setEdges(model.edges);
        setFiles(model.files);
      } else {
        setProject(undefined);
        setActiveScopeState(undefined);
        setNodes([]);
        setEdges([]);
        setFiles([]);
      }
    },
    [],
  );

  const commitStructuralAction = useCallback(
    async (
      label: string,
      result: mutations.MutationResult | BranchingProject,
      nextSelection?: Selection,
    ) => {
      const currentProject = projectRef.current;
      const currentWorkspace = workspaceRef.current;
      const currentFileState = fileStateRef.current;
      const previousUndoStack = undoStack;
      const previousRedoStack = redoStack;
      const mutationResult = "project" in result ? result : { project: result };

      if (!currentProject) {
        return;
      }

      const changed = mutationResult.project !== currentProject;
      if (!changed) {
        if (mutationResult.selection) {
          setSelection(mutationResult.selection as Selection);
        }
        if (mutationResult.message) {
          setMessage(mutationResult.message);
        }
        return;
      }

      const snapshot = {
        project: currentProject,
        workspace: currentWorkspace,
        fileState: currentFileState,
        selection: selectionRef.current,
        undoStack: previousUndoStack,
        redoStack: previousRedoStack,
        revision: projectRevisionRef.current,
        savedRevision: savedRevisionRef.current,
      };

      setUndoStack((current) => [...current.slice(-9), currentProject]);
      setRedoStack([]);
      setActionHistory((current) => [mutationResult.message ?? label, ...current].slice(0, 10));
      applyProject(mutationResult.project, { dirty: false, revision: true });
      if (mutationResult.selection) {
        setSelection(mutationResult.selection as Selection);
      } else if (nextSelection) {
        setSelection(nextSelection);
      }
      setMessage(mutationResult.message ?? `${label}...`);

      try {
        await persistProjectRef.current?.();
        setMessage(mutationResult.message ?? `${label} saved.`);
      } catch (commitError) {
        restoreStructuralSnapshot(snapshot);
        setError(
          commitError instanceof Error
            ? commitError.message
            : String(commitError),
        );
      }
    },
    [applyProject, redoStack, restoreStructuralSnapshot, undoStack],
  );

  const runMutation = useCallback(
    (result: mutations.MutationResult, label = "Saved structural change") => {
      void commitStructuralAction(label, result);
    },
    [commitStructuralAction],
  );

  const commitCanvasAction = useCallback(
    (
      label: string,
      result: mutations.MutationResult | BranchingProject,
      nextSelection?: Selection,
    ) => {
      setCanvasDirty(false);
      void commitStructuralAction(label, result, nextSelection);
    },
    [commitStructuralAction],
  );

  const updateProject = useCallback(
    (nextProject: BranchingProject, nextSelection?: Selection) => {
      commitCanvasAction("Canvas updated", nextProject, nextSelection);
    },
    [commitCanvasAction],
  );

  const runCanvasMutation = useCallback(
    (result: mutations.MutationResult, label = "Canvas updated") => {
      commitCanvasAction(label, result);
    },
    [commitCanvasAction],
  );

  const createCanonWorkingCopy = useCallback(
    async (ref: CanonRef) => {
      const currentProject = projectRef.current;
      const universePath = fileStateRef.current.universePath;
      if (!currentProject || !universePath) {
        setMessage("Open a universe before creating a working copy.");
        return;
      }
      if (
        currentProject.canonWorkingCopies?.some(
          (copy) => copy.canonRefId === ref.id,
        )
      ) {
        setMessage("This Canon entity already has a manual working copy.");
        return;
      }
      const source = workspaceRef.current?.canonIndex.entities.find(
        (entity) => entity.id === ref.id,
      );
      const legacyFile = ref.workingCopyPath
        ? workspaceRef.current?.files.find(
            (file) => file.relativePath === ref.workingCopyPath,
          )
        : undefined;
      const now = new Date().toISOString();
      const content = source?.content ?? canonMarkdownDraft(ref);
      const workingCopy: CanonWorkingCopy = {
        canonRefId: ref.id,
        sourcePath: ref.canonSourcePath ?? source?.path ?? ref.id,
        sourceModifiedMs: ref.canonSourceModifiedMs ?? source?.modifiedMs,
        sourceContent: content,
        draftContent: legacyFile?.content ?? content,
        path: workingCopyPathForCanonRef(ref.id),
        createdAt: now,
        updatedAt: now,
        legacy: Boolean(legacyFile) || !source,
      };
      try {
        if (!legacyFile) {
          const result = await saveWorkingCopy(universePath, ref.id, content);
          if (!result.ok)
            throw new Error(
              result.message ?? "Could not create the working copy.",
            );
        }
        await commitStructuralAction("Created Canon working copy", {
          project: {
            ...currentProject,
            canonRefs: currentProject.canonRefs.map((item) =>
              item.id === ref.id
                ? { ...item, workingCopyPath: workingCopy.path }
                : item,
            ),
            canonWorkingCopies: [
              ...(currentProject.canonWorkingCopies ?? []),
              workingCopy,
            ],
          },
        });
        setMessage(`Created a manual snapshot for ${ref.label ?? ref.id}.`);
      } catch (copyError) {
        setError(
          copyError instanceof Error ? copyError.message : String(copyError),
        );
      }
    },
    [commitStructuralAction],
  );

  const saveCanonWorkingCopy = useCallback(
    async (canonRefId: string, content: string) => {
      const currentProject = projectRef.current;
      const universePath = fileStateRef.current.universePath;
      const copy = currentProject?.canonWorkingCopies?.find(
        (candidate) => candidate.canonRefId === canonRefId,
      );
      if (!currentProject || !universePath || !copy) return;
      try {
        const result = await saveWorkingCopy(universePath, canonRefId, content);
        if (!result.ok)
          throw new Error(result.message ?? "Could not save the working copy.");
        const now = new Date().toISOString();
        await commitStructuralAction("Saved Canon working copy", {
          project: {
            ...currentProject,
            canonWorkingCopies: (currentProject.canonWorkingCopies ?? []).map(
              (candidate) =>
                candidate.canonRefId === canonRefId
                  ? { ...candidate, draftContent: content, updatedAt: now }
                  : candidate,
            ),
          },
        });
        setMessage("Saved working copy.");
      } catch (saveError) {
        setError(
          saveError instanceof Error ? saveError.message : String(saveError),
        );
      }
    },
    [commitStructuralAction],
  );

  const exportCanonChangeSet = useCallback(
    async (canonRefId: string) => {
      const currentProject = projectRef.current;
      const universePath = fileStateRef.current.universePath;
      const copy = currentProject?.canonWorkingCopies?.find(
        (candidate) => candidate.canonRefId === canonRefId,
      );
      if (!currentProject || !universePath || !copy) return;
      const changeSet = createCanonChangeSet(copy);
      try {
        const result = await saveUniverseTextFile(
          universePath,
          changeSetPath(changeSet.id),
          `${JSON.stringify(changeSet, null, 2)}\n`,
        );
        if (!result.ok)
          throw new Error(
            result.message ?? "Could not export the change proposal.",
          );
        await commitStructuralAction("Exported Canon change set", {
          project: {
            ...currentProject,
            canonChangeSets: [
              ...(currentProject.canonChangeSets ?? []),
              changeSet,
            ],
          },
        });
        setMessage("Exported a reviewable Canon change proposal.");
      } catch (exportError) {
        setError(
          exportError instanceof Error
            ? exportError.message
            : String(exportError),
        );
      }
    },
    [commitStructuralAction],
  );

  const applyCanonWorkingCopy = useCallback(
    async (canonRefId: string) => {
      const currentProject = projectRef.current;
      const universePath = fileStateRef.current.universePath;
      const copy = currentProject?.canonWorkingCopies?.find(
        (candidate) => candidate.canonRefId === canonRefId,
      );
      if (!currentProject || !universePath || !copy) return;
      if (
        !window.confirm(
          `Apply this working copy to ${copy.sourcePath}? A conflict check will run first.`,
        )
      )
        return;
      const changeSet = createCanonChangeSet(copy);
      try {
        const result = await saveUniverseTextFile(
          universePath,
          copy.sourcePath,
          copy.draftContent,
          copy.sourceModifiedMs,
        );
        if (!result.ok) {
          const conflicted = {
            ...changeSet,
            status: "conflicted" as const,
            updatedAt: new Date().toISOString(),
          };
          await saveUniverseTextFile(
            universePath,
            changeSetPath(conflicted.id),
            `${JSON.stringify(conflicted, null, 2)}\n`,
          );
          await commitStructuralAction("Recorded Canon conflict", {
            project: {
              ...currentProject,
              canonChangeSets: [
                ...(currentProject.canonChangeSets ?? []),
                conflicted,
              ],
            },
          });
          setMessage(
            result.message ??
              "Canon changed on disk; exported a conflicted proposal instead.",
          );
          return;
        }
        const appliedAt = new Date().toISOString();
        const applied = {
          ...changeSet,
          status: "applied" as const,
          appliedAt,
          appliedBy: "pathbranching",
          updatedAt: appliedAt,
        };
        await saveUniverseTextFile(
          universePath,
          changeSetPath(applied.id),
          `${JSON.stringify(applied, null, 2)}\n`,
        );
        await commitStructuralAction("Applied Canon working copy", {
          project: {
            ...currentProject,
            canonChangeSets: [
              ...(currentProject.canonChangeSets ?? []),
              applied,
            ],
            canonWorkingCopies: (currentProject.canonWorkingCopies ?? []).map(
              (candidate) =>
                candidate.canonRefId === canonRefId
                  ? {
                      ...candidate,
                      sourceContent: copy.draftContent,
                      draftContent: copy.draftContent,
                      sourceModifiedMs: result.modifiedMs,
                      updatedAt: appliedAt,
                    }
                  : candidate,
            ),
          },
        });
        setMessage("Applied working copy and recorded the change set.");
      } catch (applyError) {
        setError(
          applyError instanceof Error ? applyError.message : String(applyError),
        );
      }
    },
    [commitStructuralAction],
  );

  const updateLocalExplorerEntity = useCallback(
    (id: string, updates: Partial<LocalExplorerEntity>) => {
      const currentProject = projectRef.current;
      if (!currentProject) return;
      void commitStructuralAction("Updated local Explorer entity", {
        project: {
          ...currentProject,
          localExplorerEntities: (
            currentProject.localExplorerEntities ?? []
          ).map((entity) =>
            entity.id === id
              ? { ...entity, ...updates, updatedAt: new Date().toISOString() }
              : entity,
          ),
        },
      });
    },
    [commitStructuralAction],
  );

  const createExplorerEntity = useCallback(
    (type: string) => {
      const currentProject = projectRef.current;
      if (!currentProject) return;
      const base = createLocalExplorerEntity(type);
      const existingIds = new Set([
        ...(currentProject.localExplorerEntities ?? []).map(
          (entity) => entity.id,
        ),
        ...currentProject.canonRefs.map((ref) => ref.id),
      ]);
      const entity = existingIds.has(base.id)
        ? { ...base, id: `${base.id}-${existingIds.size + 1}` }
        : base;
      void commitStructuralAction("Created local Explorer entity", {
        project: {
          ...currentProject,
          localExplorerEntities: [
            ...(currentProject.localExplorerEntities ?? []),
            entity,
          ],
        },
        selection: { type: "explorerEntity", id: entity.id },
      });
    },
    [commitStructuralAction],
  );

  const deleteLocalExplorerEntity = useCallback(
    (id: string) => {
      const currentProject = projectRef.current;
      const entity = currentProject?.localExplorerEntities?.find(
        (candidate) => candidate.id === id,
      );
      if (!currentProject || !entity) return;
      if (!window.confirm(`Delete local entity \"${entity.name}\"?`)) return;
      void commitStructuralAction("Deleted local Explorer entity", {
        project: {
          ...currentProject,
          localExplorerEntities: (currentProject.localExplorerEntities ?? []).filter(
            (candidate) => candidate.id !== id,
          ),
        },
        selection: undefined,
      });
    },
    [commitStructuralAction],
  );

  const createExplorerType = useCallback(() => {
    const currentProject = projectRef.current;
    if (!currentProject) return;
    const type = createLocalExplorerType();
    void commitStructuralAction("Created local Explorer type", {
      project: {
        ...currentProject,
        localExplorerTypes: [
          ...(currentProject.localExplorerTypes ?? []),
          type,
        ],
      },
      selection: { type: "explorerType", id: type.id, source: "local" },
    });
  }, [commitStructuralAction]);

  const createExplorerProperty = useCallback(() => {
    const currentProject = projectRef.current;
    if (!currentProject) return;
    const property = createLocalExplorerProperty();
    void commitStructuralAction("Created local Explorer property", {
      project: {
        ...currentProject,
        localExplorerProperties: [
          ...(currentProject.localExplorerProperties ?? []),
          property,
        ],
      },
      selection: {
        type: "explorerProperty",
        id: property.id,
        source: "local",
      },
    });
  }, [commitStructuralAction]);

  const updateLocalExplorerType = useCallback(
    (id: string, updates: Partial<LocalExplorerType>) => {
      const currentProject = projectRef.current;
      if (!currentProject) return;
      void commitStructuralAction("Updated local Explorer type", {
        project: {
          ...currentProject,
          localExplorerTypes: (currentProject.localExplorerTypes ?? []).map(
            (type) =>
              type.id === id
                ? { ...type, ...updates, updatedAt: new Date().toISOString() }
                : type,
          ),
        },
      });
    },
    [commitStructuralAction],
  );

  const updateLocalExplorerProperty = useCallback(
    (id: string, updates: Partial<LocalExplorerProperty>) => {
      const currentProject = projectRef.current;
      if (!currentProject) return;
      void commitStructuralAction("Updated local Explorer property", {
        project: {
          ...currentProject,
          localExplorerProperties: (
            currentProject.localExplorerProperties ?? []
          ).map((property) =>
            property.id === id
              ? {
                  ...property,
                  ...updates,
                  updatedAt: new Date().toISOString(),
                }
              : property,
          ),
        },
      });
    },
    [commitStructuralAction],
  );

  const updateLogicPropertyOverride = useCallback(
    (
      propertyId: string,
      source: "canon" | "local",
      changes: Partial<LogicPropertyOverride>,
    ) => {
      const currentProject = projectRef.current;
      if (!currentProject) return;
      const current = (currentProject.logicPropertyOverrides ?? []).find(
        (item) => item.propertyId === propertyId && item.source === source,
      ) ?? { propertyId, source };
      void commitStructuralAction("Updated property capabilities", {
        project: {
          ...currentProject,
          logicPropertyOverrides: [
            ...(currentProject.logicPropertyOverrides ?? []).filter(
              (item) => item.propertyId !== propertyId || item.source !== source,
            ),
            { ...current, ...changes },
          ],
        },
      });
    },
    [commitStructuralAction],
  );

  const publishLocalExplorerEntity = useCallback(
    async (id: string) => {
      const currentProject = projectRef.current;
      const currentWorkspace = workspaceRef.current;
      const universePath = fileStateRef.current.universePath;
      const entity = currentProject?.localExplorerEntities?.find(
        (candidate) => candidate.id === id,
      );
      if (!currentProject || !currentWorkspace || !universePath || !entity)
        return;
      const localType = currentProject.localExplorerTypes?.find(
        (type) => type.id === entity.type,
      );
      const canonType = canonExplorerTypes(
        currentWorkspace.canonIndex.propertiesConfig,
      ).find((type) => type.id === entity.type);
      const path =
        entity.publishedPath ??
        localEntityPath(
          entity,
          localType?.suggestedFolder ?? canonType?.suggestedFolder,
        );
      if (
        currentWorkspace.files.some((file) => file.relativePath === path) ||
        currentWorkspace.canonIndex.entities.some(
          (item) => item.id === entity.id,
        )
      ) {
        setMessage(
          "Publication blocked: the target path or stable ID already exists in WorldNotion.",
        );
        return;
      }
      try {
        const content = serializeLocalExplorerEntity(entity);
        const result = await saveUniverseTextFile(universePath, path, content);
        if (!result.ok)
          throw new Error(result.message ?? "Could not publish the entity.");
        await commitStructuralAction("Published local Explorer entity", {
          project: {
            ...currentProject,
            localExplorerEntities: (
              currentProject.localExplorerEntities ?? []
            ).map((candidate) =>
              candidate.id === id
                ? {
                    ...candidate,
                    publishedPath: path,
                    publishedAt: new Date().toISOString(),
                    exportedPath: path,
                  }
                : candidate,
            ),
          },
        });
        setMessage(
          `Published ${entity.name} in ${path}. Reload the universe to see it as Canon.`,
        );
      } catch (publishError) {
        setError(
          publishError instanceof Error
            ? publishError.message
            : String(publishError),
        );
      }
    },
    [commitStructuralAction],
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
    setMarkdownTabs((current) =>
      current.map((tab) =>
        tab.id === id ? { ...tab, content, dirty: true } : tab,
      ),
    );
  }, []);

  const changeMarkdownFormat = useCallback(
    (id: string, format: MarkdownDraftFormat) => {
      setMarkdownTabs((current) =>
        current.map((tab) => {
          if (tab.id !== id) return tab;
          const ref = project?.canonRefs.find(
            (canonRef) => canonRef.id === tab.canonRefId,
          );
          if (!ref) return { ...tab, format };
          const template = markdownFormatTemplate(format, ref);
          return {
            ...tab,
            format,
            content: tab.dirty
              ? `${tab.content.trimEnd()}\n\n---\n\n${template}`
              : template,
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

      setMarkdownTabs((current) =>
        current.map((item) =>
          item.id === id ? { ...item, saving: true } : item,
        ),
      );
      try {
        const result = await saveWorkingCopy(
          fileState.universePath,
          tab.canonRefId,
          tab.content,
          tab.modifiedMs,
        );
        if (!result.ok) {
          throw new Error(
            result.message ?? "Could not save Markdown working copy.",
          );
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
          await commitStructuralAction("Linked Markdown working copy", {
            project: {
              ...projectRef.current,
              canonRefs: projectRef.current.canonRefs.map((ref) =>
                ref.id === tab.canonRefId ? { ...ref, workingCopyPath } : ref,
              ),
            },
            message: `Saved working copy: ${workingCopyPath}.`,
          });
        }
        setMessage(`Saved working copy: ${workingCopyPath}.`);
      } catch (saveError) {
        setMarkdownTabs((current) =>
          current.map((item) =>
            item.id === id ? { ...item, saving: false } : item,
          ),
        );
        setMessage(
          saveError instanceof Error ? saveError.message : String(saveError),
        );
      }
    },
    [commitStructuralAction, fileState.universePath, markdownTabs],
  );

  const confirmDiscardChanges = useCallback(async () => {
    if (!eventDraft?.dirty) {
      return true;
    }
    return new Promise<boolean>((resolve) => {
      setDiscardDialog({ resolve });
    });
  }, [eventDraft?.dirty]);

  const resolveDiscardDialog = useCallback(
    (discard: boolean) => {
      discardDialog?.resolve(discard);
      setDiscardDialog(undefined);
    },
    [discardDialog],
  );

  const setActiveSequence = useCallback(
    async (sequenceId: string) => {
      if (!project) {
        return;
      }
      if (!(await confirmDiscardChanges())) {
        return;
      }
      setEventDraft(undefined);
      updateProject(
        {
          ...project,
          canvas: {
            ...project.canvas,
            activeSequenceId: sequenceId,
            activeScope: { kind: "sequence", id: sequenceId },
          },
        },
        { type: "node", id: sequenceId },
      );
      setCanvasMode("branching");
      setFocusNodeId(undefined);
    },
    [confirmDiscardChanges, project, updateProject],
  );

  const setActiveStory = useCallback(
    async (storyId: string) => {
      if (
        !storyId ||
        !fileStateRef.current.universePath ||
        workspaceRef.current?.activeStory?.id === storyId
      ) {
        return;
      }
      if (!(await confirmDiscardChanges())) {
        return;
      }
      try {
        const opened = await openUniverseStory(
          fileStateRef.current.universePath,
          storyId,
        );
        applyWorkspace(opened.workspace, opened.path);
        setSettings((current) => ({
          ...rememberRecentProject(current, opened.path),
          worldnotionBridge: {
            ...current.worldnotionBridge,
            connected: true,
            lastCheckedAt: Date.now(),
            lastStatus: "ok",
            lastMessage:
              "WorldNotion bridge connected through the active story.",
          },
        }));
        setView("workspace");
        setError(undefined);
        setMessage(
          workspaceLoadWarningMessage(opened.workspace) ??
            `Opened story ${opened.workspace.activeStory?.name ?? storyId}.`,
        );
      } catch (openError) {
        setError(
          openError instanceof Error ? openError.message : String(openError),
        );
      }
    },
    [applyWorkspace, confirmDiscardChanges],
  );

  useEffect(() => {
    let disposed = false;
    async function loadInitialProject() {
      if (settings.worldnotionBridge.connected && settings.lastOpenedProject) {
        try {
          const opened = await openUniversePath(settings.lastOpenedProject);
          if (disposed) {
            return;
          }
          applyWorkspace(opened.workspace, opened.path);
          setSettings((current) => ({
            ...rememberRecentProject(current, opened.path),
            worldnotionBridge: {
              ...current.worldnotionBridge,
              connected: true,
              lastCheckedAt: Date.now(),
              lastStatus: "ok",
              lastMessage:
                "WorldNotion bridge connected through the last universe.",
            },
          }));
          setView("workspace");
          setInitialLoading(false);
          return;
        } catch {
          setMissingRecentProjects((current) =>
            new Set(current).add(settings.lastOpenedProject as string),
          );
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
    document.documentElement.dataset.theme = suiteChrome?.suiteSettings?.style ?? settings.theme;
    saveSettings({ ...settings, lastView: view });
  }, [settings, suiteChrome?.suiteSettings?.style, view]);

  useEffect(() => {
    const currentProject = projectRef.current;
    if (!currentProject) return;
    const scope = activeCanvasScope(currentProject);
    const model = buildStoryCanvasModel(currentProject, {
      nodeColors: settings.nodeColors,
      scope,
    });
    setActiveScopeState(scope);
    setNodes(model.nodes);
    setEdges(model.edges);
    setFiles(model.files);
  }, [settings.nodeColors]);

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
      eventInspectorOpen: eventInspector.open,
      eventInspectorOpenEventIds: eventInspector.openEventIds,
      eventInspectorExpandedEventId: eventInspector.expandedEventId,
      eventInspectorTabGroups,
      inspectorTabs,
      inspectorExpandedTabId: expandedInspectorTabId,
      inspectorMaximized,
      activeScope,
      canvasMode,
      focusNodeId,
      markdownTabs: storableMarkdownTabs(markdownTabs),
      activeMarkdownTabId,
      storyOutlineTab,
      panelVisibility,
      panelCollapsed,
    };
    setSettings((current) => {
      const currentSession =
        current.workspaceSessions?.[fileState.universePath as string];
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
    activeScope,
    canonOpen,
    canonWidth,
    canvasMode,
    dataOpen,
    eventInspector,
    eventInspectorTabGroups,
    exportOpen,
    fileState.universePath,
    filesOpen,
    focusNodeId,
    initialLoading,
    markdownTabs,
    panelCollapsed,
    panelVisibility,
    selection,
    storyOutlineTab,
    storiesWidth,
    view,
  ]);

  const toggleTheme = useCallback(() => {
    if (suiteChrome?.suiteSettings) {
      suiteChrome.suiteSettings.onToggleStyleMode();
      return;
    }
    setSettings((current) => ({
      ...current,
      theme: toggledThemeMode(current.theme),
    }));
  }, [suiteChrome?.suiteSettings]);

  const changeThemeFamily = useCallback((family: ThemeFamily) => {
    setSettings((current) => ({
      ...current,
      theme: themeForFamilyAndMode(family, themeById(current.theme).mode),
    }));
  }, []);

  const changeCanvasBackground = useCallback(
    (updates: Partial<CanvasBackgroundSettings>) => {
      setSettings((current) => ({
        ...current,
        canvasBackground: normalizeCanvasBackgroundSettings({
          ...current.canvasBackground,
          ...updates,
        }),
      }));
    },
    [],
  );

  const changeInspectorTabCloseSelectsNext = useCallback((value: boolean) => {
    setSettings((current) => ({
      ...current,
      inspectorTabCloseSelectsNext: value,
    }));
  }, []);

  const changeCollapseInspectorTabOnCanvasClick = useCallback(
    (value: boolean) => {
      setSettings((current) => ({
        ...current,
        collapseInspectorTabOnCanvasClick: value,
      }));
    },
    [],
  );

  const changeInspectorDebugEnabled = useCallback((value: boolean) => {
    setSettings((current) => ({ ...current, inspectorDebugEnabled: value }));
  }, []);

  const changeNodeColors = useCallback(
    (updates: Partial<NodeColorSettings>) => {
      setSettings((current) => ({
        ...current,
        nodeColors: normalizeNodeColorSettings({
          ...current.nodeColors,
          ...updates,
        }),
      }));
    },
    [],
  );

  const checkBridgeConnection = useCallback(async (connect: boolean) => {
    if (!isTauriRuntime()) {
      const lastMessage =
        "Bridge unavailable in web preview. Open Everend PathBranching desktop to connect a local universe folder.";
      setSettings((current) => ({
        ...current,
        worldnotionBridge: {
          ...current.worldnotionBridge,
          connected: false,
          lastCheckedAt: Date.now(),
          lastStatus: "error",
          lastMessage,
        },
      }));
      setMessage(lastMessage);
      return false;
    }

    try {
      const status = await verifyDesktopBridge();
      const lastMessage =
        status.message || "Everend PathBranching desktop bridge is available.";
      setSettings((current) => ({
        ...current,
        worldnotionBridge: {
          ...current.worldnotionBridge,
          connected: connect ? true : current.worldnotionBridge.connected,
          lastCheckedAt: Date.now(),
          lastStatus: status.ok ? "ok" : "error",
          lastMessage,
        },
      }));
      setError(undefined);
      setMessage(connect ? "WorldNotion bridge connected." : lastMessage);
      return status.ok;
    } catch (bridgeError) {
      const lastMessage =
        bridgeError instanceof Error
          ? bridgeError.message
          : String(bridgeError);
      setSettings((current) => ({
        ...current,
        worldnotionBridge: {
          ...current.worldnotionBridge,
          connected: false,
          lastCheckedAt: Date.now(),
          lastStatus: "error",
          lastMessage,
        },
      }));
      setError(lastMessage);
      return false;
    }
  }, []);

  const connectBridge = useCallback(() => {
    void checkBridgeConnection(true);
  }, [checkBridgeConnection]);

  const verifyBridge = useCallback(() => {
    void checkBridgeConnection(false);
  }, [checkBridgeConnection]);

  const disconnectBridge = useCallback(() => {
    const lastMessage =
      "WorldNotion bridge disconnected. Everend PathBranching will not auto-open or listen through the bridge.";
    setSettings((current) => ({
      ...current,
      worldnotionBridge: {
        ...current.worldnotionBridge,
        connected: false,
        lastCheckedAt: Date.now(),
        lastStatus: "disconnected",
        lastMessage,
      },
    }));
    setMessage(lastMessage);
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
      setSettings((current) => ({
        ...rememberRecentProject(current, opened.path),
        worldnotionBridge: {
          ...current.worldnotionBridge,
          connected: true,
          lastCheckedAt: Date.now(),
          lastStatus: "ok",
          lastMessage:
            "WorldNotion bridge connected through the selected universe folder.",
        },
      }));
      setView("workspace");
      setError(undefined);
      const loadWarning = workspaceLoadWarningMessage(opened.workspace);
      setMessage(
        loadWarning ??
          (opened.workspace.createdDefaultStory
            ? `Opened ${projectFileName(opened.path)}. Create a story to write Everend PathBranching metadata.`
            : `Opened ${projectFileName(opened.path)}.`),
      );
    } catch (openError) {
      setError(
        openError instanceof Error ? openError.message : String(openError),
      );
    }
  }, [applyWorkspace, confirmDiscardChanges]);

  const revealUniverse = useCallback(async () => {
    const universePath = fileStateRef.current.universePath;
    if (!universePath) {
      setMessage("Open a universe before revealing its folder.");
      return;
    }
    try {
      const result = await revealUniverseFolder(universePath);
      if (!result.ok) {
        throw new Error(result.message ?? "Could not reveal universe folder.");
      }
      setMessage(
        `Opened ${projectFileName(universePath)} in the system file explorer.`,
      );
    } catch (revealError) {
      setError(
        revealError instanceof Error
          ? revealError.message
          : String(revealError),
      );
    }
  }, []);

  const saveUniverseProfile = useCallback(async (profile: UniverseProfile) => {
    const universePath = fileStateRef.current.universePath;
    if (!universePath) {
      throw new Error("Open a universe before saving its customization.");
    }
    const normalizedProfile: UniverseProfile = {
      ...fileStateRef.current.universeProfile,
      name: profile.name?.trim() || undefined,
      icon: profile.icon,
    };
    const result = await saveUniverseTextFile(
      universePath,
      ".everend/universe.json",
      `${JSON.stringify(normalizedProfile, null, 2)}\n`,
    );
    if (!result.ok) {
      throw new Error(result.message ?? "Could not save universe profile.");
    }
    setFileState((current) => {
      const next = { ...current, universeProfile: normalizedProfile };
      fileStateRef.current = next;
      return next;
    });
    setWorkspace((current) => {
      if (!current) return current;
      const next = { ...current, universeProfile: normalizedProfile };
      workspaceRef.current = next;
      return next;
    });
    setMessage("Universe customization saved.");
  }, []);

  const persistProject = useCallback((options: { manual?: boolean } = {}) => {
    const run = async () => {
      const currentProject = projectRef.current;
      const currentWorkspace = workspaceRef.current;
      const currentFileState = fileStateRef.current;
      const saveRevision = projectRevisionRef.current;

      if (!currentProject) {
        return;
      }
      if (!currentWorkspace || !currentFileState.universePath) {
        throw new Error(
          "Open a universe before saving an Everend PathBranching story.",
        );
      }

      const snapshot = await saveBranchingDocument({
        project: currentProject,
        workspace: currentWorkspace,
        fileState: currentFileState,
        revision: saveRevision,
      });
      const isStillCurrentRevision =
        projectRevisionRef.current === saveRevision;
      const nextFileState: ProjectFileState = {
        ...snapshot.nextFileState,
        dirty: isStillCurrentRevision ? false : true,
      };
      fileStateRef.current = {
        ...nextFileState,
        dirty: isStillCurrentRevision ? false : true,
      };
      setFileState(fileStateRef.current);
      setSettings((current) =>
        rememberRecentProject(current, currentFileState.universePath as string),
      );
      setWorkspace((current) => {
        const nextWorkspace = current
          ? {
              ...snapshot.nextWorkspace,
              activeProject: isStillCurrentRevision
                ? snapshot.savedProject
                : (projectRef.current ?? current.activeProject),
              createdDefaultStory: false,
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
        }, 0);
      }
    };

    const queuedSave = saveQueueRef.current.catch(() => undefined).then(run);
    saveQueueRef.current = queuedSave;
    return queuedSave;
  }, []);

  const saveCanvas = useCallback(async () => {
    if (!canvasDirty) {
      setMessage("Canvas has no pending changes.");
      return;
    }
    try {
      await persistProject({ manual: true });
      setCanvasDirty(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  }, [canvasDirty, persistProject]);

  useEffect(() => {
    persistProjectRef.current = persistProject;
  }, [persistProject]);

  const saveActiveEventDraft = useCallback(async () => {
    const currentDraft = eventDraft;
    const currentProject = projectRef.current;
    if (!currentDraft?.dirty) {
      setMessage("No event edits to save.");
      return true;
    }
    if (!currentProject) {
      setMessage("No event is available to save.");
      return false;
    }

    const snapshot = {
      project: currentProject,
      workspace: workspaceRef.current,
      fileState: fileStateRef.current,
      selection: selectionRef.current,
      undoStack,
      redoStack,
      revision: projectRevisionRef.current,
      savedRevision: savedRevisionRef.current,
    };

    try {
      setEventDraft((draft) =>
        draft?.eventId === currentDraft.eventId
          ? { ...draft, saving: true }
          : draft,
      );
      const nextProject = applyEventDraftToProject(
        currentProject,
        currentDraft,
      );
      applyProject(nextProject, { dirty: false, revision: true });
      await persistProject();
      setEventDraft({
        ...currentDraft,
        baseEvent: structuredClone(currentDraft.draftEvent),
        draftEvent: structuredClone(currentDraft.draftEvent),
        dirty: false,
        saving: false,
      });
      setMessage("Saved event edits.");
      return true;
    } catch (saveError) {
      restoreStructuralSnapshot(snapshot);
      setEventDraft((draft) =>
        draft?.eventId === currentDraft.eventId
          ? { ...draft, saving: false }
          : draft,
      );
      setError(
        saveError instanceof Error ? saveError.message : String(saveError),
      );
      return false;
    }
  }, [
    applyProject,
    eventDraft,
    persistProject,
    redoStack,
    restoreStructuralSnapshot,
    undoStack,
  ]);

  const openEventInspectorForEvent = useCallback((eventId: string) => {
    setExpandedInspectorTabId(undefined);
    setEventInspector((current) => openEventInspectorTab(current, eventId));
  }, []);

  const collapseEventInspectorForEvent = useCallback((eventId: string) => {
    setEventInspector((current) => collapseEventInspectorTab(current, eventId));
  }, []);

  const pruneEventInspectorEvents = useCallback(
    (eventIds: readonly string[]) => {
      setEventInspector((current) =>
        pruneEventInspectorState(current, eventIds),
      );
      setEventInspectorTabGroups((current) =>
        pruneEventInspectorTabGroups(current, eventIds),
      );
    },
    [],
  );

  const requestCloseEventInspectorForEvent = useCallback(
    (eventId: string) => {
      if (eventDraft?.dirty && eventDraft.eventId === eventId) {
        setSelection({ type: "node", id: eventId });
        setEventDraftDialog({ kind: "closeInspectorTab", eventId });
        return;
      }
      setEventInspector((current) =>
        closeEventInspectorTab(current, eventId, {
          selectNextOnClose: settings.inspectorTabCloseSelectsNext,
        }),
      );
      if (
        settings.inspectorTabCloseSelectsNext &&
        eventInspector.expandedEventId === eventId &&
        eventInspector.openEventIds.length === 1 &&
        inspectorTabs.length > 0
      ) {
        setExpandedInspectorTabId(inspectorTabs[0].id);
        setSelection(inspectorTabs[0].selection);
      }
    },
    [
      eventDraft,
      eventInspector.expandedEventId,
      eventInspector.openEventIds.length,
      inspectorTabs,
      settings.inspectorTabCloseSelectsNext,
    ],
  );

  const closeAllInspectorTabs = useCallback(() => {
    if (eventDraft?.dirty) {
      setSelection({ type: "node", id: eventDraft.eventId });
      setMessage("Save or discard edits before closing all tabs.");
      return;
    }
    setEventInspector((current) => closeAllEventInspectorTabs(current));
  }, [eventDraft]);

  const closeInspectorTabsAbove = useCallback(
    (eventId: string) => {
      const index = eventInspector.openEventIds.indexOf(eventId);
      const idsToClose = eventInspector.openEventIds.slice(0, index);
      if (eventDraft?.dirty && idsToClose.includes(eventDraft.eventId)) {
        setSelection({ type: "node", id: eventDraft.eventId });
        setMessage("Save or discard edits before closing that tab.");
        return;
      }
      setEventInspector((current) =>
        closeEventInspectorTabsAbove(current, eventId),
      );
    },
    [eventDraft, eventInspector.openEventIds],
  );

  const closeInspectorTabsBelow = useCallback(
    (eventId: string) => {
      const index = eventInspector.openEventIds.indexOf(eventId);
      const idsToClose =
        index === -1 ? [] : eventInspector.openEventIds.slice(index + 1);
      if (eventDraft?.dirty && idsToClose.includes(eventDraft.eventId)) {
        setSelection({ type: "node", id: eventDraft.eventId });
        setMessage("Save or discard edits before closing that tab.");
        return;
      }
      setEventInspector((current) =>
        closeEventInspectorTabsBelow(current, eventId),
      );
    },
    [eventDraft, eventInspector.openEventIds],
  );

  const closeOtherInspectorTabs = useCallback(
    (eventId: string) => {
      const idsToClose = eventInspector.openEventIds.filter(
        (candidate) => candidate !== eventId,
      );
      if (eventDraft?.dirty && idsToClose.includes(eventDraft.eventId)) {
        setSelection({ type: "node", id: eventDraft.eventId });
        setMessage("Save or discard edits before closing that tab.");
        return;
      }
      setEventInspector((current) =>
        closeOtherEventInspectorTabs(current, eventId),
      );
    },
    [eventDraft, eventInspector.openEventIds],
  );

  const loadInspectorTabGroup = useCallback(
    (groupId: string) => {
      const group = eventInspectorTabGroups.find(
        (candidate) => candidate.id === groupId,
      );
      if (!group) {
        return;
      }
      const nextInspector = loadEventInspectorTabGroup(group);
      const nextInspectorTabs = group.inspectorTabs ?? [];
      const nextExpandedInspectorTabId =
        group.inspectorExpandedTabId &&
        nextInspectorTabs.some(
          (tab) => tab.id === group.inspectorExpandedTabId,
        )
          ? group.inspectorExpandedTabId
          : nextInspector.expandedEventId
            ? undefined
            : nextInspectorTabs[0]?.id;
      setEventInspector(
        nextExpandedInspectorTabId
          ? { ...nextInspector, expandedEventId: undefined }
          : nextInspector,
      );
      setInspectorTabs(nextInspectorTabs);
      setExpandedInspectorTabId(nextExpandedInspectorTabId);
      setSelection(
        nextExpandedInspectorTabId
          ? nextInspectorTabs.find(
              (tab) => tab.id === nextExpandedInspectorTabId,
            )?.selection
          : nextInspector.expandedEventId
          ? { type: "node", id: nextInspector.expandedEventId }
          : undefined,
      );
    },
    [eventInspectorTabGroups],
  );

  const requestLoadInspectorTabGroup = useCallback(
    (groupId: string) => {
      if (!eventInspectorTabGroups.some((group) => group.id === groupId)) {
        return;
      }
      if (eventDraft?.dirty) {
        setEventDraftDialog({ kind: "loadInspectorGroup", groupId });
        return;
      }
      loadInspectorTabGroup(groupId);
    },
    [eventDraft?.dirty, eventInspectorTabGroups, loadInspectorTabGroup],
  );

  const requestSaveInspectorTabGroup = useCallback(() => {
    if (eventInspector.openEventIds.length === 0 && inspectorTabs.length === 0) {
      setMessage("Open inspector tabs before saving a group.");
      return;
    }
    setNameDialog({
      kind: "saveInspectorTabGroup",
      title: "Save Inspector Tab Group",
      label: "Group name",
      initialValue: `Inspector group ${eventInspectorTabGroups.length + 1}`,
    });
  }, [eventInspector.openEventIds.length, eventInspectorTabGroups.length, inspectorTabs.length]);

  const deleteInspectorTabGroup = useCallback((groupId: string) => {
    setEventInspectorTabGroups((current) =>
      deleteEventInspectorTabGroup(groupId, current),
    );
  }, []);

  const selectWithEventDraftGuard = useCallback(
    (nextSelection?: Selection) => {
      const currentProject = projectRef.current;
      const tab =
        nextSelection && currentProject
          ? explorerInspectorTab(nextSelection, currentProject, nodes)
          : undefined;
      const nextEventId = currentProject
        ? eventIdFromSelection(currentProject, nodes, nextSelection)
        : undefined;
      if (
        eventDraft?.dirty &&
        nextEventId &&
        nextEventId !== eventDraft.eventId
      ) {
        setEventDraftDialog({ kind: "select", nextSelection });
        return;
      }
      setSelection(nextSelection);
      if (tab) {
        setInspectorTabs((current) =>
          current.some((candidate) => candidate.id === tab.id)
            ? current
            : [tab, ...current],
        );
        setExpandedInspectorTabId(tab.id);
        setEventInspector((current) => ({
          ...current,
          expandedEventId: undefined,
        }));
      } else if (nextEventId) {
        setExpandedInspectorTabId(undefined);
        openEventInspectorForEvent(nextEventId);
      }
    },
    [eventDraft, nodes, openEventInspectorForEvent],
  );

  const openInspectorTab = useCallback(
    (id: string) => {
      const expanding = expandedInspectorTabId !== id;
      setExpandedInspectorTabId(expanding ? id : undefined);
      if (expanding) {
        setEventInspector((current) => ({
          ...current,
          expandedEventId: undefined,
        }));
        const target = inspectorTabs.find((tab) => tab.id === id);
        if (target) setSelection(target.selection);
      }
    },
    [expandedInspectorTabId, inspectorTabs],
  );

  const closeInspectorTab = useCallback(
    (id: string) => {
      const closedIndex = inspectorTabs.findIndex((tab) => tab.id === id);
      const nextTabs = inspectorTabs.filter((tab) => tab.id !== id);
      setInspectorTabs(nextTabs);
      if (expandedInspectorTabId !== id) return;
      const nextTab = settings.inspectorTabCloseSelectsNext
        ? nextTabs[closedIndex] ?? nextTabs[closedIndex - 1]
        : undefined;
      setExpandedInspectorTabId(nextTab?.id);
      if (nextTab) {
        setSelection(nextTab.selection);
      } else if (
        settings.inspectorTabCloseSelectsNext &&
        eventInspector.openEventIds.length > 0
      ) {
        setEventInspector((current) => ({
          ...current,
          open: true,
          expandedEventId: current.openEventIds[0],
        }));
        setSelection({ type: "node", id: eventInspector.openEventIds[0] });
      }
    },
    [
      eventInspector.openEventIds,
      expandedInspectorTabId,
      inspectorTabs,
      settings.inspectorTabCloseSelectsNext,
    ],
  );

  const closeDeletedNodeInspector = useCallback(
    (nodeId: string) => {
      const removedTabIds = new Set(
        inspectorTabs
          .filter(
            (tab) => tab.selection.type === "node" && tab.selection.id === nodeId,
          )
          .map((tab) => tab.id),
      );
      setInspectorTabs((current) =>
        current.filter(
          (tab) => tab.selection.type !== "node" || tab.selection.id !== nodeId,
        ),
      );
      setExpandedInspectorTabId((current) =>
        current && removedTabIds.has(current) ? undefined : current,
      );
      setSelection((current) =>
        current?.type === "node" && current.id === nodeId ? undefined : current,
      );
    },
    [inspectorTabs],
  );

  const resolveEventDraftDialog = useCallback(
    async (action: "save" | "discard" | "cancel") => {
      const pendingAction = eventDraftDialog;
      if (action === "cancel") {
        setEventDraftDialog(undefined);
        return;
      }
      if (action === "save") {
        const saved = await saveActiveEventDraft();
        if (!saved) {
          return;
        }
      }
      setEventDraftDialog(undefined);
      setEventDraft(undefined);
      if (pendingAction?.kind === "closeInspectorTab") {
        setEventInspector((current) =>
          closeEventInspectorTab(current, pendingAction.eventId, {
            selectNextOnClose: settings.inspectorTabCloseSelectsNext,
          }),
        );
        return;
      }
      if (pendingAction?.kind === "loadInspectorGroup") {
        loadInspectorTabGroup(pendingAction.groupId);
        return;
      }
      const nextSelection = pendingAction?.nextSelection;
      setSelection(nextSelection);
      const currentProject = projectRef.current;
      const nextEventId = currentProject
        ? eventIdFromSelection(currentProject, nodes, nextSelection)
        : undefined;
      if (nextEventId) {
        openEventInspectorForEvent(nextEventId);
      }
    },
    [
      eventDraftDialog,
      loadInspectorTabGroup,
      nodes,
      openEventInspectorForEvent,
      saveActiveEventDraft,
      settings.inspectorTabCloseSelectsNext,
    ],
  );

  useEffect(() => {
    if (!project) {
      setEventDraft(undefined);
      return;
    }
    if (eventDraft?.dirty) {
      return;
    }
    const ownerEventId = eventIdFromSelection(project, nodes, selection);
    if (!ownerEventId) {
      return;
    }
    const draftSelection = { type: "node" as const, id: ownerEventId };
    const nextDraft = createEventDraftFromSelection(
      project,
      draftSelection,
      eventDraft?.mode ?? "components",
    );
    if (
      eventDraft?.eventId === nextDraft?.eventId &&
      eventDraft?.mode === nextDraft?.mode
    ) {
      return;
    }
    setEventDraft(nextDraft);
  }, [
    eventDraft?.dirty,
    eventDraft?.eventId,
    eventDraft?.mode,
    nodes,
    project,
    selection,
  ]);

  const mutateEventDraft = useCallback(
    (
      factory: (projectWithDraft: BranchingProject) => mutations.MutationResult,
    ) => {
      setEventDraft((currentDraft) => {
        const currentProject = projectRef.current;
        if (!currentDraft || !currentProject) {
          return currentDraft;
        }
        const draftProject = applyEventDraftToProject(
          currentProject,
          currentDraft,
        );
        const result = factory(draftProject);
        const nextEvent = findEvent(result.project, currentDraft.eventId);
        if (!nextEvent) {
          return currentDraft;
        }
        return {
          ...currentDraft,
          draftEvent: structuredClone(nextEvent),
          dirty: true,
        };
      });
    },
    [],
  );

  const importAssets = useCallback(async () => {
    if (!fileState.universePath) {
      setMessage("Open a universe before importing assets.");
      return;
    }
    try {
      const imported = await importUniverseAssets(fileState.universePath);
      if (imported.length === 0) return;
      const current = projectRef.current;
      if (!current) return;
      await commitStructuralAction("Imported UnCanon assets", {
        project: {
          ...current,
          assets: [
            ...(current.assets ?? []).filter((asset) => asset.origin === "canon"),
            ...(current.assets ?? []).filter((asset) => asset.origin === "uncanon"),
            ...imported.map((asset) => ({
              ...asset,
              id: `asset:${crypto.randomUUID()}`,
              origin: "uncanon" as const,
              importedAt: new Date().toISOString(),
            })),
          ],
        },
        message: `Imported ${imported.length} UnCanon asset${imported.length === 1 ? "" : "s"}.`,
      });
    } catch (assetError) {
      setError(assetError instanceof Error ? assetError.message : String(assetError));
    }
  }, [commitStructuralAction, fileState.universePath]);

  useEffect(() => {
    if (!desktopRuntime || !fileState.universePath) return;
    let cancelled = false;
    void indexCanonAssets(fileState.universePath).then((canonAssets) => {
      if (cancelled || !projectRef.current) return;
      const current = projectRef.current;
      const nextAssets = [
        ...canonAssets.map((asset) => ({
          ...asset,
          id: `canon-asset:${asset.path}`,
          origin: "canon" as const,
        })),
        ...(current.assets ?? []).filter((asset) => asset.origin === "uncanon"),
      ];
      const next = normalizeProject({ ...current, assets: nextAssets });
      projectRef.current = next;
      setProject(next);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [desktopRuntime, fileState.universePath]);

  const exportRuntime = useCallback(
    async (mode: ExportPreviewMode = exportPreviewMode) => {
      if (!project) {
        return;
      }
      try {
        const preview = buildExportPreview(project, mode);
        const result =
          mode === "ink"
            ? await exportTextDialog(preview.content, preview.defaultName)
            : mode === "gameData"
              ? await exportTextDialog(preview.content, preview.defaultName)
              : await exportRuntimeDialog(preview.runtimePackage);
        if (!result) {
          return;
        }
        if (!result.ok) {
          throw new Error(
            result.message ?? "Could not export runtime package.",
          );
        }
        setMessage(`Exported ${projectFileName(result.path)}.`);
      } catch (exportError) {
        setError(
          exportError instanceof Error
            ? exportError.message
            : String(exportError),
        );
      }
    },
    [exportPreviewMode, project],
  );

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
        setSettings((current) => ({
          ...rememberRecentProject(current, opened.path),
          worldnotionBridge: {
            ...current.worldnotionBridge,
            connected: true,
            lastCheckedAt: Date.now(),
            lastStatus: "ok",
            lastMessage:
              "WorldNotion bridge connected through the selected recent universe.",
          },
        }));
        setView("workspace");
        setError(undefined);
        setMessage(
          workspaceLoadWarningMessage(opened.workspace) ??
            `Opened ${projectFileName(opened.path)}.`,
        );
      } catch (openError) {
        setMissingRecentProjects((current) => new Set(current).add(path));
        setError(
          openError instanceof Error ? openError.message : String(openError),
        );
      }
    },
    [applyWorkspace, confirmDiscardChanges, fileState.universePath],
  );

  const removeRecentProject = useCallback((path: string) => {
    setSettings((current) => ({
      ...current,
      recentProjects: current.recentProjects.filter(
        (candidate) => candidate !== path,
      ),
      lastOpenedProject:
        current.lastOpenedProject === path
          ? undefined
          : current.lastOpenedProject,
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
    const snapshot = {
      project,
      workspace: workspaceRef.current,
      fileState: fileStateRef.current,
      selection: selectionRef.current,
      undoStack,
      redoStack,
      revision: projectRevisionRef.current,
      savedRevision: savedRevisionRef.current,
    };
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current.slice(-9), project]);
    setActionHistory((current) => ["Undo", ...current].slice(0, 10));
    applyProject(previous, { dirty: false, revision: true });
    setMessage("Undo...");
    void persistProjectRef
      .current?.()
      .then(() => setMessage("Undo saved."))
      .catch((undoError) => {
        restoreStructuralSnapshot(snapshot);
        setError(
          undoError instanceof Error ? undoError.message : String(undoError),
        );
      });
  }, [applyProject, project, redoStack, restoreStructuralSnapshot, undoStack]);

  const redoProject = useCallback(() => {
    if (!project || redoStack.length === 0) {
      return;
    }
    const next = redoStack[redoStack.length - 1];
    const snapshot = {
      project,
      workspace: workspaceRef.current,
      fileState: fileStateRef.current,
      selection: selectionRef.current,
      undoStack,
      redoStack,
      revision: projectRevisionRef.current,
      savedRevision: savedRevisionRef.current,
    };
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current.slice(-9), project]);
    setActionHistory((current) => ["Redo", ...current].slice(0, 10));
    applyProject(next, { dirty: false, revision: true });
    setMessage("Redo...");
    void persistProjectRef
      .current?.()
      .then(() => setMessage("Redo saved."))
      .catch((redoError) => {
        restoreStructuralSnapshot(snapshot);
        setError(
          redoError instanceof Error ? redoError.message : String(redoError),
        );
      });
  }, [applyProject, project, redoStack, restoreStructuralSnapshot, undoStack]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shortcutMatches(event, "Mod+Z")) {
        event.preventDefault();
        undoProject();
      }
      if (shortcutMatches(event, "Mod+Shift+Z")) {
        event.preventDefault();
        redoProject();
      }
      if (shortcutMatches(event, "Mod+S")) {
        event.preventDefault();
        if (canvasDirty) {
          void saveCanvas();
        } else {
          void saveActiveEventDraft();
        }
      }
      if (shortcutMatches(event, "Mod+R")) {
        event.preventDefault();
        window.location.reload();
        return;
      }
      if (shortcutMatches(event, "Mod+O")) {
        event.preventDefault();
        void openProject();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [canvasDirty, openProject, redoProject, saveActiveEventDraft, saveCanvas, undoProject]);

  const navigateCanvasScope = useCallback(
    (scope: CanvasScope, nextSelection?: Selection) => {
      const currentProject = projectRef.current;
      if (!currentProject) return;
      const nextProject = normalizeProject({
        ...currentProject,
        canvas: {
          ...currentProject.canvas,
          activeScope: scope,
          activeSequenceId:
            scope.kind === "sequence"
              ? scope.id
              : currentProject.canvas?.activeSequenceId,
        },
      });
      const normalizedScope = activeCanvasScope(nextProject);
      const model = buildStoryCanvasModel(nextProject, {
        nodeColors: settingsRef.current.nodeColors,
        scope: normalizedScope,
      });
      projectRef.current = nextProject;
      setProject(nextProject);
      setActiveScopeState(normalizedScope);
      setNodes(model.nodes);
      setEdges(model.edges);
      setFiles(model.files);
      setCanvasMode("branching");
      setFocusNodeId(undefined);
      setSelection(nextSelection ?? { type: "node", id: scope.id });
    },
    [],
  );

  const navigatePathTreeNode = useCallback(
    (node: PathTreeNode) => {
      navigateCanvasScope(node.scope, { type: "node", id: node.selectId });
      if (node.eventId) {
        openEventInspectorForEvent(node.eventId);
      }
    },
    [navigateCanvasScope, openEventInspectorForEvent],
  );

  const enterEventScope = useCallback(
    (eventId: string) => {
      navigateCanvasScope(
        { kind: "event", id: eventId },
        { type: "node", id: eventId },
      );
    },
    [navigateCanvasScope],
  );

  const exitToRootScope = useCallback(() => {
    const currentProject = projectRef.current;
    const scope = currentProject
      ? rootSequenceScope(currentProject)
      : undefined;
    if (scope) {
      navigateCanvasScope(scope, { type: "node", id: scope.id });
    }
  }, [navigateCanvasScope]);

  const findings = useMemo(() => {
    if (!project) {
      return [];
    }
    return [
      ...validateProject(project),
      ...validateStoryCanvasEdges(nodes, edges),
    ];
  }, [project, nodes, edges]);
  const webPreviewBanner = desktopRuntime ? null : (
    <div className="persistence-warning" role="status">
      Preview web: no guarda en universo. Abre Everend PathBranching con Tauri
      para crear stories, secuencias y eventos persistentes.
    </div>
  );

  const createStory = useCallback(
    async (name?: string) => {
      if (!isTauriRuntime()) {
        setMessage(
          "Preview web: no guarda en universo. Abre Everend PathBranching con Tauri para crear stories persistentes.",
        );
        return;
      }
      const currentWorkspace = workspaceRef.current;
      const currentFileState = fileStateRef.current;
      if (!currentWorkspace || !currentFileState.universePath) {
        setMessage("Open a universe before creating a story.");
        return;
      }

      try {
        setMessage("Creating Everend PathBranching story...");
        const revision = projectRevisionRef.current + 1;
        const snapshot = await createBranchingStory({
          workspace: workspaceRef.current ?? currentWorkspace,
          fileState: fileStateRef.current,
          name,
          revision,
        });
        applyWorkspace(snapshot.nextWorkspace, currentFileState.universePath);
        projectRevisionRef.current = revision;
        savedRevisionRef.current = revision;
        fileStateRef.current = snapshot.nextFileState;
        setFileState(snapshot.nextFileState);
        setSettings((current) =>
          rememberRecentProject(
            current,
            currentFileState.universePath as string,
          ),
        );
        setView("workspace");
        setMessage(
          `Created story ${snapshot.nextWorkspace.activeStory?.name ?? snapshot.savedProject.name}.`,
        );
      } catch (createError) {
        setError(
          createError instanceof Error
            ? createError.message
            : String(createError),
        );
      }
    },
    [applyWorkspace],
  );

  const createSequence = useCallback(
    (name?: string) => {
      if (!isTauriRuntime()) {
        setMessage(
          "Preview web: no guarda en universo. Abre Everend PathBranching con Tauri para crear secuencias persistentes.",
        );
        return;
      }
      const currentProject = projectRef.current;
      if (!currentProject || workspaceRef.current?.createdDefaultStory) {
        setNameDialog({
          kind: "createStory",
          title: "Create Story",
          label: "Story name",
          initialValue: "Branching Story",
        });
        setMessage(
          "Create an Everend PathBranching story before adding sequences.",
        );
        return;
      }
      runCanvasMutation(mutations.createSequence(currentProject, name), "Created sequence");
    },
    [runCanvasMutation],
  );

  const requestCreateStory = useCallback(() => {
    setNameDialog({
      kind: "createStory",
      title: "Create Story",
      label: "Story name",
      initialValue: "Branching Story",
    });
  }, []);

  const requestRenameStory = useCallback(() => {
    const activeStory = workspaceRef.current?.activeStory;
    if (!activeStory || workspaceRef.current?.createdDefaultStory) {
      setNameDialog({
        kind: "createStory",
        title: "Create Story",
        label: "Story name",
        initialValue: activeStory?.name ?? "Branching Story",
      });
      return;
    }
    setNameDialog({
      kind: "renameStory",
      title: "Rename Story",
      label: "Story name",
      initialValue: activeStory.name,
    });
  }, []);

  const requestDeleteStory = useCallback(() => {
    const currentWorkspace = workspaceRef.current;
    const activeStory = currentWorkspace?.activeStory;
    if (
      !activeStory ||
      !currentWorkspace ||
      currentWorkspace.manifest.stories.length <= 1
    ) {
      setMessage("Cannot delete the only story in this universe.");
      return;
    }
    setConfirmDialog({
      kind: "deleteStory",
      title: "Delete Story",
      message: `Remove "${activeStory.name}" from this universe? The story file will remain on disk for safety.`,
    });
  }, []);

  const requestCreateSequence = useCallback(() => {
    if (workspaceRef.current?.createdDefaultStory) {
      setNameDialog({
        kind: "createStory",
        title: "Create Story",
        label: "Story name",
        initialValue: "Branching Story",
      });
      return;
    }
    setNameDialog({
      kind: "createSequence",
      title: "Create Sequence",
      label: "Sequence name",
      initialValue: "New Sequence",
    });
  }, []);

  const requestRenameSequence = useCallback(() => {
    const currentProject = projectRef.current;
    if (!currentProject) return;
    const sequenceId = activeSequenceId(currentProject);
    const sequence = sequenceId
      ? findSequence(currentProject, sequenceId)
      : undefined;
    if (!sequence) {
      setMessage("No sequence is selected.");
      return;
    }
    setNameDialog({
      kind: "renameSequence",
      title: "Rename Sequence",
      label: "Sequence name",
      initialValue: sequence.name,
    });
  }, []);

  const requestDeleteSequence = useCallback(() => {
    const currentProject = projectRef.current;
    if (!currentProject) return;
    const sequenceId = activeSequenceId(currentProject);
    const sequence = sequenceId
      ? findSequence(currentProject, sequenceId)
      : undefined;
    if (!sequence) {
      setMessage("No sequence is selected.");
      return;
    }
    setConfirmDialog({
      kind: "deleteSequence",
      title: "Delete Sequence",
      message: `Delete "${sequence.name}"? This is blocked if it is the entry sequence or still contains events.`,
    });
  }, []);

  const confirmNameDialog = useCallback(
    async (value: string) => {
      const dialog = nameDialog;
      if (!dialog) return;
      setNameDialog(undefined);
      if (dialog.kind === "createStory") {
        await createStory(value);
        return;
      }
      if (dialog.kind === "renameStory") {
        const currentProject = projectRef.current;
        const currentWorkspace = workspaceRef.current;
        const currentFileState = fileStateRef.current;
        if (!currentProject || !currentWorkspace) return;
        try {
          const revision = projectRevisionRef.current + 1;
          const snapshot = await renameBranchingStory({
            project: currentProject,
            workspace: currentWorkspace,
            fileState: currentFileState,
            name: value,
            revision,
          });
          applyWorkspace(
            snapshot.nextWorkspace,
            currentFileState.universePath as string,
          );
          projectRevisionRef.current = revision;
          savedRevisionRef.current = revision;
          fileStateRef.current = snapshot.nextFileState;
          setFileState(snapshot.nextFileState);
          setMessage(`Renamed story to ${value}.`);
        } catch (renameError) {
          setError(
            renameError instanceof Error
              ? renameError.message
              : String(renameError),
          );
        }
        return;
      }
      if (dialog.kind === "createSequence") {
        createSequence(value);
        return;
      }
      if (dialog.kind === "renameSequence") {
        const currentProject = projectRef.current;
        const sequenceId = currentProject
          ? activeSequenceId(currentProject)
          : undefined;
        if (currentProject && sequenceId) {
          runMutation(
            mutations.updateSequence(currentProject, sequenceId, {
              name: value,
            }),
          );
        }
        return;
      }
      if (dialog.kind === "saveInspectorTabGroup") {
        const result = saveEventInspectorTabGroup(
          eventInspector,
          value,
          eventInspectorTabGroups,
        );
        const groups = result.groupId
          ? result.groups.map((group) =>
              group.id === result.groupId
                ? {
                    ...group,
                    inspectorTabs: [...inspectorTabs],
                    inspectorExpandedTabId: expandedInspectorTabId,
                    expandedEventId: expandedInspectorTabId
                      ? undefined
                      : group.expandedEventId,
                  }
                : group,
            )
          : [
              ...result.groups,
              {
                id: `inspector-tabs-${Date.now().toString(36)}`,
                name: value,
                eventIds: [],
                inspectorTabs: [...inspectorTabs],
                inspectorExpandedTabId: expandedInspectorTabId,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
            ];
        setEventInspectorTabGroups(groups);
        setMessage(
          result.groupId || inspectorTabs.length > 0
            ? `Saved inspector tab group "${value}".`
            : "Open inspector tabs before saving a group.",
        );
      }
    },
    [
      applyWorkspace,
      createSequence,
      createStory,
      eventInspector,
      eventInspectorTabGroups,
      expandedInspectorTabId,
      inspectorTabs,
      nameDialog,
      runMutation,
    ],
  );

  const confirmActionDialog = useCallback(async () => {
    const dialog = confirmDialog;
    if (!dialog) return;
    setConfirmDialog(undefined);
    if (dialog.kind === "deleteSequence") {
      const currentProject = projectRef.current;
      const sequenceId = currentProject
        ? activeSequenceId(currentProject)
        : undefined;
      if (currentProject && sequenceId) {
        const sequence = findSequence(currentProject, sequenceId);
        if (!sequence) return;
        if (
          currentProject.entrySequenceId === sequence.id ||
          sequence.eventIds.length > 0
        ) {
          setMessage(
            "Sequence deletion is blocked while it is entry or still contains events.",
          );
          return;
        }
        const nextSequences = currentProject.sequences.filter(
          (item) => item.id !== sequence.id,
        );
        updateProject(
          {
            ...currentProject,
            sequences: nextSequences,
            canvas: {
              ...currentProject.canvas,
              activeSequenceId:
                currentProject.canvas?.activeSequenceId === sequence.id
                  ? nextSequences[0]?.id
                  : currentProject.canvas?.activeSequenceId,
            },
          },
          nextSequences[0]
            ? { type: "node", id: nextSequences[0].id }
            : undefined,
        );
      }
      return;
    }
    if (dialog.kind === "deleteStory") {
      const currentWorkspace = workspaceRef.current;
      const currentFileState = fileStateRef.current;
      const activeStory = currentWorkspace?.activeStory;
      if (!currentWorkspace || !activeStory) return;
      if (!(await confirmDiscardChanges())) return;
      try {
        const snapshot = await deleteBranchingStory({
          workspace: currentWorkspace,
          fileState: currentFileState,
          storyId: activeStory.id,
        });
        const opened = await openUniverseStory(
          currentFileState.universePath as string,
          snapshot.nextWorkspace.activeStory?.id ?? "",
        );
        applyWorkspace(opened.workspace, opened.path);
        setFileState((current) => {
          const nextState = { ...current, dirty: false };
          fileStateRef.current = nextState;
          return nextState;
        });
        setMessage(`Deleted story ${activeStory.name} from the manifest.`);
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : String(deleteError),
        );
      }
    }
  }, [applyWorkspace, confirmDialog, confirmDiscardChanges, updateProject]);

  const createBranch = useCallback(
    (position?: { x: number; y: number }) => {
      if (!isTauriRuntime()) {
        setMessage(
          "Preview web: no guarda en universo. Abre Everend PathBranching con Tauri para crear branches persistentes.",
        );
        return;
      }
      const currentProject = projectRef.current;
      if (!currentProject || workspaceRef.current?.createdDefaultStory) {
        setMessage(
          "Create an Everend PathBranching story before adding branches.",
        );
        return;
      }

      const snap = settingsRef.current.canvasBackground;
      const snappedPosition = position
        ? snapCanvasPoint(position, snap.snapToGrid, snap.gridSize)
        : undefined;
      runCanvasMutation(mutations.createBranch(currentProject, snappedPosition), "Created branch");
    },
    [runCanvasMutation],
  );

  const createEvent = useCallback(
    (
      type: EventType = "normal",
      position?: { x: number; y: number },
      branchId?: string,
    ) => {
      if (!isTauriRuntime()) {
        setMessage(
          "Preview web: no guarda en universo. Abre Everend PathBranching con Tauri para crear eventos persistentes.",
        );
        return;
      }
      const currentProject = projectRef.current;
      if (!currentProject || workspaceRef.current?.createdDefaultStory) {
        setMessage(
          "Create an Everend PathBranching story before adding events.",
        );
        return;
      }

      const snap = settingsRef.current.canvasBackground;
      const snappedPosition = position
        ? snapCanvasPoint(position, snap.snapToGrid, snap.gridSize)
        : undefined;
      runCanvasMutation(
        mutations.createEvent(currentProject, type, snappedPosition, branchId),
        "Created event",
      );
    },
    [runCanvasMutation],
  );

  const createNestedEvent = useCallback(
    (
      parentEventId: string,
      type: EventType = "normal",
      position?: { x: number; y: number },
    ) => {
      if (!isTauriRuntime()) {
        setMessage(
          "Preview web: no guarda en universo. Abre Everend PathBranching con Tauri para crear microeventos persistentes.",
        );
        return;
      }
      const currentProject = projectRef.current;
      if (!currentProject || workspaceRef.current?.createdDefaultStory) {
        setMessage(
          "Create an Everend PathBranching story before adding nested events.",
        );
        return;
      }
      const snap = settingsRef.current.canvasBackground;
      const snappedPosition = position
        ? snapCanvasPoint(position, snap.snapToGrid, snap.gridSize)
        : undefined;
      runCanvasMutation(
        mutations.createNestedEvent(
          currentProject,
          parentEventId,
          type,
          snappedPosition,
        ),
        "Created nested event",
      );
    },
    [runCanvasMutation],
  );

  const createEventInBranch = useCallback(
    (branchId: string, type: EventType = "normal") => {
      createEvent(type, undefined, branchId);
    },
    [createEvent],
  );

  const createConnectedEvent = useCallback(
    (
      sourceNodeId: string,
      type: EventType,
      position: { x: number; y: number },
    ) => {
      if (!isTauriRuntime()) {
        setMessage(
          "Preview web: no guarda en universo. Abre Everend PathBranching con Tauri para crear eventos persistentes.",
        );
        return;
      }

      const currentProject = projectRef.current;
      if (!currentProject || workspaceRef.current?.createdDefaultStory) {
        setMessage(
          "Create an Everend PathBranching story before adding events.",
        );
        return;
      }

      const sourceNode = nodes.find((node) => node.id === sourceNodeId);
      if (!sourceNode) {
        setMessage("Connection source could not be resolved.");
        return;
      }

      const sourceKind = sourceNode.data.kind;
      const branchId =
        sourceKind === "branch" ? nodeStoryId(sourceNode) : undefined;
      const snap = settingsRef.current.canvasBackground;
      const snappedPosition = snapCanvasPoint(
        position,
        snap.snapToGrid,
        snap.gridSize,
      );
      const created = mutations.createEvent(
        currentProject,
        type,
        snappedPosition,
        branchId,
      );
      const targetEventId =
        created.selection?.type === "node"
          ? created.selection.id
          : created.project.events.find(
              (event) =>
                !currentProject.events.some(
                  (previousEvent) => previousEvent.id === event.id,
                ),
            )?.id;

      if (!targetEventId || created.project === currentProject) {
        setMessage(created.message ?? "Could not create a connected event.");
        return;
      }

      let nextProject = created.project;
      const sequenceId = activeSequenceId(nextProject);

      if (sourceKind === "start") {
        const sourceSequenceId =
          typeof sourceNode.data.details?.sequenceId === "string"
            ? sourceNode.data.details.sequenceId
            : nodeStoryId(sourceNode);
        if (!sourceSequenceId) {
          setMessage("Start node source could not be resolved.");
          return;
        }
        nextProject = {
          ...nextProject,
          sequences: nextProject.sequences.map((sequence) =>
            sequence.id === sourceSequenceId
              ? {
                  ...sequence,
                  entryEventId: targetEventId,
                  eventIds: withValue(sequence.eventIds, targetEventId),
                }
              : sequence,
          ),
        };
        commitCanvasAction("Created connected event", {
          project: nextProject,
          selection: {
            type: "edge",
            id: `edge:entry:${sourceNode.id}:${targetEventId}`,
          },
          message: "Created connected event.",
        });
        return;
      }

      if (sourceKind === "branch") {
        if (!branchId || !sequenceId) {
          setMessage("Branch connection could not be resolved.");
          return;
        }
        nextProject = {
          ...nextProject,
          sequences: nextProject.sequences.map((sequence) =>
            sequence.id === sequenceId
              ? {
                  ...sequence,
                  eventIds: withValue(sequence.eventIds, targetEventId),
                  branchIds: withValue(sequence.branchIds, branchId),
                }
              : sequence,
          ),
          branches: nextProject.branches.map((branch) =>
            branch.id === branchId
              ? {
                  ...branch,
                  eventIds: withValue(branch.eventIds, targetEventId),
                }
              : branch,
          ),
          events: nextProject.events.map((event) =>
            event.id === targetEventId
              ? { ...event, branchRef: branchId }
              : event,
          ),
        };
        commitCanvasAction("Created event in branch", {
          project: nextProject,
          selection: { type: "node", id: targetEventId },
          message: "Created event in branch.",
        });
        return;
      }

      if (sourceKind === "decision") {
        setMessage("Create the connection from a decision option port (A, B, C…).");
        return;
      }

      const sourceEventId = ownerEventIdForNode(sourceNode);
      const sourceEvent = sourceEventId
        ? findEvent(nextProject, sourceEventId)
        : undefined;
      if (!sourceEventId || !sourceEvent) {
        setMessage("Only events and outcomes can create runtime transitions.");
        return;
      }

      if (mutations.isTerminalEventType(nextProject, sourceEvent.type)) {
        setMessage("Terminal events cannot create outgoing transitions.");
        return;
      }

      const routeSourceId =
        sourceKind === "routeGate" &&
        typeof sourceNode.data.details?.routeSourceId === "string"
          ? sourceNode.data.details.routeSourceId
          : sourceNode.id;
      const transitionId = transitionFrom(routeSourceId, targetEventId, sourceEvent.transitions);
      const transition: Transition = {
        id: transitionId,
        from: sourceNode.data.kind === "outcome" ? sourceNode.id : routeSourceId === sourceNode.id ? sourceEventId : routeSourceId,
        to: targetEventId,
        source: "graph",
      };

      nextProject = {
        ...nextProject,
        sequences: sequenceId
          ? nextProject.sequences.map((sequence) =>
              sequence.id === sequenceId
                ? {
                    ...sequence,
                    eventIds: withValue(sequence.eventIds, targetEventId),
                  }
                : sequence,
            )
          : nextProject.sequences,
        events: nextProject.events.map((event) =>
          event.id === sourceEventId
            ? {
                ...event,
                transitions: [...(event.transitions ?? []), transition],
              }
            : event,
        ),
      };

      commitCanvasAction("Created connected event", {
        project: nextProject,
        selection: { type: "edge", id: `edge:transition:${transitionId}` },
        message: "Created connected event.",
      });
    },
    [commitCanvasAction, nodes],
  );

  const updateSequence = useCallback(
    (id: string, updates: Partial<Sequence>) => {
      if (!project) {
        return;
      }
      runCanvasMutation(mutations.updateSequence(project, id, updates));
    },
    [project, runCanvasMutation],
  );

  const updateBranch = useCallback(
    (id: string, updates: Partial<Branch>) => {
      if (!project) {
        return;
      }
      runCanvasMutation(mutations.updateBranch(project, id, updates));
    },
    [project, runCanvasMutation],
  );

  const assignEventBranch = useCallback(
    (eventId: string, branchId?: string) => {
      if (!project) {
        return;
      }
      runCanvasMutation(
        { project: assignEventToBranch(project, eventId, branchId) },
        "Updated event branch",
      );
    },
    [project, runCanvasMutation],
  );

  const updateEvent = useCallback(
    (id: string, updates: Partial<EventNode>) => {
      if (!project) {
        return;
      }
      if (eventDraft?.eventId === id) {
        setEventDraft((draft) => updateEventDraft(draft, updates));
        return;
      }
      runCanvasMutation(mutations.updateEvent(project, id, updates));
    },
    [eventDraft?.eventId, project, runCanvasMutation],
  );

  const createDecision = useCallback(
    (eventId: string) => {
      if (!project) {
        return;
      }
      if (eventDraft?.eventId === eventId) {
        const draftProject = applyEventDraftToProject(project, eventDraft);
        setEventDraft(undefined);
        runCanvasMutation(
          mutations.createDecision(draftProject, eventId),
          "Created decision",
        );
        return;
      }
      runCanvasMutation(mutations.createDecision(project, eventId));
    },
    [eventDraft, project, runCanvasMutation],
  );

  const createDialogue = useCallback(
    (eventId: string) => {
      if (!project) {
        return;
      }
      if (eventDraft?.eventId === eventId) {
        const draftProject = applyEventDraftToProject(project, eventDraft);
        setEventDraft(undefined);
        runCanvasMutation(
          mutations.createDialogue(draftProject, eventId),
          "Created dialogue",
        );
        return;
      }
      runCanvasMutation(
        mutations.createDialogue(project, eventId),
        "Created dialogue",
      );
    },
    [eventDraft, project, runCanvasMutation],
  );

  const updateDecision = useCallback(
    (eventId: string, decisionId: string, updates: Partial<Decision>) => {
      if (!project) {
        return;
      }
      if (eventDraft?.eventId === eventId) {
        mutateEventDraft((draftProject) =>
          mutations.updateDecision(draftProject, eventId, decisionId, updates),
        );
        return;
      }
      runCanvasMutation(
        mutations.updateDecision(project, eventId, decisionId, updates),
      );
    },
    [eventDraft?.eventId, mutateEventDraft, project, runCanvasMutation],
  );

  const updateDialogue = useCallback(
    (eventId: string, dialogueId: string, updates: Partial<DialogueNode>) => {
      if (!project) {
        return;
      }
      if (eventDraft?.eventId === eventId) {
        mutateEventDraft((draftProject) =>
          mutations.updateDialogue(draftProject, eventId, dialogueId, updates),
        );
        return;
      }
      runCanvasMutation(
        mutations.updateDialogue(project, eventId, dialogueId, updates),
      );
    },
    [eventDraft?.eventId, mutateEventDraft, project, runCanvasMutation],
  );

  const createDialogueBeat = useCallback(
    (eventId: string, dialogueId: string, kind: DialogueBeat["kind"]) => {
      if (!project) return;
      const sourceProject =
        eventDraft?.eventId === eventId
          ? applyEventDraftToProject(project, eventDraft)
          : project;
      if (eventDraft?.eventId === eventId) setEventDraft(undefined);
      runCanvasMutation(
        mutations.createDialogueBeat(sourceProject, eventId, dialogueId, kind),
        "Created dialogue beat",
      );
    },
    [eventDraft, project, runCanvasMutation],
  );

  const createEventDialogueBeat = useCallback(
    (eventId: string, kind: DialogueBeat["kind"]) => {
      if (!project) return;
      const sourceProject = eventDraft?.eventId === eventId
        ? applyEventDraftToProject(project, eventDraft)
        : project;
      if (eventDraft?.eventId === eventId) setEventDraft(undefined);
      runCanvasMutation(
        mutations.createEventDialogueBeat(sourceProject, eventId, kind),
        "Created dialogue beat",
      );
    },
    [eventDraft, project, runCanvasMutation],
  );

  const updateDialogueBeat = useCallback(
    (eventId: string, dialogueId: string, beatId: string, updates: Partial<DialogueBeat>) => {
      if (!project) return;
      runCanvasMutation(mutations.updateDialogueBeat(project, eventId, dialogueId, beatId, updates));
    },
    [project, runCanvasMutation],
  );

  const updateEventDialogueBeat = useCallback(
    (eventId: string, beatId: string, updates: Partial<DialogueBeat>) => {
      if (!project) return;
      runCanvasMutation(mutations.updateEventDialogueBeat(project, eventId, beatId, updates));
    },
    [project, runCanvasMutation],
  );

  const updateScriptBlock = useCallback(
    (scriptId: string, blockId: string, updates: Partial<ScriptBlock>) => {
      if (!project) return;
      runMutation(mutations.updateScriptBlock(project, scriptId, blockId, updates));
    },
    [project, runMutation],
  );

  const updateCharacterCategories = useCallback((categories: string[]) => {
    if (!project) return;
    const mappingId = "pathbranching:additional-characters";
    const mappings = project.integrationConfigOverride?.mappings ?? [];
    const nextMappings = categories.length
      ? [...mappings.filter((mapping) => mapping.id !== mappingId), {
        id: mappingId,
        classId: "class:Speaker",
        worldnotionTypes: categories,
        roles: ["speaker", "presentation"],
      }]
      : mappings.filter((mapping) => mapping.id !== mappingId);
    runMutation({
      project: {
        ...project,
        integrationConfigOverride: { specVersion: "0.1", mappings: nextMappings },
      },
      message: "Updated character categories.",
    });
  }, [project, runMutation]);

  // Script blocks edited through Assets are content assets and save immediately.
  // The same blocks edited from a canvas Speech Beat belong to that canvas edit
  // session and wait for the explicit Save Canvas action.
  const updateCanvasScriptBlock = useCallback(
    (scriptId: string, blockId: string, updates: Partial<ScriptBlock>) => {
      if (!project) return;
      runCanvasMutation(
        mutations.updateScriptBlock(project, scriptId, blockId, updates),
        "Updated speech beat",
      );
    },
    [project, runCanvasMutation],
  );

  const createScriptDocument = useCallback(() => {
    if (!project) return;
    runMutation(mutations.createScriptDocument(project));
  }, [project, runMutation]);

  const updateScriptDocument = useCallback((scriptId: string, updates: { name?: string }) => {
    if (!project) return;
    runMutation(mutations.updateScriptDocument(project, scriptId, updates));
  }, [project, runMutation]);

  const createScriptBlock = useCallback((scriptId: string, kind: ScriptBlock["kind"]) => {
    if (!project) return;
    runMutation(mutations.createScriptBlock(project, scriptId, kind));
  }, [project, runMutation]);

  const insertScriptBlock = useCallback((scriptId: string, blockId: string, eventId: string, dialogueId: string) => {
    if (!project) return;
    runMutation(mutations.linkScriptBlockToDialogue(project, scriptId, blockId, eventId, dialogueId));
  }, [project, runMutation]);

  const deleteDialogueBeat = useCallback(
    (eventId: string, dialogueId: string, beatId: string) => {
      if (!project) return;
      closeDeletedNodeInspector(`beat:${eventId}:${dialogueId}:${beatId}`);
      runCanvasMutation(mutations.deleteDialogueBeat(project, eventId, dialogueId, beatId));
    },
    [closeDeletedNodeInspector, project, runCanvasMutation],
  );

  const deleteEventDialogueBeat = useCallback(
    (eventId: string, beatId: string) => {
      if (!project) return;
      closeDeletedNodeInspector(`beat:${eventId}:${beatId}`);
      runCanvasMutation(mutations.deleteEventDialogueBeat(project, eventId, beatId));
    },
    [closeDeletedNodeInspector, project, runCanvasMutation],
  );

  const deleteDecision = useCallback(
    (eventId: string, decisionId: string) => {
      if (!project) {
        return;
      }
      if (eventDraft?.eventId === eventId) {
        closeDeletedNodeInspector(`decision:${eventId}:${decisionId}`);
        mutateEventDraft((draftProject) =>
          mutations.deleteDecision(draftProject, eventId, decisionId),
        );
        return;
      }
      closeDeletedNodeInspector(`decision:${eventId}:${decisionId}`);
      runCanvasMutation(mutations.deleteDecision(project, eventId, decisionId));
    },
    [closeDeletedNodeInspector, eventDraft?.eventId, mutateEventDraft, project, runCanvasMutation],
  );

  const deleteDialogue = useCallback(
    (eventId: string, dialogueId: string) => {
      if (!project) {
        return;
      }
      if (eventDraft?.eventId === eventId) {
        closeDeletedNodeInspector(`dialogue:${eventId}:${dialogueId}`);
        mutateEventDraft((draftProject) =>
          mutations.deleteDialogue(draftProject, eventId, dialogueId),
        );
        return;
      }
      closeDeletedNodeInspector(`dialogue:${eventId}:${dialogueId}`);
      runCanvasMutation(mutations.deleteDialogue(project, eventId, dialogueId));
    },
    [closeDeletedNodeInspector, eventDraft?.eventId, mutateEventDraft, project, runCanvasMutation],
  );

  const createOutcome = useCallback(
    (eventId: string, decisionId: string) => {
      if (!project) {
        return;
      }
      if (eventDraft?.eventId === eventId) {
        mutateEventDraft((draftProject) =>
          mutations.createOutcome(draftProject, eventId, decisionId),
        );
        return;
      }
      runCanvasMutation(mutations.createOutcome(project, eventId, decisionId));
    },
    [eventDraft?.eventId, mutateEventDraft, project, runCanvasMutation],
  );

  const updateOutcome = useCallback(
    (
      eventId: string,
      decisionId: string,
      outcomeId: string,
      updates: Partial<Outcome>,
    ) => {
      if (!project) {
        return;
      }
      if (eventDraft?.eventId === eventId) {
        mutateEventDraft((draftProject) =>
          mutations.updateOutcome(
            draftProject,
            eventId,
            decisionId,
            outcomeId,
            updates,
          ),
        );
        return;
      }
      runCanvasMutation(
        mutations.updateOutcome(
          project,
          eventId,
          decisionId,
          outcomeId,
          updates,
        ),
      );
    },
    [eventDraft?.eventId, mutateEventDraft, project, runCanvasMutation],
  );

  const deleteOutcome = useCallback(
    (eventId: string, decisionId: string, outcomeId: string) => {
      if (!project) {
        return;
      }
      if (eventDraft?.eventId === eventId) {
        mutateEventDraft((draftProject) =>
          mutations.deleteOutcome(draftProject, eventId, decisionId, outcomeId),
        );
        return;
      }
      runCanvasMutation(
        mutations.deleteOutcome(project, eventId, decisionId, outcomeId),
      );
    },
    [eventDraft?.eventId, mutateEventDraft, project, runCanvasMutation],
  );

  const updateTransition = useCallback(
    (transitionId: string, updates: Partial<Transition>) => {
      if (!project) {
        return;
      }
      if (
        eventDraft?.draftEvent.transitions?.some(
          (transition) => transition.id === transitionId,
        )
      ) {
        mutateEventDraft((draftProject) =>
          mutations.updateTransition(draftProject, transitionId, updates),
        );
        return;
      }
      runCanvasMutation(mutations.updateTransition(project, transitionId, updates));
    },
    [
      eventDraft?.draftEvent.transitions,
      mutateEventDraft,
      project,
      runCanvasMutation,
    ],
  );

  const deleteTransition = useCallback(
    (transitionId: string) => {
      if (!project) {
        return;
      }
      if (
        eventDraft?.draftEvent.transitions?.some(
          (transition) => transition.id === transitionId,
        )
      ) {
        mutateEventDraft((draftProject) =>
          mutations.deleteTransition(draftProject, transitionId),
        );
        return;
      }
      runCanvasMutation(mutations.deleteTransition(project, transitionId));
    },
    [
      eventDraft?.draftEvent.transitions,
      mutateEventDraft,
      project,
      runCanvasMutation,
    ],
  );

  const removeMissingEventReference = useCallback(
    (ownerId: string, missingEventId: string) => {
      if (!project) {
        return;
      }
      runCanvasMutation(
        mutations.removeMissingEventReference(project, ownerId, missingEventId),
      );
    },
    [project, runCanvasMutation],
  );

  const removeBoundaryBinding = useCallback(
    (bindingId: string) => {
      if (!project) {
        return;
      }
      runCanvasMutation(mutations.removeBoundaryBinding(project, bindingId));
    },
    [project, runCanvasMutation],
  );

  const normalizeTransitionOrder = useCallback(
    (sourceId: string) => {
      if (!project) return;
      runCanvasMutation(mutations.normalizeTransitionOrder(project, sourceId));
    },
    [project, runCanvasMutation],
  );

  const insertRouteGate = useCallback(
    (sourceId: string) => {
      if (!project) return;
      const scope = activeScope ?? activeCanvasScope(project);
      const scopeKey = scope ? canvasScopeKey(scope) : undefined;
      const currentSources = scopeKey
        ? project.canvas?.scopes?.[scopeKey]?.routeGateSources
        : project.canvas?.routeGateSources;
      if (currentSources?.includes(sourceId)) {
        setMessage("This connection already has a Route Gate.");
        return;
      }
      updateProject({
        ...project,
        canvas: {
          ...project.canvas,
          routeGateSources: scopeKey
            ? project.canvas?.routeGateSources
            : withValue(project.canvas?.routeGateSources, sourceId),
          scopes: scopeKey
            ? {
                ...(project.canvas?.scopes ?? {}),
                [scopeKey]: {
                  ...(project.canvas?.scopes?.[scopeKey] ?? {}),
                  routeGateSources: withValue(currentSources, sourceId),
                },
              }
            : project.canvas?.scopes,
        },
      });
    },
    [activeScope, project, updateProject],
  );

  const deleteScriptBlock = useCallback(
    (blockKey: string) => {
      if (!project) return;
      runMutation(mutations.deleteScriptBlock(project, blockKey));
    },
    [project, runMutation],
  );

  const deleteBoundaryEdge = useCallback(
    (edgeId: string) => {
      if (edgeId.startsWith("edge:boundary:")) {
        removeBoundaryBinding(edgeId.replace("edge:boundary:", ""));
        return;
      }
      if (!edgeId.startsWith("edge:dialogue-entry:") || activeScope?.kind !== "dialogue") {
        return;
      }
      const dialogueId = edgeId.replace("edge:dialogue-entry:", "");
      updateDialogue(activeScope.eventId, dialogueId, { entryBeatId: undefined });
    },
    [activeScope, removeBoundaryBinding, updateDialogue],
  );

  const createCanonSuggestion = useCallback(
    (
      canonRefId: string,
      source?: { eventId?: string; dataObjectId?: string },
    ) => {
      if (!project) {
        return;
      }
      runMutation(
        mutations.createCanonEditSuggestion(project, canonRefId, source),
      );
    },
    [project, runMutation],
  );

  const updateCanonSuggestion = useCallback(
    (id: string, updates: Partial<CanonEditSuggestion>) => {
      if (!project) {
        return;
      }
      runMutation(mutations.updateCanonEditSuggestion(project, id, updates));
    },
    [project, runMutation],
  );

  const deleteCanonSuggestion = useCallback(
    (id: string) => {
      if (!project) {
        return;
      }
      runMutation(mutations.deleteCanonEditSuggestion(project, id));
      setSelection(undefined);
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
      void commitStructuralAction("Updated event categories", {
        ...project,
        eventCategories,
      });
    },
    [commitStructuralAction, project],
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
        return nextNodes;
      });
    },
    [],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<StoryCanvasEdge>[]) => {
      setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges));
    },
    [],
  );

  const handleConnect = useCallback<OnConnect>(
    (connection: Connection) => {
      if (!project || !connection.source || !connection.target) {
        return;
      }

      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);
      const targetEventId =
        targetNode?.data.kind === "event" ? nodeStoryId(targetNode) : undefined;

      if (!sourceNode || !targetNode) {
        setMessage("Connection source or target could not be resolved.");
        return;
      }
      const decisionOutcomeSourceId =
        sourceNode.data.kind === "decision" && typeof connection.sourceHandle === "string"
          ? connection.sourceHandle
          : undefined;
      const routeSourceId =
        sourceNode.data.kind === "routeGate" &&
        typeof sourceNode.data.details?.routeSourceId === "string"
          ? sourceNode.data.details.routeSourceId
          : decisionOutcomeSourceId ?? sourceNode.id;

      const boundaryNode =
        sourceNode.data.kind === "boundary"
          ? sourceNode
          : targetNode.data.kind === "boundary"
            ? targetNode
            : undefined;
      if (activeScope?.kind === "dialogue" && boundaryNode) {
        const dialogue = project.events
          .find((event) => event.id === activeScope.eventId)
          ?.dialogues?.find((item) => item.id === activeScope.id);
        if (!dialogue) return;
        const direction = boundaryNode.data.details?.direction === "output" ? "output" : "input";
        const internalNode = boundaryNode.id === sourceNode.id ? targetNode : sourceNode;
        if (direction === "input") {
          const beat = internalNode.data.details?.beat as { id?: string } | undefined;
          if (boundaryNode.id !== sourceNode.id || !beat?.id) {
            setMessage("Dialogue entry must connect from Entry into a speech or direction beat.");
            return;
          }
          updateDialogue(activeScope.eventId, activeScope.id, { entryBeatId: beat.id });
          return;
        }
        if (boundaryNode.id !== targetNode.id) {
          setMessage("Dialogue exits connect from an internal node into Exit.");
          return;
        }
      }
      if (activeScope?.kind === "event" && boundaryNode) {
        const internalNode =
          boundaryNode.id === sourceNode.id ? targetNode : sourceNode;
        const direction =
          boundaryNode.data.details?.direction === "output"
            ? "output"
            : "input";
        if (direction === "input" && boundaryNode.id !== sourceNode.id) {
          setMessage(
            "Input ports connect from the boundary into an internal node.",
          );
          return;
        }
        if (direction === "output" && boundaryNode.id !== targetNode.id) {
          setMessage(
            "Output ports connect from an internal node into the boundary.",
          );
          return;
        }
        const route = mutations.createInternalTransition(
          project,
          activeScope.id,
          sourceNode.id,
          targetNode.id,
        );
        updateProject(route.project, route.selection);
        return;
      }

      if (activeScope?.kind === "event" || activeScope?.kind === "dialogue") {
        if (sourceNode.data.kind === "decision" && !decisionOutcomeSourceId) {
          setMessage("Connect from an outcome port (A, B, C…) on the Decision.");
          return;
        }
        const ownerEventId =
          activeScope.kind === "dialogue"
            ? activeScope.eventId
            : activeScope.id;
        const ownerEvent = findEvent(project, ownerEventId);
        if (!ownerEvent) return;
        const transitionId = transitionFrom(routeSourceId, targetNode.id, ownerEvent.transitions);
        const siblingCount = (ownerEvent.transitions ?? []).filter((item) => item.from === routeSourceId).length;
        const transition: Transition = {
          id: transitionId,
          from: routeSourceId,
          to: targetNode.id,
          order: siblingCount,
          mode: "conditional",
          source: "graph",
        };
        updateProject(
          {
            ...project,
            events: project.events.map((event) =>
              event.id === ownerEventId
                ? { ...event, transitions: [...(event.transitions ?? []), transition] }
                : event,
            ),
          },
          { type: "edge", id: `edge:transition:${transitionId}` },
        );
        return;
      }

      if (!targetEventId) {
        setMessage("Connections must target an event in this MVP.");
        return;
      }

      const sequenceId = activeSequenceId(project);
      const sourceKind = sourceNode.data.kind;

      if (sourceKind === "start") {
        const sourceSequenceId =
          typeof sourceNode.data.details?.sequenceId === "string"
            ? sourceNode.data.details.sequenceId
            : nodeStoryId(sourceNode);
        if (!sourceSequenceId) {
          setMessage("Start node source could not be resolved.");
          return;
        }
        updateProject(
          {
            ...project,
            sequences: project.sequences.map((sequence) =>
              sequence.id === sourceSequenceId
                ? {
                    ...sequence,
                    entryEventId: targetEventId,
                    eventIds: withValue(sequence.eventIds, targetEventId),
                  }
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
              branch.id === branchId
                ? {
                    ...branch,
                    eventIds: withValue(branch.eventIds, targetEventId),
                  }
                : branch,
            ),
            events: project.events.map((event) =>
              event.id === targetEventId
                ? { ...event, branchRef: branchId }
                : event,
            ),
          },
          { type: "node", id: targetEventId },
        );
        return;
      }

      const sourceEventId = ownerEventIdForNode(sourceNode);
      const sourceEvent = sourceEventId
        ? findEvent(project, sourceEventId)
        : undefined;
      if (!sourceEventId || !sourceEvent) {
        setMessage("Only events and outcomes can create runtime transitions.");
        return;
      }

      if (mutations.isTerminalEventType(project, sourceEvent.type)) {
        setMessage("Terminal events cannot create outgoing transitions.");
        return;
      }

      const transitionId = transitionFrom(routeSourceId, targetEventId, sourceEvent.transitions);
      const transition: Transition = {
        id: transitionId,
        from: decisionOutcomeSourceId ?? (sourceNode.data.kind === "outcome" ? sourceNode.id : sourceEventId),
        to: targetEventId,
        source: "graph",
      };

      updateProject(
        {
          ...project,
          sequences: sequenceId
            ? project.sequences.map((sequence) =>
                sequence.id === sequenceId
                  ? {
                      ...sequence,
                      eventIds: withValue(sequence.eventIds, targetEventId),
                    }
                  : sequence,
              )
            : project.sequences,
          events: project.events.map((event) =>
            event.id === sourceEventId
              ? {
                  ...event,
                  transitions: [...(event.transitions ?? []), transition],
                }
              : event,
          ),
        },
        { type: "edge", id: `edge:transition:${transitionId}` },
      );
    },
    [activeScope, nodes, project, updateDialogue, updateProject],
  );

  const handleNodeDragStop = useCallback(
    (_: MouseEvent | TouchEvent | ReactMouseEvent, node: StoryCanvasNode) => {
      if (!project) {
        return;
      }

      const storyId = nodeStoryId(node);
      if (!storyId) {
        return;
      }
      const snap = settingsRef.current.canvasBackground;
      const nextNode = {
        ...node,
        position: snapCanvasPoint(
          node.position,
          snap.snapToGrid,
          snap.gridSize,
        ),
      };
      const nextNodes = nodes.map((item) =>
        item.id === node.id ? nextNode : item,
      );
      const canvasProject = updateProjectCanvas(
        project,
        nextNodes,
        activeScope,
      );
      commitCanvasAction("Moved node", canvasProject, {
        type: "node",
        id: node.id,
      });
    },
    [activeScope, commitCanvasAction, nodes, project],
  );

  const updateEdgeLabel = useCallback(
    (edgeId: string, label: string) => {
      if (!project) {
        return;
      }
      const entryEdge = edges.find(
        (edgeItem) => edgeItem.id === edgeId && edgeItem.data?.kind === "entry",
      );
      if (entryEdge) {
        const sequenceId = entryEdge.source.startsWith("start:")
          ? entryEdge.source.slice("start:".length)
          : undefined;
        if (sequenceId && project.sequences.some((sequence) => sequence.id === sequenceId)) {
          updateProject({
            ...project,
            sequences: project.sequences.map((sequence) =>
              sequence.id === sequenceId ? { ...sequence, entryLabel: label } : sequence,
            ),
          });
          return;
        }
      }
      const transitionId = edgeId.startsWith("edge:transition:")
        ? edgeId.replace("edge:transition:", "")
        : undefined;
      if (!transitionId) {
        setEdges((currentEdges) =>
          currentEdges.map((edgeItem) =>
            edgeItem.id === edgeId
              ? {
                  ...edgeItem,
                  label,
                  data: edgeItem.data
                    ? { ...edgeItem.data, label }
                    : edgeItem.data,
                }
              : edgeItem,
          ),
        );
        return;
      }
      if (
        eventDraft?.draftEvent.transitions?.some(
          (transition) => transition.id === transitionId,
        )
      ) {
        mutateEventDraft((draftProject) =>
          mutations.updateTransition(draftProject, transitionId, { label }),
        );
        return;
      }
      updateProject({
        ...project,
        events: project.events.map((event) => ({
          ...event,
          transitions: event.transitions?.map((transition) =>
            transition.id === transitionId
              ? { ...transition, label }
              : transition,
          ),
        })),
      });
    },
    [
      edges,
      eventDraft?.draftEvent.transitions,
      mutateEventDraft,
      project,
      updateProject,
    ],
  );

  const resetLayout = useCallback(() => {
    if (!project) {
      return;
    }
    const layoutProject = applyCanvasLayoutToProject(
      project,
      settings.canvasLayout,
      {
        snapToGrid: settings.canvasBackground.snapToGrid,
        gridSize: settings.canvasBackground.gridSize,
      },
    );
    commitCanvasAction(
      `Applied ${settings.canvasLayout} layout`,
      layoutProject,
    );
  }, [
    commitCanvasAction,
    project,
    settings.canvasBackground.gridSize,
    settings.canvasBackground.snapToGrid,
    settings.canvasLayout,
  ]);

  const applyCanvasLayout = useCallback(
    (mode: CanvasLayoutMode) => {
      const normalizedMode = normalizeCanvasLayoutMode(mode);
      setSettings((current) => ({ ...current, canvasLayout: normalizedMode }));
      if (!project) {
        return;
      }
      const layoutProject = applyCanvasLayoutToProject(
        project,
        normalizedMode,
        {
          snapToGrid: settings.canvasBackground.snapToGrid,
          gridSize: settings.canvasBackground.gridSize,
        },
      );
      commitCanvasAction(
        `Applied ${normalizedMode} layout`,
        layoutProject,
      );
    },
    [
      commitCanvasAction,
      project,
      settings.canvasBackground.gridSize,
      settings.canvasBackground.snapToGrid,
    ],
  );

  const deleteSelection = useCallback(
    (targetSelection: Selection) => {
      if (!project || targetSelection.type !== "node") {
        return;
      }

      const id = targetSelection.id;
      const selectedNode = nodes.find((node) => node.id === id);
      if (
        (selectedNode?.data.kind === "speechBeat" || selectedNode?.data.kind === "directionBeat") &&
        typeof selectedNode.data.details?.eventId === "string"
      ) {
        const beat = selectedNode.data.details.beat as { id?: string } | undefined;
        const dialogueId = selectedNode.data.details?.dialogueId;
        if (beat?.id) {
          const eventId = selectedNode.data.details.eventId;
          closeDeletedNodeInspector(typeof dialogueId === "string" ? `beat:${eventId}:${dialogueId}:${beat.id}` : `beat:${eventId}:${beat.id}`);
          runCanvasMutation(typeof dialogueId === "string"
            ? mutations.deleteDialogueBeat(project, eventId, dialogueId, beat.id)
            : mutations.deleteEventDialogueBeat(project, eventId, beat.id));
          setSelection(undefined);
        }
        return;
      }
      if (
        selectedNode?.data.kind === "dialogue" &&
        typeof selectedNode.data.details?.eventId === "string"
      ) {
        const dialogue = selectedNode.data.details.dialogue as
          { id?: string } | undefined;
        if (dialogue?.id) {
          closeDeletedNodeInspector(`dialogue:${selectedNode.data.details.eventId}:${dialogue.id}`);
          runCanvasMutation(
            mutations.deleteDialogue(
              project,
              selectedNode.data.details.eventId,
              dialogue.id,
            ),
          );
          setSelection(undefined);
        }
        return;
      }
      if (
        selectedNode?.data.kind === "decision" &&
        typeof selectedNode.data.details?.eventId === "string"
      ) {
        const decision = selectedNode.data.details.decision as
          { id?: string } | undefined;
        if (decision?.id) {
          closeDeletedNodeInspector(`decision:${selectedNode.data.details.eventId}:${decision.id}`);
          runCanvasMutation(
            mutations.deleteDecision(
              project,
              selectedNode.data.details.eventId,
              decision.id,
            ),
          );
          setSelection(undefined);
        }
        return;
      }
      if (selectedNode?.data.kind === "missingRef") {
        const ownerId = selectedNode.data.details?.ownerId;
        const missingEventId = selectedNode.data.details?.missingEventId;
        if (typeof ownerId === "string" && typeof missingEventId === "string") {
          runCanvasMutation(
            mutations.removeMissingEventReference(
              project,
              ownerId,
              missingEventId,
            ),
          );
          setSelection(undefined);
        }
        return;
      }

      const sequence = findSequence(project, id);
      if (sequence) {
        if (
          project.entrySequenceId === sequence.id ||
          sequence.eventIds.length > 0
        ) {
          setMessage(
            "Sequence deletion is blocked while it is entry or still contains events.",
          );
          return;
        }
        const nextSequences = project.sequences.filter(
          (item) => item.id !== sequence.id,
        );
        updateProject(
          {
            ...project,
            sequences: nextSequences,
            canvas: {
              ...project.canvas,
              activeSequenceId:
                project.canvas?.activeSequenceId === sequence.id
                  ? nextSequences[0]?.id
                  : project.canvas?.activeSequenceId,
            },
          },
          nextSequences[0]
            ? { type: "node", id: nextSequences[0].id }
            : undefined,
        );
        return;
      }

      const branch = findBranch(project, id);
      if (branch) {
        if (branch.eventIds.length > 0) {
          setMessage(
            "Branch deletion is blocked while it still contains events.",
          );
          return;
        }
        updateProject(
          {
            ...project,
            branches: project.branches.filter((item) => item.id !== branch.id),
            sequences: project.sequences.map((item) => ({
              ...item,
              branchIds: withoutValue(item.branchIds, branch.id),
            })),
          },
          undefined,
        );
        setSelection(undefined);
        return;
      }

      const event = findEvent(project, id);
      if (event) {
        if ((event.childEventIds ?? []).length > 0) {
          setMessage(
            "Event deletion is blocked while it contains nested events.",
          );
          return;
        }
        const entryOwner = project.sequences.find(
          (item) => item.entryEventId === event.id,
        );
        if (entryOwner) {
          setMessage(
            `Event deletion is blocked while it is the entry event of "${entryOwner.name}".`,
          );
          return;
        }

        const removedTransitionIds = new Set(
          project.events.flatMap((item) =>
            (item.transitions ?? [])
              .filter(
                (transition) =>
                  transition.to === event.id || transition.from === event.id,
              )
              .map((transition) => transition.id),
          ),
        );

        updateProject(
          {
            ...project,
            sequences: project.sequences.map((item) => ({
              ...item,
              eventIds: withoutValue(item.eventIds, event.id),
            })),
            branches: project.branches.map((item) => ({
              ...item,
              eventIds: withoutValue(item.eventIds, event.id),
            })),
            events: project.events
              .filter((item) => item.id !== event.id)
              .map((item) => {
                const withoutParentLink =
                  item.id === event.parentEventId
                    ? {
                        ...item,
                        childEventIds: withoutValue(
                          item.childEventIds,
                          event.id,
                        ),
                      }
                    : item;
                return {
                  ...withoutParentLink,
                  transitions: (withoutParentLink.transitions ?? []).filter(
                    (transition) =>
                      transition.to !== event.id &&
                      transition.from !== event.id,
                  ),
                  boundaryBindings: (
                    withoutParentLink.boundaryBindings ?? []
                  ).filter(
                    (binding) =>
                      binding.nodeId !== event.id &&
                      !Array.from(removedTransitionIds).some((transitionId) =>
                        binding.portId.endsWith(`:${transitionId}`),
                      ),
                  ),
                };
              }),
          },
          undefined,
        );
        setSelection(undefined);
      }
    },
    [closeDeletedNodeInspector, nodes, project, runCanvasMutation, updateProject],
  );

  const deleteNodeSelections = useCallback(
    (nodeIds: string[]) => {
      if (!project) return;

      const selectedIds = new Set(nodeIds);
      const selectedNodes = nodes.filter((node) => selectedIds.has(node.id));
      let nextProject = project;
      let deletedCount = 0;

      for (const node of selectedNodes) {
        const eventId = node.data.details?.eventId;
        const dialogueId = node.data.details?.dialogueId;
        if (
          (node.data.kind === "speechBeat" || node.data.kind === "directionBeat") &&
          typeof eventId === "string"
        ) {
          const beat = node.data.details?.beat as { id?: string } | undefined;
          if (beat?.id) {
            closeDeletedNodeInspector(typeof dialogueId === "string" ? `beat:${eventId}:${dialogueId}:${beat.id}` : `beat:${eventId}:${beat.id}`);
            nextProject = (typeof dialogueId === "string"
              ? mutations.deleteDialogueBeat(nextProject, eventId, dialogueId, beat.id)
              : mutations.deleteEventDialogueBeat(nextProject, eventId, beat.id)).project;
            deletedCount += 1;
          }
        } else if (node.data.kind === "dialogue" && typeof eventId === "string") {
          const dialogue = node.data.details?.dialogue as { id?: string } | undefined;
          if (dialogue?.id) {
            closeDeletedNodeInspector(`dialogue:${eventId}:${dialogue.id}`);
            nextProject = mutations.deleteDialogue(nextProject, eventId, dialogue.id).project;
            deletedCount += 1;
          }
        } else if (node.data.kind === "decision" && typeof eventId === "string") {
          const decision = node.data.details?.decision as { id?: string } | undefined;
          if (decision?.id) {
            closeDeletedNodeInspector(`decision:${eventId}:${decision.id}`);
            nextProject = mutations.deleteDecision(nextProject, eventId, decision.id).project;
            deletedCount += 1;
          }
        } else if (node.data.kind === "missingRef") {
          const ownerId = node.data.details?.ownerId;
          const missingEventId = node.data.details?.missingEventId;
          if (typeof ownerId === "string" && typeof missingEventId === "string") {
            nextProject = mutations.removeMissingEventReference(nextProject, ownerId, missingEventId).project;
            deletedCount += 1;
          }
        }
      }

      const eventIds = selectedNodes
        .filter((node) => node.data.kind === "event")
        .map((node) => node.id)
        .filter((id) => {
          const event = findEvent(nextProject, id);
          return Boolean(event) &&
            (event?.childEventIds?.length ?? 0) === 0 &&
            !nextProject.sequences.some((sequence) => sequence.entryEventId === id);
        });
      if (eventIds.length > 0) {
        const removedEventIds = new Set(eventIds);
        const removedTransitionIds = new Set(
          nextProject.events.flatMap((event) =>
            (event.transitions ?? [])
              .filter((transition) => removedEventIds.has(transition.from) || removedEventIds.has(transition.to))
              .map((transition) => transition.id),
          ),
        );
        nextProject = {
          ...nextProject,
          sequences: nextProject.sequences.map((sequence) => ({
            ...sequence,
            eventIds: sequence.eventIds.filter((id) => !removedEventIds.has(id)),
          })),
          branches: nextProject.branches.map((branch) => ({
            ...branch,
            eventIds: branch.eventIds.filter((id) => !removedEventIds.has(id)),
          })),
          events: nextProject.events
            .filter((event) => !removedEventIds.has(event.id))
            .map((event) => ({
              ...event,
              childEventIds: event.childEventIds?.filter((id) => !removedEventIds.has(id)),
              transitions: (event.transitions ?? []).filter(
                (transition) => !removedEventIds.has(transition.from) && !removedEventIds.has(transition.to),
              ),
              boundaryBindings: (event.boundaryBindings ?? []).filter(
                (binding) => !removedEventIds.has(binding.nodeId) &&
                  !removedTransitionIds.has(binding.portId.split(":").at(-1) ?? ""),
              ),
            })),
        };
        eventIds.forEach((id) => closeDeletedNodeInspector(id));
        deletedCount += eventIds.length;
      }

      if (deletedCount === 0) {
        setMessage("The selected nodes cannot be deleted in their current state.");
        return;
      }
      setSelection(undefined);
      commitCanvasAction(
        `Deleted ${deletedCount} selected node${deletedCount === 1 ? "" : "s"}`,
        nextProject,
      );
    },
    [closeDeletedNodeInspector, commitCanvasAction, nodes, project],
  );

  useEffect(() => {
    const handleDeleteKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      const currentProject = projectRef.current;
      const currentSelection = selectionRef.current;
      if (!currentProject || !currentSelection) {
        return;
      }

      if (currentSelection.type === "node") {
        event.preventDefault();
        deleteSelection(currentSelection);
        return;
      }

      if (
        currentSelection.type === "edge" &&
        currentSelection.id.startsWith("edge:transition:")
      ) {
        event.preventDefault();
        deleteTransition(currentSelection.id.replace("edge:transition:", ""));
        setSelection(undefined);
        return;
      }

      if (
        currentSelection.type === "edge" &&
        (currentSelection.id.startsWith("edge:boundary:") ||
          currentSelection.id.startsWith("edge:dialogue-entry:"))
      ) {
        event.preventDefault();
        deleteBoundaryEdge(currentSelection.id);
        setSelection(undefined);
      }
    };

    window.addEventListener("keydown", handleDeleteKey, true);
    return () => window.removeEventListener("keydown", handleDeleteKey, true);
  }, [deleteBoundaryEdge, deleteSelection, deleteTransition]);

  const createKnowledgeObject = useCallback(() => {
    if (!project) {
      return;
    }

    const canonRefId = selection?.type === "canon" ? selection.id : undefined;
    const result = mutations.createKnowledgeObject(project, canonRefId);
    setDataOpen(true);
    runMutation(result, "Created knowledge object");
  }, [project, runMutation, selection]);

  const createDataObject = useCallback(
    (classId: string) => {
      if (!project) {
        return;
      }

      const canonRefId = selection?.type === "canon" ? selection.id : undefined;
      const result = mutations.createDataObject(project, classId, canonRefId);
      setDataOpen(true);
      runMutation(result, "Created data object");
    },
    [project, runMutation, selection],
  );

  const toggleCanon = useCallback(() => {
    setCanonOpen((open) => !open);
    setPanelCollapsed((current) => ({ ...current, assets: !current.assets }));
  }, []);

  const toggleFiles = useCallback(() => {
    setFilesOpen((open) => !open);
    setPanelCollapsed((current) => ({ ...current, outline: !current.outline }));
  }, []);

  const setPanelCollapsedState = useCallback(
    (panel: WorkspacePanelId, collapsed: boolean) => {
      setPanelCollapsed((current) => ({ ...current, [panel]: collapsed }));
      if (panel === "outline") setFilesOpen(!collapsed);
    },
    [],
  );

  const focusScriptBlock = useCallback(
    (target: { scriptId: string; blockId: string }) => {
      setPanelVisibility((current) => ({ ...current, assets: true }));
      setPanelCollapsedState("assets", false);
      setFocusedScriptBlock(undefined);
      window.requestAnimationFrame(() => setFocusedScriptBlock(target));
    },
    [setPanelCollapsedState],
  );

  const togglePanelVisibility = useCallback((panel: WorkspacePanelId) => {
    setPanelVisibility((current) => {
      const visible = !current[panel];
      if (visible) setPanelCollapsed((collapsed) => ({ ...collapsed, [panel]: false }));
      return { ...current, [panel]: visible };
    });
  }, []);

  const openPanelContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    const bounds = appShellRef.current?.getBoundingClientRect() ?? viewportBounds();
    setPanelContextMenu(
      clampFloatingMenuPosition(event.clientX, event.clientY, bounds, 205, 250),
    );
  }, []);

  const openLogicRule = useCallback((id: string) => {
    setSelectedLogicRuleId(id);
    setPanelVisibility((current) => ({ ...current, logic: true }));
    setPanelCollapsed((current) => ({ ...current, logic: false }));
  }, []);

  useEffect(() => {
    if (!panelContextMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (panelContextMenuRef.current?.contains(event.target as Node)) return;
      setPanelContextMenu(undefined);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanelContextMenu(undefined);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [panelContextMenu]);

  useEffect(() => {
    if (!settings.worldnotionBridge.connected || !isTauriRuntime()) {
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
          if (canvasDirty) void saveCanvas();
          else void saveActiveEventDraft();
          break;
        case "pb:file:save-as":
          if (canvasDirty) void saveCanvas();
          else void saveActiveEventDraft();
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
        case "pb:view:reload":
          window.location.reload();
          break;
        case "pb:view:workspace":
          setView("workspace");
          break;
        case "pb:view:toggle-canon":
        case "pb:view:toggle-explorer":
          togglePanelVisibility("assets");
          break;
        case "pb:view:toggle-files":
        case "pb:view:toggle-outline":
          togglePanelVisibility("outline");
          break;
        case "pb:view:toggle-data":
        case "pb:view:toggle-assets":
          togglePanelVisibility("assets");
          break;
        case "pb:view:toggle-logic":
          togglePanelVisibility("logic");
          break;
        case "pb:view:toggle-export":
          togglePanelVisibility("export");
          break;
        case "pb:view:toggle-connect":
          togglePanelVisibility("connect");
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
          setMessage(
            "Everend PathBranching 0.1.0 - branching narrative editor.",
          );
          break;
        case "pb:help:docs":
          setMessage(
            "Docs live in the Everend PathBranching README and docs folder for now.",
          );
          break;
      }
    })
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
          return;
        }
        unlisten = nextUnlisten;
      })
      .catch((listenError) => {
        if (!disposed) {
          setSettings((current) => ({
            ...current,
            worldnotionBridge: {
              ...current.worldnotionBridge,
              connected: false,
              lastCheckedAt: Date.now(),
              lastStatus: "error",
              lastMessage:
                listenError instanceof Error
                  ? listenError.message
                  : String(listenError),
            },
          }));
        }
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
    saveActiveEventDraft,
    saveCanvas,
    canvasDirty,
    settings.worldnotionBridge.connected,
    toggleCanon,
    toggleFiles,
    togglePanelVisibility,
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
        selectWithEventDraftGuard({
          type: "node",
          id: id.slice(eventPrefix.length),
        });
        return;
      }

      const branchPrefix = "file:branch:";
      if (id.startsWith(branchPrefix)) {
        selectWithEventDraftGuard({
          type: "node",
          id: id.slice(branchPrefix.length),
        });
        return;
      }

      const dataPrefix = "file:data-object:";
      if (id.startsWith(dataPrefix)) {
        selectWithEventDraftGuard({
          type: "dataObject",
          id: id.slice(dataPrefix.length),
        });
        setDataOpen(true);
        return;
      }

      const suggestionPrefix = "file:canon-suggestion:";
      if (id.startsWith(suggestionPrefix)) {
        selectWithEventDraftGuard({
          type: "canonSuggestion",
          id: id.slice(suggestionPrefix.length),
        });
        return;
      }

      selectWithEventDraftGuard({ type: "file", id });
    },
    [selectWithEventDraftGuard, setActiveSequence],
  );

  const resizeCanon = useCallback((width: number) => {
    setCanonWidth(clampExplorerWidth(width));
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
      theme={activeTheme}
      onUpdateEventCategories={updateEventCategories}
      onCanvasBackgroundChange={changeCanvasBackground}
      onNodeColorChange={changeNodeColors}
      onThemeChange={changeTheme}
      onToggleTheme={toggleTheme}
      onInspectorTabCloseSelectsNextChange={changeInspectorTabCloseSelectsNext}
          onCollapseInspectorTabOnCanvasClickChange={
            changeCollapseInspectorTabOnCanvasClick
          }
          onInspectorDebugEnabledChange={changeInspectorDebugEnabled}
      onConnectBridge={connectBridge}
      onVerifyBridge={verifyBridge}
      onDisconnectBridge={disconnectBridge}
      onOpenUniverse={openProject}
      onOpenRecentUniverse={openRecentProject}
      onRemoveRecentUniverse={removeRecentProject}
      onSaveUniverseProfile={saveUniverseProfile}
      onClose={() => setShowSettings(false)}
      suiteSettings={suiteChrome?.suiteSettings}
    />
  ) : null;

  const appDialogs = (
    <>
      <DiscardChangesDialog
        open={Boolean(discardDialog)}
        onDiscard={() => resolveDiscardDialog(true)}
        onCancel={() => resolveDiscardDialog(false)}
      />
      <EventDraftChangesDialog
        open={Boolean(eventDraftDialog)}
        description={
          eventDraftDialog?.kind === "closeInspectorTab"
            ? "This event has unsaved text or component edits. Save them before closing this inspector?"
            : eventDraftDialog?.kind === "loadInspectorGroup"
              ? "This event has unsaved text or component edits. Save them before loading this tab group?"
              : "This event has unsaved text or component edits. Save them before changing selection?"
        }
        onSave={() => void resolveEventDraftDialog("save")}
        onDiscard={() => void resolveEventDraftDialog("discard")}
        onCancel={() => void resolveEventDraftDialog("cancel")}
      />
      <NamePromptDialog
        open={Boolean(nameDialog)}
        title={nameDialog?.title ?? ""}
        label={nameDialog?.label ?? "Name"}
        initialValue={nameDialog?.initialValue}
        confirmLabel={
          nameDialog?.kind === "saveInspectorTabGroup"
            ? "Save"
            : nameDialog?.kind?.startsWith("rename")
              ? "Rename"
              : "Create"
        }
        onConfirm={confirmNameDialog}
        onCancel={() => setNameDialog(undefined)}
      />
      <ConfirmActionDialog
        open={Boolean(confirmDialog)}
        title={confirmDialog?.title ?? ""}
        message={confirmDialog?.message ?? ""}
        onConfirm={confirmActionDialog}
        onCancel={() => setConfirmDialog(undefined)}
      />
    </>
  );

  if (error) {
    return (
      <>
        <div className="app-shell">
          <Topbar
            fileState={fileState}
            exportOpen={exportOpen}
            theme={activeTheme}
            onOpenSettings={() => setShowSettings(true)}
            onRevealUniverse={revealUniverse}
            onToggleTheme={toggleTheme}
            onExportRuntime={exportRuntime}
            onHome={() => setView("home")}
            onUndo={undoProject}
            onRedo={redoProject}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            suiteChrome={suiteChrome}
          />
          {webPreviewBanner}
          <div className="error-state">{error}</div>
        </div>
        {settingsModal}
        {appDialogs}
      </>
    );
  }

  if (initialLoading) {
    return (
      <>
        <div className="app-shell">
          <Topbar
            fileState={fileState}
            exportOpen={exportOpen}
            theme={activeTheme}
            onOpenSettings={() => setShowSettings(true)}
            onRevealUniverse={revealUniverse}
            onToggleTheme={toggleTheme}
            onExportRuntime={exportRuntime}
            onHome={() => setView("home")}
            onUndo={undoProject}
            onRedo={redoProject}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
          suiteChrome={suiteChrome}
          />
          {webPreviewBanner}
          <div className="loading-state">
            {settings.lastOpenedProject
              ? "Loading last universe..."
              : "Preparing dashboard..."}
          </div>
        </div>
        {settingsModal}
        {appDialogs}
      </>
    );
  }

  if (view === "home" || !project) {
    return (
      <>
        <HomeDashboard
          project={project}
          workspace={workspace}
          fileState={fileState}
          settings={settings}
          missingRecentProjects={missingRecentProjects}
          findings={findings}
          theme={activeTheme}
          onOpenSettings={() => setShowSettings(true)}
          onToggleTheme={toggleTheme}
          onEnterWorkspace={() => setView("workspace")}
          onOpenProject={openProject}
          onOpenRecentProject={openRecentProject}
          onRemoveRecentProject={removeRecentProject}
          onExportRuntime={exportRuntime}
        />
        {webPreviewBanner}
        {settingsModal}
        {appDialogs}
      </>
    );
  }

  return (
    <>
      <div className="app-shell" ref={appShellRef}>
        <Topbar
          project={project}
          fileState={fileState}
          exportOpen={exportOpen}
          theme={activeTheme}
          onOpenSettings={() => setShowSettings(true)}
          onRevealUniverse={revealUniverse}
          onToggleTheme={toggleTheme}
          onExportRuntime={exportRuntime}
          onHome={() => setView("home")}
          onUndo={undoProject}
          onRedo={redoProject}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          recentActions={actionHistory}
          suiteChrome={suiteChrome}
          panelVisibility={panelVisibility}
          onTogglePanelVisibility={togglePanelVisibility}
        />
        {webPreviewBanner}

        <div
          className={`workspace ${panelResizing ? "resizing" : ""}`}
          style={{
            gridTemplateColumns: [
              panelVisibility.assets ? `${panelCollapsed.assets ? COLLAPSED_RAIL_WIDTH : DEFAULT_PANEL_WIDTH}px` : "",
              panelVisibility.logic ? `${panelCollapsed.logic ? COLLAPSED_RAIL_WIDTH : DEFAULT_PANEL_WIDTH}px` : "",
              panelVisibility.outline ? `${panelCollapsed.outline ? COLLAPSED_RAIL_WIDTH : storiesWidth}px` : "",
              "minmax(0, 1fr)",
              panelVisibility.player ? `${panelCollapsed.player ? COLLAPSED_RAIL_WIDTH : DEFAULT_PANEL_WIDTH}px` : "",
              panelVisibility.export ? `${panelCollapsed.export ? COLLAPSED_RAIL_WIDTH : DEFAULT_PANEL_WIDTH}px` : "",
              panelVisibility.connect ? `${panelCollapsed.connect ? COLLAPSED_RAIL_WIDTH : DEFAULT_PANEL_WIDTH}px` : "",
            ].filter(Boolean).join(" "),
          }}
        >
          {panelVisibility.assets ? <AssetsPanel
            project={project}
            collapsed={panelCollapsed.assets}
            onCollapsedChange={(collapsed) => setPanelCollapsedState("assets", collapsed)}
            onContextMenu={openPanelContextMenu}
            onImport={() => void importAssets()}
            onCreateScript={createScriptDocument}
            onUpdateScript={updateScriptDocument}
            onAddScriptBlock={createScriptBlock}
            onUpdateScriptBlock={updateScriptBlock}
            onInsertScriptBlock={insertScriptBlock}
            focusScriptBlock={focusedScriptBlock}
            selected={selection}
            onSelect={selectWithEventDraftGuard}
            onCreateEntity={createExplorerEntity}
            onDeleteEntity={deleteLocalExplorerEntity}
            onCreateType={createExplorerType}
          /> : null}
          {panelVisibility.logic ? <LogicPanel
            project={project}
            propertiesConfig={workspace?.canonIndex.propertiesConfig}
            collapsed={panelCollapsed.logic}
            onCollapsedChange={(collapsed) => setPanelCollapsedState("logic", collapsed)}
            onContextMenu={openPanelContextMenu}
            onUpdate={(nextProject) => updateProject(nextProject)}
            selected={selection}
            onSelect={selectWithEventDraftGuard}
            onCreateProperty={createExplorerProperty}
          /> : null}
          {panelVisibility.outline ? <FilesPanel
            project={project}
            files={files}
            stories={workspace?.manifest.stories ?? []}
            activeStoryId={workspace?.activeStory?.id}
            storyName={workspace?.activeStory?.name}
            open={!panelCollapsed.outline}
            selectedId={storyExplorerSelectionId(project, selection)}
            onToggle={() => setPanelCollapsedState("outline", !panelCollapsed.outline)}
            onResize={resizeStories}
            onResetWidth={() => setStoriesWidth(DEFAULT_PANEL_WIDTH)}
            onResizeStateChange={setPanelResizing}
            onSequenceChange={setActiveSequence}
            onStoryChange={setActiveStory}
            onCreateStory={requestCreateStory}
            onRenameStory={requestRenameStory}
            onDeleteStory={requestDeleteStory}
            onCreateSequence={requestCreateSequence}
            onRenameSequence={requestRenameSequence}
            onDeleteSequence={requestDeleteSequence}
            onUpdateSequence={updateSequence}
            onCreateBranch={() => createBranch()}
            onUpdateBranch={updateBranch}
            onDeleteBranch={(id) => deleteSelection({ type: "node", id })}
            onCreateEventInBranch={createEventInBranch}
            onAssignEventToBranch={assignEventBranch}
            onSelect={handleFileSelect}
            activeOutlineTab={storyOutlineTab}
            onOutlineTabChange={setStoryOutlineTab}
            onNavigatePathNode={navigatePathTreeNode}
            onContextMenu={openPanelContextMenu}
          /> : null}
          <StoryCanvas
            project={project}
            propertiesConfig={workspace?.canonIndex.propertiesConfig}
            files={files}
            nodes={nodes}
            edges={edges}
            selection={selection}
            findings={findings}
            message={message}
            activeScope={activeScope}
            exportOpen={exportOpen}
            exportPreviewMode={exportPreviewMode}
            dataOpen={dataOpen}
            markdownTabs={markdownTabs}
            activeMarkdownTabId={activeMarkdownTabId}
            eventDraft={eventDraft}
            eventInspector={eventInspector}
            eventInspectorTabGroups={eventInspectorTabGroups}
            inspectorTabs={inspectorTabs}
            expandedInspectorTabId={expandedInspectorTabId}
            inspectorMaximized={inspectorMaximized}
            canvasBackground={settings.canvasBackground}
            onCanvasBackgroundChange={changeCanvasBackground}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onNodeDragStop={handleNodeDragStop}
            onSelect={selectWithEventDraftGuard}
            onNavigateScope={navigateCanvasScope}
            onExportPreviewModeChange={setExportPreviewMode}
            onToggleData={() => setDataOpen((open) => !open)}
            onCreateEvent={createEvent}
            onCreateNestedEvent={createNestedEvent}
            onCreateConnectedEvent={createConnectedEvent}
            onUpdateSequence={updateSequence}
            onUpdateBranch={updateBranch}
            onCreateEventInBranch={createEventInBranch}
            onUpdateEvent={updateEvent}
            onCreateDecision={createDecision}
            onCreateDialogue={createDialogue}
            onCreateDialogueBeat={createDialogueBeat}
            onCreateEventDialogueBeat={createEventDialogueBeat}
            onUpdateDecision={updateDecision}
            onUpdateDialogue={updateDialogue}
            onUpdateDialogueBeat={updateDialogueBeat}
            onUpdateEventDialogueBeat={updateEventDialogueBeat}
            onUpdateScriptBlock={updateCanvasScriptBlock}
            onDeleteDialogueBeat={deleteDialogueBeat}
            onDeleteEventDialogueBeat={deleteEventDialogueBeat}
            onDeleteDecision={deleteDecision}
            onDeleteDialogue={deleteDialogue}
            onCreateOutcome={createOutcome}
            onUpdateOutcome={updateOutcome}
            onDeleteOutcome={deleteOutcome}
            onUpdateTransition={updateTransition}
            onRemoveMissingEventReference={removeMissingEventReference}
            onRemoveBoundaryBinding={removeBoundaryBinding}
            onNormalizeTransitionOrder={normalizeTransitionOrder}
            onInsertRouteGate={insertRouteGate}
            onDeleteScriptBlock={deleteScriptBlock}
            onFocusScriptBlock={focusScriptBlock}
            onDeleteTransition={deleteTransition}
            onCreateCanonSuggestion={createCanonSuggestion}
            onUpdateCanonSuggestion={updateCanonSuggestion}
            onDeleteCanonSuggestion={deleteCanonSuggestion}
            onCreateDataObject={createDataObject}
            onCreateKnowledgeObject={createKnowledgeObject}
            onUpdateDataObject={updateDataObject}
            onDeleteDataObject={deleteDataObject}
            onEditCanonRef={editCanonRefInBranch}
            onCreateCanonWorkingCopy={createCanonWorkingCopy}
            onSaveCanonWorkingCopy={saveCanonWorkingCopy}
            onExportCanonChangeSet={exportCanonChangeSet}
            onApplyCanonWorkingCopy={applyCanonWorkingCopy}
            onUpdateLocalExplorerEntity={updateLocalExplorerEntity}
            onPublishLocalExplorerEntity={publishLocalExplorerEntity}
            onUpdateLocalExplorerType={updateLocalExplorerType}
            onUpdateLocalExplorerProperty={updateLocalExplorerProperty}
            onUpdateLogicPropertyOverride={updateLogicPropertyOverride}
            onUpdateCharacterCategories={updateCharacterCategories}
            onUpdateEdgeLabel={updateEdgeLabel}
            onDeleteSelection={deleteSelection}
            onDeleteNodeSelections={deleteNodeSelections}
            onOpenRule={openLogicRule}
            onActivateMarkdownTab={setActiveMarkdownTabId}
            onCloseMarkdownTab={closeMarkdownTab}
            onChangeMarkdownContent={changeMarkdownContent}
            onChangeMarkdownFormat={changeMarkdownFormat}
            onSaveMarkdownTab={saveMarkdownTab}
            onOpenEventInspectorEvent={openEventInspectorForEvent}
            onCollapseEventInspectorEvent={collapseEventInspectorForEvent}
            collapseInspectorTabOnCanvasClick={
              settings.collapseInspectorTabOnCanvasClick
            }
            onCloseEventInspectorEvent={requestCloseEventInspectorForEvent}
            onCloseAllEventInspectorEvents={closeAllInspectorTabs}
            onCloseEventInspectorEventsAbove={closeInspectorTabsAbove}
            onCloseEventInspectorEventsBelow={closeInspectorTabsBelow}
            onCloseOtherEventInspectorEvents={closeOtherInspectorTabs}
            onPruneEventInspectorEvents={pruneEventInspectorEvents}
            onSaveEventInspectorTabGroup={requestSaveInspectorTabGroup}
            onLoadEventInspectorTabGroup={requestLoadInspectorTabGroup}
            onDeleteEventInspectorTabGroup={deleteInspectorTabGroup}
            onSaveEventDraft={() => void saveActiveEventDraft()}
            onOpenInspectorTab={openInspectorTab}
            onCloseInspectorTab={closeInspectorTab}
            onCloseAllInspectorTabs={() => {
              setInspectorTabs((current) => current.filter((tab) => tab.mode === "debug"));
              setExpandedInspectorTabId(undefined);
            }}
            onDisableInspectorDebug={() => changeInspectorDebugEnabled(false)}
            onToggleInspectorMaximized={() => setInspectorMaximized((current) => !current)}
          />
          {panelVisibility.player ? <PlayerPanel
            project={project}
            collapsed={panelCollapsed.player}
            onCollapsedChange={(collapsed) => setPanelCollapsedState("player", collapsed)}
            onContextMenu={openPanelContextMenu}
            onUpdate={(nextProject) => updateProject(nextProject)}
          /> : null}
          {panelVisibility.export ? <ExportPanel
            project={project}
            collapsed={panelCollapsed.export}
            onCollapsedChange={(collapsed) => setPanelCollapsedState("export", collapsed)}
            onContextMenu={openPanelContextMenu}
            onExport={(mode) => void exportRuntime(mode)}
          /> : null}
          {panelVisibility.connect ? <ConnectPanel
            collapsed={panelCollapsed.connect}
            onCollapsedChange={(collapsed) => setPanelCollapsedState("connect", collapsed)}
            onContextMenu={openPanelContextMenu}
          /> : null}
        </div>
        {panelContextMenu ? (
          <div
            ref={panelContextMenuRef}
            className="panel-picker panel-context-menu"
            role="menu"
            style={{ left: panelContextMenu.x, top: panelContextMenu.y }}
          >
            <strong>Panels</strong>
            {WORKSPACE_PANEL_IDS.map((panel) => (
              <button
                key={panel}
                type="button"
                role="menuitemcheckbox"
                aria-checked={panelVisibility[panel]}
                onClick={() => {
                  togglePanelVisibility(panel);
                }}
              >
                {panelVisibility[panel] ? "✓" : ""} {WORKSPACE_PANEL_LABELS[panel]}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {settingsModal}
      {appDialogs}
    </>
  );
}
