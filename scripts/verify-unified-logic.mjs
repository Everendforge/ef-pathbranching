import assert from "node:assert/strict";
import { applyLogicEffect, evaluateConditionInput } from "../lib/logic.js";
import { buildStoryCanvasModel } from "../lib/canvas/storyCanvasModel.js";
import { connectedNarrativeNodePosition } from "../lib/canvas/nodePlacement.js";
import { logicFieldOptions, presentConsequences } from "../lib/logicCapabilities.js";
import { createInternalTransition, deleteTransition, updateTransition } from "../lib/projectMutations.js";
import { normalizeProject } from "../lib/projectSerialization.js";
import { validateProject } from "../lib/validate.js";
import { normalizeWorkspaceSession } from "../lib/workspaceSettings.js";

const source = {
  specVersion: "0.1",
  projectId: "unified-logic",
  canonRefs: [],
  sequences: [{ id: "sequence:main", name: "Main", entryEventId: "event:a", eventIds: ["event:a", "event:b", "event:c"] }],
  branches: [],
  events: [
    { id: "event:a", name: "A", type: "normal", transitions: [] },
    { id: "event:b", name: "B", type: "normal", transitions: [] },
    { id: "event:c", name: "C", type: "final", transitions: [] },
  ],
  scripts: [],
  externalFunctions: [],
  variables: {},
  localExplorerTypes: [{ id: "item", label: "Item", createdAt: "2026-01-01", updatedAt: "2026-01-01" }],
  localExplorerProperties: [{ id: "durability", label: "Durability", valueType: "number", appliesToTypes: ["item"], createdAt: "2026-01-01", updatedAt: "2026-01-01" }],
  localExplorerEntities: [{ id: "item:relic", name: "Relic", type: "item", fields: { durability: 4 }, createdAt: "2026-01-01", updatedAt: "2026-01-01" }],
  logicTypeOverrides: [{ typeId: "item", source: "local", runtimeRoles: ["owned"] }],
  logicPropertyOverrides: [{ propertyId: "durability", source: "local", conditionReadable: true, actionWritable: true }],
};

const project = normalizeProject(source);
const owned = { type: "state", subject: { kind: "entity", entityId: "item:relic", source: "local" }, stateId: "owned", operator: "has" };
const granted = applyLogicEffect({ type: "state", subject: owned.subject, stateId: "owned", operation: "grant" }, {});
assert.equal(evaluateConditionInput(owned, project, granted), true);
const damaged = applyLogicEffect({ type: "property", subject: owned.subject, propertyId: "durability", operation: "subtract", value: 1 }, {
  ...granted,
  entityStates: { ...granted.entityStates, "item:relic": { ...granted.entityStates?.["item:relic"], properties: { durability: 4 } } },
});
assert.equal(damaged.entityStates["item:relic"].properties.durability, 3);
assert.equal(project.localExplorerEntities[0].fields.durability, 4, "runtime effects must not mutate authored data");

const first = createInternalTransition(project, "event:a", "event:a", "event:b").project;
assert.equal(first.events[0].transitions[0].role, "flow");
const split = createInternalTransition(first, "event:a", "event:a", "event:c").project;
assert.deepEqual(split.events[0].transitions.map((transition) => transition.role), ["route", "route"]);
const degraded = deleteTransition(split, split.events[0].transitions[1].id).project;
assert.equal(degraded.events[0].transitions[0].role, "flow");
const transitionId = degraded.events[0].transitions[0].id;
const promoted = updateTransition(degraded, transitionId, { conditions: owned }).project;
assert.equal(promoted.events[0].transitions[0].role, "route");
const clean = updateTransition(promoted, transitionId, { conditions: undefined }).project;
assert.equal(clean.events[0].transitions[0].role, "flow");
assert.equal(clean.events[0].transitions[0].logic, undefined);

const conditionFields = logicFieldOptions(project, owned.subject, "condition").map((field) => field.key);
const effectFields = logicFieldOptions(project, owned.subject, "effect").map((field) => field.key);
assert.deepEqual(conditionFields, ["owned", "durability"]);
assert.deepEqual(effectFields, ["owned", "durability"]);

const conditionalSplit = updateTransition(split, split.events[0].transitions[0].id, { conditions: owned }).project;
conditionalSplit.events[0].transitions[1].mode = "fallback";
const visualModel = buildStoryCanvasModel(conditionalSplit, { canvasLayerMode: "visual" });
const logicModel = buildStoryCanvasModel(conditionalSplit, { canvasLayerMode: "logic" });
const visualGate = visualModel.nodes.find((node) => node.id === "route-gate:event:a");
const logicGate = logicModel.nodes.find((node) => node.id === "route-gate:event:a");
assert.equal(visualGate?.data.details?.junctionPresentation, "split");
assert.equal(logicGate?.data.details?.junctionPresentation, "gate");
assert.deepEqual(visualGate?.position, logicGate?.position, "layer toggles must preserve junction position");
assert.equal(visualGate?.width, logicGate?.width, "layer toggles must preserve junction width");
assert.equal(visualGate?.height, logicGate?.height, "layer toggles must preserve junction height");
assert.equal(visualModel.nodes.find((node) => node.id === "event:a")?.data.logicSummary, undefined);
assert.ok(logicModel.nodes.find((node) => node.id === "event:a")?.data.logicSummary);
const visualRoute = visualModel.edges.find((edge) => edge.data?.kind === "transition" && edge.data?.conditions);
const logicRoute = logicModel.edges.find((edge) => edge.data?.kind === "transition" && edge.data?.conditions);
assert.equal(visualRoute?.data?.canvasLayerMode, "visual");
assert.equal(visualRoute?.animated, false);
assert.equal(logicRoute?.data?.canvasLayerMode, "logic");
assert.equal(logicRoute?.animated, true);
assert.equal(logicRoute?.data?.routePreview?.conditionItems?.[0]?.subjectLabel, "Relic");

const disabledProject = normalizeProject({
  ...source,
  logicPropertyOverrides: [{ propertyId: "durability", source: "local", conditionReadable: true, actionWritable: false }],
});
assert.deepEqual(logicFieldOptions(disabledProject, owned.subject, "effect").map((field) => field.key), ["owned"]);
const disabledEffectPresentation = presentConsequences(disabledProject, [{ type: "property", subject: owned.subject, propertyId: "durability", operation: "subtract", value: 1 }]);
assert.equal(disabledEffectPresentation[0].status, "disabled", "existing logic must remain visible as a repairable capability warning");
assert.equal(normalizeWorkspaceSession({ canvasLayerMode: "logic" }).canvasLayerMode, "logic");
assert.equal(normalizeWorkspaceSession({ canvasLayerMode: "unknown" }).canvasLayerMode, undefined);

const sourceBeatNode = {
  id: "beat:source",
  type: "story",
  position: { x: 120, y: 205 },
  measured: { width: 360, height: 176 },
  data: { kind: "speechBeat", title: "Source", storyObjectId: "beat:source", badges: [] },
};
const firstConnectedPosition = connectedNarrativeNodePosition(
  [sourceBeatNode],
  sourceBeatNode,
  { width: 360, height: 176 },
  { snapToGrid: true, gridSize: 24 },
);
assert.equal(firstConnectedPosition.y, sourceBeatNode.position.y, "quick connections must preserve the source row exactly");
assert.ok(firstConnectedPosition.x >= sourceBeatNode.position.x + 360 + 72);
const occupiedSlot = {
  id: "route-gate:beat:source",
  type: "story",
  position: { x: firstConnectedPosition.x, y: sourceBeatNode.position.y },
  width: 168,
  height: 76,
  data: { kind: "routeGate", title: "Gate", storyObjectId: "route-gate:beat:source", badges: [] },
};
const nextConnectedPosition = connectedNarrativeNodePosition(
  [sourceBeatNode, occupiedSlot],
  sourceBeatNode,
  { width: 360, height: 176 },
  { snapToGrid: true, gridSize: 24 },
);
assert.equal(nextConnectedPosition.y, sourceBeatNode.position.y, "occupied slots must move right, never above the source");
assert.ok(nextConnectedPosition.x > occupiedSlot.position.x + 168);

assert.deepEqual(validateProject(project).filter((finding) => finding.severity === "error"), []);
assert.deepEqual(normalizeProject(normalizeProject(source)), normalizeProject(source), "normalization must be idempotent");
console.log(JSON.stringify({ owned: true, durability: 3, promoted: true, degraded: true, visualLogicLayers: true, capabilityWarnings: true, alignedQuickConnections: true, idempotent: true }, null, 2));
