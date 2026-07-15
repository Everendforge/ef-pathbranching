import assert from "node:assert/strict";
import {
  applyEventDraftToProject,
  createEventDraftFromSelection,
  normalizeProject,
  validateProject,
} from "../lib/index.js";
import {
  createDialogue,
  createDialogueBeat,
  createDialogueStart,
  createInternalTransition,
  createDecision,
  createEventDialogueBeat,
  deleteDialogueBeat,
  detachDialogueMembers,
  groupDialogueMembers,
} from "../lib/projectMutations.js";
import { customLocaleId, localeDisplayName, normalizeLocalizationCatalog, normalizeLocaleNames, updateLocalizedEntry } from "../lib/localization.js";
import { buildStoryCanvasModel } from "../lib/canvas/storyCanvasModel.js";

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

let groupedProject = createDecision(merged, eventId).project;
const groupedBeatId = groupedProject.events[0].dialogueBeats[0].id;
const groupedDecisionId = groupedProject.events[0].decisions[0].id;
groupedProject = groupDialogueMembers(groupedProject, eventId, [
  { kind: "beat", id: groupedBeatId },
  { kind: "decision", id: groupedDecisionId },
]).project;
const groupedDialogue = groupedProject.events[0].dialogues.find((item) => item.members?.some((member) => member.id === groupedBeatId));
assert.ok(groupedDialogue, "Expected selected beats and decisions to form a Dialogue.");
assert.equal(groupedProject.events[0].decisions[0].dialogueId, groupedDialogue.id, "Expected the Decision to move into the Dialogue subcanvas.");
const triggerResult = createDialogueStart(groupedProject, eventId);
groupedProject = triggerResult.project;
assert.equal(groupedProject.events[0].dialogueStarts.length, 1, "Expected a Dialogue Trigger to be created without requiring a Dialogue target.");
const triggerNodeId = triggerResult.selection?.type === "node" ? triggerResult.selection.id : "";
assert.ok(triggerNodeId.startsWith(`dialogue-start:${eventId}:`), "Expected the new trigger to be selected.");
groupedProject = normalizeProject({
  ...groupedProject,
  canonRefs: [
    { id: "canon:door", label: "Door", properties: { interaction: "open" } },
    { id: "canon:speaker", label: "Speaker", kind: "character" },
  ],
  logicPropertyOverrides: [{
    propertyId: "interaction",
    source: "canon",
    entityPresentable: true,
    dialogueTrigger: true,
  }],
  events: groupedProject.events.map((event) => event.id === eventId ? {
    ...event,
    presentEntityRefs: ["canon:door", "canon:speaker"],
    dialogueStarts: event.dialogueStarts.map((start) => start.id === triggerNodeId ? {
      ...start,
      source: { kind: "canonRef", id: "canon:door", propertyId: "interaction" },
    } : start),
  } : event),
  scriptDocuments: (groupedProject.scriptDocuments ?? []).map((script) => ({
    ...script,
    blocks: script.blocks.map((block) => ({ ...block, characterRef: "canon:speaker" })),
  })),
});
assert.equal(
  validateProject(groupedProject).filter((finding) => finding.code === "invalid_dialogue_trigger" && finding.severity === "error").length,
  0,
  "Expected a present entity property with both capabilities to validate as a Dialogue Trigger.",
);
assert.equal(
  validateProject(groupedProject).filter((finding) => finding.code === "invalid_speaker_presence").length,
  0,
  "Expected a Speech Beat speaker present in the event to validate.",
);
const invalidSpeakerProject = normalizeProject({
  ...groupedProject,
  events: groupedProject.events.map((event) => event.id === eventId ? {
    ...event,
    presentEntityRefs: ["canon:door"],
  } : event),
});
assert.ok(
  validateProject(invalidSpeakerProject).some((finding) => finding.code === "invalid_speaker_presence"),
  "Expected a Speech Beat speaker missing from the event to be rejected.",
);
const invalidTriggerProject = normalizeProject({
  ...groupedProject,
  events: groupedProject.events.map((event) => event.id === eventId ? {
    ...event,
    presentEntityRefs: [],
  } : event),
});
assert.ok(
  validateProject(invalidTriggerProject).some((finding) => finding.code === "invalid_dialogue_trigger"),
  "Expected a Dialogue Trigger whose entity is not present in the event to be rejected.",
);
groupedProject = createInternalTransition(groupedProject, eventId, triggerNodeId, `decision:${eventId}:${groupedDecisionId}`).project;
assert.ok(groupedProject.events[0].transitions?.some((transition) => transition.from === triggerNodeId && transition.to === `decision:${eventId}:${groupedDecisionId}`), "Expected a Dialogue Trigger to connect to a narrative Decision.");
groupedProject = detachDialogueMembers(groupedProject, eventId, groupedDialogue.id).project;
assert.ok(groupedProject.events[0].dialogueBeats.some((beat) => beat.id === groupedBeatId), "Detaching must restore the beat to the event.");
assert.equal(groupedProject.events[0].decisions[0].dialogueId, undefined, "Detaching must restore the Decision to the event.");
const triggerCanvas = buildStoryCanvasModel(groupedProject, { scope: { kind: "event", id: eventId } });
assert.ok(triggerCanvas.nodes.some((node) => node.id === triggerNodeId && node.data.title === "Dialogue Trigger"), "Expected the trigger to render independently from Dialogue containers.");
assert.ok(triggerCanvas.edges.some((edge) => edge.source === triggerNodeId && edge.target === `decision:${eventId}:${groupedDecisionId}`), "Expected the trigger connection to render on the event subcanvas.");

let localizedProject = normalizeLocalizationCatalog(groupedProject, "es-PE");
const localizedBlock = localizedProject.scriptDocuments.flatMap((script) => script.blocks).find(Boolean);
localizedProject = updateLocalizedEntry(localizedProject, localizedBlock.textKey, "en-US", "Translated line", "es-PE");
assert.equal(localizedProject.localizationCatalog.entries[localizedBlock.textKey].values["en-US"], "Translated line", "Expected locale edits to use the shared catalog.");

const eldarinLocale = customLocaleId("Eldarin", ["es-PE", "en-US"]);
assert.equal(eldarinLocale, "und-x-eldarin", "Expected invented languages to use a stable private locale identifier.");
assert.equal(localeDisplayName(eldarinLocale, { [eldarinLocale]: "Eldarin" }), "Eldarin", "Expected authored language names to take precedence over locale codes.");
assert.deepEqual(normalizeLocaleNames({ [eldarinLocale]: "Eldarin", "fr-FR": "" }, ["es-PE", eldarinLocale]), { [eldarinLocale]: "Eldarin" }, "Expected locale names to retain only configured non-empty labels.");

console.log(JSON.stringify({ directBeats: merged.events[0].dialogueBeats?.length, groupedBeats: merged.events[0].dialogues?.[0]?.beats?.length ?? 0, localizationEntries: Object.keys(localizedProject.localizationCatalog.entries).length }, null, 2));
