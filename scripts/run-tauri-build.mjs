import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tauriEntrypoint = resolve(rootDir, "node_modules", "@tauri-apps", "cli", "tauri.js");

if (!existsSync(tauriEntrypoint)) {
  console.error("Could not find @tauri-apps/cli. Run npm install first.");
  process.exit(1);
}

const platformBundles =
  process.platform === "win32"
    ? ["nsis"]
    : process.platform === "darwin"
      ? ["app", "dmg"]
      : [];

const args = [tauriEntrypoint, "build"];
if (platformBundles.length > 0) {
  args.push("--bundles", platformBundles.join(","));
}

const child = spawn(process.execPath, args, {
  cwd: rootDir,
  stdio: "inherit",
  windowsHide: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`tauri build exited with signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
