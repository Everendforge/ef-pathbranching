import assert from "node:assert/strict";
import { normalizeWorkspaceSession } from "../lib/workspaceSettings.js";
import { saveEventInspectorTabGroup } from "../lib/eventInspectorState.js";

const session = normalizeWorkspaceSession({
  eventInspectorOpen: true,
  eventInspectorOpenEventIds: ["event:opening", "event:opening"],
  eventInspectorExpandedEventId: "event:opening",
  inspectorTabs: [
    {
      id: "canon:character:mara",
      title: "Mara",
      selection: { type: "canon", id: "character:mara" },
    },
    {
      id: "debug:active",
      title: "Debug",
      mode: "debug",
      selection: { type: "node", id: "event:opening" },
    },
  ],
  inspectorExpandedTabId: "canon:character:mara",
  inspectorMaximized: true,
  eventInspectorTabGroups: [
    {
      id: "mixed",
      name: "Opening reference",
      eventIds: ["event:opening"],
      inspectorTabs: [
        {
          id: "explorerEntity:item:token",
          title: "Signal Token",
          selection: { type: "explorerEntity", id: "item:token" },
        },
      ],
      inspectorExpandedTabId: "explorerEntity:item:token",
      createdAt: 1,
      updatedAt: 1,
    },
  ],
});

assert.deepEqual(session.eventInspectorOpenEventIds, ["event:opening"]);
assert.equal(session.inspectorTabs?.[0]?.selection.type, "canon");
assert.equal(session.inspectorTabs?.[1]?.mode, "debug");
assert.equal(session.inspectorExpandedTabId, "canon:character:mara");
assert.equal(session.inspectorMaximized, true);
assert.equal(session.eventInspectorTabGroups?.[0]?.inspectorTabs?.[0]?.title, "Signal Token");
assert.equal(
  session.eventInspectorTabGroups?.[0]?.inspectorExpandedTabId,
  "explorerEntity:item:token",
);

const normalizedExclusiveExpansion = normalizeWorkspaceSession({
  eventInspectorOpenEventIds: ["event:opening"],
  eventInspectorExpandedEventId: "event:opening",
  inspectorTabs: [
    {
      id: "canon:character:mara",
      title: "Mara",
      selection: { type: "canon", id: "character:mara" },
    },
  ],
  inspectorExpandedTabId: "canon:character:mara",
});
assert.equal(normalizedExclusiveExpansion.eventInspectorExpandedEventId, undefined);
assert.equal(normalizedExclusiveExpansion.inspectorExpandedTabId, "canon:character:mara");

const genericOnlyGroup = saveEventInspectorTabGroup(
  { open: false, openEventIds: [], expandedEventId: undefined },
  "Canon review",
  [],
  42,
);
assert.ok(genericOnlyGroup.groupId);
assert.deepEqual(genericOnlyGroup.groups[0]?.eventIds, []);

console.log("Unified inspector session migration verified.");
