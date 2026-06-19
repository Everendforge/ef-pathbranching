import type { BranchingProject, EventNode, Sequence } from "./domain";

export type StoryFlowNodeKind = "sequence" | "event";

export type StoryFlowNode = {
  id: string;
  kind: StoryFlowNodeKind;
  label: string;
  description?: string;
  canonRefs: string[];
};

export type StoryFlowEdgeKind = "entry" | "transition";

export type StoryFlowEdge = {
  id: string;
  kind: StoryFlowEdgeKind;
  from: string;
  to: string;
  label?: string;
};

export type StoryFlow = {
  entrySequenceId?: string;
  nodes: StoryFlowNode[];
  edges: StoryFlowEdge[];
};

function sequenceNode(sequence: Sequence): StoryFlowNode {
  return {
    id: sequence.id,
    kind: "sequence",
    label: sequence.name,
    canonRefs: sequence.characterRef ? [sequence.characterRef] : [],
  };
}

function eventNode(event: EventNode): StoryFlowNode {
  return {
    id: event.id,
    kind: "event",
    label: event.name,
    description: event.type,
    canonRefs: event.canonRefs ?? [],
  };
}

export function buildStoryFlow(project: BranchingProject): StoryFlow {
  const nodes = [
    ...project.sequences.map(sequenceNode),
    ...project.events.map(eventNode),
  ];

  const entryEdges: StoryFlowEdge[] = project.sequences.map((sequence) => ({
    id: `entry:${sequence.id}->${sequence.entryEventId}`,
    kind: "entry",
    from: sequence.id,
    to: sequence.entryEventId,
    label: "entry",
  }));

  const transitionEdges: StoryFlowEdge[] = project.events.flatMap((event) =>
    (event.transitions ?? []).map((transition) => ({
      id: transition.id,
      kind: "transition",
      from: transition.from,
      to: transition.to,
      label: transition.label,
    })),
  );

  return {
    entrySequenceId: project.entrySequenceId,
    nodes,
    edges: [...entryEdges, ...transitionEdges],
  };
}
