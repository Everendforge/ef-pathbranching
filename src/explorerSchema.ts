import type {
  BranchingProject,
  CanonRef,
  ExplorerPropertyOption,
  LocalExplorerProperty,
  LocalExplorerType,
  LogicPropertyOverride,
  LogicTypeOverride,
} from "./domain.js";

type UnknownRecord = Record<string, unknown>;

export type CanonExplorerType = {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  color?: string;
  suggestedFolder?: string;
};

export type CanonExplorerProperty = {
  id: string;
  label: string;
  valueType: string;
  /** Stable YAML path from the note's frontmatter root. */
  path: string[];
  description?: string;
  appliesToTypes?: string[];
  required?: boolean;
  options?: ExplorerPropertyOption[];
  children: CanonExplorerProperty[];
};

export type CanonExplorerPropertyType = CanonExplorerType & {
  properties: CanonExplorerProperty[];
};

/**
 * Entity types are exposed in Logic as parent properties. Namespacing their
 * IDs keeps their PathBranching capabilities distinct from a custom field
 * that happens to have the same WorldNotion identifier.
 */
export function canonExplorerTypeProperty(type: CanonExplorerType): CanonExplorerProperty {
  return {
    id: `type:${type.id}`,
    label: type.label,
    valueType: "entity type",
    description: type.description,
    appliesToTypes: [type.id],
    path: [],
    children: [],
  };
}

function record(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function definitions(config: UnknownRecord | undefined, key: string) {
  const section = record(config?.[key]);
  const value = section?.definitions;
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function textArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

function propertyOptions(value: unknown): ExplorerPropertyOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const options = value.flatMap((candidate) => {
    const option = record(candidate);
    const optionValue = text(option?.value);
    if (!optionValue) return [];
    return [{
      value: optionValue,
      label: text(option?.label) ?? optionValue,
      color: text(option?.color),
    }];
  });
  return options.length ? options : undefined;
}

export function canonExplorerTypes(
  config: UnknownRecord | undefined,
): CanonExplorerType[] {
  return definitions(config, "entityTypes").flatMap((value) => {
    const definition = record(value);
    const id = text(definition?.id);
    if (!id) return [];
    return [
      {
        id,
        label: text(definition?.label) ?? id,
        description: text(definition?.description),
        icon: text(definition?.icon),
        color: text(definition?.color),
        suggestedFolder:
          text(definition?.suggestedFolder) ?? text(definition?.folder),
      },
    ];
  });
}

export function canonExplorerProperties(
  config: UnknownRecord | undefined,
): CanonExplorerProperty[] {
  const parse = (
    value: unknown,
    parentPath: string[] = [],
  ): CanonExplorerProperty | undefined => {
    const definition = record(value);
    const id = text(definition?.id);
    if (!id) return undefined;
    const path = [...parentPath, id];
    const required = definition?.required === true;
    const options = propertyOptions(definition?.options);
    return {
      id,
      label: text(definition?.label) ?? id,
      valueType: text(definition?.type) ?? "text",
      path,
      description: text(definition?.description),
      // WorldNotion v3 stores the type scope in `appliesTo`. Keep the older
      // spelling for imports created before the parent/child property model.
      appliesToTypes: textArray(definition?.appliesTo) ?? textArray(definition?.appliesToTypes),
      ...(required ? { required: true } : {}),
      ...(options ? { options } : {}),
      children: Array.isArray(definition?.children)
        ? definition.children
            .map((child) => parse(child, path))
            .filter((child): child is CanonExplorerProperty => Boolean(child))
        : [],
    };
  };
  return definitions(config, "customFields")
    .map((value) => parse(value))
    .filter((property): property is CanonExplorerProperty => Boolean(property));
}

export function flattenCanonExplorerProperties(properties: CanonExplorerProperty[]): CanonExplorerProperty[] {
  return properties.flatMap((property) => [property, ...flattenCanonExplorerProperties(property.children)]);
}

function propertyValueAtPath(
  frontmatter: Record<string, unknown> | undefined,
  path: string[],
): unknown {
  let current: unknown = frontmatter;
  for (const segment of path) {
    const value = record(current);
    if (!value) return undefined;
    current = value[segment];
  }
  return current;
}

function entityTypePresentation(
  config: UnknownRecord | undefined,
  typeId: string | undefined,
): UnknownRecord | undefined {
  if (!typeId) return undefined;
  const definition = definitions(config, "entityTypes").find(
    (candidate) => text(record(candidate)?.id) === typeId,
  );
  return record(record(definition)?.presentation);
}

export type CanonImageProperty = {
  property: CanonExplorerProperty;
  value: string;
};

/**
 * Returns the declared Image values for one canon note. Paths are read from
 * the schema, so image fields inside WorldNotion groups work as well.
 */
export function canonImagePropertiesForRef(
  config: UnknownRecord | undefined,
  ref: Pick<CanonRef, "kind" | "frontmatter">,
): CanonImageProperty[] {
  const type = ref.kind
    ? canonExplorerPropertyTypes(config).find((candidate) => candidate.id === ref.kind)
    : undefined;
  const properties = type
    ? flattenCanonExplorerProperties(type.properties)
    : flattenCanonExplorerProperties(canonExplorerProperties(config));
  return properties.flatMap((property) => {
    if (property.valueType !== "image") return [];
    const value = propertyValueAtPath(ref.frontmatter, property.path);
    return typeof value === "string" && value.trim()
      ? [{ property, value: value.trim() }]
      : [];
  });
}

/** Returns the image configured for an entity type's presentation role. */
export function canonPresentationImageForRef(
  config: UnknownRecord | undefined,
  ref: Pick<CanonRef, "kind" | "frontmatter">,
  role: "portrait" | "cover",
): CanonImageProperty | undefined {
  const presentation = entityTypePresentation(config, ref.kind);
  const propertyId = text(
    presentation?.[role === "portrait" ? "portraitPropertyId" : "coverPropertyId"],
  );
  if (!propertyId) return undefined;
  return canonImagePropertiesForRef(config, ref).find(
    (image) => image.property.id === propertyId,
  );
}

function stringSet(value: unknown) {
  return new Set(textArray(value) ?? []);
}

function propertyForCanonType(
  property: CanonExplorerProperty,
  typeId: string,
  options: { nested: boolean; visibleIds: Set<string>; hiddenIds: Set<string> },
): CanonExplorerProperty | undefined {
  if (options.hiddenIds.has(property.id)) return undefined;

  const appliesToType = !property.appliesToTypes?.length || property.appliesToTypes.includes(typeId);
  const included = options.nested
    ? appliesToType
    : options.visibleIds.has(property.id);

  // In v3, children inherit their parent's type scope. Once the parent is
  // applicable, each child can further narrow that scope for the current type.
  const children = included
    ? property.children
      .map((child) => propertyForCanonType(child, typeId, options))
      .filter((child): child is CanonExplorerProperty => Boolean(child))
    : [];

  if (!included && children.length === 0) return undefined;
  return { ...property, children };
}

/**
 * Projects the WorldNotion property schema into the type-scoped hierarchy
 * consumed by PathBranching's Logic panel. WorldNotion v3 scopes a property
 * through `appliesTo`; older configurations use globalFields/customFields.
 */
export function canonExplorerPropertyTypes(
  config: UnknownRecord | undefined,
): CanonExplorerPropertyType[] {
  const properties = canonExplorerProperties(config);
  const types = canonExplorerTypes(config);
  const customFields = record(config?.customFields);
  const globalFields = stringSet(customFields?.globalFields);
  const nested = text(config?.version) === "3.0";

  if (!types.length) {
    return [{ id: "all", label: "All canon types", properties }];
  }

  return types.map((type) => {
    const definition = definitions(config, "entityTypes").find(
      (candidate) => text(record(candidate)?.id) === type.id,
    );
    const typeDefinition = record(definition);
    const visibleIds = new Set([
      ...globalFields,
      ...stringSet(typeDefinition?.customFields),
      ...stringSet(typeDefinition?.visibleProperties),
    ]);
    const hiddenIds = stringSet(typeDefinition?.hiddenProperties);
    return {
      ...type,
      properties: properties
        .map((property) =>
          propertyForCanonType(property, type.id, { nested, visibleIds, hiddenIds }),
        )
        .filter((property): property is CanonExplorerProperty => Boolean(property)),
    };
  });
}

export function propertyCapability(
  project: Pick<BranchingProject, "logicPropertyOverrides">,
  source: "canon" | "local",
  propertyId: string,
) {
  return project.logicPropertyOverrides?.find(
    (item) => item.propertyId === propertyId && item.source === source,
  );
}

export function typeCapability(
  project: Pick<BranchingProject, "logicTypeOverrides" | "logicPropertyOverrides">,
  source: "canon" | "local",
  typeId: string,
) {
  const normalizedTypeId = typeId.startsWith("type:") ? typeId.slice("type:".length) : typeId;
  const configured = project.logicTypeOverrides?.find(
    (item) =>
      item.source === source &&
      (item.typeId === normalizedTypeId || item.typeId === `type:${normalizedTypeId}`),
  );
  const legacy = project.logicPropertyOverrides?.find(
    (item) => item.propertyId === `type:${normalizedTypeId}` && item.source === source,
  );
  if (!configured && !legacy) return undefined;
  return {
    ...legacy,
    ...configured,
    typeId: normalizedTypeId,
    source,
    runtimeRoles: configured?.runtimeRoles ?? legacy?.runtimeRoles ??
      (configured?.grantable || legacy?.grantable ? ["owned" as const] : undefined),
  };
}

export function isGrantableType(
  project: Pick<BranchingProject, "logicTypeOverrides" | "logicPropertyOverrides">,
  source: "canon" | "local",
  typeId: string,
) {
  const capability = typeCapability(project, source, typeId);
  return capability?.grantable === true || capability?.runtimeRoles?.includes("owned") === true;
}

export function isLocationType(
  project: Pick<BranchingProject, "logicTypeOverrides" | "logicPropertyOverrides">,
  source: "canon" | "local",
  typeId: string,
) {
  return typeCapability(project, source, typeId)?.location === true;
}

export type GrantableEntityOption = { id: string; label: string; source: "canon" | "local"; typeId: string };

/** Merged pool of canon + local entities whose entity type is marked grantable. */
export function grantableEntities(
  project: Pick<BranchingProject, "canonRefs" | "localExplorerEntities" | "logicTypeOverrides" | "logicPropertyOverrides">,
): GrantableEntityOption[] {
  const canonOptions = project.canonRefs
    .filter((ref) => ref.kind && isGrantableType(project, "canon", ref.kind))
    .map((ref) => ({ id: ref.id, label: ref.label ?? ref.id, source: "canon" as const, typeId: ref.kind! }));
  const localOptions = (project.localExplorerEntities ?? [])
    .filter((entity) => isGrantableType(project, "local", entity.type))
    .map((entity) => ({ id: entity.id, label: entity.name, source: "local" as const, typeId: entity.type }));
  return [...canonOptions, ...localOptions];
}

/** Merged pool of canon + local entities whose entity type is marked as a location. */
export function locationEntities(
  project: Pick<BranchingProject, "canonRefs" | "localExplorerEntities" | "logicTypeOverrides" | "logicPropertyOverrides">,
): GrantableEntityOption[] {
  const canonOptions = project.canonRefs
    .filter((ref) => ref.kind && isLocationType(project, "canon", ref.kind))
    .map((ref) => ({ id: ref.id, label: ref.label ?? ref.id, source: "canon" as const, typeId: ref.kind! }));
  const localOptions = (project.localExplorerEntities ?? [])
    .filter((entity) => isLocationType(project, "local", entity.type))
    .map((entity) => ({ id: entity.id, label: entity.name, source: "local" as const, typeId: entity.type }));
  return [...canonOptions, ...localOptions];
}

/**
 * Merged pool of canon + local entities eligible as an entity-ref/entity-ref-list
 * target, filtered by `targetTypes` (canon `kind` or local `type`) when set.
 * An empty/undefined `targetTypes` allows every entity, mirroring WorldNotion's
 * entity-ref eligibility rule.
 */
export function entityRefOptions(
  project: Pick<BranchingProject, "canonRefs" | "localExplorerEntities">,
  targetTypes: string[] | undefined,
): GrantableEntityOption[] {
  const allowed = targetTypes?.length ? new Set(targetTypes) : undefined;
  const canonOptions = project.canonRefs
    .filter((ref) => !allowed || (ref.kind && allowed.has(ref.kind)))
    .map((ref) => ({ id: ref.id, label: ref.label ?? ref.id, source: "canon" as const, typeId: ref.kind ?? "" }));
  const localOptions = (project.localExplorerEntities ?? [])
    .filter((entity) => !allowed || allowed.has(entity.type))
    .map((entity) => ({ id: entity.id, label: entity.name, source: "local" as const, typeId: entity.type }));
  return [...canonOptions, ...localOptions];
}

export function propertyIsEntityPresentable(
  project: Pick<BranchingProject, "logicPropertyOverrides">,
  source: "canon" | "local",
  propertyId: string,
) {
  return propertyCapability(project, source, propertyId)?.entityPresentable === true;
}

export function propertySupportsDialogueTrigger(
  project: Pick<BranchingProject, "logicPropertyOverrides">,
  source: "canon" | "local",
  propertyId: string,
) {
  const capability = propertyCapability(project, source, propertyId);
  return capability?.entityPresentable === true && capability.dialogueTrigger === true;
}

/**
 * Generic, temporary list of interaction verbs used as the Dialogue Trigger
 * "trigger property" until per-entity property wiring is finalized.
 */
export const DIALOGUE_TRIGGER_ACTIONS: Array<{ id: string; label: string }> = [
  { id: "talk", label: "Talk" },
  { id: "attack", label: "Attack" },
  { id: "inspect", label: "Inspect" },
  { id: "use", label: "Use" },
  { id: "trade", label: "Trade" },
];

/**
 * Verifies an entity is correctly configured to appear as a Dialogue Trigger:
 * it owns at least one property marked both Entity presentable and Dialogue Trigger.
 */
export function entitySupportsDialogueTrigger(
  project: Pick<BranchingProject, "logicPropertyOverrides">,
  ref: { kind?: string; properties?: Record<string, unknown>; frontmatter?: Record<string, unknown> },
): boolean {
  const hasOwnProperty = (propertyId: string) =>
    [ref.properties, ref.frontmatter].some(
      (record) => Boolean(record && Object.prototype.hasOwnProperty.call(record, propertyId)),
    );
  if (ref.kind && propertySupportsDialogueTrigger(project, "canon", `type:${ref.kind}`)) {
    return true;
  }
  return (project.logicPropertyOverrides ?? []).some(
    (override) =>
      override.source === "canon" &&
      override.entityPresentable === true &&
      override.dialogueTrigger === true &&
      hasOwnProperty(override.propertyId),
  );
}

export function createLocalExplorerType(
  now = new Date().toISOString(),
): LocalExplorerType {
  return {
    id: `type:local-${Date.now().toString(36)}`,
    label: "New local type",
    icon: "circle",
    createdAt: now,
    updatedAt: now,
  };
}

export function createLocalExplorerProperty(
  label = "New local property",
  valueType: LocalExplorerProperty["valueType"] = "text",
  options?: {
    description?: string;
    required?: boolean;
    options?: ExplorerPropertyOption[];
    targetTypes?: string[];
    appliesToTypes?: string[];
    icon?: string;
    color?: string;
    suggestedFolder?: string;
  },
  now = new Date().toISOString(),
): LocalExplorerProperty {
  // Entity-type properties use "type:" prefix for capability routing
  const prefix = valueType === "entity-type" ? "type:" : "property:";
  return {
    id: `${prefix}local-${Date.now().toString(36)}`,
    label,
    valueType,
    ...(options?.description ? { description: options.description } : {}),
    ...(options?.required ? { required: options.required } : {}),
    ...(options?.options ? { options: options.options } : {}),
    appliesToTypes: options?.appliesToTypes ?? [],
    ...(options?.targetTypes ? { targetTypes: options.targetTypes } : {}),
    ...(options?.icon ? { icon: options.icon } : {}),
    ...(options?.color ? { color: options.color } : {}),
    ...(options?.suggestedFolder ? { suggestedFolder: options.suggestedFolder } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function createEntityTypeProperty(
  label = "New entity type",
  icon = "circle",
  color?: string,
  suggestedFolder?: string,
  now = new Date().toISOString(),
): LocalExplorerProperty {
  return createLocalExplorerProperty(label, "entity-type", {
    icon,
    ...(color ? { color } : {}),
    ...(suggestedFolder ? { suggestedFolder } : {}),
  }, now);
}

/**
 * Converts LocalExplorerType array to LocalExplorerProperty array with valueType: "entity-type".
 * Used during data migration to unify types and properties.
 */
export function migrateLocalTypesToProperties(
  types: LocalExplorerType[] | undefined,
): LocalExplorerProperty[] {
  if (!types || types.length === 0) return [];
  return types.map((type) => ({
    id: `type:${type.id}`,
    label: type.label,
    valueType: "entity-type" as const,
    description: type.description,
    icon: type.icon,
    color: type.color,
    suggestedFolder: type.suggestedFolder,
    appliesToTypes: [],
    createdAt: type.createdAt,
    updatedAt: type.updatedAt,
  }));
}

/**
 * Converts LogicTypeOverride array to LogicPropertyOverride entries.
 * Each type override becomes a property override with the corresponding entity-type property ID.
 * Used during data migration.
 */
export function migrateLogicTypeOverridesToPropertyOverrides(
  typeOverrides: LogicTypeOverride[] | undefined,
): LogicPropertyOverride[] {
  if (!typeOverrides || typeOverrides.length === 0) return [];
  return typeOverrides.map((override) => ({
    propertyId: `type:${override.typeId}`,
    source: override.source,
    grantable: override.grantable,
    location: override.location,
  }));
}

/**
 * Runs migration utilities on a BranchingProject to convert types to properties.
 * - Converts localExplorerTypes to localExplorerProperties with entity-type valueType
 * - Converts logicTypeOverrides to logicPropertyOverrides
 * - Merges migrated properties with existing properties (types first, then properties)
 * - Merges migrated overrides with existing overrides
 * Returns new project with migrated data; original project unchanged.
 */
export function migrateProjectTypesToProperties(
  project: BranchingProject,
): BranchingProject {
  const hasLocalTypes = project.localExplorerTypes && project.localExplorerTypes.length > 0;
  const hasTypeOverrides = project.logicTypeOverrides && project.logicTypeOverrides.length > 0;

  if (!hasLocalTypes && !hasTypeOverrides) {
    return project; // Nothing to migrate
  }

  // Check if migration already completed: 
  // If there are entity-type properties with "type:" prefix, migration is done
  const existingEntityTypeProps = (project.localExplorerProperties ?? []).filter(
    (prop) => prop.valueType === "entity-type",
  );
  
  const migrationAlreadyDone = existingEntityTypeProps.length > 0 && 
    existingEntityTypeProps.every((prop) => prop.id.startsWith("type:"));

  if (migrationAlreadyDone) {
    return project; // Already migrated, skip to avoid duplicates
  }

  // Prevent duplicate migration: if we have BOTH types and type-prefixed properties, 
  // it means migration started but was interrupted - remove the old types array
  if (hasLocalTypes && existingEntityTypeProps.length > 0) {
    return {
      ...project,
      localExplorerTypes: undefined,
      logicTypeOverrides: undefined,
    };
  }

  const migratedTypeProperties = migrateLocalTypesToProperties(project.localExplorerTypes);
  const migratedTypeOverrides = migrateLogicTypeOverridesToPropertyOverrides(
    project.logicTypeOverrides,
  );

  // Merge properties: migrated types first, then existing properties
  const mergedProperties = [
    ...migratedTypeProperties,
    ...(project.localExplorerProperties ?? []),
  ];

  // Merge overrides: migrated type overrides first, then existing property overrides
  const mergedOverrides = [
    ...migratedTypeOverrides,
    ...(project.logicPropertyOverrides ?? []),
  ];

  return {
    ...project,
    localExplorerProperties: mergedProperties,
    logicPropertyOverrides: mergedOverrides.length > 0 ? mergedOverrides : undefined,
    // Note: localExplorerTypes and logicTypeOverrides remain in the project for backward compat
    // They will be removed in Phase 6 (Cleanup & Validation)
  };
}
