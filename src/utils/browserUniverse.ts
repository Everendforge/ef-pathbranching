import type { UniverseFile } from "../pathBranchingWorkspace.js";
import { canUseBrowserDirectoryPicker } from "./appEnvironment.js";

export type BrowserFileHandle = {
  getFile: () => Promise<File>;
  createWritable: () => Promise<{
    write: (content: string | Blob | BufferSource) => Promise<void>;
    close: () => Promise<void>;
  }>;
  queryPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
};

export type BrowserDirectoryHandle = {
  name: string;
  entries: () => AsyncIterableIterator<[string, BrowserDirectoryHandle | BrowserFileHandle]>;
  getDirectoryHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<BrowserDirectoryHandle>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<BrowserFileHandle>;
  queryPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
};

type BrowserPicker = {
  showDirectoryPicker: (options?: { mode?: "read" | "readwrite" }) => Promise<BrowserDirectoryHandle>;
};

export type BrowserUniversePickerResult =
  | { status: "selected"; root: BrowserDirectoryHandle }
  | { status: "cancelled" };

function pickerErrorName(error: unknown): string | undefined {
  return error instanceof DOMException ? error.name : undefined;
}

function pathParts(relativePath: string): string[] {
  if (!relativePath || relativePath.startsWith("/") || relativePath.includes("\\") || relativePath.includes("\0")) {
    throw new Error("Browser universe paths must be non-empty relative paths using forward slashes.");
  }
  const parts = relativePath.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("Browser universe paths cannot contain traversal segments.");
  }
  return parts;
}

function isUniverseTextFile(relativePath: string): boolean {
  return /\.(?:md|json|ya?ml|evpath)$/i.test(relativePath);
}

export function browserUniversePath(root: BrowserDirectoryHandle): string {
  return `browser:${root.name}`;
}

export async function pickBrowserUniverse(): Promise<BrowserUniversePickerResult> {
  if (!canUseBrowserDirectoryPicker()) {
    throw new Error(
      "Folder picker is unavailable in this browser. Use Chrome, Edge, Brave, or the Tauri desktop app.",
    );
  }
  if (navigator.userAgent.includes("Electron")) {
    throw new Error(
      "Folder selection is restricted in this embedded browser. Use the Tauri desktop app instead.",
    );
  }

  const picker = window as unknown as BrowserPicker;
  try {
    return {
      status: "selected",
      root: await picker.showDirectoryPicker({ mode: "readwrite" }),
    };
  } catch (readwriteError) {
    if (pickerErrorName(readwriteError) !== "AbortError") throw readwriteError;
    // Some Chromium hosts reject readwrite even though folder reads work.
    // Retry without a mode so cancellation remains a normal, recoverable result.
    try {
      return { status: "selected", root: await picker.showDirectoryPicker() };
    } catch (readonlyError) {
      if (pickerErrorName(readonlyError) === "AbortError") return { status: "cancelled" };
      throw readonlyError;
    }
  }
}

/**
 * Requests write access when the File System Access implementation exposes a
 * permission API. Restricted hosts may only grant reads; that must not prevent
 * opening the universe and browsing its content.
 */
export async function ensureBrowserUniverseWritePermission(
  root: BrowserDirectoryHandle,
): Promise<boolean> {
  if (!root.queryPermission || !root.requestPermission) return true;
  try {
    const descriptor = { mode: "readwrite" as const };
    if (await root.queryPermission(descriptor) === "granted") return true;
    return await root.requestPermission(descriptor) === "granted";
  } catch {
    return false;
  }
}

export async function readBrowserUniverse(root: BrowserDirectoryHandle): Promise<UniverseFile[]> {
  const files: UniverseFile[] = [];

  async function walk(directory: BrowserDirectoryHandle, prefix: string): Promise<void> {
    for await (const [name, handle] of directory.entries()) {
      const relativePath = prefix ? `${prefix}/${name}` : name;
      if ("entries" in handle) {
        const insideEverend = prefix === ".everend" || prefix.startsWith(".everend/");
        if (name.startsWith(".") && !insideEverend && name !== ".everend") continue;
        await walk(handle, relativePath);
        continue;
      }
      if (!isUniverseTextFile(relativePath)) continue;
      const file = await handle.getFile();
      files.push({
        relativePath,
        content: await file.text(),
        modifiedMs: file.lastModified,
      });
    }
  }

  await walk(root, "");
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function directoryFor(root: BrowserDirectoryHandle, parts: string[], create: boolean): Promise<BrowserDirectoryHandle> {
  let current = root;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create });
  }
  return current;
}

export async function writeBrowserUniverseFile(
  root: BrowserDirectoryHandle,
  relativePath: string,
  content: string,
): Promise<number> {
  const parts = pathParts(relativePath);
  const name = parts.pop();
  if (!name) throw new Error("Browser universe file paths must include a filename.");
  const directory = await directoryFor(root, parts, true);
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
  return (await handle.getFile()).lastModified;
}
