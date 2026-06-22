import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const candidates = [
  path.join(packageRoot, "node_modules/vite/bin/vite.js"),
  path.join(packageRoot, "../worldnotion/node_modules/vite/bin/vite.js"),
];

let vite;
for (const candidate of candidates) {
  try {
    await access(candidate);
    vite = candidate;
    break;
  } catch {
    // Try the next candidate.
  }
}

if (!vite) {
  console.error("Could not find Vite. Run npm install in pathbranching, or install workspace dependencies.");
  process.exit(127);
}

const child = spawn(process.execPath, [vite, ...process.argv.slice(2)], {
  cwd: packageRoot,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
