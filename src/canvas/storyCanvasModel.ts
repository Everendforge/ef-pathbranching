import type { Edge, Node, Viewport } from "@xyflow/react";
import type {
  BranchingProject,
  Condition,
  Consequence,
  EventNode,
  Outcome,
  ScriptRef,
  ValidationFinding,
} from "../domain";

export type StoryCanvasNodeKind =
  | "sequence"
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
} & Record<string, unknown>;

export type StoryCanvasEdgeData = {
  kind: StoryCanvasEdgeKind;
  label: string;
  conditions?: Condition[];
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
) {
  const persisted = project.canvas?.nodes?.[id];
  nodes.push({
    id,
    type: "story",
    position: positionFor(project, id, x, y),
    data: {
      kind,
      title,
      subtitle,
      storyObjectId: id,
      badges,
      details,
      collapsed: persisted?.collapsed,
    },
    width: NODE_WIDTH,
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

function consequenceLabel(consequence: Consequence) {
  if (consequence.type === "unlockCanonEntry") {
    return "unlock";
  }
  if (consequence.type === "setVariable") {
    return "set variable";
  }
  if (consequence.type === "engineSignal") {
    return "engine signal";
  }
  return consequence.type;
}

function conditionBadge(condition: Condition) {
  if (condition.type === "canonEntryUnlocked") {
    return condition.negate ? "unless knowledge" : "requires knowledge";
  }
  if (condition.type === "variable") {
    return `${condition.name} ${condition.operator}`;
  }
  return condition.type;
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

    pushNode(project, nodes, id, "runtimeAction", title, ownerLabel, 1160, cursor.supportY, badges, { consequence });
    edges.push(edge(`edge:consequence:${ownerId}:${id}`, ownerId, id, "consequence", title, { consequences: [consequence] }));

    if (ref) {
      const knowledgeId = ensureKnowledgeNode(project, nodes, createdKnowledge, ref, 1440, cursor.supportY);
      edges.push(edge(`edge:consequence:${id}:${knowledgeId}`, id, knowledgeId, "consequence", "unlocks", { consequences: [consequence] }));
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
    ...(outcome.conditions ?? []).map(conditionBadge),
    ...(outcome.consequences ?? []).map(consequenceLabel),
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
      [decision.type, `${decision.outcomes.length} outcomes`],
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
  const cursor: LayoutCursor = {
    sequenceY: 80,
    branchY: 80,
    eventY: 80,
    decisionY: 80,
    outcomeY: 80,
    supportY: 320,
  };

  project.sequences.forEach((sequence) => {
    pushNode(
      project,
      nodes,
      sequence.id,
      "sequence",
      sequence.name,
      sequence.characterRef ? `character ${sequence.characterRef}` : "sequence",
      80,
      cursor.sequenceY,
      ["sequence", `${sequence.eventIds.length} events`],
      { sequence },
    );

    if (sequence.entryEventId) {
      edges.push(edge(`edge:entry:${sequence.id}:${sequence.entryEventId}`, sequence.id, sequence.entryEventId, "entry", "entry"));
    }

    sequence.eventIds
      .filter((eventId) => eventId !== sequence.entryEventId)
      .forEach((eventId) => {
        edges.push(edge(`edge:contains:${sequence.id}:${eventId}`, sequence.id, eventId, "contains", "event"));
      });
    cursor.sequenceY += 190;
  });

  project.branches.forEach((branch) => {
    pushNode(project, nodes, branch.id, "branch", branch.title, branch.description ?? "branch", 360, cursor.branchY, ["branch"], {
      branch,
    });
    branch.eventIds.forEach((eventId) => {
      edges.push(edge(`edge:contains:${branch.id}:${eventId}`, branch.id, eventId, "contains", "event"));
    });
    cursor.branchY += 190;
  });

  project.events.forEach((eventNode, eventIndex) => {
    const y = cursor.eventY + eventIndex * 220;
    pushNode(
      project,
      nodes,
      eventNode.id,
      "event",
      eventNode.name,
      eventNode.type,
      eventNode.branchRef ? 620 : 360,
      y,
      [
        eventNode.type,
        `${eventNode.canonRefs?.length ?? 0} refs`,
        eventNode.script ? "ink" : "no script",
      ],
      { event: eventNode },
    );

    eventNode.transitions?.forEach((transition) => {
      edges.push(
        edge(`edge:transition:${transition.id}`, eventNode.id, transition.to, "transition", transition.label ?? "transition", {
          conditions: transition.conditions,
          consequences: transition.consequences,
        }),
      );
    });

    cursor.decisionY = y;
    cursor.outcomeY = y;
    cursor.supportY = y + 160;
    addEventSupportNodes(project, eventNode, nodes, edges, createdKnowledge, cursor);
  });

  return {
    nodes,
    edges,
    files: buildPathBranchingFiles(project),
    viewport: project.canvas?.viewport,
  };
}

export function buildPathBranchingFiles(project: BranchingProject): PathBranchingFileItem[] {
  return [
    {
      id: "file:project",
      label: "worldnotion-bridge-demo-project.json",
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
