import { convertFileSrc } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./appEnvironment.js";

function isExternalAssetUrl(value: string) {
  return /^(?:https?:|data:|blob:)/i.test(value);
}

/** Converts stored asset references into safe vault-relative paths. */
export function normalizeAssetRelativePath(rawPath: string): string | undefined {
  let path = rawPath.trim().replace(/\\/g, "/");
  if (
    !path ||
    path.startsWith("/") ||
    /^[a-zA-Z]:\//.test(path) ||
    path.includes(":") ||
    path.includes("\0")
  ) {
    return undefined;
  }
  try {
    path = decodeURI(path);
  } catch {
    // Keep the original path when legacy metadata contains malformed encoding.
  }
  if (
    !path ||
    path.startsWith("/") ||
    /^[a-zA-Z]:\//.test(path) ||
    path.includes(":") ||
    path.includes("\0")
  ) {
    return undefined;
  }

  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!segments.length) return undefined;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.length ? segments.join("/") : undefined;
}

/**
 * Resolves an image reference at render time. External URLs pass through;
 * local paths are resolved against the currently opened universe so moving
 * the app or opening another universe never leaves a stale hard-coded URL.
 */
export function resolveUniverseAssetUrl(
  universeRootPath: string | undefined,
  rawPath: string,
): string | undefined {
  const value = rawPath.trim();
  if (!value) return undefined;
  if (isExternalAssetUrl(value)) return value;
  if (!isTauriRuntime() || !universeRootPath) return undefined;

  const relativePath = normalizeAssetRelativePath(value);
  if (!relativePath) return undefined;
  const root = universeRootPath.replace(/[\\/]$/, "");
  return convertFileSrc(`${root}/${relativePath}`);
}
