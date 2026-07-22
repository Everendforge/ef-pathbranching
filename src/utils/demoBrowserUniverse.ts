import type { BrowserDirectoryHandle, BrowserFileHandle } from "./browserUniverse.js";

type MemoryFile = {
  kind: "file";
  content: Blob;
  modifiedMs: number;
};

type MemoryDirectory = {
  kind: "directory";
  children: Map<string, MemoryDirectory | MemoryFile>;
};

const DEMO_PROJECT = {
  specVersion: "0.1",
  projectId: "pathbranching:browser-demo",
  storyId: "browser-demo",
  name: "PathBranching Browser Demo",
  sourceVault: { kind: "worldnotion", relativePath: "." },
  entrySequenceId: "sequence:demo",
  canonRefs: [{ id: "character:mara", kind: "character", source: "worldnotion" }],
  sequences: [{
    id: "sequence:demo",
    name: "Browser Demo",
    entryEventId: "event:demo-opening",
    eventIds: ["event:demo-opening"],
    branchIds: [],
  }],
  branches: [],
  events: [{
    id: "event:demo-opening",
    name: "The First Signal",
    type: "normal",
    text: { format: "plain", content: "A compact event for browser interaction testing." },
    canonRefs: ["character:mara"],
    presentEntityRefs: ["character:mara"],
    dialogueBeats: [{
      id: "beat:welcome",
      kind: "speech",
      blockRef: { scriptId: "script:demo", blockId: "block:welcome" },
    }],
    transitions: [],
  }],
  scripts: [],
  scriptDocuments: [{
    id: "script:demo",
    name: "Browser Demo Dialogue",
    format: "forge-script",
    blocks: [{
      id: "block:welcome",
      kind: "speech",
      textKey: "script.script:demo.block:welcome",
      content: "The signal is close. We only need to follow the next path.",
      characterRef: "character:mara",
    }],
  }],
  externalFunctions: [],
  variables: {},
  canvas: {
    activeSequenceId: "sequence:demo",
    activeScope: { kind: "event", id: "event:demo-opening" },
    scopes: {
      "event:event:demo-opening": {
        nodes: {
          "beat:event:demo-opening:beat:welcome": { position: { x: 420, y: 220 } },
        },
      },
    },
  },
};

const DEMO_FILES: Record<string, string> = {
  ".everend/universe.json": `${JSON.stringify({
    name: "PathBranching Browser Demo",
    icon: { type: "preset", value: "paths" },
    localization: {
      primaryLocale: "en",
      locales: ["en"],
      localeNames: { en: "English" },
    },
  }, null, 2)}\n`,
  ".everend/.pathbranching/manifest.json": `${JSON.stringify({
    version: "0.2",
    activeStoryId: "browser-demo",
    stories: [{
      id: "browser-demo",
      name: "PathBranching Browser Demo",
      path: ".everend/.pathbranching/stories/browser-demo.pathbranching.json",
    }],
  }, null, 2)}\n`,
  ".everend/.pathbranching/stories/browser-demo.pathbranching.json": `${JSON.stringify(DEMO_PROJECT, null, 2)}\n`,
  "Characters/Mara.md": `---
id: character:mara
type: character
name: Mara
status: canon
---

# Mara

Mara follows a signal through the branching paths.
`,
};

function createDirectory(): MemoryDirectory {
  return { kind: "directory", children: new Map() };
}

function validateChildName(name: string) {
  if (!name || name === "." || name === ".." || /[\\/\0]/.test(name)) {
    throw new DOMException(`Invalid file name: ${name}`, "TypeMismatchError");
  }
}

function blobFromWrite(content: string | Blob | BufferSource): Blob {
  if (typeof content === "string" || content instanceof Blob || content instanceof ArrayBuffer) {
    return new Blob([content]);
  }
  return new Blob([
    new Uint8Array(content.buffer, content.byteOffset, content.byteLength) as BlobPart,
  ]);
}

function fileHandle(name: string, node: MemoryFile): BrowserFileHandle {
  return {
    async getFile() {
      return new File([node.content], name, {
        lastModified: node.modifiedMs,
        type: node.content.type,
      });
    },
    async createWritable() {
      let pending = node.content;
      return {
        async write(content) {
          pending = blobFromWrite(content);
        },
        async close() {
          node.content = pending;
          node.modifiedMs = Date.now();
        },
      };
    },
    async queryPermission() { return "granted"; },
    async requestPermission() { return "granted"; },
  };
}

function directoryHandle(name: string, node: MemoryDirectory): BrowserDirectoryHandle {
  return {
    name,
    async *entries() {
      for (const [childName, child] of node.children) {
        yield [
          childName,
          child.kind === "directory"
            ? directoryHandle(childName, child)
            : fileHandle(childName, child),
        ];
      }
    },
    async getDirectoryHandle(childName, options) {
      validateChildName(childName);
      const child = node.children.get(childName);
      if (child?.kind === "directory") return directoryHandle(childName, child);
      if (child) throw new DOMException(`${childName} is a file.`, "TypeMismatchError");
      if (!options?.create) throw new DOMException(`${childName} was not found.`, "NotFoundError");
      const created = createDirectory();
      node.children.set(childName, created);
      return directoryHandle(childName, created);
    },
    async getFileHandle(childName, options) {
      validateChildName(childName);
      const child = node.children.get(childName);
      if (child?.kind === "file") return fileHandle(childName, child);
      if (child) throw new DOMException(`${childName} is a directory.`, "TypeMismatchError");
      if (!options?.create) throw new DOMException(`${childName} was not found.`, "NotFoundError");
      const created: MemoryFile = { kind: "file", content: new Blob(), modifiedMs: Date.now() };
      node.children.set(childName, created);
      return fileHandle(childName, created);
    },
    async queryPermission() { return "granted"; },
    async requestPermission() { return "granted"; },
  };
}

function insertFile(root: MemoryDirectory, relativePath: string, content: string) {
  const parts = relativePath.split("/");
  const fileName = parts.pop();
  if (!fileName) return;
  let directory = root;
  for (const part of parts) {
    const child = directory.children.get(part);
    if (child?.kind === "file") throw new Error(`Demo path conflicts with a file: ${relativePath}`);
    if (child?.kind === "directory") {
      directory = child;
    } else {
      const created = createDirectory();
      directory.children.set(part, created);
      directory = created;
    }
  }
  directory.children.set(fileName, {
    kind: "file",
    content: new Blob([content], { type: "text/plain" }),
    modifiedMs: 0,
  });
}

/** Creates a writable universe in memory for browser QA and product demos. */
export function createDemoBrowserUniverse(): BrowserDirectoryHandle {
  const root = createDirectory();
  Object.entries(DEMO_FILES).forEach(([relativePath, content]) =>
    insertFile(root, relativePath, content),
  );
  return directoryHandle("pathbranching-browser-demo", root);
}
