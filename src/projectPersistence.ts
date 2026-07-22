import { invoke } from "@tauri-apps/api/core";
import type { BranchingProject, ProjectAsset, RuntimePackage } from "./domain.js";
import {
  loadPathBranchingWorkspace,
  pathBranchingMetadataPaths,
  serializeModularStoryFiles,
  serializePathBranchingManifest,
  storyPath,
  workingCopyPathForCanonRef,
  type PathBranchingWorkspace,
  type UniverseFile,
  type UniverseProfile,
} from "./pathBranchingWorkspace.js";
import { normalizeProject, parseProject, projectFileName, serializeProject } from "./projectSerialization.js";
import { serializeIntegrationConfigYaml } from "./integrationConfig.js";
import { isTauriRuntime } from "./utils/appEnvironment.js";
import {
  browserUniversePath,
  ensureBrowserUniverseWritePermission,
  pickBrowserUniverse,
  readBrowserUniverse,
  type BrowserDirectoryHandle,
  writeBrowserUniverseFile,
} from "./utils/browserUniverse.js";
import { createDemoBrowserUniverse } from "./utils/demoBrowserUniverse.js";

export { normalizeProject, parseProject, projectFileName, serializeProject } from "./projectSerialization.js";

export type ProjectFileState = {
  path?: string;
  universePath?: string;
  storyPath?: string;
  dirty: boolean;
  lastSavedAt?: number;
  modifiedMs?: number;
  universeProfile?: UniverseProfile;
};

export type ProjectFilePayload = {
  path: string;
  content: string;
  modifiedMs?: number;
};

export type WriteResult = {
  ok: boolean;
  path: string;
  modifiedMs?: number;
  message?: string;
};

export type SaveUniverseStoryResult = WriteResult & {
  storyPath?: string;
  storyModifiedMs?: number;
  manifest?: PathBranchingWorkspace["manifest"];
  manifestModifiedMs?: number;
};

export type UniverseReadResult = {
  rootPath: string;
  files: Array<UniverseFile & { absolutePath?: string }>;
  directories: string[];
  errors: Array<{ relativePath: string; message: string }>;
};

export type BridgeStatus = {
  ok: boolean;
  runtime: string;
  message: string;
};

export type ImportedAsset = Omit<ProjectAsset, "id" | "origin" | "importedAt">;

let selectedBrowserUniverse: BrowserDirectoryHandle | undefined;

function currentBrowserUniverse(path: string): BrowserDirectoryHandle | undefined {
  if (!selectedBrowserUniverse || path !== browserUniversePath(selectedBrowserUniverse)) return undefined;
  return selectedBrowserUniverse;
}

export async function importUniverseAssets(universePath: string): Promise<ImportedAsset[]> {
  assertDesktopRuntime("Importing assets");
  return invoke<ImportedAsset[]>("import_universe_assets", { universePath });
}

export async function importSceneImages(universePath: string): Promise<ImportedAsset[]> {
  assertDesktopRuntime("Importing scene images");
  return invoke<ImportedAsset[]>("import_scene_images", { universePath });
}

export async function indexCanonAssets(universePath: string): Promise<ImportedAsset[]> {
  assertDesktopRuntime("Indexing Canon assets");
  return invoke<ImportedAsset[]>("index_canon_assets", { universePath });
}

function assertDesktopRuntime(action: string) {
  if (!isTauriRuntime()) {
    throw new Error(`${action} requires the Everend PathBranching desktop app.`);
  }
}

export async function openProjectDialog(): Promise<{ project: BranchingProject; path: string; modifiedMs?: number } | undefined> {
  assertDesktopRuntime("Opening a local project");
  const payload = await invoke<ProjectFilePayload | null>("open_project_dialog");
  if (!payload) {
    return undefined;
  }
  return {
    project: parseProject(payload.content),
    path: payload.path,
    modifiedMs: payload.modifiedMs,
  };
}

export async function openUniverseDialog(): Promise<
  { workspace: PathBranchingWorkspace; path: string; files: UniverseReadResult["files"] } | undefined
> {
  if (!isTauriRuntime()) {
    const picked = await pickBrowserUniverse();
    if (picked.status === "cancelled") return undefined;
    const root = picked.root;
    await ensureBrowserUniverseWritePermission(root);
    const files = await readBrowserUniverse(root);
    selectedBrowserUniverse = root;
    const path = browserUniversePath(root);
    return { workspace: loadPathBranchingWorkspace(files), path, files };
  }
  const payload = await invoke<UniverseReadResult | null>("open_universe_dialog");
  if (!payload) return undefined;
  return {
    workspace: loadPathBranchingWorkspace(payload.files),
    path: payload.rootPath,
    files: payload.files,
  };
}

export async function openDemoUniverse(): Promise<{
  workspace: PathBranchingWorkspace;
  path: string;
  files: UniverseReadResult["files"];
}> {
  const root = createDemoBrowserUniverse();
  const files = await readBrowserUniverse(root);
  selectedBrowserUniverse = root;
  const path = browserUniversePath(root);
  return { workspace: loadPathBranchingWorkspace(files), path, files };
}

export async function verifyDesktopBridge(): Promise<BridgeStatus> {
  assertDesktopRuntime("Checking the WorldNotion bridge");
  return invoke<BridgeStatus>("bridge_status");
}

export async function openUniversePath(path: string): Promise<{
  workspace: PathBranchingWorkspace;
  path: string;
  files: UniverseReadResult["files"];
}> {
  const browserUniverse = currentBrowserUniverse(path);
  if (browserUniverse) {
    const files = await readBrowserUniverse(browserUniverse);
    return { workspace: loadPathBranchingWorkspace(files), path, files };
  }
  if (!isTauriRuntime()) {
    throw new Error("This browser session no longer has access to that folder. Select the universe folder again.");
  }
  assertDesktopRuntime("Opening a recent universe");
  const payload = await invoke<UniverseReadResult>("read_universe_folder", { path });
  return {
    workspace: loadPathBranchingWorkspace(payload.files),
    path: payload.rootPath,
    files: payload.files,
  };
}

export async function openUniverseStory(path: string, storyId: string): Promise<{
  workspace: PathBranchingWorkspace;
  path: string;
  files: UniverseReadResult["files"];
}> {
  const opened = await openUniversePath(path);
  const files = opened.files.map((file) => {
    if (file.relativePath !== pathBranchingMetadataPaths.manifest) {
      return file;
    }
    try {
      const manifest = JSON.parse(file.content) as { activeStoryId?: string; stories?: unknown[] };
      return {
        ...file,
        content: `${JSON.stringify({ ...manifest, activeStoryId: storyId }, null, 2)}\n`,
      };
    } catch {
      return file;
    }
  });
  return {
    workspace: loadPathBranchingWorkspace(files),
    path: opened.path,
    files,
  };
}

export async function openProjectPath(path: string): Promise<{ project: BranchingProject; path: string; modifiedMs?: number }> {
  assertDesktopRuntime("Opening a recent local project");
  const payload = await invoke<ProjectFilePayload>("read_project_file", { path });
  return {
    project: parseProject(payload.content),
    path: payload.path,
    modifiedMs: payload.modifiedMs,
  };
}

export async function saveProjectFile(path: string, project: BranchingProject, expectedModifiedMs?: number): Promise<WriteResult> {
  assertDesktopRuntime("Saving a local project");
  return invoke<WriteResult>("save_project_file", {
    path,
    content: serializeProject(project),
    expectedModifiedMs,
  });
}

export async function saveUniverseTextFile(
  universePath: string,
  relativePath: string,
  content: string,
  expectedModifiedMs?: number,
): Promise<WriteResult> {
  const browserUniverse = currentBrowserUniverse(universePath);
  if (browserUniverse) {
    const modifiedMs = await writeBrowserUniverseFile(browserUniverse, relativePath, content);
    return { ok: true, path: relativePath, modifiedMs };
  }
  assertDesktopRuntime("Saving universe app data");
  return invoke<WriteResult>("save_universe_text_file", {
    universePath,
    relativePath,
    content,
    expectedModifiedMs,
  });
}

export async function saveUniverseStory(
  universePath: string,
  workspace: PathBranchingWorkspace,
  project: BranchingProject,
  expectedModifiedMs?: number,
): Promise<SaveUniverseStoryResult> {
  const story = workspace.activeStory;
  if (!story) {
    throw new Error("No active Everend PathBranching story is available for this universe.");
  }
  const normalizedStory = {
    ...story,
    path: storyPath(story.id),
  };
  const storyFiles = serializeModularStoryFiles(
    {
      ...project,
      storyId: story.id,
      universeRootPath: universePath,
      name: project.name ?? story.name,
    },
    normalizedStory,
  );
  if (
    project.integrationConfig &&
    !workspace.files.some((file) => file.relativePath === pathBranchingMetadataPaths.config)
  ) {
    const configResult = await saveUniverseTextFile(
      universePath,
      pathBranchingMetadataPaths.config,
      serializeIntegrationConfigYaml(project.integrationConfig),
    );
    if (!configResult.ok) return configResult;
  }
  let storyResult: WriteResult | undefined;
  for (const file of storyFiles) {
    const result = await saveUniverseTextFile(
      universePath,
      file.relativePath,
      file.content,
      file.relativePath === normalizedStory.path ? expectedModifiedMs : undefined,
    );
    if (!result.ok) return result;
    if (file.relativePath === normalizedStory.path) {
      storyResult = result;
    }
  }
  if (!storyResult) {
    throw new Error("No Everend PathBranching story metadata file was produced for saving.");
  }
  if (!storyResult.ok) return storyResult;

  const manifest = {
    ...workspace.manifest,
    version: "0.2" as const,
    activeStoryId: normalizedStory.id,
    stories: workspace.manifest.stories.map((item) =>
      item.id === story.id ? { ...item, path: normalizedStory.path, updatedAt: new Date().toISOString() } : item,
    ),
  };
  const manifestResult = await saveUniverseTextFile(
    universePath,
    pathBranchingMetadataPaths.manifest,
    serializePathBranchingManifest(manifest),
  );
  if (!manifestResult.ok) return manifestResult;
  return {
    ...storyResult,
    storyPath: normalizedStory.path,
    storyModifiedMs: storyResult.modifiedMs,
    manifest,
    manifestModifiedMs: manifestResult.modifiedMs,
  };
}

export async function saveUniverseManifest(
  universePath: string,
  manifest: PathBranchingWorkspace["manifest"],
): Promise<WriteResult> {
  return saveUniverseTextFile(
    universePath,
    pathBranchingMetadataPaths.manifest,
    serializePathBranchingManifest(manifest),
  );
}

export async function saveWorkingCopy(
  universePath: string,
  canonRefId: string,
  content: string,
  expectedModifiedMs?: number,
): Promise<WriteResult> {
  return saveUniverseTextFile(universePath, workingCopyPathForCanonRef(canonRefId), content, expectedModifiedMs);
}

export async function revealUniverseFolder(path: string): Promise<WriteResult> {
  assertDesktopRuntime("Revealing a universe folder");
  return invoke<WriteResult>("reveal_universe", { path });
}

export async function saveProjectAsDialog(project: BranchingProject): Promise<WriteResult | undefined> {
  assertDesktopRuntime("Saving a local project");
  const result = await invoke<WriteResult | null>("save_project_as_dialog", {
    content: serializeProject(project),
    defaultName: `${project.projectId || "pathbranching-project"}.pathbranching.json`,
  });
  return result ?? undefined;
}

/**
 * Initializes a properties.json file in the .everend directory using a standard template.
 * Based on the ESTRELLAS CORRUPTAS universe structure.
 */
export async function initializePropertiesFile(universePath: string): Promise<WriteResult> {
  // Template based on ESTRELLAS CORRUPTAS structure
  const propertiesTemplate = {
    "version": "3.0",
    "baseProperties": {
      "definitions": [
        { "id": "id", "label": "ID", "description": "Unique identifier", "type": "text", "immutable": true, "readOnly": true, "required": true, "order": 0 },
        { "id": "name", "label": "Name", "description": "Entity name", "type": "text", "immutable": true, "required": true, "order": 1 },
        { "id": "type", "label": "Type", "description": "Entity type", "type": "select", "immutable": true, "required": true, "order": 2, "options": [{ "value": "character", "label": "Character", "color": "#3b82f6" }, { "value": "location", "label": "Location", "color": "#10b981" }, { "value": "organization", "label": "Organization", "color": "#f59e0b" }, { "value": "concept", "label": "Concept", "color": "#8b5cf6" }, { "value": "item", "label": "Item", "color": "#ec4899" }, { "value": "cycle", "label": "Cycle", "color": "#14b8a6" }, { "value": "universe", "label": "Universe", "color": "#a855f7" }, { "value": "scene", "label": "Scene", "color": "#f97316" }, { "value": "world", "label": "World" }, { "value": "chronology", "label": "Chronology" }] },
        { "id": "status", "label": "Status", "description": "Canon or editorial state", "type": "select", "immutable": true, "required": true, "order": 3, "options": [{ "value": "draft", "label": "Draft", "color": "#6b7280" }, { "value": "in-progress", "label": "In Progress", "color": "#f59e0b" }, { "value": "review", "label": "Review", "color": "#3b82f6" }, { "value": "published", "label": "Published", "color": "#10b981" }, { "value": "archived", "label": "Archived", "color": "#6b7280" }] },
        { "id": "tags", "label": "Tags", "description": "Search and grouping labels", "type": "text", "immutable": true, "order": 4 },
        { "id": "aliases", "label": "Aliases", "description": "Alternate display names or wikilink candidates", "type": "text", "immutable": true, "order": 5 },
        { "id": "parentId", "label": "Parent", "description": "Stable ID of a parent entity", "type": "entity-ref", "immutable": true, "targetTypes": ["character", "location", "organization", "event", "concept", "item", "world", "cycle", "universe", "story", "arc", "scene", "quest"], "order": 6 },
        { "id": "childrenIds", "label": "Children", "description": "Stable IDs of explicit child entities", "type": "entity-ref-list", "immutable": true, "targetTypes": ["character", "location", "organization", "event", "concept", "item", "world", "cycle", "universe", "story", "arc", "scene", "quest"], "order": 7 }
      ],
      "visibleByDefault": ["type", "status", "aliases", "parentId", "childrenIds"],
      "order": ["id", "name", "type", "status", "tags", "aliases", "parentId", "childrenIds"]
    },
    "tags": { "rootNodes": [], "allowCustomTags": true, "autoDetectSlashNotation": true },
    "contentTypes": { "definitions": [{ "id": "folder-description", "label": "Folder Note", "description": "Special note that describes a folder", "icon": "folder", "color": "#64748b", "immutable": true }] },
    "entityTypes": { "definitions": [{ "id": "character", "label": "Character", "description": "Person, creature, or viewpoint actor", "icon": "user", "color": "#3b82f6", "customFields": ["lore-level", "identity", "narrative", "portrait"], "visibleProperties": ["type", "status", "aliases"], "propertyOrder": ["type", "status", "aliases", "lore-level", "identity", "narrative", "portrait"], "presentation": { "portraitPropertyId": "portrait" } }, { "id": "location", "label": "Location", "description": "Place, region, settlement, or site", "icon": "map-pin", "color": "#10b981", "customFields": ["lore-level", "place"], "visibleProperties": ["type", "status", "aliases", "parentId", "childrenIds"], "propertyOrder": ["type", "status", "aliases", "parentId", "childrenIds", "lore-level", "place"], "hiddenProperties": ["status"] }, { "id": "organization", "label": "Organization", "description": "Faction, institution, house, or guild", "icon": "users", "color": "#f59e0b", "customFields": ["lore-level", "identity"], "visibleProperties": ["type", "status", "aliases", "parentId", "childrenIds"], "propertyOrder": ["type", "status", "aliases", "parentId", "childrenIds", "lore-level", "identity"] }, { "id": "concept", "label": "Concept", "description": "Idea, law, magic rule, or abstract note", "icon": "lightbulb", "color": "#8b5cf6", "customFields": ["lore-level"], "visibleProperties": ["type", "status", "parentId", "childrenIds", "lore-level"], "propertyOrder": ["type", "status", "parentId", "childrenIds", "lore-level"], "hiddenProperties": ["aliases", "lore-level", "status"] }, { "id": "item", "label": "Item", "description": "Object, relic, tool, or artifact", "icon": "package", "color": "#ec4899", "customFields": ["lore-level", "identity", "place", "item-details"], "visibleProperties": ["type", "status", "aliases", "parentId", "childrenIds"], "propertyOrder": ["type", "status", "aliases", "parentId", "childrenIds", "lore-level", "identity", "place", "item-details"] }, { "id": "cycle", "label": "Cycle", "description": "Era, cycle, age, or large continuity span", "icon": "refresh-cw", "color": "#14b8a6", "customFields": ["lore-level"], "visibleProperties": ["type", "status", "aliases", "parentId", "childrenIds"], "propertyOrder": ["type", "status", "aliases", "parentId", "childrenIds", "lore-level"] }, { "id": "universe", "label": "Universe", "description": "Top-level canon container or cosmology", "icon": "sparkles", "color": "#a855f7", "customFields": ["lore-level"], "visibleProperties": ["type", "status", "aliases", "parentId", "childrenIds"], "propertyOrder": ["type", "status", "aliases", "parentId", "childrenIds", "lore-level"] }, { "id": "scene", "customFields": [], "label": "Scene", "color": "#f97316", "hiddenProperties": ["aliases"] }, { "id": "world", "customFields": [], "label": "World", "hiddenProperties": ["status"] }, { "id": "chronology", "customFields": [], "label": "Chronology", "hiddenProperties": ["aliases"] }], "defaultType": "concept", "allowCustomTypes": true },
    "statuses": { "definitions": [{ "id": "draft", "label": "Draft", "description": "Work in progress", "color": "#6b7280", "order": 0 }, { "id": "in-progress", "label": "In Progress", "description": "Actively being worked on", "color": "#f59e0b", "order": 1 }, { "id": "review", "label": "Review", "description": "Ready for review", "color": "#3b82f6", "order": 2 }, { "id": "published", "label": "Published", "description": "Finalized and approved", "color": "#10b981", "order": 3 }, { "id": "archived", "label": "Archived", "description": "No longer active", "color": "#6b7280", "order": 4 }], "defaultStatus": "draft", "allowCustomStatuses": true },
    "customFields": { "definitions": [{ "id": "lore-level", "label": "Lore Level", "type": "select", "description": "Level of detail or canonicity for this entity", "required": false, "options": [{ "value": "canon", "label": "Canon", "color": "#10b981" }, { "value": "semi-canon", "label": "Semi-canon", "color": "#f59e0b" }, { "value": "draft", "label": "Draft", "color": "#64748b" }, { "value": "idea", "label": "Idea", "color": "#94a3b8" }], "children": [], "appliesTo": ["character", "location", "organization", "item", "cycle", "universe"] }], "globalFields": ["lore-level"] }
  };
  
  return saveUniverseTextFile(
    universePath,
    ".everend/properties.json",
    JSON.stringify(propertiesTemplate, null, 2),
  );
}

export async function exportRuntimeDialog(runtimePackage: RuntimePackage): Promise<WriteResult | undefined> {
  return exportTextDialog(`${JSON.stringify(runtimePackage, null, 2)}\n`, "runtime-package.json");
}

export async function exportTextDialog(content: string, defaultName: string): Promise<WriteResult | undefined> {
  assertDesktopRuntime("Exporting local files");
  const result = await invoke<WriteResult | null>("export_runtime_dialog", {
    content,
    defaultName,
  });
  return result ?? undefined;
}
