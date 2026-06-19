import type { BranchingProject, RuntimeNode, RuntimePackage } from "./domain";

export function exportRuntimePackage(project: BranchingProject): RuntimePackage {
  const entrySequence = project.entrySequenceId
    ? project.sequences.find((sequence) => sequence.id === project.entrySequenceId)
    : project.sequences[0];
  const entryNodeId = entrySequence?.entryEventId ?? project.events[0]?.id ?? "missing-entry";

  const nodes: RuntimeNode[] = project.events.map((event) => ({
    id: event.id,
    type: "event",
    textKey: `event.${event.id}.name`,
    choices: event.transitions?.map((transition) => ({
      id: transition.id,
      textKey: transition.label ? `transition.${transition.id}.label` : `transition.${transition.id}`,
      targetNodeId: transition.to,
      conditions: transition.conditions,
      consequences: transition.consequences,
    })),
    canonRefs: event.canonRefs,
    script: event.script,
    legacyId: event.legacyId,
  }));

  return {
    specVersion: "0.1",
    packageId: project.projectId,
    entryNodeId,
    canonRefs: project.canonRefs,
    variables: project.variables,
    localization: Object.fromEntries(project.events.map((event) => [`event.${event.id}.name`, event.name])),
    nodes,
    pathBranching: {
      projectId: project.projectId,
      sourceVault: project.sourceVault,
      dataClasses: project.dataClasses,
      projectionRules: project.projectionRules,
      graphModules: project.graphModules,
      entrySequenceId: project.entrySequenceId,
      sequences: project.sequences,
      branches: project.branches,
      events: project.events,
      scripts: project.scripts,
      externalFunctions: project.externalFunctions,
    },
    engineTargets: project.engineTargets,
  };
}
