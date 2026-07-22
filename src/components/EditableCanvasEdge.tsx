import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getStraightPath,
  type EdgeProps,
} from "@xyflow/react";
import { CircleAlert, GitBranch, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { StoryCanvasEdge, StoryCanvasEdgeData } from "../canvas/storyCanvasModel.js";
import type { LogicPresentation } from "../logicCapabilities.js";

type EditableCanvasEdgeData = StoryCanvasEdgeData & {
  editing?: boolean;
  inspectorState?: "open" | "expanded";
  onCommitLabel?: (label: string) => void;
  onCancelLabel?: () => void;
  onOpenLogicPart?: (part: "conditions" | "consequences") => void;
  connectionPadding?: number;
};

type RoutePreview = {
  mode?: "conditional" | "fallback";
  conditions?: string[];
  consequences?: string[];
  conditionItems?: LogicPresentation[];
  consequenceItems?: LogicPresentation[];
  warningCount?: number;
};

function routePreview(value: unknown): RoutePreview | undefined {
  return value && typeof value === "object" ? value as RoutePreview : undefined;
}

function entryArrowheads(sourceX: number, sourceY: number, targetX: number, targetY: number) {
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;
  const length = Math.hypot(deltaX, deltaY);
  if (length < 1) return [];

  const unitX = deltaX / length;
  const unitY = deltaY / length;
  const normalX = -unitY;
  const normalY = unitX;
  const arrowSize = 7;
  const baseWidth = 4.5;
  const start = Math.min(20, length * 0.2);
  const end = Math.max(start, length - 16);
  const count = Math.max(3, Math.min(16, Math.floor((end - start) / 22) + 1));

  return Array.from({ length: count }, (_, index) => {
    const distance = count === 1 ? (start + end) / 2 : start + ((end - start) * index) / (count - 1);
    const centerX = sourceX + unitX * distance;
    const centerY = sourceY + unitY * distance;
    const tipX = centerX + unitX * arrowSize;
    const tipY = centerY + unitY * arrowSize;
    const baseX = centerX - unitX * arrowSize;
    const baseY = centerY - unitY * arrowSize;
    return {
      id: `${index}`,
      points: `${tipX},${tipY} ${baseX + normalX * baseWidth},${baseY + normalY * baseWidth} ${baseX - normalX * baseWidth},${baseY - normalY * baseWidth}`,
    };
  });
}

export function EditableCanvasEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps<StoryCanvasEdge>) {
  const edgeData = data as EditableCanvasEdgeData | undefined;
  const logicMode = edgeData?.canvasLayerMode === "logic";
  const connectionPadding = Number(edgeData?.connectionPadding ?? 0);
  const isEntryEdge = edgeData?.kind === "entry";
  const [edgePath, labelX, labelY] = (isEntryEdge ? getStraightPath : getBezierPath)({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    ...(isEntryEdge ? {} : { curvature: Math.min(0.85, 0.25 + connectionPadding / 128) }),
  });
  const arrowheads = isEntryEdge ? entryArrowheads(sourceX, sourceY, targetX, targetY) : [];
  const editing = edgeData?.editing === true;
  const label =
    typeof edgeData?.customLabel === "string"
      ? edgeData.customLabel
      : typeof edgeData?.label === "string"
        ? edgeData.label
        : "";
  const [value, setValue] = useState(label);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const preview = logicMode ? routePreview(edgeData?.routePreview) : undefined;
  const routeIndex = Number(edgeData?.routeIndex ?? 0);
  const routeCount = Number(edgeData?.routeCount ?? 0);
  const previewLabel = preview
    ? preview.mode === "fallback"
      ? "Else"
      : preview.conditions?.length
        ? `If ${preview.conditions.join(" · ")}`
        : undefined
    : undefined;

  useEffect(() => {
    if (!editing) return;
    setValue(label);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [editing, label]);

  const commit = () => edgeData?.onCommitLabel?.(value.trim());

  return (
    <>
      <BaseEdge
        path={edgePath}
        className={logicMode && edgeData?.routeRole === "route" ? "canvas-route-edge" : edgeData?.kind === "transition" ? "canvas-flow-edge" : undefined}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: isEntryEdge
            ? "var(--pb-start)"
            : edgeData?.inspectorState
              ? "var(--wn-accent)"
              : style?.stroke,
          strokeLinecap: "round",
          strokeWidth: edgeData?.inspectorState === "expanded" ? 3 : edgeData?.inspectorState ? 2.25 : style?.strokeWidth,
        }}
      />
      {arrowheads.length > 0 ? (
        <g className="canvas-entry-arrowheads" aria-hidden="true">
          {arrowheads.map((arrowhead) => <polygon key={arrowhead.id} points={arrowhead.points} />)}
        </g>
      ) : null}
      {editing || (logicMode && (label || previewLabel)) ? (
        <EdgeLabelRenderer>
          <div
            className={`canvas-edge-label nodrag nopan ${editing ? "editing" : ""}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {editing ? (
              <input
                ref={inputRef}
                value={value}
                aria-label="Transition label"
                onChange={(event) => setValue(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commit();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    edgeData?.onCancelLabel?.();
                  }
                }}
              />
            ) : (
              <span className={`canvas-edge-preview${preview?.warningCount ? " warning" : ""}`}>
                {label ? <strong>{label}</strong> : null}
                {previewLabel ? <button type="button" className="route-logic-chip condition" onClick={(event) => { event.stopPropagation(); edgeData?.onOpenLogicPart?.("conditions"); }}>
                  <GitBranch size={11} />
                  <span>{preview?.mode === "fallback" ? "ELSE" : routeCount > 1 ? `${routeIndex + 1} · IF` : "IF"}</span>
                  <b>{preview?.conditionItems?.[0]?.text ?? preview?.conditions?.join(" · ")}</b>
                </button> : null}
                {preview?.consequences?.length ? <button type="button" className="route-logic-chip consequence" onClick={(event) => { event.stopPropagation(); edgeData?.onOpenLogicPart?.("consequences"); }}>
                  <Zap size={11} /><span>THEN</span><b>{preview?.consequenceItems?.[0]?.text ?? preview?.consequences?.join(" · ")}</b>
                </button> : null}
                {preview?.warningCount ? <span className="route-logic-warning" title={`${preview.warningCount} capability warning${preview.warningCount === 1 ? "" : "s"}`}><CircleAlert size={11} />{preview.warningCount}</span> : null}
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const editableCanvasEdgeTypes = {
  editable: EditableCanvasEdge,
};
