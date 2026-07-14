import assert from "node:assert/strict";
import {
  applyEventDraftToProject,
  createEventDraftFromSelection,
  normalizeProject,
} from "../lib/index.js";
import {
  createDialogue,
  createDialogueBeat,
  createEventDialogueBeat,
  deleteDialogueBeat,
} from "../lib/projectMutations.js";

const eventId = "event:dialogue-regression";
const project = normalizeProject({
  specVersion: "0.1",
  projectId: "pathbranching:dialogue-regression",
  name: "Dialogue regression",
  entrySequenceId: "sequence:main",
  sequences: [{ id: "sequence:main", name: "Main", entryEventId: eventId, eventIds: [eventId], branchIds: [] }],
  branches: [],
  events: [{ id: eventId, name: "Dialogue Event", type: "normal", dialogueBeats: [] }],
  canonRefs: [],
});

let current = createEventDialogueBeat(project, eventId).project;
const directBeatCount = (current.events[0].dialogueBeats ?? []).length;
assert.equal(directBeatCount, 1, "Expected the direct event speech beat to be created.");

const dialogueResult = createDialogue(current, eventId);
current = normalizeProject(dialogueResult.project);
const dialogue = current.events[0].dialogues?.[0];
assert.ok(dialogue, "Expected the dialogue container to be created.");
assert.equal(current.events[0].dialogueBeats?.length, directBeatCount, "Creating a dialogue must preserve existing event beats.");
assert.deepEqual(dialogue.beats, [], "A new dialogue must not receive an implicit legacy beat.");

current = createDialogueBeat(current, eventId, dialogue.id).project;
current = normalizeProject(current);
const dialogueWithBeat = current.events[0].dialogues?.[0];
assert.equal(dialogueWithBeat?.beats?.length, 1, "Expected the grouped dialogue beat to be created.");

const beatId = dialogueWithBeat.beats[0].id;
current = normalizeProject(deleteDialogueBeat(current, eventId, dialogue.id, beatId).project);
assert.deepEqual(current.events[0].dialogues?.[0]?.beats, [], "Deleting the last dialogue beat must remain deleted after normalization.");

const draft = createEventDraftFromSelection(current, { type: "node", id: eventId });
assert.ok(draft, "Expected an event draft for the merge regression.");
const withNewBeat = createEventDialogueBeat(current, eventId).project;
const merged = applyEventDraftToProject(withNewBeat, draft);
assert.equal(merged.events[0].dialogueBeats?.length, 2, "Applying an unchanged event draft must preserve newer structural nodes.");

console.log(JSON.stringify({ directBeats: merged.events[0].dialogueBeats?.length, groupedBeats: merged.events[0].dialogues?.[0]?.beats?.length ?? 0 }, null, 2));
