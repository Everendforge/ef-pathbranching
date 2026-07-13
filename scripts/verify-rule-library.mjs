import { readFile } from "node:fs/promises";
import { evaluateRuleSetBindings } from "../lib/logic.js";
import { parseProject } from "../lib/projectSerialization.js";
import { validateProject } from "../lib/validate.js";

const fixturePath = new URL("../examples/worldnotion-bridge-demo-project.json", import.meta.url);
const source = JSON.parse(await readFile(fixturePath, "utf8"));
const event = source.events[0];
event.decisions = [{ id: "decision:legacy", name: "Legacy decision", type: "dialogue", ruleSets: [{ id: "duplicate", label: "Decision rule", when: { all: [] }, then: [{ type: "setVariable", name: "decision", value: true }] }], outcomes: [{ id: "outcome:legacy", name: "Legacy outcome", ruleSets: [{ id: "duplicate", label: "Outcome rule", when: { all: [] }, then: [] }] }] }];
event.dialogues = [{ id: "dialogue:legacy", title: "Legacy dialogue", text: { content: "" }, ruleSets: [{ id: "duplicate", label: "Dialogue rule", when: { all: [] }, then: [] }], beats: [{ id: "beat:legacy", kind: "speech", blockRef: { scriptId: "script:legacy", blockId: "block:legacy" }, ruleSets: [{ id: "duplicate", label: "Beat rule", when: { all: [] }, then: [] }] }] }];
source.scriptDocuments = [{ id: "script:legacy", name: "Legacy", format: "forge-script", blocks: [{ id: "block:legacy", kind: "speech", content: "" }] }];
source.sequences[0].ruleSets = [{ id: "duplicate", label: "Sequence rule", when: { all: [] }, then: [] }];
source.branches = [{ id: "branch:legacy", title: "Legacy branch", eventIds: [event.id], ruleSets: [{ id: "duplicate", label: "Branch rule", when: { all: [] }, then: [] }] }];
event.ruleSets = [{ id: "duplicate", label: "Event rule", when: { all: [] }, then: [] }];
source.projectDataObjects = [{ id: "data:legacy", classId: "class:QuestFlag", name: "Legacy data", fields: {}, ruleSets: [{ id: "duplicate", label: "Data rule", when: { all: [] }, then: [] }] }];

const project = parseProject(JSON.stringify(source));
const expectedRules = 8;
if (project.ruleLibrary.rules.length !== expectedRules) throw new Error(`Expected ${expectedRules} migrated rules, got ${project.ruleLibrary.rules.length}.`);
if (new Set(project.ruleLibrary.rules.map((rule) => rule.id)).size !== expectedRules) throw new Error("Migrated local rules must get unique global ids.");
if (project.events[0].ruleSets) throw new Error("Legacy rule sets must be removed by normalization.");

const sequence = project.sequences[0];
const executions = evaluateRuleSetBindings(project.ruleLibrary, sequence.ruleSetBindings, "onEnter", project, { variables: {} });
if (executions.length !== 1) throw new Error("Expected the sequence onEnter binding to evaluate.");
const invalid = structuredClone(project);
invalid.events[0].ruleSetBindings = [{ id: "missing", ruleId: "rule:missing", phase: "onEnter", order: 0 }];
if (!validateProject(invalid).some((finding) => finding.code === "missing_rule_set")) throw new Error("Expected validation to report a missing global rule.");

console.log(JSON.stringify({ migratedRules: project.ruleLibrary.rules.length, evaluatedBindings: executions.length }, null, 2));
