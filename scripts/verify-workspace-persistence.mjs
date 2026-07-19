import {
  defaultStoryId,
  legacyStoryPath,
  loadPathBranchingWorkspace,
  serializeModularStoryFiles,
  serializePathBranchingManifest,
  serializePathBranchingStory,
  storyPath,
} from "../lib/pathBranchingWorkspace.js";
import { createEvent, createSequence } from "../lib/projectMutations.js";

const universeFile = {
  relativePath: ".everend/universe.json",
  content: JSON.stringify({ name: "Persistence Demo", taxonomyVersion: "0.1" }, null, 2),
  modifiedMs: 1,
};

const canonFile = {
  relativePath: "Characters/Test Character.md",
  content: "---\nid: character:test\nkind: character\n---\n# Test Character\n",
  modifiedMs: 1,
};

const initialFiles = [universeFile, canonFile];
const initialWorkspace = loadPathBranchingWorkspace(initialFiles);
if (!initialWorkspace.createdDefaultStory) {
  throw new Error("Expected a universe without PathBranching metadata to start with a transient story candidate.");
}

const initialStoryId = initialWorkspace.activeStory?.id ?? defaultStoryId(initialFiles);
const initialStoryManifest = {
  ...initialWorkspace.manifest,
  version: "0.2",
  activeStoryId: initialStoryId,
  stories: [{
    id: initialStoryId,
    name: "Named Story",
    path: storyPath(initialStoryId),
    updatedAt: "2026-07-02T00:00:00.000Z",
  }],
};
const initialStoryProject = {
  ...initialWorkspace.activeProject,
  name: "Named Story",
  storyId: initialStoryId,
  universeRootPath: "/tmp/pathbranching-persistence-demo",
};

const persistedEmptyStoryWorkspace = loadPathBranchingWorkspace([
  ...initialFiles,
  {
    relativePath: ".everend/.pathbranching/manifest.json",
    content: serializePathBranchingManifest(initialStoryManifest),
    modifiedMs: 2,
  },
  ...serializeModularStoryFiles(initialStoryProject, initialStoryManifest.stories[0]).map((file, index) => ({
    ...file,
    modifiedMs: 3 + index,
  })),
]);

if (persistedEmptyStoryWorkspace.createdDefaultStory) {
  throw new Error("Expected Create Story to turn the transient candidate into a persisted story.");
}

if (persistedEmptyStoryWorkspace.activeStory?.name !== "Named Story") {
  throw new Error("Expected a named story to reload from the manifest.");
}

const mutation = createSequence(initialWorkspace.activeProject, "Route A");
const storyId = initialWorkspace.activeStory?.id ?? defaultStoryId(initialFiles);
const eventMutation = createEvent(mutation.project);
const savedProject = {
  ...eventMutation.project,
  name: "Renamed Story",
  storyId,
  universeRootPath: "/tmp/pathbranching-persistence-demo",
};

const manifest = {
  ...initialStoryManifest,
  version: "0.2",
  activeStoryId: storyId,
  stories: initialStoryManifest.stories.map((story) =>
    story.id === storyId ? { ...story, name: "Renamed Story", path: storyPath(storyId), updatedAt: "2026-07-02T00:00:00.000Z" } : story,
  ),
};

const reloadedWorkspace = loadPathBranchingWorkspace([
  ...initialFiles,
  {
    relativePath: ".everend/.pathbranching/manifest.json",
    content: serializePathBranchingManifest(manifest),
    modifiedMs: 2,
  },
  ...serializeModularStoryFiles(savedProject, manifest.stories[0]).map((file, index) => ({
    ...file,
    modifiedMs: 3 + index,
  })),
]);

const createdSequence = mutation.project.sequences.find((sequence) => sequence.name === "Route A");
if (!createdSequence) {
  throw new Error("Expected createSequence to add a named sequence before serialization.");
}

const createdEventId = eventMutation.selection?.type === "node" ? eventMutation.selection.id : undefined;
const createdEvent = eventMutation.project.events.find((event) => event.id === createdEventId);
if (!createdEvent) {
  throw new Error("Expected createEvent to add an event before serialization.");
}

const reloadedSequence = reloadedWorkspace.activeProject.sequences.find((sequence) => sequence.id === createdSequence.id);
if (!reloadedSequence) {
  throw new Error("Expected serialized sequence to reload from the workspace story file.");
}

const reloadedEvent = reloadedWorkspace.activeProject.events.find((event) => event.id === createdEvent.id);
if (!reloadedEvent) {
  throw new Error("Expected serialized event to reload from the workspace story file.");
}

if (!reloadedSequence.eventIds.includes(createdEvent.id)) {
  throw new Error("Expected the reloaded sequence to contain the created event.");
}

if (reloadedWorkspace.createdDefaultStory) {
  throw new Error("Expected existing manifest/story files to prevent default story replacement.");
}

if (reloadedWorkspace.activeStory?.name !== "Renamed Story") {
  throw new Error("Expected renamed story metadata to reload from the manifest.");
}

if (reloadedWorkspace.activeProject.name !== "Renamed Story") {
  throw new Error("Expected renamed story project name to reload from the story file.");
}

if (reloadedWorkspace.activeProject.canvas?.activeSequenceId !== createdSequence.id) {
  throw new Error("Expected activeSequenceId to survive workspace reload.");
}

const legacyManifest = {
  version: "0.1",
  activeStoryId: storyId,
  stories: [{ ...manifest.stories[0], path: legacyStoryPath(storyId) }],
};
const legacyWorkspace = loadPathBranchingWorkspace([
  ...initialFiles,
  {
    relativePath: ".everend/.pathbranching/manifest.json",
    content: serializePathBranchingManifest(legacyManifest),
    modifiedMs: 20,
  },
  {
    relativePath: legacyStoryPath(storyId),
    content: serializePathBranchingStory(savedProject),
    modifiedMs: 21,
  },
]);

if (!legacyWorkspace.activeProject.sequences.some((sequence) => sequence.id === createdSequence.id)) {
  throw new Error("Expected legacy monolithic story files to migrate in memory.");
}

console.log(
  JSON.stringify(
    {
      storyId,
      sequenceCount: reloadedWorkspace.activeProject.sequences.length,
      eventCount: reloadedWorkspace.activeProject.events.length,
      createdSequenceId: createdSequence.id,
      createdEventId: createdEvent.id,
      activeSequenceId: reloadedWorkspace.activeProject.canvas?.activeSequenceId,
      createdDefaultStory: reloadedWorkspace.createdDefaultStory,
    },
    null,
    2,
  ),
);
