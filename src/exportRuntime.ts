import type { BranchingProject, RuntimeChoice, RuntimeNode, RuntimePackage, EventNode } from "./domain.js";
import { orderedTransitions } from "./logic.js";

function eventChoices(event: EventNode): RuntimeChoice[] | undefined {
  const outcomeChoices: RuntimeChoice[] = (event.decisions ?? []).flatMap((decision) =>
    decision.outcomes.map((outcome) => {
      const outcomeNodeId = `outcome:${event.id}:${decision.id}:${outcome.id}`;
      const transition = orderedTransitions(
        (event.transitions ?? []).filter((candidate) => candidate.from === outcomeNodeId),
      )[0];
      return {
        id: outcome.id,
        textKey: `outcome.${outcome.id}.name`,
        targetNodeId: transition?.to ?? event.id,
        conditions: outcome.availability ?? outcome.conditions,
        consequences: outcome.consequences,
        unavailableBehavior: outcome.unavailableBehavior ?? "locked",
        lockTextKey: outcome.lockText?.content ? `outcome.${outcome.id}.lock` : undefined,
      };
    }),
  );

  return outcomeChoices.length ? outcomeChoices : undefined;
}

export function exportRuntimePackage(project: BranchingProject): RuntimePackage {
  const entrySequence = project.entrySequenceId
    ? project.sequences.find((sequence) => sequence.id === project.entrySequenceId)
    : project.sequences[0];
  const entryNodeId = entrySequence?.entryEventId ?? project.events[0]?.id ?? "missing-entry";

  const canonRefDetails = (ids: string[] | undefined) =>
    (ids ?? [])
      .map((id) => project.canonRefs.find((ref) => ref.id === id))
      .filter(Boolean)
      .map((ref) => ({
        id: ref!.id,
        kind: ref!.kind,
        label: ref!.label,
        canonSourcePath: ref!.canonSourcePath,
        missingIdentity: ref!.missingIdentity,
        identityWarning: ref!.identityWarning,
      }));

  const eventNodes: RuntimeNode[] = project.events.map((event) => ({
    id: event.id,
    type: "event",
    textKey: `event.${event.id}.name`,
    choices: eventChoices(event),
    conditions: event.availability,
    canonRefs: event.canonRefs,
    canonRefDetails: canonRefDetails(event.canonRefs),
    storyText: event.text,
    script: event.script,
    legacyId: event.legacyId,
    decisions: event.decisions,
    transitions: event.transitions,
    automaticTransitions: orderedTransitions(
      (event.transitions ?? []).filter((transition) => transition.from === event.id),
    ),
    consequences: event.unlocks,
    ruleSetBindings: event.ruleSetBindings,
  }));
  const scriptBlocks = new Map(
    (project.scriptDocuments ?? []).flatMap((script) =>
      script.blocks.map((block) => [`${script.id}:${block.id}`, block] as const),
    ),
  );
  const dialogueNodes: RuntimeNode[] = project.events.flatMap((event) =>
    (event.dialogues ?? []).flatMap((dialogue) => {
      const containerId = `dialogue:${event.id}:${dialogue.id}`;
      const container: RuntimeNode = {
        id: containerId,
        type: "dialogue",
        textKey: `dialogue.${dialogue.id}.title`,
        entryNodeId: dialogue.entryBeatId
          ? `beat:${event.id}:${dialogue.id}:${dialogue.entryBeatId}`
          : undefined,
        automaticTransitions: orderedTransitions(
          (event.transitions ?? []).filter((transition) => transition.from === containerId),
        ),
        ruleSetBindings: dialogue.ruleSetBindings,
      };
      const beats = (dialogue.beats ?? []).map((beat) => {
        const id = `beat:${event.id}:${dialogue.id}:${beat.id}`;
        const block = scriptBlocks.get(`${beat.blockRef.scriptId}:${beat.blockRef.blockId}`);
        return {
          id,
          type: beat.kind === "speech" ? "dialogueBeat" : "directionBeat",
          textKey: `script.${beat.blockRef.scriptId}.${beat.blockRef.blockId}`,
          speakerRef: block?.speakerRef,
          conditions: beat.displayCondition,
          ruleSetBindings: beat.ruleSetBindings,
          automaticTransitions: orderedTransitions(
            (event.transitions ?? []).filter((transition) => transition.from === id),
          ),
          dialogueId: dialogue.id,
        };
      });
      return [container, ...beats];
    }),
  );
  const nodes = [...eventNodes, ...dialogueNodes];

  return {
    specVersion: "0.1",
    packageId: project.projectId,
    entryNodeId,
    canonRefs: project.canonRefs,
    variables: project.variables,
    localization: Object.fromEntries(
      project.events.flatMap((event) => [
        [`event.${event.id}.name`, event.name],
        ...(event.text?.content ? [[`event.${event.id}.text`, event.text.content] as const] : []),
        ...(event.decisions ?? []).flatMap((decision) =>
          decision.outcomes.flatMap((outcome) => [
            [`outcome.${outcome.id}.name`, outcome.name] as const,
            ...(outcome.lockText?.content
              ? [[`outcome.${outcome.id}.lock`, outcome.lockText.content] as const]
              : []),
          ]),
        ),
        ...(event.dialogues ?? []).flatMap((dialogue) =>
          [
            [`dialogue.${dialogue.id}.title`, dialogue.title] as const,
            ...(dialogue.beats ?? []).flatMap((beat) => {
            const block = scriptBlocks.get(`${beat.blockRef.scriptId}:${beat.blockRef.blockId}`);
            return block ? [[`script.${beat.blockRef.scriptId}.${beat.blockRef.blockId}`, block.content] as const] : [];
            }),
          ],
        ),
      ]),
    ),
    nodes,
    pathBranching: {
      projectId: project.projectId,
      sourceVault: project.sourceVault,
      dataClasses: project.dataClasses,
      projectDataObjects: project.projectDataObjects,
      canonEditSuggestions: project.canonEditSuggestions,
      projectionRules: project.projectionRules,
      graphModules: project.graphModules,
      eventCategories: project.eventCategories,
      entrySequenceId: project.entrySequenceId,
      sequences: project.sequences,
      branches: project.branches,
      events: project.events,
      scripts: project.scripts,
      scriptDocuments: project.scriptDocuments,
      integrationConfig: project.integrationConfig,
      integrationConfigOverride: project.integrationConfigOverride,
      ruleLibrary: project.ruleLibrary,
      externalFunctions: project.externalFunctions,
    },
    engineTargets: project.engineTargets,
  };
}
