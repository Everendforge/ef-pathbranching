import type { BranchingProject } from "./domain.js";
import {
  createEmptyBranchingProjectFromWorldNotionIndex,
  indexWorldNotionVaultFiles,
  type WorldNotionBridgeIndex,
  type WorldNotionVaultFile,
} from "./worldnotionBridge.js";
import {
  normalizeProject,
  parseProject,
  serializeProject,
} from "./projectSerialization.js";
import { machineLocale, normalizeLocaleList, normalizeLocaleNames, normalizeLocalizationCatalog } from "./localization.js";
import {
  DEFAULT_INTEGRATION_CONFIG,
  parseIntegrationConfigYaml,
  serializeIntegrationConfigYaml,
} from "./integrationConfig.js";

export const pathBranchingMetadataPaths = {
  root: ".everend/.pathbranching",
  manifest: ".everend/.pathbranching/manifest.json",
  config: ".everend/.pathbranching/config.yaml",
  stories: ".everend/.pathbranching/stories",
  workingCopies: ".everend/.pathbranching/working-copies",
  changeSets: ".everend/changes",
} as const;

export type UniverseFile = WorldNotionVaultFile & {
  modifiedMs?: number;
};

export type UniverseIcon = {
  type: "preset" | "image";
  value: string;
};

export type UniverseProfile = {
  name?: string;
  icon?: UniverseIcon;
  taxonomyVersion?: string;
  localization?: {
    primaryLocale: string;
    locales: string[];
    localeNames?: Record<string, string>;
  };
};

export type PathBranchingStoryManifestEntry = {
  id: string;
  name: string;
  path: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PathBranchingManifest = {
  version: "0.1" | "0.2";
  activeStoryId?: string;
  stories: PathBranchingStoryManifestEntry[];
};

export type PathBranchingWorkspace = {
  manifest: PathBranchingManifest;
  universeProfile?: UniverseProfile;
  canonIndex: WorldNotionBridgeIndex;
  files: UniverseFile[];
  activeStory?: PathBranchingStoryManifestEntry;
  activeProject: BranchingProject;
  storyModifiedMs?: number;
  createdDefaultStory: boolean;
  loadWarnings?: string[];
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function defaultStoryId(files: UniverseFile[]): string {
  const universeFile = files.find(
    (file) => file.relativePath === ".everend/universe.json",
  );
  if (universeFile) {
    try {
      const parsed = JSON.parse(universeFile.content) as { name?: unknown };
      if (typeof parsed.name === "string") {
        const slug = slugify(parsed.name);
        if (slug) return slug;
      }
    } catch {
      // Fall back to the generic story id.
    }
  }
  return "main";
}

export function storyPath(storyId: string): string {
  return `${storyDirectory(storyId)}/story.json`;
}

export function legacyStoryPath(storyId: string): string {
  return `${pathBranchingMetadataPaths.stories}/${storyId}.pathbranching.json`;
}

export function workingCopyPathForCanonRef(canonRefId: string): string {
  const slug = slugify(canonRefId) || "canon-ref";
  return `${pathBranchingMetadataPaths.workingCopies}/${slug}.md`;
}

export function storyDirectory(storyId: string): string {
  return `${pathBranchingMetadataPaths.stories}/${storyId}`;
}

export function sequenceDirectory(storyId: string, sequenceId: string): string {
  return `${storyDirectory(storyId)}/sequences/${slugify(sequenceId) || sequenceId}`;
}

export function sequencePath(storyId: string, sequenceId: string): string {
  return `${sequenceDirectory(storyId, sequenceId)}/sequence.json`;
}

export function eventPath(
  storyId: string,
  sequenceId: string,
  eventId: string,
): string {
  return `${sequenceDirectory(storyId, sequenceId)}/events/${slugify(eventId) || eventId}.json`;
}

export function branchPath(
  storyId: string,
  sequenceId: string,
  branchId: string,
): string {
  return `${sequenceDirectory(storyId, sequenceId)}/branches/${slugify(branchId) || branchId}.json`;
}

export function authoringCanvasPath(storyId: string): string {
  return `${storyDirectory(storyId)}/authoring/canvas.json`;
}

export function storyIntegrationConfigPath(storyId: string): string {
  return `${storyDirectory(storyId)}/config.yaml`;
}

function parseIntegrationConfigFile(files: UniverseFile[], relativePath: string) {
  const file = files.find((candidate) => candidate.relativePath === relativePath);
  if (!file) return undefined;
  try {
    return parseIntegrationConfigYaml(file.content);
  } catch {
    return undefined;
  }
}

function parseManifest(
  files: UniverseFile[],
  loadWarnings: string[],
): PathBranchingManifest | undefined {
  const manifestFile = files.find(
    (file) => file.relativePath === pathBranchingMetadataPaths.manifest,
  );
  if (!manifestFile) return undefined;

  let parsed: { version?: unknown; activeStoryId?: unknown; stories?: unknown };
  try {
    parsed = JSON.parse(manifestFile.content) as {
      version?: unknown;
      activeStoryId?: unknown;
      stories?: unknown;
    };
  } catch (error) {
    loadWarnings.push(
      `Could not parse ${pathBranchingMetadataPaths.manifest}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
  const stories = Array.isArray(parsed.stories) ? parsed.stories : [];
  const normalizedStories = stories
    .filter((story): story is PathBranchingStoryManifestEntry => {
      return (
        typeof story === "object" &&
        story !== null &&
        "id" in story &&
        "name" in story &&
        "path" in story &&
        typeof story.id === "string" &&
        typeof story.name === "string" &&
        typeof story.path === "string"
      );
    })
    .map((story) => ({ ...story }));
  if (stories.length && normalizedStories.length !== stories.length) {
    loadWarnings.push(
      `Ignored ${stories.length - normalizedStories.length} invalid PathBranching manifest story entries.`,
    );
  }
  return {
    version: parsed.version === "0.2" ? "0.2" : "0.1",
    activeStoryId:
      typeof parsed.activeStoryId === "string"
        ? parsed.activeStoryId
        : undefined,
    stories: normalizedStories,
  };
}

function parseUniverseProfile(
  files: UniverseFile[],
): UniverseProfile | undefined {
  const profileFile = files.find(
    (file) => file.relativePath === ".everend/universe.json",
  );
  if (!profileFile) return undefined;

  try {
    const parsed = JSON.parse(profileFile.content) as UniverseProfile | null;
    if (!parsed || typeof parsed !== "object") return undefined;
    const icon: UniverseIcon | undefined =
      parsed.icon?.type && parsed.icon.value
        ? {
            type: parsed.icon.type === "image" ? "image" : "preset",
            value: String(parsed.icon.value),
          }
        : undefined;
    return {
      name:
        typeof parsed.name === "string" && parsed.name.trim()
          ? parsed.name.trim()
          : undefined,
      icon,
      taxonomyVersion:
        typeof parsed.taxonomyVersion === "string"
          ? parsed.taxonomyVersion
          : undefined,
      localization: (() => {
        const primaryLocale = parsed.localization?.primaryLocale || machineLocale();
        const locales = normalizeLocaleList(primaryLocale, parsed.localization?.locales ?? []);
        return {
          primaryLocale,
          locales,
          localeNames: normalizeLocaleNames(parsed.localization?.localeNames, locales),
        };
      })(),
    };
  } catch {
    return undefined;
  }
}

function createDefaultProject(
  files: UniverseFile[],
  canonIndex: WorldNotionBridgeIndex,
  storyId: string,
  name = "Branching Story",
): BranchingProject {
  return normalizeProject(
    createEmptyBranchingProjectFromWorldNotionIndex(canonIndex, {
      projectId: `pathbranching:${storyId}`,
      name,
      vaultRelativePath: ".",
    }),
  );
}

type ModularStoryFile = {
  storageVersion?: string;
  specVersion?: "0.1";
  projectId?: string;
  storyId?: string;
  universeRootPath?: string;
  name?: string;
  sourceVault?: BranchingProject["sourceVault"];
  dataClasses?: BranchingProject["dataClasses"];
  projectDataObjects?: BranchingProject["projectDataObjects"];
  canonEditSuggestions?: BranchingProject["canonEditSuggestions"];
  projectionRules?: BranchingProject["projectionRules"];
  graphModules?: BranchingProject["graphModules"];
  entrySequenceId?: string;
  eventCategories?: BranchingProject["eventCategories"];
  canonRefs?: BranchingProject["canonRefs"];
  scripts?: BranchingProject["scripts"];
  scriptDocuments?: BranchingProject["scriptDocuments"];
  externalFunctions?: BranchingProject["externalFunctions"];
  variables?: BranchingProject["variables"];
  engineTargets?: BranchingProject["engineTargets"];
  sequenceIds?: string[];
};

function parseJsonFile<T>(file: UniverseFile | undefined): T | undefined {
  if (!file) return undefined;
  try {
    return JSON.parse(file.content) as T;
  } catch {
    return undefined;
  }
}

function unwrapSequence(
  parsed: unknown,
): BranchingProject["sequences"][number] | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  const value =
    "sequence" in parsed ? (parsed as { sequence?: unknown }).sequence : parsed;
  if (!value || typeof value !== "object") return undefined;
  const sequence = value as BranchingProject["sequences"][number];
  return typeof sequence.id === "string" && typeof sequence.name === "string"
    ? sequence
    : undefined;
}

function unwrapEvent(
  parsed: unknown,
): BranchingProject["events"][number] | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  const value =
    "event" in parsed ? (parsed as { event?: unknown }).event : parsed;
  if (!value || typeof value !== "object") return undefined;
  const event = value as BranchingProject["events"][number];
  return typeof event.id === "string" && typeof event.name === "string"
    ? event
    : undefined;
}

function unwrapBranch(
  parsed: unknown,
): BranchingProject["branches"][number] | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  const value =
    "branch" in parsed ? (parsed as { branch?: unknown }).branch : parsed;
  if (!value || typeof value !== "object") return undefined;
  const branch = value as BranchingProject["branches"][number];
  return typeof branch.id === "string" && typeof branch.title === "string"
    ? branch
    : undefined;
}

function parseModularStoryProject(
  files: UniverseFile[],
  story: PathBranchingStoryManifestEntry,
  storyId: string,
): { project: BranchingProject; modifiedMs?: number } | undefined {
  const modularPath = story.path.endsWith("/story.json")
    ? story.path
    : storyPath(storyId);
  const storyFile = files.find((file) => file.relativePath === modularPath);
  const parsedStory = parseJsonFile<ModularStoryFile>(storyFile);
  if (!storyFile || !parsedStory) return undefined;
  if (
    parsedStory.storageVersion !== "0.2" &&
    !Array.isArray(parsedStory.sequenceIds)
  )
    return undefined;

  const sequenceIds = Array.isArray(parsedStory.sequenceIds)
    ? parsedStory.sequenceIds
    : [];
  const sequences = sequenceIds
    .map((sequenceId) =>
      parseJsonFile<unknown>(
        files.find(
          (file) => file.relativePath === sequencePath(storyId, sequenceId),
        ),
      ),
    )
    .map(unwrapSequence)
    .filter((sequence): sequence is BranchingProject["sequences"][number] =>
      Boolean(sequence),
    );

  const eventIds = new Set(
    sequences.flatMap((sequence) => sequence.eventIds ?? []),
  );
  const branchIds = new Set(
    sequences.flatMap((sequence) => sequence.branchIds ?? []),
  );
  const sequenceOwnerByEvent = new Map<string, string>();
  const sequenceOwnerByBranch = new Map<string, string>();
  sequences.forEach((sequence) => {
    sequence.eventIds?.forEach((eventId) =>
      sequenceOwnerByEvent.set(eventId, sequence.id),
    );
    sequence.branchIds?.forEach((branchId) =>
      sequenceOwnerByBranch.set(branchId, sequence.id),
    );
  });

  const events = Array.from(eventIds)
    .map((eventId) => {
      const sequenceId = sequenceOwnerByEvent.get(eventId);
      return sequenceId
        ? parseJsonFile<unknown>(
            files.find(
              (file) =>
                file.relativePath === eventPath(storyId, sequenceId, eventId),
            ),
          )
        : undefined;
    })
    .map(unwrapEvent)
    .filter((event): event is BranchingProject["events"][number] =>
      Boolean(event),
    );

  const branches = Array.from(branchIds)
    .map((branchId) => {
      const sequenceId = sequenceOwnerByBranch.get(branchId);
      return sequenceId
        ? parseJsonFile<unknown>(
            files.find(
              (file) =>
                file.relativePath === branchPath(storyId, sequenceId, branchId),
            ),
          )
        : undefined;
    })
    .map(unwrapBranch)
    .filter((branch): branch is BranchingProject["branches"][number] =>
      Boolean(branch),
    );

  const authoring = parseJsonFile<{
    canvas?: BranchingProject["canvas"];
    panels?: BranchingProject["panels"];
  }>(files.find((file) => file.relativePath === authoringCanvasPath(storyId)));

  return {
    modifiedMs: storyFile.modifiedMs,
    project: normalizeProject({
      specVersion: parsedStory.specVersion ?? "0.1",
      projectId: parsedStory.projectId ?? `pathbranching:${storyId}`,
      storyId,
      universeRootPath: parsedStory.universeRootPath,
      name: parsedStory.name ?? story.name,
      sourceVault: parsedStory.sourceVault,
      dataClasses: parsedStory.dataClasses,
      projectDataObjects: parsedStory.projectDataObjects,
      canonEditSuggestions: parsedStory.canonEditSuggestions,
      projectionRules: parsedStory.projectionRules,
      graphModules: parsedStory.graphModules,
      canvas: authoring?.canvas,
      panels: authoring?.panels,
      entrySequenceId: parsedStory.entrySequenceId,
      eventCategories: parsedStory.eventCategories,
      canonRefs: parsedStory.canonRefs ?? [],
      sequences,
      branches,
      events,
      scripts: parsedStory.scripts ?? [],
      scriptDocuments: parsedStory.scriptDocuments ?? [],
      integrationConfig:
        parseIntegrationConfigFile(files, pathBranchingMetadataPaths.config) ??
        DEFAULT_INTEGRATION_CONFIG,
      integrationConfigOverride: parseIntegrationConfigFile(
        files,
        storyIntegrationConfigPath(storyId),
      ),
      externalFunctions: parsedStory.externalFunctions ?? [],
      variables: parsedStory.variables ?? {},
      engineTargets: parsedStory.engineTargets,
    }),
  };
}

function parseLegacyStoryProject(
  files: UniverseFile[],
  story: PathBranchingStoryManifestEntry,
  storyId: string,
): { project: BranchingProject; modifiedMs?: number } | undefined {
  const legacyPath = story.path.endsWith(".pathbranching.json")
    ? story.path
    : legacyStoryPath(storyId);
  const storyFile = files.find((file) => file.relativePath === legacyPath);
  if (!storyFile) return undefined;
  return {
    project: normalizeProject({
      ...parseProject(storyFile.content),
      storyId,
    }),
    modifiedMs: storyFile.modifiedMs,
  };
}

function mergeCanonRefs(
  canonIndex: WorldNotionBridgeIndex,
  storyProject: BranchingProject,
) {
  const storyRefs = new Map(storyProject.canonRefs.map((ref) => [ref.id, ref]));
  return canonIndex.canonRefs.map((ref) => {
    const storyRef = storyRefs.get(ref.id);
    return {
      ...ref,
      workingCopyPath: storyRef?.workingCopyPath,
    };
  });
}

export function loadPathBranchingWorkspace(
  files: UniverseFile[],
): PathBranchingWorkspace {
  const canonIndex = indexWorldNotionVaultFiles(files);
  const universeProfile = parseUniverseProfile(files);
  const loadWarnings: string[] = [];
  const parsedManifest = parseManifest(files, loadWarnings);
  const fallbackStoryId = defaultStoryId(files);
  const now = new Date().toISOString();
  const hasPersistedManifest = Boolean(parsedManifest?.stories.length);
  const manifest =
    parsedManifest && parsedManifest.stories.length
      ? parsedManifest
      : {
          version: "0.1" as const,
          activeStoryId: fallbackStoryId,
          stories: [
            {
              id: fallbackStoryId,
              name: "Branching Story",
              path: storyPath(fallbackStoryId),
              createdAt: now,
              updatedAt: now,
            },
          ],
        };

  const activeStory =
    manifest.stories.find((story) => story.id === manifest.activeStoryId) ??
    manifest.stories[0];
  const loadedStory = activeStory
    ? (parseModularStoryProject(files, activeStory, activeStory.id) ??
      parseLegacyStoryProject(files, activeStory, activeStory.id))
    : undefined;
  if (hasPersistedManifest && activeStory && !loadedStory) {
    loadWarnings.push(
      `Could not load PathBranching story "${activeStory.name}" from ${activeStory.path}.`,
    );
  }
  const activeProject =
    loadedStory?.project ??
    createDefaultProject(
      files,
      canonIndex,
      activeStory?.id ?? fallbackStoryId,
      activeStory?.name,
    );

  return {
    manifest: {
      ...manifest,
      activeStoryId: activeStory?.id,
    },
    universeProfile,
    canonIndex,
    files: [...files],
    activeStory,
    activeProject: normalizeLocalizationCatalog(normalizeProject({
      ...activeProject,
      storyId: activeStory?.id ?? fallbackStoryId,
      integrationConfig:
        parseIntegrationConfigFile(files, pathBranchingMetadataPaths.config) ??
        activeProject.integrationConfig ??
        DEFAULT_INTEGRATION_CONFIG,
      integrationConfigOverride:
        (activeStory
          ? parseIntegrationConfigFile(files, storyIntegrationConfigPath(activeStory.id))
          : undefined) ?? activeProject.integrationConfigOverride,
      canonRefs: mergeCanonRefs(canonIndex, activeProject),
    }), universeProfile?.localization?.primaryLocale ?? machineLocale()),
    storyModifiedMs: loadedStory?.modifiedMs,
    createdDefaultStory: !hasPersistedManifest,
    loadWarnings: loadWarnings.length ? loadWarnings : undefined,
  };
}

export function serializePathBranchingManifest(
  manifest: PathBranchingManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function serializePathBranchingStory(project: BranchingProject): string {
  return serializeProject(project);
}

function ownerSequenceIdForEvent(
  project: BranchingProject,
  eventId: string,
): string | undefined {
  return (
    project.sequences.find((sequence) => sequence.eventIds.includes(eventId))
      ?.id ??
    project.canvas?.activeSequenceId ??
    project.entrySequenceId ??
    project.sequences[0]?.id
  );
}

function ownerSequenceIdForBranch(
  project: BranchingProject,
  branchId: string,
): string | undefined {
  return (
    project.sequences.find((sequence) => sequence.branchIds?.includes(branchId))
      ?.id ??
    project.sequences.find((sequence) =>
      project.branches
        .find((branch) => branch.id === branchId)
        ?.eventIds.some((eventId) => sequence.eventIds.includes(eventId)),
    )?.id ??
    project.canvas?.activeSequenceId ??
    project.entrySequenceId ??
    project.sequences[0]?.id
  );
}

export function serializeModularStoryFiles(
  projectInput: BranchingProject,
  story: PathBranchingStoryManifestEntry,
): Array<{ relativePath: string; content: string }> {
  const project = normalizeProject({
    ...projectInput,
    storyId: story.id,
    name: projectInput.name ?? story.name,
  });
  const storyMetadata: ModularStoryFile = {
    storageVersion: "0.2",
    specVersion: project.specVersion,
    projectId: project.projectId,
    storyId: story.id,
    universeRootPath: project.universeRootPath,
    name: project.name ?? story.name,
    sourceVault: project.sourceVault,
    dataClasses: project.dataClasses,
    projectDataObjects: project.projectDataObjects,
    canonEditSuggestions: project.canonEditSuggestions,
    projectionRules: project.projectionRules,
    graphModules: project.graphModules,
    entrySequenceId: project.entrySequenceId,
    eventCategories: project.eventCategories,
    canonRefs: project.canonRefs,
    scripts: project.scripts,
    scriptDocuments: project.scriptDocuments,
    externalFunctions: project.externalFunctions,
    variables: project.variables,
    engineTargets: project.engineTargets,
    sequenceIds: project.sequences.map((sequence) => sequence.id),
  };

  const files: Array<{ relativePath: string; content: string }> = [
    {
      relativePath: storyPath(story.id),
      content: `${JSON.stringify(storyMetadata, null, 2)}\n`,
    },
    {
      relativePath: authoringCanvasPath(story.id),
      content: `${JSON.stringify({ storageVersion: "0.2", storyId: story.id, canvas: project.canvas, panels: project.panels }, null, 2)}\n`,
    },
  ];

  if (project.integrationConfigOverride?.mappings.length) {
    files.push({
      relativePath: storyIntegrationConfigPath(story.id),
      content: serializeIntegrationConfigYaml(project.integrationConfigOverride),
    });
  }

  project.sequences.forEach((sequence) => {
    files.push({
      relativePath: sequencePath(story.id, sequence.id),
      content: `${JSON.stringify({ storageVersion: "0.2", storyId: story.id, sequence }, null, 2)}\n`,
    });
  });

  project.events.forEach((event) => {
    const sequenceId = ownerSequenceIdForEvent(project, event.id);
    if (!sequenceId) return;
    files.push({
      relativePath: eventPath(story.id, sequenceId, event.id),
      content: `${JSON.stringify({ storageVersion: "0.2", storyId: story.id, sequenceId, event }, null, 2)}\n`,
    });
  });

  project.branches.forEach((branch) => {
    const sequenceId = ownerSequenceIdForBranch(project, branch.id);
    if (!sequenceId) return;
    files.push({
      relativePath: branchPath(story.id, sequenceId, branch.id),
      content: `${JSON.stringify({ storageVersion: "0.2", storyId: story.id, sequenceId, branch }, null, 2)}\n`,
    });
  });

  return files;
}
