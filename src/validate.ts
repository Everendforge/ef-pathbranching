import type { BranchingProject, Condition, Consequence, ValidationFinding } from "./domain";

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

function validateConditionCanonRefs(
  findings: ValidationFinding[],
  canonIds: Set<string>,
  ownerId: string,
  context: string,
  conditions: Condition[] | undefined,
) {
  conditions?.forEach((condition) => {
    if (condition.type === "canonEntryUnlocked" && typeof condition.ref === "string") {
      validateCanonRef(findings, canonIds, ownerId, condition.ref, context);
    }
  });
}

function validateConsequenceCanonRefs(
  findings: ValidationFinding[],
  canonIds: Set<string>,
  ownerId: string,
  context: string,
  consequences: Consequence[] | undefined,
) {
  consequences?.forEach((consequence) => {
    if (consequence.type === "unlockCanonEntry" && typeof consequence.ref === "string") {
      validateCanonRef(findings, canonIds, ownerId, consequence.ref, context);
    }
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

  [
    ...findDuplicates(project.sequences.map((sequence) => sequence.id)),
    ...findDuplicates(project.branches.map((branch) => branch.id)),
    ...findDuplicates(project.events.map((event) => event.id)),
    ...findDuplicates(project.scripts.map((script) => script.id)),
    ...findDuplicates(project.canonRefs.map((ref) => ref.id)),
    ...findDuplicates((project.dataClasses ?? []).map((dataClass) => dataClass.id)),
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
  });

  project.events.forEach((event) => {
    if (event.branchRef && !branchIds.has(event.branchRef)) {
      findings.push(
        finding("missing_event", "warning", `Event "${event.id}" references missing branch "${event.branchRef}".`, {
          id: event.id,
          ref: event.branchRef,
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

    validateConsequenceCanonRefs(findings, canonIds, event.id, `Event "${event.id}" unlock`, event.unlocks);

    event.decisions?.forEach((decision) => {
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
        validateConditionCanonRefs(
          findings,
          canonIds,
          outcome.id,
          `Outcome "${outcome.id}" in decision "${decision.id}" condition`,
          outcome.conditions,
        );
        validateConsequenceCanonRefs(
          findings,
          canonIds,
          outcome.id,
          `Outcome "${outcome.id}" in decision "${decision.id}" consequence`,
          outcome.consequences,
        );
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
      validateConditionCanonRefs(
        findings,
        canonIds,
        transition.id,
        `Transition "${transition.id}" condition`,
        transition.conditions,
      );
      validateConsequenceCanonRefs(
        findings,
        canonIds,
        transition.id,
        `Transition "${transition.id}" consequence`,
        transition.consequences,
      );
    });
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
