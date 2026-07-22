import assert from "node:assert/strict";
import {
  ensureBrowserUniverseWritePermission,
  pickBrowserUniverse,
  readBrowserUniverse,
  writeBrowserUniverseFile,
} from "../lib/utils/browserUniverse.js";
import { createDemoBrowserUniverse } from "../lib/utils/demoBrowserUniverse.js";
import { loadPathBranchingWorkspace } from "../lib/pathBranchingWorkspace.js";

const originalWindow = globalThis.window;

try {
  const root = {
    name: "demo",
    async *entries() {},
    async getDirectoryHandle() { return this; },
    async getFileHandle() { throw new Error("not needed"); },
  };
  const calls = [];
  globalThis.window = {
    async showDirectoryPicker(options) {
      calls.push(options);
      if (calls.length === 1) throw new DOMException("restricted", "AbortError");
      return root;
    },
  };

  const selected = await pickBrowserUniverse();
  assert.equal(selected.status, "selected");
  assert.equal(selected.root, root);
  assert.deepEqual(calls, [{ mode: "readwrite" }, undefined]);

  globalThis.window = {
    async showDirectoryPicker() {
      throw new DOMException("cancelled", "AbortError");
    },
  };
  assert.deepEqual(await pickBrowserUniverse(), { status: "cancelled" });

  assert.equal(await ensureBrowserUniverseWritePermission({
    ...root,
    async queryPermission() { return "prompt"; },
    async requestPermission() { return "granted"; },
  }), true);
  assert.equal(await ensureBrowserUniverseWritePermission({
    ...root,
    async queryPermission() { throw new DOMException("restricted", "SecurityError"); },
    async requestPermission() { return "denied"; },
  }), false);

  const demoRoot = createDemoBrowserUniverse();
  const demoFiles = await readBrowserUniverse(demoRoot);
  const demoWorkspace = loadPathBranchingWorkspace(demoFiles);
  assert.equal(demoWorkspace.universeProfile?.name, "PathBranching Browser Demo");
  assert.equal(demoWorkspace.createdDefaultStory, false);
  assert.equal(demoWorkspace.activeProject.events[0]?.dialogueBeats?.[0]?.kind, "speech");
  assert.equal(demoWorkspace.activeProject.canvas?.activeScope?.kind, "event");

  await writeBrowserUniverseFile(
    demoRoot,
    ".everend/.pathbranching/browser-demo-write.json",
    "{\"ok\":true}\n",
  );
  const writtenFiles = await readBrowserUniverse(demoRoot);
  assert.equal(
    writtenFiles.find((file) => file.relativePath.endsWith("browser-demo-write.json"))?.content,
    "{\"ok\":true}\n",
  );
} finally {
  globalThis.window = originalWindow;
}

console.log("Browser universe picker fallback and writable demo verified.");
