import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import type { StoryCanvasEdge, StoryCanvasEdgeData } from "../canvas/storyCanvasModel.js";

type EditableCanvasEdgeData = StoryCanvasEdgeData & {
  editing?: boolean;
  inspectorState?: "open" | "expanded";
  onCommitLabel?: (label: string) => void;
  onCancelLabel?: () => void;
};

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
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const editing = edgeData?.editing === true;
  const label =
    typeof edgeData?.customLabel === "string"
      ? edgeData.customLabel
      : typeof edgeData?.label === "string"
        ? edgeData.label
        : "";
  const [value, setValue] = useState(label);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: edgeData?.inspectorState ? "var(--wn-accent)" : style?.stroke,
          strokeWidth: edgeData?.inspectorState === "expanded" ? 3 : edgeData?.inspectorState ? 2.25 : style?.strokeWidth,
        }}
      />
      {editing || label ? (
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
              <span>{label}</span>
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
