import type {
  Branch,
  BranchingProject,
  CanonEditSuggestion,
  ConditionInput,
  Consequence,
  DataFieldDefinition,
  Decision,
  DialogueNode,
  EventNode,
  EventType,
  Outcome,
  ProjectDataObject,
  Sequence,
  Transition,
} from "./domain.js";
import { conditionInputsFromConsequences, walkConditions } from "./logic.js";
import { canvasScopeKey } from "./storySelection.js";

export type MutationSelection =
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "dataObject"; id: string }
  | { type: "canonSuggestion"; id: string }
  | { type: "explorerEntity"; id: string }
  | { type: "explorerType"; id: string; source: "canon" | "local" }
  | { type: "explorerProperty"; id: string; source: "canon" | "local" };

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
  return (
    project.canvas?.activeSequenceId ??
    project.entrySequenceId ??
    project.sequences[0]?.id
  );
}

export function findEvent(
  project: BranchingProject,
  id: string,
): EventNode | undefined {
  return project.events.find((event) => event.id === id);
}

export function isTerminalEventType(
  project: BranchingProject,
  type: string | undefined,
) {
  return Boolean(
    type &&
    (type === "final" ||
      project.eventCategories?.some(
        (category) => category.id === type && category.terminal,
      )),
  );
}

export function removeMissingEventReference(
  project: BranchingProject,
  ownerId: string,
  missingEventId: string,
): MutationResult {
  const sequence = project.sequences.find((item) => item.id === ownerId);
  if (sequence) {
    return {
      project: {
        ...project,
        sequences: project.sequences.map((item) =>
          item.id === ownerId
            ? { ...item, eventIds: withoutValue(item.eventIds, missingEventId) }
            : item,
        ),
      },
      selection: undefined,
    };
  }
  const branch = project.branches.find((item) => item.id === ownerId);
  if (branch) {
    return {
      project: {
        ...project,
        branches: project.branches.map((item) =>
          item.id === ownerId
            ? { ...item, eventIds: withoutValue(item.eventIds, missingEventId) }
            : item,
        ),
      },
      selection: undefined,
    };
  }
  const event = findEvent(project, ownerId);
  if (event) {
    return {
      project: {
        ...project,
        events: project.events.map((item) =>
          item.id === ownerId
            ? {
                ...item,
                childEventIds: withoutValue(item.childEventIds, missingEventId),
              }
            : item,
        ),
      },
      selection: undefined,
    };
  }
  return { project, message: "Reference owner not found." };
}

export function findBoundaryBindingOwnerId(
  project: BranchingProject,
  bindingId: string,
): string | undefined {
  return project.events.find((event) =>
    event.boundaryBindings?.some((binding) => binding.id === bindingId),
  )?.id;
}

export function removeBoundaryBinding(
  project: BranchingProject,
  bindingId: string,
): MutationResult {
  return {
    project: {
      ...project,
      events: project.events.map((event) => ({
        ...event,
        boundaryBindings: event.boundaryBindings?.filter(
          (binding) => binding.id !== bindingId,
        ),
      })),
    },
    selection: undefined,
  };
}

export function updateSequence(
  project: BranchingProject,
  id: string,
  updates: Partial<Sequence>,
): MutationResult {
  return {
    project: {
      ...project,
      sequences: project.sequences.map((sequence) =>
        sequence.id === id ? { ...sequence, ...updates } : sequence,
      ),
    },
  };
}

export function setEntrySequence(
  project: BranchingProject,
  id: string,
): MutationResult {
  return {
    project: {
      ...project,
      entrySequenceId: id,
      canvas: { ...project.canvas, activeSequenceId: id },
    },
    selection: { type: "node", id },
  };
}

export function createSequence(
  project: BranchingProject,
  name = "New Sequence",
): MutationResult {
  const trimmedName = name.trim() || "New Sequence";
  const sequenceId = uniqueId(
    `sequence:${slugify(trimmedName) || "new-route"}`,
    project.sequences.map((sequence) => sequence.id),
  );
  const eventId = uniqueId(
    `event:${sequenceId}:entry`,
    project.events.map((event) => event.id),
  );
  const newEvent: EventNode = {
    id: eventId,
    name: "Opening Event",
    type: "normal",
    text: { format: "plain", content: "" },
    canonRefs: [],
    transitions: [],
  };
  const newSequence: Sequence = {
    id: sequenceId,
    name: trimmedName,
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

export function createBranch(
  project: BranchingProject,
  position?: { x: number; y: number },
): MutationResult {
  const sequenceId = activeSequenceId(project);
  if (!sequenceId) {
    return { project, message: "Create a sequence before adding branches." };
  }

  const branchId = uniqueId(
    `branch:${slugify(sequenceId)}:section`,
    project.branches.map((branch) => branch.id),
  );
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
        sequence.id === sequenceId
          ? { ...sequence, branchIds: withValue(sequence.branchIds, branchId) }
          : sequence,
      ),
      canvas: {
        ...project.canvas,
        activeSequenceId: sequenceId,
        nodes: canvasNodes,
      },
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

  const safeType = type || "normal";
  const eventId = uniqueId(
    `event:${slugify(sequenceId)}:${safeType}`,
    project.events.map((event) => event.id),
  );
  const targetBranch = branchId
    ? project.branches.find((branch) => branch.id === branchId)
    : undefined;
  const newEvent: EventNode = {
    id: eventId,
    name: safeType === "final" ? "Final Event" : "New Event",
    type: safeType,
    text: { format: "plain", content: "" },
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
              branchIds: targetBranch
                ? withValue(sequence.branchIds, targetBranch.id)
                : sequence.branchIds,
            }
          : sequence,
      ),
      branches: project.branches.map((branch) =>
        branch.id === targetBranch?.id
          ? { ...branch, eventIds: withValue(branch.eventIds, eventId) }
          : branch,
      ),
      events: [...project.events, newEvent],
      canvas: {
        ...project.canvas,
        activeSequenceId: sequenceId,
        nodes: canvasNodes,
      },
    },
    selection: { type: "node", id: eventId },
  };
}

export function createNestedEvent(
  project: BranchingProject,
  parentEventId: string,
  type: EventType = "normal",
  position?: { x: number; y: number },
): MutationResult {
  const parentEvent = findEvent(project, parentEventId);
  if (!parentEvent) {
    return { project, message: "Parent event not found." };
  }

  const safeType = type || "normal";
  const eventId = uniqueId(
    `event:${slugify(parentEvent.name || parentEvent.id)}:${safeType}`,
    project.events.map((event) => event.id),
  );
  const newEvent: EventNode = {
    id: eventId,
    name: safeType === "final" ? "Final Microevent" : "New Microevent",
    type: safeType,
    parentEventId,
    childEventIds: [],
    text: { format: "plain", content: "" },
    canonRefs: [],
    decisions: [],
    dialogues: [],
    transitions: [],
    boundaryBindings: [],
  };
  const scopeKey = canvasScopeKey({ kind: "event", id: parentEventId });
  const scopedNodes = position
    ? {
        ...(project.canvas?.scopes?.[scopeKey]?.nodes ?? {}),
        [eventId]: {
          ...project.canvas?.scopes?.[scopeKey]?.nodes?.[eventId],
          position,
        },
      }
    : project.canvas?.scopes?.[scopeKey]?.nodes;

  return {
    project: {
      ...project,
      events: [
        ...project.events.map((event) =>
          event.id === parentEventId
            ? {
                ...event,
                childEventIds: withValue(event.childEventIds, eventId),
              }
            : event,
        ),
        newEvent,
      ],
      canvas: {
        ...project.canvas,
        activeScope: { kind: "event", id: parentEventId },
        scopes: {
          ...(project.canvas?.scopes ?? {}),
          [scopeKey]: {
            ...(project.canvas?.scopes?.[scopeKey] ?? {}),
            nodes: scopedNodes,
          },
        },
      },
    },
    selection: { type: "node", id: eventId },
  };
}

export function updateBranch(
  project: BranchingProject,
  id: string,
  updates: Partial<Branch>,
): MutationResult {
  return {
    project: {
      ...project,
      branches: project.branches.map((branch) =>
        branch.id === id ? { ...branch, ...updates } : branch,
      ),
    },
  };
}

export function updateEvent(
  project: BranchingProject,
  id: string,
  updates: Partial<EventNode>,
): MutationResult {
  return {
    project: {
      ...project,
      events: project.events.map((event) =>
        event.id === id ? { ...event, ...updates } : event,
      ),
    },
  };
}

export function createDecision(
  project: BranchingProject,
  eventId: string,
): MutationResult {
  const event = findEvent(project, eventId);
  if (!event) {
    return { project, message: "Event not found." };
  }
  const decisionId = uniqueId(
    `decision:${slugify(event.name || event.id)}`,
    (event.decisions ?? []).map((decision) => decision.id),
  );
  const decision: Decision = {
    id: decisionId,
    name: "New Decision",
    description: "",
    type: "dialogue",
    outcomes: [],
  };

  const result = updateEvent(project, eventId, {
    decisions: [...(event.decisions ?? []), decision],
  });
  return {
    ...result,
    selection: { type: "node", id: `decision:${eventId}:${decision.id}` },
  };
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
    decisions: (event.decisions ?? []).map((decision) =>
      decision.id === decisionId ? { ...decision, ...updates } : decision,
    ),
  });
}

export function deleteDecision(
  project: BranchingProject,
  eventId: string,
  decisionId: string,
): MutationResult {
  const event = findEvent(project, eventId);
  if (!event) {
    return { project, message: "Event not found." };
  }
  const transitionUsesDecision = project.events.some((item) =>
    item.transitions?.some((transition) =>
      transition.from.includes(decisionId),
    ),
  );
  if (transitionUsesDecision) {
    return {
      project,
      message: "Decision deletion is blocked while transitions reference it.",
    };
  }
  return updateEvent(project, eventId, {
    decisions: (event.decisions ?? []).filter(
      (decision) => decision.id !== decisionId,
    ),
  });
}

export function createOutcome(
  project: BranchingProject,
  eventId: string,
  decisionId: string,
): MutationResult {
  const event = findEvent(project, eventId);
  const decision = event?.decisions?.find((item) => item.id === decisionId);
  if (!event || !decision) {
    return { project, message: "Decision not found." };
  }
  const outcomeId = uniqueId(
    `outcome:${slugify(decision.name || decision.id)}`,
    decision.outcomes.map((outcome) => outcome.id),
  );
  const outcome: Outcome = {
    id: outcomeId,
    name: "New Outcome",
    description: "",
    requiredCanonRefs: [],
    consequences: [],
  };
  return updateDecision(project, eventId, decisionId, {
    outcomes: [...decision.outcomes, outcome],
  });
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
    outcomes: decision.outcomes.map((outcome) =>
      outcome.id === outcomeId ? { ...outcome, ...updates } : outcome,
    ),
  });
}

export function deleteOutcome(
  project: BranchingProject,
  eventId: string,
  decisionId: string,
  outcomeId: string,
): MutationResult {
  const event = findEvent(project, eventId);
  const decision = event?.decisions?.find((item) => item.id === decisionId);
  if (!event || !decision) {
    return { project, message: "Decision not found." };
  }
  const outcomeNodeIdPrefix = `outcome:${eventId}:${decisionId}:${outcomeId}`;
  const transitionUsesOutcome = project.events.some((item) =>
    item.transitions?.some(
      (transition) => transition.from === outcomeNodeIdPrefix,
    ),
  );
  if (transitionUsesOutcome) {
    return {
      project,
      message: "Outcome deletion is blocked while transitions reference it.",
    };
  }
  return updateDecision(project, eventId, decisionId, {
    outcomes: decision.outcomes.filter((outcome) => outcome.id !== outcomeId),
  });
}

export function createDialogue(
  project: BranchingProject,
  eventId: string,
): MutationResult {
  const event = findEvent(project, eventId);
  if (!event) {
    return { project, message: "Event not found." };
  }
  const dialogueId = uniqueId(
    `dialogue:${slugify(event.name || event.id)}`,
    (event.dialogues ?? []).map((dialogue) => dialogue.id),
  );
  const dialogue: DialogueNode = {
    id: dialogueId,
    title: "New Dialogue",
    text: { format: "plain", content: "" },
    canonRefs: [],
  };
  const result = updateEvent(project, eventId, {
    dialogues: [...(event.dialogues ?? []), dialogue],
  });
  return {
    ...result,
    selection: { type: "node", id: `dialogue:${eventId}:${dialogue.id}` },
  };
}

export function updateDialogue(
  project: BranchingProject,
  eventId: string,
  dialogueId: string,
  updates: Partial<DialogueNode>,
): MutationResult {
  const event = findEvent(project, eventId);
  if (!event) {
    return { project, message: "Event not found." };
  }
  return updateEvent(project, eventId, {
    dialogues: (event.dialogues ?? []).map((dialogue) =>
      dialogue.id === dialogueId ? { ...dialogue, ...updates } : dialogue,
    ),
  });
}

export function deleteDialogue(
  project: BranchingProject,
  eventId: string,
  dialogueId: string,
): MutationResult {
  const event = findEvent(project, eventId);
  if (!event) {
    return { project, message: "Event not found." };
  }
  const dialogueNodeId = `dialogue:${eventId}:${dialogueId}`;
  return updateEvent(project, eventId, {
    dialogues: (event.dialogues ?? []).filter(
      (dialogue) => dialogue.id !== dialogueId,
    ),
    boundaryBindings: (event.boundaryBindings ?? []).filter(
      (binding) => binding.nodeId !== dialogueNodeId,
    ),
  });
}

export function bindBoundaryPort(
  project: BranchingProject,
  eventId: string,
  portId: string,
  nodeId: string,
  direction: "input" | "output",
): MutationResult {
  const event = findEvent(project, eventId);
  if (!event) {
    return { project, message: "Event not found." };
  }
  const bindingId = uniqueId(
    `boundary-binding:${slugify(portId)}:${slugify(nodeId)}`,
    (event.boundaryBindings ?? []).map((binding) => binding.id),
  );
  return updateEvent(project, eventId, {
    boundaryBindings: [
      ...(event.boundaryBindings ?? []).filter(
        (binding) => !(binding.portId === portId && binding.nodeId === nodeId),
      ),
      { id: bindingId, portId, nodeId, direction },
    ],
  });
}

export function updateTransition(
  project: BranchingProject,
  transitionId: string,
  updates: Partial<Transition>,
): MutationResult {
  return {
    project: {
      ...project,
      events: project.events.map((event) => ({
        ...event,
        transitions: event.transitions?.map((transition) =>
          transition.id === transitionId
            ? { ...transition, ...updates }
            : transition,
        ),
      })),
    },
  };
}

export function deleteTransition(
  project: BranchingProject,
  transitionId: string,
): MutationResult {
  return {
    project: {
      ...project,
      events: project.events.map((event) => ({
        ...event,
        transitions: event.transitions?.filter(
          (transition) => transition.id !== transitionId,
        ),
      })),
    },
  };
}

export function updateDataObject(
  project: BranchingProject,
  id: string,
  updates: Partial<ProjectDataObject>,
): MutationResult {
  return {
    project: {
      ...project,
      projectDataObjects: (project.projectDataObjects ?? []).map(
        (dataObject) =>
          dataObject.id === id ? { ...dataObject, ...updates } : dataObject,
      ),
    },
  };
}

export function deleteDataObject(
  project: BranchingProject,
  id: string,
): MutationResult {
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

  project.sequences.forEach((sequence) =>
    checkConditions(sequence.availability),
  );
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
    return {
      project,
      message:
        "Data object deletion is blocked while conditions or consequences reference it.",
    };
  }

  return {
    project: {
      ...project,
      projectDataObjects: (project.projectDataObjects ?? []).filter(
        (dataObject) => dataObject.id !== id,
      ),
    },
  };
}

export function createCanonEditSuggestion(
  project: BranchingProject,
  canonRefId: string,
  source?: { eventId?: string; dataObjectId?: string },
): MutationResult {
  const canonRef = project.canonRefs.find((ref) => ref.id === canonRefId);
  if (!canonRef) {
    return { project, message: "Canon ref not found." };
  }

  const now = new Date().toISOString();
  const suggestionId = uniqueId(
    `suggestion:${slugify(canonRef.id)}`,
    (project.canonEditSuggestions ?? []).map((suggestion) => suggestion.id),
  );
  const suggestion: CanonEditSuggestion = {
    id: suggestionId,
    canonRefId: canonRef.id,
    targetPath: canonRef.canonSourcePath,
    title: `Suggestion for ${canonRef.label ?? canonRef.id}`,
    summary: source?.eventId
      ? `Suggested while authoring event ${source.eventId}.`
      : "Suggested from PathBranching.",
    proposedContent: canonRef.preview ?? "",
    status: "draft",
    sourceEventId: source?.eventId,
    sourceDataObjectId: source?.dataObjectId,
    createdAt: now,
    updatedAt: now,
    safety: "worldnotion-review-required",
  };

  return {
    project: {
      ...project,
      canonEditSuggestions: [
        ...(project.canonEditSuggestions ?? []),
        suggestion,
      ],
    },
    selection: { type: "canonSuggestion", id: suggestionId },
    message: "Created a safe WorldNotion edit suggestion in PathBranching.",
  };
}

export function updateCanonEditSuggestion(
  project: BranchingProject,
  id: string,
  updates: Partial<CanonEditSuggestion>,
): MutationResult {
  return {
    project: {
      ...project,
      canonEditSuggestions: (project.canonEditSuggestions ?? []).map(
        (suggestion) =>
          suggestion.id === id
            ? { ...suggestion, ...updates, updatedAt: new Date().toISOString() }
            : suggestion,
      ),
    },
  };
}

export function deleteCanonEditSuggestion(
  project: BranchingProject,
  id: string,
): MutationResult {
  return {
    project: {
      ...project,
      canonEditSuggestions: (project.canonEditSuggestions ?? []).filter(
        (suggestion) => suggestion.id !== id,
      ),
    },
  };
}

function defaultFieldValue(field: DataFieldDefinition, canonRefId?: string) {
  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }
  if (field.type === "boolean") {
    return false;
  }
  if (field.type === "number") {
    return 0;
  }
  if (field.type === "canonRef") {
    return canonRefId ?? "";
  }
  if (field.type === "canonRefList") {
    return canonRefId ? [canonRefId] : [];
  }
  if (field.type === "multiSelect" || field.type === "dataRefList") {
    return [];
  }
  return "";
}

export function createDataObject(
  project: BranchingProject,
  classId?: string,
  canonRefId?: string,
): MutationResult {
  const dataClass =
    project.dataClasses?.find((definition) => definition.id === classId) ??
    project.dataClasses?.[0];
  if (!dataClass) {
    return {
      project,
      message: "Create a data class before adding project data.",
    };
  }

  const canonRef = canonRefId
    ? project.canonRefs.find((ref) => ref.id === canonRefId)
    : undefined;
  const label = canonRef?.label ?? canonRef?.id ?? dataClass.label;
  const baseId = `data:${slugify(dataClass.label || dataClass.id)}:${slugify(label || "object") || "object"}`;
  const objectId = uniqueId(
    baseId,
    (project.projectDataObjects ?? []).map((object) => object.id),
  );
  const fields = Object.fromEntries(
    dataClass.fields.map((field) => [
      field.name,
      field.name === "title" || field.name === "displayName"
        ? label
        : defaultFieldValue(field, canonRef?.id),
    ]),
  );

  const newObject: ProjectDataObject = {
    id: objectId,
    classId: dataClass.id,
    name: label,
    canonRefs: canonRef ? [canonRef.id] : [],
    fields,
    tags: canonRef ? ["canon-derived"] : ["manual"],
    scope: { global: true },
  };

  return {
    project: {
      ...project,
      projectDataObjects: [...(project.projectDataObjects ?? []), newObject],
    },
    selection: { type: "dataObject", id: objectId },
  };
}

export function createKnowledgeObject(
  project: BranchingProject,
  canonRefId?: string,
): MutationResult {
  if (
    project.dataClasses?.some(
      (dataClass) => dataClass.id === "class:KnowledgeEntry",
    )
  ) {
    return createDataObject(project, "class:KnowledgeEntry", canonRefId);
  }

  const selectedCanonRef = canonRefId
    ? project.canonRefs.find((canonRef) => canonRef.id === canonRefId)
    : undefined;
  const safeBase = (
    selectedCanonRef?.id ??
    `manual-${(project.projectDataObjects?.length ?? 0) + 1}`
  )
    .replace(/[^a-zA-Z0-9:_-]/g, "-")
    .toLowerCase();
  const objectId = `data:knowledge:${safeBase}`;
  const existingIds = new Set(
    (project.projectDataObjects ?? []).map((dataObject) => dataObject.id),
  );
  const finalId = existingIds.has(objectId)
    ? `${objectId}-${existingIds.size + 1}`
    : objectId;
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

export function setAvailability<T extends { availability?: ConditionInput }>(
  object: T,
  availability: ConditionInput | undefined,
): T {
  return { ...object, availability };
}

export function appendConsequence(
  consequences: Consequence[] | undefined,
  consequence: Consequence,
) {
  return [...(consequences ?? []), consequence];
}
