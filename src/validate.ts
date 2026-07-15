import type { BranchingProject, ConditionInput, Consequence, EventNode, RuleSet, RuleSetBinding, ScriptBlock, ValidationFinding } from "./domain.js";
import { conditionInputsFromConsequences, walkConditions } from "./logic.js";
import { ruleSetPhasesByOwner, type RuleBindingOwnerKind } from "./ruleLibrary.js";
import { mappingsForCanonRef } from "./integrationConfig.js";
import { propertySupportsDialogueTrigger } from "./explorerSchema.js";

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

function canonRefHasProperty(ref: BranchingProject["canonRefs"][number], propertyId: string) {
  return [ref.properties, ref.frontmatter].some((record) =>
    Boolean(record && Object.prototype.hasOwnProperty.call(record, propertyId)),
  );
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

    if (condition.type === "runtimeItem" && runtimeItemId && !projectRefs.dataObjectIds.has(runtimeItemId)) {
      findings.push(
        finding("missing_data_object", "warning", `${context} condition references missing runtime item "${runtimeItemId}".`, {
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
    if (consequence.type === "unlockCanonEntry" && typeof consequence.ref === "string") {
      validateCanonRef(findings, canonIds, ownerId, consequence.ref, context);
    }

    const objectId = "objectId" in consequence && typeof consequence.objectId === "string" ? consequence.objectId : undefined;
    if (consequence.type === "unlockDataObject" && objectId && !projectRefs.dataObjectIds.has(objectId)) {
      findings.push(
        finding("missing_data_object", "error", `${context} references missing data object "${objectId}".`, {
          id: ownerId,
          ref: objectId,
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
};

function validateRuleSets(
  findings: ValidationFinding[],
  projectRefs: ProjectReferenceSets,
  canonIds: Set<string>,
  ownerId: string,
  context: string,
  ruleSets: RuleSet[] | undefined,
) {
  ruleSets?.forEach((ruleSet) => {
    if (!ruleSet.when) {
      findings.push(
        finding("invalid_rule_set", "error", `${context} rule set "${ruleSet.id}" is missing a when condition.`, {
          id: ruleSet.id,
        }),
      );
    }

    validateConditionRefs(findings, projectRefs, canonIds, ruleSet.id, `${context} rule set "${ruleSet.id}"`, ruleSet.when);
    validateConsequenceCanonRefs(findings, projectRefs, canonIds, ruleSet.id, `${context} rule set "${ruleSet.id}" then`, ruleSet.then);
    validateConsequenceCanonRefs(findings, projectRefs, canonIds, ruleSet.id, `${context} rule set "${ruleSet.id}" else`, ruleSet.else);
  });
}

function validateRuleSetBindings(
  findings: ValidationFinding[],
  rules: Set<string>,
  ownerId: string,
  context: string,
  kind: RuleBindingOwnerKind,
  bindings: RuleSetBinding[] | undefined,
) {
  const allowed = ruleSetPhasesByOwner[kind];
  bindings?.forEach((binding) => {
    if (!rules.has(binding.ruleId)) {
      findings.push(finding("missing_rule_set", "error", `${context} references missing rule set "${binding.ruleId}".`, { id: ownerId, ref: binding.ruleId }));
    }
    if (!allowed.includes(binding.phase)) {
      findings.push(finding("invalid_rule_set_binding", "error", `${context} uses unsupported rule phase "${binding.phase}".`, { id: ownerId, ref: binding.id }));
    }
  });
}

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
  };
  const libraryRules = new Set((project.ruleLibrary?.rules ?? []).map((rule) => rule.id));
  (project.ruleLibrary?.rules ?? []).forEach((rule) => {
    if (!rule.when) {
      findings.push(finding("invalid_rule_set", "error", `Rule set "${rule.id}" is missing a when condition.`, { id: rule.id }));
    }
    validateConditionRefs(findings, projectRefs, canonIds, rule.id, `Rule set "${rule.id}"`, rule.when);
    validateConsequenceCanonRefs(findings, projectRefs, canonIds, rule.id, `Rule set "${rule.id}" then`, rule.then);
    validateConsequenceCanonRefs(findings, projectRefs, canonIds, rule.id, `Rule set "${rule.id}" else`, rule.else);
  });

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
    validateRuleSets(findings, projectRefs, canonIds, sequence.id, `Sequence "${sequence.id}"`, sequence.ruleSets);
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
    validateRuleSets(findings, projectRefs, canonIds, branch.id, `Branch "${branch.id}"`, branch.ruleSets);
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
      if (!source.propertyId) {
        findings.push(finding("invalid_dialogue_trigger", "warning", `Dialogue Trigger "${start.id}" has no Dialogue Trigger property selected.`, { id: start.id }));
        return;
      }
      if (!propertySupportsDialogueTrigger(project, "canon", source.propertyId)) {
        findings.push(finding("invalid_dialogue_trigger", "error", `Property "${source.propertyId}" is not enabled as an Entity presentable Dialogue Trigger property.`, { id: start.id, ref: source.propertyId }));
      }
      const ref = project.canonRefs.find((candidate) => candidate.id === source.id);
      if (ref && !canonRefHasProperty(ref, source.propertyId)) {
        findings.push(finding("invalid_dialogue_trigger", "error", `Entity "${source.id}" does not contain property "${source.propertyId}" required by Dialogue Trigger "${start.id}".`, { id: start.id, ref: source.propertyId }));
      }
    });

    validateConditionRefs(findings, projectRefs, canonIds, event.id, `Event "${event.id}" availability`, event.availability);
    validateConsequenceCanonRefs(findings, projectRefs, canonIds, event.id, `Event "${event.id}" unlock`, event.unlocks);
    validateRuleSets(findings, projectRefs, canonIds, event.id, `Event "${event.id}"`, event.ruleSets);

    event.decisions?.forEach((decision) => {
      validateConditionRefs(
        findings,
        projectRefs,
        canonIds,
        decision.id,
        `Decision "${decision.id}" in event "${event.id}" availability`,
        decision.availability,
      );
      validateRuleSets(findings, projectRefs, canonIds, decision.id, `Decision "${decision.id}"`, decision.ruleSets);
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
        validateRuleSets(findings, projectRefs, canonIds, outcome.id, `Outcome "${outcome.id}"`, outcome.ruleSets);
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
      if (characterRef) {
        validateCanonRef(findings, canonIds, beat.id, characterRef, `Dialogue beat "${beat.id}" character`);
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
      validateConditionRefs(findings, projectRefs, canonIds, beat.id, `Dialogue beat "${beat.id}" display condition`, beat.displayCondition);
      validateRuleSets(findings, projectRefs, canonIds, beat.id, `Dialogue beat "${beat.id}"`, beat.ruleSets);
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
      validateRuleSets(findings, projectRefs, canonIds, dialogue.id, `Dialogue "${dialogue.id}"`, dialogue.ruleSets);
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
      validateConditionRefs(
        findings,
        projectRefs,
        canonIds,
        transition.id,
        `Transition "${transition.id}" condition`,
        transition.conditions,
      );
      validateConsequenceCanonRefs(
        findings,
        projectRefs,
        canonIds,
        transition.id,
        `Transition "${transition.id}" consequence`,
        transition.consequences,
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
        (transition) => transition.mode !== "fallback" && !transition.conditions,
      );
      if (unconditionalIndex >= 0 && unconditionalIndex < ordered.length - 1) {
        findings.push(finding("invalid_transition_order", "warning", `Node "${sourceId}" has an unconditional route before later transitions; those routes are unreachable.`, { id: sourceId }));
      }
      if (
        transitions.some((transition) => transition.conditions) &&
        !fallbacks.length &&
        !transitions.some((transition) => transition.mode !== "fallback" && !transition.conditions)
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
    validateRuleSets(findings, projectRefs, canonIds, dataObject.id, `Data object "${dataObject.id}"`, dataObject.ruleSets);
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

  project.sequences.forEach((item) => validateRuleSetBindings(findings, libraryRules, item.id, `Sequence "${item.id}"`, "sequence", item.ruleSetBindings));
  project.branches.forEach((item) => validateRuleSetBindings(findings, libraryRules, item.id, `Branch "${item.id}"`, "branch", item.ruleSetBindings));
  project.events.forEach((event) => {
    validateRuleSetBindings(findings, libraryRules, event.id, `Event "${event.id}"`, "event", event.ruleSetBindings);
    event.decisions?.forEach((decision) => {
      validateRuleSetBindings(findings, libraryRules, decision.id, `Decision "${decision.id}"`, "decision", decision.ruleSetBindings);
      decision.outcomes.forEach((outcome) => validateRuleSetBindings(findings, libraryRules, outcome.id, `Outcome "${outcome.id}"`, "outcome", outcome.ruleSetBindings));
    });
    event.dialogues?.forEach((dialogue) => {
      validateRuleSetBindings(findings, libraryRules, dialogue.id, `Dialogue "${dialogue.id}"`, "dialogue", dialogue.ruleSetBindings);
      dialogue.beats?.forEach((beat) => validateRuleSetBindings(findings, libraryRules, beat.id, `Dialogue beat "${beat.id}"`, "beat", beat.ruleSetBindings));
    });
  });
  (project.projectDataObjects ?? []).forEach((item) => validateRuleSetBindings(findings, libraryRules, item.id, `Data object "${item.id}"`, "dataObject", item.ruleSetBindings));

  return findings;
}
