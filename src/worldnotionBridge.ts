import YAML from "yaml";
import type {
  BranchingProject,
  CanonRef,
  ValidationFinding,
} from "./domain.js";

export type WorldNotionVaultFile = {
  relativePath: string;
  content: string;
  modifiedMs?: number;
};

export type WorldNotionEntity = {
  id: string;
  type: string;
  name: string;
  status: string;
  path: string;
  tags: string[];
  aliases: string[];
  parentId?: string;
  childrenIds: string[];
  folder?: string;
  customProperties: Record<string, unknown>;
  frontmatter: Record<string, unknown>;
  body: string;
  content: string;
  modifiedMs?: number;
};

export type WorldNotionPropertiesConfig = Record<string, unknown>;

export type WorldNotionBridgeIndex = {
  entities: WorldNotionEntity[];
  canonRefs: CanonRef[];
  findings: ValidationFinding[];
  typeCounts: Record<string, number>;
  propertiesConfig?: WorldNotionPropertiesConfig;
};

const BASE_ENTITY_FIELDS = new Set([
  "id",
  "type",
  "name",
  "status",
  "tags",
  "aliases",
  "parentId",
  "childrenIds",
  "folder",
]);

function splitMarkdown(content: string): {
  data?: Record<string, unknown>;
  body: string;
  error?: string;
} {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { body: normalized };
  }

  const closingFence = normalized.indexOf("\n---", 4);
  if (closingFence === -1) {
    return { body: normalized, error: "Unterminated YAML frontmatter fence." };
  }

  const frontmatter = normalized.slice(4, closingFence);
  const bodyStart = normalized.indexOf("\n", closingFence + 4);
  const body = bodyStart === -1 ? "" : normalized.slice(bodyStart + 1);
  try {
    const parsed = YAML.parse(frontmatter) as unknown;
    return {
      data:
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {},
      body,
    };
  } catch (error) {
    return {
      body,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      )
    : [];
}

function requiredString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parsePropertiesConfig(
  files: WorldNotionVaultFile[],
  findings: ValidationFinding[],
): WorldNotionPropertiesConfig | undefined {
  const propertiesFile = files.find(
    (file) => file.relativePath === ".everend/properties.json",
  );
  if (!propertiesFile) return undefined;

  try {
    const parsed = JSON.parse(propertiesFile.content) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      findings.push({
        code: "invalid_worldnotion_properties",
        severity: "warning",
        message: "WorldNotion properties config must be a JSON object.",
        ref: propertiesFile.relativePath,
      });
      return undefined;
    }
    return parsed as WorldNotionPropertiesConfig;
  } catch (error) {
    findings.push({
      code: "invalid_worldnotion_properties",
      severity: "warning",
      message: `WorldNotion properties config must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ref: propertiesFile.relativePath,
    });
    return undefined;
  }
}

function isTemplateLikeValue(value: unknown): boolean {
  return (
    typeof value === "string" && value.trim().toLowerCase().includes("template")
  );
}

function isPlaceholderValue(value: unknown): boolean {
  return typeof value === "string" && /\{\{\s*[a-z0-9_-]+\s*\}\}/i.test(value);
}

function isTemplatePath(path: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/").toLowerCase();
  const pathParts = normalizedPath.split("/");
  return (
    normalizedPath.startsWith(".everend/templates/") ||
    pathParts.includes("templates") ||
    pathParts.includes("_templates")
  );
}

function isWorldNotionTemplateFile(
  file: WorldNotionVaultFile,
  data: Record<string, unknown>,
): boolean {
  const normalizedPath = file.relativePath.replace(/\\/g, "/").toLowerCase();
  if (isTemplatePath(normalizedPath)) {
    return true;
  }

  return (
    isTemplateLikeValue(data.type) ||
    isTemplateLikeValue(data.kind) ||
    isTemplateLikeValue(data.status) ||
    data.template === true ||
    isPlaceholderValue(data.id) ||
    isPlaceholderValue(data.name)
  );
}

function toCanonRef(entity: WorldNotionEntity): CanonRef {
  const favorite =
    entity.customProperties.favorite === true ||
    entity.customProperties.starred === true ||
    entity.customProperties.pinned === true ||
    entity.tags.includes("favorite") ||
    entity.tags.includes("favorites");
  return {
    id: entity.id,
    kind: entity.type,
    label: entity.name,
    preview: entity.body.trim().slice(0, 800) || undefined,
    tags: entity.tags,
    status: entity.status,
    favorite,
    aliases: entity.aliases,
    parentId: entity.parentId,
    childrenIds: entity.childrenIds,
    properties: entity.customProperties,
    frontmatter: entity.frontmatter,
    folderDescription:
      entity.type === "folder-description" || typeof entity.folder === "string",
    source: "worldnotion",
    canonSourcePath: entity.path,
    canonSourceModifiedMs: entity.modifiedMs,
  };
}

function slugifyPath(path: string): string {
  return (
    path
      .replace(/\\/g, "/")
      .replace(/\.md$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9/_-]+/g, "-")
      .replace(/[/_]+/g, ":")
      .replace(/^-+|-+$/g, "")
      .replace(/:{2,}/g, ":") || "untitled"
  );
}

function titleFromPath(path: string): string {
  return (
    path
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      ?.replace(/\.md$/i, "")
      .replace(/[-_]+/g, " ")
      .trim() || path
  );
}

function isFolderDescriptionPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/\.md$/i, "");
  const parts = normalized.split("/");
  const basename = parts.at(-1)?.toLowerCase();
  const parent = parts.at(-2)?.toLowerCase();
  return Boolean(
    basename &&
    (basename === "_folder" ||
      basename === "folder" ||
      basename === "index" ||
      basename === parent),
  );
}

function toUnidentifiedCanonRef(
  file: WorldNotionVaultFile,
  body: string,
  reason: string,
): CanonRef {
  return {
    id: `unidentified:${slugifyPath(file.relativePath)}`,
    kind: "unidentified-note",
    label: titleFromPath(file.relativePath),
    preview: body.trim().slice(0, 800) || undefined,
    tags: [],
    favorite: false,
    folderDescription: isFolderDescriptionPath(file.relativePath),
    missingIdentity: true,
    identityWarning: reason,
    source: "worldnotion",
    canonSourcePath: file.relativePath,
    canonSourceModifiedMs: file.modifiedMs,
  };
}

export function indexWorldNotionVaultFiles(
  files: WorldNotionVaultFile[],
): WorldNotionBridgeIndex {
  const findings: ValidationFinding[] = [];
  const entities: WorldNotionEntity[] = [];
  const looseCanonRefs: CanonRef[] = [];
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  const propertiesConfig = parsePropertiesConfig(files, findings);

  files
    .filter((file) => file.relativePath.endsWith(".md"))
    .filter((file) => !file.relativePath.startsWith(".everend/"))
    .forEach((file) => {
      const parsed = splitMarkdown(file.content);
      if (!parsed.data) {
        if (isTemplatePath(file.relativePath)) return;
        const reason = parsed.error
          ? `This note has invalid WorldNotion frontmatter: ${parsed.error}`
          : "This note has no WorldNotion frontmatter/id.";
        looseCanonRefs.push(toUnidentifiedCanonRef(file, parsed.body, reason));
        findings.push({
          code: parsed.error ? "invalid_frontmatter" : "missing_canon_identity",
          severity: "warning",
          message: parsed.error
            ? `WorldNotion note "${file.relativePath}" has invalid frontmatter and was imported as read-only unidentified canon: ${parsed.error}`
            : `WorldNotion note "${file.relativePath}" has no frontmatter/id and was imported as read-only unidentified canon.`,
          ref: file.relativePath,
        });
        return;
      }
      if (isWorldNotionTemplateFile(file, parsed.data)) return;

      const id = requiredString(parsed.data.id);
      const type = requiredString(parsed.data.type);
      const name = requiredString(parsed.data.name);
      const status = requiredString(parsed.data.status) || "unknown";

      if (!id || !type || !name) {
        looseCanonRefs.push(
          toUnidentifiedCanonRef(
            file,
            parsed.body,
            "This note is missing id, type, or name in frontmatter.",
          ),
        );
        findings.push({
          code: "missing_canon_identity",
          severity: "warning",
          message: `WorldNotion note "${file.relativePath}" is missing id, type, or name and was imported as read-only unidentified canon.`,
          ref: file.relativePath,
        });
        return;
      }

      if (seenIds.has(id)) duplicateIds.add(id);
      seenIds.add(id);

      const customProperties = Object.fromEntries(
        Object.entries(parsed.data).filter(
          ([key]) => !BASE_ENTITY_FIELDS.has(key),
        ),
      );

      entities.push({
        id,
        type,
        name,
        status,
        path: file.relativePath,
        tags: stringArray(parsed.data.tags),
        aliases: stringArray(parsed.data.aliases),
        parentId: requiredString(parsed.data.parentId) || undefined,
        childrenIds: stringArray(parsed.data.childrenIds),
        folder: requiredString(parsed.data.folder) || undefined,
        customProperties,
        frontmatter: parsed.data,
        body: parsed.body,
        content: file.content,
        modifiedMs: file.modifiedMs,
      });
    });

  duplicateIds.forEach((id) => {
    findings.push({
      code: "duplicate_id",
      severity: "error",
      message: `Duplicate WorldNotion entity id "${id}".`,
      id,
    });
  });

  const typeCounts = entities.reduce<Record<string, number>>(
    (counts, entity) => {
      counts[entity.type] = (counts[entity.type] ?? 0) + 1;
      return counts;
    },
    {},
  );

  return {
    entities,
    canonRefs: [...entities.map(toCanonRef), ...looseCanonRefs],
    findings,
    typeCounts,
    propertiesConfig,
  };
}

export function createEmptyBranchingProjectFromWorldNotionIndex(
  index: WorldNotionBridgeIndex,
  options: {
    projectId: string;
    name?: string;
    vaultRelativePath?: string;
  },
): BranchingProject {
  return {
    specVersion: "0.1",
    projectId: options.projectId,
    name: options.name,
    sourceVault: {
      kind: "worldnotion",
      relativePath: options.vaultRelativePath,
    },
    canonRefs: index.canonRefs,
    dataClasses: [],
    projectionRules: [],
    graphModules: [],
    sequences: [],
    branches: [],
    events: [],
    scripts: [],
    externalFunctions: [],
    variables: {},
  };
}
