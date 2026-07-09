import YAML from "yaml";
import type { LocalExplorerEntity } from "./domain.js";

function slug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "entity"
  );
}

export function createLocalExplorerEntity(
  type = "concept",
  name = "New Entity",
  now = new Date().toISOString(),
): LocalExplorerEntity {
  const id = `${type}:${slug(name)}`;
  return {
    id,
    type,
    name,
    status: "draft",
    tags: [],
    aliases: [],
    properties: {},
    body: "",
    createdAt: now,
    updatedAt: now,
  };
}

function safeFolder(folder: string | undefined) {
  const normalized = folder
    ?.trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  return normalized || undefined;
}

export function localEntityPath(
  entity: LocalExplorerEntity,
  suggestedFolder?: string,
) {
  return `${safeFolder(suggestedFolder) ?? `Entities/${entity.type}`}/${slug(entity.name)}.md`;
}

export function serializeLocalExplorerEntity(entity: LocalExplorerEntity) {
  const frontmatter: Record<string, unknown> = {
    id: entity.id,
    type: entity.type,
    name: entity.name,
    status: entity.status,
  };
  if (entity.tags?.length) frontmatter.tags = entity.tags;
  if (entity.aliases?.length) frontmatter.aliases = entity.aliases;
  Object.assign(frontmatter, entity.properties ?? {});
  return `---\n${YAML.stringify(frontmatter)}---\n\n${entity.body ?? ""}`.replace(
    /\n{3,}/g,
    "\n\n",
  );
}
