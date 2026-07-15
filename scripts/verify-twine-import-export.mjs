import assert from "node:assert/strict";
import { exportTwineHtml, importTwineHtml, inspectTwineHtml } from "../lib/twineFormat.js";

const story = `<!doctype html><html><body>
<tw-storydata name="A &amp; B" startnode="2" creator="Twine" creator-version="2.12.0" format="SugarCube" format-version="2.37.3" ifid="ABC" hidden>
  <tw-passagedata pid="1" name="First" tags="" position="100,200">Intro [[Go|Start]]</tw-passagedata>
  <tw-passagedata pid="2" name="Start" tags="Final" position="300,400">&lt;&lt;set $ready to true&gt;&gt;</tw-passagedata>
</tw-storydata></body></html>`;

const summary = inspectTwineHtml(story);
assert.equal(summary.name, "A & B");
assert.equal(summary.format, "SugarCube");
assert.equal(summary.formatVersion, "2.37.3");
assert.equal(summary.passageCount, 2);
assert.equal(summary.startPassageName, "Start");

const project = importTwineHtml(story);
assert.equal(project.events.length, 2);
assert.equal(project.sequences[0].entryEventId, "twine:sequence:a-b:passage:2");
assert.equal(project.events[0].transitions?.[0]?.to, "twine:sequence:a-b:passage:2");
assert.equal(project.events[1].text?.content, "<<set $ready to true>>");
assert.deepEqual(project.canvas?.scopes?.["sequence:twine:sequence:a-b"]?.nodes?.["twine:sequence:a-b:passage:1"]?.position, { x: 100, y: 200 });

const projectWithSecondImport = importTwineHtml(story, project);
assert.equal(projectWithSecondImport.sequences.length, 2);
assert.equal(projectWithSecondImport.events.length, 4);
assert.equal(projectWithSecondImport.entrySequenceId, project.entrySequenceId);
assert.equal(projectWithSecondImport.canvas?.activeSequenceId, "twine:sequence:a-b-2");
assert.equal(projectWithSecondImport.sequences[1].entryEventId, "twine:sequence:a-b-2:passage:2");

const reimported = importTwineHtml(exportTwineHtml(project));
assert.equal(reimported.events.length, 2);
assert.equal(reimported.sequences[0].entryEventId, "twine:sequence:a-b:passage:2");

console.log("Twine SugarCube import/export verification passed.");
