import type {
  BranchingProject,
  RuleLibrary,
  RuleLibraryRule,
  RuleSet,
  RuleSetBinding,
  RuleSetPhase,
} from "./domain.js";

export type RuleBindingOwnerKind =
  | "sequence"
  | "branch"
  | "event"
  | "decision"
  | "dialogue"
  | "beat"
  | "outcome"
  | "dataObject";

const DEFAULT_GROUP_ID = "rule-group:general";

export const ruleSetPhasesByOwner: Record<RuleBindingOwnerKind, RuleSetPhase[]> = {
  sequence: ["onEnter", "onExit"],
  branch: ["onEnter", "onExit"],
  event: ["onEnter", "onExit"],
  decision: ["onDisplay"],
  dialogue: ["onEnter", "onExit"],
  beat: ["onDisplay", "onExit"],
  outcome: ["onDisplay", "onSelect"],
  dataObject: ["onCreate"],
};

export const defaultRuleSetPhase: Record<RuleBindingOwnerKind, RuleSetPhase> = {
  sequence: "onEnter",
  branch: "onEnter",
  event: "onEnter",
  decision: "onDisplay",
  dialogue: "onEnter",
  beat: "onDisplay",
  outcome: "onDisplay",
  dataObject: "onCreate",
};

export function emptyRuleLibrary(): RuleLibrary {
  return { groups: [{ id: DEFAULT_GROUP_ID, name: "General", order: 0 }], rules: [] };
}

function uniqueRuleId(base: string, rules: RuleLibraryRule[]) {
  const ids = new Set(rules.map((rule) => rule.id));
  if (!ids.has(base)) return base;
  let index = 2;
  while (ids.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function normalizeBindings(
  bindings: RuleSetBinding[] | undefined,
  kind: RuleBindingOwnerKind,
): RuleSetBinding[] | undefined {
  if (!bindings?.length) return undefined;
  const allowed = ruleSetPhasesByOwner[kind];
  return [...bindings]
    .sort((left, right) => left.order - right.order)
    .map((binding, index) => ({
      ...binding,
      phase: allowed.includes(binding.phase) ? binding.phase : defaultRuleSetPhase[kind],
      order: index,
    }));
}

function migrateOwner<T extends { ruleSets?: RuleSet[]; ruleSetBindings?: RuleSetBinding[] }>(
  owner: T,
  ownerId: string,
  kind: RuleBindingOwnerKind,
  library: RuleLibrary,
): T {
  const { ruleSets: legacyRules, ...withoutLegacy } = owner;
  const bindings = [...(normalizeBindings(owner.ruleSetBindings, kind) ?? [])];
  (legacyRules ?? []).forEach((legacyRule, index) => {
    const id = uniqueRuleId(`rule:${ownerId}:${legacyRule.id || index + 1}`, library.rules);
    library.rules.push({ ...legacyRule, id, groupId: DEFAULT_GROUP_ID });
    bindings.push({
      id: `rule-binding:${ownerId}:${index + 1}`,
      ruleId: id,
      phase: defaultRuleSetPhase[kind],
      order: bindings.length,
    });
  });
  return { ...withoutLegacy, ruleSetBindings: bindings.length ? bindings : undefined } as T;
}

export function normalizeRuleLibrary(project: BranchingProject): BranchingProject {
  const library = project.ruleLibrary
    ? {
        groups: project.ruleLibrary.groups?.length
          ? [...project.ruleLibrary.groups].sort((left, right) => left.order - right.order).map((group, order) => ({ ...group, order }))
          : emptyRuleLibrary().groups,
        rules: [...(project.ruleLibrary.rules ?? [])],
      }
    : emptyRuleLibrary();
  const groupIds = new Set(library.groups.map((group) => group.id));
  if (!groupIds.has(DEFAULT_GROUP_ID)) {
    library.groups.push({ id: DEFAULT_GROUP_ID, name: "General", order: library.groups.length });
    groupIds.add(DEFAULT_GROUP_ID);
  }
  library.rules = library.rules.map((rule) => ({
    ...rule,
    groupId: groupIds.has(rule.groupId) ? rule.groupId : DEFAULT_GROUP_ID,
    tags: rule.tags?.map((tag) => tag.trim()).filter(Boolean),
  }));

  const sequences = project.sequences.map((sequence) => migrateOwner(sequence, `sequence:${sequence.id}`, "sequence", library));
  const branches = project.branches.map((branch) => migrateOwner(branch, `branch:${branch.id}`, "branch", library));
  const events = project.events.map((event) => {
    const migratedEvent = migrateOwner(event, `event:${event.id}`, "event", library);
    return {
      ...migratedEvent,
      decisions: migratedEvent.decisions?.map((decision) => ({
        ...migrateOwner(decision, `decision:${event.id}:${decision.id}`, "decision", library),
        outcomes: decision.outcomes.map((outcome) => migrateOwner(outcome, `outcome:${event.id}:${decision.id}:${outcome.id}`, "outcome", library)),
      })),
      dialogues: migratedEvent.dialogues?.map((dialogue) => ({
        ...migrateOwner(dialogue, `dialogue:${event.id}:${dialogue.id}`, "dialogue", library),
        beats: dialogue.beats?.map((beat) => migrateOwner(beat, `beat:${event.id}:${beat.id}`, "beat", library)),
      })),
    };
  });
  const projectDataObjects = project.projectDataObjects?.map((item) => migrateOwner(item, `data:${item.id}`, "dataObject", library));
  return { ...project, sequences, branches, events, projectDataObjects, ruleLibrary: library };
}

export type RuleSetUsage = { ownerId: string; ownerLabel: string; kind: RuleBindingOwnerKind; binding: RuleSetBinding };

export function ruleSetUsages(project: BranchingProject, ruleId: string): RuleSetUsage[] {
  const usages: RuleSetUsage[] = [];
  const add = (ownerId: string, ownerLabel: string, kind: RuleBindingOwnerKind, bindings: RuleSetBinding[] | undefined) =>
    bindings?.filter((binding) => binding.ruleId === ruleId).forEach((binding) => usages.push({ ownerId, ownerLabel, kind, binding }));
  project.sequences.forEach((item) => add(item.id, item.name, "sequence", item.ruleSetBindings));
  project.branches.forEach((item) => add(item.id, item.title, "branch", item.ruleSetBindings));
  project.events.forEach((event) => {
    add(event.id, event.name, "event", event.ruleSetBindings);
    event.decisions?.forEach((item) => {
      add(`decision:${event.id}:${item.id}`, item.name, "decision", item.ruleSetBindings);
      item.outcomes.forEach((outcome) => add(`outcome:${event.id}:${item.id}:${outcome.id}`, outcome.name, "outcome", outcome.ruleSetBindings));
    });
    event.dialogues?.forEach((item) => {
      add(`dialogue:${event.id}:${item.id}`, item.title, "dialogue", item.ruleSetBindings);
      item.beats?.forEach((beat) => add(`beat:${event.id}:${item.id}:${beat.id}`, beat.id, "beat", beat.ruleSetBindings));
    });
  });
  project.projectDataObjects?.forEach((item) => add(item.id, item.name, "dataObject", item.ruleSetBindings));
  return usages;
}
