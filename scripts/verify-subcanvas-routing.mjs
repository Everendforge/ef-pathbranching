import { readFile } from "node:fs/promises";
import { buildStoryCanvasModel } from "../lib/canvas/storyCanvasModel.js";
import { parseProject } from "../lib/projectSerialization.js";

const fixturePath = new URL("../examples/worldnotion-bridge-demo-project.json", import.meta.url);
const source = JSON.parse(await readFile(fixturePath, "utf8"));
const parent = source.events[0];
const entryPortId = `boundary:${parent.id}:input:entry`;

parent.childEventIds = ["event:route-a", "event:route-b"];
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
    decisions: [],
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

console.log(JSON.stringify({ entryRoutes: entryRoutes.length, routeGate: gateId }, null, 2));
