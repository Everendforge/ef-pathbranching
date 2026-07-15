import assert from "node:assert/strict";
import {
  assignEventToBranch,
  buildEventDependencyOutline,
  buildSequenceConnectionPreview,
  branchesForSequence,
  eventsForBranch,
  normalizeBranchMembership,
} from "../lib/storyOutlineModel.js";
import { deleteSequence } from "../lib/projectMutations.js";

const baseProject = {
  specVersion: "0.1",
  projectId: "pathbranching:outline-test",
  name: "Outline Test",
  canonRefs: [],
  dataClasses: [],
  projectionRules: [],
  graphModules: [],
  sequences: [
    {
      id: "sequence:a",
      name: "Sequence A",
      entryEventId: "event:a:one",
      eventIds: ["event:a:one", "event:a:two"],
      branchIds: ["branch:alpha"],
    },
    {
      id: "sequence:b",
      name: "Sequence B",
      entryEventId: "event:b:one",
      eventIds: ["event:b:one"],
      branchIds: [],
    },
  ],
  branches: [
    {
      id: "branch:alpha",
      title: "Alpha",
      eventIds: ["event:a:two", "event:a:one"],
    },
    {
      id: "branch:beta",
      title: "Beta",
      eventIds: [],
    },
  ],
  events: [
    {
      id: "event:a:one",
      name: "A One",
      type: "normal",
      branchRef: "branch:beta",
      transitions: [],
    },
    {
      id: "event:a:two",
      name: "A Two",
      type: "normal",
      branchRef: "branch:alpha",
      transitions: [
        {
          id: "transition:a-to-b",
          from: "event:a:two",
          to: "event:b:one",
          label: "next sequence",
        },
      ],
      decisions: [
        {
          id: "decision:door",
          name: "Door",
          type: "dialogue",
          outcomes: [{ id: "outcome:open", name: "Open" }],
        },
      ],
    },
    {
      id: "event:b:one",
      name: "B One",
      type: "final",
      transitions: [],
    },
  ],
  scripts: [],
  externalFunctions: [],
  variables: {},
};

const normalized = normalizeBranchMembership(baseProject);
assert.deepEqual(normalized.branches.find((branch) => branch.id === "branch:alpha")?.eventIds, ["event:a:two"]);
assert.deepEqual(normalized.branches.find((branch) => branch.id === "branch:beta")?.eventIds, ["event:a:one"]);
assert.deepEqual(normalized.sequences.find((sequence) => sequence.id === "sequence:a")?.branchIds, [
  "branch:alpha",
  "branch:beta",
]);

const assigned = assignEventToBranch(normalized, "event:a:one", "branch:alpha");
assert.equal(assigned.events.find((event) => event.id === "event:a:one")?.branchRef, "branch:alpha");
assert.deepEqual(eventsForBranch(assigned, "branch:alpha", "sequence:a").map((event) => event.id), [
  "event:a:one",
  "event:a:two",
]);

const unassigned = assignEventToBranch(assigned, "event:a:one", undefined);
assert.equal(unassigned.events.find((event) => event.id === "event:a:one")?.branchRef, undefined);
assert.deepEqual(eventsForBranch(unassigned, "branch:alpha", "sequence:a").map((event) => event.id), ["event:a:two"]);

const sequenceBranches = branchesForSequence(normalized, "sequence:a").map((branch) => branch.id);
assert.deepEqual(sequenceBranches, ["branch:alpha", "branch:beta"]);

const connections = buildSequenceConnectionPreview(normalized);
assert.equal(connections.length, 1);
assert.equal(connections[0].fromSequenceId, "sequence:a");
assert.equal(connections[0].toSequenceId, "sequence:b");
assert.equal(connections[0].fromEventId, "event:a:two");
assert.equal(connections[0].toEventId, "event:b:one");

const outline = buildEventDependencyOutline(normalized, "sequence:a");
assert.equal(outline.length, 2);
assert.equal(outline.find((item) => item.event.id === "event:a:one")?.branch?.id, "branch:beta");
assert.equal(outline.find((item) => item.event.id === "event:a:two")?.outgoing[0]?.eventId, "event:b:one");
assert.equal(outline.find((item) => item.event.id === "event:a:two")?.event.decisions?.[0]?.outcomes.length, 1);

const deleted = deleteSequence(normalized, "sequence:a");
assert.equal(deleted.project.sequences.length, 1);
assert.equal(deleted.project.sequences[0].id, "sequence:b");
assert.equal(deleted.project.entrySequenceId, "sequence:b");
assert.deepEqual(deleted.project.events.map((event) => event.id), ["event:b:one"]);
assert.equal(deleted.project.branches.length, 0);
assert.equal(deleted.project.canvas?.activeSequenceId, "sequence:b");
assert.match(deleted.message ?? "", /Deleted sequence/);

const onlySequenceProject = { ...deleted.project, sequences: [deleted.project.sequences[0]] };
const onlySequence = deleteSequence(onlySequenceProject, "sequence:b");
assert.equal(onlySequence.project, onlySequenceProject);
assert.equal(onlySequence.message, "Cannot delete the only sequence in a story.");

console.log("Story outline model verified.");
