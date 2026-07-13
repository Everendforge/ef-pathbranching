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

export async function importUniverseAssets(universePath: string): Promise<ImportedAsset[]> {
  assertDesktopRuntime("Importing assets");
  return invoke<ImportedAsset[]>("import_universe_assets", { universePath });
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
  assertDesktopRuntime("Opening a local universe");
  const payload = await invoke<UniverseReadResult | null>("open_universe_dialog");
  if (!payload) return undefined;
  return {
    workspace: loadPathBranchingWorkspace(payload.files),
    path: payload.rootPath,
    files: payload.files,
  };
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
  assertDesktopRuntime("Opening a universe story");
  const payload = await invoke<UniverseReadResult>("read_universe_folder", { path });
  const files = payload.files.map((file) => {
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
    path: payload.rootPath,
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
