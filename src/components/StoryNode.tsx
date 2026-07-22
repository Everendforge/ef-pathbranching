import { Handle, NodeToolbar, Position, type NodeProps, type NodeTypes } from "@xyflow/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { AlignLeft, BookOpen, ChevronDown, ChevronUp, CircleDot, CircleHelp, Clapperboard, FileText, GitBranch, ImagePlus, MessageSquare, Plus, Split, Trash2, UserRound, X } from "lucide-react";
import type { CanvasInfoBadge, StoryCanvasNode, StoryCanvasNodeData } from "../canvas/storyCanvasModel.js";
import type { Outcome, SceneImageAttachment } from "../domain.js";
import type { LocaleNames } from "../localization.js";
import { UNKNOWN_SPEAKER_REF, speakerLabel } from "../speakerRoles.js";
import { SpeakerSelector } from "./SpeakerSelector.js";
import { LogicBands } from "./LogicComposer.js";

function badgeText(value: string) {
  return value.length > 22 ? `${value.slice(0, 19)}...` : value;
}

const BEAT_FONT_MIN_PX = 12;
const BEAT_FONT_MAX_PX = 38;

/**
 * Builds a representative filler string of the requested size so the baseline
 * dialogue font can be sized against the counter maximum instead of the
 * current content. Uses average-width lowercase characters and typical word
 * lengths so the baseline reflects realistic text density rather than the
 * widest possible glyphs (which left the box looking half-empty).
 */
function buildBeatFillerString(count: number, unit: "words" | "characters") {
  const safeCount = Math.max(1, Math.min(4000, Math.round(count)));
  if (unit === "words") {
    return Array.from({ length: safeCount }, () => "men").join(" ");
  }
  let filler = "";
  while (filler.length < safeCount) {
    filler += "men ";
  }
  return filler.slice(0, safeCount);
}

/**
 * Binary-searches the largest font size (within bounds) at which `text` fits
 * inside a detached clone of the beat content element, so measuring never
 * disturbs the live contentEditable selection.
 */
function measureBeatFontFit(reference: HTMLDivElement, text: string) {
  const clone = reference.cloneNode(false) as HTMLDivElement;
  clone.removeAttribute("contenteditable");
  clone.removeAttribute("role");
  clone.style.position = "absolute";
  clone.style.left = "-99999px";
  clone.style.top = "0";
  clone.style.visibility = "hidden";
  clone.style.pointerEvents = "none";
  clone.style.width = `${reference.clientWidth}px`;
  clone.style.height = `${reference.clientHeight}px`;
  clone.style.overflow = "hidden";
  clone.textContent = text;
  reference.parentElement?.appendChild(clone);
  const fitsAt = (px: number) => {
    clone.style.fontSize = `${px}px`;
    return clone.scrollHeight <= clone.clientHeight;
  };
  let result = BEAT_FONT_MIN_PX;
  if (fitsAt(BEAT_FONT_MAX_PX)) {
    result = BEAT_FONT_MAX_PX;
  } else {
    let low = BEAT_FONT_MIN_PX;
    let high = BEAT_FONT_MAX_PX;
    while (high - low > 0.5) {
      const mid = (low + high) / 2;
      if (fitsAt(mid)) {
        low = mid;
      } else {
        high = mid;
      }
    }
    result = low;
  }
  clone.remove();
  return result;
}

const infoBadgeLabels: Record<CanvasInfoBadge["kind"], string> = {
  decisions: "Decisions",
  outcomes: "Outcomes",
  dialogues: "Dialogue elements",
  characters: "Characters",
  words: "Words",
};

function CanvasInfoBadges({ badges }: { badges: CanvasInfoBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <div className="node-info-badges" aria-label="Authoring counts">
      {badges.map((badge) => {
        const Icon = badge.kind === "decisions"
          ? Split
          : badge.kind === "outcomes"
            ? CircleDot
            : badge.kind === "dialogues"
              ? MessageSquare
              : badge.kind === "characters"
                ? AlignLeft
                : FileText;
        return (
          <span key={badge.kind} title={`${infoBadgeLabels[badge.kind]}: ${badge.count}`}>
            <Icon size={11} aria-hidden="true" />
            <b>{badge.count}</b>
          </span>
        );
      })}
    </div>
  );
}

type DecisionOption = {
  id: string;
  name: string;
  visibleText?: string;
  description?: string;
  icon?: string;
  handleId: string;
};

type DecisionQuickEditor = {
  optionStyle: "visibleText" | "iconOnly";
  onOptionStyleUpdate: (style: "visibleText" | "iconOnly") => void;
  onOutcomeUpdate: (outcomeId: string, updates: Partial<Pick<Outcome, "visibleText">>) => void;
  onCreateOutcome: () => void;
  onDeleteOutcome: (outcomeId: string) => void;
};

function isDecisionQuickEditor(value: unknown): value is DecisionQuickEditor {
  return Boolean(
    value &&
      typeof value === "object" &&
      ((value as DecisionQuickEditor).optionStyle === "visibleText" ||
        (value as DecisionQuickEditor).optionStyle === "iconOnly") &&
      typeof (value as DecisionQuickEditor).onOptionStyleUpdate === "function" &&
      typeof (value as DecisionQuickEditor).onOutcomeUpdate === "function" &&
      typeof (value as DecisionQuickEditor).onCreateOutcome === "function" &&
      typeof (value as DecisionQuickEditor).onDeleteOutcome === "function",
  );
}

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
  directorNote?: string;
  sceneImage?: SceneImageAttachment & { name: string; url?: string };
  imageAssets?: Array<{ id: string; name: string }>;
  directorNoteOpen?: boolean;
  sceneImageOpen?: boolean;
  primaryLocale: string;
  activeLocale?: string;
  languages: string[];
  localeNames?: LocaleNames;
  characterRef?: string;
  characterVariantId?: string;
  textCounter?: { count: number; unit: "words" | "characters"; target: number };
  counterPreference?: {
    enabled: boolean;
    unit: "words" | "characters";
    target: number;
    eventOverride?: boolean;
  };
  onCounterPreferenceUpdate?: (updates: {
    enabled?: boolean;
    unit?: "words" | "characters";
    target?: number;
  }) => void;
  presentEntityIds?: string[];
  speakerOptions: Array<{
    id: string;
    label: string;
    portraitUrl?: string;
    variants: Array<{ id: string; label: string; portraitUrl?: string }>;
  }>;
  onTextUpdate: (locale: string, value: string) => void;
  onDirectorNoteUpdate?: (value: string) => void;
  onSceneImageUpdate?: (assetId?: string) => void;
  onImportSceneImage?: () => void;
  onAuxiliaryPanelChange?: (panel: "directorNote" | "sceneImage", open: boolean) => void;
  onCharacterUpdate: (characterRef?: string) => void;
  onCharacterVariantUpdate?: (variantId: string) => void;
  beatConnector?: {
    onConnect: (kind: "speechBeat" | "decision" | "directionBeat") => void;
    onInsertConditions?: () => void;
  };
};

type EventCoverImage = {
  assetId: string;
  name: string;
  url?: string;
};

type EventQuickEditor = {
  description: string;
  coverImage?: EventCoverImage;
  imageAssets: Array<{ id: string; name: string }>;
  coverImageOpen?: boolean;
  descriptionOpen?: boolean;
  onDescriptionUpdate: (value: string) => void;
  onCoverImageUpdate: (assetId?: string) => void;
  onImportCoverImage?: () => void;
  onAuxiliaryPanelChange: (panel: "coverImage" | "description", open: boolean) => void;
};

function isEventQuickEditor(value: unknown): value is EventQuickEditor {
  return Boolean(
    value && typeof value === "object" &&
    typeof (value as EventQuickEditor).description === "string" &&
    Array.isArray((value as EventQuickEditor).imageAssets) &&
    typeof (value as EventQuickEditor).onDescriptionUpdate === "function" &&
    typeof (value as EventQuickEditor).onCoverImageUpdate === "function" &&
    typeof (value as EventQuickEditor).onAuxiliaryPanelChange === "function",
  );
}

function isBeatQuickEditor(value: unknown): value is BeatQuickEditor {
  return Boolean(
    value && typeof value === "object" &&
    typeof (value as BeatQuickEditor).primaryLocale === "string" &&
    Array.isArray((value as BeatQuickEditor).languages) &&
    Array.isArray((value as BeatQuickEditor).speakerOptions) &&
    typeof (value as BeatQuickEditor).onTextUpdate === "function",
  );
}

type DialogueTriggerEditor = {
  speakerOptions: Array<{
    id: string;
    label: string;
    portraitUrl?: string;
    variants: Array<{ id: string; label: string; portraitUrl?: string }>;
  }>;
  presentEntityIds: string[];
  selectedCharacterId?: string;
  triggerActions: Array<{ id: string; label: string }>;
  selectedActionId?: string;
  onCharacterChange: (characterId?: string) => void;
  onActionChange: (actionId?: string) => void;
};

function isDialogueTriggerEditor(value: unknown): value is DialogueTriggerEditor {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as DialogueTriggerEditor).speakerOptions) &&
      Array.isArray((value as DialogueTriggerEditor).presentEntityIds) &&
      Array.isArray((value as DialogueTriggerEditor).triggerActions) &&
      typeof (value as DialogueTriggerEditor).onCharacterChange === "function" &&
      typeof (value as DialogueTriggerEditor).onActionChange === "function",
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

function stopCanvasInteraction(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

function StoryNode({ id, data, selected }: NodeProps<StoryCanvasNode>) {
  const nodeData = data as StoryCanvasNodeData;
  const [openBeatMenu, setOpenBeatMenu] = useState(false);
  const [editingDecisionOptionId, setEditingDecisionOptionId] = useState<string>();
  const [connectorMenuOpen, setConnectorMenuOpen] = useState(false);
  const connectorRef = useRef<HTMLDivElement>(null);
  const decisionEditorRef = useRef<HTMLDivElement>(null);
  const quickEditor = isBeatQuickEditor(nodeData.details?.quickEditor)
    ? nodeData.details.quickEditor
    : undefined;
  const decisionEditor = isDecisionQuickEditor(nodeData.details?.decisionEditor)
    ? nodeData.details.decisionEditor
    : undefined;
  useEffect(() => {
    if (!editingDecisionOptionId) return;
    const closeOnOutsidePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && decisionEditorRef.current?.contains(target)) return;
      setEditingDecisionOptionId(undefined);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setEditingDecisionOptionId(undefined);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [editingDecisionOptionId]);
  const draftLocale = quickEditor?.activeLocale ?? quickEditor?.primaryLocale ?? "und";
  const draftExternalText = quickEditor?.values[draftLocale] ?? "";
  const directorNote = quickEditor?.directorNote ?? "";
  const sceneImage = quickEditor?.sceneImage;
  const imageAssets = quickEditor?.imageAssets ?? [];
  const directorNoteOpen = quickEditor?.directorNoteOpen ?? false;
  const sceneImagesOpen = quickEditor?.sceneImageOpen ?? false;
  const setAuxiliaryPanelOpen = (panel: "directorNote" | "sceneImage", open: boolean) =>
    quickEditor?.onAuxiliaryPanelChange?.(panel, open);
  const beatContentRef = useRef<HTMLDivElement>(null);
  const counterEditorRef = useRef<HTMLDivElement>(null);
  const [counterEditorOpen, setCounterEditorOpen] = useState(false);
  const beatCounterTarget = quickEditor?.textCounter?.target;
  const beatCounterUnit = quickEditor?.textCounter?.unit;
  // Size the dialogue text against the counter maximum (worst-case filler) so
  // the baseline stays stable no matter how much has been typed. The font only
  // shrinks below that baseline once the actual content exceeds the maximum. If
  // even the minimum size cannot contain the content, fall back to internal
  // scrolling (the counter remains the only overflow cue).
  const fitBeatText = useCallback(() => {
    const element = beatContentRef.current;
    if (!element || element.clientHeight <= 0) return;
    const baselineFont = beatCounterTarget && beatCounterTarget > 0
      ? measureBeatFontFit(element, buildBeatFillerString(beatCounterTarget, beatCounterUnit ?? "characters"))
      : BEAT_FONT_MAX_PX;
    const actualText = element.textContent ?? "";
    const contentFont = actualText.trim()
      ? measureBeatFontFit(element, actualText)
      : BEAT_FONT_MAX_PX;
    const size = Math.max(
      BEAT_FONT_MIN_PX,
      Math.min(baselineFont, contentFont),
    );
    element.style.fontSize = `${size}px`;
    element.style.overflowY =
      element.scrollHeight > element.clientHeight ? "auto" : "hidden";
  }, [beatCounterTarget, beatCounterUnit]);
  useEffect(() => {
    const element = beatContentRef.current;
    if (!element) return;
    if (document.activeElement !== element && element.textContent !== draftExternalText) {
      element.textContent = draftExternalText;
    }
    fitBeatText();
  }, [draftExternalText, draftLocale, fitBeatText]);
  useLayoutEffect(() => {
    const element = beatContentRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => fitBeatText());
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitBeatText]);
  useEffect(() => {
    if (!counterEditorOpen) return;
    const closeOnOutsidePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && counterEditorRef.current?.contains(target)) return;
      setCounterEditorOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setCounterEditorOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [counterEditorOpen]);
  useEffect(() => {
    if (!connectorMenuOpen) return;
    const closeOnOutsidePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && connectorRef.current?.contains(target)) return;
      setConnectorMenuOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setConnectorMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [connectorMenuOpen]);
  const isEvent = nodeData.kind === "event";
  const showEventOverview = isEvent && nodeData.details?.showEventOverview === true;
  const eventDetails = showEventOverview
    ? nodeData.details?.event as { description?: string; type?: string } | undefined
    : undefined;
  const eventEditor = isEventQuickEditor(nodeData.details?.eventEditor)
    ? nodeData.details.eventEditor
    : undefined;
  const eventCoverImage = showEventOverview
    ? eventEditor?.coverImage ?? nodeData.details?.coverImage as EventCoverImage | undefined
    : undefined;
  const eventDescription = eventEditor?.description ?? eventDetails?.description ?? "";
  const eventDescriptionVisible = eventEditor?.descriptionOpen ?? false;
  const eventCoverToolsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!eventEditor?.coverImageOpen) return;
    const closeOnOutsidePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && eventCoverToolsRef.current?.contains(target)) return;
      eventEditor.onAuxiliaryPanelChange("coverImage", false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
  }, [eventEditor]);
  const eventTypeBadgeCandidate = showEventOverview && eventDetails?.type && eventDetails.type !== "normal"
    ? nodeData.badges.find((badge) => !/^\d+ decisions?$/.test(badge))
    : undefined;
  const eventTypeBadge = eventTypeBadgeCandidate && nodeData.details?.terminal !== true
    ? eventTypeBadgeCandidate
    : undefined;
  const eventBranchTag = showEventOverview
    ? nodeData.subtitle?.replace(/^Branch\s*·\s*/, "").trim()
    : undefined;
  const isFinalEvent = nodeData.kind === "event" && (nodeData.details?.terminal === true || nodeData.badges.includes("terminal"));
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
  const infoBadges = Array.isArray(nodeData.infoBadges) ? nodeData.infoBadges : [];
  const logicSummary = nodeData.logicSummary;
  const openLogicPart = typeof nodeData.onOpenLogicPart === "function"
    ? nodeData.onOpenLogicPart as (part: "conditions" | "consequences") => void
    : undefined;
  const logicBands = logicSummary ? <LogicBands
    when={logicSummary.when}
    then={logicSummary.then}
    whenItems={logicSummary.whenItems}
    thenItems={logicSummary.thenItems}
    warningCount={logicSummary.warningCount}
    expanded={selected}
    onOpenWhen={() => openLogicPart?.("conditions")}
    onOpenThen={() => openLogicPart?.("consequences")}
  /> : null;
  const eventOtherBadges = detailBadges.filter((badge) =>
    badge !== eventTypeBadge && badge !== eventTypeBadgeCandidate,
  );
  const colorStyle = {
    "--node-accent": typeof nodeData.accentColor === "string" ? nodeData.accentColor : undefined,
    "--node-branch": typeof nodeData.branchColor === "string" ? nodeData.branchColor : undefined,
    "--node-type": typeof nodeData.details?.typeColor === "string" ? nodeData.details.typeColor : undefined,
  } as CSSProperties;

  if (nodeData.kind === "routeGate") {
    const split = nodeData.details?.junctionPresentation === "split";
    return <div
      className={`story-node route-junction ${split ? "split" : "gate"}${selected ? " selected" : ""}`}
      aria-label={split ? `Branch point · ${nodeData.subtitle ?? "multiple routes"}` : `Logic Gate · ${nodeData.subtitle ?? "multiple routes"}`}
      style={colorStyle}
    >
      <Handle type="target" position={Position.Left} />
      {split ? <span className="route-junction-dot" aria-hidden="true" /> : <>
        <div className="route-gate-kicker"><GitBranch size={11} /> LOGIC GATE</div>
        <div className="node-title">{nodeData.subtitle}</div>
        <div className="route-gate-order">First valid route wins</div>
      </>}
      <Handle type="source" position={Position.Right} />
    </div>;
  }

  if (nodeData.isContainer) {
    return (
      <div className={`story-node branch-container${focusClass}${inspectorFocusClass} ${selected ? "selected" : ""}`} style={colorStyle}>
        {canReceive ? <Handle type="target" position={Position.Left} /> : null}
        <div className="node-title">{nodeData.title}</div>
        {nodeData.subtitle ? <div className="node-subtitle">{nodeData.subtitle}</div> : null}
        {logicBands}
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
          <NodeToolbar nodeId={id} isVisible={selected} position={Position.Bottom} offset={14}>
            <div className="canvas-node-toolbar node-boundary-actions nodrag nopan">
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
          </NodeToolbar>
        ) : null}
        {canSource ? <Handle type="source" position={Position.Right} /> : null}
      </div>
    );
  }

  if (nodeData.kind === "decision") {
    const decision = nodeData.details?.decision as { optionStyle?: string } | undefined;
    const optionStyle = decisionEditor?.optionStyle ?? (decision?.optionStyle === "iconOnly" ? "iconOnly" : "visibleText");
    const options = Array.isArray(nodeData.details?.options)
      ? nodeData.details.options.filter(isDecisionOption)
      : [];

    return (
      <div
        ref={decisionEditorRef}
        className={`story-node decision decision-container${focusClass}${inspectorFocusClass}${selected ? " selected" : ""}`}
        style={colorStyle}
      >
        <Handle type="target" position={Position.Left} />
        {decisionEditor ? (
          <div className="decision-style-toggle nodrag nopan" role="group" aria-label="Decision option display">
              <button
                type="button"
                className={optionStyle === "iconOnly" ? "active" : ""}
                aria-pressed={optionStyle === "iconOnly"}
                onPointerDown={stopCanvasInteraction}
                onClick={(event) => {
                  stopCanvasInteraction(event);
                  decisionEditor.onOptionStyleUpdate("iconOnly");
                }}
              >
                ICON
              </button>
              <button
                type="button"
                className={optionStyle === "visibleText" ? "active" : ""}
                aria-pressed={optionStyle === "visibleText"}
                onPointerDown={stopCanvasInteraction}
                onClick={(event) => {
                  stopCanvasInteraction(event);
                  decisionEditor.onOptionStyleUpdate("visibleText");
                }}
              >
                TEXT
              </button>
          </div>
        ) : (
          <span className="decision-style">{optionStyle === "iconOnly" ? "ICON" : "TEXT"}</span>
        )}
        {nodeData.subtitle ? <div className="node-subtitle">{nodeData.subtitle}</div> : null}
        <div className="decision-options">
          {options.map((option, index) => {
            const optionLetter = String.fromCharCode(65 + index);
            return (
              <div className={`decision-option${optionStyle === "iconOnly" ? " icon-mode" : ""}`} key={option.id}>
                {decisionEditor ? (
                  <button
                    type="button"
                    className="decision-option-delete nodrag nopan"
                    aria-label={`Delete option ${optionLetter}`}
                    title={`Delete option ${optionLetter}`}
                    onPointerDown={stopCanvasInteraction}
                    onClick={(event) => {
                      stopCanvasInteraction(event);
                      decisionEditor.onDeleteOutcome(option.id);
                    }}
                  >
                    <Trash2 size={11} aria-hidden="true" />
                  </button>
                ) : null}
                {optionStyle === "iconOnly" ? (
                  <span className="decision-option-icon">{optionLetter}</span>
                ) : (
                  <>
                    <span className="decision-option-key">{optionLetter}</span>
                    {decisionEditor ? (
                      <button
                        type="button"
                        className={`decision-option-edit-trigger nodrag nopan${(option.visibleText ?? option.name) ? "" : " empty"}`}
                        title={(option.visibleText ?? option.name) || "Texto escrito..."}
                        aria-label={`Edit visible text for option ${optionLetter}`}
                        onPointerDown={stopCanvasInteraction}
                        onClick={(event) => {
                          stopCanvasInteraction(event);
                          setEditingDecisionOptionId(option.id);
                        }}
                      >
                        <span>{(option.visibleText ?? option.name) || "Texto escrito..."}</span>
                      </button>
                    ) : (
                      <span className="decision-option-label">{option.visibleText ?? option.name}</span>
                    )}
                  </>
                )}
                {decisionEditor && editingDecisionOptionId === option.id ? (
                  <div className="decision-option-editor-popover nodrag nopan">
                    <div className="decision-option-editor-header">
                      <strong>Option {optionLetter}</strong>
                      <button
                        type="button"
                        aria-label="Close option editor"
                        title="Close"
                        onPointerDown={stopCanvasInteraction}
                        onClick={(event) => {
                          stopCanvasInteraction(event);
                          setEditingDecisionOptionId(undefined);
                        }}
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    </div>
                    <textarea
                      className="decision-option-input nodrag nopan"
                      rows={3}
                      autoFocus
                      value={option.visibleText ?? option.name}
                      placeholder="Texto escrito..."
                      aria-label={`Visible text for option ${optionLetter}`}
                      onPointerDown={stopCanvasInteraction}
                      onClick={stopCanvasInteraction}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Escape") setEditingDecisionOptionId(undefined);
                      }}
                      onChange={(event) => decisionEditor.onOutcomeUpdate(option.id, { visibleText: event.target.value })}
                    />
                  </div>
                ) : null}
                <Handle id={option.handleId} type="source" position={Position.Right} />
              </div>
            );
          })}
          {options.length === 0 ? <span className="decision-empty">Add an outcome to create an option.</span> : null}
          {decisionEditor ? (
            <button
              type="button"
              className="decision-add-option nodrag nopan"
              onPointerDown={stopCanvasInteraction}
              onClick={(event) => {
                stopCanvasInteraction(event);
                decisionEditor.onCreateOutcome();
              }}
            >
              + Add option
            </button>
          ) : null}
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
    const selectedLocale = quickEditor?.activeLocale ?? primaryLocale;
    const speakerRef = quickEditor?.characterRef ?? block?.speakerRef;
    const speakerOptions = quickEditor?.speakerOptions ?? [];
    const selectedSpeaker = speakerOptions.find((speaker) => speaker.id === speakerRef);
    const selectedVariantId = selectedSpeaker?.variants.some(
      (variant) => variant.id === quickEditor?.characterVariantId,
    )
      ? quickEditor?.characterVariantId
      : "base";
    const selectedVariant = selectedSpeaker?.variants.find(
      (variant) => variant.id === selectedVariantId,
    );
    const speakerPortraitUrl = selectedVariant?.portraitUrl ?? selectedSpeaker?.portraitUrl;
    const speakerDisplayName = speakerLabel(speakerRef, selectedSpeaker?.label);
    const isSpeech = nodeData.kind === "speechBeat";
    const textCounter = isSpeech ? quickEditor?.textCounter : undefined;
    const portraitFallback = !speakerRef
      ? <BookOpen size={25} aria-hidden="true" />
      : speakerRef === UNKNOWN_SPEAKER_REF
        ? <CircleHelp size={25} aria-hidden="true" />
        : <UserRound size={25} aria-hidden="true" />;
    return (
      <div
        className={`story-node speech-beat-node inline-editor${focusClass}${inspectorFocusClass}${selected ? " selected" : ""}`}
        style={colorStyle}
      >
        {canReceive ? <Handle type="target" position={Position.Left} /> : null}
        {isSpeech && quickEditor?.onDirectorNoteUpdate ? (
          <div className={`speech-beat-director-tools nodrag nopan${directorNoteOpen ? " open" : ""}`}>
            <span className="speech-beat-director-pocket" aria-hidden="true" />
            <button
              type="button"
              className={`speech-beat-director-toggle${directorNote.trim() ? " has-note" : ""}`}
              aria-label={directorNote.trim() ? "Edit director note" : "Add director note"}
              aria-expanded={directorNoteOpen}
              title={directorNote.trim() ? "Edit director note" : "Add director note"}
              onPointerDown={stopCanvasInteraction}
              onClick={(event) => {
                stopCanvasInteraction(event);
                setAuxiliaryPanelOpen("directorNote", !directorNoteOpen);
              }}
            >
              {directorNote.trim() ? "✎" : "+"}
            </button>
            {directorNoteOpen ? (
              <div className="speech-beat-director-panel">
                <div className="speech-beat-director-panel-header">
                  <label htmlFor={`${id}-director-note`}>Director note</label>
                </div>
                <textarea
                  id={`${id}-director-note`}
                  className="nodrag nopan"
                  rows={3}
                  value={directorNote}
                  placeholder="Add a note for direction, mood, timing…"
                  onPointerDown={stopCanvasInteraction}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Escape") setAuxiliaryPanelOpen("directorNote", false);
                  }}
                  onChange={(event) => quickEditor.onDirectorNoteUpdate?.(event.target.value)}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        <div className={`speech-beat-inline${isSpeech ? "" : " direction"}`}>
          {isSpeech ? <div className="speech-beat-character">
            <div className="speech-beat-drag-surface" title="Drag to move">
              {speakerPortraitUrl ? <img className="speech-beat-avatar" src={speakerPortraitUrl} alt="" /> : <span className="speech-beat-avatar-fallback">{portraitFallback}</span>}
            </div>
            <div className="speech-beat-menu-anchor nodrag nopan" onPointerDown={stopCanvasInteraction}>
              <SpeakerSelector
                value={speakerRef}
                options={speakerOptions}
                presentEntityIds={quickEditor?.presentEntityIds ?? []}
                onChange={(characterId) => {
                  quickEditor?.onCharacterUpdate(characterId);
                }}
                onClose={() => setOpenBeatMenu(false)}
                onCanvasInteraction={stopCanvasInteraction}
              />
            </div>
            {selectedSpeaker && selectedSpeaker.variants.length > 1 ? (
              <label className="speech-beat-variant nodrag nopan">
                <select
                  value={selectedVariantId}
                  onPointerDown={stopCanvasInteraction}
                  onChange={(event) => quickEditor?.onCharacterVariantUpdate?.(event.target.value)}
                >
                  {selectedSpeaker.variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div> : null}
          <div
            className={`speech-beat-dialogue nodrag nopan${textCounter ? " has-counter" : ""}`}
            onPointerDown={stopCanvasInteraction}
            onClick={stopCanvasInteraction}
            onDoubleClick={stopCanvasInteraction}
          >
            <div
              ref={beatContentRef}
              className="speech-beat-content"
              role="textbox"
              aria-label={isSpeech ? "Dialogue text" : "Stage direction text"}
              aria-multiline="true"
              contentEditable
              suppressContentEditableWarning
              data-placeholder={isSpeech ? "Write dialogue…" : "Write stage direction…"}
              onFocus={() => setOpenBeatMenu(false)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Escape") {
                  event.currentTarget.blur();
                  setOpenBeatMenu(false);
                }
              }}
              onInput={(event) => {
                stopCanvasInteraction(event);
                const nextText = event.currentTarget.textContent ?? "";
                quickEditor?.onTextUpdate(selectedLocale, nextText);
                fitBeatText();
              }}
            />
            {textCounter ? (
              <div
                ref={counterEditorRef}
                className={`speech-beat-counter-tools nodrag nopan${counterEditorOpen ? " open" : ""}`}
              >
                <output
                  className={`speech-beat-text-counter${textCounter.count > textCounter.target ? " over" : ""}`}
                  title="Right-click to edit the maximum for this universe"
                  onPointerDown={stopCanvasInteraction}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    stopCanvasInteraction(event);
                    if (quickEditor?.onCounterPreferenceUpdate) setCounterEditorOpen((open) => !open);
                  }}
                >
                  {textCounter.count} / {textCounter.target} {textCounter.unit === "words" ? "words" : "characters"}
                </output>
                {counterEditorOpen && quickEditor?.onCounterPreferenceUpdate ? (
                  <div
                    className="speech-beat-counter-popover"
                    onPointerDown={stopCanvasInteraction}
                    onClick={stopCanvasInteraction}
                  >
                    <div className="speech-beat-counter-popover-header">
                      <strong>Speech beat maximum</strong>
                      <button
                        type="button"
                        aria-label="Close counter editor"
                        title="Close"
                        onPointerDown={stopCanvasInteraction}
                        onClick={(event) => {
                          stopCanvasInteraction(event);
                          setCounterEditorOpen(false);
                        }}
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    </div>
                    <label className="speech-beat-counter-field">
                      <span>Measure</span>
                      <select
                        value={quickEditor.counterPreference?.unit ?? textCounter.unit}
                        onPointerDown={stopCanvasInteraction}
                        onChange={(event) =>
                          quickEditor.onCounterPreferenceUpdate?.({
                            unit: event.target.value as "words" | "characters",
                          })
                        }
                      >
                        <option value="characters">Characters</option>
                        <option value="words">Words</option>
                      </select>
                    </label>
                    <label className="speech-beat-counter-field">
                      <span>Maximum</span>
                      <input
                        type="number"
                        min={1}
                        max={2000}
                        step={1}
                        value={quickEditor.counterPreference?.target ?? textCounter.target}
                        onPointerDown={stopCanvasInteraction}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === "Escape") setCounterEditorOpen(false);
                        }}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          if (Number.isFinite(next) && next > 0) {
                            quickEditor.onCounterPreferenceUpdate?.({ target: next });
                          }
                        }}
                      />
                    </label>
                    <p className="speech-beat-counter-note">
                      {quickEditor.counterPreference?.eventOverride
                        ? "This event overrides the universe maximum; edit the event to change it."
                        : "Saved with the universe and shared by every speech beat."}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {isSpeech && quickEditor?.onImportSceneImage ? (
          <div className={`speech-beat-scene-image-tools nodrag nopan${sceneImagesOpen ? " open" : ""}`}>
            <span className="speech-beat-scene-image-pocket" aria-hidden="true" />
            <button
              type="button"
              className={`speech-beat-scene-image-toggle${sceneImage ? " has-images" : ""}`}
              aria-label={sceneImage ? "Edit scene image" : "Add scene image"}
              aria-expanded={sceneImagesOpen}
              title={sceneImage ? "Edit scene image" : "Add scene image"}
              onPointerDown={stopCanvasInteraction}
              onClick={(event) => {
                stopCanvasInteraction(event);
                setAuxiliaryPanelOpen("sceneImage", !sceneImagesOpen);
              }}
            >
              <ImagePlus size={14} aria-hidden="true" />
            </button>
            <div className="speech-beat-scene-image-panel">
              <div className="speech-beat-scene-image-panel-header">
                <span>Scene image</span>
              </div>
              {sceneImage ? (
                <article className="speech-beat-scene-image-preview">
                  {sceneImage.url ? <img src={sceneImage.url} alt={sceneImage.name} /> : <span className="speech-beat-scene-image-placeholder"><ImagePlus size={22} /></span>}
                  <button
                    type="button"
                    className="danger"
                    aria-label={`Remove ${sceneImage.name}`}
                    title="Remove scene image"
                    onPointerDown={stopCanvasInteraction}
                    onClick={(event) => {
                      stopCanvasInteraction(event);
                      quickEditor.onSceneImageUpdate?.();
                    }}
                  ><Trash2 size={13} /></button>
                </article>
              ) : (
                <>
                  <label className="speech-beat-scene-image-select">
                    <span>Use an existing image</span>
                    <select
                      value=""
                      onPointerDown={stopCanvasInteraction}
                      onChange={(event) => quickEditor.onSceneImageUpdate?.(event.target.value || undefined)}
                    >
                      <option value="">Choose an image…</option>
                      {imageAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="speech-beat-scene-image-empty"
                    onPointerDown={stopCanvasInteraction}
                    onClick={(event) => {
                      stopCanvasInteraction(event);
                      quickEditor.onImportSceneImage?.();
                    }}
                  ><ImagePlus size={16} /> Upload a PNG or JPEG image</button>
                </>
              )}
            </div>
          </div>
        ) : null}
        {isSpeech && canSource && quickEditor?.beatConnector ? (
          <div
            ref={connectorRef}
            className={`speech-beat-connector nodrag nopan${connectorMenuOpen ? " open" : ""}`}
          >
            <button
              type="button"
              className="speech-beat-connector-toggle"
              aria-label="Add connected node"
              aria-expanded={connectorMenuOpen}
              title="Add connected node"
              onPointerDown={stopCanvasInteraction}
              onClick={(event) => {
                stopCanvasInteraction(event);
                setConnectorMenuOpen((open) => !open);
              }}
            >
              <Plus size={14} aria-hidden="true" />
            </button>
            <div className="speech-beat-connector-menu">
              <button
                type="button"
                onPointerDown={stopCanvasInteraction}
                onClick={(event) => {
                  stopCanvasInteraction(event);
                  quickEditor.beatConnector?.onConnect("speechBeat");
                  setConnectorMenuOpen(false);
                }}
              >
                <MessageSquare size={13} aria-hidden="true" /> Dialogue
              </button>
              <button
                type="button"
                onPointerDown={stopCanvasInteraction}
                onClick={(event) => {
                  stopCanvasInteraction(event);
                  quickEditor.beatConnector?.onConnect("decision");
                  setConnectorMenuOpen(false);
                }}
              >
                <Split size={13} aria-hidden="true" /> Decision
              </button>
              <button
                type="button"
                onPointerDown={stopCanvasInteraction}
                onClick={(event) => {
                  stopCanvasInteraction(event);
                  quickEditor.beatConnector?.onConnect("directionBeat");
                  setConnectorMenuOpen(false);
                }}
              >
                <Clapperboard size={13} aria-hidden="true" /> Director Direction
              </button>
              {quickEditor.beatConnector.onInsertConditions ? (
                <button
                  type="button"
                  onPointerDown={stopCanvasInteraction}
                  onClick={(event) => {
                    stopCanvasInteraction(event);
                    quickEditor.beatConnector?.onInsertConditions?.();
                    setConnectorMenuOpen(false);
                  }}
                >
                  <GitBranch size={13} aria-hidden="true" /> Conditions
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {logicBands}
        {canSource ? <Handle type="source" position={Position.Right} /> : null}
      </div>
    );
  }

  if (showEventOverview) {
    return (
      <div
        className={`story-node event event-overview${eventCoverImage ? " has-cover" : ""}${eventDescriptionVisible ? " has-description" : ""}${isFinalEvent ? " terminal" : ""}${focusClass}${inspectorFocusClass}${selected ? " selected" : ""}`}
        style={colorStyle}
      >
        {canReceive ? <Handle type="target" position={Position.Left} /> : null}
        {eventEditor ? (
          <div ref={eventCoverToolsRef} className={`speech-beat-director-tools event-cover-tools nodrag nopan${eventEditor.coverImageOpen ? " open" : ""}`}>
            <span className="speech-beat-director-pocket" aria-hidden="true" />
            <button
              type="button"
              className={`speech-beat-director-toggle${eventCoverImage ? " has-note" : ""}`}
              aria-label={eventCoverImage ? "Edit event cover image" : "Add event cover image"}
              aria-expanded={eventEditor.coverImageOpen}
              title={eventCoverImage ? "Edit event cover image" : "Add event cover image"}
              onPointerDown={stopCanvasInteraction}
              onClick={(event) => {
                stopCanvasInteraction(event);
                if (eventCoverImage) {
                  eventEditor.onCoverImageUpdate(undefined);
                } else {
                  eventEditor.onAuxiliaryPanelChange("coverImage", !eventEditor.coverImageOpen);
                }
              }}
            >
              {eventCoverImage ? <X size={12} aria-hidden="true" /> : <ImagePlus size={13} aria-hidden="true" />}
            </button>
            {eventEditor.coverImageOpen ? (
              <div className="speech-beat-director-panel event-cover-panel">
                <label htmlFor={`${id}-event-cover`}>Cover image</label>
                <select
                  id={`${id}-event-cover`}
                  value={eventCoverImage?.assetId ?? ""}
                  onPointerDown={stopCanvasInteraction}
                  onChange={(event) => eventEditor.onCoverImageUpdate(event.target.value || undefined)}
                >
                  <option value="">Choose an image…</option>
                  {eventEditor.imageAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>{asset.name}</option>
                  ))}
                </select>
                {eventEditor.onImportCoverImage ? (
                  <button
                    type="button"
                    className="event-cover-upload nodrag nopan"
                    onPointerDown={stopCanvasInteraction}
                    onClick={(event) => {
                      stopCanvasInteraction(event);
                      eventEditor.onImportCoverImage?.();
                    }}
                  >
                    <ImagePlus size={14} aria-hidden="true" /> Upload a PNG or JPEG image
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {eventCoverImage ? (
          <div className="event-cover-image">
            {eventCoverImage.url ? (
              <img src={eventCoverImage.url} alt={eventCoverImage.name} />
            ) : (
              <ImagePlus size={22} aria-hidden="true" />
            )}
          </div>
        ) : null}
        <div className="node-title">{nodeData.title}</div>
        {eventTypeBadge ? (
          <div className="node-badges event-type-tag">
            <span>{badgeText(eventTypeBadge)}</span>
          </div>
        ) : null}
        {eventBranchTag ? (
          <div className="event-branch-tag" title={eventBranchTag}>
            <GitBranch size={13} aria-hidden="true" />
            <span>{eventBranchTag}</span>
          </div>
        ) : null}
        {eventOtherBadges.length > 0 ? (
          <div className="node-summary-badges">
            {eventOtherBadges.slice(0, 4).map((badge) => (
              <span key={badge}>{badgeText(badge)}</span>
            ))}
          </div>
        ) : null}
        <CanvasInfoBadges badges={infoBadges} />
        {logicBands}
        {summaryBadges.length > 0 ? (
          <div className="node-badges">
            {summaryBadges.slice(0, 3).map((badge) => (
              <span key={badge}>{badgeText(badge)}</span>
            ))}
          </div>
        ) : null}
        {eventEditor && eventDescriptionVisible ? (
          <textarea
            className="event-description-editor nodrag nopan"
            aria-label="Event description"
            value={eventEditor.description}
            placeholder="Describe this event…"
            onPointerDown={stopCanvasInteraction}
            onClick={stopCanvasInteraction}
            onKeyDown={(event) => event.stopPropagation()}
            onChange={(event) => eventEditor.onDescriptionUpdate(event.target.value)}
          />
        ) : !eventEditor && eventDetails?.description ? (
          <div className="event-description" title={eventDetails.description}>{eventDetails.description}</div>
        ) : null}
        {eventEditor ? (
          <div className={`speech-beat-scene-image-tools event-description-tools nodrag nopan${eventEditor.descriptionOpen ? " open" : ""}`}>
            <span className="speech-beat-scene-image-pocket" aria-hidden="true" />
            <button
              type="button"
              className={`speech-beat-scene-image-toggle${eventDescription.trim() ? " has-images" : ""}`}
              aria-label={eventDescription.trim() ? (eventDescriptionVisible ? "Hide event description" : "Show event description") : "Add event description"}
              aria-expanded={eventEditor.descriptionOpen}
              title={eventDescription.trim() ? (eventDescriptionVisible ? "Hide event description" : "Show event description") : "Add event description"}
              onPointerDown={stopCanvasInteraction}
              onClick={(event) => {
                stopCanvasInteraction(event);
                eventEditor.onAuxiliaryPanelChange("description", !eventEditor.descriptionOpen);
              }}
            >
              {eventDescription.trim()
                ? eventDescriptionVisible
                  ? <ChevronDown size={13} aria-hidden="true" />
                  : <ChevronUp size={13} aria-hidden="true" />
                : <AlignLeft size={13} aria-hidden="true" />}
            </button>
          </div>
        ) : null}
        {canSource ? <Handle type="source" position={Position.Right} /> : null}
      </div>
    );
  }

  if (nodeData.kind === "dialogueStart") {
    const portraitUrl = typeof nodeData.details?.dialogueTriggerPortraitUrl === "string"
      ? nodeData.details.dialogueTriggerPortraitUrl
      : undefined;
    const dialogueTriggerEditor = nodeData.details?.dialogueTriggerEditor;
    const hasEditor = isDialogueTriggerEditor(dialogueTriggerEditor);
    return (
      <div
        className={`story-node dialogueStart dialogue-trigger-node${focusClass}${inspectorFocusClass}${selected ? " selected" : ""}`}
        style={colorStyle}
      >
        <div className="dialogue-trigger-portrait">
          {portraitUrl ? (
            <img src={portraitUrl} alt="" />
          ) : (
            <UserRound size={19} aria-hidden="true" />
          )}
        </div>
        <div className="dialogue-trigger-copy">
          {hasEditor ? (
            <>
              <div className="dialogue-trigger-heading">Trigger</div>
              <div className="speech-beat-menu-anchor nodrag nopan" onPointerDown={stopCanvasInteraction}>
                <SpeakerSelector
                  value={dialogueTriggerEditor.selectedCharacterId}
                  options={dialogueTriggerEditor.speakerOptions}
                  presentEntityIds={dialogueTriggerEditor.presentEntityIds}
                  onChange={(characterId) => {
                    dialogueTriggerEditor.onCharacterChange(characterId);
                  }}
                  onClose={() => {}}
                  onCanvasInteraction={stopCanvasInteraction}
                />
              </div>
              <select
                className="dialogue-trigger-property nodrag nopan"
                value={dialogueTriggerEditor.selectedActionId ?? ""}
                disabled={!dialogueTriggerEditor.selectedCharacterId}
                onPointerDown={stopCanvasInteraction}
                onChange={(event) => {
                  stopCanvasInteraction(event);
                  dialogueTriggerEditor.onActionChange(event.target.value || undefined);
                }}
              >
                <option value="">Choose action…</option>
                {dialogueTriggerEditor.triggerActions.map((action) => (
                  <option key={action.id} value={action.id}>
                    {action.label}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <div className="node-title">{nodeData.title}</div>
          )}
        </div>
        {logicBands}
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
      <CanvasInfoBadges badges={infoBadges} />
      {logicBands}
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
