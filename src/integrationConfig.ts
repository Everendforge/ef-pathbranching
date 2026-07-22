import YAML from "yaml";
import type {
  BranchingProject,
  CanonRef,
  CanonRoleMapping,
  PathBranchingIntegrationConfig,
} from "./domain.js";

export const DEFAULT_INTEGRATION_CONFIG: PathBranchingIntegrationConfig = {
  specVersion: "0.1",
  mappings: [
    {
      id: "worldnotion:character",
      worldnotionTypes: ["character"],
      classId: "class:Speaker",
      roles: ["speaker", "presentation"],
      comparableProperties: ["role", "affiliation"],
      states: ["affiliation", "relationship"],
    },
    {
      id: "worldnotion:knowledge",
      worldnotionTypes: ["concept", "knowledge"],
      classId: "class:KnowledgeEntry",
      roles: ["knowledge", "condition", "unlockable"],
      states: ["known", "unlocked"],
    },
    {
      id: "worldnotion:item",
      worldnotionTypes: ["item"],
      classId: "class:RuntimeItem",
      roles: ["condition", "inventory", "runtime"],
      comparableProperties: ["rarity"],
      states: ["owned", "equipped", "consumed"],
    },
    {
      id: "worldnotion:location",
      worldnotionTypes: ["location"],
      classId: "class:SceneSetting",
      roles: ["scene", "presentation"],
      comparableProperties: ["climate"],
      states: ["visited", "discovered"],
    },
  ],
};

function normalizeMapping(value: unknown): CanonRoleMapping | undefined {
  if (!value || typeof value !== "object") return undefined;
  const mapping = value as Partial<CanonRoleMapping>;
  if (!mapping.id || !mapping.classId) return undefined;
  return {
    id: mapping.id,
    classId: mapping.classId,
    worldnotionTypes: Array.isArray(mapping.worldnotionTypes)
      ? mapping.worldnotionTypes.filter((item): item is string => typeof item === "string")
      : [],
    roles: Array.isArray(mapping.roles)
      ? mapping.roles.filter((item): item is string => typeof item === "string")
      : [],
    ...(Array.isArray(mapping.comparableProperties)
      ? { comparableProperties: mapping.comparableProperties.filter((item): item is string => typeof item === "string") }
      : {}),
    ...(Array.isArray(mapping.states)
      ? { states: mapping.states.filter((item): item is string => typeof item === "string") }
      : {}),
  };
}

export function normalizeIntegrationConfig(
  value: unknown,
  fallback = DEFAULT_INTEGRATION_CONFIG,
): PathBranchingIntegrationConfig {
  if (!value || typeof value !== "object") return fallback;
  const config = value as Partial<PathBranchingIntegrationConfig>;
  const mappings = Array.isArray(config.mappings)
    ? config.mappings.map(normalizeMapping).filter((item): item is CanonRoleMapping => Boolean(item))
    : [];
  return { specVersion: "0.1", mappings };
}

export function mergeIntegrationConfigs(
  base: PathBranchingIntegrationConfig | undefined,
  override: PathBranchingIntegrationConfig | undefined,
): PathBranchingIntegrationConfig {
  const merged = new Map(
    normalizeIntegrationConfig(base).mappings.map((mapping) => [mapping.id, mapping]),
  );
  normalizeIntegrationConfig(override, { specVersion: "0.1", mappings: [] }).mappings.forEach(
    (mapping) => merged.set(mapping.id, mapping),
  );
  return { specVersion: "0.1", mappings: Array.from(merged.values()) };
}

export function parseIntegrationConfigYaml(content: string): PathBranchingIntegrationConfig {
  return normalizeIntegrationConfig(YAML.parse(content));
}

export function serializeIntegrationConfigYaml(config: PathBranchingIntegrationConfig): string {
  return YAML.stringify(normalizeIntegrationConfig(config));
}

export function mappingsForCanonRef(
  project: Pick<BranchingProject, "integrationConfig" | "integrationConfigOverride">,
  canonRef: Pick<CanonRef, "kind"> | undefined,
): CanonRoleMapping[] {
  if (!canonRef?.kind) return [];
  return mergeIntegrationConfigs(project.integrationConfig, project.integrationConfigOverride).mappings.filter(
    (mapping) => mapping.worldnotionTypes.includes(canonRef.kind!),
  );
}

export function canonRefHasRole(
  project: Pick<BranchingProject, "integrationConfig" | "integrationConfigOverride">,
  canonRef: Pick<CanonRef, "kind"> | undefined,
  role: string,
): boolean {
  return mappingsForCanonRef(project, canonRef).some((mapping) => mapping.roles.includes(role));
}
