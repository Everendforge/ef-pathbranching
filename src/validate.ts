import type { BranchingProject, ConditionInput, Consequence, EventNode, LogicEffect, LogicPredicate, ScriptBlock, ValidationFinding } from "./domain.js";
import { conditionInputsFromConsequences, walkConditions } from "./logic.js";
import { mappingsForCanonRef } from "./integrationConfig.js";
import { entitySupportsDialogueTrigger } from "./explorerSchema.js";
import { logicEffectOperations, logicOperatorsFor, resolveLogicField } from "./logicCapabilities.js";
import { isGenericSpeakerRef } from "./speakerRoles.js";
import { canonVariantsForRef } from "./worldnotionVariants.js";

function finding(
  code: ValidationFinding["code"],
  severity: ValidationFinding["severity"],
  message: string,
  extra: Partial<ValidationFinding> = {},
): ValidationFinding {
  return { code, severity, message, ...extra };
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  values.forEach((value) => {
    if (seen.has(value)) {
      duplicates.add(value);
      return;
    }
    seen.add(value);
  });

  return Array.from(duplicates);
}

function isTerminalEventType(project: BranchingProject, type: string | undefined) {
  return Boolean(type && (type === "final" || project.eventCategories?.some((category) => category.id === type && category.terminal)));
}

/** Ids of entities (canon or local) whose entity type is marked grantable via LogicTypeOverride. */
function grantableEntityIds(project: BranchingProject): Set<string> {
  const grantableCanonTypes = new Set<string>();
  const grantableLocalTypes = new Set<string>();
  (project.logicTypeOverrides ?? []).forEach((override) => {
    if (!override.grantable && !override.runtimeRoles?.includes("owned")) return;
    (override.source === "canon" ? grantableCanonTypes : grantableLocalTypes).add(override.typeId);
  });
  const ids = new Set<string>();
  project.canonRefs.forEach((ref) => {
    if (ref.kind && grantableCanonTypes.has(ref.kind)) ids.add(ref.id);
  });
  (project.localExplorerEntities ?? []).forEach((entity) => {
    if (grantableLocalTypes.has(entity.type)) ids.add(entity.id);
  });
  return ids;
}

function entityDescriptor(project: BranchingProject, entityId: string) {
  const canon = project.canonRefs.find((entity) => entity.id === entityId);
  if (canon) return { source: "canon" as const, typeId: canon.kind };
  const local = project.localExplorerEntities?.find((entity) => entity.id === entityId);
  return local ? { source: "local" as const, typeId: local.type } : undefined;
}

function validateTypedPredicate(
  findings: ValidationFinding[],
  projectRefs: ProjectReferenceSets,
  ownerId: string,
  context: string,
  predicate: LogicPredicate,
) {
  const { project } = projectRefs;
  const subject = predicate.subject;
  if (subject.kind === "external" && !project.externalFunctions.some((externalFunction) => externalFunction.name === subject.functionId)) {
    findings.push(finding("invalid_condition", "error", `${context} references missing external function "${subject.functionId}".`, { id: ownerId, ref: subject.functionId }));
    return;
  }
  if (subject.kind === "variable" && !(project.logicVariables ?? []).some((variable) => variable.id === subject.variableId)) {
    findings.push(finding("invalid_condition", "error", `${context} references missing variable "${subject.variableId}".`, { id: ownerId, ref: subject.variableId }));
    return;
  }
  if (subject.kind === "dataObject" && !projectRefs.dataObjectIds.has(subject.objectId)) {
    findings.push(finding("missing_data_object", "error", `${context} references missing data object "${subject.objectId}".`, { id: ownerId, ref: subject.objectId }));
    return;
  }
  if (subject.kind === "entity") {
    const entity = entityDescriptor(project, subject.entityId);
    if (!entity?.typeId) {
      findings.push(finding("missing_canon_ref", "error", `${context} references missing entity "${subject.entityId}".`, { id: ownerId, ref: subject.entityId }));
      return;
    }
  }
  const fieldKind = predicate.type === "state" ? "state" : predicate.type === "property" ? "property" : predicate.type === "visited" ? "visited" : predicate.type === "external" ? "external" : "value";
  const fieldId = predicate.type === "state" ? predicate.stateId : predicate.type === "property" ? predicate.propertyId : predicate.type;
  const field = resolveLogicField(project, predicate.subject, "condition", fieldKind, fieldId);
  if (field.status !== "enabled") {
    findings.push(finding("invalid_condition", "error", `${context} uses unavailable ${field.kind} "${fieldId}" (${field.status}).`, { id: ownerId, ref: fieldId }));
  }
  if (!logicOperatorsFor(field).includes(predicate.operator)) {
    findings.push(finding("invalid_condition", "error", `${context} uses incompatible operator "${predicate.operator}" for "${fieldId}".`, { id: ownerId, ref: fieldId }));
  }
}

function validateCanonRef(
  findings: ValidationFinding[],
  canonIds: Set<string>,
  ownerId: string,
  ref: string,
  context: string,
) {
  if (!canonIds.has(ref)) {
    findings.push(
      finding("missing_canon_ref", "warning", `${context} references missing canon ref "${ref}".`, {
        id: ownerId,
        ref,
      }),
    );
  }
}

function validateConditionRefs(
  findings: ValidationFinding[],
  projectRefs: ProjectReferenceSets,
  canonIds: Set<string>,
  ownerId: string,
  context: string,
  conditions: ConditionInput | undefined,
) {
  walkConditions(conditions, (condition, path) => {
    if ("subject" in condition) {
      validateTypedPredicate(findings, projectRefs, ownerId, `${context} ${path}`, condition as LogicPredicate);
      return;
    }
    if (
      (condition.type === "canonEntryUnlocked" || condition.type === "canonProperty" || condition.type === "canonState") &&
      typeof condition.ref === "string"
    ) {
      validateCanonRef(findings, canonIds, ownerId, condition.ref, `${context} ${path}`);
      const canonRef = projectRefs.project.canonRefs.find((ref) => ref.id === condition.ref);
      const mappings = mappingsForCanonRef(projectRefs.project, canonRef);
      if (condition.type === "canonProperty") {
        const property = typeof condition.property === "string" ? condition.property : "";
        if (!mappings.some((mapping) => mapping.comparableProperties?.includes(property))) {
          findings.push(
            finding("invalid_condition", "error", `${context} uses canon property "${property}" that is not enabled by the Pathbranching role mapping.`, {
              id: ownerId,
              ref: property,
            }),
          );
        }
      }
      if (condition.type === "canonState") {
        const state = typeof condition.state === "string" ? condition.state : "";
        if (!mappings.some((mapping) => mapping.states?.includes(state))) {
          findings.push(
            finding("invalid_condition", "error", `${context} uses canon state "${state}" that is not enabled by the Pathbranching role mapping.`, {
              id: ownerId,
              ref: state,
            }),
          );
        }
      }
      return;
    }

    const dataObjectId = "objectId" in condition && typeof condition.objectId === "string" ? condition.objectId : undefined;
    const runtimeItemId = "itemId" in condition && typeof condition.itemId === "string" ? condition.itemId : undefined;
    const targetType =
      "targetType" in condition &&
      (condition.targetType === "sequence" ||
        condition.targetType === "branch" ||
        condition.targetType === "event" ||
        condition.targetType === "decision" ||
        condition.targetType === "outcome")
        ? condition.targetType
        : undefined;
    const targetId = "targetId" in condition && typeof condition.targetId === "string" ? condition.targetId : undefined;

    if (condition.type === "dataObjectExists" && dataObjectId && !projectRefs.dataObjectIds.has(dataObjectId)) {
      findings.push(
        finding("missing_data_object", "error", `${context} condition references missing data object "${dataObjectId}".`, {
          id: ownerId,
          ref: dataObjectId,
        }),
      );
      return;
    }

    if (condition.type === "dataObjectField" && dataObjectId && !projectRefs.dataObjectIds.has(dataObjectId)) {
      findings.push(
        finding("missing_data_object", "error", `${context} condition references missing data object "${dataObjectId}".`, {
          id: ownerId,
          ref: dataObjectId,
        }),
      );
      return;
    }

    if (condition.type === "runtimeItem" && runtimeItemId && !projectRefs.grantableEntityIds.has(runtimeItemId)) {
      findings.push(
        finding("missing_grantable_entity", "warning", `${context} condition references missing grantable entity "${runtimeItemId}".`, {
          id: ownerId,
          ref: runtimeItemId,
        }),
      );
      return;
    }

    if (condition.type === "visited" && targetType && targetId) {
      const targetSets = {
        sequence: projectRefs.sequenceIds,
        branch: projectRefs.branchIds,
        event: projectRefs.eventIds,
        decision: projectRefs.decisionIds,
        outcome: projectRefs.outcomeIds,
      };
      if (!targetSets[targetType].has(targetId)) {
        findings.push(
          finding("invalid_condition", "error", `${context} condition references missing ${targetType} "${targetId}".`, {
            id: ownerId,
            ref: targetId,
          }),
        );
      }
    }
  });
}

function validateConsequenceCanonRefs(
  findings: ValidationFinding[],
  projectRefs: ProjectReferenceSets,
  canonIds: Set<string>,
  ownerId: string,
  context: string,
  consequences: Consequence[] | undefined,
) {
  consequences?.forEach((consequence) => {
    if ("subject" in consequence) {
      const effect = consequence as LogicEffect;
      const subject = effect.subject;
      if (subject.kind === "external" && !projectRefs.project.externalFunctions.some((externalFunction) => externalFunction.name === subject.functionId)) {
        findings.push(finding("invalid_consequence", "error", `${context} references missing external function "${subject.functionId}".`, { id: ownerId, ref: subject.functionId }));
        return;
      }
      if (subject.kind === "entity") {
        const entity = entityDescriptor(projectRefs.project, subject.entityId);
        if (!entity?.typeId) {
          findings.push(finding("missing_canon_ref", "error", `${context} references missing entity "${subject.entityId}".`, { id: ownerId, ref: subject.entityId }));
          return;
        }
      }
      if (subject.kind === "variable" && !(projectRefs.project.logicVariables ?? []).some((variable) => variable.id === subject.variableId)) {
        findings.push(finding("invalid_consequence", "error", `${context} references missing variable "${subject.variableId}".`, { id: ownerId, ref: subject.variableId }));
        return;
      }
      if (subject.kind === "dataObject" && !projectRefs.dataObjectIds.has(subject.objectId)) {
        findings.push(finding("missing_data_object", "error", `${context} references missing data object "${subject.objectId}".`, { id: ownerId, ref: subject.objectId }));
        return;
      }
      const fieldKind = effect.type === "state" ? "state" : effect.type === "property" ? "property" : effect.type === "external" ? "external" : "value";
      const fieldId = effect.type === "state" ? effect.stateId : effect.type === "property" ? effect.propertyId : effect.type;
      const field = resolveLogicField(projectRefs.project, effect.subject, "effect", fieldKind, fieldId);
      if (field.status !== "enabled") {
        findings.push(finding("invalid_consequence", "error", `${context} writes unavailable ${field.kind} "${fieldId}" (${field.status}).`, { id: ownerId, ref: fieldId }));
      } else if (!logicEffectOperations(field).includes(effect.operation)) {
        findings.push(finding("invalid_consequence", "error", `${context} uses incompatible operation "${effect.operation}" for "${fieldId}".`, { id: ownerId, ref: fieldId }));
      }
      return;
    }
    if (
      (consequence.type === "addGrantable" || consequence.type === "removeGrantable" || consequence.type === "editGrantable") &&
      !projectRefs.grantableEntityIds.has(consequence.entityId)
    ) {
      findings.push(
        finding("missing_grantable_entity", "error", `${context} references missing grantable entity "${consequence.entityId}".`, {
          id: ownerId,
          ref: consequence.entityId,
        }),
      );
    }

    conditionInputsFromConsequences([consequence]).forEach((conditionInput) => {
      validateConditionRefs(findings, projectRefs, canonIds, ownerId, `${context} gated consequence`, conditionInput);
    });
  });
}

type ProjectReferenceSets = {
  project: BranchingProject;
  sequenceIds: Set<string>;
  branchIds: Set<string>;
  eventIds: Set<string>;
  decisionIds: Set<string>;
  outcomeIds: Set<string>;
  dataObjectIds: Set<string>;
  grantableEntityIds: Set<string>;
};

export function validateProject(project: BranchingProject): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const sequenceIds = new Set(project.sequences.map((sequence) => sequence.id));
  const branchIds = new Set(project.branches.map((branch) => branch.id));
  const eventIds = new Set(project.events.map((event) => event.id));
  const scriptIds = new Set(project.scripts.map((script) => script.id));
  const scriptDocumentIds = new Set((project.scriptDocuments ?? []).map((script) => script.id));
  const scriptBlocks = new Map<string, ScriptBlock>(
    (project.scriptDocuments ?? []).flatMap((script) =>
      script.blocks.map((block) => [`${script.id}:${block.id}`, block] as const),
    ),
  );
  const referencedScriptBlocks = new Set<string>();
  const scriptBlockUseCounts = new Map<string, number>();
  const canonIds = new Set(project.canonRefs.map((ref) => ref.id));
  const dataClassIds = new Set((project.dataClasses ?? []).map((dataClass) => dataClass.id));
  const dataObjectIds = new Set((project.projectDataObjects ?? []).map((dataObject) => dataObject.id));
  const decisionIds = new Set<string>();
  const outcomeIds = new Set<string>();
  project.events.forEach((event) => {
    event.decisions?.forEach((decision) => {
      decisionIds.add(decision.id);
      decision.outcomes.forEach((outcome) => {
        outcomeIds.add(outcome.id);
      });
    });
  });
  const projectRefs: ProjectReferenceSets = {
    project,
    sequenceIds,
    branchIds,
    eventIds,
    decisionIds,
    outcomeIds,
    dataObjectIds,
    grantableEntityIds: grantableEntityIds(project),
  };

  [
    ...findDuplicates(project.sequences.map((sequence) => sequence.id)),
    ...findDuplicates(project.branches.map((branch) => branch.id)),
    ...findDuplicates(project.events.map((event) => event.id)),
    ...findDuplicates(project.events.flatMap((event) => (event.dialogues ?? []).map((dialogue) => dialogue.id))),
    ...findDuplicates(project.scripts.map((script) => script.id)),
    ...findDuplicates((project.scriptDocuments ?? []).map((script) => script.id)),
    ...findDuplicates((project.scriptDocuments ?? []).flatMap((script) => script.blocks.map((block) => `${script.id}:${block.id}`))),
    ...findDuplicates(project.canonRefs.map((ref) => ref.id)),
    ...findDuplicates((project.dataClasses ?? []).map((dataClass) => dataClass.id)),
    ...findDuplicates((project.projectDataObjects ?? []).map((dataObject) => dataObject.id)),
    ...findDuplicates((project.projectionRules ?? []).map((rule) => rule.id)),
    ...findDuplicates((project.graphModules ?? []).map((module) => module.id)),
  ].forEach((id) => {
    findings.push(finding("duplicate_id", "error", `Duplicate id "${id}".`, { id }));
  });

  if (project.entrySequenceId && !sequenceIds.has(project.entrySequenceId)) {
    findings.push(
      finding("missing_entry_sequence", "error", `Entry sequence "${project.entrySequenceId}" does not exist.`, {
        ref: project.entrySequenceId,
      }),
    );
  }

  project.sequences.forEach((sequence) => {
    if (!eventIds.has(sequence.entryEventId)) {
      findings.push(
        finding("missing_entry_event", "error", `Sequence "${sequence.id}" references missing entry event "${sequence.entryEventId}".`, {
          id: sequence.id,
          ref: sequence.entryEventId,
        }),
      );
    }

    sequence.eventIds.forEach((eventId) => {
      if (!eventIds.has(eventId)) {
        findings.push(
          finding("missing_event", "error", `Sequence "${sequence.id}" references missing event "${eventId}".`, {
            id: sequence.id,
            ref: eventId,
          }),
        );
      }
    });

    sequence.branchIds?.forEach((branchId) => {
      if (!branchIds.has(branchId)) {
        findings.push(
          finding("missing_branch", "error", `Sequence "${sequence.id}" references missing branch "${branchId}".`, {
            id: sequence.id,
            ref: branchId,
          }),
        );
      }
    });

    sequence.branchIds?.forEach((branchId) => {
      const branch = project.branches.find((item) => item.id === branchId);
      branch?.eventIds.forEach((eventId) => {
        if (!sequence.eventIds.includes(eventId)) {
          findings.push(
            finding(
              "invalid_branch_membership",
              "error",
              `Branch "${branchId}" is listed in sequence "${sequence.id}" but contains event "${eventId}" outside that sequence.`,
              {
                id: branchId,
                ref: eventId,
              },
            ),
          );
        }
      });
    });

    validateConditionRefs(findings, projectRefs, canonIds, sequence.id, `Sequence "${sequence.id}" availability`, sequence.availability);
    validateConsequenceCanonRefs(findings, projectRefs, canonIds, sequence.id, `Sequence "${sequence.id}" consequence`, sequence.consequences);
  });

  project.branches.forEach((branch) => {
    branch.eventIds.forEach((eventId) => {
      if (!eventIds.has(eventId)) {
        findings.push(
          finding("missing_event", "error", `Branch "${branch.id}" references missing event "${eventId}".`, {
            id: branch.id,
            ref: eventId,
          }),
        );
      }
    });
    validateConditionRefs(findings, projectRefs, canonIds, branch.id, `Branch "${branch.id}" availability`, branch.availability);
    validateConsequenceCanonRefs(findings, projectRefs, canonIds, branch.id, `Branch "${branch.id}" consequence`, branch.consequences);
  });

  project.events.forEach((event) => {
    if (event.parentEventId && !eventIds.has(event.parentEventId)) {
      findings.push(
        finding("invalid_nested_event", "error", `Event "${event.id}" references missing parent event "${event.parentEventId}".`, {
          id: event.id,
          ref: event.parentEventId,
        }),
      );
    }
    if (event.parentEventId) {
      const parentEvent = project.events.find((candidate) => candidate.id === event.parentEventId);
      if (parentEvent && !(parentEvent.childEventIds ?? []).includes(event.id)) {
        findings.push(
          finding("invalid_nested_event", "error", `Parent event "${parentEvent.id}" does not include child event "${event.id}".`, {
            id: event.id,
            ref: parentEvent.id,
          }),
        );
      }
    }

    event.childEventIds?.forEach((childEventId) => {
      const childEvent = project.events.find((candidate) => candidate.id === childEventId);
      if (!childEvent) {
        findings.push(
          finding("missing_event", "error", `Event "${event.id}" references missing child event "${childEventId}".`, {
            id: event.id,
            ref: childEventId,
          }),
        );
        return;
      }
      if (childEvent.parentEventId !== event.id) {
        findings.push(
          finding("invalid_nested_event", "error", `Child event "${childEventId}" does not point back to parent "${event.id}".`, {
            id: event.id,
            ref: childEventId,
          }),
        );
      }
    });

    if (event.branchRef && !branchIds.has(event.branchRef)) {
      findings.push(
        finding("missing_branch", "warning", `Event "${event.id}" references missing branch "${event.branchRef}".`, {
          id: event.id,
          ref: event.branchRef,
        }),
      );
    }

    if (event.branchRef) {
      const branch = project.branches.find((item) => item.id === event.branchRef);
      if (branch && !branch.eventIds.includes(event.id)) {
        findings.push(
          finding("invalid_branch_membership", "error", `Event "${event.id}" has branchRef "${event.branchRef}" but is missing from branch.eventIds.`, {
            id: event.id,
            ref: event.branchRef,
          }),
        );
      }
    }

    if (isTerminalEventType(project, event.type) && event.transitions?.length) {
      findings.push(
        finding("invalid_final_transition", "error", `Terminal event "${event.id}" has outgoing transition(s).`, {
          id: event.id,
        }),
      );
    }

    if (event.script && !scriptIds.has(event.script.id)) {
      findings.push(
        finding("missing_script", "warning", `Event "${event.id}" references script "${event.script.id}" that is not listed in project scripts.`, {
          id: event.id,
          ref: event.script.id,
        }),
      );
    }

    event.canonRefs?.forEach((canonRef) => {
      validateCanonRef(findings, canonIds, event.id, canonRef, `Event "${event.id}"`);
    });
    if (event.locationRef) {
      validateCanonRef(findings, canonIds, event.id, event.locationRef, `Event "${event.id}" location`);
    }
    if (event.coverImage) {
      const asset = project.assets?.find((candidate) => candidate.id === event.coverImage?.assetId);
      if (!asset) {
        findings.push(
          finding(
            "missing_event_cover_image",
            "error",
            `Event "${event.id}" references missing cover image asset "${event.coverImage.assetId}".`,
            { id: event.id, ref: event.coverImage.assetId },
          ),
        );
      } else if (asset.kind !== "image") {
        findings.push(
          finding(
            "invalid_event_cover_image",
            "error",
            `Event "${event.id}" cover image asset "${event.coverImage.assetId}" is not an image.`,
            { id: event.id, ref: event.coverImage.assetId },
          ),
        );
      }
    }

    const presentEntityIds = event.presentEntityRefs ?? event.canonRefs ?? [];
    presentEntityIds.forEach((canonRef) => {
      validateCanonRef(findings, canonIds, event.id, canonRef, `Event "${event.id}" present entity`);
    });
    event.dialogueStarts?.forEach((start) => {
      const source = start.source;
      if (!source) {
        findings.push(finding("invalid_dialogue_trigger", "warning", `Dialogue Trigger "${start.id}" in event "${event.id}" has no present entity source yet.`, { id: start.id }));
        return;
      }
      if (source.kind !== "canonRef") {
        findings.push(finding("invalid_dialogue_trigger", "error", `Dialogue Trigger "${start.id}" must reference a present canon entity property.`, { id: start.id, ref: source.id }));
        return;
      }
      if (!presentEntityIds.includes(source.id)) {
        findings.push(finding("invalid_dialogue_trigger", "error", `Dialogue Trigger "${start.id}" references entity "${source.id}", which is not present in event "${event.id}".`, { id: start.id, ref: source.id }));
      }
      const ref = project.canonRefs.find((candidate) => candidate.id === source.id);
      if (ref && !entitySupportsDialogueTrigger(project, ref)) {
        findings.push(finding("invalid_dialogue_trigger", "error", `Entity "${source.id}" is not configured as a Dialogue Trigger. Mark one of its properties as Entity presentable and Dialogue Trigger reference.`, { id: start.id, ref: source.id }));
      }
      if (!source.propertyId) {
        findings.push(finding("invalid_dialogue_trigger", "warning", `Dialogue Trigger "${start.id}" has no trigger action selected.`, { id: start.id }));
      }
    });

    validateConditionRefs(findings, projectRefs, canonIds, event.id, `Event "${event.id}" availability`, event.availability);
    validateConsequenceCanonRefs(findings, projectRefs, canonIds, event.id, `Event "${event.id}" consequence`, event.consequences);

    event.decisions?.forEach((decision) => {
      validateConditionRefs(
        findings,
        projectRefs,
        canonIds,
        decision.id,
        `Decision "${decision.id}" in event "${event.id}" availability`,
        decision.availability,
      );
      decision.outcomes.forEach((outcome) => {
        outcome.requiredCanonRefs?.forEach((canonRef) => {
          validateCanonRef(
            findings,
            canonIds,
            outcome.id,
            canonRef,
            `Outcome "${outcome.id}" in decision "${decision.id}"`,
          );
        });
        validateConditionRefs(
          findings,
          projectRefs,
          canonIds,
          outcome.id,
          `Outcome "${outcome.id}" in decision "${decision.id}" condition`,
          outcome.availability ?? outcome.conditions,
        );
        validateConsequenceCanonRefs(
          findings,
          projectRefs,
          canonIds,
          outcome.id,
          `Outcome "${outcome.id}" in decision "${decision.id}" consequence`,
          outcome.consequences,
        );
      });
    });

    const validateDialogueBeat = (beat: NonNullable<EventNode["dialogueBeats"]>[number]) => {
      const blockKey = `${beat.blockRef.scriptId}:${beat.blockRef.blockId}`;
      referencedScriptBlocks.add(blockKey);
      scriptBlockUseCounts.set(blockKey, (scriptBlockUseCounts.get(blockKey) ?? 0) + 1);
      const block = scriptBlocks.get(blockKey);
      if (!scriptDocumentIds.has(beat.blockRef.scriptId) || !block) {
        findings.push(
          finding("missing_script_block", "error", `Dialogue beat "${beat.id}" references missing script block "${blockKey}".`, {
            id: beat.id,
            ref: blockKey,
          }),
        );
      }
      const characterRef = block?.characterRef ?? block?.speakerRef;
      if (characterRef && !isGenericSpeakerRef(characterRef)) {
        validateCanonRef(findings, canonIds, beat.id, characterRef, `Dialogue beat "${beat.id}" character`);
        const selectedVariantId = block?.characterVariantId;
        const canonRef = project.canonRefs.find((ref) => ref.id === characterRef);
        if (selectedVariantId && canonRef && !canonVariantsForRef(canonRef).some((variant) => variant.id === selectedVariantId)) {
          findings.push(
            finding("invalid_character_variant", "warning", `Dialogue beat "${beat.id}" selects missing variant "${selectedVariantId}" for "${characterRef}".`, {
              id: beat.id,
              ref: selectedVariantId,
            }),
          );
        }
        const presentEntityIds = event.presentEntityRefs ?? event.canonRefs ?? [];
        const hasPresenceConfiguration = event.presentEntityRefs !== undefined || event.canonRefs !== undefined;
        if (hasPresenceConfiguration && !presentEntityIds.includes(characterRef)) {
          findings.push(
            finding("invalid_speaker_presence", "error", `Dialogue beat "${beat.id}" uses speaker "${characterRef}", which is not present in event "${event.id}".`, {
              id: beat.id,
              ref: characterRef,
            }),
          );
        }
      }
      if (beat.kind !== "speech" && (beat.sceneImage || (beat.sceneImages?.length ?? 0) > 0)) {
        findings.push(
          finding("invalid_scene_image", "error", `Only speech beats can reference scene images; beat "${beat.id}" is a direction beat.`, {
            id: beat.id,
          }),
        );
      }
      (beat.kind === "speech" && beat.sceneImage ? [beat.sceneImage] : []).forEach((sceneImage) => {
        const asset = project.assets?.find((candidate) => candidate.id === sceneImage.assetId);
        if (!asset) {
          findings.push(
            finding("missing_scene_image", "error", `Dialogue beat "${beat.id}" references missing scene image asset "${sceneImage.assetId}".`, {
              id: beat.id,
              ref: sceneImage.assetId,
            }),
          );
        } else if (asset.kind !== "image") {
          findings.push(
            finding("invalid_scene_image", "error", `Dialogue beat "${beat.id}" references non-image asset "${sceneImage.assetId}".`, {
              id: beat.id,
              ref: sceneImage.assetId,
            }),
          );
        }
      });
      validateConditionRefs(findings, projectRefs, canonIds, beat.id, `Dialogue beat "${beat.id}" display condition`, beat.displayCondition);
      validateConsequenceCanonRefs(findings, projectRefs, canonIds, beat.id, `Dialogue beat "${beat.id}" consequence`, beat.consequences);
    };

    (event.dialogueBeats ?? []).forEach(validateDialogueBeat);

    event.dialogues?.forEach((dialogue) => {
      dialogue.canonRefs?.forEach((canonRef) => {
        validateCanonRef(findings, canonIds, dialogue.id, canonRef, `Dialogue "${dialogue.id}" in event "${event.id}"`);
      });
      validateConditionRefs(
        findings,
        projectRefs,
        canonIds,
        dialogue.id,
        `Dialogue "${dialogue.id}" in event "${event.id}" availability`,
        dialogue.availability,
      );
      validateConsequenceCanonRefs(findings, projectRefs, canonIds, dialogue.id, `Dialogue "${dialogue.id}" consequence`, dialogue.consequences);
      (dialogue.beats ?? []).forEach(validateDialogueBeat);
    });

    const boundaryNodeIds = new Set([
      ...(event.childEventIds ?? []),
      ...(event.decisions ?? []).map((decision) => `decision:${event.id}:${decision.id}`),
      ...(event.dialogues ?? []).map((dialogue) => `dialogue:${event.id}:${dialogue.id}`),
    ]);
    event.boundaryBindings?.forEach((binding) => {
      const expectedPrefix = `boundary:${event.id}:${binding.direction}:`;
      if (!binding.portId.startsWith(expectedPrefix)) {
        findings.push(
          finding("invalid_boundary_binding", "error", `Boundary binding "${binding.id}" references invalid port "${binding.portId}".`, {
            id: binding.id,
            ref: binding.portId,
          }),
        );
      }
      if (!boundaryNodeIds.has(binding.nodeId)) {
        findings.push(
          finding("invalid_boundary_binding", "error", `Boundary binding "${binding.id}" references missing internal node "${binding.nodeId}".`, {
            id: binding.id,
            ref: binding.nodeId,
          }),
        );
      }
    });

    const internalNodeIds = new Set([
      event.id,
      ...(event.childEventIds ?? []),
      ...(event.decisions ?? []).flatMap((decision) => [
        `decision:${event.id}:${decision.id}`,
        ...decision.outcomes.map((outcome) => `outcome:${event.id}:${decision.id}:${outcome.id}`),
      ]),
      ...(event.dialogues ?? []).flatMap((dialogue) => [
        `dialogue:${event.id}:${dialogue.id}`,
        ...(dialogue.beats ?? []).map((beat) => `beat:${event.id}:${beat.id}`),
      ]),
      ...(event.dialogueBeats ?? []).map((beat) => `beat:${event.id}:${beat.id}`),
      ...(event.dialogueStarts ?? []).map((start) => `dialogue-start:${event.id}:${start.id}`),
    ]);
    const parentInternalNodeIds = event.parentEventId
      ? new Set([
          ...(project.events.find((candidate) => candidate.id === event.parentEventId)?.childEventIds ?? []),
        ])
      : new Set<string>();
    const transitionGroups = new Map<string, NonNullable<typeof event.transitions>>();
    event.transitions?.forEach((transition) => {
      transitionGroups.set(transition.from, [...(transitionGroups.get(transition.from) ?? []), transition]);
      const validTarget =
        eventIds.has(transition.to) ||
        scriptIds.has(transition.to) ||
        internalNodeIds.has(transition.to) ||
        parentInternalNodeIds.has(transition.to) ||
        transition.to.startsWith(`boundary:${event.id}:`) ||
        transition.to.startsWith(`dialogue-boundary:${event.id}:`);
      if (!validTarget) {
        findings.push(
          finding("invalid_scope_transition", "error", `Transition "${transition.id}" targets missing or out-of-scope node "${transition.to}".`, {
            id: transition.id,
            ref: transition.to,
          }),
        );
      }
      const transitionWhen = transition.logic?.when ?? transition.conditions;
      const transitionThen = transition.logic?.then ?? transition.consequences;
      if (
        transition.role === "flow" &&
        (transitionWhen || transitionThen?.length || transition.mode === "fallback" || transition.function || transition.arguments?.length)
      ) {
        findings.push(finding("invalid_scope_transition", "error", `Flow transition "${transition.id}" carries route logic or payload. Promote it to route.`, { id: transition.id }));
      }
      if (transition.function) {
        findings.push(finding("invalid_consequence", "error", `Transition "${transition.id}" uses legacy function payload "${transition.function}". Convert it to a typed external predicate or effect.`, { id: transition.id, ref: transition.function }));
      }
      validateConditionRefs(
        findings,
        projectRefs,
        canonIds,
        transition.id,
        `Transition "${transition.id}" condition`,
        transitionWhen,
      );
      validateConsequenceCanonRefs(
        findings,
        projectRefs,
        canonIds,
        transition.id,
        `Transition "${transition.id}" consequence`,
        transitionThen,
      );
    });
    transitionGroups.forEach((transitions, sourceId) => {
      const ordered = [...transitions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const fallbacks = transitions.filter((transition) => transition.mode === "fallback");
      if (fallbacks.length > 1) {
        findings.push(finding("duplicate_fallback", "error", `Node "${sourceId}" has more than one fallback transition.`, { id: sourceId }));
      }
      const orders = transitions.map((transition) => transition.order ?? 0);
      if (new Set(orders).size !== orders.length || orders.some((order) => order < 0)) {
        findings.push(finding("invalid_transition_order", "error", `Node "${sourceId}" has duplicate or invalid transition order values.`, { id: sourceId }));
      }
      const unconditionalIndex = ordered.findIndex(
        (transition) => transition.mode !== "fallback" && !(transition.logic?.when ?? transition.conditions),
      );
      if (unconditionalIndex >= 0 && unconditionalIndex < ordered.length - 1) {
        findings.push(finding("invalid_transition_order", "warning", `Node "${sourceId}" has an unconditional route before later transitions; those routes are unreachable.`, { id: sourceId }));
      }
      if (
        transitions.some((transition) => transition.logic?.when ?? transition.conditions) &&
        !fallbacks.length &&
        !transitions.some((transition) => transition.mode !== "fallback" && !(transition.logic?.when ?? transition.conditions))
      ) {
        findings.push(finding("no_valid_transition", "error", `Non-terminal node "${sourceId}" can stop when no conditional transition matches. Add an Else fallback.`, { id: sourceId }));
      }
    });
  });

  scriptBlocks.forEach((_block, blockKey) => {
    if (!referencedScriptBlocks.has(blockKey)) {
      findings.push(finding("orphan_script_block", "warning", `Script block "${blockKey}" is not used by any dialogue beat.`, { ref: blockKey }));
    }
    if ((scriptBlockUseCounts.get(blockKey) ?? 0) > 1) {
      findings.push(finding("duplicate_script_binding", "warning", `Script block "${blockKey}" is bound to multiple dialogue beats; edits will intentionally update every use.`, { ref: blockKey }));
    }
  });

  project.branches.forEach((branch) => {
    branch.eventIds.forEach((eventId) => {
      const event = project.events.find((item) => item.id === eventId);
      if (event && event.branchRef !== branch.id) {
        findings.push(
          finding("invalid_branch_membership", "error", `Branch "${branch.id}" contains event "${eventId}" but event.branchRef is "${event.branchRef ?? "none"}".`, {
            id: branch.id,
            ref: eventId,
          }),
        );
      }
    });
  });

  if (project.canvas?.activeSequenceId && !sequenceIds.has(project.canvas.activeSequenceId)) {
    findings.push(
      finding("missing_entry_sequence", "warning", `Canvas active sequence "${project.canvas.activeSequenceId}" does not exist; editor will fall back to entry sequence.`, {
        ref: project.canvas.activeSequenceId,
      }),
    );
  }

  (project.projectDataObjects ?? []).forEach((dataObject) => {
    const dataClass = (project.dataClasses ?? []).find((definition) => definition.id === dataObject.classId);
    if (!dataClass) {
      findings.push(
        finding("missing_data_class", "error", `Data object "${dataObject.id}" references missing data class "${dataObject.classId}".`, {
          id: dataObject.id,
          ref: dataObject.classId,
        }),
      );
    }

    dataObject.canonRefs?.forEach((canonRef) => {
      validateCanonRef(findings, canonIds, dataObject.id, canonRef, `Data object "${dataObject.id}"`);
    });

    dataClass?.fields
      .filter((field) => field.required)
      .forEach((field) => {
        const value = dataObject.fields[field.name];
        if (value === undefined || value === null || value === "") {
          findings.push(
            finding("missing_required_field", "error", `Data object "${dataObject.id}" is missing required field "${field.name}".`, {
              id: dataObject.id,
              ref: field.name,
            }),
          );
        }
      });

    validateConditionRefs(findings, projectRefs, canonIds, dataObject.id, `Data object "${dataObject.id}" availability`, dataObject.availability);
    validateConsequenceCanonRefs(findings, projectRefs, canonIds, dataObject.id, `Data object "${dataObject.id}" consequence`, dataObject.consequences);
  });

  (project.canonEditSuggestions ?? []).forEach((suggestion) => {
    validateCanonRef(findings, canonIds, suggestion.id, suggestion.canonRefId, `Canon edit suggestion "${suggestion.id}"`);
    if (!suggestion.proposedContent && suggestion.status !== "dismissed") {
      findings.push(
        finding("missing_required_field", "warning", `Canon edit suggestion "${suggestion.id}" has no proposed content.`, {
          id: suggestion.id,
          ref: suggestion.canonRefId,
        }),
      );
    }
    if (suggestion.safety !== "worldnotion-review-required") {
      findings.push(
        finding("invalid_projection", "warning", `Canon edit suggestion "${suggestion.id}" must remain review-gated by WorldNotion.`, {
          id: suggestion.id,
          ref: suggestion.canonRefId,
        }),
      );
    }
  });

  (project.projectionRules ?? []).forEach((rule) => {
    if (rule.from.classId && !dataClassIds.has(rule.from.classId)) {
      findings.push(
        finding("invalid_projection", "error", `Projection "${rule.id}" references missing source class "${rule.from.classId}".`, {
          id: rule.id,
          ref: rule.from.classId,
        }),
      );
    }

    if (!dataClassIds.has(rule.to.classId)) {
      findings.push(
        finding("invalid_projection", "error", `Projection "${rule.id}" references missing target class "${rule.to.classId}".`, {
          id: rule.id,
          ref: rule.to.classId,
        }),
      );
    }

    rule.fieldMappings.forEach((mapping) => {
      if (!mapping.targetField) {
        findings.push(
          finding("invalid_projection", "error", `Projection "${rule.id}" has a field mapping without targetField.`, {
            id: rule.id,
          }),
        );
      }
    });
    validateConditionRefs(findings, projectRefs, canonIds, rule.id, `Projection "${rule.id}" condition`, rule.conditions);
  });

  (project.graphModules ?? []).forEach((module) => {
    if (module.dataClassId && !dataClassIds.has(module.dataClassId)) {
      findings.push(
        finding("invalid_projection", "error", `Graph module "${module.id}" references missing data class "${module.dataClassId}".`, {
          id: module.id,
          ref: module.dataClassId,
        }),
      );
    }
  });

  return findings;
}
