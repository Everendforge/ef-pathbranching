import type {
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
  description?: string;
  appliesToTypes?: string[];
};

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
  return definitions(config, "customFields").flatMap((value) => {
    const definition = record(value);
    const id = text(definition?.id);
    if (!id) return [];
    return [
      {
        id,
        label: text(definition?.label) ?? id,
        valueType: text(definition?.type) ?? "text",
        description: text(definition?.description),
        appliesToTypes: textArray(definition?.appliesToTypes),
      },
    ];
  });
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
