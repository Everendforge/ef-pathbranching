import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { indexWorldNotionVaultFiles } from "../lib/worldnotionBridge.js";
import {
  canonImagePropertiesForRef,
  canonExplorerPropertyTypes,
  canonExplorerTypeProperty,
  canonPresentationImageForRef,
} from "../lib/explorerSchema.js";

const fixture = (path) =>
  readFileSync(new URL(`../fixtures/spec-v0.2/${path}`, import.meta.url), "utf8");

const files = [
  {
    relativePath: ".everend/properties.json",
    content: fixture("properties.json"),
  },
  {
    relativePath: "Characters/Mara.md",
    content: fixture("nested-character.md"),
  },
  {
    relativePath: "Broken.md",
    content: `---
id: broken
broken: [
---
This note has invalid YAML.
`,
  },
  {
    relativePath: ".everend/templates/Character.md",
    content: `---
id: "{{id}}"
type: character-template
name: "{{name}}"
---
Template content.
`,
  },
  {
    relativePath: ".everend/.pathbranching/working-copies/character-mara.md",
    content: `---
id: should-not-import
type: working-copy
name: Branch Copy
---
PathBranching-owned working copy.
`,
  },
];

const index = indexWorldNotionVaultFiles(files);

assert.equal(index.propertiesConfig?.version, "3.0");
assert.equal(index.entities.length, 1);
assert.equal(index.canonRefs.length, 2);

const propertyTypes = canonExplorerPropertyTypes(index.propertiesConfig);
assert.deepEqual(propertyTypes.map((type) => type.id), ["character"]);
assert.deepEqual(canonExplorerTypeProperty(propertyTypes[0]), {
  id: "type:character",
  label: "Character",
  valueType: "entity type",
  description: undefined,
  appliesToTypes: ["character"],
  path: [],
  children: [],
});
const identity = propertyTypes[0]?.properties[0];
assert.equal(identity?.id, "identity");
assert.equal(identity?.valueType, "group");
assert.deepEqual(identity?.appliesToTypes, ["character"]);
assert.deepEqual(identity?.children.map((property) => property.id), ["role", "profile"]);
assert.deepEqual(identity?.children[1]?.children.map((property) => property.id), ["traits"]);

const scopedPropertyTypes = canonExplorerPropertyTypes({
  version: "3.0",
  entityTypes: {
    definitions: [
      { id: "character", label: "Character" },
      { id: "location", label: "Location", hiddenProperties: ["secret"] },
    ],
  },
  customFields: {
    definitions: [{
      id: "details",
      label: "Details",
      type: "group",
      appliesTo: ["character", "location"],
      children: [
        { id: "role", label: "Role", type: "text", appliesTo: ["character"] },
        { id: "region", label: "Region", type: "text", appliesTo: ["location"] },
        { id: "secret", label: "Secret", type: "text" },
      ],
    }],
  },
});
assert.deepEqual(
  scopedPropertyTypes[0]?.properties[0]?.children.map((property) => property.id),
  ["role", "secret"],
);
assert.deepEqual(
  scopedPropertyTypes[1]?.properties[0]?.children.map((property) => property.id),
  ["region"],
);

const entity = index.entities[0];
assert.equal(entity.id, "character:mara");
assert.equal(entity.frontmatter.identity.role, "protagonist");
assert.deepEqual(entity.frontmatter.identity.profile.traits, ["curious", "guarded"]);
assert.equal(entity.customProperties.identity.role, "protagonist");
assert.equal(entity.customProperties["unknown-object"].nested.level, 3);

const canonRef = index.canonRefs.find((ref) => ref.id === "character:mara");
assert.ok(canonRef);
assert.deepEqual(canonRef.aliases, ["The Lens"]);
assert.equal(canonRef.properties?.identity.role, "protagonist");
assert.deepEqual(canonRef.frontmatter?.identity.profile.traits, ["curious", "guarded"]);

const imageConfig = {
  version: "3.0",
  entityTypes: {
    definitions: [{ id: "character", presentation: { portraitPropertyId: "portrait" } }],
  },
  customFields: {
    definitions: [{
      id: "identity",
      type: "group",
      appliesTo: ["character"],
      children: [{ id: "portrait", label: "Portrait", type: "image" }],
    }],
  },
};
const portraitRef = {
  kind: "character",
  frontmatter: { identity: { portrait: "attachments/mara.png" } },
};
assert.deepEqual(canonImagePropertiesForRef(imageConfig, portraitRef), [{
  property: {
    id: "portrait",
    label: "Portrait",
    valueType: "image",
    path: ["identity", "portrait"],
    description: undefined,
    appliesToTypes: undefined,
    children: [],
  },
  value: "attachments/mara.png",
}]);
assert.equal(
  canonPresentationImageForRef(imageConfig, portraitRef, "portrait")?.value,
  "attachments/mara.png",
);

const invalidYamlFinding = index.findings.find((finding) => finding.code === "invalid_frontmatter");
assert.ok(invalidYamlFinding);
assert.equal(invalidYamlFinding.ref, "Broken.md");

assert.equal(
  index.canonRefs.some((ref) => ref.id === "should-not-import"),
  false,
);

console.log("WorldNotion YAML import verified.");
