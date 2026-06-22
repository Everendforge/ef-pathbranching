import type { Edge, Node, Viewport } from "@xyflow/react";
import type {
  Branch,
  BranchingProject,
  ConditionInput,
  Consequence,
  EventNode,
  Outcome,
  ScriptRef,
  ValidationFinding,
} from "../domain.js";
import { conditionCount, conditionLabels, consequenceLabel, walkConditions } from "../logic.js";

export type StoryCanvasNodeKind =
  | "sequence"
  | "start"
  | "branch"
  | "event"
  | "decision"
  | "outcome"
  | "inkSection"
  | "knowledge"
  | "runtimeAction";

export type StoryCanvasEdgeKind =
  | "entry"
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

function positionFor(project: BranchingProject, id: string, x: number, y: number) {
  return project.canvas?.nodes?.[id]?.position ?? { x, y };
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
  } = {},
) {
  const persisted = project.canvas?.nodes?.[id];
  nodes.push({
    id,
    type: "story",
    position: positionFor(project, id, x, y),
    parentId: options.parentId,
    data: {
      kind,
      title,
      subtitle,
      storyObjectId: id,
      badges,
      details,
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
  return [
    eventNode.type,
    ...(eventNode.type === "final" ? ["terminal"] : []),
    `${eventNode.canonRefs?.length ?? 0} refs`,
    eventNode.script ? "ink" : "no script",
    ...(eventNode.decisions?.length ? [`${eventNode.decisions.length} decisions`] : []),
    ...(eventNode.unlocks?.length ? ["unlocks"] : []),
    ...logicBadges(eventNode.availability, eventNode.ruleSets?.length ?? 0),
    ...dataUseBadges(project, eventNode.availability),
  ];
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
) {
  const id = `knowledge:${ref}`;
  if (created.has(id)) {
    return id;
  }

  created.add(id);
  pushNode(project, nodes, id, "knowledge", ref, canonLabel(project, ref), x, y, ["canon"], { canonRef: ref });
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
) {
  consequences?.forEach((consequence, index) => {
    const id = `runtime-action:${ownerId}:${index}`;
    const title = consequenceLabel(consequence);
    const badges = [consequence.type];
    const ref =
      consequence.type === "unlockCanonEntry" && typeof consequence.ref === "string" ? consequence.ref : undefined;
    const dataObjectId =
      consequence.type === "unlockDataObject" && typeof consequence.objectId === "string" ? consequence.objectId : undefined;

    pushNode(project, nodes, id, "runtimeAction", title, ownerLabel, 1160, cursor.supportY, badges, { consequence });
    edges.push(edge(`edge:consequence:${ownerId}:${id}`, ownerId, id, "consequence", title, { consequences: [consequence] }));

    if (ref) {
      const knowledgeId = ensureKnowledgeNode(project, nodes, createdKnowledge, ref, 1440, cursor.supportY);
      edges.push(edge(`edge:consequence:${id}:${knowledgeId}`, id, knowledgeId, "consequence", "unlocks", { consequences: [consequence] }));
    }

    if (dataObjectId) {
      const dataObject = project.projectDataObjects?.find((object) => object.id === dataObjectId);
      const knowledgeId = ensureKnowledgeNode(project, nodes, createdKnowledge, dataObjectId, 1440, cursor.supportY);
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
) {
  const outcomeId = `outcome:${event.id}:${decisionId}:${outcome.id}`;
  const badges = [
    ...conditionLabels(outcome.conditions),
    ...(outcome.consequences ?? []).map(consequenceLabel),
    ...logicBadges(outcome.conditions, outcome.ruleSets?.length ?? 0),
    ...dataUseBadges(project, outcome.conditions),
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
  );

  edges.push(
    edge(`edge:choice:${decisionId}:${outcomeId}`, decisionId, outcomeId, "choice", "choice", {
      conditions: outcome.conditions,
      consequences: outcome.consequences,
    }),
  );

  outcome.requiredCanonRefs?.forEach((ref, refIndex) => {
    const knowledgeId = ensureKnowledgeNode(project, nodes, createdKnowledge, ref, 1440, cursor.supportY + refIndex * 150);
    edges.push(edge(`edge:condition:${knowledgeId}:${outcomeId}`, knowledgeId, outcomeId, "condition", "requires"));
  });

  addConsequenceNodes(project, nodes, edges, createdKnowledge, outcomeId, outcome.name, outcome.consequences, cursor);
}

function addEventSupportNodes(
  project: BranchingProject,
  eventNode: EventNode,
  nodes: StoryCanvasNode[],
  edges: StoryCanvasEdge[],
  createdKnowledge: Set<string>,
  cursor: LayoutCursor,
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
      { eventId: eventNode.id, decision },
    );
    edges.push(edge(`edge:contains:${eventNode.id}:${decisionId}`, eventNode.id, decisionId, "contains", "decision"));

    decision.outcomes.forEach((outcome, outcomeIndex) => {
      addOutcomeNodes(project, eventNode, outcome, decisionId, outcomeIndex, nodes, edges, createdKnowledge, cursor);
    });

    cursor.decisionY += Math.max(190, decision.outcomes.length * 160);
    cursor.outcomeY += Math.max(190, decision.outcomes.length * 160);
  });

  addConsequenceNodes(project, nodes, edges, createdKnowledge, eventNode.id, eventNode.name, eventNode.unlocks, cursor);
}

export function buildStoryCanvasModel(project: BranchingProject): StoryCanvasModel {
  const nodes: StoryCanvasNode[] = [];
  const edges: StoryCanvasEdge[] = [];
  const createdKnowledge = new Set<string>();
  const sequence = activeSequence(project);
  const activeSequenceId = sequence?.id;
  const activeEventIds = new Set(sequence?.eventIds ?? []);
  const activeBranches = branchesForSequence(project, activeSequenceId);
  const activeBranchIds = new Set(activeBranches.map((branch) => branch.id));
  const activeEvents = project.events.filter((eventNode) => activeEventIds.has(eventNode.id));
  const eventIndexInSequence = new Map((sequence?.eventIds ?? []).map((eventId, index) => [eventId, index]));
  const looseEvents = activeEvents.filter((eventNode) => !eventNode.branchRef || !activeBranchIds.has(eventNode.branchRef));
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
      sequence.id,
      "sequence",
      sequence.name,
      sequence.characterRef ? `character ${sequence.characterRef}` : "sequence",
      80,
      cursor.sequenceY,
      [
        "sequence",
        `${sequence.eventIds.length} events`,
        ...logicBadges(sequence.availability, sequence.ruleSets?.length ?? 0),
        ...dataUseBadges(project, sequence.availability),
      ],
      { sequence },
    );

    pushNode(
      project,
      nodes,
      startNodeId,
      "start",
      "Start",
      sequence.name,
      340,
      cursor.sequenceY,
      ["entry", sequence.entryEventId],
      { sequenceId: sequence.id },
    );

    if (sequence.entryEventId && activeEventIds.has(sequence.entryEventId)) {
      edges.push(edge(`edge:entry:${startNodeId}:${sequence.entryEventId}`, startNodeId, sequence.entryEventId, "entry", "entry"));
    }
    cursor.sequenceY += 190;
  }

  activeBranches.forEach((branch, branchIndex) => {
    const height = branchHeight(branch);
    pushNode(
      project,
      nodes,
      branch.id,
      "branch",
      branch.title,
      branch.description ?? "branch",
      620,
      cursor.branchY + branchIndex * 330,
      ["branch", ...logicBadges(branch.availability, branch.ruleSets?.length ?? 0), ...dataUseBadges(project, branch.availability)],
      {
        branch,
      },
      { width: BRANCH_WIDTH, height, isContainer: true },
    );
    branch.eventIds.forEach((eventId) => {
      if (activeEventIds.has(eventId)) {
        edges.push(edge(`edge:contains:${branch.id}:${eventId}`, branch.id, eventId, "contains", "event"));
      }
    });
  });

  activeEvents.forEach((eventNode) => {
    const sequenceIndex = eventIndexInSequence.get(eventNode.id) ?? 0;
    const branch = eventNode.branchRef ? activeBranches.find((item) => item.id === eventNode.branchRef) : undefined;
    const branchEventIndex = branch?.eventIds.findIndex((eventId) => eventId === eventNode.id) ?? -1;
    const looseIndex = looseEvents.findIndex((item) => item.id === eventNode.id);
    const eventX = branch ? BRANCH_PADDING_X : activeBranches.length > 0 ? 1080 : 620;
    const eventY = branch
      ? BRANCH_PADDING_TOP + Math.max(0, branchEventIndex) * BRANCH_EVENT_GAP
      : cursor.eventY + Math.max(0, looseIndex >= 0 ? looseIndex : sequenceIndex) * 220;
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
      { event: eventNode },
      branch ? { parentId: branch.id } : undefined,
    );

    eventNode.transitions?.forEach((transition) => {
      if (!activeEventIds.has(transition.to)) {
        return;
      }

      edges.push(
        edge(`edge:transition:${transition.id}`, eventNode.id, transition.to, "transition", transition.label ?? "transition", {
          conditions: transition.conditions,
          consequences: transition.consequences,
        }),
      );
    });

    const supportBaseY = branch ? cursor.eventY + sequenceIndex * 220 : eventY;
    cursor.decisionY = supportBaseY;
    cursor.outcomeY = supportBaseY;
    cursor.supportY = supportBaseY + 160;
    addEventSupportNodes(project, eventNode, nodes, edges, createdKnowledge, cursor);
  });

  return {
    nodes,
    edges,
    files: buildPathBranchingFiles(project),
    viewport: project.canvas?.viewport,
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
