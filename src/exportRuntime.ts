import type {
  BranchingProject,
  EventNode,
  RuntimeChoice,
  RuntimeNode,
  RuntimePackage,
  SceneImageAttachment,
} from "./domain.js";
import { orderedTransitions } from "./logic.js";
import { UNKNOWN_SPEAKER_REF } from "./speakerRoles.js";

function eventChoices(event: EventNode): RuntimeChoice[] | undefined {
  const outcomeChoices: RuntimeChoice[] = (event.decisions ?? []).flatMap((decision) =>
    decision.outcomes.map((outcome) => {
      const outcomeNodeId = `outcome:${event.id}:${decision.id}:${outcome.id}`;
      const transition = orderedTransitions(
        (event.transitions ?? []).filter((candidate) => candidate.from === outcomeNodeId),
      )[0];
      return {
        id: outcome.id,
        textKey: `outcome.${outcome.id}.text`,
        targetNodeId: transition?.to ?? event.id,
        conditions: outcome.logic?.when ?? outcome.availability ?? outcome.conditions,
        consequences: outcome.logic?.then ?? outcome.consequences,
        logic: outcome.logic,
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

  const runtimeImage = (attachment: SceneImageAttachment | undefined) => {
    if (!attachment) return undefined;
    const asset = project.assets?.find(
      (candidate) => candidate.id === attachment.assetId && candidate.kind === "image",
    );
    return asset
      ? {
          id: attachment.id,
          assetId: asset.id,
          path: asset.path,
          name: asset.name,
          extension: asset.extension,
        }
      : undefined;
  };

  const eventNodes: RuntimeNode[] = project.events.map((event) => ({
    id: event.id,
    type: "event",
    textKey: `event.${event.id}.name`,
    choices: eventChoices(event),
    conditions: event.logic?.when ?? event.availability,
    canonRefs: event.canonRefs,
    canonRefDetails: canonRefDetails(event.canonRefs),
    storyText: event.text,
    script: event.script,
    ...(runtimeImage(event.coverImage)
      ? { coverImage: runtimeImage(event.coverImage) }
      : {}),
    legacyId: event.legacyId,
    decisions: event.decisions,
    transitions: event.transitions,
    automaticTransitions: orderedTransitions(
      (event.transitions ?? []).filter((transition) => transition.from === event.id),
    ),
    consequences: event.logic?.then ?? event.consequences,
    logic: event.logic,
  }));
  const scriptBlocks = new Map(
    (project.scriptDocuments ?? []).flatMap((script) =>
      script.blocks.map((block) => [`${script.id}:${block.id}`, block] as const),
    ),
  );
  const speakerMappings = (Object.values(project.engineTargets ?? {})[0]?.speakerMappings ?? {}) as Record<string, string>;
  const runtimeBeat = (event: EventNode, beat: NonNullable<EventNode["dialogueBeats"]>[number], dialogueId?: string): RuntimeNode => {
    const id = `beat:${event.id}:${beat.id}`;
    const block = scriptBlocks.get(`${beat.blockRef.scriptId}:${beat.blockRef.blockId}`);
    const characterRef = block?.characterRef ?? block?.speakerRef;
    const sceneImage = beat.kind === "speech" && beat.sceneImage
      ? (() => {
          const asset = project.assets?.find((candidate) => candidate.id === beat.sceneImage?.assetId && candidate.kind === "image");
          return asset ? {
            id: beat.sceneImage.id,
            assetId: asset.id,
            path: asset.path,
            name: asset.name,
            extension: asset.extension,
          } : undefined;
        })()
      : undefined;
    return {
      id,
      type: beat.kind === "speech" ? "dialogueBeat" : "directionBeat",
      textKey: block?.textKey ?? `script.${beat.blockRef.scriptId}.${beat.blockRef.blockId}`,
      characterRef: characterRef === UNKNOWN_SPEAKER_REF ? undefined : characterRef,
      characterVariantId: characterRef === UNKNOWN_SPEAKER_REF ? undefined : block?.characterVariantId,
      speakerRef: characterRef === UNKNOWN_SPEAKER_REF ? "unknown" : characterRef ? speakerMappings[characterRef] || characterRef : undefined,
      conditions: beat.logic?.when ?? beat.displayCondition,
      consequences: beat.logic?.then ?? beat.consequences,
      logic: beat.logic,
      automaticTransitions: orderedTransitions((event.transitions ?? []).filter((transition) => transition.from === id)),
      dialogueId,
      ...(sceneImage ? { sceneImage } : {}),
    };
  };
  const dialogueNodes: RuntimeNode[] = project.events.flatMap((event) =>
    (event.dialogues ?? []).flatMap((dialogue) => {
      const containerId = `dialogue:${event.id}:${dialogue.id}`;
      const container: RuntimeNode = {
        id: containerId,
        type: "dialogue",
        textKey: `dialogue.${dialogue.id}.title`,
        entryNodeId: dialogue.entryBeatId
          ? `beat:${event.id}:${dialogue.entryBeatId}`
          : undefined,
        automaticTransitions: orderedTransitions(
          (event.transitions ?? []).filter((transition) => transition.from === containerId),
        ),
        conditions: dialogue.logic?.when ?? dialogue.availability,
        consequences: dialogue.logic?.then ?? dialogue.consequences,
        logic: dialogue.logic,
      };
      const beats = (dialogue.beats ?? []).map((beat) => runtimeBeat(event, beat, dialogue.id));
      return [container, ...beats];
    }),
  );
  const directBeatNodes = project.events.flatMap((event) => (event.dialogueBeats ?? []).map((beat) => runtimeBeat(event, beat)));
  const dialogueStartNodes: RuntimeNode[] = project.events.flatMap((event) => (event.dialogueStarts ?? []).map((start) => ({
    id: `dialogue-start:${event.id}:${start.id}`,
    type: "dialogueTrigger",
    source: start.source,
    conditions: start.logic?.when ?? start.availability,
    consequences: start.logic?.then,
    logic: start.logic,
    automaticTransitions: orderedTransitions(
      (event.transitions ?? []).filter((transition) => transition.from === `dialogue-start:${event.id}:${start.id}`),
    ),
  })));
  const nodes = [...eventNodes, ...dialogueNodes, ...directBeatNodes, ...dialogueStartNodes];

  const legacyPrimary = {
    ...Object.fromEntries(project.events.flatMap((event) => [
      [`event.${event.id}.name`, event.name],
      ...(event.text?.content ? [[`event.${event.id}.text`, event.text.content] as const] : []),
      ...(event.decisions ?? []).flatMap((decision) => [
        [`decision.${decision.id}.prompt`, decision.name] as const,
        ...decision.outcomes.flatMap((outcome) => [
          [`outcome.${outcome.id}.text`, outcome.visibleText?.trim() || outcome.name] as const,
          ...(outcome.lockText?.content ? [[`outcome.${outcome.id}.lock`, outcome.lockText.content] as const] : []),
        ]),
      ]),
      ...(event.dialogues ?? []).flatMap((dialogue) => [[`dialogue.${dialogue.id}.title`, dialogue.title] as const]),
    ])),
    ...Object.fromEntries((project.scriptDocuments ?? []).flatMap((script) => script.blocks.map((block) => [block.textKey ?? `script.${script.id}.${block.id}`, block.content] as const))),
  };
  const primaryLocale = project.localizationCatalog?.primaryLocale ?? "und";
  const locales = project.localizationCatalog?.locales ?? [primaryLocale];
  const localizations = Object.fromEntries(locales.map((locale) => [locale, {
    ...(locale === primaryLocale ? legacyPrimary : {}),
    ...Object.fromEntries(Object.entries(project.localizationCatalog?.entries ?? {}).flatMap(([key, entry]) => entry.values[locale] !== undefined ? [[key, entry.values[locale]]] : [])),
  }]));

  return {
    specVersion: "0.1",
    packageId: project.projectId,
    entryNodeId,
    canonRefs: project.canonRefs,
    variables: project.variables,
    localization: localizations[primaryLocale],
    primaryLocale,
    localizations,
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
      externalFunctions: project.externalFunctions,
    },
    engineTargets: project.engineTargets,
  };
}
