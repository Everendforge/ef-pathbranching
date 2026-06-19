import type {
  Branch,
  BranchingProject,
  ConditionInput,
  Consequence,
  Decision,
  EventNode,
  EventType,
  Outcome,
  ProjectDataObject,
  Sequence,
  Transition,
} from "./domain.js";
import { conditionInputsFromConsequences, walkConditions } from "./logic.js";

export type MutationSelection =
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "dataObject"; id: string };

export type MutationResult = {
  project: BranchingProject;
  selection?: MutationSelection;
  message?: string;
};

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function uniqueId(base: string, existingIds: Iterable<string>) {
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

export function withoutValue(values: string[] | undefined, value: string) {
  return (values ?? []).filter((item) => item !== value);
}

export function withValue(values: string[] | undefined, value: string) {
  return values?.includes(value) ? values : [...(values ?? []), value];
}

export function activeSequenceId(project: BranchingProject) {
  return project.canvas?.activeSequenceId ?? project.entrySequenceId ?? project.sequences[0]?.id;
}

export function findEvent(project: BranchingProject, id: string): EventNode | undefined {
  return project.events.find((event) => event.id === id);
}

export function updateSequence(project: BranchingProject, id: string, updates: Partial<Sequence>): MutationResult {
  return {
    project: {
      ...project,
      sequences: project.sequences.map((sequence) => (sequence.id === id ? { ...sequence, ...updates } : sequence)),
    },
  };
}

export function setEntrySequence(project: BranchingProject, id: string): MutationResult {
  return {
    project: { ...project, entrySequenceId: id, canvas: { ...project.canvas, activeSequenceId: id } },
    selection: { type: "node", id },
  };
}

export function createSequence(project: BranchingProject): MutationResult {
  const sequenceId = uniqueId("sequence:new-route", project.sequences.map((sequence) => sequence.id));
  const eventId = uniqueId(`event:${sequenceId}:entry`, project.events.map((event) => event.id));
  const newEvent: EventNode = {
    id: eventId,
    name: "Opening Event",
    type: "normal",
    canonRefs: [],
    transitions: [],
  };
  const newSequence: Sequence = {
    id: sequenceId,
    name: "New Sequence",
    entryEventId: eventId,
    eventIds: [eventId],
    branchIds: [],
  };

  return {
    project: {
      ...project,
      sequences: [...project.sequences, newSequence],
      events: [...project.events, newEvent],
      canvas: { ...project.canvas, activeSequenceId: sequenceId },
    },
    selection: { type: "node", id: sequenceId },
  };
}

export function createBranch(project: BranchingProject, position?: { x: number; y: number }): MutationResult {
  const sequenceId = activeSequenceId(project);
  if (!sequenceId) {
    return { project, message: "Create a sequence before adding branches." };
  }

  const branchId = uniqueId(`branch:${slugify(sequenceId)}:section`, project.branches.map((branch) => branch.id));
  const newBranch: Branch = {
    id: branchId,
    title: "New Branch",
    description: "",
    eventIds: [],
  };
  const canvasNodes = position
    ? {
        ...project.canvas?.nodes,
        [branchId]: {
          ...project.canvas?.nodes?.[branchId],
          position,
        },
      }
    : project.canvas?.nodes;

  return {
    project: {
      ...project,
      branches: [...project.branches, newBranch],
      sequences: project.sequences.map((sequence) =>
        sequence.id === sequenceId ? { ...sequence, branchIds: withValue(sequence.branchIds, branchId) } : sequence,
      ),
      canvas: { ...project.canvas, activeSequenceId: sequenceId, nodes: canvasNodes },
    },
    selection: { type: "node", id: branchId },
  };
}

export function createEvent(
  project: BranchingProject,
  type: EventType = "normal",
  position?: { x: number; y: number },
  branchId?: string,
): MutationResult {
  const sequenceId = activeSequenceId(project);
  if (!sequenceId) {
    return { project, message: "Create a sequence before adding events." };
  }

  const safeType = type === "final" ? "final" : type === "exploration" ? "exploration" : "normal";
  const eventId = uniqueId(`event:${slugify(sequenceId)}:${safeType}`, project.events.map((event) => event.id));
  const targetBranch = branchId ? project.branches.find((branch) => branch.id === branchId) : undefined;
  const newEvent: EventNode = {
    id: eventId,
    name: safeType === "final" ? "Final Event" : "New Event",
    type: safeType,
    branchRef: targetBranch?.id,
    canonRefs: [],
    transitions: [],
  };
  const canvasNodes = position
    ? {
        ...project.canvas?.nodes,
        [eventId]: {
          ...project.canvas?.nodes?.[eventId],
          position,
        },
      }
    : project.canvas?.nodes;

  return {
    project: {
      ...project,
      sequences: project.sequences.map((sequence) =>
        sequence.id === sequenceId
          ? {
              ...sequence,
              entryEventId: sequence.entryEventId || eventId,
              eventIds: withValue(sequence.eventIds, eventId),
              branchIds: targetBranch ? withValue(sequence.branchIds, targetBranch.id) : sequence.branchIds,
            }
          : sequence,
      ),
      branches: project.branches.map((branch) =>
        branch.id === targetBranch?.id ? { ...branch, eventIds: withValue(branch.eventIds, eventId) } : branch,
      ),
      events: [...project.events, newEvent],
      canvas: { ...project.canvas, activeSequenceId: sequenceId, nodes: canvasNodes },
    },
    selection: { type: "node", id: eventId },
  };
}

export function updateBranch(project: BranchingProject, id: string, updates: Partial<Branch>): MutationResult {
  return {
    project: {
      ...project,
      branches: project.branches.map((branch) => (branch.id === id ? { ...branch, ...updates } : branch)),
    },
  };
}

export function updateEvent(project: BranchingProject, id: string, updates: Partial<EventNode>): MutationResult {
  return {
    project: {
      ...project,
      events: project.events.map((event) => (event.id === id ? { ...event, ...updates } : event)),
    },
  };
}

export function createDecision(project: BranchingProject, eventId: string): MutationResult {
  const event = findEvent(project, eventId);
  if (!event) {
    return { project, message: "Event not found." };
  }
  const decisionId = uniqueId(`decision:${slugify(event.name || event.id)}`, (event.decisions ?? []).map((decision) => decision.id));
  const decision: Decision = {
    id: decisionId,
    name: "New Decision",
    description: "",
    type: "dialogue",
    outcomes: [],
  };

  return updateEvent(project, eventId, { decisions: [...(event.decisions ?? []), decision] });
}

export function updateDecision(
  project: BranchingProject,
  eventId: string,
  decisionId: string,
  updates: Partial<Decision>,
): MutationResult {
  const event = findEvent(project, eventId);
  if (!event) {
    return { project, message: "Event not found." };
  }
  return updateEvent(project, eventId, {
    decisions: (event.decisions ?? []).map((decision) => (decision.id === decisionId ? { ...decision, ...updates } : decision)),
  });
}

export function deleteDecision(project: BranchingProject, eventId: string, decisionId: string): MutationResult {
  const event = findEvent(project, eventId);
  if (!event) {
    return { project, message: "Event not found." };
  }
  const transitionUsesDecision = project.events.some((item) =>
    item.transitions?.some((transition) => transition.from.includes(decisionId)),
  );
  if (transitionUsesDecision) {
    return { project, message: "Decision deletion is blocked while transitions reference it." };
  }
  return updateEvent(project, eventId, {
    decisions: (event.decisions ?? []).filter((decision) => decision.id !== decisionId),
  });
}

export function createOutcome(project: BranchingProject, eventId: string, decisionId: string): MutationResult {
  const event = findEvent(project, eventId);
  const decision = event?.decisions?.find((item) => item.id === decisionId);
  if (!event || !decision) {
    return { project, message: "Decision not found." };
  }
  const outcomeId = uniqueId(`outcome:${slugify(decision.name || decision.id)}`, decision.outcomes.map((outcome) => outcome.id));
  const outcome: Outcome = {
    id: outcomeId,
    name: "New Outcome",
    description: "",
    requiredCanonRefs: [],
    consequences: [],
  };
  return updateDecision(project, eventId, decisionId, { outcomes: [...decision.outcomes, outcome] });
}

export function updateOutcome(
  project: BranchingProject,
  eventId: string,
  decisionId: string,
  outcomeId: string,
  updates: Partial<Outcome>,
): MutationResult {
  const event = findEvent(project, eventId);
  const decision = event?.decisions?.find((item) => item.id === decisionId);
  if (!event || !decision) {
    return { project, message: "Decision not found." };
  }
  return updateDecision(project, eventId, decisionId, {
    outcomes: decision.outcomes.map((outcome) => (outcome.id === outcomeId ? { ...outcome, ...updates } : outcome)),
  });
}

export function deleteOutcome(project: BranchingProject, eventId: string, decisionId: string, outcomeId: string): MutationResult {
  const event = findEvent(project, eventId);
  const decision = event?.decisions?.find((item) => item.id === decisionId);
  if (!event || !decision) {
    return { project, message: "Decision not found." };
  }
  const outcomeNodeIdPrefix = `outcome:${eventId}:${decisionId}:${outcomeId}`;
  const transitionUsesOutcome = project.events.some((item) =>
    item.transitions?.some((transition) => transition.from === outcomeNodeIdPrefix),
  );
  if (transitionUsesOutcome) {
    return { project, message: "Outcome deletion is blocked while transitions reference it." };
  }
  return updateDecision(project, eventId, decisionId, {
    outcomes: decision.outcomes.filter((outcome) => outcome.id !== outcomeId),
  });
}

export function updateTransition(project: BranchingProject, transitionId: string, updates: Partial<Transition>): MutationResult {
  return {
    project: {
      ...project,
      events: project.events.map((event) => ({
        ...event,
        transitions: event.transitions?.map((transition) =>
          transition.id === transitionId ? { ...transition, ...updates } : transition,
        ),
      })),
    },
  };
}

export function deleteTransition(project: BranchingProject, transitionId: string): MutationResult {
  return {
    project: {
      ...project,
      events: project.events.map((event) => ({
        ...event,
        transitions: event.transitions?.filter((transition) => transition.id !== transitionId),
      })),
    },
  };
}

export function updateDataObject(project: BranchingProject, id: string, updates: Partial<ProjectDataObject>): MutationResult {
  return {
    project: {
      ...project,
      projectDataObjects: (project.projectDataObjects ?? []).map((dataObject) =>
        dataObject.id === id ? { ...dataObject, ...updates } : dataObject,
      ),
    },
  };
}

export function deleteDataObject(project: BranchingProject, id: string): MutationResult {
  let used = false;
  const checkConditions = (input: ConditionInput | undefined) => {
    walkConditions(input, (condition) => {
      if ("objectId" in condition && condition.objectId === id) {
        used = true;
      }
    });
  };
  const checkConsequences = (consequences: Consequence[] | undefined) => {
    consequences?.forEach((consequence) => {
      if ("objectId" in consequence && consequence.objectId === id) {
        used = true;
      }
    });
    conditionInputsFromConsequences(consequences).forEach(checkConditions);
  };

  project.sequences.forEach((sequence) => checkConditions(sequence.availability));
  project.branches.forEach((branch) => checkConditions(branch.availability));
  project.events.forEach((event) => {
    checkConditions(event.availability);
    checkConsequences(event.unlocks);
    event.transitions?.forEach((transition) => {
      checkConditions(transition.conditions);
      checkConsequences(transition.consequences);
    });
    event.decisions?.forEach((decision) => {
      checkConditions(decision.availability);
      decision.outcomes.forEach((outcome) => {
        checkConditions(outcome.conditions);
        checkConsequences(outcome.consequences);
      });
    });
  });

  if (used) {
    return { project, message: "Data object deletion is blocked while conditions or consequences reference it." };
  }

  return {
    project: {
      ...project,
      projectDataObjects: (project.projectDataObjects ?? []).filter((dataObject) => dataObject.id !== id),
    },
  };
}

export function createKnowledgeObject(project: BranchingProject, canonRefId?: string): MutationResult {
  const selectedCanonRef = canonRefId ? project.canonRefs.find((canonRef) => canonRef.id === canonRefId) : undefined;
  const safeBase = (selectedCanonRef?.id ?? `manual-${(project.projectDataObjects?.length ?? 0) + 1}`)
    .replace(/[^a-zA-Z0-9:_-]/g, "-")
    .toLowerCase();
  const objectId = `data:knowledge:${safeBase}`;
  const existingIds = new Set((project.projectDataObjects ?? []).map((dataObject) => dataObject.id));
  const finalId = existingIds.has(objectId) ? `${objectId}-${existingIds.size + 1}` : objectId;
  const newObject: ProjectDataObject = {
    id: finalId,
    classId: "class:KnowledgeEntry",
    name: selectedCanonRef?.id ?? "Manual Knowledge Entry",
    canonRefs: selectedCanonRef ? [selectedCanonRef.id] : [],
    fields: {
      sourceRef: selectedCanonRef?.id ?? "manual",
      title: selectedCanonRef?.id ?? "Manual Knowledge Entry",
      body: "",
    },
    tags: selectedCanonRef ? ["canon-derived"] : ["manual"],
    scope: { global: true },
  };

  return {
    project: {
      ...project,
      projectDataObjects: [...(project.projectDataObjects ?? []), newObject],
    },
    selection: { type: "dataObject", id: finalId },
  };
}

export function setAvailability<T extends { availability?: ConditionInput }>(object: T, availability: ConditionInput | undefined): T {
  return { ...object, availability };
}

export function appendConsequence(consequences: Consequence[] | undefined, consequence: Consequence) {
  return [...(consequences ?? []), consequence];
}
