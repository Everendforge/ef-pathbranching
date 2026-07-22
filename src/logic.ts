import type {
  BranchingProject,
  Condition,
  ConditionExpression,
  ConditionInput,
  ConditionSet,
  Consequence,
  LogicComparisonOperator,
  LogicEffect,
  LogicMoment,
  LogicPredicate,
  LogicSubject,
  LogicVariable,
  PlayerSimulationState,
  ProjectDataObject,
  Transition,
} from "./domain.js";

export type NarrativeEvaluationState = {
  variables?: Record<string, unknown>;
  canonStates?: Record<string, Record<string, unknown>>;
  visited?: Set<string> | string[];
  dataObjects?: ProjectDataObject[];
  /** Grantable entity ids the player currently holds (mirrors PlayerSimulationState.inventory). */
  inventory?: Set<string> | string[];
  unlockedCanonRefs?: Set<string> | string[];
  entityStates?: PlayerSimulationState["entityStates"];
};

function compareValues(left: unknown, operator: string, right: unknown): boolean {
  if (operator === "exists") return left !== undefined && left !== null;
  if (operator === "contains") return Array.isArray(left) ? left.includes(right) : String(left ?? "").includes(String(right ?? ""));
  if (operator === "notContains") return Array.isArray(left) ? !left.includes(right) : !String(left ?? "").includes(String(right ?? ""));
  if (operator === "missing") return left === undefined || left === null || left === false;
  if (operator === "has") return left !== undefined && left !== null && left !== false;
  if (operator === "==") return left === right || String(left) === String(right);
  if (operator === "!=") return !(left === right || String(left) === String(right));
  if (operator === ">") return Number(left) > Number(right);
  if (operator === ">=") return Number(left) >= Number(right);
  if (operator === "<") return Number(left) < Number(right);
  if (operator === "<=") return Number(left) <= Number(right);
  return false;
}

type LogicProject = Pick<BranchingProject, "canonRefs" | "localExplorerEntities">;

function subjectEntityId(subject: LogicSubject): string | undefined {
  return subject.kind === "entity" ? subject.entityId : undefined;
}

function stateValue(
  subject: LogicSubject,
  stateId: string,
  state: NarrativeEvaluationState,
): unknown {
  if (subject.kind === "dataObject") {
    return stateId === "exists"
      ? Boolean(state.dataObjects?.some((item) => item.id === subject.objectId))
      : undefined;
  }
  if (subject.kind === "progress") {
    const visited = state.visited instanceof Set ? state.visited : new Set(state.visited ?? []);
    return visited.has(`${subject.targetType}:${subject.targetId}`) || visited.has(subject.targetId);
  }
  const entityId = subjectEntityId(subject);
  if (!entityId) return undefined;
  const overlay = state.entityStates?.[entityId]?.states?.[stateId];
  if (overlay !== undefined) return overlay;
  if (stateId === "owned") {
    const inventory = state.inventory instanceof Set ? state.inventory : new Set(state.inventory ?? []);
    return inventory.has(entityId);
  }
  if (stateId === "unlocked") {
    const unlocked = state.unlockedCanonRefs instanceof Set
      ? state.unlockedCanonRefs
      : new Set(state.unlockedCanonRefs ?? []);
    return unlocked.has(entityId) || state.canonStates?.[entityId]?.unlocked === true;
  }
  return state.canonStates?.[entityId]?.[stateId];
}

function subjectPropertyValue(
  subject: LogicSubject,
  propertyId: string,
  project: LogicProject,
  state: NarrativeEvaluationState,
): unknown {
  if (subject.kind === "variable") return state.variables?.[subject.variableId];
  if (subject.kind === "dataObject") {
    return state.dataObjects?.find((item) => item.id === subject.objectId)?.fields[propertyId];
  }
  if (subject.kind !== "entity") return undefined;
  const overlay = state.entityStates?.[subject.entityId]?.properties?.[propertyId];
  if (overlay !== undefined) return overlay;
  const canon = project.canonRefs.find((item) => item.id === subject.entityId);
  if (canon?.properties && propertyId in canon.properties) return canon.properties[propertyId];
  if (canon?.frontmatter && propertyId in canon.frontmatter) return canon.frontmatter[propertyId];
  return project.localExplorerEntities
    ?.find((item) => item.id === subject.entityId)
    ?.properties?.[propertyId];
}

function evaluateLogicPredicate(
  condition: LogicPredicate,
  project: LogicProject,
  state: NarrativeEvaluationState,
): boolean {
  if (condition.type === "state") {
    return compareValues(stateValue(condition.subject, condition.stateId, state), condition.operator, condition.value ?? true);
  }
  if (condition.type === "property") {
    return compareValues(
      subjectPropertyValue(condition.subject, condition.propertyId, project, state),
      condition.operator,
      condition.value,
    );
  }
  if (condition.type === "value") {
    return compareValues(subjectPropertyValue(condition.subject, "value", project, state), condition.operator, condition.value);
  }
  if (condition.type === "visited") {
    return compareValues(stateValue(condition.subject, "visited", state), condition.operator, true);
  }
  return false;
}

export function evaluateCondition(
  condition: Condition,
  project: LogicProject,
  state: NarrativeEvaluationState,
): boolean {
  const raw = condition as Record<string, unknown>;
  if (raw.subject && typeof raw.subject === "object") {
    return evaluateLogicPredicate(condition as LogicPredicate, project, state);
  }
  if (condition.type === "canonEntryUnlocked") {
    const ref = String(raw.ref ?? "");
    const unlocked = state.canonStates?.[ref]?.unlocked === true;
    return condition.negate ? !unlocked : unlocked;
  }
  if (condition.type === "canonProperty") {
    const ref = String(raw.ref ?? "");
    const property = String(raw.property ?? "");
    const canonRef = project.canonRefs.find((item) => item.id === ref);
    return compareValues(canonRef?.properties?.[property], String(raw.operator ?? "=="), raw.value);
  }
  if (condition.type === "canonState") {
    const ref = String(raw.ref ?? "");
    const stateName = String(raw.state ?? "");
    return compareValues(state.canonStates?.[ref]?.[stateName], String(raw.operator ?? "=="), raw.value);
  }
  if (condition.type === "variable") {
    return compareValues(state.variables?.[String(raw.name ?? "")], String(raw.operator ?? "=="), raw.value);
  }
  if (condition.type === "dataObjectExists") {
    return Boolean(state.dataObjects?.some((item) => item.id === String(raw.objectId ?? "")));
  }
  if (condition.type === "dataObjectField") {
    const dataObject = state.dataObjects?.find((item) => item.id === String(raw.objectId ?? ""));
    return compareValues(dataObject?.fields[String(raw.field ?? "")], String(raw.operator ?? "=="), raw.value);
  }
  if (condition.type === "runtimeItem") {
    const itemId = String(raw.itemId ?? "");
    const inventory = state.inventory instanceof Set ? state.inventory : new Set(state.inventory ?? []);
    const owned = inventory.has(itemId);
    return condition.operator === "missing" ? !owned : owned;
  }
  if (condition.type === "visited") {
    const visited = state.visited instanceof Set ? state.visited : new Set(state.visited ?? []);
    const targetType = String(raw.targetType ?? "event");
    const targetId = String(raw.targetId ?? "");
    const hasVisited = visited.has(`${targetType}:${targetId}`) || visited.has(targetId);
    return raw.negate ? !hasVisited : hasVisited;
  }
  return false;
}

function evaluateExpression(
  expression: ConditionExpression,
  project: LogicProject,
  state: NarrativeEvaluationState,
): boolean {
  if (!isConditionSet(expression)) return evaluateCondition(expression, project, state);
  if ("all" in expression) return expression.all.every((item) => evaluateExpression(item, project, state));
  if ("any" in expression) return expression.any.some((item) => evaluateExpression(item, project, state));
  return !evaluateExpression(expression.not, project, state);
}

export function evaluateConditionInput(
  input: ConditionInput | undefined,
  project: LogicProject,
  state: NarrativeEvaluationState,
): boolean {
  if (!input) return true;
  return (Array.isArray(input) ? input : [input]).every((expression) => evaluateExpression(expression, project, state));
}

export function orderedTransitions(transitions: Transition[]): Transition[] {
  return [...transitions].sort((a, b) => {
    if (a.mode === "fallback" && b.mode !== "fallback") return 1;
    if (b.mode === "fallback" && a.mode !== "fallback") return -1;
    return (a.order ?? 0) - (b.order ?? 0);
  });
}

export function resolveFirstValidTransition(
  transitions: Transition[],
  project: LogicProject,
  state: NarrativeEvaluationState,
): Transition | undefined {
  return orderedTransitions(transitions).find(
    (transition) =>
      transition.mode === "fallback" ||
      transition.logic?.when === undefined && transition.role === "flow" ||
      evaluateConditionInput(transition.logic?.when ?? transition.conditions, project, state),
  );
}

/** Filters a list of consequences down to the ones whose own (optional) `conditions` gate currently passes. */
export function resolveConsequences(
  consequences: Consequence[] | undefined,
  project: LogicProject,
  state: NarrativeEvaluationState,
): Consequence[] {
  return (consequences ?? []).filter((consequence) =>
    evaluateConditionInput("conditions" in consequence ? consequence.conditions : undefined, project, state),
  );
}

function applyValueOperation(current: unknown, operation: string, value: unknown): unknown {
  if (operation === "toggle") return !Boolean(current);
  if (operation === "add") return Number(current ?? 0) + Number(value ?? 0);
  if (operation === "subtract") return Number(current ?? 0) - Number(value ?? 0);
  if (operation === "append") {
    const values = Array.isArray(current) ? current : [];
    return values.includes(value) ? values : [...values, value];
  }
  if (operation === "remove") return Array.isArray(current) ? current.filter((item) => item !== value) : current;
  if (operation === "clear") return undefined;
  return value;
}

function stateOperationValue(operation: string, value: unknown): boolean {
  if (["grant", "unlock", "discover", "enter"].includes(operation)) return true;
  if (["ungrant", "lock", "hide", "leave", "clear"].includes(operation)) return false;
  if (operation === "toggle") return !Boolean(value);
  return Boolean(value);
}

export function applyLogicEffect(effect: LogicEffect, state: PlayerSimulationState): PlayerSimulationState {
  if (effect.type === "external") return state;
  if (effect.type === "value" && effect.subject.kind === "variable") {
    const current = state.variables?.[effect.subject.variableId];
    return {
      ...state,
      variables: {
        ...state.variables,
        [effect.subject.variableId]: applyValueOperation(current, effect.operation, effect.value),
      },
    };
  }
  if (effect.subject.kind !== "entity") return state;
  const entityId = effect.subject.entityId;
  const currentEntity = state.entityStates?.[entityId] ?? {};
  if (effect.type === "state") {
    const currentValue = currentEntity.states?.[effect.stateId];
    const nextValue = effect.operation === "toggle"
      ? !Boolean(currentValue)
      : stateOperationValue(effect.operation, effect.value);
    const next: PlayerSimulationState = {
      ...state,
      entityStates: {
        ...state.entityStates,
        [entityId]: {
          ...currentEntity,
          states: { ...currentEntity.states, [effect.stateId]: nextValue },
        },
      },
    };
    if (effect.stateId === "owned") {
      next.inventory = nextValue
        ? Array.from(new Set([...(state.inventory ?? []), entityId]))
        : (state.inventory ?? []).filter((id) => id !== entityId);
    }
    if (effect.stateId === "unlocked") {
      next.unlockedCanonRefs = nextValue
        ? Array.from(new Set([...(state.unlockedCanonRefs ?? []), entityId]))
        : (state.unlockedCanonRefs ?? []).filter((id) => id !== entityId);
    }
    return next;
  }
  if (effect.type !== "property") return state;
  const current = currentEntity.properties?.[effect.propertyId];
  const value = applyValueOperation(current, effect.operation, effect.value);
  return {
    ...state,
    entityStates: {
      ...state.entityStates,
      [entityId]: {
        ...currentEntity,
        properties: { ...currentEntity.properties, [effect.propertyId]: value },
      },
    },
    grantableProperties: {
      ...state.grantableProperties,
      [entityId]: { ...state.grantableProperties?.[entityId], [effect.propertyId]: value },
    },
  };
}

/** Pure reducer applying a single consequence onto player simulation state. */
export function applyConsequence(consequence: Consequence, state: PlayerSimulationState): PlayerSimulationState {
  if ("subject" in consequence) return applyLogicEffect(consequence as LogicEffect, state);
  if (consequence.type === "addGrantable") {
    const inventory = state.inventory ?? [];
    return inventory.includes(consequence.entityId)
      ? state
      : { ...state, inventory: [...inventory, consequence.entityId] };
  }
  if (consequence.type === "removeGrantable") {
    return { ...state, inventory: (state.inventory ?? []).filter((id) => id !== consequence.entityId) };
  }
  if (consequence.type === "editGrantable") {
    return {
      ...state,
      grantableProperties: {
        ...state.grantableProperties,
        [consequence.entityId]: {
          ...state.grantableProperties?.[consequence.entityId],
          [consequence.propertyId]: consequence.value,
        },
      },
    };
  }
  return { ...state, variables: { ...state.variables, [consequence.name]: consequence.value } };
}

export function isConditionSet(expression: ConditionExpression): expression is ConditionSet {
  return "all" in expression || "any" in expression || "not" in expression;
}

export function asConditionExpressions(input: ConditionInput | undefined): ConditionExpression[] {
  if (!input) {
    return [];
  }
  return Array.isArray(input) ? input : [input];
}

export function walkConditions(
  input: ConditionInput | undefined,
  visit: (condition: Condition, path: string) => void,
  path = "conditions",
) {
  asConditionExpressions(input).forEach((expression, index) => {
    walkConditionExpression(expression, visit, `${path}[${index}]`);
  });
}

function walkConditionExpression(
  expression: ConditionExpression,
  visit: (condition: Condition, path: string) => void,
  path: string,
) {
  if (!isConditionSet(expression)) {
    visit(expression, path);
    return;
  }

  if ("all" in expression) {
    expression.all.forEach((child, index) => walkConditionExpression(child, visit, `${path}.all[${index}]`));
    return;
  }

  if ("any" in expression) {
    expression.any.forEach((child, index) => walkConditionExpression(child, visit, `${path}.any[${index}]`));
    return;
  }

  walkConditionExpression(expression.not, visit, `${path}.not`);
}

export function conditionCount(input: ConditionInput | undefined): number {
  let count = 0;
  walkConditions(input, () => {
    count += 1;
  });
  return count;
}

function variableIdForName(name: string, variables: LogicVariable[]): string {
  return variables.find((variable) => variable.id === name || variable.name === name)?.id ?? name;
}

function migrateCondition(condition: Condition, variables: LogicVariable[]): Condition {
  if ("subject" in condition) return condition;
  const raw = condition as Record<string, unknown>;
  if (condition.type === "canonEntryUnlocked") {
    return {
      type: "state",
      subject: { kind: "entity", entityId: String(raw.ref ?? ""), source: "canon" },
      stateId: "unlocked",
      operator: condition.negate ? "missing" : "has",
    };
  }
  if (condition.type === "canonProperty" || condition.type === "canonState") {
    return {
      type: "property",
      subject: { kind: "entity", entityId: String(raw.ref ?? ""), source: "canon" },
      propertyId: String(condition.type === "canonProperty" ? raw.property ?? "" : raw.state ?? ""),
      operator: String(raw.operator ?? "==") as LogicComparisonOperator,
      value: raw.value,
    } as Condition;
  }
  if (condition.type === "variable") {
    return {
      type: "value",
      subject: { kind: "variable", variableId: variableIdForName(String(raw.name ?? ""), variables) },
      operator: String(raw.operator ?? "==") as "==",
      value: raw.value,
    };
  }
  if (condition.type === "dataObjectExists") {
    return {
      type: "state",
      subject: { kind: "dataObject", objectId: String(raw.objectId ?? "") },
      stateId: "exists",
      operator: "has",
    };
  }
  if (condition.type === "dataObjectField") {
    return {
      type: "property",
      subject: { kind: "dataObject", objectId: String(raw.objectId ?? "") },
      propertyId: String(raw.field ?? ""),
      operator: String(raw.operator ?? "==") as "==",
      value: raw.value,
    };
  }
  if (condition.type === "runtimeItem") {
    return {
      type: "state",
      subject: { kind: "entity", entityId: String(raw.itemId ?? "") },
      stateId: "owned",
      operator: condition.operator === "missing" ? "missing" : "has",
    };
  }
  if (condition.type === "visited") {
    return {
      type: "visited",
      subject: {
        kind: "progress",
        targetType: condition.targetType,
        targetId: condition.targetId,
      },
      operator: condition.negate ? "missing" : "has",
    };
  }
  if (condition.type === "externalFunction") {
    return {
      type: "external",
      subject: { kind: "external", functionId: String(raw.name ?? "") },
      operator: "has",
      arguments: Array.isArray(raw.arguments) ? raw.arguments : undefined,
    };
  }
  return condition;
}

function migrateExpression(expression: ConditionExpression, variables: LogicVariable[]): ConditionExpression {
  if (!isConditionSet(expression)) return migrateCondition(expression, variables);
  if ("all" in expression) return { ...expression, all: expression.all.map((child) => migrateExpression(child, variables)) };
  if ("any" in expression) return { ...expression, any: expression.any.map((child) => migrateExpression(child, variables)) };
  return { ...expression, not: migrateExpression(expression.not, variables) };
}

export function migrateConditionInput(
  input: ConditionInput | undefined,
  variables: LogicVariable[] = [],
): ConditionInput | undefined {
  if (!input) return undefined;
  return Array.isArray(input)
    ? input.map((expression) => migrateExpression(expression, variables))
    : migrateExpression(input, variables);
}

export function migrateConsequence(consequence: Consequence, variables: LogicVariable[] = []): LogicEffect {
  if ("subject" in consequence) return consequence as LogicEffect;
  if (consequence.type === "addGrantable" || consequence.type === "removeGrantable") {
    return {
      type: "state",
      subject: { kind: "entity", entityId: consequence.entityId },
      stateId: "owned",
      operation: consequence.type === "addGrantable" ? "grant" : "ungrant",
    };
  }
  if (consequence.type === "editGrantable") {
    return {
      type: "property",
      subject: { kind: "entity", entityId: consequence.entityId },
      propertyId: consequence.propertyId,
      operation: "set",
      value: consequence.value,
    };
  }
  return {
    type: "value",
    subject: { kind: "variable", variableId: variableIdForName(consequence.name, variables) },
    operation: "set",
    value: consequence.value,
  };
}

export function migrateLogicMoment(
  ownerId: string,
  when: ConditionInput | undefined,
  consequences: Consequence[] | undefined,
  existing: LogicMoment | undefined,
  variables: LogicVariable[] = [],
): LogicMoment | undefined {
  const migratedWhen = migrateConditionInput(existing?.when ?? when, variables);
  const sourceEffects = existing?.then ?? consequences ?? [];
  const then: LogicEffect[] = [];
  const rules = [...(existing?.rules ?? [])];
  sourceEffects.forEach((consequence, index) => {
    const guarded = "conditions" in consequence ? consequence.conditions : undefined;
    const effect = migrateConsequence(consequence, variables);
    if (guarded) {
      rules.push({
        id: `rule:legacy:${ownerId}:${index}`,
        when: migrateConditionInput(guarded, variables)!,
        then: [effect],
      });
    } else {
      then.push(effect);
    }
  });
  const migratedRules = rules.map((rule) => ({
    ...rule,
    when: migrateConditionInput(rule.when, variables)!,
    then: rule.then.map((effect) => migrateConsequence(effect, variables)),
  }));
  if (!migratedWhen && !then.length && !migratedRules.length) return undefined;
  return {
    ...(migratedWhen ? { when: migratedWhen } : {}),
    ...(then.length ? { then } : {}),
    ...(migratedRules.length ? { rules: migratedRules } : {}),
  };
}

export function inferredTransitionRole(transition: Transition, siblingCount = 1): "flow" | "route" {
  if (transition.role) return transition.role;
  return siblingCount > 1 ||
    transition.mode === "fallback" ||
    Boolean(transition.conditions ?? transition.logic?.when) ||
    Boolean((transition.consequences ?? transition.logic?.then)?.length) ||
    Boolean(transition.function)
    ? "route"
    : "flow";
}

export function conditionLabel(condition: Condition): string {
  if ("subject" in condition) {
    const predicate = condition as LogicPredicate;
    const subject = predicate.subject;
    const subjectId = subject.kind === "entity"
      ? subject.entityId
      : subject.kind === "dataObject"
        ? subject.objectId
        : subject.kind === "variable"
          ? subject.variableId
          : subject.kind === "progress"
            ? subject.targetId
            : subject.functionId;
    if (predicate.type === "state") return `${subjectId} ${predicate.operator} ${predicate.stateId}`;
    if (predicate.type === "property") return `${subjectId}.${predicate.propertyId} ${predicate.operator}`;
    if (predicate.type === "value") return `${subjectId} ${predicate.operator}`;
    if (predicate.type === "visited") return `${predicate.operator === "missing" ? "not visited" : "visited"} ${subjectId}`;
    return `call ${subjectId}`;
  }
  if (condition.type === "canonEntryUnlocked") {
    return condition.negate ? "unless canon" : "requires canon";
  }
  if (condition.type === "canonProperty") {
    return `${condition.property} ${condition.operator}`;
  }
  if (condition.type === "canonState") {
    return `${condition.state} ${condition.operator}`;
  }
  if (condition.type === "variable") {
    return `${condition.name} ${condition.operator}`;
  }
  if (condition.type === "dataObjectExists") {
    return "requires data";
  }
  if (condition.type === "dataObjectField") {
    return `${condition.field} ${condition.operator}`;
  }
  if (condition.type === "runtimeItem") {
    return condition.operator === "missing" ? "missing item" : "has item";
  }
  if (condition.type === "visited") {
    return condition.negate ? `not visited ${condition.targetType}` : `visited ${condition.targetType}`;
  }
  return condition.type;
}

export function conditionLabels(input: ConditionInput | undefined): string[] {
  const labels: string[] = [];
  walkConditions(input, (condition) => {
    labels.push(conditionLabel(condition));
  });
  return labels;
}

export function consequenceLabel(consequence: Consequence): string {
  if ("subject" in consequence) {
    const subject = consequence.subject;
    const subjectId = subject.kind === "entity"
      ? subject.entityId
      : subject.kind === "dataObject"
        ? subject.objectId
        : subject.kind === "variable"
          ? subject.variableId
          : subject.kind === "progress"
            ? subject.targetId
            : subject.functionId;
    if (consequence.type === "state") return `${consequence.operation} ${subjectId}`;
    if (consequence.type === "property") return `${consequence.operation} ${subjectId}.${consequence.propertyId}`;
    if (consequence.type === "value") return `${consequence.operation} ${subjectId}`;
    return `call ${subjectId}`;
  }
  if (consequence.type === "addGrantable") {
    return "grant item";
  }
  if (consequence.type === "removeGrantable") {
    return "remove item";
  }
  if (consequence.type === "editGrantable") {
    return `edit ${consequence.propertyId}`;
  }
  return "set variable";
}

export function conditionInputsFromConsequences(consequences: Consequence[] | undefined): ConditionInput[] {
  return (consequences ?? []).flatMap((consequence) => {
    if (!("conditions" in consequence)) {
      return [];
    }
    return isConditionInput(consequence.conditions) ? [consequence.conditions] : [];
  });
}

function isConditionInput(value: unknown): value is ConditionInput {
  if (!value || typeof value !== "object") {
    return false;
  }
  return true;
}
