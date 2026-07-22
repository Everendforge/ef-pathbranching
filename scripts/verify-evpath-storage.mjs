import assert from "node:assert/strict";
import {
  loadPathBranchingWorkspace,
  serializeModularStoryFiles,
  storyPath,
} from "../lib/pathBranchingWorkspace.js";
import { serializeEventEvpath } from "../lib/evpathFormat.js";

const STORY = { id: "main", name: "Historia Principal", path: storyPath("main") };

function sampleProject() {
  return {
    specVersion: "0.1",
    projectId: "storage-fixture",
    canonRefs: [{ id: "kaelen", kind: "character", label: "Kaelen" }],
    sequences: [{ id: "seq-1", name: "Main", entryEventId: "intro", eventIds: ["intro", "vault"] }],
    branches: [],
    scripts: [],
    externalFunctions: [],
    variables: {},
    assets: [],
    eventCategories: [
      { id: "normal", label: "Normal" },
      { id: "final", label: "Final", terminal: true },
    ],
    localizationCatalog: {
      primaryLocale: "es-419",
      locales: ["es-419"],
      entries: {
        "script.script:intro.block:b1": { values: { "es-419": "¿Dónde está la reliquia?" } },
        "script.script:intro.block:b2": { values: { "es-419": "El sótano tiembla." } },
      },
    },
    scriptDocuments: [
      {
        id: "script:intro",
        name: "Intro",
        format: "forge-script",
        blocks: [
          { id: "block:b1", kind: "speech", textKey: "script.script:intro.block:b1", content: "¿Dónde está la reliquia?", characterRef: "kaelen" },
          { id: "block:b2", kind: "direction", textKey: "script.script:intro.block:b2", content: "El sótano tiembla." },
        ],
      },
    ],
    events: [
      {
        id: "intro",
        name: "Intro",
        type: "normal",
        dialogueBeats: [
          { id: "beat:s1", kind: "speech", blockRef: { scriptId: "script:intro", blockId: "block:b1" } },
          { id: "beat:d1", kind: "direction", blockRef: { scriptId: "script:intro", blockId: "block:b2" } },
        ],
        decisions: [
          {
            id: "dec-1",
            name: "Salida",
            type: "dialogue",
            optionStyle: "visibleText",
            outcomes: [
              { id: "out-1", name: "O1", visibleText: "Huir", availability: { type: "variable", name: "miedo", operator: "<", value: 3 } },
              { id: "out-2", name: "O2", visibleText: "Quedarse" },
            ],
          },
        ],
        transitions: [
          { id: "t1", from: "intro", to: "beat:intro:beat:s1", order: 0 },
          { id: "t2", from: "beat:intro:beat:s1", to: "beat:intro:beat:d1", order: 0 },
          { id: "t3", from: "beat:intro:beat:d1", to: "decision:intro:dec-1", order: 0 },
          { id: "t4", from: "outcome:intro:dec-1:out-1", to: "vault", order: 0 },
        ],
      },
      { id: "vault", name: "Bóveda", type: "final" },
    ],
  };
}

function universeFiles(project, { evpath = true, storageVersion } = {}) {
  const storyFiles = serializeModularStoryFiles(project, STORY);
  const files = storyFiles
    .filter((file) => (evpath ? true : !file.relativePath.endsWith(".evpath")))
    .map((file) => {
      if (storageVersion && file.relativePath.endsWith(".json")) {
        return { ...file, content: file.content.replace(/"storageVersion": "0\.4"/g, `"storageVersion": "${storageVersion}"`) };
      }
      return { ...file };
    });
  files.push({
    relativePath: ".everend/.pathbranching/manifest.json",
    content: `${JSON.stringify({ version: "0.2", activeStoryId: STORY.id, stories: [STORY] }, null, 2)}\n`,
  });
  // Canon markdown so the loaded project keeps the "kaelen" ref (with its
  // label) after mergeCanonRefs re-derives canon from the vault.
  files.push({
    relativePath: "Characters/Kaelen.md",
    content: "---\nid: kaelen\ntype: character\nname: Kaelen\n---\n\nGuardián del sótano.\n",
  });
  return { storyFiles, files };
}

function blockContent(project, blockId) {
  return project.scriptDocuments[0].blocks.find((block) => block.id === blockId)?.content;
}

function eventOf(project, id) {
  return project.events.find((event) => event.id === id);
}

const project = sampleProject();
const expectedEvpath = serializeEventEvpath(project, "intro");

// --- Serialization emits a .evpath sidecar and bumps storage to 0.4 --------
const { storyFiles } = universeFiles(project);
const storyJson = storyFiles.find((file) => file.relativePath === storyPath("main"));
assert.match(storyJson.content, /"storageVersion": "0\.4"/);
const introEvpath = storyFiles.find((file) => file.relativePath.endsWith("/events/intro.evpath"));
assert.ok(introEvpath, "expected an intro.evpath file");
assert.equal(introEvpath.content, expectedEvpath);
assert.match(introEvpath.content, /^Kaelen: ¿Dónde está la reliquia\? #\^beat:s1$/m);

// --- Loading a 0.4 story is a no-op reconcile (no spurious drift) ----------
const { files } = universeFiles(project);
const loaded = loadPathBranchingWorkspace(files);
assert.deepEqual(loaded.loadWarnings ?? [], [], `unexpected load warnings: ${JSON.stringify(loaded.loadWarnings)}`);
const loadedIntro = eventOf(loaded.activeProject, "intro");
assert.ok(loadedIntro, "intro event must load");
assert.equal(loadedIntro.dialogueBeats.length, 2);
assert.equal(blockContent(loaded.activeProject, "block:b1"), "¿Dónde está la reliquia?");
assert.equal(blockContent(loaded.activeProject, "block:b2"), "El sótano tiembla.");
assert.equal((loadedIntro.transitions ?? []).length, 4);
assert.equal(loadedIntro.decisions[0].outcomes.length, 2);
assert.deepEqual(loadedIntro.decisions[0].outcomes[0].availability, {
  type: "value",
  subject: { kind: "variable", variableId: "miedo" },
  operator: "<",
  value: 3,
});
// The loaded event re-serializes to the same evpath the file held.
assert.equal(serializeEventEvpath(loaded.activeProject, "intro"), expectedEvpath);

// --- An external .evpath edit is honored on load ---------------------------
const editedProject = sampleProject();
const edited = universeFiles(editedProject);
const evpathIndex = edited.files.findIndex((file) => file.relativePath.endsWith("/events/intro.evpath"));
edited.files[evpathIndex] = {
  ...edited.files[evpathIndex],
  content: edited.files[evpathIndex].content.replace("¿Dónde está la reliquia?", "¿Dónde escondiste la reliquia?"),
};
const loadedEdit = loadPathBranchingWorkspace(edited.files);
assert.deepEqual(loadedEdit.loadWarnings ?? [], [], `external edit produced warnings: ${JSON.stringify(loadedEdit.loadWarnings)}`);
assert.equal(blockContent(loadedEdit.activeProject, "block:b1"), "¿Dónde escondiste la reliquia?");

// --- Migration: a 0.2 story (JSON only, no .evpath) still loads intact ------
const legacy = universeFiles(sampleProject(), { evpath: false, storageVersion: "0.2" });
assert.ok(
  !legacy.files.some((file) => file.relativePath.endsWith(".evpath")),
  "legacy fixture must have no .evpath files",
);
const loadedLegacy = loadPathBranchingWorkspace(legacy.files);
assert.deepEqual(loadedLegacy.loadWarnings ?? [], [], `legacy load produced warnings: ${JSON.stringify(loadedLegacy.loadWarnings)}`);
const legacyIntro = eventOf(loadedLegacy.activeProject, "intro");
assert.ok(legacyIntro, "legacy intro event must load");
assert.equal(legacyIntro.dialogueBeats.length, 2);
assert.equal(blockContent(loadedLegacy.activeProject, "block:b1"), "¿Dónde está la reliquia?");
assert.equal((legacyIntro.transitions ?? []).length, 4);

// --- A malformed .evpath keeps the JSON sidecar and warns ------------------
const broken = universeFiles(sampleProject());
const brokenIndex = broken.files.findIndex((file) => file.relativePath.endsWith("/events/intro.evpath"));
broken.files[brokenIndex] = {
  ...broken.files[brokenIndex],
  content: broken.files[brokenIndex].content + "\n* opción rota sin corchetes\n",
};
const loadedBroken = loadPathBranchingWorkspace(broken.files);
assert.ok(
  (loadedBroken.loadWarnings ?? []).some((warning) => warning.includes("Intro")),
  "a malformed .evpath must warn",
);
const brokenIntro = eventOf(loadedBroken.activeProject, "intro");
assert.equal(brokenIntro.dialogueBeats.length, 2, "JSON sidecar must be preserved when evpath is malformed");
assert.equal(blockContent(loadedBroken.activeProject, "block:b1"), "¿Dónde está la reliquia?");

console.log("evpath storage (0.4) verification passed");
