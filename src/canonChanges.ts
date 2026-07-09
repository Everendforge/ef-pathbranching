import type { CanonChangeSet, CanonWorkingCopy } from "./domain.js";

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return `fnv1a:${(result >>> 0).toString(16)}`;
}

export function lineDiff(original: string, modified: string) {
  const before = original.replace(/\r\n/g, "\n").split("\n");
  const after = modified.replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];
  const length = Math.max(before.length, after.length);
  for (let index = 0; index < length; index += 1) {
    if (before[index] === after[index]) {
      if (before[index] !== undefined) lines.push(` ${before[index]}`);
      continue;
    }
    if (before[index] !== undefined) lines.push(`-${before[index]}`);
    if (after[index] !== undefined) lines.push(`+${after[index]}`);
  }
  return lines.join("\n");
}

export function changeSetPath(changeSetId: string) {
  const slug =
    changeSetId
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "canon-change";
  return `.everend/changes/${slug}.json`;
}

export function createCanonChangeSet(
  copy: CanonWorkingCopy,
  now = new Date().toISOString(),
): CanonChangeSet {
  const id = `change:${copy.canonRefId}:${Date.now().toString(36)}`;
  return {
    specVersion: "0.1",
    id,
    kind: "canon-change-set",
    sourceApp: "pathbranching",
    target: { entityId: copy.canonRefId, path: copy.sourcePath },
    base: {
      content: copy.sourceContent,
      modifiedMs: copy.sourceModifiedMs,
      contentHash: hash(copy.sourceContent),
      capturedAt: copy.createdAt,
    },
    proposed: {
      content: copy.draftContent,
      diff: lineDiff(copy.sourceContent, copy.draftContent),
    },
    status: "proposed",
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
}
