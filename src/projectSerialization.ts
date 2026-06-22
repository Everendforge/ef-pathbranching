import type { BranchingProject } from "./domain.js";

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
