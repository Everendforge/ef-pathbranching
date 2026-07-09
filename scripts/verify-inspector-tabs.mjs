import assert from "node:assert/strict";
import { normalizeWorkspaceSession } from "../lib/workspaceSettings.js";

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
      createdAt: 1,
      updatedAt: 1,
    },
  ],
});

assert.deepEqual(session.eventInspectorOpenEventIds, ["event:opening"]);
assert.equal(session.inspectorTabs?.[0]?.selection.type, "canon");
assert.equal(session.inspectorExpandedTabId, "canon:character:mara");
assert.equal(session.inspectorMaximized, true);
assert.equal(session.eventInspectorTabGroups?.[0]?.inspectorTabs?.[0]?.title, "Signal Token");

console.log("Unified inspector session migration verified.");
