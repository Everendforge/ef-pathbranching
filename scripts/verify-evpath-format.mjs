import assert from "node:assert/strict";
import {
  applyEvpathToEvent,
  parseEvpath,
  serializeEventEvpath,
} from "../lib/evpathFormat.js";

const UNKNOWN = "__pathbranching_unknown_speaker__";

function fixtureProject() {
  return {
    specVersion: "0.1",
    projectId: "evpath-fixture",
    canonRefs: [
      {
        id: "kaelen",
        kind: "character",
        label: "Kaelen",
        frontmatter: { variants: { herida: { label: "Herida" } } },
      },
    ],
    sequences: [
      { id: "seq-1", name: "Main", entryEventId: "intro", eventIds: ["intro", "vault"] },
    ],
    branches: [],
    scripts: [],
    externalFunctions: [],
    variables: {},
    assets: [
      { id: "asset-1", name: "vault-door.png", path: "assets/vault-door.png", kind: "image", origin: "uncanon" },
    ],
    eventCategories: [
      { id: "normal", label: "Normal" },
      { id: "final", label: "Final", terminal: true },
    ],
    localizationCatalog: {
      primaryLocale: "es-419",
      locales: ["es-419"],
      entries: {
        "script.script:intro.block:b1": { values: { "es-419": "¿Dónde escondiste la reliquia?" } },
        "script.script:intro.block:b2": { values: { "es-419": "La cámara tiembla" } },
        "script.script:intro.block:b3": { values: { "es-419": "No vas a salir de aquí." } },
      },
    },
    scriptDocuments: [
      {
        id: "script:intro",
        name: "Intro dialogue",
        format: "forge-script",
        blocks: [
          {
            id: "block:b1",
            kind: "speech",
            textKey: "script.script:intro.block:b1",
            content: "¿Dónde escondiste la reliquia?",
            characterRef: "kaelen",
          },
          {
            id: "block:b2",
            kind: "direction",
            textKey: "script.script:intro.block:b2",
            content: "La cámara tiembla",
          },
          {
            id: "block:b3",
            kind: "speech",
            textKey: "script.script:intro.block:b3",
            content: "No vas a salir de aquí.",
            characterRef: UNKNOWN,
          },
        ],
      },
    ],
    events: [
      {
        id: "intro",
        name: "Intro",
        type: "normal",
        dialogueBeats: [
          {
            id: "beat:speech-1",
            kind: "speech",
            blockRef: { scriptId: "script:intro", blockId: "block:b1" },
            directorNote: "con desconfianza",
          },
          {
            id: "beat:direction-1",
            kind: "direction",
            blockRef: { scriptId: "script:intro", blockId: "block:b2" },
          },
        ],
        dialogues: [
          {
            id: "dialogue-1",
            title: "Interrogatorio",
            entryBeatId: "beat:speech-2",
            beats: [
              {
                id: "beat:speech-2",
                kind: "speech",
                blockRef: { scriptId: "script:intro", blockId: "block:b3" },
              },
            ],
            members: [{ kind: "beat", id: "beat:speech-2" }],
            text: { format: "plain", content: "" },
          },
        ],
        decisions: [
          {
            id: "decision-1",
            name: "Final",
            type: "dialogue",
            optionStyle: "visibleText",
            outcomes: [
              {
                id: "outcome-1",
                name: "Opción 1",
                visibleText: "Entregar la reliquia",
                availability: { type: "variable", name: "trust", operator: ">=", value: 2 },
                consequences: [{ type: "setVariable", name: "courage", value: 1 }],
              },
              { id: "outcome-2", name: "Opción 2", visibleText: "Atacar" },
            ],
          },
        ],
        transitions: [
          { id: "t1", from: "intro", to: "beat:intro:beat:speech-1", order: 0 },
          { id: "t2", from: "beat:intro:beat:speech-1", to: "beat:intro:beat:direction-1", order: 0 },
          { id: "t3", from: "beat:intro:beat:direction-1", to: "dialogue:intro:dialogue-1", order: 0 },
          { id: "t4", from: "beat:intro:beat:speech-2", to: "decision:intro:decision-1", order: 0 },
          { id: "t5", from: "outcome:intro:decision-1:outcome-1", to: "vault", order: 0 },
        ],
      },
      { id: "vault", name: "Vault Sealed", type: "final" },
    ],
  };
}

const project = fixtureProject();
const text = serializeEventEvpath(project, "intro");

// --- Serialization shape -------------------------------------------------
assert.match(text, /^=== Intro === #\^intro$/m);
assert.match(text, /^Kaelen: ¿Dónde escondiste la reliquia\? #\^beat:speech-1$/m);
assert.match(text, /^    \(con desconfianza\)$/m);
assert.match(text, /^\[La cámara tiembla\] #\^beat:direction-1$/m);
assert.match(text, /^= dialogue: Interrogatorio #\^dialogue-1$/m);
assert.match(text, /^    \?\?\?: No vas a salir de aquí\. #\^beat:speech-2$/m);
assert.match(text, /^    \? Final #\^decision-1$/m);
assert.match(text, /^    \* \[Entregar la reliquia\] \{ trust >= 2 \} #\^outcome-1$/m);
assert.match(text, /^        ~ courage = 1$/m);
assert.match(text, /^        -> "Vault Sealed" #\^t5$/m);
assert.match(text, /^    \* \[Atacar\] #\^outcome-2$/m);

// --- Parser sanity -------------------------------------------------------
const parsed = parseEvpath(text);
assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors));

// --- Round-trip idempotence ---------------------------------------------
const idempotent = applyEvpathToEvent(project, "intro", text);
assert.equal(idempotent.errors.length, 0, JSON.stringify(idempotent.errors));
assert.equal(idempotent.changed, false, `expected no changes, warnings: ${idempotent.warnings.join(" | ")}`);
assert.equal(serializeEventEvpath(idempotent.project, "intro"), text);

// --- Text edit updates localization --------------------------------------
const editedText = text.replace("¿Dónde escondiste la reliquia?", "¿Dónde está la reliquia?");
const textEdit = applyEvpathToEvent(project, "intro", editedText);
assert.equal(textEdit.errors.length, 0);
assert.equal(textEdit.changed, true);
assert.equal(
  textEdit.project.localizationCatalog.entries["script.script:intro.block:b1"].values["es-419"],
  "¿Dónde está la reliquia?",
);
assert.match(serializeEventEvpath(textEdit.project, "intro"), /¿Dónde está la reliquia\?/);

// --- Speaker change ------------------------------------------------------
const speakerEdit = applyEvpathToEvent(
  project,
  "intro",
  text.replace("Kaelen: ¿Dónde", "???: ¿Dónde"),
);
assert.equal(speakerEdit.errors.length, 0);
const editedBlock = speakerEdit.project.scriptDocuments[0].blocks.find((block) => block.id === "block:b1");
assert.equal(editedBlock.characterRef, UNKNOWN);

// --- Variant change ------------------------------------------------------
const variantEdit = applyEvpathToEvent(
  project,
  "intro",
  text.replace("Kaelen: ¿Dónde", "Kaelen (Herida): ¿Dónde"),
);
assert.equal(variantEdit.errors.length, 0);
const variantBlock = variantEdit.project.scriptDocuments[0].blocks.find((block) => block.id === "block:b1");
assert.equal(variantBlock.characterVariantId, "herida");

// --- New narrator beat rewires the chain ---------------------------------
const withNewLine = text.replace(
  "[La cámara tiembla] #^beat:direction-1",
  "[La cámara tiembla] #^beat:direction-1\nEl silencio pesa.",
);
const newBeat = applyEvpathToEvent(project, "intro", withNewLine);
assert.equal(newBeat.errors.length, 0);
const newIntro = newBeat.project.events.find((event) => event.id === "intro");
assert.equal(newIntro.dialogueBeats.length, 3);
const createdBeat = newIntro.dialogueBeats.at(-1);
const createdNodeId = `beat:intro:${createdBeat.id}`;
assert.ok(
  newIntro.transitions.some((transition) => transition.from === "beat:intro:beat:direction-1" && transition.to === createdNodeId),
  "expected direction → new beat transition",
);
assert.ok(
  newIntro.transitions.some((transition) => transition.from === createdNodeId && transition.to === "dialogue:intro:dialogue-1"),
  "expected new beat → dialogue transition",
);
assert.ok(
  !newIntro.transitions.some((transition) => transition.id === "t3"),
  "expected the old direction → dialogue transition to be gone",
);
const reserialized = serializeEventEvpath(newBeat.project, "intro");
assert.match(reserialized, /^El silencio pesa\. #\^/m);
const secondPass = applyEvpathToEvent(newBeat.project, "intro", reserialized);
assert.equal(secondPass.changed, false, `expected stable second pass, warnings: ${secondPass.warnings.join(" | ")}`);

// --- Deleting an option removes the outcome ------------------------------
const withoutOption = text.replace(/^    \* \[Atacar\] #\^outcome-2\n?/m, "");
const optionDelete = applyEvpathToEvent(project, "intro", withoutOption);
assert.equal(optionDelete.errors.length, 0);
const decision = optionDelete.project.events
  .find((event) => event.id === "intro")
  .decisions.find((item) => item.id === "decision-1");
assert.equal(decision.outcomes.length, 1);
assert.equal(decision.outcomes[0].id, "outcome-1");

// --- Editing a simple availability condition ------------------------------
const condEdit = applyEvpathToEvent(project, "intro", text.replace("{ trust >= 2 }", "{ trust >= 3 }"));
assert.equal(condEdit.errors.length, 0);
const condOutcome = condEdit.project.events
  .find((event) => event.id === "intro")
  .decisions[0].outcomes.find((outcome) => outcome.id === "outcome-1");
assert.deepEqual(condOutcome.availability, { type: "variable", name: "trust", operator: ">=", value: 3 });

// --- Director note removal ------------------------------------------------
const noteRemoved = applyEvpathToEvent(project, "intro", text.replace(/^    \(con desconfianza\)\n?/m, ""));
assert.equal(noteRemoved.errors.length, 0);
const noteBeat = noteRemoved.project.events
  .find((event) => event.id === "intro")
  .dialogueBeats.find((beat) => beat.id === "beat:speech-1");
assert.equal(noteBeat.directorNote, undefined);

// --- Parse errors are reported with line numbers --------------------------
const badParse = parseEvpath("=== X ===\n* opción sin corchetes\n");
assert.equal(badParse.errors.length, 1);
assert.equal(badParse.errors[0].line, 2);

// --- Unknown speaker keeps the existing one -------------------------------
const unknownSpeaker = applyEvpathToEvent(
  project,
  "intro",
  text.replace("Kaelen: ¿Dónde", "Persona Inexistente: ¿Dónde"),
);
assert.equal(unknownSpeaker.errors.length, 0);
assert.ok(unknownSpeaker.warnings.some((warning) => warning.includes("Persona Inexistente")));
const keptBlock = unknownSpeaker.project.scriptDocuments[0].blocks.find((block) => block.id === "block:b1");
assert.equal(keptBlock.characterRef, "kaelen");

// --- Multi-root events round-trip without inventing an edge ----------------
// Two independent chains leave the event; a blank line separates their roots
// and must not be reinterpreted as an edge between them.
function multiRootProject() {
  return {
    specVersion: "0.1",
    projectId: "multi-root",
    canonRefs: [],
    sequences: [{ id: "seq", name: "S", entryEventId: "e1", eventIds: ["e1"] }],
    branches: [],
    scripts: [],
    externalFunctions: [],
    variables: {},
    assets: [],
    eventCategories: [{ id: "normal", label: "Normal" }],
    localizationCatalog: {
      primaryLocale: "es-419",
      locales: ["es-419"],
      entries: {
        "script.s.b1": { values: { "es-419": "Rama A" } },
        "script.s.b2": { values: { "es-419": "Rama B" } },
      },
    },
    scriptDocuments: [
      {
        id: "s",
        name: "S",
        format: "forge-script",
        blocks: [
          { id: "b1", kind: "speech", textKey: "script.s.b1", content: "Rama A" },
          { id: "b2", kind: "speech", textKey: "script.s.b2", content: "Rama B" },
        ],
      },
    ],
    events: [
      {
        id: "e1",
        name: "Bifurcación",
        type: "normal",
        dialogueBeats: [
          { id: "beat:a", kind: "speech", blockRef: { scriptId: "s", blockId: "b1" } },
          { id: "beat:b", kind: "speech", blockRef: { scriptId: "s", blockId: "b2" } },
        ],
        transitions: [
          { id: "t1", from: "e1", to: "beat:e1:beat:a", order: 0 },
          { id: "t2", from: "e1", to: "beat:e1:beat:b", order: 1 },
        ],
      },
    ],
  };
}
const multiRoot = multiRootProject();
const multiRootText = serializeEventEvpath(multiRoot, "e1");
const multiRootRound = applyEvpathToEvent(multiRoot, "e1", multiRootText);
assert.equal(multiRootRound.errors.length, 0);
assert.equal(multiRootRound.changed, false, `multi-root round-trip changed the project: ${multiRootRound.warnings.join(" | ")}`);
const multiRootEvent = multiRootRound.project.events.find((event) => event.id === "e1");
assert.ok(
  !(multiRootEvent.transitions ?? []).some(
    (transition) => transition.from === "beat:e1:beat:a" && transition.to === "beat:e1:beat:b",
  ),
  "a blank line between roots must not create an a → b edge",
);

// --- A blank line breaks implicit adjacency (disconnects a new chain) ------
const brokenChain = multiRootText.replace(
  "Rama A #^beat:a",
  "Rama A #^beat:a\nRama B #^beat:b",
);
// After collapsing beat:b into beat:a's chain (no blank), the two are linked.
const glued = applyEvpathToEvent(multiRoot, "e1", brokenChain.replace(/\n\nRama B #\^beat:b\n?/, "\n"));
assert.equal(glued.errors.length, 0);
const gluedEvent = glued.project.events.find((event) => event.id === "e1");
assert.ok(
  (gluedEvent.transitions ?? []).some(
    (transition) => transition.from === "beat:e1:beat:a" && transition.to === "beat:e1:beat:b",
  ),
  "adjacent lines with no blank must link a → b",
);

// --- Deleting a middle beat bridges the surrounding beats ------------------
function threeBeatProject() {
  const base = multiRootProject();
  base.localizationCatalog.entries["script.s.b3"] = { values: { "es-419": "Rama C" } };
  base.scriptDocuments[0].blocks.push({ id: "b3", kind: "speech", textKey: "script.s.b3", content: "Rama C" });
  base.events[0].dialogueBeats.push({ id: "beat:c", kind: "speech", blockRef: { scriptId: "s", blockId: "b3" } });
  base.events[0].transitions = [
    { id: "t1", from: "e1", to: "beat:e1:beat:a", order: 0 },
    { id: "t2", from: "beat:e1:beat:a", to: "beat:e1:beat:b", order: 0 },
    { id: "t3", from: "beat:e1:beat:b", to: "beat:e1:beat:c", order: 0 },
  ];
  return base;
}
const threeBeat = threeBeatProject();
const threeBeatText = serializeEventEvpath(threeBeat, "e1");
const middleRemoved = applyEvpathToEvent(
  threeBeat,
  "e1",
  threeBeatText.split("\n").filter((line) => !line.includes("#^beat:b")).join("\n"),
);
assert.equal(middleRemoved.errors.length, 0);
const bridgedEvent = middleRemoved.project.events.find((event) => event.id === "e1");
assert.equal(bridgedEvent.dialogueBeats.length, 2);
assert.ok(
  (bridgedEvent.transitions ?? []).some(
    (transition) => transition.from === "beat:e1:beat:a" && transition.to === "beat:e1:beat:c",
  ),
  "deleting the middle beat must bridge a → c",
);

console.log("evpath format verification passed");
