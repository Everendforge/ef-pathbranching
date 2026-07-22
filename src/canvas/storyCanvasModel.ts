import type { Edge, Node, Viewport } from "@xyflow/react";
import { speakerLabel } from "../speakerRoles.js";
import type {
  Branch,
  BranchingProject,
  CanvasScope,
  ConditionInput,
  Consequence,
  DialogueNode,
  EventNode,
  Outcome,
  ScriptRef,
  Transition,
  ValidationFinding,
} from "../domain.js";
import { conditionCount, conditionLabels, consequenceLabel, walkConditions } from "../logic.js";
import { presentConditionInput, presentConsequences, type LogicPresentation } from "../logicCapabilities.js";
import { blockValues, localizedValue } from "../localization.js";
import { activeCanvasScope, canvasScopeKey } from "../storySelection.js";
import { automaticNarrativeName } from "../narrativeNaming.js";
import type { AuthoringDisplaySettings, CanvasLayerMode } from "../workspaceSettings.js";

export type StoryCanvasNodeKind =
  | "sequence"
  | "start"
  | "boundary"
  | "workspace"
  | "endAdder"
  | "routeGate"
  | "branch"
  | "event"
  | "decision"
  | "dialogue"
  | "dialogueStart"
  | "speechBeat"
  | "directionBeat"
  | "outcome"
  | "inkSection"
  | "knowledge"
  | "runtimeAction"
  | "missingRef";

export type CanvasInfoBadge = {
  kind: "decisions" | "outcomes" | "dialogues" | "characters" | "words";
  count: number;
};

export type StoryCanvasEdgeKind =
  | "entry"
  | "boundary"
  | "contains"
  | "choice"
  | "transition"
  | "condition"
  | "consequence";

export type StoryCanvasNodeData = {
  kind: StoryCanvasNodeKind;
  title: string;
  subtitle?: string;
  storyObjectId: string;
  badges: string[];
  summaryBadges?: string[];
  infoBadges?: CanvasInfoBadge[];
  logicSummary?: {
    when: string;
    then: string;
    expanded: boolean;
    whenItems: LogicPresentation[];
    thenItems: LogicPresentation[];
    warningCount: number;
  };
  canvasLayerMode?: CanvasLayerMode;
  details?: Record<string, unknown>;
  collapsed?: boolean;
  isContainer?: boolean;
} & Record<string, unknown>;

export type StoryCanvasEdgeData = {
  kind: StoryCanvasEdgeKind;
  label: string;
  routeRole?: "flow" | "route";
  conditions?: ConditionInput;
  consequences?: Consequence[];
} & Record<string, unknown>;

export type StoryCanvasNode = Node<StoryCanvasNodeData, "story">;
export type StoryCanvasEdge = Edge<StoryCanvasEdgeData>;

export type SubcanvasWorkspaceBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  manual?: boolean;
};

export type PathBranchingFileItem = {
  id: string;
  label: string;
  detail?: string;
  group: "project" | "runtime" | "scripts" | "sequences" | "events" | "data" | "validation";
};

export type StoryCanvasModel = {
  nodes: StoryCanvasNode[];
  edges: StoryCanvasEdge[];
  files: PathBranchingFileItem[];
  viewport?: Viewport;
  activeSequenceId?: string;
};

type LayoutCursor = {
  sequenceY: number;
  branchY: number;
  eventY: number;
  decisionY: number;
  outcomeY: number;
  supportY: number;
};

const NODE_WIDTH = 230;
const BRANCH_WIDTH = 390;
const BRANCH_PADDING_TOP = 82;
const BRANCH_PADDING_X = 22;
const BRANCH_EVENT_GAP = 144;
const BRANCH_COLORS = ["#4f8cff", "#2da66f", "#c7832f", "#b062d6", "#d45d78", "#19a7a1", "#8d93ff", "#7ca83a"];
const EVENT_TYPE_COLORS: Record<string, string> = {
  normal: "#4f8cff",
  exploration: "#2da66f",
  final: "#d45d78",
};

export type StoryCanvasNodeColors = Partial<Record<StoryCanvasNodeKind, string>>;

export type StoryCanvasModelOptions = {
  nodeColors?: StoryCanvasNodeColors;
  scope?: CanvasScope;
  gridSize?: number;
  authoringDisplay?: AuthoringDisplaySettings;
  canvasLayerMode?: CanvasLayerMode;
};

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function paletteColor(id: string, palette: string[]) {
  return palette[hashString(id) % palette.length] ?? palette[0];
}

function nodeColor(kind: StoryCanvasNodeKind, options: StoryCanvasModelOptions | undefined) {
  return options?.nodeColors?.[kind];
}

function eventTypeColor(project: BranchingProject, eventNode: EventNode, options?: StoryCanvasModelOptions) {
  const category = project.eventCategories?.find((item) => item.id === eventNode.type);
  return category?.color ?? nodeColor("event", options) ?? EVENT_TYPE_COLORS[eventNode.type] ?? paletteColor(eventNode.type, BRANCH_COLORS);
}

function branchColor(branch: Branch | undefined, branchId: string | undefined | null, options?: StoryCanvasModelOptions) {
  return branch?.color ?? (branchId ? paletteColor(branchId, BRANCH_COLORS) : undefined) ?? nodeColor("branch", options);
}

function positionFor(project: BranchingProject, id: string, x: number, y: number, scope?: CanvasScope) {
  const scoped = scope ? project.canvas?.scopes?.[canvasScopeKey(scope)]?.nodes?.[id]?.position : undefined;
  return scoped ?? project.canvas?.nodes?.[id]?.position ?? { x, y };
}

function pushNode(
  project: BranchingProject,
  nodes: StoryCanvasNode[],
  id: string,
  kind: StoryCanvasNodeKind,
  title: string,
  subtitle: string | undefined,
  x: number,
  y: number,
  badges: string[] = [],
  details: Record<string, unknown> = {},
  options: {
    parentId?: string;
    width?: number;
    height?: number;
    isContainer?: boolean;
    nodeColors?: StoryCanvasNodeColors;
    summaryBadges?: string[];
    infoBadges?: CanvasInfoBadge[];
    scope?: CanvasScope;
    autoPosition?: boolean;
    draggable?: boolean;
    selectable?: boolean;
    zIndex?: number;
  } = {},
) {
  const persisted = project.canvas?.nodes?.[id];
  const scope = options.scope ?? activeCanvasScope(project);
  nodes.push({
    id,
    type: "story",
    position: options.autoPosition ? { x, y } : positionFor(project, id, x, y, scope),
    parentId: options.parentId,
    draggable: options.draggable,
    selectable: options.selectable,
    zIndex: options.zIndex ?? (kind === "workspace" ? 0 : kind === "routeGate" ? 3 : 2),
    data: {
      kind,
      title,
      subtitle,
      storyObjectId: id,
      badges,
      summaryBadges: options.summaryBadges,
      infoBadges: options.infoBadges,
      details,
      accentColor: typeof details.accentColor === "string" ? details.accentColor : nodeColor(kind, { nodeColors: options.nodeColors }),
      branchColor: typeof details.branchColor === "string" ? details.branchColor : undefined,
      minimapColor: typeof details.minimapColor === "string" ? details.minimapColor : undefined,
      collapsed: persisted?.collapsed,
      isContainer: options.isContainer,
    },
    width: options.width ?? NODE_WIDTH,
    height: options.height,
    style: options.width || options.height ? { width: options.width, height: options.height } : undefined,
  });
}

type CanvasLogicOwner = {
  logic?: {
    when?: ConditionInput;
    then?: Consequence[];
    rules?: Array<{ then?: Consequence[] }>;
  };
  availability?: ConditionInput;
  conditions?: ConditionInput;
  displayCondition?: ConditionInput;
  consequences?: Consequence[];
};

const LOGIC_NODE_KINDS = new Set<StoryCanvasNodeKind>([
  "sequence",
  "branch",
  "event",
  "decision",
  "dialogue",
  "dialogueStart",
  "speechBeat",
  "directionBeat",
  "outcome",
]);

function canvasLogicSummary(
  project: BranchingProject,
  kind: StoryCanvasNodeKind,
  details: Record<string, unknown>,
  expanded: boolean,
): StoryCanvasNodeData["logicSummary"] {
  if (!LOGIC_NODE_KINDS.has(kind)) return undefined;
  const owner = [
    details.sequence,
    details.branch,
    details.event,
    details.decision,
    details.dialogue,
    details.start,
    details.beat,
    details.outcome,
  ].find((candidate) => candidate && typeof candidate === "object") as CanvasLogicOwner | undefined;
  const when = owner?.logic?.when ?? owner?.availability ?? owner?.conditions ?? owner?.displayCondition;
  const effects = owner?.logic?.then ?? owner?.consequences ?? [];
  const ruleEffects = owner?.logic?.rules?.reduce((count, rule) => count + (rule.then?.length ?? 0), 0) ?? 0;
  const whenLabels = conditionLabels(when);
  const effectLabels = effects.map(consequenceLabel);
  const whenItems = presentConditionInput(project, when, expanded ? 3 : 2);
  const thenItems = presentConsequences(project, effects, expanded ? 3 : 2);
  const effectCount = effects.length + ruleEffects;
  return {
    when: whenLabels.length
      ? whenItems.map((item) => item.text).join(" · ") || whenLabels.slice(0, expanded ? 3 : 1).join(" · ")
      : "Always",
    then: effectCount
      ? thenItems.length
        ? `${effectCount} · ${thenItems.map((item) => item.text).join(" · ") || effectLabels.slice(0, 2).join(" · ")}`
        : `${effectCount} effect${effectCount === 1 ? "" : "s"}`
      : "No effects",
    expanded,
    whenItems,
    thenItems,
    warningCount: [...whenItems, ...thenItems].filter((item) => item.status !== "enabled").length,
  };
}

function applyCanvasLogicMode(
  project: BranchingProject,
  model: StoryCanvasModel,
  options: StoryCanvasModelOptions,
): StoryCanvasModel {
  const canvasLayerMode = options.canvasLayerMode ?? "visual";
  return {
    ...model,
    nodes: model.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        canvasLayerMode,
        logicSummary: canvasLayerMode === "logic"
          ? canvasLogicSummary(project, node.data.kind, node.data.details ?? {}, false)
          : undefined,
      },
    })),
    edges: model.edges.map((item) => item.data ? ({
      ...item,
      data: { ...item.data, canvasLayerMode },
      animated: canvasLayerMode === "logic" && item.data.routeRole === "route",
    }) : item),
  };
}

function edge(
  id: string,
  source: string,
  target: string,
  kind: StoryCanvasEdgeKind,
  label: string = kind,
  extra: Partial<StoryCanvasEdgeData> = {},
): StoryCanvasEdge {
  return {
    id,
    source,
    target,
    label,
    data: { kind, label, ...extra },
    animated: false,
  };
}

function transitionCanvasLabel(transition: Transition) {
  return transition.label?.trim() ?? "";
}

function transitionEdgeData(project: BranchingProject, transition: Transition): Partial<StoryCanvasEdgeData> {
  const role = transition.role ?? (
    transition.mode === "fallback" || transition.conditions || transition.logic?.when || transition.consequences?.length || transition.logic?.then?.length
      ? "route"
      : "flow"
  );
  const conditions = transition.logic?.when ?? transition.conditions;
  const consequences = transition.logic?.then ?? transition.consequences;
  const conditionSummary = conditionLabels(conditions).slice(0, 2);
  const consequenceSummary = (consequences ?? [])
    .map(consequenceLabel)
    .slice(0, 1);
  const conditionItems = presentConditionInput(project, conditions, 2);
  const consequenceItems = presentConsequences(project, consequences, 2);
  return {
    routeRole: role,
    conditions,
    consequences,
    order: transition.order ?? 0,
    mode: transition.mode ?? "conditional",
    customLabel: transition.label ?? "",
    routeSourceId: transition.from,
    routePreview: role === "route" ? {
      mode: transition.mode ?? "conditional",
      conditions: conditionItems.length ? conditionItems.map((item) => item.text) : conditionSummary,
      consequences: consequenceItems.length ? consequenceItems.map((item) => item.text) : consequenceSummary,
      conditionItems,
      consequenceItems,
      warningCount: [...conditionItems, ...consequenceItems].filter((item) => item.status !== "enabled").length,
    } : undefined,
  };
}

function decisionOutcomeNodeId(eventId: string, decisionId: string, outcomeId: string) {
  return `outcome:${eventId}:${decisionId}:${outcomeId}`;
}

function decisionOptions(eventId: string, decision: NonNullable<EventNode["decisions"]>[number]) {
  return decision.outcomes.map((outcome) => ({
    id: outcome.id,
    name: outcome.visibleText ?? outcome.name,
    visibleText: outcome.visibleText,
    description: outcome.description,
    icon: outcome.icon,
    handleId: decisionOutcomeNodeId(eventId, decision.id, outcome.id),
  }));
}

function visualTransitionSource(
  event: EventNode,
  transition: Transition,
): { nodeId: string; handleId?: string } {
  const decision = event.decisions?.find((candidate) =>
    candidate.outcomes.some(
      (outcome) => decisionOutcomeNodeId(event.id, candidate.id, outcome.id) === transition.from,
    ),
  );
  return decision
    ? { nodeId: `decision:${event.id}:${decision.id}`, handleId: transition.from }
    : { nodeId: transition.from };
}

function transitionEdge(
  project: BranchingProject,
  event: EventNode,
  transition: Transition,
): StoryCanvasEdge {
  const source = visualTransitionSource(event, transition);
  return {
    ...edge(
      `edge:transition:${transition.id}`,
      source.nodeId,
      transition.to,
      "transition",
      transitionCanvasLabel(transition),
      transitionEdgeData(project, transition),
    ),
    sourceHandle: source.handleId,
    animated: transition.role === "route",
  };
}

function insertRouteGates(
  project: BranchingProject,
  nodes: StoryCanvasNode[],
  edges: StoryCanvasEdge[],
  scope: CanvasScope | undefined,
  options: StoryCanvasModelOptions,
) {
  const transitionGroups = new Map<string, StoryCanvasEdge[]>();
  edges
    .filter((item) => item.data?.kind === "transition")
    .forEach((item) => {
      const routeSourceId =
        typeof item.data?.routeSourceId === "string"
          ? item.data.routeSourceId
          : item.source;
      transitionGroups.set(routeSourceId, [
        ...(transitionGroups.get(routeSourceId) ?? []),
        item,
      ]);
    });

  const ownerEventIdForSource = (routeSourceId: string) =>
    project.events.find((eventNode) =>
      eventNode.transitions?.some((transition) => transition.from === routeSourceId),
    )?.id ?? (scope?.kind === "event" ? scope.id : scope?.kind === "dialogue" ? scope.eventId : undefined);

  const insertGate = (routeSourceId: string, routes: StoryCanvasEdge[]) => {
    if (nodes.some((node) => node.id === `route-gate:${routeSourceId}`)) {
      return;
    }
    const sourceId = routes[0]?.source ?? routeSourceId;
    const source = nodes.find((node) => node.id === sourceId);
    if (!source) return;

    const gateId = `route-gate:${routeSourceId}`;
    const ownerEventId = ownerEventIdForSource(routeSourceId);
    const conditionalCount = routes.filter((route) => route.data?.conditions).length;
    const conditionBadges = Array.from(
      new Set(routes.flatMap((route) => conditionLabels(route.data?.conditions))),
    ).slice(0, 2);
    const consequenceBadges = Array.from(
      new Set(routes.flatMap((route) => (route.data?.consequences ?? []).map(consequenceLabel))),
    ).slice(0, 2);
    pushNode(
      project,
      nodes,
      gateId,
      "routeGate",
      "Conditions",
      routes.length ? `${routes.length} routes` : "No routes yet",
      source.position.x + NODE_WIDTH + 58,
      source.position.y + 4,
      [
        `${routes.length} routes`,
        ...(conditionalCount ? [`${conditionalCount} conditional`] : []),
        ...conditionBadges,
        ...consequenceBadges,
      ],
      {
        routeSourceId,
        eventId: ownerEventId,
        transitionIds: routes.map((route) => route.id),
        junctionPresentation: options.canvasLayerMode === "logic" ? "gate" : "split",
      },
      { nodeColors: options.nodeColors, scope, width: 168, height: 76 },
    );

    if (!routes.length) return;
    const sourceHandle = routes[0]?.sourceHandle;
    const orderedRoutes = [...routes].sort((left, right) => {
      if (left.data?.mode === "fallback" && right.data?.mode !== "fallback") return 1;
      if (right.data?.mode === "fallback" && left.data?.mode !== "fallback") return -1;
      return Number(left.data?.order ?? 0) - Number(right.data?.order ?? 0);
    });
    orderedRoutes.forEach((route, routeIndex) => {
      route.source = gateId;
      route.sourceHandle = undefined;
      if (route.data) {
        route.data.routeIndex = routeIndex;
        route.data.routeCount = orderedRoutes.length;
      }
    });
    edges.push({
      ...edge(`edge:route-gate:${routeSourceId}`, sourceId, gateId, "contains", ""),
      sourceHandle,
    });
  };

  transitionGroups.forEach((routes, routeSourceId) => {
    // A single route stays a direct line. In child canvases, a Route Gate is
    // introduced only for an actual split; authors can still insert one on any
    // individual transition from its context menu.
    if (routes.length >= 2) insertGate(routeSourceId, routes);
  });
}

function boundaryPortId(eventId: string, direction: "input" | "output", ownerId: string) {
  return `boundary:${eventId}:${direction}:${ownerId}`;
}

function canonLabel(project: BranchingProject, id: string) {
  const ref = project.canonRefs.find((canonRef) => canonRef.id === id);
  return ref?.kind ? `${ref.kind}: ${id}` : id;
}

function scriptSubtitle(script: ScriptRef) {
  return [script.format.toUpperCase(), script.entrySection ? `entry ${script.entrySection}` : undefined]
    .filter(Boolean)
    .join(" - ");
}

function logicBadges(availability: ConditionInput | undefined, consequenceCount = 0) {
  return [
    ...(conditionCount(availability) > 0 ? ["conditional"] : []),
    ...(consequenceCount > 0 ? [`${consequenceCount} effects`] : []),
  ];
}

function dataUseBadges(project: BranchingProject, input: ConditionInput | undefined) {
  const badges = new Set<string>();
  walkConditions(input, (condition) => {
    if (
      (condition.type === "dataObjectExists" || condition.type === "dataObjectField") &&
      project.projectDataObjects?.some((dataObject) => dataObject.id === condition.objectId)
    ) {
      badges.add("uses data");
    }
  });
  return Array.from(badges);
}

function activeSequence(project: BranchingProject) {
  const preferredId = project.canvas?.activeSequenceId ?? project.entrySequenceId ?? project.sequences[0]?.id;
  return project.sequences.find((sequence) => sequence.id === preferredId) ?? project.sequences[0];
}

function branchesForSequence(project: BranchingProject, sequenceId: string | undefined) {
  const sequence = project.sequences.find((item) => item.id === sequenceId);
  if (!sequence) {
    return [];
  }

  if (sequence.branchIds?.length) {
    const branchIds = new Set(sequence.branchIds);
    return project.branches.filter((branch) => branchIds.has(branch.id));
  }

  const sequenceEventIds = new Set(sequence.eventIds);
  return project.branches.filter((branch) =>
    branch.eventIds.some((eventId) => sequenceEventIds.has(eventId)) ||
    project.events.some((eventNode) => eventNode.branchRef === branch.id && sequenceEventIds.has(eventNode.id)),
  );
}

function eventBadges(project: BranchingProject, eventNode: EventNode) {
  const category = project.eventCategories?.find((item) => item.id === eventNode.type);
  const canonRefCount = eventNode.canonRefs?.length ?? 0;
  const categoryLabel = eventNode.type !== "normal"
    ? category?.label ?? eventNode.type
    : undefined;
  return [
    ...(categoryLabel ? [categoryLabel] : []),
    ...(canonRefCount > 0 ? [`${canonRefCount} refs`] : []),
    ...(eventNode.script ? ["ink"] : []),
    ...(eventNode.consequences?.length ? ["unlocks"] : []),
    ...logicBadges(eventNode.availability, eventNode.consequences?.length ?? 0),
    ...dataUseBadges(project, eventNode.availability),
  ];
}

function eventTextCounts(project: BranchingProject, eventNode: EventNode) {
  const primaryLocale = project.localizationCatalog?.primaryLocale ?? "und";
  const beats = [
    ...(eventNode.dialogueBeats ?? []),
    ...(eventNode.dialogues ?? []).flatMap((dialogue) => dialogue.beats ?? []),
  ];
  const seenBlocks = new Set<string>();
  return beats.reduce((counts, beat) => {
    const blockKey = `${beat.blockRef.scriptId}:${beat.blockRef.blockId}`;
    if (seenBlocks.has(blockKey)) return counts;
    seenBlocks.add(blockKey);
    const document = project.scriptDocuments?.find((candidate) => candidate.id === beat.blockRef.scriptId);
    const block = document?.blocks.find((candidate) => candidate.id === beat.blockRef.blockId);
    if (!block) return counts;
    const text = localizedValue(blockValues(project, beat.blockRef.scriptId, block, primaryLocale), primaryLocale, primaryLocale);
    return {
      words: counts.words + (text.trim() ? text.trim().split(/\s+/u).length : 0),
      characters: counts.characters + Array.from(text).length,
    };
  }, { words: 0, characters: 0 });
}

function authoringDisplaySettings(options: StoryCanvasModelOptions) {
  return {
    showDecisionCount: options.authoringDisplay?.showDecisionCount ?? true,
    showOutcomeCount: options.authoringDisplay?.showOutcomeCount ?? true,
    showDialogueCount: options.authoringDisplay?.showDialogueCount ?? true,
    showCharacterCount: options.authoringDisplay?.showCharacterCount ?? true,
    showWordCount: options.authoringDisplay?.showWordCount ?? false,
  };
}

function eventInfoBadges(project: BranchingProject, eventNode: EventNode, options: StoryCanvasModelOptions): CanvasInfoBadge[] {
  const display = authoringDisplaySettings(options);
  const decisionCount = eventNode.decisions?.length ?? 0;
  const outcomeCount = eventNode.decisions?.reduce((count, decision) => count + decision.outcomes.length, 0) ?? 0;
  const dialogueCount = (eventNode.dialogues?.length ?? 0) + (eventNode.dialogueBeats?.length ?? 0);
  const textCounts = eventTextCounts(project, eventNode);
  return [
    ...(display.showDecisionCount ? [{ kind: "decisions" as const, count: decisionCount }] : []),
    ...(display.showOutcomeCount && outcomeCount > 0 ? [{ kind: "outcomes" as const, count: outcomeCount }] : []),
    ...(display.showDialogueCount && dialogueCount > 0 ? [{ kind: "dialogues" as const, count: dialogueCount }] : []),
    ...(display.showCharacterCount && textCounts.characters > 0 ? [{ kind: "characters" as const, count: textCounts.characters }] : []),
    ...(display.showWordCount && textCounts.words > 0 ? [{ kind: "words" as const, count: textCounts.words }] : []),
  ];
}

function dialogueBadges(project: BranchingProject, dialogue: DialogueNode) {
  return [
    ...(dialogue.speakerRef ? ["speaker"] : []),
    ...(dialogue.canonRefs?.length ? [`${dialogue.canonRefs.length} refs`] : []),
    ...logicBadges(dialogue.availability, dialogue.consequences?.length ?? 0),
    ...dataUseBadges(project, dialogue.availability),
  ];
}

function parentLevelInboundTransitions(project: BranchingProject, eventId: string) {
  return project.events.flatMap((eventNode) =>
    (eventNode.transitions ?? [])
      .filter((transition) => transition.to === eventId)
      .map((transition) => ({ event: eventNode, transition })),
  );
}

function eventBranchLabel(project: BranchingProject, eventNode: EventNode) {
  const branch = eventNode.branchRef
    ? project.branches.find((candidate) => candidate.id === eventNode.branchRef)
    : undefined;
  return branch?.title ? `Branch · ${branch.title}` : "No branch";
}

function buildEventBoundaryPorts(project: BranchingProject, eventNode: EventNode) {
  const routeSubtitle = (event: EventNode | undefined) => {
    if (!event) return "Unavailable event";
    return eventBranchLabel(project, event);
  };
  const inbound = [
    ...parentLevelInboundTransitions(project, eventNode.id).map(({ event, transition }) => ({
      id: boundaryPortId(eventNode.id, "input", transition.id),
      direction: "input" as const,
      title: event.name,
      subtitle: routeSubtitle(event),
      transitionId: transition.id,
      targetEventId: undefined,
    })),
    ...project.sequences
      .filter((sequence) => sequence.entryEventId === eventNode.id)
      .map((sequence) => ({
        id: boundaryPortId(eventNode.id, "input", `sequence-entry:${sequence.id}`),
        direction: "input" as const,
        title: sequence.name || "Story entry",
        subtitle: "Sequence entry",
        transitionId: undefined,
        targetEventId: undefined,
      })),
  ];
  // Keep legacy Entry bindings addressable. They are still the source nodes
  // for existing Route Gates even when the visible incoming route is supplied
  // by a sequence start or another parent event.
  const preservedBoundInputs = Array.from(
    new Set(
      (eventNode.boundaryBindings ?? [])
        .filter((binding) => binding.direction === "input")
        .map((binding) => binding.portId),
    ),
  )
    .filter((portId) => !inbound.some((port) => port.id === portId))
    .map((portId) => ({
      id: portId,
      direction: "input" as const,
      title: inbound[0]?.title ?? "No incoming route",
      subtitle: inbound[0]?.subtitle ?? "Connect a parent event",
      transitionId: undefined,
      targetEventId: undefined,
    }));
  const allInbound = [...inbound, ...preservedBoundInputs];
  const outbound = (eventNode.transitions ?? [])
    .filter((transition) => transition.from === eventNode.id)
    .map((transition) => {
      const target = project.events.find((event) => event.id === transition.to);
      return {
        id: boundaryPortId(eventNode.id, "output", transition.id),
        slotId: undefined,
        direction: "output" as const,
        title: target?.name ?? transition.to,
        subtitle: routeSubtitle(target),
        transitionId: transition.id,
        targetEventId: transition.to,
      };
    });

  const scopeKey = canvasScopeKey({ kind: "event", id: eventNode.id });
  const exitSlots = project.canvas?.scopes?.[scopeKey]?.exitSlots ?? [];
  const emptySlotIds = outbound.length === 0
    ? exitSlots.length ? exitSlots : ["exit"]
    : exitSlots;
  const emptyOutputs = emptySlotIds.map((slotId) => ({
    id: boundaryPortId(eventNode.id, "output", slotId),
    slotId,
    direction: "output" as const,
    title: "Add End",
    subtitle: "Choose an existing or new event",
    transitionId: undefined,
    targetEventId: undefined,
  }));

  return {
    inbound: allInbound.length
      ? allInbound
      : [
          {
            id: boundaryPortId(eventNode.id, "input", "entry"),
            direction: "input" as const,
            title: "No incoming route",
            subtitle: "Connect a parent event",
            transitionId: undefined,
            targetEventId: undefined,
          },
        ],
    outbound: [...outbound, ...emptyOutputs],
  };
}

function boundaryPortPosition(
  nodes: StoryCanvasNode[],
  direction: "input" | "output",
  index: number,
  count: number,
) {
  const content = nodes.filter((node) => node.data.kind !== "boundary");
  const left = content.length
    ? Math.min(...content.map((node) => node.position.x))
    : 380;
  const right = content.length
    ? Math.max(...content.map((node) => node.position.x + (node.width ?? NODE_WIDTH)))
    : 610;
  const top = content.length
    ? Math.min(...content.map((node) => node.position.y))
    : 90;
  const bottom = content.length
    ? Math.max(...content.map((node) => node.position.y + (node.height ?? 108)))
    : 270;
  const centerY = (top + bottom) / 2;

  return {
    x: direction === "input" ? left - 250 : right + 72,
    y: centerY - 53 + (index - (count - 1) / 2) * 112,
  };
}

const SUBCANVAS_WORKSPACE_MIN_WIDTH = 720;
const SUBCANVAS_WORKSPACE_MIN_HEIGHT = 460;

function subcanvasGridPadding(gridSize = 24) {
  const padding = Math.max(1, gridSize);
  return { x: padding, y: padding };
}

function subcanvasContent(nodes: StoryCanvasNode[]) {
  return nodes.filter(
    (node) =>
      node.data.kind !== "boundary" &&
      node.data.kind !== "workspace" &&
      node.data.kind !== "endAdder",
  );
}

function boundsForNodes(nodes: StoryCanvasNode[], gridSize = 24): SubcanvasWorkspaceBounds {
  if (!nodes.length) {
    return { x: 220, y: 40, width: SUBCANVAS_WORKSPACE_MIN_WIDTH, height: SUBCANVAS_WORKSPACE_MIN_HEIGHT };
  }
  const left = Math.min(...nodes.map((node) => node.position.x));
  const right = Math.max(...nodes.map((node) => node.position.x + (node.width ?? NODE_WIDTH)));
  const top = Math.min(...nodes.map((node) => node.position.y));
  const bottom = Math.max(...nodes.map((node) => node.position.y + (node.height ?? 108)));
  const padding = subcanvasGridPadding(gridSize);
  const x = left - padding.x;
  const y = top - padding.y;
  return {
    x,
    y,
    width: Math.max(SUBCANVAS_WORKSPACE_MIN_WIDTH, right - left + padding.x * 2),
    height: Math.max(SUBCANVAS_WORKSPACE_MIN_HEIGHT, bottom - top + padding.y * 2),
  };
}

function expandedWorkspaceBounds(
  workspace: SubcanvasWorkspaceBounds,
  content: StoryCanvasNode[],
  gridSize = 24,
): SubcanvasWorkspaceBounds {
  if (!content.length) return workspace;
  const contentBounds = boundsForNodes(content, gridSize);
  const x = Math.min(workspace.x, contentBounds.x);
  const y = Math.min(workspace.y, contentBounds.y);
  const right = Math.max(workspace.x + workspace.width, contentBounds.x + contentBounds.width);
  const bottom = Math.max(workspace.y + workspace.height, contentBounds.y + contentBounds.height);
  return { x, y, width: right - x, height: bottom - y };
}

function boundaryPositionForWorkspace(
  workspace: SubcanvasWorkspaceBounds,
  direction: "input" | "output",
  index: number,
  count: number,
) {
  return {
    x: direction === "input" ? workspace.x - 210 : workspace.x + workspace.width,
    y: workspace.y + workspace.height / 2 - 53 + (index - (count - 1) / 2) * 112,
  };
}

export function layoutSubcanvasNodes(
  nodes: StoryCanvasNode[],
  options: { preserveWorkspace?: boolean; gridSize?: number } = {},
): StoryCanvasNode[] {
  const workspaceNode = nodes.find((node) => node.data.kind === "workspace");
  if (!workspaceNode) return nodes;

  const currentWorkspace = {
    x: workspaceNode.position.x,
    y: workspaceNode.position.y,
    width: workspaceNode.width ?? SUBCANVAS_WORKSPACE_MIN_WIDTH,
    height: workspaceNode.height ?? SUBCANVAS_WORKSPACE_MIN_HEIGHT,
  };
  const workspace = options.preserveWorkspace
    ? currentWorkspace
    : expandedWorkspaceBounds(currentWorkspace, subcanvasContent(nodes), options.gridSize);
  const inputs = nodes.filter(
    (node) => node.data.kind === "boundary" && node.data.details?.direction === "input",
  );
  const outputs = nodes.filter(
    (node) => node.data.kind === "boundary" && node.data.details?.direction === "output",
  );
  const endAdder = nodes.find((node) => node.data.kind === "endAdder");

  return nodes.map((node) => {
    if (node.id === workspaceNode.id) {
      return {
        ...node,
        position: { x: workspace.x, y: workspace.y },
        width: workspace.width,
        height: workspace.height,
        style: { ...node.style, width: workspace.width, height: workspace.height },
      };
    }
    if (node.data.kind === "endAdder") {
      const lastOutputPosition = boundaryPositionForWorkspace(
        workspace,
        "output",
        Math.max(outputs.length - 1, 0),
        Math.max(outputs.length, 1),
      );
      return {
        ...node,
        position: {
          x: lastOutputPosition.x + 246,
          y: lastOutputPosition.y + 122,
        },
      };
    }
    if (node.data.kind !== "boundary") return node;
    const direction = node.data.details?.direction === "output" ? "output" : "input";
    const ports = direction === "input" ? inputs : outputs;
    const index = ports.findIndex((port) => port.id === node.id);
    return {
      ...node,
      position: boundaryPositionForWorkspace(workspace, direction, index, ports.length),
    };
  });
}

function addSubcanvasWorkspace(
  project: BranchingProject,
  nodes: StoryCanvasNode[],
  scope: Extract<CanvasScope, { kind: "event" | "dialogue" }>,
  options: StoryCanvasModelOptions,
) {
  const savedBounds = project.canvas?.scopes?.[canvasScopeKey(scope)]?.workspace;
  const bounds = savedBounds?.manual
    ? savedBounds
      : savedBounds
      ? expandedWorkspaceBounds(savedBounds, subcanvasContent(nodes), options.gridSize)
      : boundsForNodes(subcanvasContent(nodes), options.gridSize);
  pushNode(
    project,
    nodes,
    `workspace:${canvasScopeKey(scope)}`,
    "workspace",
    "",
    undefined,
    bounds.x,
    bounds.y,
    [],
    { scope, minimapColor: "var(--wn-editor-bg)", minimapStrokeColor: "var(--wn-accent)" },
    {
      scope,
      autoPosition: true,
      draggable: false,
      // The working area is a visual guide, not a canvas item. Keeping it out
      // of React Flow's selectable set prevents marquee selection from
      // selecting the whole area when the user drags over its contents. The
      // resize handles opt back into pointer events in the node component.
      selectable: false,
      width: bounds.width,
      height: bounds.height,
      zIndex: 0,
    },
  );
  return layoutSubcanvasNodes(nodes, {
    preserveWorkspace: Boolean(savedBounds?.manual),
    gridSize: options.gridSize,
  });
}

function branchHeight(branch: Branch) {
  return Math.max(230, BRANCH_PADDING_TOP + Math.max(1, branch.eventIds.length) * BRANCH_EVENT_GAP + 24);
}

function addOutcomeNodes(
  project: BranchingProject,
  event: EventNode,
  outcome: Outcome,
  decisionId: string,
  outcomeIndex: number,
  nodes: StoryCanvasNode[],
  edges: StoryCanvasEdge[],
  cursor: LayoutCursor,
  options: StoryCanvasModelOptions,
) {
  const outcomeId = `outcome:${event.id}:${decisionId}:${outcome.id}`;
  const availability = outcome.availability ?? outcome.conditions;
  const badges = [
    ...conditionLabels(availability),
    ...(availability
      ? [outcome.unavailableBehavior === "hidden" ? "hidden when unavailable" : "locks when unavailable"]
      : []),
    ...(outcome.consequences ?? []).map(consequenceLabel),
    ...logicBadges(availability, outcome.consequences?.length ?? 0),
    ...dataUseBadges(project, availability),
  ];

  pushNode(
    project,
    nodes,
    outcomeId,
    "outcome",
    outcome.name,
    outcome.description ?? outcome.id,
    1040,
    cursor.outcomeY + outcomeIndex * 150,
    badges,
    { eventId: event.id, decisionId, outcome },
    { nodeColors: options.nodeColors },
  );

  edges.push(
    edge(`edge:choice:${decisionId}:${outcomeId}`, decisionId, outcomeId, "choice", "choice", {
      conditions: availability,
      consequences: outcome.consequences,
    }),
  );

}

function addEventSupportNodes(
  project: BranchingProject,
  eventNode: EventNode,
  nodes: StoryCanvasNode[],
  edges: StoryCanvasEdge[],
  cursor: LayoutCursor,
  options: StoryCanvasModelOptions,
) {
  if (eventNode.script) {
    const scriptNodeId = `ink:${eventNode.script.id}`;
    pushNode(
      project,
      nodes,
      scriptNodeId,
      "inkSection",
      eventNode.script.id,
      scriptSubtitle(eventNode.script),
      820,
      cursor.supportY,
      ["ink", eventNode.script.entrySection ?? "section"],
      { script: eventNode.script, eventId: eventNode.id },
      { nodeColors: options.nodeColors },
    );
    edges.push(edge(`edge:contains:${eventNode.id}:${scriptNodeId}`, eventNode.id, scriptNodeId, "contains", "script"));
    cursor.supportY += 150;
  }

  eventNode.decisions?.forEach((decision, decisionIndex) => {
    const decisionId = `decision:${eventNode.id}:${decision.id}`;
    pushNode(
      project,
      nodes,
      decisionId,
      "decision",
      decision.name,
      decision.description ?? decision.id,
      820,
      cursor.decisionY,
      [
        decision.type,
        `${decision.outcomes.length} outcomes`,
        ...logicBadges(decision.availability),
        ...(decision.availability
          ? [decision.unavailableBehavior === "hidden" ? "hidden when unavailable" : "locks when unavailable"]
          : []),
        ...dataUseBadges(project, decision.availability),
      ],
      { eventId: eventNode.id, decision, options: decisionOptions(eventNode.id, decision) },
      {
        nodeColors: options.nodeColors,
        width: 300,
      },
    );

    cursor.decisionY += Math.max(220, 108 + decision.outcomes.length * 62);
  });

}

function buildEventScopeModel(
  project: BranchingProject,
  scope: Extract<CanvasScope, { kind: "event" }>,
  options: StoryCanvasModelOptions,
): StoryCanvasModel {
  const nodes: StoryCanvasNode[] = [];
  const edges: StoryCanvasEdge[] = [];
  const eventNode = project.events.find((event) => event.id === scope.id);
  const viewport = project.canvas?.scopes?.[canvasScopeKey(scope)]?.viewport ?? project.canvas?.viewport;

  if (!eventNode) {
    return {
      nodes,
      edges,
      files: buildPathBranchingFiles(project),
      viewport,
      activeSequenceId: project.canvas?.activeSequenceId,
    };
  }

  const childIds = Array.from(
    new Set([
      ...(eventNode.childEventIds ?? []),
      ...project.events.filter((candidate) => candidate.parentEventId === eventNode.id).map((candidate) => candidate.id),
    ]),
  );
  const childEvents = childIds
    .map((eventId) => project.events.find((candidate) => candidate.id === eventId))
    .filter((candidate): candidate is EventNode => Boolean(candidate));
  const missingChildIds = childIds.filter((eventId) => !project.events.some((candidate) => candidate.id === eventId));

  missingChildIds.forEach((missingId, index) => {
    pushNode(
      project,
      nodes,
      missingId,
      "missingRef",
      "Missing Event",
      missingId,
      380 + ((childEvents.length + index) % 2) * 290,
      90 + Math.floor((childEvents.length + index) / 2) * 190,
      ["missing"],
      { ownerId: eventNode.id, missingEventId: missingId },
      { nodeColors: options.nodeColors, scope },
    );
  });

  childEvents.forEach((childEvent, index) => {
    pushNode(
      project,
      nodes,
      childEvent.id,
      "event",
      childEvent.name,
      eventBranchLabel(project, childEvent),
      380 + (index % 2) * 290,
      90 + Math.floor(index / 2) * 190,
      eventBadges(project, childEvent),
      {
        event: childEvent,
        parentEventId: eventNode.id,
        category: project.eventCategories?.find((category) => category.id === childEvent.type),
        terminal: childEvent.type === "final" || Boolean(project.eventCategories?.some((category) => category.id === childEvent.type && category.terminal)),
        accentColor: eventTypeColor(project, childEvent, options),
        minimapColor: eventTypeColor(project, childEvent, options),
      },
      {
        nodeColors: options.nodeColors,
        infoBadges: eventInfoBadges(project, childEvent, options),
        scope,
      },
    );

  });

  // Decisions and narrative beats are peers on the event canvas. `dialogueId`
  // remains readable for old files, but no longer changes where a decision lives.
  eventNode.decisions?.filter((decision) => !decision.dialogueId).forEach((decision, index) => {
    const decisionId = `decision:${eventNode.id}:${decision.id}`;
    pushNode(
      project,
      nodes,
      decisionId,
      "decision",
      decision.name,
      decision.description ?? decision.id,
      380,
      420 + index * 240,
      [
        decision.type,
        `${decision.outcomes.length} outcomes`,
        ...logicBadges(decision.availability),
        ...(decision.availability
          ? [decision.unavailableBehavior === "hidden" ? "hidden when unavailable" : "locks when unavailable"]
          : []),
        ...dataUseBadges(project, decision.availability),
      ],
      { eventId: eventNode.id, decision, options: decisionOptions(eventNode.id, decision) },
      {
        nodeColors: options.nodeColors,
        scope,
        width: 300,
      },
    );
  });

  const scriptBlocks = new Map(
    (project.scriptDocuments ?? []).flatMap((script) =>
      script.blocks.map((block) => [`${script.id}:${block.id}`, block] as const),
    ),
  );
  const eventBeats = (eventNode.dialogueBeats ?? []).map((beat) => ({ beat, dialogueId: undefined }));
  eventBeats.forEach(({ beat, dialogueId }, index) => {
    const block = scriptBlocks.get(`${beat.blockRef.scriptId}:${beat.blockRef.blockId}`);
    const nodeId = `beat:${eventNode.id}:${beat.id}`;
    const characterRef = block?.characterRef ?? block?.speakerRef;
    const speaker = speakerLabel(characterRef, project.canonRefs.find((ref) => ref.id === characterRef)?.label);
    pushNode(
      project,
      nodes,
      nodeId,
      beat.kind === "speech" ? "speechBeat" : "directionBeat",
      block?.content.trim().slice(0, 80) || automaticNarrativeName(
        project,
        eventNode.id,
        beat.kind === "speech" ? "Speech Beat" : "Director Direction",
        index + 1,
      ),
      beat.kind === "speech" ? speaker : "Stage direction",
      740,
      420 + index * 168,
      logicBadges(beat.displayCondition, beat.consequences?.length ?? 0),
      { eventId: eventNode.id, dialogueId, beat, block, isEventBeat: !dialogueId },
      { nodeColors: options.nodeColors, scope },
    );
  });

  eventNode.dialogues?.forEach((dialogue, index) => {
    const dialogueId = `dialogue:${eventNode.id}:${dialogue.id}`;
    pushNode(
      project,
      nodes,
      dialogueId,
      "dialogue",
      dialogue.title,
      `${dialogue.members?.length ?? dialogue.beats?.length ?? 0} items`,
      690,
      420 + index * 168,
      dialogueBadges(project, dialogue),
      { eventId: eventNode.id, dialogue },
      { nodeColors: options.nodeColors, scope },
    );
  });

  (eventNode.dialogueStarts ?? []).forEach((start, index) => {
    const sourceLabel = start.source?.kind === "canonRef"
      ? project.canonRefs.find((ref) => ref.id === start.source?.id)?.label ?? start.source.id
      : start.source?.kind === "dataObject"
        ? project.projectDataObjects?.find((item) => item.id === start.source?.id)?.name ?? start.source.id
        : undefined;
    const nodeId = `dialogue-start:${eventNode.id}:${start.id}`;
      pushNode(
      project,
      nodes,
      nodeId,
      "dialogueStart",
      "Dialogue Trigger",
      sourceLabel ?? "Choose an interactable source",
      410,
      250 + index * 120,
      logicBadges(start.availability, 0),
      { eventId: eventNode.id, start },
      { nodeColors: options.nodeColors, scope, width: 210, height: 88 },
    );
  });


  const ports = buildEventBoundaryPorts(project, eventNode);
  ports.inbound.forEach((port, index) => {
    const position = boundaryPortPosition(nodes, "input", index, ports.inbound.length);
    pushNode(
      project,
      nodes,
      port.id,
      "boundary",
      port.title,
      port.subtitle,
      position.x,
      position.y,
      [],
      { eventId: eventNode.id, direction: "input", transitionId: port.transitionId },
      {
        nodeColors: options.nodeColors,
        scope,
        autoPosition: true,
        draggable: false,
        width: 210,
        height: 106,
      },
    );
  });
  ports.outbound.forEach((port, index) => {
    const position = boundaryPortPosition(nodes, "output", index, ports.outbound.length);
    pushNode(
      project,
      nodes,
      port.id,
      "boundary",
      port.title,
      port.subtitle,
      position.x,
      position.y,
      [],
      {
        eventId: eventNode.id,
        direction: "output",
        transitionId: port.transitionId,
        targetEventId: port.targetEventId,
        slotId: port.slotId,
      },
      {
        nodeColors: options.nodeColors,
        scope,
        autoPosition: true,
        draggable: false,
        width: 210,
        height: 106,
      },
    );
  });
  pushNode(
    project,
    nodes,
    `end-adder:${eventNode.id}`,
    "endAdder",
    "",
    undefined,
    0,
    0,
    [],
    { eventId: eventNode.id },
    {
      scope,
      autoPosition: true,
      draggable: false,
      selectable: true,
      width: 36,
      height: 36,
      zIndex: 4,
    },
  );

  const dialogueOwnerByMember = new Map<string, string>();
  (eventNode.dialogues ?? []).forEach((dialogue) => {
    const containerId = `dialogue:${eventNode.id}:${dialogue.id}`;
    (dialogue.beats ?? []).forEach((beat) => dialogueOwnerByMember.set(`beat:${eventNode.id}:${beat.id}`, containerId));
    (eventNode.decisions ?? []).filter((decision) => decision.dialogueId === dialogue.id).forEach((decision) => dialogueOwnerByMember.set(`decision:${eventNode.id}:${decision.id}`, containerId));
  });

  eventNode.boundaryBindings?.forEach((binding) => {
    const projectedNodeId = dialogueOwnerByMember.get(binding.nodeId) ?? binding.nodeId;
    if (!nodes.some((node) => node.id === binding.portId) || !nodes.some((node) => node.id === projectedNodeId)) {
      return;
    }
    const source = binding.direction === "input" ? binding.portId : projectedNodeId;
    const target = binding.direction === "input" ? projectedNodeId : binding.portId;
    if (
      eventNode.transitions?.some(
        (transition) => transition.from === source && transition.to === target,
      )
    ) {
      return;
    }
    edges.push(edge(`edge:boundary:${binding.id}`, source, target, "boundary", binding.direction === "input" ? "enters" : "exits"));
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  eventNode.transitions?.forEach((transition) => {
    const source = visualTransitionSource(eventNode, transition);
    const projectedSource = dialogueOwnerByMember.get(source.nodeId) ?? source.nodeId;
    const projectedTarget = dialogueOwnerByMember.get(transition.to) ?? transition.to;
    if (projectedSource === projectedTarget) return;
    if (nodeIds.has(projectedSource) && nodeIds.has(projectedTarget)) {
      edges.push(transitionEdge(project, eventNode, {
        ...transition,
        from: projectedSource === source.nodeId ? transition.from : projectedSource,
        to: projectedTarget,
      }));
    }
  });

  insertRouteGates(project, nodes, edges, scope, options);
  const laidOutNodes = addSubcanvasWorkspace(project, nodes, scope, options);

  return {
    nodes: laidOutNodes,
    edges,
    files: buildPathBranchingFiles(project),
    viewport,
    activeSequenceId: project.canvas?.activeSequenceId,
  };
}

function buildDialogueScopeModel(
  project: BranchingProject,
  scope: Extract<CanvasScope, { kind: "dialogue" }>,
  options: StoryCanvasModelOptions,
): StoryCanvasModel {
  const nodes: StoryCanvasNode[] = [];
  const edges: StoryCanvasEdge[] = [];
  const eventNode = project.events.find((event) => event.id === scope.eventId);
  const dialogue = eventNode?.dialogues?.find((item) => item.id === scope.id);
  const viewport = project.canvas?.scopes?.[canvasScopeKey(scope)]?.viewport ?? project.canvas?.viewport;
  if (!eventNode || !dialogue) {
    return { nodes, edges, files: buildPathBranchingFiles(project), viewport };
  }

  const inputId = `dialogue-boundary:${eventNode.id}:${dialogue.id}:input`;
  const outputId = `dialogue-boundary:${eventNode.id}:${dialogue.id}:output`;
  const scriptBlocks = new Map(
    (project.scriptDocuments ?? []).flatMap((script) =>
      script.blocks.map((block) => [`${script.id}:${block.id}`, block] as const),
    ),
  );
  (dialogue.beats ?? []).forEach((beat, index) => {
    const block = scriptBlocks.get(`${beat.blockRef.scriptId}:${beat.blockRef.blockId}`);
    const nodeId = `beat:${eventNode.id}:${beat.id}`;
    const characterRef = block?.characterRef ?? block?.speakerRef;
    const speaker = speakerLabel(characterRef, project.canonRefs.find((ref) => ref.id === characterRef)?.label);
    pushNode(
      project,
      nodes,
      nodeId,
      beat.kind === "speech" ? "speechBeat" : "directionBeat",
      block?.content.trim().slice(0, 80) || automaticNarrativeName(
        project,
        eventNode.id,
        beat.kind === "speech" ? "Speech Beat" : "Director Direction",
        index + 1,
      ),
      beat.kind === "speech" ? speaker : "Stage direction",
      330 + (index % 2) * 310,
      90 + Math.floor(index / 2) * 175,
      logicBadges(beat.displayCondition, beat.consequences?.length ?? 0),
      { eventId: eventNode.id, dialogueId: dialogue.id, beat, block },
      { nodeColors: options.nodeColors, scope },
    );
  });


  (eventNode.decisions ?? []).filter((decision) => decision.dialogueId === dialogue.id).forEach((decision, index) => {
    const decisionId = `decision:${eventNode.id}:${decision.id}`;
    pushNode(
      project,
      nodes,
      decisionId,
      "decision",
      decision.name,
      decision.description ?? decision.id,
      340 + (index % 2) * 320,
      460 + Math.floor(index / 2) * 220,
      [
        decision.type,
        `${decision.outcomes.length} outcomes`,
        ...logicBadges(decision.availability),
        ...(decision.availability
          ? [decision.unavailableBehavior === "hidden" ? "hidden when unavailable" : "locks when unavailable"]
          : []),
      ],
      { eventId: eventNode.id, dialogueId: dialogue.id, decision, options: decisionOptions(eventNode.id, decision) },
      { nodeColors: options.nodeColors, scope, width: 300 },
    );
  });

  const inputPosition = boundaryPortPosition(nodes, "input", 0, 1);
  pushNode(
    project,
    nodes,
    inputId,
    "boundary",
    dialogue.title,
    "Opening beat",
    inputPosition.x,
    inputPosition.y,
    [],
    {
      eventId: eventNode.id,
      dialogueId: dialogue.id,
      direction: "input",
    },
    {
      nodeColors: options.nodeColors,
      scope,
      autoPosition: true,
      draggable: false,
      width: 210,
      height: 106,
    },
  );
  const outputPosition = boundaryPortPosition(nodes, "output", 0, 1);
  pushNode(
    project,
    nodes,
    outputId,
    "boundary",
    dialogue.title,
    "Closing route",
    outputPosition.x,
    outputPosition.y,
    [],
    {
      eventId: eventNode.id,
      dialogueId: dialogue.id,
      direction: "output",
    },
    {
      nodeColors: options.nodeColors,
      scope,
      autoPosition: true,
      draggable: false,
      width: 210,
      height: 106,
    },
  );

  const entryBeat = dialogue.entryBeatId
    ? `beat:${eventNode.id}:${dialogue.entryBeatId}`
    : undefined;
  if (entryBeat && nodes.some((node) => node.id === entryBeat)) {
    edges.push(edge(`edge:dialogue-entry:${dialogue.id}`, inputId, entryBeat, "boundary", "enters"));
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  (eventNode.transitions ?? []).forEach((transition) => {
    const source = visualTransitionSource(eventNode, transition);
    const sourceInside = nodeIds.has(source.nodeId);
    const targetInside = nodeIds.has(transition.to);
    if (sourceInside && targetInside) {
      edges.push(transitionEdge(project, eventNode, transition));
    } else if (sourceInside && !targetInside) {
      edges.push(transitionEdge(project, eventNode, { ...transition, to: outputId }));
    } else if (!sourceInside && targetInside && transition.to !== entryBeat) {
      edges.push(transitionEdge(project, eventNode, { ...transition, from: inputId }));
    }
  });

  insertRouteGates(project, nodes, edges, scope, options);
  const laidOutNodes = addSubcanvasWorkspace(project, nodes, scope, options);

  return {
    nodes: laidOutNodes,
    edges,
    files: buildPathBranchingFiles(project),
    viewport,
    activeSequenceId: project.canvas?.activeSequenceId,
  };
}

export function buildStoryCanvasModel(project: BranchingProject, options: StoryCanvasModelOptions = {}): StoryCanvasModel {
  const scope = options.scope ?? activeCanvasScope(project);
  if (scope?.kind === "dialogue") {
    return applyCanvasLogicMode(project, buildDialogueScopeModel(project, scope, options), options);
  }
  if (scope?.kind === "event") {
    return applyCanvasLogicMode(project, buildEventScopeModel(project, scope, options), options);
  }

  const nodes: StoryCanvasNode[] = [];
  const edges: StoryCanvasEdge[] = [];
  const sequence =
    scope?.kind === "sequence"
      ? project.sequences.find((candidate) => candidate.id === scope.id) ?? activeSequence(project)
      : activeSequence(project);
  const activeSequenceId = sequence?.id;
  const activeEventIds = new Set(sequence?.eventIds ?? []);
  const activeBranches = branchesForSequence(project, activeSequenceId);
  const activeEvents = project.events.filter((eventNode) => activeEventIds.has(eventNode.id));
  const eventIndexInSequence = new Map((sequence?.eventIds ?? []).map((eventId, index) => [eventId, index]));
  const cursor: LayoutCursor = {
    sequenceY: 80,
    branchY: 80,
    eventY: 80,
    decisionY: 80,
    outcomeY: 80,
    supportY: 320,
  };

  if (sequence) {
    const startNodeId = `start:${sequence.id}`;
    pushNode(
      project,
      nodes,
      startNodeId,
      "start",
      sequence.name || "Start",
      undefined,
      80,
      cursor.sequenceY,
      [],
      {
        sequenceId: sequence.id,
        sequenceEntryEventId:
          sequence.entryEventId && activeEventIds.has(sequence.entryEventId)
            ? sequence.entryEventId
            : undefined,
      },
      { nodeColors: options.nodeColors, scope },
    );
    cursor.sequenceY += 190;
  }

  activeEvents.forEach((eventNode) => {
    const sequenceIndex = eventIndexInSequence.get(eventNode.id) ?? 0;
    const branch = eventNode.branchRef ? activeBranches.find((item) => item.id === eventNode.branchRef) : undefined;
    const sequenceEntry = sequence?.entryEventId === eventNode.id;
    const eventX = sequenceEntry ? 320 : 360;
    const eventY = sequenceEntry ? cursor.sequenceY : cursor.eventY + sequenceIndex * 220;
    pushNode(
      project,
      nodes,
      eventNode.id,
      "event",
      eventNode.name,
      eventBranchLabel(project, eventNode),
      eventX,
      eventY,
      eventBadges(project, eventNode),
      {
        event: eventNode,
        branch,
        category: project.eventCategories?.find((category) => category.id === eventNode.type),
        terminal: eventNode.type === "final" || Boolean(project.eventCategories?.some((category) => category.id === eventNode.type && category.terminal)),
        accentColor: branchColor(branch, eventNode.branchRef, options) ?? "#ffffff",
        branchColor: branchColor(branch, eventNode.branchRef, options),
        typeColor: eventTypeColor(project, eventNode, options),
        minimapColor: branchColor(branch, eventNode.branchRef, options) ?? eventTypeColor(project, eventNode, options),
        sequenceEntry,
        showEventOverview: true,
      },
      {
        nodeColors: options.nodeColors,
        infoBadges: eventInfoBadges(project, eventNode, options),
        scope,
      },
    );

  });

  if (sequence?.entryEventId && activeEventIds.has(sequence.entryEventId)) {
    edges.push(
      edge(
        `edge:entry:start:${sequence.id}:${sequence.entryEventId}`,
        `start:${sequence.id}`,
        sequence.entryEventId,
        "entry",
        sequence.entryLabel?.trim() ?? "",
      ),
    );
  }

  activeEvents.forEach((eventNode) => {
    eventNode.transitions?.forEach((transition) => {
      if (!nodes.some((node) => node.id === eventNode.id) || !activeEventIds.has(transition.to)) {
        return;
      }
      edges.push(
        edge(
          `edge:transition:${transition.id}`,
          eventNode.id,
          transition.to,
          "transition",
          transitionCanvasLabel(transition),
          transitionEdgeData(project, transition),
        ),
      );
    });
  });

  insertRouteGates(project, nodes, edges, scope, options);

  const missingEventIds = (sequence?.eventIds ?? []).filter((eventId) => !project.events.some((candidate) => candidate.id === eventId));
  missingEventIds.forEach((missingId) => {
    const sequenceIndex = eventIndexInSequence.get(missingId) ?? 0;
    pushNode(
      project,
      nodes,
      missingId,
      "missingRef",
      "Missing Event",
      missingId,
      360,
      cursor.eventY + sequenceIndex * 220,
      ["missing"],
      { ownerId: sequence?.id, missingEventId: missingId },
      { nodeColors: options.nodeColors, scope },
    );
  });

  return applyCanvasLogicMode(project, {
    nodes,
    edges,
    files: buildPathBranchingFiles(project),
    viewport: scope ? project.canvas?.scopes?.[canvasScopeKey(scope)]?.viewport ?? project.canvas?.viewport : project.canvas?.viewport,
    activeSequenceId,
  }, options);
}

export function buildPathBranchingFiles(project: BranchingProject): PathBranchingFileItem[] {
  const projectLabel = project.storyId
    ? `${project.storyId}.pathbranching.json`
    : project.projectId
      ? `${project.projectId.replace(/^pathbranching:/, "")}.pathbranching.json`
      : "branching-story.pathbranching.json";

  return [
    {
      id: "file:project",
      label: projectLabel,
      detail: project.projectId,
      group: "project",
    },
    {
      id: "file:runtime",
      label: "runtime-package.json",
      detail: "Generated from validated BranchingProject",
      group: "runtime",
    },
    {
      id: "file:validation",
      label: "validation-report.json",
      detail: "Project and canvas findings",
      group: "validation",
    },
    ...project.sequences.map((sequence) => ({
      id: `file:sequence:${sequence.id}`,
      label: sequence.name,
      detail: sequence.id,
      group: "sequences" as const,
    })),
    ...project.events.map((eventNode) => ({
      id: `file:event:${eventNode.id}`,
      label: eventNode.name,
      detail: eventNode.id,
      group: "events" as const,
    })),
    ...project.scripts.map((script) => ({
      id: `file:script:${script.id}`,
      label: script.sourcePath ?? script.id,
      detail: script.compiledPath ?? script.format,
      group: "scripts" as const,
    })),
    ...(project.scriptDocuments ?? []).map((script) => ({
      id: `file:script-document:${script.id}`,
      label: script.name,
      detail: `${script.blocks.length} structured blocks`,
      group: "scripts" as const,
    })),
    ...(project.dataClasses ?? []).map((dataClass) => ({
      id: `file:data-class:${dataClass.id}`,
      label: dataClass.label,
      detail: dataClass.id,
      group: "data" as const,
    })),
    ...(project.projectDataObjects ?? []).map((dataObject) => ({
      id: `file:data-object:${dataObject.id}`,
      label: dataObject.name,
      detail: dataObject.classId,
      group: "data" as const,
    })),
    ...(project.projectionRules ?? []).map((rule) => ({
      id: `file:projection:${rule.id}`,
      label: rule.label ?? rule.id,
      detail: `${rule.from.layer} to ${rule.to.layer}`,
      group: "data" as const,
    })),
  ];
}

export function validateStoryCanvasEdges(nodes: StoryCanvasNode[], edges: StoryCanvasEdge[]): ValidationFinding[] {
  const nodeIds = new Set(nodes.map((node) => node.id));

  return edges.flatMap((canvasEdge) => {
    const findings: ValidationFinding[] = [];

    if (!nodeIds.has(canvasEdge.source)) {
      findings.push({
        code: "broken_transition",
        severity: "error",
        message: `Canvas edge "${canvasEdge.id}" has missing source node "${canvasEdge.source}".`,
        id: canvasEdge.id,
        ref: canvasEdge.source,
      });
    }

    if (!nodeIds.has(canvasEdge.target)) {
      findings.push({
        code: "broken_transition",
        severity: "error",
        message: `Canvas edge "${canvasEdge.id}" has missing target node "${canvasEdge.target}".`,
        id: canvasEdge.id,
        ref: canvasEdge.target,
      });
    }

    return findings;
  });
}
