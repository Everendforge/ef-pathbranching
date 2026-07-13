import { Handle, Position, type NodeProps, type NodeTypes } from "@xyflow/react";
import type { CSSProperties } from "react";
import type { StoryCanvasNode, StoryCanvasNodeData } from "../canvas/storyCanvasModel.js";

function badgeText(value: string) {
  return value.length > 22 ? `${value.slice(0, 19)}...` : value;
}

function objectString(value: unknown, key: string) {
  if (!value || typeof value !== "object") return undefined;
  const nested = (value as Record<string, unknown>)[key];
  return typeof nested === "string" ? nested : undefined;
}

function StoryNode({ data, selected }: NodeProps<StoryCanvasNode>) {
  const nodeData = data as StoryCanvasNodeData;
  const isEvent = nodeData.kind === "event";
  const isFinalEvent = nodeData.kind === "event" && nodeData.badges.includes("terminal");
  const boundaryDirection =
    nodeData.kind === "boundary" && nodeData.details?.direction === "input"
      ? "input"
      : nodeData.kind === "boundary" && nodeData.details?.direction === "output"
        ? "output"
        : undefined;
  const focusClass = typeof nodeData.focusState === "string" ? ` focus-${nodeData.focusState}` : "";
  const inspectorFocusClass =
    typeof nodeData.inspectorState === "string"
      ? ` inspector-${nodeData.inspectorState}`
      : "";
  const canReceive = boundaryDirection
    ? boundaryDirection === "output"
    : nodeData.kind !== "start" && nodeData.kind !== "sequence" && nodeData.kind !== "missingRef";
  const canSource = boundaryDirection
    ? boundaryDirection === "input"
    : nodeData.kind !== "missingRef" && (nodeData.kind === "start" || (nodeData.kind !== "sequence" && !isFinalEvent));
  const eventTypeLabel = objectString(nodeData.details?.category, "label") ?? nodeData.subtitle ?? "Event";
  const branchLabel = objectString(nodeData.details?.branch, "title");
  const summaryBadges = Array.isArray(nodeData.summaryBadges)
    ? nodeData.summaryBadges.filter((badge): badge is string => typeof badge === "string" && badge.length > 0)
    : [];
  const detailBadges = nodeData.badges.filter((badge) => !/^\d+ decisions?$/.test(badge));
  const colorStyle = {
    "--node-accent": typeof nodeData.accentColor === "string" ? nodeData.accentColor : undefined,
    "--node-branch": typeof nodeData.branchColor === "string" ? nodeData.branchColor : undefined,
    "--node-type": typeof nodeData.details?.typeColor === "string" ? nodeData.details.typeColor : undefined,
  } as CSSProperties;

  if (nodeData.isContainer) {
    return (
      <div className={`story-node branch-container${focusClass}${inspectorFocusClass} ${selected ? "selected" : ""}`} style={colorStyle}>
        {canReceive ? <Handle type="target" position={Position.Left} /> : null}
        <div className="node-kind">{nodeData.kind}</div>
        <div className="node-title">{nodeData.title}</div>
        {nodeData.subtitle ? <div className="node-subtitle">{nodeData.subtitle}</div> : null}
        {nodeData.badges.length > 0 ? (
          <div className="node-badges">
            {nodeData.badges.slice(0, 5).map((badge) => (
              <span key={badge}>{badgeText(badge)}</span>
            ))}
          </div>
        ) : null}
        {canSource ? <Handle type="source" position={Position.Right} /> : null}
      </div>
    );
  }

  if (nodeData.kind === "start") {
    return (
      <div className={`story-node start${focusClass}${inspectorFocusClass}${selected ? " selected" : ""}`} style={colorStyle}>
        <span className="node-start-icon" aria-hidden="true" />
        <div className="node-start-title">{nodeData.title}</div>
        {canSource ? <Handle type="source" position={Position.Right} /> : null}
      </div>
    );
  }

  return (
    <div
      className={`story-node ${nodeData.kind}${focusClass}${inspectorFocusClass}${isFinalEvent ? " terminal" : ""}${selected ? " selected" : ""}`}
      style={colorStyle}
    >
      {canReceive ? <Handle type="target" position={boundaryDirection === "output" ? Position.Left : Position.Left} /> : null}
      {isEvent ? (
        <div className="node-color-tags" aria-label="Event tags">
          <span className="node-color-tag type">{badgeText(eventTypeLabel)}</span>
          {branchLabel ? <span className="node-color-tag branch">{badgeText(branchLabel)}</span> : null}
        </div>
      ) : (
        <div className="node-kind">{nodeData.kind}</div>
      )}
      <div className="node-title">{nodeData.title}</div>
      {summaryBadges.length > 0 ? (
        <div className="node-summary-badges">
          {summaryBadges.slice(0, 3).map((badge) => (
            <span key={badge}>{badgeText(badge)}</span>
          ))}
        </div>
      ) : null}
      {!isEvent && nodeData.subtitle ? <div className="node-subtitle">{nodeData.subtitle}</div> : null}
      {detailBadges.length > 0 ? (
        <div className="node-badges">
          {detailBadges.slice(0, 4).map((badge) => (
            <span key={badge}>{badgeText(badge)}</span>
          ))}
        </div>
      ) : null}
      {canSource ? <Handle type="source" position={boundaryDirection === "input" ? Position.Right : Position.Right} /> : null}
    </div>
  );
}

export const nodeTypes = {
  story: StoryNode,
} satisfies NodeTypes;
