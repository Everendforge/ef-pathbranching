import assert from "node:assert/strict";
import {
  evaluateConditionInput,
  resolveFirstValidTransition,
} from "../lib/logic.js";
import {
  mergeIntegrationConfigs,
  parseIntegrationConfigYaml,
  serializeIntegrationConfigYaml,
} from "../lib/integrationConfig.js";
import { normalizeProject } from "../lib/projectSerialization.js";
import { updateScriptBlock } from "../lib/projectMutations.js";
import { exportRuntimePackage } from "../lib/exportRuntime.js";
import { validateProject } from "../lib/validate.js";

const project = normalizeProject({
  specVersion: "0.1",
  projectId: "narrative-integration",
  canonRefs: [
    { id: "character:a", kind: "character", label: "A", properties: { affiliation: "guild" } },
    { id: "knowledge:key", kind: "concept", label: "Key" },
  ],
  sequences: [{ id: "sequence:main", name: "Main", entryEventId: "event:main", eventIds: ["event:main", "event:a", "event:b"] }],
  branches: [],
  events: [
    {
      id: "event:main",
      name: "Main",
      type: "normal",
      dialogues: [{ id: "dialogue:intro", title: "Intro", speakerRef: "character:a", text: { format: "plain", content: "Hello" } }],
      transitions: [
        { id: "transition:fallback", from: "event:main", to: "event:b", mode: "fallback", order: 0 },
        { id: "transition:guild", from: "event:main", to: "event:a", order: 9, conditions: { type: "canonProperty", ref: "character:a", property: "affiliation", operator: "==", value: "guild" } },
      ],
    },
    { id: "event:a", name: "A", type: "final", transitions: [] },
    { id: "event:b", name: "B", type: "final", transitions: [] },
  ],
  scripts: [],
  externalFunctions: [],
  variables: {},
});

const outgoing = project.events[0].transitions;
assert.equal(outgoing[0].order, 1);
assert.equal(outgoing[1].order, 0);
assert.equal(resolveFirstValidTransition(outgoing, project, {})?.id, "transition:guild");
assert.equal(evaluateConditionInput(outgoing[1].conditions, project, {}), true);

const dialogue = project.events[0].dialogues[0];
assert.equal(dialogue.beats.length, 1);
const beat = dialogue.beats[0];
const edited = updateScriptBlock(project, beat.blockRef.scriptId, beat.blockRef.blockId, { content: "Shared text" }).project;
const runtime = exportRuntimePackage(edited);
assert.equal(runtime.localization[`script.${beat.blockRef.scriptId}.${beat.blockRef.blockId}`], "Shared text");

const base = parseIntegrationConfigYaml(serializeIntegrationConfigYaml(project.integrationConfig));
const override = parseIntegrationConfigYaml(`specVersion: "0.1"\nmappings:\n  - id: worldnotion:character\n    worldnotionTypes: [character]\n    classId: class:Speaker\n    roles: [speaker, condition]\n    comparableProperties: [affiliation]\n`);
assert.ok(mergeIntegrationConfigs(base, override).mappings.find((mapping) => mapping.id === "worldnotion:character")?.roles.includes("condition"));

const errors = validateProject(project).filter((finding) => finding.severity === "error");
assert.deepEqual(errors, []);

console.log(JSON.stringify({ transitions: outgoing.length, dialogueBeats: dialogue.beats.length, scriptDocuments: project.scriptDocuments.length, validationErrors: errors.length }, null, 2));
