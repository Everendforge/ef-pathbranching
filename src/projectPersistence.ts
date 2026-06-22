import { invoke } from "@tauri-apps/api/core";
import type { BranchingProject, RuntimePackage } from "./domain.js";
import {
  loadPathBranchingWorkspace,
  pathBranchingMetadataPaths,
  serializePathBranchingManifest,
  serializePathBranchingStory,
  workingCopyPathForCanonRef,
  type PathBranchingWorkspace,
  type UniverseFile,
  type UniverseProfile,
} from "./pathBranchingWorkspace.js";
import { normalizeProject, parseProject, projectFileName, serializeProject } from "./projectSerialization.js";
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

async function saveUniverseTextFile(
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
    throw new Error("No active PathBranching story is available for this universe.");
  }
  const storyResult = await saveUniverseTextFile(
    universePath,
    story.path,
    serializePathBranchingStory({
      ...project,
      storyId: story.id,
      universeRootPath: universePath,
    }),
    expectedModifiedMs,
  );
  if (!storyResult.ok) return storyResult;

  const manifest = {
    ...workspace.manifest,
    activeStoryId: story.id,
    stories: workspace.manifest.stories.map((item) =>
      item.id === story.id ? { ...item, updatedAt: new Date().toISOString() } : item,
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
    storyPath: story.path,
    storyModifiedMs: storyResult.modifiedMs,
    manifest,
    manifestModifiedMs: manifestResult.modifiedMs,
  };
}

export async function saveWorkingCopy(
  universePath: string,
  canonRefId: string,
  content: string,
  expectedModifiedMs?: number,
): Promise<WriteResult> {
  return saveUniverseTextFile(universePath, workingCopyPathForCanonRef(canonRefId), content, expectedModifiedMs);
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
