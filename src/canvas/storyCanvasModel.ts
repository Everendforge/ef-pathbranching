import type { Edge, Node, Viewport } from "@xyflow/react";
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
import { activeCanvasScope, canvasScopeKey } from "../storySelection.js";

export type StoryCanvasNodeKind =
  | "sequence"
  | "start"
  | "boundary"
  | "routeGate"
  | "branch"
  | "event"
  | "decision"
  | "dialogue"
  | "speechBeat"
  | "directionBeat"
  | "outcome"
  | "inkSection"
  | "knowledge"
  | "runtimeAction"
  | "missingRef";

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
  details?: Record<string, unknown>;
  collapsed?: boolean;
  isContainer?: boolean;
} & Record<string, unknown>;

export type StoryCanvasEdgeData = {
  kind: StoryCanvasEdgeKind;
  label: string;
  conditions?: ConditionInput;
  consequences?: Consequence[];
} & Record<string, unknown>;

export type StoryCanvasNode = Node<StoryCanvasNodeData, "story">;
export type StoryCanvasEdge = Edge<StoryCanvasEdgeData>;

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
    scope?: CanvasScope;
  } = {},
) {
  const persisted = project.canvas?.nodes?.[id];
  const scope = options.scope ?? activeCanvasScope(project);
  nodes.push({
    id,
    type: "story",
    position: positionFor(project, id, x, y, scope),
    parentId: options.parentId,
    data: {
      kind,
      title,
      subtitle,
      storyObjectId: id,
      badges,
      summaryBadges: options.summaryBadges,
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
    animated: kind === "transition",
  };
}

function transitionCanvasLabel(transition: Transition) {
  return transition.label?.trim() ?? "";
}

function transitionEdgeData(transition: Transition): Partial<StoryCanvasEdgeData> {
  const conditionSummary = conditionLabels(transition.conditions).slice(0, 2);
  const consequenceSummary = (transition.consequences ?? [])
    .map(consequenceLabel)
    .slice(0, 1);
  return {
    conditions: transition.conditions,
    consequences: transition.consequences,
    order: transition.order ?? 0,
    mode: transition.mode ?? "conditional",
    customLabel: transition.label ?? "",
    routeSourceId: transition.from,
    routePreview: {
      mode: transition.mode ?? "conditional",
      conditions: conditionSummary,
      consequences: consequenceSummary,
    },
  };
}

function decisionOutcomeNodeId(eventId: string, decisionId: string, outcomeId: string) {
  return `outcome:${eventId}:${decisionId}:${outcomeId}`;
}

function decisionOptions(eventId: string, decision: NonNullable<EventNode["decisions"]>[number]) {
  return decision.outcomes.map((outcome) => ({
    id: outcome.id,
    name: outcome.name,
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
      transitionEdgeData(transition),
    ),
    sourceHandle: source.handleId,
  };
}

function insertRouteGates(
  project: BranchingProject,
  nodes: StoryCanvasNode[],
  edges: StoryCanvasEdge[],
  scope: CanvasScope | undefined,
  options: StoryCanvasModelOptions,
) {
  const scopeKey = scope ? canvasScopeKey(scope) : undefined;
  const manuallyInsertedSources = new Set(
    scopeKey
      ? project.canvas?.scopes?.[scopeKey]?.routeGateSources ?? []
      : project.canvas?.routeGateSources ?? [],
  );
  const routeGatesAreAutomatic = scope?.kind === "event" || scope?.kind === "dialogue";
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

  transitionGroups.forEach((routes, routeSourceId) => {
    // A single route stays a direct line. In child canvases, a Route Gate is
    // introduced only for an actual split; authors can still insert one on any
    // individual transition from its context menu.
    const shouldInsertAutomatically = routeGatesAreAutomatic && routes.length >= 2;
    if (!shouldInsertAutomatically && !manuallyInsertedSources.has(routeSourceId)) {
      return;
    }
    if (nodes.some((node) => node.id === `route-gate:${routeSourceId}`)) {
      return;
    }
    const sourceId = routes[0]?.source ?? routeSourceId;
    const source = nodes.find((node) => node.id === sourceId);
    if (!source) return;

    const gateId = `route-gate:${routeSourceId}`;
    const ownerEventId = project.events.find((eventNode) =>
      eventNode.transitions?.some((transition) => transition.from === routeSourceId),
    )?.id;
    const conditionalCount = routes.filter((route) => route.data?.conditions).length;
    pushNode(
      project,
      nodes,
      gateId,
      "routeGate",
      "Route Gate",
      `${routes.length} routes`,
      source.position.x + NODE_WIDTH + 58,
      source.position.y + 4,
      [
        `${routes.length} routes`,
        ...(conditionalCount ? [`${conditionalCount} conditional`] : []),
      ],
      { routeSourceId, eventId: ownerEventId, transitionIds: routes.map((route) => route.id) },
      { nodeColors: options.nodeColors, scope },
    );

    const sourceHandle = routes[0]?.sourceHandle;
    routes.forEach((route) => {
      route.source = gateId;
      route.sourceHandle = undefined;
    });
    edges.push({
      ...edge(`edge:route-gate:${routeSourceId}`, sourceId, gateId, "contains", ""),
      sourceHandle,
    });
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

function logicBadges(availability: ConditionInput | undefined, ruleSetCount = 0) {
  return [
    ...(conditionCount(availability) > 0 ? ["conditional"] : []),
    ...(ruleSetCount > 0 ? [`${ruleSetCount} rules`] : []),
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
  const terminal = eventNode.type === "final" || Boolean(category?.terminal);
  const canonRefCount = eventNode.canonRefs?.length ?? 0;
  return [
    ...(terminal ? ["terminal"] : []),
    ...(canonRefCount > 0 ? [`${canonRefCount} refs`] : []),
    ...(eventNode.script ? ["ink"] : []),
    ...(eventNode.decisions?.length ? [`${eventNode.decisions.length} decisions`] : []),
    ...(eventNode.unlocks?.length ? ["unlocks"] : []),
    ...logicBadges(eventNode.availability, eventNode.ruleSets?.length ?? 0),
    ...dataUseBadges(project, eventNode.availability),
  ];
}

function eventSummaryBadges(eventNode: EventNode) {
  const decisionCount = eventNode.decisions?.length ?? 0;
  const outcomeCount = eventNode.decisions?.reduce((count, decision) => count + decision.outcomes.length, 0) ?? 0;
  const dialogueCount = eventNode.dialogues?.length ?? 0;
  return [
    `${decisionCount} decision${decisionCount === 1 ? "" : "s"}`,
    ...(outcomeCount > 0 ? [`${outcomeCount} outcome${outcomeCount === 1 ? "" : "s"}`] : []),
    ...(dialogueCount > 0 ? [`${dialogueCount} dialogue${dialogueCount === 1 ? "" : "s"}`] : []),
  ];
}

function dialogueBadges(project: BranchingProject, dialogue: DialogueNode) {
  return [
    dialogue.speakerRef ? "speaker" : "dialogue",
    ...(dialogue.canonRefs?.length ? [`${dialogue.canonRefs.length} refs`] : []),
    ...logicBadges(dialogue.availability, dialogue.ruleSets?.length ?? 0),
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

function buildEventBoundaryPorts(project: BranchingProject, eventNode: EventNode) {
  const inbound = parentLevelInboundTransitions(project, eventNode.id).map(({ event, transition }) => ({
    id: boundaryPortId(eventNode.id, "input", transition.id),
    direction: "input" as const,
    title: "Entry",
    subtitle: `from ${event.name}`,
    transitionId: transition.id,
  }));
  const outbound = (eventNode.transitions ?? [])
    .filter((transition) => transition.from === eventNode.id)
    .map((transition) => ({
      id: boundaryPortId(eventNode.id, "output", transition.id),
      direction: "output" as const,
      title: "Exit",
      subtitle: `to ${project.events.find((event) => event.id === transition.to)?.name ?? transition.to}`,
      transitionId: transition.id,
    }));

  return {
    inbound: inbound.length
      ? inbound
      : [
          {
            id: boundaryPortId(eventNode.id, "input", "entry"),
            direction: "input" as const,
            title: "Entry",
            subtitle: "Event entry",
            transitionId: undefined,
          },
        ],
    outbound: outbound.length
      ? outbound
      : [
          {
            id: boundaryPortId(eventNode.id, "output", "exit"),
            direction: "output" as const,
            title: "Exit",
            subtitle: "Event exit",
            transitionId: undefined,
          },
        ],
  };
}

function branchHeight(branch: Branch) {
  return Math.max(230, BRANCH_PADDING_TOP + Math.max(1, branch.eventIds.length) * BRANCH_EVENT_GAP + 24);
}

function ensureKnowledgeNode(
  project: BranchingProject,
  nodes: StoryCanvasNode[],
  created: Set<string>,
  ref: string,
  x: number,
  y: number,
  options: StoryCanvasModelOptions,
) {
  const id = `knowledge:${ref}`;
  if (created.has(id)) {
    return id;
  }

  created.add(id);
  pushNode(project, nodes, id, "knowledge", ref, canonLabel(project, ref), x, y, ["canon"], { canonRef: ref }, { nodeColors: options.nodeColors });
  return id;
}

function addConsequenceNodes(
  project: BranchingProject,
  nodes: StoryCanvasNode[],
  edges: StoryCanvasEdge[],
  createdKnowledge: Set<string>,
  ownerId: string,
  ownerLabel: string,
  consequences: Consequence[] | undefined,
  cursor: LayoutCursor,
  options: StoryCanvasModelOptions,
) {
  consequences?.forEach((consequence, index) => {
    const id = `runtime-action:${ownerId}:${index}`;
    const title = consequenceLabel(consequence);
    const badges = [consequence.type];
    const ref =
      consequence.type === "unlockCanonEntry" && typeof consequence.ref === "string" ? consequence.ref : undefined;
    const dataObjectId =
      consequence.type === "unlockDataObject" && typeof consequence.objectId === "string" ? consequence.objectId : undefined;

    pushNode(project, nodes, id, "runtimeAction", title, ownerLabel, 1160, cursor.supportY, badges, { consequence }, { nodeColors: options.nodeColors });
    edges.push(edge(`edge:consequence:${ownerId}:${id}`, ownerId, id, "consequence", title, { consequences: [consequence] }));

    if (ref) {
      const knowledgeId = ensureKnowledgeNode(project, nodes, createdKnowledge, ref, 1440, cursor.supportY, options);
      edges.push(edge(`edge:consequence:${id}:${knowledgeId}`, id, knowledgeId, "consequence", "unlocks", { consequences: [consequence] }));
    }

    if (dataObjectId) {
      const dataObject = project.projectDataObjects?.find((object) => object.id === dataObjectId);
      const knowledgeId = ensureKnowledgeNode(project, nodes, createdKnowledge, dataObjectId, 1440, cursor.supportY, options);
      const targetNode = nodes.find((node) => node.id === knowledgeId);
      if (targetNode) {
        targetNode.data.title = dataObject?.name ?? dataObjectId;
        targetNode.data.subtitle = dataObject?.classId ?? "project data";
        targetNode.data.badges = ["data"];
      }
      edges.push(edge(`edge:consequence:${id}:${knowledgeId}`, id, knowledgeId, "consequence", "unlocks data", { consequences: [consequence] }));
    }

    cursor.supportY += 150;
  });
}

function addOutcomeNodes(
  project: BranchingProject,
  event: EventNode,
  outcome: Outcome,
  decisionId: string,
  outcomeIndex: number,
  nodes: StoryCanvasNode[],
  edges: StoryCanvasEdge[],
  createdKnowledge: Set<string>,
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
    ...logicBadges(availability, outcome.ruleSets?.length ?? 0),
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

  outcome.requiredCanonRefs?.forEach((ref, refIndex) => {
    const knowledgeId = ensureKnowledgeNode(project, nodes, createdKnowledge, ref, 1440, cursor.supportY + refIndex * 150, options);
    edges.push(edge(`edge:condition:${knowledgeId}:${outcomeId}`, knowledgeId, outcomeId, "condition", "requires"));
  });

  addConsequenceNodes(project, nodes, edges, createdKnowledge, outcomeId, outcome.name, outcome.consequences, cursor, options);
}

function addEventSupportNodes(
  project: BranchingProject,
  eventNode: EventNode,
  nodes: StoryCanvasNode[],
  edges: StoryCanvasEdge[],
  createdKnowledge: Set<string>,
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
      cursor.decisionY + decisionIndex * 190,
      [
        decision.type,
        `${decision.outcomes.length} outcomes`,
        ...logicBadges(decision.availability, decision.ruleSets?.length ?? 0),
        ...dataUseBadges(project, decision.availability),
      ],
      { eventId: eventNode.id, decision, options: decisionOptions(eventNode.id, decision) },
      {
        nodeColors: options.nodeColors,
        summaryBadges: [`${decision.outcomes.length} outcome${decision.outcomes.length === 1 ? "" : "s"}`],
        width: 300,
        height: Math.max(126, 74 + decision.outcomes.length * 44),
      },
    );

    cursor.decisionY += Math.max(190, decision.outcomes.length * 62);
  });

  addConsequenceNodes(project, nodes, edges, createdKnowledge, eventNode.id, eventNode.name, eventNode.unlocks, cursor, options);
}

function buildEventScopeModel(project: BranchingProject, scope: CanvasScope, options: StoryCanvasModelOptions): StoryCanvasModel {
  const nodes: StoryCanvasNode[] = [];
  const edges: StoryCanvasEdge[] = [];
  const eventNode = project.events.find((event) => event.id === scope.id);
  const createdKnowledge = new Set<string>();
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

  const ports = buildEventBoundaryPorts(project, eventNode);
  ports.inbound.forEach((port, index) => {
    pushNode(
      project,
      nodes,
      port.id,
      "boundary",
      port.title,
      port.subtitle,
      80,
      90 + index * 128,
      ["input"],
      { eventId: eventNode.id, direction: "input", transitionId: port.transitionId },
      { nodeColors: options.nodeColors, scope },
    );
  });
  ports.outbound.forEach((port, index) => {
    pushNode(
      project,
      nodes,
      port.id,
      "boundary",
      port.title,
      port.subtitle,
      1240,
      90 + index * 128,
      ["output"],
      { eventId: eventNode.id, direction: "output", transitionId: port.transitionId },
      { nodeColors: options.nodeColors, scope },
    );
  });

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
      childEvent.type,
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
        summaryBadges: eventSummaryBadges(childEvent),
        scope,
      },
    );

  });

  // Decisions and narrative beats are peers on the event canvas. `dialogueId`
  // remains readable for old files, but no longer changes where a decision lives.
  eventNode.decisions?.forEach((decision, index) => {
    const decisionId = `decision:${eventNode.id}:${decision.id}`;
    pushNode(
      project,
      nodes,
      decisionId,
      "decision",
      decision.name,
      decision.description ?? decision.id,
      380,
      420 + index * 168,
      [
        decision.type,
        `${decision.outcomes.length} outcomes`,
        ...logicBadges(decision.availability, decision.ruleSets?.length ?? 0),
        ...dataUseBadges(project, decision.availability),
      ],
      { eventId: eventNode.id, decision, options: decisionOptions(eventNode.id, decision) },
      {
        nodeColors: options.nodeColors,
        summaryBadges: [`${decision.outcomes.length} outcome${decision.outcomes.length === 1 ? "" : "s"}`],
        scope,
        width: 300,
        height: Math.max(126, 74 + decision.outcomes.length * 44),
      },
    );
  });

  const scriptBlocks = new Map(
    (project.scriptDocuments ?? []).flatMap((script) =>
      script.blocks.map((block) => [`${script.id}:${block.id}`, block] as const),
    ),
  );
  const eventBeats = [
    ...(eventNode.dialogueBeats ?? [])
      .filter((beat) => beat.kind === "speech")
      .map((beat) => ({ beat, dialogueId: undefined })),
    // Surface existing grouped beats here too, so older projects do not require
    // entering a dialogue canvas just to edit their narrative.
    ...(eventNode.dialogues ?? []).flatMap((dialogue) =>
      (dialogue.beats ?? [])
        .filter((beat) => beat.kind === "speech")
        .map((beat) => ({ beat, dialogueId: dialogue.id })),
    ),
  ];
  eventBeats.forEach(({ beat, dialogueId }, index) => {
    const block = scriptBlocks.get(`${beat.blockRef.scriptId}:${beat.blockRef.blockId}`);
    const nodeId = dialogueId
      ? `beat:${eventNode.id}:${dialogueId}:${beat.id}`
      : `beat:${eventNode.id}:${beat.id}`;
    const speaker = block?.speakerRef
      ? project.canonRefs.find((ref) => ref.id === block.speakerRef)?.label ?? block.speakerRef
      : undefined;
    pushNode(
      project,
      nodes,
      nodeId,
      "speechBeat",
      block?.content.trim().slice(0, 80) || "New speech",
      speaker ?? "Narrador",
      740,
      420 + index * 168,
      logicBadges(beat.displayCondition, beat.ruleSets?.length ?? 0),
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
      `${dialogue.beats?.length ?? 0} beats`,
      690,
      420 + index * 168,
      dialogueBadges(project, dialogue),
      { eventId: eventNode.id, dialogue },
      { nodeColors: options.nodeColors, scope },
    );
  });

  eventNode.boundaryBindings?.forEach((binding) => {
    if (!nodes.some((node) => node.id === binding.portId) || !nodes.some((node) => node.id === binding.nodeId)) {
      return;
    }
    const source = binding.direction === "input" ? binding.portId : binding.nodeId;
    const target = binding.direction === "input" ? binding.nodeId : binding.portId;
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
    if (nodeIds.has(source.nodeId) && nodeIds.has(transition.to)) {
      edges.push(transitionEdge(eventNode, transition));
    }
  });

  addConsequenceNodes(
    project,
    nodes,
    edges,
    createdKnowledge,
    eventNode.id,
    eventNode.name,
    eventNode.unlocks,
    {
      sequenceY: 80,
      branchY: 80,
      eventY: 80,
      decisionY: 80,
      outcomeY: 80,
      supportY: 720,
    },
    { ...options, scope },
  );

  insertRouteGates(project, nodes, edges, scope, options);

  return {
    nodes,
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
  pushNode(project, nodes, inputId, "boundary", "Entry", dialogue.title, 70, 120, ["input"], {
    eventId: eventNode.id,
    dialogueId: dialogue.id,
    direction: "input",
  }, { nodeColors: options.nodeColors, scope });
  pushNode(project, nodes, outputId, "boundary", "Exit", dialogue.title, 1120, 120, ["output"], {
    eventId: eventNode.id,
    dialogueId: dialogue.id,
    direction: "output",
  }, { nodeColors: options.nodeColors, scope });

  const scriptBlocks = new Map(
    (project.scriptDocuments ?? []).flatMap((script) =>
      script.blocks.map((block) => [`${script.id}:${block.id}`, block] as const),
    ),
  );
  (dialogue.beats ?? []).filter((beat) => beat.kind === "speech").forEach((beat, index) => {
    const block = scriptBlocks.get(`${beat.blockRef.scriptId}:${beat.blockRef.blockId}`);
    const nodeId = `beat:${eventNode.id}:${dialogue.id}:${beat.id}`;
    const speaker = block?.speakerRef
      ? project.canonRefs.find((ref) => ref.id === block.speakerRef)?.label ?? block.speakerRef
      : undefined;
    pushNode(
      project,
      nodes,
      nodeId,
      "speechBeat",
      block?.content.trim().slice(0, 80) || "New speech",
      speaker ?? "Narrador",
      330 + (index % 2) * 310,
      90 + Math.floor(index / 2) * 175,
      logicBadges(beat.displayCondition, beat.ruleSets?.length ?? 0),
      { eventId: eventNode.id, dialogueId: dialogue.id, beat, block },
      { nodeColors: options.nodeColors, scope },
    );
  });

  const entryBeat = dialogue.entryBeatId
    ? `beat:${eventNode.id}:${dialogue.id}:${dialogue.entryBeatId}`
    : undefined;
  if (entryBeat && nodes.some((node) => node.id === entryBeat)) {
    edges.push(edge(`edge:dialogue-entry:${dialogue.id}`, inputId, entryBeat, "boundary", "enters"));
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  (eventNode.transitions ?? []).forEach((transition) => {
    const source = visualTransitionSource(eventNode, transition);
    if (!nodeIds.has(source.nodeId) || !nodeIds.has(transition.to)) return;
    edges.push(transitionEdge(eventNode, transition));
  });

  insertRouteGates(project, nodes, edges, scope, options);

  return {
    nodes,
    edges,
    files: buildPathBranchingFiles(project),
    viewport,
    activeSequenceId: project.canvas?.activeSequenceId,
  };
}

export function buildStoryCanvasModel(project: BranchingProject, options: StoryCanvasModelOptions = {}): StoryCanvasModel {
  const scope = options.scope ?? activeCanvasScope(project);
  if (scope?.kind === "dialogue") {
    return buildDialogueScopeModel(project, scope, options);
  }
  if (scope?.kind === "event") {
    return buildEventScopeModel(project, scope, options);
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
      { sequenceId: sequence.id },
      { nodeColors: options.nodeColors, scope },
    );

    if (sequence.entryEventId && activeEventIds.has(sequence.entryEventId)) {
      edges.push(edge(`edge:entry:${startNodeId}:${sequence.entryEventId}`, startNodeId, sequence.entryEventId, "entry", sequence.entryLabel ?? "", {
        customLabel: sequence.entryLabel ?? "",
      }));
    }
    cursor.sequenceY += 190;
  }

  activeEvents.forEach((eventNode) => {
    const sequenceIndex = eventIndexInSequence.get(eventNode.id) ?? 0;
    const branch = eventNode.branchRef ? activeBranches.find((item) => item.id === eventNode.branchRef) : undefined;
    const eventX = 360;
    const eventY = cursor.eventY + sequenceIndex * 220;
    pushNode(
      project,
      nodes,
      eventNode.id,
      "event",
      eventNode.name,
      eventNode.type,
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
      },
      {
        nodeColors: options.nodeColors,
        summaryBadges: eventSummaryBadges(eventNode),
        scope,
      },
    );

  });

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
          transitionEdgeData(transition),
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

  return {
    nodes,
    edges,
    files: buildPathBranchingFiles(project),
    viewport: scope ? project.canvas?.scopes?.[canvasScopeKey(scope)]?.viewport ?? project.canvas?.viewport : project.canvas?.viewport,
    activeSequenceId,
  };
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
