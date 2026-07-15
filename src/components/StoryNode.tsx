import { Handle, Position, type NodeProps, type NodeTypes } from "@xyflow/react";
import { useEffect, useState, type CSSProperties, type ChangeEvent, type MouseEvent, type PointerEvent } from "react";
import type { StoryCanvasNode, StoryCanvasNodeData } from "../canvas/storyCanvasModel.js";
import { localeDisplayName, type LocaleNames } from "../localization.js";

function badgeText(value: string) {
  return value.length > 22 ? `${value.slice(0, 19)}...` : value;
}

type DecisionOption = {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  handleId: string;
};

function isDecisionOption(value: unknown): value is DecisionOption {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as DecisionOption).id === "string" &&
      typeof (value as DecisionOption).handleId === "string",
  );
}

type BeatQuickEditor = {
  values: Record<string, string>;
  primaryLocale: string;
  languages: string[];
  localeNames?: LocaleNames;
  characterRef?: string;
  speakerOptions: Array<{ id: string; label: string; portraitUrl?: string }>;
  onTextUpdate: (locale: string, value: string) => void;
  onCharacterUpdate: (characterRef?: string) => void;
};

function isBeatQuickEditor(value: unknown): value is BeatQuickEditor {
  return Boolean(
    value && typeof value === "object" &&
    typeof (value as BeatQuickEditor).primaryLocale === "string" &&
    Array.isArray((value as BeatQuickEditor).languages) &&
    Array.isArray((value as BeatQuickEditor).speakerOptions) &&
    typeof (value as BeatQuickEditor).onTextUpdate === "function",
  );
}

type BoundaryRouteEditor = {
  selectedTargetId?: string;
  targets: Array<{ id: string; label: string }>;
  onTargetChange: (eventId: string) => void;
  onCreateTarget: () => void;
  onDeleteEnd?: () => void;
};

function isBoundaryRouteEditor(value: unknown): value is BoundaryRouteEditor {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as BoundaryRouteEditor).targets) &&
      typeof (value as BoundaryRouteEditor).onTargetChange === "function" &&
      typeof (value as BoundaryRouteEditor).onCreateTarget === "function",
  );
}

type WorkspaceEditor = {
  bounds: { x: number; y: number; width: number; height: number };
  onPreview: (bounds: { x: number; y: number; width: number; height: number }) => void;
  onCommit: (bounds: { x: number; y: number; width: number; height: number }) => void;
};

type WorkspaceResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

const WORKSPACE_RESIZE_DIRECTIONS: WorkspaceResizeDirection[] = [
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
  "nw",
];

function isWorkspaceEditor(value: unknown): value is WorkspaceEditor {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as WorkspaceEditor).bounds === "object" &&
      typeof (value as WorkspaceEditor).onPreview === "function" &&
      typeof (value as WorkspaceEditor).onCommit === "function",
  );
}

type EndAdder = {
  onAdd: () => void;
};

function isEndAdder(value: unknown): value is EndAdder {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as EndAdder).onAdd === "function",
  );
}

function stopCanvasInteraction(event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement> | ChangeEvent<HTMLSelectElement> | ChangeEvent<HTMLTextAreaElement>) {
  event.stopPropagation();
}

function StoryNode({ data, selected }: NodeProps<StoryCanvasNode>) {
  const nodeData = data as StoryCanvasNodeData;
  const [beatLanguage, setBeatLanguage] = useState("");
  const quickEditor = isBeatQuickEditor(nodeData.details?.quickEditor)
    ? nodeData.details.quickEditor
    : undefined;
  const draftLocale = beatLanguage || quickEditor?.primaryLocale || "und";
  const draftExternalText = quickEditor?.values[draftLocale] ?? "";
  const [draftText, setDraftText] = useState(draftExternalText);
  useEffect(() => setDraftText(draftExternalText), [draftExternalText, draftLocale]);
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
    : nodeData.kind !== "start" && nodeData.kind !== "sequence" && nodeData.kind !== "missingRef" && nodeData.kind !== "dialogueStart";
  const canSource = boundaryDirection
    ? boundaryDirection === "input"
    : nodeData.kind !== "missingRef" && (nodeData.kind === "start" || (nodeData.kind !== "sequence" && !isFinalEvent));
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

  if (nodeData.kind === "workspace") {
    const workspaceEditor = isWorkspaceEditor(nodeData.details?.workspaceEditor)
      ? nodeData.details.workspaceEditor
      : undefined;
    const startResize = (
      direction: WorkspaceResizeDirection,
      event: PointerEvent<HTMLButtonElement>,
    ) => {
      if (!workspaceEditor) return;
      event.preventDefault();
      stopCanvasInteraction(event);
      const origin = workspaceEditor.bounds;
      const startX = event.clientX;
      const startY = event.clientY;
      let latest = origin;
      const resize = (moveEvent: globalThis.PointerEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;
        let x = origin.x;
        let y = origin.y;
        let width = origin.width;
        let height = origin.height;
        if (direction.includes("w")) {
          x = Math.min(origin.x + deltaX, origin.x + origin.width - 720);
          width = origin.width + origin.x - x;
        } else if (direction.includes("e")) {
          width = Math.max(720, origin.width + deltaX);
        }
        if (direction.includes("n")) {
          y = Math.min(origin.y + deltaY, origin.y + origin.height - 460);
          height = origin.height + origin.y - y;
        } else if (direction.includes("s")) {
          height = Math.max(460, origin.height + deltaY);
        }
        latest = { x, y, width, height };
        workspaceEditor.onPreview(latest);
      };
      const finish = () => {
        workspaceEditor.onCommit(latest);
        window.removeEventListener("pointermove", resize);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
      };
      window.addEventListener("pointermove", resize);
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
    };
    return (
      <div className="story-node workspace-node" style={colorStyle}>
        {workspaceEditor ? (
          WORKSPACE_RESIZE_DIRECTIONS.map((direction) => (
            <button
              key={direction}
              type="button"
              className={`workspace-resize-handle workspace-resize-${direction} nodrag nopan`}
              aria-label={`Resize working area ${direction}`}
              onPointerDown={(event) => startResize(direction, event)}
            />
          ))
        ) : null}
      </div>
    );
  }

  if (nodeData.kind === "endAdder") {
    const endAdder = isEndAdder(nodeData.details?.endAdder)
      ? nodeData.details.endAdder
      : undefined;
    return (
      <div className="story-node end-adder">
        <button
          type="button"
          className="nodrag nopan"
          aria-label="Add End"
          title="Add End"
          onPointerDown={stopCanvasInteraction}
          onClick={(event) => {
            stopCanvasInteraction(event);
            endAdder?.onAdd();
          }}
        >
          +
        </button>
      </div>
    );
  }

  if (boundaryDirection) {
    const routeEditor = isBoundaryRouteEditor(nodeData.details?.routeEditor)
      ? nodeData.details.routeEditor
      : undefined;
    return (
      <div
        className={`story-node boundary boundary-${boundaryDirection}${focusClass}${inspectorFocusClass}${selected ? " selected" : ""}`}
        style={colorStyle}
      >
        {canReceive ? <Handle type="target" position={Position.Left} /> : null}
        <span className="node-boundary-icon" aria-hidden="true" />
        <div className="node-boundary-copy">
          <div className="node-title">{nodeData.title}</div>
          {nodeData.subtitle ? <div className="node-subtitle">{nodeData.subtitle}</div> : null}
        </div>
        {boundaryDirection === "output" && routeEditor ? (
          <div className="node-boundary-actions nodrag nopan">
            <select
              aria-label="Route destination"
              value={routeEditor.selectedTargetId ?? ""}
              onPointerDown={stopCanvasInteraction}
              onMouseDown={stopCanvasInteraction}
              onChange={(event) => {
                stopCanvasInteraction(event);
                if (event.target.value) routeEditor.onTargetChange(event.target.value);
              }}
            >
              <option value="">Choose existing event…</option>
              {routeEditor.targets.map((target) => (
                <option key={target.id} value={target.id}>{target.label}</option>
              ))}
            </select>
            <button
              type="button"
              onPointerDown={stopCanvasInteraction}
              onMouseDown={stopCanvasInteraction}
              onClick={(event) => {
                stopCanvasInteraction(event);
                routeEditor.onCreateTarget();
              }}
            >
              New event
            </button>
            {routeEditor.onDeleteEnd ? (
              <button
                type="button"
                className="boundary-delete-end"
                aria-label="Delete End"
                title="Delete End"
                onPointerDown={stopCanvasInteraction}
                onMouseDown={stopCanvasInteraction}
                onClick={(event) => {
                  stopCanvasInteraction(event);
                  routeEditor.onDeleteEnd?.();
                }}
              >
                ×
              </button>
            ) : null}
          </div>
        ) : null}
        {canSource ? <Handle type="source" position={Position.Right} /> : null}
      </div>
    );
  }

  if (nodeData.kind === "decision") {
    const decision = nodeData.details?.decision as { optionStyle?: string } | undefined;
    const optionStyle = decision?.optionStyle ?? "visibleText";
    const options = Array.isArray(nodeData.details?.options)
      ? nodeData.details.options.filter(isDecisionOption)
      : [];
    const styleLabel =
      optionStyle === "followUpText"
        ? "next text"
        : optionStyle === "iconOnly"
          ? "icon only"
          : "visible text";

    return (
      <div
        className={`story-node decision decision-container${focusClass}${inspectorFocusClass}${selected ? " selected" : ""}`}
        style={colorStyle}
      >
        <Handle type="target" position={Position.Left} />
        <div className="decision-header">
          <div>
            <div className="node-title">{nodeData.title}</div>
          </div>
          <span className="decision-style">{styleLabel}</span>
        </div>
        {nodeData.subtitle ? <div className="node-subtitle">{nodeData.subtitle}</div> : null}
        <div className="decision-options">
          {options.map((option, index) => {
            const label =
              optionStyle === "followUpText"
                ? option.description || option.name
                : optionStyle === "iconOnly"
                  ? option.icon || "◇"
                  : option.name;
            return (
              <div className="decision-option" key={option.id}>
                <span className="decision-option-key">{String.fromCharCode(65 + index)}</span>
                <span className={`decision-option-label ${optionStyle === "iconOnly" ? "icon" : ""}`}>{label}</span>
                <Handle id={option.handleId} type="source" position={Position.Right} />
              </div>
            );
          })}
          {options.length === 0 ? <span className="decision-empty">Add an outcome to create an option.</span> : null}
        </div>
      </div>
    );
  }

  if (nodeData.kind === "speechBeat" || nodeData.kind === "directionBeat") {
    const block = nodeData.details?.block as {
      content?: string;
      translations?: Record<string, string>;
      speakerRef?: string;
    } | undefined;
    const primaryLocale = quickEditor?.primaryLocale ?? "und";
    const selectedLocale = beatLanguage || primaryLocale;
    const speakerRef = quickEditor?.characterRef ?? block?.speakerRef;
    const speakerOptions = quickEditor?.speakerOptions ?? [];
    const speakerPortraitUrl = speakerOptions.find((speaker) => speaker.id === speakerRef)?.portraitUrl;
    const languageOptions = quickEditor?.languages ?? [primaryLocale];
    const languageLabel = (code: string) => `${localeDisplayName(code, quickEditor?.localeNames)}${code === primaryLocale ? " · Primary" : ""}`;
    const isSpeech = nodeData.kind === "speechBeat";
    return (
      <div
        className={`story-node speech-beat-node${focusClass}${inspectorFocusClass}${selected ? " selected" : ""}`}
        style={colorStyle}
      >
        {canReceive ? <Handle type="target" position={Position.Left} /> : null}
        {isSpeech ? <label className="speech-beat-character">
          <span className="speech-beat-label">Character</span>
          <div className="speech-beat-speaker-row">
            {speakerPortraitUrl ? <img className="speech-beat-portrait" src={speakerPortraitUrl} alt="" /> : null}
            <select className="nodrag nopan speech-beat-speaker" aria-label="Character" value={speakerRef ?? ""} onPointerDown={stopCanvasInteraction} onMouseDown={stopCanvasInteraction} onChange={(event) => {
              stopCanvasInteraction(event);
              quickEditor?.onCharacterUpdate(event.target.value || undefined);
            }}>
              <option value="">Narrador</option>
              {speakerOptions.map((speaker) => <option key={speaker.id} value={speaker.id}>{speaker.label}</option>)}
            </select>
          </div>
        </label> : null}
        <label className="speech-beat-dialogue">
          <span className="speech-beat-label">{isSpeech ? "Dialogue" : "Stage direction"}</span>
          <select className="nodrag nopan speech-beat-language" aria-label="Dialogue language" value={selectedLocale} onPointerDown={stopCanvasInteraction} onMouseDown={stopCanvasInteraction} onChange={(event) => { stopCanvasInteraction(event); setBeatLanguage(event.target.value); }}>
            {languageOptions.map((code) => <option key={code} value={code}>{languageLabel(code)}</option>)}
          </select>
          <textarea className="nodrag nopan speech-beat-content" aria-label={isSpeech ? "Dialogue text" : "Stage direction text"} placeholder={isSpeech ? "Write dialogue…" : "Write stage direction…"} value={draftText} rows={3} onPointerDown={stopCanvasInteraction} onMouseDown={stopCanvasInteraction} onKeyDown={(event) => event.stopPropagation()} onChange={(event) => {
            stopCanvasInteraction(event);
            setDraftText(event.target.value);
            quickEditor?.onTextUpdate(selectedLocale, event.target.value);
          }} />
        </label>
        {canSource ? <Handle type="source" position={Position.Right} /> : null}
      </div>
    );
  }

  return (
    <div
      className={`story-node ${nodeData.kind}${focusClass}${inspectorFocusClass}${isFinalEvent ? " terminal" : ""}${selected ? " selected" : ""}`}
      style={colorStyle}
    >
      {canReceive ? <Handle type="target" position={Position.Left} /> : null}
      <div className="node-title">{nodeData.title}</div>
      {summaryBadges.length > 0 ? (
        <div className="node-summary-badges">
          {summaryBadges.slice(0, 3).map((badge) => (
            <span key={badge}>{badgeText(badge)}</span>
          ))}
        </div>
      ) : null}
      {nodeData.subtitle ? <div className="node-subtitle">{nodeData.subtitle}</div> : null}
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
