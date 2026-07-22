import type {
  BranchingProject,
  Consequence,
  EntityRuntimeStateRole,
  LogicComparisonOperator,
  LogicEffect,
  LogicEffectOperation,
  LogicPredicate,
  LogicSubject,
} from "./domain.js";
import { conditionLabels, consequenceLabel, walkConditions } from "./logic.js";
import { typeCapability } from "./explorerSchema.js";

export type LogicCapabilityPurpose = "condition" | "effect";
export type LogicCapabilityStatus = "enabled" | "disabled" | "missing" | "incompatible";

export type LogicSubjectOption = {
  key: string;
  label: string;
  detail: string;
  subject: LogicSubject;
  contextual: boolean;
  typeId?: string;
  color?: string;
  icon?: string;
};

export type LogicFieldOption = {
  key: string;
  label: string;
  kind: "state" | "property" | "value" | "visited" | "external";
  valueType?: string;
  status: LogicCapabilityStatus;
  capabilityTarget?: { source: "canon" | "local"; id: string; kind: "type" | "property" };
};

export type LogicPresentation = {
  id: string;
  text: string;
  subjectLabel: string;
  fieldLabel: string;
  operatorLabel: string;
  valueLabel?: string;
  color?: string;
  icon?: string;
  status: LogicCapabilityStatus;
  capabilityTarget?: LogicFieldOption["capabilityTarget"];
};

export const LOGIC_COMPARISON_OPERATORS: LogicComparisonOperator[] = [
  "==", "!=", ">", ">=", "<", "<=", "contains", "notContains", "exists", "missing", "has",
];

export const LOGIC_ROLE_LABELS: Record<EntityRuntimeStateRole, string> = {
  owned: "Owned",
  unlocked: "Unlocked",
  discovered: "Discovered",
  present: "Present",
};

function normalizedTypeId(value: string | undefined) {
  return value?.startsWith("type:") ? value.slice("type:".length) : value;
}

function propertyDefinition(project: BranchingProject, propertyId: string) {
  const normalized = propertyId.startsWith("property:")
    ? propertyId.slice("property:".length)
    : propertyId;
  return project.localExplorerProperties?.find((property) =>
    property.id === propertyId ||
    property.id === normalized ||
    property.id === `property:${normalized}`,
  );
}

export function logicSubjectKey(subject: LogicSubject): string {
  if (subject.kind === "entity") return `entity:${subject.entityId}`;
  if (subject.kind === "dataObject") return `data:${subject.objectId}`;
  if (subject.kind === "variable") return `variable:${subject.variableId}`;
  if (subject.kind === "progress") return `progress:${subject.targetType}:${subject.targetId}`;
  return `external:${subject.functionId}`;
}

export function logicEntityDescriptor(
  project: BranchingProject,
  subject: LogicSubject,
): { source: "canon" | "local"; typeId?: string; label: string; color?: string; icon?: string } | undefined {
  if (subject.kind !== "entity") return undefined;
  const canon = project.canonRefs.find((item) => item.id === subject.entityId);
  const local = project.localExplorerEntities?.find((item) => item.id === subject.entityId);
  const source = canon ? "canon" as const : local ? "local" as const : undefined;
  if (!source) return undefined;
  const rawTypeId = canon?.kind ?? local?.type;
  const typeId = normalizedTypeId(rawTypeId);
  const localType = project.localExplorerTypes?.find((item) => normalizedTypeId(item.id) === typeId);
  const typeProperty = project.localExplorerProperties?.find((item) =>
    item.valueType === "entity-type" && normalizedTypeId(item.id) === typeId,
  );
  return {
    source,
    typeId,
    label: canon?.label ?? local?.name ?? subject.entityId,
    color: localType?.color ?? typeProperty?.color,
    icon: localType?.icon ?? typeProperty?.icon,
  };
}

export function logicSubjectOptions(
  project: BranchingProject,
  contextEntityIds: string[] = [],
): LogicSubjectOption[] {
  const context = new Set(contextEntityIds);
  const entities: LogicSubjectOption[] = [
    ...project.canonRefs.map((entity) => {
      const subject = { kind: "entity" as const, entityId: entity.id, source: "canon" as const };
      const descriptor = logicEntityDescriptor(project, subject);
      return {
        key: logicSubjectKey(subject),
        label: entity.label ?? entity.id,
        detail: normalizedTypeId(entity.kind) ?? "canon",
        subject,
        contextual: context.has(entity.id),
        typeId: normalizedTypeId(entity.kind),
        color: descriptor?.color,
        icon: descriptor?.icon,
      };
    }),
    ...(project.localExplorerEntities ?? []).map((entity) => {
      const subject = { kind: "entity" as const, entityId: entity.id, source: "local" as const };
      const descriptor = logicEntityDescriptor(project, subject);
      return {
        key: logicSubjectKey(subject),
        label: entity.name,
        detail: normalizedTypeId(entity.type) ?? entity.type,
        subject,
        contextual: context.has(entity.id),
        typeId: normalizedTypeId(entity.type),
        color: descriptor?.color,
        icon: descriptor?.icon,
      };
    }),
  ];
  entities.sort((left, right) => Number(right.contextual) - Number(left.contextual) || left.label.localeCompare(right.label));
  return [
    ...entities,
    ...(project.logicVariables ?? []).map((variable) => ({
      key: `variable:${variable.id}`,
      label: variable.name,
      detail: `variable · ${variable.type}`,
      subject: { kind: "variable" as const, variableId: variable.id },
      contextual: false,
    })),
    ...(project.projectDataObjects ?? []).map((object) => ({
      key: `data:${object.id}`,
      label: object.name,
      detail: "data object",
      subject: { kind: "dataObject" as const, objectId: object.id },
      contextual: false,
    })),
    ...project.events.map((event) => ({
      key: `progress:event:${event.id}`,
      label: event.name,
      detail: "visited event",
      subject: { kind: "progress" as const, targetType: "event" as const, targetId: event.id },
      contextual: false,
    })),
    ...(project.externalFunctions ?? []).map((externalFunction) => ({
      key: `external:${externalFunction.name}`,
      label: externalFunction.name,
      detail: `advanced · ${externalFunction.kind}`,
      subject: { kind: "external" as const, functionId: externalFunction.name },
      contextual: false,
    })),
  ];
}

function inferredEntityValueType(project: BranchingProject, subject: LogicSubject, propertyId: string) {
  if (subject.kind !== "entity") return undefined;
  const canon = project.canonRefs.find((item) => item.id === subject.entityId);
  const local = project.localExplorerEntities?.find((item) => item.id === subject.entityId);
  const value = canon?.properties?.[propertyId] ?? canon?.frontmatter?.[propertyId] ?? local?.properties?.[propertyId];
  if (Array.isArray(value)) return "list";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return typeof value === "string" ? "text" : undefined;
}

export function resolveLogicField(
  project: BranchingProject,
  subject: LogicSubject,
  purpose: LogicCapabilityPurpose,
  fieldKind: LogicFieldOption["kind"],
  fieldId: string,
): LogicFieldOption {
  if (subject.kind === "external") {
    const external = project.externalFunctions.find((item) => item.name === subject.functionId);
    const validKind = purpose === "condition"
      ? external?.kind === "condition" || external?.kind === "transition"
      : external?.kind === "consequence" || external?.kind === "runtimeAction" || external?.kind === "engineSignal";
    return { key: "call", label: external?.name ?? subject.functionId, kind: "external", status: external && validKind ? "enabled" : external ? "incompatible" : "missing" };
  }
  if (subject.kind === "variable") {
    const variable = project.logicVariables?.find((item) => item.id === subject.variableId);
    return { key: "value", label: "Value", kind: "value", valueType: variable?.type, status: variable ? "enabled" : "missing" };
  }
  if (subject.kind === "progress") {
    const exists = subject.targetType === "event" ? project.events.some((item) => item.id === subject.targetId) : true;
    return { key: "visited", label: "Visited", kind: "visited", valueType: "boolean", status: purpose === "effect" ? "incompatible" : exists ? "enabled" : "missing" };
  }
  if (subject.kind === "dataObject") {
    const dataObject = project.projectDataObjects?.find((item) => item.id === subject.objectId);
    if (fieldKind === "state" && fieldId === "exists") {
      return { key: "exists", label: "Exists", kind: "state", valueType: "boolean", status: dataObject ? "enabled" : "missing" };
    }
    const dataClass = project.dataClasses?.find((item) => item.id === dataObject?.classId);
    const field = dataClass?.fields.find((item) => item.name === fieldId);
    return { key: fieldId, label: field?.label ?? fieldId, kind: "property", valueType: field?.type, status: dataObject && field ? "enabled" : "missing" };
  }

  const entity = logicEntityDescriptor(project, subject);
  if (!entity?.typeId) {
    return { key: fieldId, label: fieldId, kind: fieldKind, status: "missing" };
  }
  if (fieldKind === "state") {
    const capability = typeCapability(project, entity.source, entity.typeId);
    const enabled = capability?.runtimeRoles?.includes(fieldId as EntityRuntimeStateRole) === true;
    return {
      key: fieldId,
      label: LOGIC_ROLE_LABELS[fieldId as EntityRuntimeStateRole] ?? fieldId,
      kind: "state",
      valueType: "boolean",
      status: enabled ? "enabled" : "disabled",
      capabilityTarget: { source: entity.source, id: entity.typeId, kind: "type" },
    };
  }
  const property = propertyDefinition(project, fieldId);
  const override = project.logicPropertyOverrides?.find((item) => item.source === entity.source && item.propertyId === fieldId);
  const applies = !property?.appliesToTypes?.length || property.appliesToTypes.some((typeId) => normalizedTypeId(typeId) === entity.typeId);
  const enabled = purpose === "condition" ? override?.conditionReadable === true : override?.actionWritable === true;
  return {
    key: fieldId,
    label: property?.label ?? fieldId,
    kind: "property",
    valueType: property?.valueType ?? inferredEntityValueType(project, subject, fieldId),
    status: !applies ? "incompatible" : enabled ? "enabled" : "disabled",
    capabilityTarget: { source: entity.source, id: fieldId, kind: "property" },
  };
}

export function logicFieldOptions(
  project: BranchingProject,
  subject: LogicSubject,
  purpose: LogicCapabilityPurpose,
): LogicFieldOption[] {
  if (subject.kind === "external") return [resolveLogicField(project, subject, purpose, "external", "call")].filter((field) => field.status === "enabled");
  if (subject.kind === "variable") return [resolveLogicField(project, subject, purpose, "value", "value")].filter((field) => field.status === "enabled");
  if (subject.kind === "progress") return [resolveLogicField(project, subject, purpose, "visited", "visited")].filter((field) => field.status === "enabled");
  if (subject.kind === "dataObject") {
    const dataObject = project.projectDataObjects?.find((item) => item.id === subject.objectId);
    const dataClass = project.dataClasses?.find((item) => item.id === dataObject?.classId);
    const fields = (dataClass?.fields ?? [])
      .map((field) => resolveLogicField(project, subject, purpose, "property", field.name))
      .filter((field) => field.status === "enabled");
    return purpose === "condition"
      ? [resolveLogicField(project, subject, purpose, "state", "exists"), ...fields].filter((field) => field.status === "enabled")
      : fields;
  }
  const entity = logicEntityDescriptor(project, subject);
  if (!entity?.typeId) return [];
  const roles = typeCapability(project, entity.source, entity.typeId)?.runtimeRoles ?? [];
  const states = roles.map((role) => resolveLogicField(project, subject, purpose, "state", role));
  const properties = (project.logicPropertyOverrides ?? [])
    .filter((override) => override.source === entity.source && !override.propertyId.startsWith("type:"))
    .map((override) => resolveLogicField(project, subject, purpose, "property", override.propertyId))
    .filter((field) => field.status === "enabled" && field.valueType !== "group")
    .filter((field, index, fields) => fields.findIndex((candidate) => candidate.key === field.key) === index);
  return [...states, ...properties];
}

export function logicOperatorsFor(field: LogicFieldOption): LogicComparisonOperator[] {
  if (field.kind === "state" || field.kind === "visited" || field.kind === "external") return ["has", "missing"];
  if (field.valueType === "number" || field.valueType === "date") return ["==", "!=", ">", ">=", "<", "<=", "exists", "missing"];
  if (field.valueType === "list" || field.valueType === "multiselect" || field.valueType === "entity-ref-list") return ["contains", "notContains", "exists", "missing"];
  if (field.valueType === "boolean") return ["==", "!=", "exists", "missing"];
  return ["==", "!=", "contains", "notContains", "exists", "missing"];
}

export function logicEffectOperations(field: LogicFieldOption): LogicEffectOperation[] {
  if (field.kind === "state") {
    const operations: Record<string, LogicEffectOperation[]> = {
      owned: ["grant", "ungrant"],
      unlocked: ["unlock", "lock"],
      discovered: ["discover", "hide"],
      present: ["enter", "leave"],
    };
    return operations[field.key] ?? ["set", "toggle"];
  }
  if (field.valueType === "number" || field.valueType === "date") return ["set", "add", "subtract", "clear"];
  if (field.valueType === "list" || field.valueType === "multiselect" || field.valueType === "entity-ref-list") return ["set", "append", "remove", "clear"];
  if (field.valueType === "boolean") return ["set", "toggle", "clear"];
  return ["set", "clear"];
}

export function logicPredicateFor(subject: LogicSubject, field: LogicFieldOption): LogicPredicate {
  if (field.kind === "external" && subject.kind === "external") return { type: "external", subject, operator: "has" };
  if (field.kind === "state") return { type: "state", subject, stateId: field.key, operator: "has" };
  if (field.kind === "visited" && subject.kind === "progress") return { type: "visited", subject, operator: "has" };
  if (field.kind === "value") return { type: "value", subject, operator: "==", value: true };
  return { type: "property", subject, propertyId: field.key, operator: logicOperatorsFor(field)[0] ?? "==", value: "" };
}

export function logicEffectFor(subject: LogicSubject, field: LogicFieldOption): LogicEffect {
  if (field.kind === "external" && subject.kind === "external") return { type: "external", subject, operation: "call" };
  const operation = logicEffectOperations(field)[0] ?? "set";
  if (field.kind === "state") return { type: "state", subject, stateId: field.key, operation };
  if (field.kind === "value") return { type: "value", subject, operation, value: true };
  return { type: "property", subject, propertyId: field.key, operation, value: "" };
}

function subjectPresentation(project: BranchingProject, subject: LogicSubject) {
  const entity = logicEntityDescriptor(project, subject);
  if (entity) return entity;
  if (subject.kind === "variable") {
    const variable = project.logicVariables?.find((item) => item.id === subject.variableId);
    return { label: variable?.name ?? subject.variableId };
  }
  if (subject.kind === "dataObject") {
    const object = project.projectDataObjects?.find((item) => item.id === subject.objectId);
    return { label: object?.name ?? subject.objectId };
  }
  if (subject.kind === "progress") {
    const event = project.events.find((item) => item.id === subject.targetId);
    return { label: event?.name ?? subject.targetId };
  }
  if (subject.kind === "external") return { label: subject.functionId };
  return { label: subject.entityId };
}

function displayValue(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value || "empty";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export function presentLogicPredicate(project: BranchingProject, predicate: LogicPredicate): LogicPresentation {
  const kind = predicate.type === "state" ? "state" : predicate.type === "property" ? "property" : predicate.type === "visited" ? "visited" : predicate.type === "external" ? "external" : "value";
  const fieldId = predicate.type === "state" ? predicate.stateId : predicate.type === "property" ? predicate.propertyId : predicate.type;
  const field = resolveLogicField(project, predicate.subject, "condition", kind, fieldId);
  const subject = subjectPresentation(project, predicate.subject);
  const value = "value" in predicate ? displayValue(predicate.value) : undefined;
  const operator = predicate.operator;
  const text = [subject.label, field.label, operator, !["has", "missing", "exists"].includes(operator) ? value : undefined].filter(Boolean).join(" · ");
  return { id: `${logicSubjectKey(predicate.subject)}:${field.key}:${operator}`, text, subjectLabel: subject.label, fieldLabel: field.label, operatorLabel: operator, valueLabel: value, color: "color" in subject ? subject.color : undefined, icon: "icon" in subject ? subject.icon : undefined, status: field.status, capabilityTarget: field.capabilityTarget };
}

export function presentLogicEffect(project: BranchingProject, effect: LogicEffect): LogicPresentation {
  const kind = effect.type === "state" ? "state" : effect.type === "property" ? "property" : effect.type === "external" ? "external" : "value";
  const fieldId = effect.type === "state" ? effect.stateId : effect.type === "property" ? effect.propertyId : effect.type;
  const field = resolveLogicField(project, effect.subject, "effect", kind, fieldId);
  const subject = subjectPresentation(project, effect.subject);
  const value = "value" in effect ? displayValue(effect.value) : undefined;
  const text = [subject.label, field.label, effect.operation, !["toggle", "clear", "grant", "ungrant", "unlock", "lock", "discover", "hide", "enter", "leave", "call"].includes(effect.operation) ? value : undefined].filter(Boolean).join(" · ");
  return { id: `${logicSubjectKey(effect.subject)}:${field.key}:${effect.operation}`, text, subjectLabel: subject.label, fieldLabel: field.label, operatorLabel: effect.operation, valueLabel: value, color: "color" in subject ? subject.color : undefined, icon: "icon" in subject ? subject.icon : undefined, status: field.status, capabilityTarget: field.capabilityTarget };
}

export function presentConditionInput(project: BranchingProject, input: Parameters<typeof conditionLabels>[0], limit = 3): LogicPresentation[] {
  const presentations: LogicPresentation[] = [];
  walkConditions(input, (condition) => {
    if (presentations.length >= limit) return;
    if ("subject" in condition) presentations.push(presentLogicPredicate(project, condition as LogicPredicate));
  });
  if (presentations.length) return presentations;
  return conditionLabels(input).slice(0, limit).map((text, index) => ({ id: `legacy-condition:${index}:${text}`, text, subjectLabel: "Legacy", fieldLabel: text, operatorLabel: "", status: "enabled" }));
}

export function presentConsequences(project: BranchingProject, consequences: Consequence[] | undefined, limit = 3): LogicPresentation[] {
  return (consequences ?? []).slice(0, limit).map((consequence, index) =>
    "subject" in consequence
      ? presentLogicEffect(project, consequence as LogicEffect)
      : { id: `legacy-effect:${index}`, text: consequenceLabel(consequence), subjectLabel: "Legacy", fieldLabel: consequenceLabel(consequence), operatorLabel: "", status: "enabled" },
  );
}
