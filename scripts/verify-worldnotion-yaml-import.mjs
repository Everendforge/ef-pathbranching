import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { indexWorldNotionVaultFiles } from "../lib/worldnotionBridge.js";

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

const invalidYamlFinding = index.findings.find((finding) => finding.code === "invalid_frontmatter");
assert.ok(invalidYamlFinding);
assert.equal(invalidYamlFinding.ref, "Broken.md");

assert.equal(
  index.canonRefs.some((ref) => ref.id === "should-not-import"),
  false,
);

console.log("WorldNotion YAML import verified.");
