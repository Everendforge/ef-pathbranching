import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEmptyBranchingProjectFromWorldNotionIndex,
  indexWorldNotionVaultFiles,
} from "../lib/worldnotionBridge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const vaultRoot = path.join(repoRoot, "worldnotion/examples/bridge-demo-vault");

async function collectFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath, relativePath));
      continue;
    }

    if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".yaml") || entry.name.endsWith(".json"))) {
      files.push({
        relativePath,
        content: await readFile(absolutePath, "utf8"),
      });
    }
  }

  return files;
}

const files = await collectFiles(vaultRoot);
const index = indexWorldNotionVaultFiles(files);
const project = createEmptyBranchingProjectFromWorldNotionIndex(index, {
  projectId: "bridge-demo-from-worldnotion",
  name: "Bridge Demo From WorldNotion",
  vaultRelativePath: "../worldnotion/examples/bridge-demo-vault",
});

console.log(JSON.stringify({
  entityCount: index.entities.length,
  canonRefCount: index.canonRefs.length,
  typeCounts: index.typeCounts,
  findings: index.findings,
  projectPreview: {
    projectId: project.projectId,
    canonRefs: project.canonRefs.slice(0, 5),
  },
}, null, 2));
