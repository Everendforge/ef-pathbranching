import type { BranchingProject, ConditionInput, Consequence, RuleSet, ValidationFinding } from "./domain.js";
import { conditionInputsFromConsequences, walkConditions } from "./logic.js";

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
    if (condition.type === "canonEntryUnlocked" && typeof condition.ref === "string") {
      validateCanonRef(findings, canonIds, ownerId, condition.ref, `${context} ${path}`);
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

export function validateProject(project: BranchingProject): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const sequenceIds = new Set(project.sequences.map((sequence) => sequence.id));
  const branchIds = new Set(project.branches.map((branch) => branch.id));
  const eventIds = new Set(project.events.map((event) => event.id));
  const scriptIds = new Set(project.scripts.map((script) => script.id));
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
    sequenceIds,
    branchIds,
    eventIds,
    decisionIds,
    outcomeIds,
    dataObjectIds,
  };

  [
    ...findDuplicates(project.sequences.map((sequence) => sequence.id)),
    ...findDuplicates(project.branches.map((branch) => branch.id)),
    ...findDuplicates(project.events.map((event) => event.id)),
    ...findDuplicates(project.scripts.map((script) => script.id)),
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

    if (event.type === "final" && event.transitions?.length) {
      findings.push(
        finding("invalid_final_transition", "error", `Final event "${event.id}" has outgoing transition(s).`, {
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
          outcome.conditions,
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

    event.transitions?.forEach((transition) => {
      if (!eventIds.has(transition.to) && !scriptIds.has(transition.to)) {
        findings.push(
          finding("broken_transition", "error", `Transition "${transition.id}" targets missing node "${transition.to}".`, {
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
