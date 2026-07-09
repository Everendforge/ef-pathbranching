import type { Branch, BranchingProject, CanvasScope, EventNode, Sequence } from "./domain.js";

export function canvasScopeKey(scope: CanvasScope | undefined) {
  return scope ? `${scope.kind}:${scope.id}` : "sequence:";
}

export function activeSequenceId(project: BranchingProject) {
  const preferred = project.canvas?.activeSequenceId ?? project.entrySequenceId ?? project.sequences[0]?.id;
  return project.sequences.some((sequence) => sequence.id === preferred) ? preferred : project.sequences[0]?.id;
}

export function activeCanvasScope(project: BranchingProject): CanvasScope | undefined {
  const scope = project.canvas?.activeScope;
  if (scope?.kind === "event" && project.events.some((event) => event.id === scope.id)) {
    return scope;
  }
  if (scope?.kind === "sequence" && project.sequences.some((sequence) => sequence.id === scope.id)) {
    return scope;
  }
  const sequenceId = activeSequenceId(project);
  return sequenceId ? { kind: "sequence", id: sequenceId } : undefined;
}

export function eventSequenceId(project: BranchingProject, eventId: string) {
  return project.sequences.find((sequence) => sequence.eventIds.includes(eventId))?.id;
}

export function rootSequenceScope(project: BranchingProject): CanvasScope | undefined {
  const sequenceId = activeSequenceId(project);
  return sequenceId ? { kind: "sequence", id: sequenceId } : undefined;
}

export function findSequence(project: BranchingProject, id: string): Sequence | undefined {
  return project.sequences.find((sequence) => sequence.id === id);
}

export function findEvent(project: BranchingProject, id: string): EventNode | undefined {
  return project.events.find((event) => event.id === id);
}

export function findBranch(project: BranchingProject, id: string): Branch | undefined {
  return project.branches.find((branch) => branch.id === id);
}

export function storyEventIds(project: BranchingProject, sequenceId = activeSequenceId(project)) {
  const sequence = sequenceId ? findSequence(project, sequenceId) : undefined;
  return new Set(sequence?.eventIds ?? []);
}
