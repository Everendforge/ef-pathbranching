import type { BranchingProject, EventCategoryDefinition } from "./domain.js";

export function projectFileName(path: string | undefined) {
  if (!path) {
    return "Untitled.pathbranching.json";
  }
  return path.split(/[\\/]/).pop() ?? path;
}

export const DEFAULT_EVENT_CATEGORIES: EventCategoryDefinition[] = [
  { id: "normal", label: "Event" },
  { id: "final", label: "Final", terminal: true },
];

function labelFromCategoryId(id: string) {
  return id
    .split(/[-_:]/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ") || id;
}

function normalizeEventCategories(project: BranchingProject): EventCategoryDefinition[] {
  const categories = new Map<string, EventCategoryDefinition>();
  DEFAULT_EVENT_CATEGORIES.forEach((category) => categories.set(category.id, category));
  (project.eventCategories ?? []).forEach((category) => {
    if (!category.id) return;
    const migratedLabel = category.id === "normal" && category.label === "Normal" ? "Event" : category.label;
    categories.set(category.id, {
      ...category,
      label: migratedLabel || labelFromCategoryId(category.id),
      terminal: category.id === "final" ? true : category.id === "normal" ? false : category.terminal,
    });
  });
  (project.events ?? []).forEach((event) => {
    if (!event.type || categories.has(event.type)) return;
    categories.set(event.type, { id: event.type, label: labelFromCategoryId(event.type) });
  });
  return Array.from(categories.values());
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
    eventCategories: normalizeEventCategories(project),
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
