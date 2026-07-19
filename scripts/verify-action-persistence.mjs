import {
  applyEventDraftToProject,
  createEventDraftFromSelection,
  defaultStoryId,
  loadPathBranchingWorkspace,
  serializeModularStoryFiles,
  serializePathBranchingManifest,
  storyPath,
  updateEventDraft,
} from "../lib/index.js";
import { createDecision, createEvent, createOutcome, createSequence } from "../lib/projectMutations.js";

const universeFiles = [
  {
    relativePath: ".everend/universe.json",
    content: JSON.stringify({ name: "Action Persistence Demo", taxonomyVersion: "0.1" }, null, 2),
    modifiedMs: 1,
  },
  {
    relativePath: "Lore/Origin.md",
    content: "---\nid: lore:origin\nkind: lore\n---\n# Origin\nA shared canon source.\n",
    modifiedMs: 1,
  },
];

const initialWorkspace = loadPathBranchingWorkspace(universeFiles);
const initialStoryId = initialWorkspace.activeStory?.id ?? defaultStoryId(universeFiles);
const story = {
  ...(initialWorkspace.activeStory ?? initialWorkspace.manifest.stories[0]),
  id: initialStoryId,
  name: "Action Story",
  path: storyPath(initialStoryId),
  updatedAt: "2026-07-06T00:00:00.000Z",
};

let project = {
  ...initialWorkspace.activeProject,
  name: story.name,
  storyId: story.id,
  universeRootPath: "/tmp/pathbranching-action-demo",
};

project = createSequence(project, "Opening Route").project;
const eventMutation = createEvent(project, "normal", { x: 340, y: 140 });
project = eventMutation.project;

const editedEvent = eventMutation.selection?.type === "node"
  ? project.events.find((event) => event.id === eventMutation.selection.id)
  : undefined;
if (!editedEvent) {
  throw new Error("Expected structural createEvent action to produce an event.");
}

let draft = createEventDraftFromSelection(project, { type: "node", id: editedEvent.id }, "text");
draft = updateEventDraft(draft, {
  name: "Choice Setup",
  text: { format: "ink", content: "The path forks here." },
});
if (!draft?.dirty) {
  throw new Error("Expected event draft edits to become dirty before saving.");
}
project = applyEventDraftToProject(project, draft);

project = createDecision(project, editedEvent.id).project;
const decisionId = project.events.find((event) => event.id === editedEvent.id)?.decisions?.[0]?.id;
if (!decisionId) {
  throw new Error("Expected event component action to create a decision.");
}
project = createOutcome(project, editedEvent.id, decisionId).project;

const manifest = {
  ...initialWorkspace.manifest,
  version: "0.2",
  activeStoryId: story.id,
  stories: [{ ...story }],
};

const secondStory = {
  id: `${story.id}-branch-b`,
  name: "Branch B Story",
  path: storyPath(`${story.id}-branch-b`),
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
};
let secondProject = {
  ...initialWorkspace.activeProject,
  name: secondStory.name,
  projectId: `pathbranching:${secondStory.id}`,
  storyId: secondStory.id,
  universeRootPath: "/tmp/pathbranching-action-demo",
};
secondProject = createSequence(secondProject, "Second Route").project;
secondProject = createEvent(secondProject, "final", { x: 500, y: 220 }).project;

const multiStoryManifest = {
  ...manifest,
  stories: [{ ...story }, secondStory],
};

const reloadedWorkspace = loadPathBranchingWorkspace([
  ...universeFiles,
  {
    relativePath: ".everend/.pathbranching/manifest.json",
    content: serializePathBranchingManifest(multiStoryManifest),
    modifiedMs: 2,
  },
  ...serializeModularStoryFiles(project, story).map((file, index) => ({
    ...file,
    modifiedMs: 10 + index,
  })),
  ...serializeModularStoryFiles(secondProject, secondStory).map((file, index) => ({
    ...file,
    modifiedMs: 40 + index,
  })),
]);

const reloadedProject = reloadedWorkspace.activeProject;
const reloadedSequence = reloadedProject.sequences.find((sequence) => sequence.name === "Opening Route");
const reloadedEvent = reloadedProject.events.find((event) => event.id === editedEvent.id);

if (!reloadedSequence) {
  throw new Error("Expected the structurally created sequence to reload.");
}
if (!reloadedEvent) {
  throw new Error("Expected the structurally created event to reload.");
}
if (reloadedEvent.name !== "Choice Setup" || reloadedEvent.text?.content !== "The path forks here.") {
  throw new Error("Expected saved event draft fields to reload from modular storage.");
}
if (!reloadedEvent.decisions?.[0]?.outcomes?.length) {
  throw new Error("Expected event component decisions/outcomes to reload.");
}
if (!reloadedSequence.eventIds.includes(reloadedEvent.id)) {
  throw new Error("Expected the sequence/event relationship to survive reload.");
}
if (reloadedWorkspace.createdDefaultStory) {
  throw new Error("Expected manifest plus modular story files to load as a persisted workspace.");
}
if (reloadedWorkspace.manifest.stories.length !== 2) {
  throw new Error("Expected both manifest stories to reload into the story selector model.");
}

const switchedWorkspace = loadPathBranchingWorkspace([
  ...universeFiles,
  {
    relativePath: ".everend/.pathbranching/manifest.json",
    content: serializePathBranchingManifest({ ...multiStoryManifest, activeStoryId: secondStory.id }),
    modifiedMs: 80,
  },
  ...serializeModularStoryFiles(project, story).map((file, index) => ({
    ...file,
    modifiedMs: 90 + index,
  })),
  ...serializeModularStoryFiles(secondProject, secondStory).map((file, index) => ({
    ...file,
    modifiedMs: 120 + index,
  })),
]);

if (switchedWorkspace.activeStory?.id !== secondStory.id) {
  throw new Error("Expected switching activeStoryId to load the second story.");
}
if (!switchedWorkspace.activeProject.sequences.some((sequence) => sequence.name === "Second Route")) {
  throw new Error("Expected the second story sequence to reload after switching active stories.");
}

const brokenWorkspace = loadPathBranchingWorkspace([
  ...universeFiles,
  {
    relativePath: ".everend/.pathbranching/manifest.json",
    content: serializePathBranchingManifest({
      ...multiStoryManifest,
      activeStoryId: secondStory.id,
      stories: [secondStory],
    }),
    modifiedMs: 160,
  },
]);

if (brokenWorkspace.createdDefaultStory) {
  throw new Error("Expected a manifest with stories to stay persisted even when the active story file is missing.");
}
if (brokenWorkspace.manifest.stories.length !== 1 || brokenWorkspace.activeStory?.id !== secondStory.id) {
  throw new Error("Expected missing story recovery to preserve manifest story entries.");
}
if (!brokenWorkspace.loadWarnings?.length) {
  throw new Error("Expected missing story recovery to expose a load warning.");
}

console.log(
  JSON.stringify(
    {
      storyId: story.id,
      storyCount: reloadedWorkspace.manifest.stories.length,
      switchedStoryId: switchedWorkspace.activeStory?.id,
      brokenWorkspaceWarnings: brokenWorkspace.loadWarnings.length,
      sequenceId: reloadedSequence.id,
      eventId: reloadedEvent.id,
      eventName: reloadedEvent.name,
      textFormat: reloadedEvent.text?.format,
      createdDefaultStory: reloadedWorkspace.createdDefaultStory,
    },
    null,
    2,
  ),
);
