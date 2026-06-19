import { invoke } from "@tauri-apps/api/core";
import type { BranchingProject, RuntimePackage } from "./domain.js";

export type ProjectFileState = {
  path?: string;
  dirty: boolean;
  lastSavedAt?: number;
  modifiedMs?: number;
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

export function projectFileName(path: string | undefined) {
  if (!path) {
    return "Untitled.pathbranching.json";
  }
  return path.split(/[\\/]/).pop() ?? path;
}

export function normalizeProject(project: BranchingProject): BranchingProject {
  const entrySequenceId = project.entrySequenceId ?? project.sequences[0]?.id;
  const activeSequenceId = project.canvas?.activeSequenceId ?? entrySequenceId ?? project.sequences[0]?.id;

  return {
    ...project,
    specVersion: project.specVersion ?? "0.1",
    dataClasses: project.dataClasses ?? [],
    projectDataObjects: project.projectDataObjects ?? [],
    projectionRules: project.projectionRules ?? [],
    graphModules: project.graphModules ?? [],
    panels: {
      canonOpen: project.panels?.canonOpen ?? true,
      filesOpen: project.panels?.filesOpen ?? true,
    },
    canvas: {
      ...project.canvas,
      activeSequenceId,
    },
    entrySequenceId,
    canonRefs: project.canonRefs ?? [],
    sequences: project.sequences ?? [],
    branches: project.branches ?? [],
    events: project.events ?? [],
    scripts: project.scripts ?? [],
    externalFunctions: project.externalFunctions ?? [],
    variables: project.variables ?? {},
  };
}

export function serializeProject(project: BranchingProject) {
  return `${JSON.stringify(project, null, 2)}\n`;
}

export function parseProject(content: string): BranchingProject {
  return normalizeProject(JSON.parse(content) as BranchingProject);
}

export async function openProjectDialog(): Promise<{ project: BranchingProject; path: string; modifiedMs?: number } | undefined> {
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

export async function openProjectPath(path: string): Promise<{ project: BranchingProject; path: string; modifiedMs?: number }> {
  const payload = await invoke<ProjectFilePayload>("read_project_file", { path });
  return {
    project: parseProject(payload.content),
    path: payload.path,
    modifiedMs: payload.modifiedMs,
  };
}

export async function saveProjectFile(path: string, project: BranchingProject, expectedModifiedMs?: number): Promise<WriteResult> {
  return invoke<WriteResult>("save_project_file", {
    path,
    content: serializeProject(project),
    expectedModifiedMs,
  });
}

export async function saveProjectAsDialog(project: BranchingProject): Promise<WriteResult | undefined> {
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
  const result = await invoke<WriteResult | null>("export_runtime_dialog", {
    content,
    defaultName,
  });
  return result ?? undefined;
}
