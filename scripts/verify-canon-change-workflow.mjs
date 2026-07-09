import assert from "node:assert/strict";
import { createCanonChangeSet, lineDiff } from "../lib/canonChanges.js";
import {
  createLocalExplorerEntity,
  serializeLocalExplorerEntity,
} from "../lib/explorerEntities.js";
import {
  canonExplorerProperties,
  canonExplorerTypes,
  createLocalExplorerProperty,
  createLocalExplorerType,
} from "../lib/explorerSchema.js";

const copy = {
  canonRefId: "character:mara",
  sourcePath: "Characters/Mara.md",
  sourceModifiedMs: 42,
  sourceContent: "---\nid: character:mara\n---\nOriginal\n",
  draftContent: "---\nid: character:mara\n---\nRevised\n",
  path: ".everend/.pathbranching/working-copies/character-mara.md",
  createdAt: "2026-07-09T15:00:00.000Z",
  updatedAt: "2026-07-09T15:01:00.000Z",
};

const changeSet = createCanonChangeSet(copy, "2026-07-09T15:02:00.000Z");
assert.equal(changeSet.kind, "canon-change-set");
assert.equal(changeSet.target.entityId, copy.canonRefId);
assert.equal(changeSet.target.path, copy.sourcePath);
assert.equal(changeSet.base.modifiedMs, 42);
assert.equal(changeSet.status, "proposed");
assert.match(changeSet.proposed.diff, /-Original/);
assert.match(lineDiff(copy.sourceContent, copy.draftContent), /\+Revised/);

const localEntity = createLocalExplorerEntity(
  "item",
  "Signal Token",
  "2026-07-09T15:00:00.000Z",
);
const markdown = serializeLocalExplorerEntity({
  ...localEntity,
  body: "A local Explorer item.",
});
assert.match(markdown, /id: item:signal-token/);
assert.match(markdown, /type: item/);
assert.match(markdown, /A local Explorer item/);

const propertiesConfig = {
  entityTypes: {
    definitions: [
      {
        id: "character",
        label: "Character",
        color: "#6a8",
        suggestedFolder: "Characters",
      },
    ],
  },
  customFields: {
    definitions: [{ id: "occupation", label: "Occupation", type: "text" }],
  },
};
assert.equal(canonExplorerTypes(propertiesConfig)[0]?.label, "Character");
assert.equal(canonExplorerProperties(propertiesConfig)[0]?.valueType, "text");
assert.equal(createLocalExplorerType("2026-07-09T15:00:00.000Z").createdAt, "2026-07-09T15:00:00.000Z");
assert.equal(createLocalExplorerProperty("2026-07-09T15:00:00.000Z").valueType, "text");

console.log("Canon working-copy, Explorer entity, and local schema workflow verified.");
