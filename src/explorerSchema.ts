import type {
  BranchingProject,
  CanonRef,
  LocalExplorerProperty,
  LocalExplorerType,
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
    return {
      id,
      label: text(definition?.label) ?? id,
      valueType: text(definition?.type) ?? "text",
      path,
      description: text(definition?.description),
      // WorldNotion v3 stores the type scope in `appliesTo`. Keep the older
      // spelling for imports created before the parent/child property model.
      appliesToTypes: textArray(definition?.appliesTo) ?? textArray(definition?.appliesToTypes),
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
  now = new Date().toISOString(),
): LocalExplorerProperty {
  return {
    id: `property:local-${Date.now().toString(36)}`,
    label: "New local property",
    valueType: "text",
    appliesToTypes: [],
    createdAt: now,
    updatedAt: now,
  };
}
