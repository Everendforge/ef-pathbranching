import type { BranchingProject } from "./domain.js";
import {
  createEmptyBranchingProjectFromWorldNotionIndex,
  indexWorldNotionVaultFiles,
  type WorldNotionBridgeIndex,
  type WorldNotionVaultFile,
} from "./worldnotionBridge.js";
import { normalizeProject, parseProject, serializeProject } from "./projectSerialization.js";

export const pathBranchingMetadataPaths = {
  root: ".everend/.pathbranching",
  manifest: ".everend/.pathbranching/manifest.json",
  stories: ".everend/.pathbranching/stories",
  workingCopies: ".everend/.pathbranching/working-copies",
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
};

export type PathBranchingStoryManifestEntry = {
  id: string;
  name: string;
  path: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PathBranchingManifest = {
  version: "0.1";
  activeStoryId?: string;
  stories: PathBranchingStoryManifestEntry[];
};

export type PathBranchingWorkspace = {
  manifest: PathBranchingManifest;
  universeProfile?: UniverseProfile;
  canonIndex: WorldNotionBridgeIndex;
  activeStory?: PathBranchingStoryManifestEntry;
  activeProject: BranchingProject;
  storyModifiedMs?: number;
  createdDefaultStory: boolean;
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
  const universeFile = files.find((file) => file.relativePath === ".everend/universe.json");
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
  return `${pathBranchingMetadataPaths.stories}/${storyId}.pathbranching.json`;
}

export function workingCopyPathForCanonRef(canonRefId: string): string {
  const slug = slugify(canonRefId) || "canon-ref";
  return `${pathBranchingMetadataPaths.workingCopies}/${slug}.md`;
}

function parseManifest(files: UniverseFile[]): PathBranchingManifest | undefined {
  const manifestFile = files.find((file) => file.relativePath === pathBranchingMetadataPaths.manifest);
  if (!manifestFile) return undefined;

  const parsed = JSON.parse(manifestFile.content) as { activeStoryId?: unknown; stories?: unknown };
  const stories = Array.isArray(parsed.stories) ? parsed.stories : [];
  return {
    version: "0.1",
    activeStoryId: typeof parsed.activeStoryId === "string" ? parsed.activeStoryId : undefined,
    stories: stories
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
      .map((story) => ({ ...story })),
  };
}

function parseUniverseProfile(files: UniverseFile[]): UniverseProfile | undefined {
  const profileFile = files.find((file) => file.relativePath === ".everend/universe.json");
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
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : undefined,
      icon,
      taxonomyVersion: typeof parsed.taxonomyVersion === "string" ? parsed.taxonomyVersion : undefined,
    };
  } catch {
    return undefined;
  }
}

function createDefaultProject(files: UniverseFile[], canonIndex: WorldNotionBridgeIndex, storyId: string): BranchingProject {
  return normalizeProject(
    createEmptyBranchingProjectFromWorldNotionIndex(canonIndex, {
      projectId: `pathbranching:${storyId}`,
      name: "Branching Story",
      vaultRelativePath: ".",
    }),
  );
}

function mergeCanonRefs(canonIndex: WorldNotionBridgeIndex, storyProject: BranchingProject) {
  const storyRefs = new Map(storyProject.canonRefs.map((ref) => [ref.id, ref]));
  return canonIndex.canonRefs.map((ref) => {
    const storyRef = storyRefs.get(ref.id);
    return {
      ...ref,
      workingCopyPath: storyRef?.workingCopyPath,
    };
  });
}

export function loadPathBranchingWorkspace(files: UniverseFile[]): PathBranchingWorkspace {
  const canonIndex = indexWorldNotionVaultFiles(files);
  const universeProfile = parseUniverseProfile(files);
  const parsedManifest = parseManifest(files);
  const fallbackStoryId = defaultStoryId(files);
  const now = new Date().toISOString();
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
  const storyFile = activeStory ? files.find((file) => file.relativePath === activeStory.path) : undefined;
  const activeProject =
    storyFile && activeStory
      ? normalizeProject({
          ...parseProject(storyFile.content),
          storyId: activeStory.id,
        })
      : createDefaultProject(files, canonIndex, activeStory?.id ?? fallbackStoryId);

  return {
    manifest: {
      ...manifest,
      activeStoryId: activeStory?.id,
    },
    universeProfile,
    canonIndex,
    activeStory,
    activeProject: normalizeProject({
      ...activeProject,
      storyId: activeStory?.id ?? fallbackStoryId,
      canonRefs: mergeCanonRefs(canonIndex, activeProject),
    }),
    storyModifiedMs: storyFile?.modifiedMs,
    createdDefaultStory: !parsedManifest || !storyFile,
  };
}

export function serializePathBranchingManifest(manifest: PathBranchingManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function serializePathBranchingStory(project: BranchingProject): string {
  return serializeProject(project);
}
