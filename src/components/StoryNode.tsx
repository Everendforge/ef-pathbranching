import { Handle, Position, type NodeProps, type NodeTypes } from "@xyflow/react";
import { useState, type CSSProperties, type ChangeEvent, type MouseEvent, type PointerEvent } from "react";
import type { StoryCanvasNode, StoryCanvasNodeData } from "../canvas/storyCanvasModel.js";

function badgeText(value: string) {
  return value.length > 22 ? `${value.slice(0, 19)}...` : value;
}

function objectString(value: unknown, key: string) {
  if (!value || typeof value !== "object") return undefined;
  const nested = (value as Record<string, unknown>)[key];
  return typeof nested === "string" ? nested : undefined;
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
  content: string;
  translations?: Record<string, string>;
  speakerRef?: string;
  speakerOptions: Array<{ id: string; label: string }>;
  onUpdate: (updates: { content?: string; translations?: Record<string, string>; speakerRef?: string }) => void;
};

function isBeatQuickEditor(value: unknown): value is BeatQuickEditor {
  return Boolean(
    value && typeof value === "object" &&
    typeof (value as BeatQuickEditor).content === "string" &&
    Array.isArray((value as BeatQuickEditor).speakerOptions) &&
    typeof (value as BeatQuickEditor).onUpdate === "function",
  );
}

function stopCanvasInteraction(event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement> | ChangeEvent<HTMLSelectElement> | ChangeEvent<HTMLTextAreaElement>) {
  event.stopPropagation();
}

function StoryNode({ data, selected }: NodeProps<StoryCanvasNode>) {
  const nodeData = data as StoryCanvasNodeData;
  const [beatLanguage, setBeatLanguage] = useState("default");
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
            <div className="node-kind">decision</div>
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

  const quickEditor = isBeatQuickEditor(nodeData.details?.quickEditor)
    ? nodeData.details.quickEditor
    : undefined;
  if (nodeData.kind === "speechBeat") {
    const block = nodeData.details?.block as {
      content?: string;
      translations?: Record<string, string>;
      speakerRef?: string;
    } | undefined;
    const content = quickEditor?.content ?? block?.content ?? "";
    const translations = quickEditor?.translations ?? block?.translations ?? {};
    const speakerRef = quickEditor?.speakerRef ?? block?.speakerRef;
    const speakerOptions = quickEditor?.speakerOptions ?? [];
    const languageOptions = Array.from(new Set(["default", "es", "en", "pt", "fr", "ja", ...Object.keys(translations)]));
    const languageLabel = (code: string) => code === "default" ? "Primary" : code.toUpperCase();
    const text = beatLanguage === "default" ? content : translations[beatLanguage] ?? "";
    return (
      <div
        className={`story-node speech-beat-node${focusClass}${inspectorFocusClass}${selected ? " selected" : ""}`}
        style={colorStyle}
      >
        {canReceive ? <Handle type="target" position={Position.Left} /> : null}
        <label className="speech-beat-character">
          <span className="speech-beat-label">Character</span>
          <select className="nodrag nopan speech-beat-speaker" aria-label="Character" value={speakerRef ?? ""} onPointerDown={stopCanvasInteraction} onMouseDown={stopCanvasInteraction} onChange={(event) => {
            stopCanvasInteraction(event);
            quickEditor?.onUpdate({ speakerRef: event.target.value || undefined });
          }}>
            <option value="">Narrador</option>
            {speakerOptions.map((speaker) => <option key={speaker.id} value={speaker.id}>{speaker.label}</option>)}
          </select>
        </label>
        <label className="speech-beat-dialogue">
          <span className="speech-beat-label">Dialogue</span>
          <select className="nodrag nopan speech-beat-language" aria-label="Dialogue language" value={beatLanguage} onPointerDown={stopCanvasInteraction} onMouseDown={stopCanvasInteraction} onChange={(event) => { stopCanvasInteraction(event); setBeatLanguage(event.target.value); }}>
            {languageOptions.map((code) => <option key={code} value={code}>{languageLabel(code)}</option>)}
          </select>
          <textarea className="nodrag nopan speech-beat-content" aria-label="Dialogue text" placeholder="Write dialogue…" value={text} rows={3} onPointerDown={stopCanvasInteraction} onMouseDown={stopCanvasInteraction} onChange={(event) => {
            stopCanvasInteraction(event);
            quickEditor?.onUpdate(beatLanguage === "default"
              ? { content: event.target.value }
              : { translations: { ...translations, [beatLanguage]: event.target.value } });
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
