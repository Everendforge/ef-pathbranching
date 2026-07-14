import { readFile } from "node:fs/promises";
import { buildStoryCanvasModel } from "../lib/canvas/storyCanvasModel.js";
import { parseProject } from "../lib/projectSerialization.js";

const fixturePath = new URL("../examples/worldnotion-bridge-demo-project.json", import.meta.url);
const source = JSON.parse(await readFile(fixturePath, "utf8"));
const parent = source.events[0];
const entryPortId = `boundary:${parent.id}:input:entry`;

parent.childEventIds = ["event:route-a", "event:route-b"];
parent.decisions = [
  {
    id: "decision:signal-response",
    name: "Signal response",
    type: "dialogue",
    optionStyle: "visibleText",
    outcomes: [
      { id: "accept", name: "Accept", description: "The signal is answered." },
      { id: "decline", name: "Decline", description: "The signal is ignored." },
    ],
  },
];
parent.dialogueBeats = [
  {
    id: "beat:event-speech",
    kind: "speech",
    blockRef: { scriptId: "script:fixture", blockId: "block:event-speech" },
  },
];
source.scriptDocuments = [
  ...(source.scriptDocuments ?? []),
  {
    id: "script:fixture",
    name: "Fixture dialogue",
    format: "forge-script",
    blocks: [{ id: "block:event-speech", kind: "speech", content: "A beat on the event canvas." }],
  },
];
parent.transitions = [
  {
    id: "transition:signal-accept",
    from: `outcome:${parent.id}:decision:signal-response:accept`,
    to: "event:route-a",
    source: "graph",
  },
  {
    id: "transition:signal-decline",
    from: `outcome:${parent.id}:decision:signal-response:decline`,
    to: "event:route-b",
    source: "graph",
  },
];
parent.boundaryBindings = [
  { id: "legacy-entry-a", portId: entryPortId, nodeId: "event:route-a", direction: "input" },
  { id: "legacy-entry-b", portId: entryPortId, nodeId: "event:route-b", direction: "input" },
];
source.events.push(
  {
    id: "event:route-a",
    name: "Route A",
    type: "normal",
    parentEventId: parent.id,
    childEventIds: [],
    decisions: [
      {
        id: "decision:nested-only",
        name: "Nested-only decision",
        type: "dialogue",
        outcomes: [],
      },
    ],
    dialogues: [],
    transitions: [],
  },
  {
    id: "event:route-b",
    name: "Route B",
    type: "normal",
    parentEventId: parent.id,
    childEventIds: [],
    decisions: [],
    dialogues: [],
    transitions: [],
  },
);
source.sequences[0].eventIds.push("event:route-a", "event:route-b");

const project = parseProject(JSON.stringify(source));
const migratedParent = project.events.find((event) => event.id === parent.id);
const entryRoutes = migratedParent.transitions.filter((transition) => transition.from === entryPortId);
if (entryRoutes.length !== 2) {
  throw new Error(`Expected two migrated Entry routes, got ${entryRoutes.length}.`);
}

const model = buildStoryCanvasModel(project, { scope: { kind: "event", id: parent.id } });
const gateId = `route-gate:${entryPortId}`;
if (!model.nodes.some((node) => node.id === gateId && node.data.kind === "routeGate")) {
  throw new Error("Expected a Route Gate for multiple Entry routes.");
}
if (!model.edges.some((edge) => edge.source === gateId && edge.data.kind === "transition")) {
  throw new Error("Expected route transitions to be rendered from the Route Gate.");
}

const decisionId = `decision:${parent.id}:decision:signal-response`;
const acceptOutcomeId = `outcome:${parent.id}:decision:signal-response:accept`;
const decision = model.nodes.find((node) => node.id === decisionId);
if (decision?.data.kind !== "decision" || !Array.isArray(decision.data.details?.options)) {
  throw new Error("Expected outcomes to be represented as options inside the Decision node.");
}
if (!model.edges.some((edge) => edge.source === decisionId && edge.sourceHandle === acceptOutcomeId)) {
  throw new Error("Expected an outcome to retain its own Decision output handle.");
}
const eventBeatId = `beat:${parent.id}:beat:event-speech`;
if (!model.nodes.some((node) => node.id === eventBeatId && node.data.kind === "speechBeat")) {
  throw new Error("Expected event-level dialogue beats beside decisions in the event canvas.");
}
const decisionGateId = `route-gate:${acceptOutcomeId}`;
if (model.nodes.some((node) => node.id === decisionGateId)) {
  throw new Error("A single transition in an event canvas must stay direct unless its Route Gate is inserted manually.");
}
const eventScopeKey = `event:${parent.id}`;
project.canvas = {
  ...project.canvas,
  scopes: {
    ...(project.canvas?.scopes ?? {}),
    [eventScopeKey]: { routeGateSources: [acceptOutcomeId] },
  },
};
const manuallyGatedEventModel = buildStoryCanvasModel(project, { scope: { kind: "event", id: parent.id } });
if (!manuallyGatedEventModel.nodes.some((node) => node.id === decisionGateId)) {
  throw new Error("A manually inserted Route Gate must work for a single event-canvas transition.");
}
const simpleRootModel = buildStoryCanvasModel(project);
if (simpleRootModel.nodes.some((node) => node.data.kind === "decision")) {
  throw new Error("Decisions must only render inside their event canvas.");
}
if (simpleRootModel.nodes.some((node) => node.id === "decision:event:route-a:decision:nested-only")) {
  throw new Error("Nested-event decisions must not appear in the parent canvas.");
}
if (simpleRootModel.nodes.some((node) => node.id === decisionGateId)) {
  throw new Error("Parent canvases must keep Route Gates opt-in.");
}
const rootScopeKey = `sequence:${project.sequences[0].id}`;
project.canvas = {
  ...project.canvas,
  scopes: {
    ...(project.canvas?.scopes ?? {}),
    [rootScopeKey]: { routeGateSources: [acceptOutcomeId] },
  },
};
const rootModel = buildStoryCanvasModel(project);
const decisionGate = rootModel.nodes.find((node) => node.id === decisionGateId);
if (decisionGate?.data.kind !== "routeGate") {
  throw new Error("Expected a Decision outcome Route Gate in the parent canvas.");
}
if (decisionGate.data.details?.eventId !== parent.id) {
  throw new Error("Expected the parent-canvas Route Gate to retain its owning event.");
}

console.log(JSON.stringify({ entryRoutes: entryRoutes.length, routeGate: gateId, decisionGate: decisionGateId }, null, 2));
