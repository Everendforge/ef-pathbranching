import type { StoryCanvasNode } from "./storyCanvasModel.js";

export type CanvasPlacementPoint = { x: number; y: number };

type CanvasNodeSize = { width: number; height: number };

const DEFAULT_CANVAS_NODE_SIZE: CanvasNodeSize = { width: 230, height: 126 };
const CANVAS_NODE_GAP = 24;

function numericDimension(fallback: number, ...values: unknown[]) {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function nodeSize(node: StoryCanvasNode): CanvasNodeSize {
  return {
    width: numericDimension(
      DEFAULT_CANVAS_NODE_SIZE.width,
      node.width,
      node.measured?.width,
      node.style?.width,
    ),
    height: numericDimension(
      DEFAULT_CANVAS_NODE_SIZE.height,
      node.height,
      node.measured?.height,
      node.style?.height,
    ),
  };
}

function overlaps(
  left: CanvasPlacementPoint & CanvasNodeSize,
  right: CanvasPlacementPoint & CanvasNodeSize,
  gap: number,
) {
  return (
    left.x < right.x + right.width + gap &&
    left.x + left.width + gap > right.x &&
    left.y < right.y + right.height + gap &&
    left.y + left.height + gap > right.y
  );
}

/**
 * Places a quick-connected narrative node on the same row as its source.
 * Occupied slots advance the candidate horizontally instead of pushing it
 * above or below the current beat.
 */
export function connectedNarrativeNodePosition(
  nodes: StoryCanvasNode[],
  source: StoryCanvasNode,
  targetSize: CanvasNodeSize,
  options: { snapToGrid: boolean; gridSize: number },
): CanvasPlacementPoint {
  const sourceSize = nodeSize(source);
  const horizontalGap = CANVAS_NODE_GAP * 3;
  const y = source.position.y;
  const obstacles = nodes
    .filter(
      (node) =>
        node.id !== source.id &&
        node.data.kind !== "workspace" &&
        !node.data.isContainer,
    )
    .map((node) => ({ ...node.position, ...nodeSize(node) }));
  let x = source.position.x + sourceSize.width + horizontalGap;

  // Each collision advances beyond the rightmost blocker. The loop is bounded
  // by the finite obstacle count and preserves the source's exact Y coordinate.
  for (let attempt = 0; attempt <= obstacles.length; attempt += 1) {
    const candidate = { x, y, ...targetSize };
    const blockers = obstacles.filter((obstacle) =>
      overlaps(candidate, obstacle, CANVAS_NODE_GAP),
    );
    if (blockers.length === 0) break;
    x = Math.max(...blockers.map((obstacle) => obstacle.x + obstacle.width)) + horizontalGap;
  }

  if (options.snapToGrid) {
    const gridSize = Math.max(1, options.gridSize);
    // Snap outward so the horizontal gap cannot shrink; Y stays untouched.
    x = Math.ceil(x / gridSize) * gridSize;
  }
  return { x, y };
}
