import type {
  Branch,
  BranchingProject,
  CanonEditSuggestion,
  ConditionInput,
  Consequence,
  DataFieldDefinition,
  Decision,
  DialogueBeat,
  DialogueMemberRef,
  DialogueNode,
  DialogueStart,
  EventNode,
  EventType,
  Outcome,
  ProjectDataObject,
  Sequence,
  Transition,
} from "./domain.js";
import { conditionInputsFromConsequences, walkConditions } from "./logic.js";
import { scriptBlockTextKey } from "./localization.js";
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
        transitions: event.transitions?.filter(
          (transition) => transition.id !== `transition:boundary:${bindingId}`,
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

export function deleteSequence(
  project: BranchingProject,
  sequenceId: string,
): MutationResult {
  const sequence = project.sequences.find((item) => item.id === sequenceId);
  if (!sequence) return { project, message: "Sequence not found." };
  if (project.sequences.length <= 1) {
    return { project, message: "Cannot delete the only sequence in a story." };
  }

  const deletedEventIds = new Set(sequence.eventIds);
  const deletedBranchIds = new Set([
    ...(sequence.branchIds ?? []),
    ...project.branches
      .filter((branch) =>
        branch.eventIds.some((eventId) => deletedEventIds.has(eventId)) ||
        project.events.some((event) => deletedEventIds.has(event.id) && event.branchRef === branch.id),
      )
      .map((branch) => branch.id),
  ]);
  const deletedDialogueIds = new Set(
    project.events
      .filter((event) => deletedEventIds.has(event.id))
      .flatMap((event) => (event.dialogues ?? []).map((dialogue) => dialogue.id)),
  );
  const nextSequences = project.sequences
    .filter((item) => item.id !== sequenceId)
    .map((item) => ({
      ...item,
      eventIds: item.eventIds.filter((eventId) => !deletedEventIds.has(eventId)),
      branchIds: item.branchIds?.filter((branchId) => !deletedBranchIds.has(branchId)),
    }));
  const nextSequenceId = nextSequences[0]?.id;
  const currentEntrySequenceId = project.entrySequenceId ?? project.sequences[0]?.id;
  const removedNodeIds = new Set([...deletedEventIds, ...deletedBranchIds]);
  const nextScopes = Object.fromEntries(
    Object.entries(project.canvas?.scopes ?? {}).filter(([scopeKey]) =>
      scopeKey !== canvasScopeKey({ kind: "sequence", id: sequenceId }) &&
      !Array.from(deletedEventIds).some((eventId) => scopeKey === canvasScopeKey({ kind: "event", id: eventId })) &&
      !Array.from(deletedDialogueIds).some((dialogueId) => scopeKey === `dialogue:${dialogueId}`),
    ),
  );

  return {
    project: {
      ...project,
      entrySequenceId: currentEntrySequenceId === sequenceId ? nextSequenceId : currentEntrySequenceId,
      sequences: nextSequences,
      branches: project.branches.filter((branch) => !deletedBranchIds.has(branch.id)),
      events: project.events
        .filter((event) => !deletedEventIds.has(event.id))
        .map((event) => ({
          ...event,
          branchRef: deletedBranchIds.has(event.branchRef ?? "") ? undefined : event.branchRef,
          parentEventId: deletedEventIds.has(event.parentEventId ?? "") ? undefined : event.parentEventId,
          childEventIds: event.childEventIds?.filter((eventId) => !deletedEventIds.has(eventId)),
          transitions: event.transitions?.filter((transition) => !deletedEventIds.has(transition.to)),
        })),
      canvas: {
        ...project.canvas,
        activeSequenceId: nextSequenceId,
        activeScope: nextSequenceId ? { kind: "sequence", id: nextSequenceId } : undefined,
        nodes: Object.fromEntries(
          Object.entries(project.canvas?.nodes ?? {}).filter(([id]) => !removedNodeIds.has(id)),
        ),
        scopes: nextScopes,
      },
    },
    selection: nextSequenceId ? { type: "node", id: nextSequenceId } : undefined,
    message: `Deleted sequence "${sequence.name}" and ${deletedEventIds.size} event${deletedEventIds.size === 1 ? "" : "s"}.`,
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
  dialogueId?: string,
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
    optionStyle: "visibleText",
    dialogueId,
    outcomes: [],
  };

  const result = updateEvent(project, eventId, {
    decisions: [...(event.decisions ?? []), decision],
    dialogues: dialogueId
      ? (event.dialogues ?? []).map((dialogue) => dialogue.id === dialogueId
          ? { ...dialogue, members: [...(dialogue.members ?? []), { kind: "decision" as const, id: decision.id }] }
          : dialogue)
      : event.dialogues,
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
  const removedNodeIds = new Set([
    `decision:${eventId}:${decisionId}`,
    ...(event.decisions
      ?.find((decision) => decision.id === decisionId)
      ?.outcomes ?? [])
      .map((outcome) => `outcome:${eventId}:${decisionId}:${outcome.id}`),
  ]);
  const updated = updateEvent(project, eventId, {
    decisions: (event.decisions ?? []).filter(
      (decision) => decision.id !== decisionId,
    ),
    boundaryBindings: (event.boundaryBindings ?? []).filter(
      (binding) => !removedNodeIds.has(binding.nodeId),
    ),
    dialogues: (event.dialogues ?? []).map((dialogue) => ({
      ...dialogue,
      members: (dialogue.members ?? []).filter((member) => !(member.kind === "decision" && member.id === decisionId)),
    })),
  });
  return {
    ...updated,
    project: {
      ...updated.project,
      events: updated.project.events.map((item) => ({
        ...item,
        transitions: item.transitions?.filter(
          (transition) =>
            !removedNodeIds.has(transition.from) &&
            !removedNodeIds.has(transition.to),
        ),
      })),
    },
  };
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
    unavailableBehavior: "locked",
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
    `dialogue:${slugify(event.name || event.id)}:${Date.now().toString(36)}`,
    (event.dialogues ?? []).map((dialogue) => dialogue.id),
  );
  const dialogue: DialogueNode = {
    id: dialogueId,
    title: "New Dialogue",
    text: { format: "plain", content: "" },
    canonRefs: [],
    beats: [],
    members: [],
  };
  const result = updateEvent(project, eventId, {
    dialogues: [...(event.dialogues ?? []), dialogue],
  });
  return {
    ...result,
    selection: { type: "node", id: `dialogue:${eventId}:${dialogue.id}` },
  };
}

export function groupDialogueMembers(
  project: BranchingProject,
  eventId: string,
  members: DialogueMemberRef[],
): MutationResult {
  const event = findEvent(project, eventId);
  if (!event || members.length === 0) return { project, message: "Select beats or decisions from one event." };
  const beatIds = new Set(members.filter((member) => member.kind === "beat").map((member) => member.id));
  const decisionIds = new Set(members.filter((member) => member.kind === "decision").map((member) => member.id));
  const selectedBeats = (event.dialogueBeats ?? []).filter((beat) => beatIds.has(beat.id));
  const selectedDecisions = (event.decisions ?? []).filter((decision) => decisionIds.has(decision.id) && !decision.dialogueId);
  if (selectedBeats.length !== beatIds.size || selectedDecisions.length !== decisionIds.size) {
    return { project, message: "Only ungrouped beats and decisions can create a Dialogue." };
  }
  const dialogueId = uniqueId(
    `dialogue:${slugify(event.name || event.id)}:${Date.now().toString(36)}`,
    (event.dialogues ?? []).map((dialogue) => dialogue.id),
  );
  const dialogue: DialogueNode = {
    id: dialogueId,
    title: "New Dialogue",
    text: { format: "plain", content: "" },
    canonRefs: [],
    beats: selectedBeats,
    members,
    entryBeatId: selectedBeats[0]?.id,
  };
  return {
    project: {
      ...project,
      events: project.events.map((candidate) => candidate.id === eventId ? {
        ...candidate,
        dialogueBeats: (candidate.dialogueBeats ?? []).filter((beat) => !beatIds.has(beat.id)),
        decisions: (candidate.decisions ?? []).map((decision) => decisionIds.has(decision.id)
          ? { ...decision, dialogueId }
          : decision),
        dialogues: [...(candidate.dialogues ?? []), dialogue],
      } : candidate),
    },
    selection: { type: "node", id: `dialogue:${eventId}:${dialogueId}` },
    message: `Created Dialogue from ${members.length} selected nodes.`,
  };
}

export function detachDialogueMembers(
  project: BranchingProject,
  eventId: string,
  dialogueId: string,
  members?: DialogueMemberRef[],
): MutationResult {
  const event = findEvent(project, eventId);
  const dialogue = event?.dialogues?.find((item) => item.id === dialogueId);
  if (!event || !dialogue) return { project, message: "Dialogue not found." };
  const removing = members?.length ? members : (dialogue.members ?? [
    ...(dialogue.beats ?? []).map((beat) => ({ kind: "beat" as const, id: beat.id })),
    ...(event.decisions ?? []).filter((decision) => decision.dialogueId === dialogueId).map((decision) => ({ kind: "decision" as const, id: decision.id })),
  ]);
  const beatIds = new Set(removing.filter((member) => member.kind === "beat").map((member) => member.id));
  const decisionIds = new Set(removing.filter((member) => member.kind === "decision").map((member) => member.id));
  const detachedBeats = (dialogue.beats ?? []).filter((beat) => beatIds.has(beat.id));
  const remainingMembers = (dialogue.members ?? []).filter((member) =>
    !removing.some((candidate) => candidate.kind === member.kind && candidate.id === member.id),
  );
  const dissolve = remainingMembers.length === 0;
  return {
    project: {
      ...project,
      events: project.events.map((candidate) => candidate.id === eventId ? {
        ...candidate,
        dialogueBeats: [...(candidate.dialogueBeats ?? []), ...detachedBeats],
        decisions: (candidate.decisions ?? []).map((decision) => decisionIds.has(decision.id)
          ? { ...decision, dialogueId: undefined }
          : decision),
        dialogues: dissolve
          ? (candidate.dialogues ?? []).filter((item) => item.id !== dialogueId)
          : (candidate.dialogues ?? []).map((item) => item.id === dialogueId ? {
              ...item,
              members: remainingMembers,
              beats: (item.beats ?? []).filter((beat) => !beatIds.has(beat.id)),
              entryBeatId: beatIds.has(item.entryBeatId ?? "")
                ? (item.beats ?? []).find((beat) => !beatIds.has(beat.id))?.id
                : item.entryBeatId,
            } : item),
        dialogueStarts: dissolve
          ? (candidate.dialogueStarts ?? []).filter((start) => start.dialogueId !== dialogueId)
          : candidate.dialogueStarts,
      } : candidate),
    },
    message: dissolve ? "Dissolved Dialogue." : `Detached ${removing.length} members.`,
  };
}

export function createDialogueStart(
  project: BranchingProject,
  eventId: string,
): MutationResult {
  const event = findEvent(project, eventId);
  if (!event) return { project, message: "Event not found." };
  const id = uniqueId("dialogue-trigger", (event.dialogueStarts ?? []).map((start) => start.id));
  const start: DialogueStart = { id };
  const updated = updateEvent(project, eventId, { dialogueStarts: [...(event.dialogueStarts ?? []), start] });
  return { ...updated, selection: { type: "node", id: `dialogue-start:${eventId}:${id}` } };
}

export function updateDialogueStart(
  project: BranchingProject,
  eventId: string,
  startId: string,
  updates: Partial<DialogueStart>,
): MutationResult {
  const event = findEvent(project, eventId);
  if (!event) return { project, message: "Event not found." };
  return updateEvent(project, eventId, {
    dialogueStarts: (event.dialogueStarts ?? []).map((start) => start.id === startId ? { ...start, ...updates } : start),
  });
}

export function deleteDialogueStart(project: BranchingProject, eventId: string, startId: string): MutationResult {
  const event = findEvent(project, eventId);
  if (!event) return { project, message: "Event not found." };
  const nodeId = `dialogue-start:${eventId}:${startId}`;
  return updateEvent(project, eventId, {
    dialogueStarts: (event.dialogueStarts ?? []).filter((start) => start.id !== startId),
    transitions: (event.transitions ?? []).filter((transition) => transition.from !== nodeId && transition.to !== nodeId),
  });
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

export function createScriptDocument(
  project: BranchingProject,
  name = "New Script",
): MutationResult {
  const id = uniqueId(
    `script:${slugify(name) || "script"}`,
    (project.scriptDocuments ?? []).map((document) => document.id),
  );
  return {
    project: {
      ...project,
      scriptDocuments: [
        ...(project.scriptDocuments ?? []),
        { id, name, format: "forge-script", blocks: [] },
      ],
    },
    message: `Created script "${name}".`,
  };
}

export function createDialogueBeat(
  project: BranchingProject,
  eventId: string,
  dialogueId: string,
  kind: DialogueBeat["kind"] = "speech",
): MutationResult {
  const event = findEvent(project, eventId);
  const dialogue = event?.dialogues?.find((item) => item.id === dialogueId);
  if (!event || !dialogue) return { project, message: "Dialogue not found." };
  let scriptDocuments = project.scriptDocuments ?? [];
  let scriptId = dialogue.beats?.[0]?.blockRef.scriptId;
  if (!scriptId || !scriptDocuments.some((document) => document.id === scriptId)) {
    scriptId = uniqueId(
      `script:dialogue:${eventId}:${dialogueId}`,
      scriptDocuments.map((document) => document.id),
    );
    scriptDocuments = [
      ...scriptDocuments,
      { id: scriptId, name: dialogue.title, format: "forge-script", blocks: [] },
    ];
  }
  const script = scriptDocuments.find((document) => document.id === scriptId)!;
  const beatId = uniqueId(
    `beat:${kind}`,
    (dialogue.beats ?? []).map((beat) => beat.id),
  );
  const blockId = uniqueId(
    `block:${kind}`,
    script.blocks.map((block) => block.id),
  );
  const beat: DialogueBeat = {
    id: beatId,
    kind,
    blockRef: { scriptId, blockId },
  };
  const nextDocuments = scriptDocuments.map((document) =>
    document.id === scriptId
      ? {
          ...document,
          blocks: [
            ...document.blocks,
            {
              id: blockId,
              kind: kind === "speech" ? "speech" as const : "direction" as const,
              textKey: scriptBlockTextKey(scriptId, blockId),
              content: "",
            },
          ],
        }
      : document,
  );
  const updated = updateDialogue(project, eventId, dialogueId, {
    entryBeatId: dialogue.entryBeatId ?? beatId,
    beats: [...(dialogue.beats ?? []), beat],
    members: [...(dialogue.members ?? []), { kind: "beat", id: beatId }],
  });
  return {
    ...updated,
    project: { ...updated.project, scriptDocuments: nextDocuments },
    selection: { type: "node", id: `beat:${eventId}:${beatId}` },
  };
}

/** Create a narrative beat directly on an event, without requiring a dialogue container. */
export function createEventDialogueBeat(
  project: BranchingProject,
  eventId: string,
  kind: DialogueBeat["kind"] = "speech",
): MutationResult {
  const event = findEvent(project, eventId);
  if (!event) return { project, message: "Event not found." };
  let scriptDocuments = project.scriptDocuments ?? [];
  let scriptId = `script:event:${eventId}:dialogue`;
  if (!scriptDocuments.some((document) => document.id === scriptId)) {
    scriptId = uniqueId(scriptId, scriptDocuments.map((document) => document.id));
    scriptDocuments = [...scriptDocuments, {
      id: scriptId,
      name: `${event.name} dialogue`,
      format: "forge-script",
      blocks: [],
    }];
  }
  const script = scriptDocuments.find((document) => document.id === scriptId)!;
  const beatId = uniqueId(`beat:${kind}`, (event.dialogueBeats ?? []).map((beat) => beat.id));
  const blockId = uniqueId(`block:${kind}`, script.blocks.map((block) => block.id));
  const beat: DialogueBeat = { id: beatId, kind, blockRef: { scriptId, blockId } };
  return {
    project: {
      ...project,
      scriptDocuments: scriptDocuments.map((document) => document.id === scriptId
        ? { ...document, blocks: [...document.blocks, { id: blockId, kind: kind === "speech" ? "speech" as const : "direction" as const, textKey: scriptBlockTextKey(scriptId, blockId), content: "" }] }
        : document),
      events: project.events.map((item) => item.id === eventId
        ? { ...item, dialogueBeats: [...(item.dialogueBeats ?? []), beat] }
        : item),
    },
    selection: { type: "node", id: `beat:${eventId}:${beatId}` },
  };
}

export function updateEventDialogueBeat(
  project: BranchingProject,
  eventId: string,
  beatId: string,
  updates: Partial<DialogueBeat>,
): MutationResult {
  const event = findEvent(project, eventId);
  if (!event?.dialogueBeats?.some((beat) => beat.id === beatId)) return { project, message: "Dialogue beat not found." };
  return updateEvent(project, eventId, {
    dialogueBeats: event.dialogueBeats.map((beat) => beat.id === beatId ? { ...beat, ...updates } : beat),
  });
}

export function deleteEventDialogueBeat(
  project: BranchingProject,
  eventId: string,
  beatId: string,
): MutationResult {
  const event = findEvent(project, eventId);
  const beat = event?.dialogueBeats?.find((item) => item.id === beatId);
  if (!event || !beat) return { project, message: "Dialogue beat not found." };
  const nodeId = `beat:${eventId}:${beatId}`;
  return {
    project: {
      ...project,
      events: project.events.map((item) => ({
        ...item,
        dialogueBeats: item.id === eventId ? (item.dialogueBeats ?? []).filter((candidate) => candidate.id !== beatId) : item.dialogueBeats,
        transitions: item.transitions?.filter((transition) => transition.from !== nodeId && transition.to !== nodeId),
        boundaryBindings: (item.boundaryBindings ?? []).filter((binding) => binding.nodeId !== nodeId),
      })),
      scriptDocuments: (project.scriptDocuments ?? []).map((document) => document.id === beat.blockRef.scriptId
        ? { ...document, blocks: document.blocks.filter((block) => block.id !== beat.blockRef.blockId) }
        : document),
    },
  };
}

export function updateDialogueBeat(
  project: BranchingProject,
  eventId: string,
  dialogueId: string,
  beatId: string,
  updates: Partial<DialogueBeat>,
): MutationResult {
  const event = findEvent(project, eventId);
  const dialogue = event?.dialogues?.find((item) => item.id === dialogueId);
  if (!event || !dialogue) return { project, message: "Dialogue not found." };
  return updateDialogue(project, eventId, dialogueId, {
    beats: (dialogue.beats ?? []).map((beat) => beat.id === beatId ? { ...beat, ...updates } : beat),
  });
}

export function updateScriptBlock(
  project: BranchingProject,
  scriptId: string,
  blockId: string,
  updates: Partial<NonNullable<BranchingProject["scriptDocuments"]>[number]["blocks"][number]>,
): MutationResult {
  const normalizedUpdates = updates.characterRef !== undefined
    ? { ...updates, speakerRef: updates.characterRef }
    : updates.speakerRef !== undefined
      ? { ...updates, characterRef: updates.speakerRef }
      : updates;
  return {
    project: {
      ...project,
      scriptDocuments: (project.scriptDocuments ?? []).map((document) =>
        document.id === scriptId
          ? {
              ...document,
              blocks: document.blocks.map((block) => block.id === blockId ? { ...block, ...normalizedUpdates } : block),
            }
          : document,
      ),
    },
  };
}

export function createScriptBlock(
  project: BranchingProject,
  scriptId: string,
  kind: "scene" | "direction" | "speech" | "annotation",
): MutationResult {
  const script = project.scriptDocuments?.find((document) => document.id === scriptId);
  if (!script) return { project, message: "Script not found." };
  const blockId = uniqueId(`block:${kind}`, script.blocks.map((block) => block.id));
  return {
    project: {
      ...project,
      scriptDocuments: (project.scriptDocuments ?? []).map((document) =>
        document.id === scriptId
          ? { ...document, blocks: [...document.blocks, { id: blockId, kind, textKey: scriptBlockTextKey(scriptId, blockId), content: "" }] }
          : document,
      ),
    },
  };
}

export function updateScriptDocument(
  project: BranchingProject,
  scriptId: string,
  updates: { name?: string },
): MutationResult {
  return {
    project: {
      ...project,
      scriptDocuments: (project.scriptDocuments ?? []).map((document) =>
        document.id === scriptId ? { ...document, ...updates } : document,
      ),
    },
  };
}

export function linkScriptBlockToDialogue(
  project: BranchingProject,
  scriptId: string,
  blockId: string,
  eventId: string,
  dialogueId: string,
): MutationResult {
  const event = findEvent(project, eventId);
  const dialogue = event?.dialogues?.find((item) => item.id === dialogueId);
  const block = project.scriptDocuments?.find((script) => script.id === scriptId)?.blocks.find((item) => item.id === blockId);
  if (!event || !dialogue || !block) return { project, message: "Script block or dialogue not found." };
  const beatId = uniqueId(
    `beat:${block.kind === "speech" ? "speech" : "direction"}`,
    (dialogue.beats ?? []).map((beat) => beat.id),
  );
  const beat: DialogueBeat = {
    id: beatId,
    kind: block.kind === "speech" ? "speech" : "direction",
    blockRef: { scriptId, blockId },
  };
  const updated = updateDialogue(project, eventId, dialogueId, {
    entryBeatId: dialogue.entryBeatId ?? beatId,
    beats: [...(dialogue.beats ?? []), beat],
    members: [...(dialogue.members ?? []), { kind: "beat", id: beatId }],
  });
  return {
    ...updated,
    selection: { type: "node", id: `beat:${eventId}:${beatId}` },
    message: `Inserted script block into "${dialogue.title}".`,
  };
}

export function deleteDialogueBeat(
  project: BranchingProject,
  eventId: string,
  dialogueId: string,
  beatId: string,
): MutationResult {
  const event = findEvent(project, eventId);
  const dialogue = event?.dialogues?.find((item) => item.id === dialogueId);
  const beat = dialogue?.beats?.find((item) => item.id === beatId);
  if (!event || !dialogue || !beat) return { project, message: "Dialogue beat not found." };
  const nodeId = `beat:${eventId}:${beatId}`;
  const remainingBeats = (dialogue.beats ?? []).filter((item) => item.id !== beatId);
  const updated = updateDialogue(project, eventId, dialogueId, {
    entryBeatId: dialogue.entryBeatId === beatId ? remainingBeats[0]?.id : dialogue.entryBeatId,
    beats: remainingBeats,
    members: (dialogue.members ?? []).filter((member) => !(member.kind === "beat" && member.id === beatId)),
  });
  return {
    ...updated,
    project: {
      ...updated.project,
      events: updated.project.events.map((item) => ({
        ...item,
        transitions: item.transitions?.filter((transition) => transition.from !== nodeId && transition.to !== nodeId),
        boundaryBindings: (item.boundaryBindings ?? []).filter(
          (binding) => binding.nodeId !== nodeId,
        ),
      })),
      scriptDocuments: (updated.project.scriptDocuments ?? []).map((document) =>
        document.id === beat.blockRef.scriptId
          ? { ...document, blocks: document.blocks.filter((block) => block.id !== beat.blockRef.blockId) }
          : document,
      ),
    },
  };
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
  const dialogue = event.dialogues?.find((item) => item.id === dialogueId);
  const removedNodeIds = new Set([
    dialogueNodeId,
    ...(dialogue?.beats ?? []).map((beat) => `beat:${eventId}:${beat.id}`),
  ]);
  return updateEvent(project, eventId, {
    dialogues: (event.dialogues ?? []).filter(
      (dialogue) => dialogue.id !== dialogueId,
    ),
    decisions: (event.decisions ?? []).map((decision) => decision.dialogueId === dialogueId ? { ...decision, dialogueId: undefined } : decision),
    dialogueStarts: (event.dialogueStarts ?? []).filter((start) => start.dialogueId !== dialogueId),
    transitions: (event.transitions ?? []).filter(
      (transition) => !removedNodeIds.has(transition.from) && !removedNodeIds.has(transition.to),
    ),
    boundaryBindings: (event.boundaryBindings ?? []).filter(
      (binding) => !removedNodeIds.has(binding.nodeId),
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

export function createInternalTransition(
  project: BranchingProject,
  eventId: string,
  from: string,
  to: string,
): MutationResult {
  const event = findEvent(project, eventId);
  if (!event) {
    return { project, message: "Event not found." };
  }
  const existing = event.transitions ?? [];
  const duplicate = existing.find(
    (transition) => transition.from === from && transition.to === to,
  );
  if (duplicate) {
    return {
      project,
      selection: { type: "edge", id: `edge:transition:${duplicate.id}` },
    };
  }
  const transition: Transition = {
    id: uniqueId(
      `transition:${slugify(from)}:${slugify(to)}`,
      existing.map((item) => item.id),
    ),
    from,
    to,
    order: existing.filter((item) => item.from === from).length,
    mode: "conditional",
    source: "graph",
  };
  return {
    project: {
      ...project,
      events: project.events.map((item) =>
        item.id === eventId
          ? { ...item, transitions: [...existing, transition] }
          : item,
      ),
    },
    selection: { type: "edge", id: `edge:transition:${transition.id}` },
  };
}

export function updateTransition(
  project: BranchingProject,
  transitionId: string,
  updates: Partial<Transition>,
): MutationResult {
  const owner = project.events.find((event) =>
    event.transitions?.some((transition) => transition.id === transitionId),
  );
  const currentTransition = owner?.transitions?.find((transition) => transition.id === transitionId);
  if (!owner || !currentTransition) return { project, message: "Transition not found." };
  const nextMode = updates.mode ?? currentTransition.mode ?? "conditional";
  const updatedTransition: Transition = {
    ...currentTransition,
    ...updates,
    mode: nextMode,
    conditions: nextMode === "fallback" ? undefined : updates.conditions ?? currentTransition.conditions,
  };
  let siblings = (owner.transitions ?? [])
    .filter((transition) => transition.from === currentTransition.from && transition.id !== transitionId)
    .map((transition) => ({ ...transition }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (nextMode === "fallback") {
    siblings = siblings.map((transition) =>
      transition.mode === "fallback" ? { ...transition, mode: "conditional" as const } : transition,
    );
  }
  const requestedIndex = Math.max(
    0,
    Math.min(
      nextMode === "fallback" ? siblings.length : Number(updates.order ?? currentTransition.order ?? siblings.length),
      siblings.length,
    ),
  );
  siblings.splice(requestedIndex, 0, updatedTransition);
  const reordered = new Map(
    siblings
      .sort((a, b) => {
        if (a.mode === "fallback" && b.mode !== "fallback") return 1;
        if (b.mode === "fallback" && a.mode !== "fallback") return -1;
        return 0;
      })
      .map((transition, order) => [transition.id, { ...transition, order }]),
  );
  return {
    project: {
      ...project,
      events: project.events.map((event) => ({
        ...event,
        transitions: event.transitions?.map((transition) =>
          reordered.get(transition.id) ?? transition,
        ),
      })),
    },
  };
}

export function normalizeTransitionOrder(
  project: BranchingProject,
  sourceId: string,
): MutationResult {
  const owner = project.events.find((event) =>
    event.transitions?.some((transition) => transition.from === sourceId),
  );
  if (!owner) return { project, message: "Transition source not found." };

  const sourceTransitions = (owner.transitions ?? [])
    .filter((transition) => transition.from === sourceId)
    .sort((left, right) => {
      const leftPriority = left.mode === "fallback" ? 2 : left.conditions ? 0 : 1;
      const rightPriority = right.mode === "fallback" ? 2 : right.conditions ? 0 : 1;
      return leftPriority - rightPriority || (left.order ?? 0) - (right.order ?? 0);
    })
    .map((transition, order) => ({ ...transition, order }));
  const normalized = new Map(sourceTransitions.map((transition) => [transition.id, transition]));

  return {
    project: {
      ...project,
      events: project.events.map((event) => ({
        ...event,
        transitions: event.transitions?.map((transition) => normalized.get(transition.id) ?? transition),
      })),
    },
    message: `Normalized transition order for "${sourceId}".`,
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
        boundaryBindings: event.boundaryBindings?.filter(
          (binding) => `transition:boundary:${binding.id}` !== transitionId,
        ),
      })),
    },
  };
}

export function deleteScriptBlock(
  project: BranchingProject,
  blockKey: string,
): MutationResult {
  const owner = (project.scriptDocuments ?? []).find((script) =>
    script.blocks.some((block) => `${script.id}:${block.id}` === blockKey),
  );
  if (!owner) return { project, message: "Script block not found." };

  return {
    project: {
      ...project,
      scriptDocuments: (project.scriptDocuments ?? []).map((script) =>
        script.id === owner.id
          ? { ...script, blocks: script.blocks.filter((block) => `${script.id}:${block.id}` !== blockKey) }
          : script,
      ),
    },
    message: `Deleted orphan script block "${blockKey}".`,
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
