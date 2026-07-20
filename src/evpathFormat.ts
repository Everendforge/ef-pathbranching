import type {
  BranchingProject,
  Condition,
  ConditionInput,
  Consequence,
  DialogueBeat,
  DialogueNode,
  EventNode,
  Outcome,
  ScriptBlock,
  Transition,
} from "./domain.js";
import { asConditionExpressions, conditionLabel, consequenceLabel, isConditionSet } from "./logic.js";
import { UNDETERMINED_LOCALE, blockValues, localizedValue, updateLocalizedEntry } from "./localization.js";
import { UNKNOWN_SPEAKER_REF, speakerLabel } from "./speakerRoles.js";
import { BASE_VARIANT_ID, canonVariantsForRef } from "./worldnotionVariants.js";
import {
  createDecision,
  createDialogue,
  createDialogueBeat,
  createEventDialogueBeat,
  createInternalTransition,
  createOutcome,
  deleteDecision,
  deleteEventDialogueBeat,
  deleteDialogueBeat,
  deleteOutcome,
  deleteTransition,
  findEvent,
  updateDecision,
  updateDialogue,
  updateDialogueBeat,
  updateEvent,
  updateEventDialogueBeat,
  updateOutcome,
  updateScriptBlock,
  updateTransition,
} from "./projectMutations.js";

/**
 * Evpath (`.evpath`) is the Ink-inspired text projection of a PathBranching
 * event. The BranchingProject document model remains the source of truth;
 * this module serializes an event into text, parses edited text, and applies
 * the differences back onto the project without losing translations, logic,
 * or asset attachments thanks to per-line `#^id` anchors.
 */

export const EVPATH_EXTENSION = ".evpath";
export const EVPATH_INDENT = "    ";

export type EvpathParseError = { line: number; message: string };

export type EvpathApplyResult = {
  project: BranchingProject;
  errors: EvpathParseError[];
  warnings: string[];
  changed: boolean;
  message?: string;
};

// ---------------------------------------------------------------------------
// Shared text helpers
// ---------------------------------------------------------------------------

const LEADING_MARKERS = ["*", "?", "=", "-", "[", "(", "~", "#", "\\"];
const SPEAKER_LIKE = /^[^:\n]{1,60}:\s/;

function escapeText(value: string): string {
  let text = value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/#\^/g, "\\#^");
  if (text.length && (LEADING_MARKERS.includes(text[0]) || SPEAKER_LIKE.test(text))) {
    text = `\\${text}`;
  }
  return text;
}

function unescapeText(value: string): string {
  let text = value;
  if (text.startsWith("\\") && text.length > 1) {
    text = text.slice(1);
  }
  return text
    .replace(/\\#\^/g, "#^")
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\");
}

function beatNodeId(eventId: string, beatId: string) {
  return `beat:${eventId}:${beatId}`;
}

function dialogueNodeId(eventId: string, dialogueId: string) {
  return `dialogue:${eventId}:${dialogueId}`;
}

function decisionNodeId(eventId: string, decisionId: string) {
  return `decision:${eventId}:${decisionId}`;
}

function outcomeNodeId(eventId: string, decisionId: string, outcomeId: string) {
  return `outcome:${eventId}:${decisionId}:${outcomeId}`;
}

function primaryLocaleOf(project: BranchingProject): string {
  return project.localizationCatalog?.primaryLocale ?? UNDETERMINED_LOCALE;
}

function findBlock(
  project: BranchingProject,
  beat: DialogueBeat,
): { scriptId: string; block: ScriptBlock } | undefined {
  const document = (project.scriptDocuments ?? []).find((item) => item.id === beat.blockRef.scriptId);
  const block = document?.blocks.find((item) => item.id === beat.blockRef.blockId);
  return document && block ? { scriptId: document.id, block } : undefined;
}

function beatText(project: BranchingProject, beat: DialogueBeat): string {
  const found = findBlock(project, beat);
  if (!found) return "";
  const primary = primaryLocaleOf(project);
  return localizedValue(blockValues(project, found.scriptId, found.block, primary), primary, primary);
}

function speakerDisplay(project: BranchingProject, characterRef: string | undefined): string | undefined {
  if (!characterRef) return undefined;
  if (characterRef === UNKNOWN_SPEAKER_REF) return "???";
  const canon = project.canonRefs.find((ref) => ref.id === characterRef);
  return speakerLabel(characterRef, canon?.label);
}

function variantDisplay(
  project: BranchingProject,
  characterRef: string | undefined,
  variantId: string | undefined,
): string | undefined {
  if (!characterRef || !variantId || variantId === BASE_VARIANT_ID) return undefined;
  const canon = project.canonRefs.find((ref) => ref.id === characterRef);
  if (!canon) return undefined;
  return canonVariantsForRef(canon).find((variant) => variant.id === variantId)?.label ?? variantId;
}

// ---------------------------------------------------------------------------
// Condition / consequence text projection
// ---------------------------------------------------------------------------

function jsonScalar(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function simpleConditionText(condition: Condition): string | undefined {
  if (condition.type !== "variable") return undefined;
  return `{ ${condition.name} ${condition.operator} ${jsonScalar(condition.value)} }`;
}

/** Renders conditions in the parseable grammar or as opaque `{ # label }` markers. */
export function conditionInputText(input: ConditionInput | undefined): string {
  return asConditionExpressions(input)
    .map((expression) => {
      if (!isConditionSet(expression)) {
        return simpleConditionText(expression) ?? `{ # ${conditionLabel(expression)} }`;
      }
      return "{ # condition set }";
    })
    .join(" ");
}

function simpleConsequenceText(consequence: Consequence): string | undefined {
  if (consequence.type === "setVariable" && !consequence.conditions) {
    return `~ ${consequence.name} = ${jsonScalar(consequence.value)}`;
  }
  if (consequence.type === "unlockCanonEntry" && !consequence.conditions) {
    return `~ unlock ${consequence.ref}`;
  }
  return undefined;
}

export function consequenceTexts(consequences: Consequence[] | undefined): string[] {
  return (consequences ?? []).map(
    (consequence) => simpleConsequenceText(consequence) ?? `~ # ${consequenceLabel(consequence)}`,
  );
}

const CONDITION_PATTERN = /\{\s*([^{}\s]+)\s*(==|!=|>=|<=|>|<)\s*([^{}]*?)\s*\}/;

function parseScalar(raw: string): { ok: boolean; value?: unknown } {
  const text = raw.trim();
  if (!text.length) return { ok: false };
  if (text === "true") return { ok: true, value: true };
  if (text === "false") return { ok: true, value: false };
  if (/^-?\d+(\.\d+)?$/.test(text)) return { ok: true, value: Number(text) };
  if (/^".*"$/.test(text)) {
    try {
      return { ok: true, value: JSON.parse(text) as unknown };
    } catch {
      return { ok: false };
    }
  }
  return { ok: false };
}

/** Parses `{ name op value }` groups; returns undefined when any group is opaque. */
export function parseConditionText(text: string): ConditionInput | undefined | null {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const conditions: Condition[] = [];
  const groups = trimmed.match(/\{[^{}]*\}/g);
  if (!groups || groups.join(" ") !== trimmed.replace(/\}\s+\{/g, "} {")) return null;
  for (const group of groups) {
    const match = group.match(CONDITION_PATTERN);
    if (!match) return null;
    const [, name, operator, rawValue] = match;
    const scalar = parseScalar(rawValue);
    if (!scalar.ok) return null;
    conditions.push({
      type: "variable",
      name,
      operator: operator as "==" | "!=" | ">" | ">=" | "<" | "<=",
      value: scalar.value,
    });
  }
  if (!conditions.length) return undefined;
  return conditions.length === 1 ? conditions[0] : conditions;
}

/** Parses one `~ ...` line; null means opaque/unparseable. */
export function parseConsequenceText(text: string): Consequence | null {
  const body = text.replace(/^~\s*/, "").trim();
  if (body.startsWith("#")) return null;
  const unlock = body.match(/^unlock\s+(\S+)$/);
  if (unlock) return { type: "unlockCanonEntry", ref: unlock[1] };
  const assign = body.match(/^([^\s=]+)\s*=\s*(.+)$/);
  if (assign) {
    const scalar = parseScalar(assign[2]);
    if (scalar.ok) return { type: "setVariable", name: assign[1], value: scalar.value };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

type RegistryEntry = {
  kind: "beat" | "dialogue" | "decision" | "outcome" | "trigger" | "transition";
  /** Container anchor for beats: dialogue id or undefined for event-level. */
  container?: string;
  /** Rendered condition text at serialization time (for compare-and-keep). */
  condText?: string;
  consTexts?: string[];
  /** For transitions: endpoints as node ids. */
  from?: string;
  to?: string;
  /** Root provenance for chain roots. */
  rootSource?: "entry" | "boundary" | "orphan";
};

export type EvpathSerialization = {
  text: string;
  registry: Map<string, RegistryEntry>;
  /** Document-order anchors of rendered chain roots in the main scope. */
  mainRoots: string[];
};

type GraphNode =
  | { kind: "beat"; beat: DialogueBeat; container?: DialogueNode }
  | { kind: "dialogue"; dialogue: DialogueNode }
  | { kind: "decision"; decisionId: string };

function eventGraph(event: EventNode) {
  const nodes = new Map<string, GraphNode>();
  (event.dialogueBeats ?? []).forEach((beat) => {
    nodes.set(beatNodeId(event.id, beat.id), { kind: "beat", beat });
  });
  (event.dialogues ?? []).forEach((dialogue) => {
    nodes.set(dialogueNodeId(event.id, dialogue.id), { kind: "dialogue", dialogue });
    (dialogue.beats ?? []).forEach((beat) => {
      nodes.set(beatNodeId(event.id, beat.id), { kind: "beat", beat, container: dialogue });
    });
  });
  (event.decisions ?? []).forEach((decision) => {
    nodes.set(decisionNodeId(event.id, decision.id), { kind: "decision", decisionId: decision.id });
  });
  return nodes;
}

function outsFrom(event: EventNode, nodeId: string): Transition[] {
  return (event.transitions ?? [])
    .filter((transition) => transition.from === nodeId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function transitionPayloadFree(transition: Transition): boolean {
  return (
    !transition.label &&
    !transition.conditions &&
    !(transition.consequences?.length) &&
    (transition.mode ?? "conditional") === "conditional"
  );
}

export function serializeEventEvpathDetailed(
  project: BranchingProject,
  eventId: string,
): EvpathSerialization {
  const event = findEvent(project, eventId);
  const registry = new Map<string, RegistryEntry>();
  const mainRoots: string[] = [];
  if (!event) return { text: "", registry, mainRoots };

  const nodes = eventGraph(event);
  const visited = new Set<string>();
  const lines: string[] = [];
  const category = project.eventCategories?.find((item) => item.id === event.type);

  lines.push(`=== ${event.name || event.id} === #^${event.id}`);
  if (event.type !== "normal") {
    lines.push(`# category: ${category?.label ?? event.type}`);
  }
  lines.push("");

  const indentOf = (level: number) => EVPATH_INDENT.repeat(level);

  const divertTargetRef = (transition: Transition): string => {
    const target = transition.to;
    if (nodes.has(target)) {
      const bare = bareAnchorFor(target);
      return `^${bare}`;
    }
    const targetEvent = project.events.find((item) => item.id === target);
    if (targetEvent) return `"${targetEvent.name || targetEvent.id}"`;
    return target;
  };

  const bareAnchorFor = (nodeId: string): string => {
    const node = nodes.get(nodeId);
    if (!node) return nodeId;
    if (node.kind === "beat") return node.beat.id;
    if (node.kind === "dialogue") return node.dialogue.id;
    return node.decisionId;
  };

  const emitDivert = (transition: Transition, level: number) => {
    const cond = conditionInputText(transition.conditions);
    lines.push(
      `${indentOf(level)}-> ${divertTargetRef(transition)}${cond ? ` ${cond}` : ""} #^${transition.id}`,
    );
    registry.set(transition.id, {
      kind: "transition",
      from: transition.from,
      to: transition.to,
      condText: cond || undefined,
    });
  };

  const emitBeat = (node: Extract<GraphNode, { kind: "beat" }>, level: number) => {
    const { beat } = node;
    const text = escapeText(beatText(project, beat));
    if (beat.kind === "direction") {
      lines.push(`${indentOf(level)}[${text}] #^${beat.id}`);
    } else {
      const found = findBlock(project, beat);
      const characterRef = found?.block.characterRef ?? found?.block.speakerRef;
      const speaker = speakerDisplay(project, characterRef);
      const variant = variantDisplay(project, characterRef, found?.block.characterVariantId);
      const prefix = speaker ? `${speaker}${variant ? ` (${variant})` : ""}: ` : "";
      lines.push(`${indentOf(level)}${prefix}${text} #^${beat.id}`);
      if (beat.directorNote) {
        lines.push(`${indentOf(level + 1)}(${escapeText(beat.directorNote)})`);
      }
      if (beat.sceneImage) {
        const asset = (project.assets ?? []).find((item) => item.id === beat.sceneImage?.assetId);
        lines.push(`${indentOf(level + 1)}#img: ${asset?.name ?? beat.sceneImage.assetId}`);
      }
    }
    registry.set(beat.id, { kind: "beat", container: node.container?.id });
  };

  const renderChain = (startId: string, level: number, containerId?: string) => {
    let currentId: string | undefined = startId;
    while (currentId) {
      const node = nodes.get(currentId);
      if (!node) return;
      if (visited.has(currentId)) {
        lines.push(`${indentOf(level)}-> ^${bareAnchorFor(currentId)}`);
        return;
      }
      visited.add(currentId);

      if (node.kind === "dialogue") {
        lines.push(`${indentOf(level)}= dialogue: ${escapeText(node.dialogue.title || "Dialogue")} #^${node.dialogue.id}`);
        registry.set(node.dialogue.id, { kind: "dialogue" });
        const entryBeat = node.dialogue.entryBeatId ?? node.dialogue.beats?.[0]?.id;
        if (entryBeat) {
          renderChain(beatNodeId(event.id, entryBeat), level + 1, node.dialogue.id);
        }
        // Fall through: transitions leaving the Dialogue node continue the
        // outer chain at the header's level (implicit adjacency after dedent).
      }

      if (node.kind === "decision") {
        const decision = (event.decisions ?? []).find((item) => item.id === node.decisionId);
        if (!decision) return;
        lines.push(`${indentOf(level)}? ${escapeText(decision.name || "Decision")} #^${decision.id}`);
        registry.set(decision.id, { kind: "decision" });
        decision.outcomes.forEach((outcome) => {
          const cond = conditionInputText(outcome.availability);
          lines.push(
            `${indentOf(level)}* [${escapeText(outcome.visibleText || outcome.name)}]${cond ? ` ${cond}` : ""} #^${outcome.id}`,
          );
          const consTexts = consequenceTexts(outcome.consequences);
          consTexts.forEach((text) => lines.push(`${indentOf(level + 1)}${text}`));
          registry.set(outcome.id, {
            kind: "outcome",
            container: decision.id,
            condText: cond || undefined,
            consTexts,
          });
          const outs = outsFrom(event, outcomeNodeId(event.id, decision.id, outcome.id));
          if (outs.length === 1 && nodes.has(outs[0].to) && !visited.has(outs[0].to) && transitionPayloadFree(outs[0])) {
            registry.set(outs[0].id, { kind: "transition", from: outs[0].from, to: outs[0].to });
            renderChain(outs[0].to, level + 1, containerId);
          } else {
            outs.forEach((transition) => emitDivert(transition, level + 1));
          }
        });
        return;
      }

      if (node.kind === "beat") emitBeat(node, level);
      const outs = outsFrom(event, currentId);
      if (!outs.length) return;
      const [first] = outs;
      const stayInContainer =
        nodes.get(first.to)?.kind !== "beat" ||
        (nodes.get(first.to) as Extract<GraphNode, { kind: "beat" }>).container?.id === containerId;
      if (
        outs.length === 1 &&
        nodes.has(first.to) &&
        !visited.has(first.to) &&
        transitionPayloadFree(first) &&
        stayInContainer &&
        nodes.get(first.to)?.kind !== "dialogue"
      ) {
        registry.set(first.id, { kind: "transition", from: first.from, to: first.to });
        currentId = first.to;
        continue;
      }
      if (
        outs.length === 1 &&
        nodes.get(first.to)?.kind === "dialogue" &&
        !visited.has(first.to) &&
        transitionPayloadFree(first)
      ) {
        registry.set(first.id, { kind: "transition", from: first.from, to: first.to });
        lines.push("");
        renderChain(first.to, level, containerId);
        return;
      }
      outs.forEach((transition) => emitDivert(transition, level));
      return;
    }
  };

  // Main flow: transitions leaving the event node itself.
  const entryOuts = outsFrom(event, event.id);
  entryOuts.forEach((transition, index) => {
    if (nodes.has(transition.to) && !visited.has(transition.to) && transitionPayloadFree(transition)) {
      if (index > 0) lines.push("");
      registry.set(transition.id, { kind: "transition", from: transition.from, to: transition.to });
      const rootAnchor = bareAnchorFor(transition.to);
      mainRoots.push(rootAnchor);
      const entry = registry.get(rootAnchor);
      renderChain(transition.to, 0);
      const rendered = registry.get(rootAnchor) ?? entry;
      if (rendered) rendered.rootSource = "entry";
    } else {
      emitDivert(transition, 0);
    }
  });

  // Chains fed only by subcanvas In ports.
  const inputPrefix = `boundary:${event.id}:input:`;
  (event.transitions ?? [])
    .filter((transition) => transition.from.startsWith(inputPrefix))
    .forEach((transition) => {
      if (!nodes.has(transition.to) || visited.has(transition.to)) return;
      lines.push("");
      const rootAnchor = bareAnchorFor(transition.to);
      renderChain(transition.to, 0);
      const rendered = registry.get(rootAnchor);
      if (rendered) rendered.rootSource = "boundary";
    });

  // Dialogue trigger sections.
  (event.dialogueStarts ?? []).forEach((start) => {
    const sourceId = `dialogue-start:${event.id}:${start.id}`;
    const canon = start.source?.kind === "canonRef"
      ? project.canonRefs.find((ref) => ref.id === start.source?.id)
      : undefined;
    const label = canon
      ? `${canon.label ?? canon.id}${start.source?.propertyId ? ` · ${start.source.propertyId}` : ""}`
      : "configure source";
    lines.push("");
    lines.push(`= trigger: ${escapeText(label)} #^${start.id}`);
    registry.set(start.id, { kind: "trigger" });
    outsFrom(event, sourceId).forEach((transition) => {
      if (nodes.has(transition.to) && !visited.has(transition.to) && transitionPayloadFree(transition)) {
        registry.set(transition.id, { kind: "transition", from: transition.from, to: transition.to });
        renderChain(transition.to, 1);
      } else {
        emitDivert(transition, 1);
      }
    });
  });

  // Content unreachable from any rendered root.
  const leftovers = Array.from(nodes.keys()).filter((nodeId) => !visited.has(nodeId));
  const leftoverTargets = new Set(
    (event.transitions ?? [])
      .filter((transition) => leftovers.includes(transition.to))
      .filter((transition) => visited.has(transition.from) || leftovers.includes(transition.from))
      .map((transition) => transition.to),
  );
  leftovers.forEach((nodeId) => {
    if (visited.has(nodeId)) return;
    if (leftoverTargets.has(nodeId)) return;
    const node = nodes.get(nodeId);
    if (node?.kind === "beat" && node.container) return;
    lines.push("");
    const rootAnchor = bareAnchorFor(nodeId);
    renderChain(nodeId, 0);
    const rendered = registry.get(rootAnchor);
    if (rendered && !rendered.rootSource) rendered.rootSource = "orphan";
  });
  leftovers.forEach((nodeId) => {
    if (visited.has(nodeId)) return;
    const node = nodes.get(nodeId);
    if (node?.kind === "beat" && node.container) return;
    lines.push("");
    const rootAnchor = bareAnchorFor(nodeId);
    renderChain(nodeId, 0);
    const rendered = registry.get(rootAnchor);
    if (rendered && !rendered.rootSource) rendered.rootSource = "orphan";
  });

  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return { text: `${lines.join("\n")}\n`, registry, mainRoots };
}

export function serializeEventEvpath(project: BranchingProject, eventId: string): string {
  return serializeEventEvpathDetailed(project, eventId).text;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export type EvpathLineKind =
  | "header"
  | "category"
  | "dialogue"
  | "trigger"
  | "decision"
  | "option"
  | "speech"
  | "direction"
  | "note"
  | "img"
  | "consequence"
  | "divert";

export type EvpathParsedLine = {
  line: number;
  indent: number;
  kind: EvpathLineKind;
  anchor?: string;
  text?: string;
  speaker?: string;
  variant?: string;
  condText?: string;
  divertTarget?: { type: "caret" | "event-name" | "raw"; value: string };
};

export type EvpathDocument = {
  lines: EvpathParsedLine[];
  errors: EvpathParseError[];
};

function splitAnchor(raw: string): { body: string; anchor?: string } {
  const match = raw.match(/^(.*?)(?:\s+#\^(\S+))\s*$/);
  if (match && !match[1].endsWith("\\")) {
    return { body: match[1], anchor: match[2] };
  }
  return { body: raw.replace(/\s+$/, "") };
}

function extractConditionText(body: string): { body: string; condText?: string } {
  const match = body.match(/^(.*?)\s*((?:\{[^{}]*\}\s*)+)$/);
  if (!match) return { body };
  return { body: match[1], condText: match[2].trim() };
}

export function parseEvpath(text: string): EvpathDocument {
  const errors: EvpathParseError[] = [];
  const parsed: EvpathParsedLine[] = [];
  const rawLines = text.split(/\r?\n/);

  rawLines.forEach((rawLine, index) => {
    const line = index + 1;
    if (!rawLine.trim().length) return;
    const indentMatch = rawLine.match(/^[ \t]*/);
    const indentText = indentMatch?.[0] ?? "";
    const spaces = indentText.replace(/\t/g, EVPATH_INDENT).length;
    if (spaces % EVPATH_INDENT.length !== 0) {
      errors.push({ line, message: `La indentación debe ser múltiplo de ${EVPATH_INDENT.length} espacios.` });
    }
    const indent = Math.floor(spaces / EVPATH_INDENT.length);
    const content = rawLine.slice(indentText.length);
    const { body, anchor } = splitAnchor(content);

    if (body.startsWith("=== ")) {
      parsed.push({ line, indent, kind: "header", anchor, text: body.replace(/^===\s*/, "").replace(/\s*===\s*$/, "") });
      return;
    }
    if (/^#\s*category\s*:/i.test(body)) {
      parsed.push({ line, indent, kind: "category", text: body.replace(/^#\s*category\s*:\s*/i, "").trim() });
      return;
    }
    if (/^#img\s*:/i.test(body)) {
      parsed.push({ line, indent, kind: "img", text: body.replace(/^#img\s*:\s*/i, "").trim() });
      return;
    }
    if (/^=\s*dialogue\s*:/i.test(body)) {
      parsed.push({ line, indent, kind: "dialogue", anchor, text: unescapeText(body.replace(/^=\s*dialogue\s*:\s*/i, "").trim()) });
      return;
    }
    if (/^=\s*trigger\s*:/i.test(body)) {
      parsed.push({ line, indent, kind: "trigger", anchor, text: unescapeText(body.replace(/^=\s*trigger\s*:\s*/i, "").trim()) });
      return;
    }
    if (body.startsWith("? ")) {
      parsed.push({ line, indent, kind: "decision", anchor, text: unescapeText(body.slice(2).trim()) });
      return;
    }
    if (body.startsWith("* ")) {
      const optionMatch = body.slice(2).trim().match(/^\[(.*)\]\s*(.*)$/s);
      if (!optionMatch) {
        errors.push({ line, message: "Una opción debe tener la forma `* [texto visible]`." });
        return;
      }
      const trailing = extractConditionText(optionMatch[2] ? `x ${optionMatch[2]}` : "x");
      parsed.push({
        line,
        indent,
        kind: "option",
        anchor,
        text: unescapeText(optionMatch[1]),
        condText: trailing.condText,
      });
      return;
    }
    if (body.startsWith("->")) {
      const target = body.slice(2).trim();
      const { body: targetBody, condText } = extractConditionText(target);
      if (!targetBody.length) {
        errors.push({ line, message: "Un divert `->` necesita un destino." });
        return;
      }
      if (targetBody.startsWith("^")) {
        parsed.push({ line, indent, kind: "divert", anchor, condText, divertTarget: { type: "caret", value: targetBody.slice(1) } });
      } else if (/^".*"$/.test(targetBody)) {
        parsed.push({ line, indent, kind: "divert", anchor, condText, divertTarget: { type: "event-name", value: targetBody.slice(1, -1) } });
      } else {
        parsed.push({ line, indent, kind: "divert", anchor, condText, divertTarget: { type: "raw", value: targetBody } });
      }
      return;
    }
    if (body.startsWith("~")) {
      parsed.push({ line, indent, kind: "consequence", text: body });
      return;
    }
    if (/^\(.*\)$/s.test(body)) {
      parsed.push({ line, indent, kind: "note", text: unescapeText(body.slice(1, -1)) });
      return;
    }
    if (/^\[.*\]$/s.test(body)) {
      parsed.push({ line, indent, kind: "direction", anchor, text: unescapeText(body.slice(1, -1)) });
      return;
    }
    const unknownSpeakerMatch = body.match(/^\?\?\?\s*:\s(.*)$/s);
    if (unknownSpeakerMatch) {
      parsed.push({ line, indent, kind: "speech", anchor, speaker: "???", text: unescapeText(unknownSpeakerMatch[1]) });
      return;
    }
    const speakerMatch = body.match(/^([^:[\](){}~#*?=\\][^:]*?)(?:\s*\(([^)]+)\))?\s*:\s(.*)$/s);
    if (speakerMatch && !body.startsWith("\\")) {
      parsed.push({
        line,
        indent,
        kind: "speech",
        anchor,
        speaker: speakerMatch[1].trim(),
        variant: speakerMatch[2]?.trim(),
        text: unescapeText(speakerMatch[3]),
      });
      return;
    }
    parsed.push({ line, indent, kind: "speech", anchor, text: unescapeText(body) });
  });

  return { lines: parsed, errors };
}

// ---------------------------------------------------------------------------
// Apply (reconciliation)
// ---------------------------------------------------------------------------

type ScopeFrame =
  | { kind: "main" }
  | { kind: "dialogue"; dialogueId?: string; anchor?: string }
  | { kind: "trigger"; startId?: string }
  | { kind: "option"; decisionId: string; outcomeId: string; outcomeRef: string };

type ResolvedElement = {
  parsedLine: EvpathParsedLine;
  /** Node id inside the event graph, once the element exists. */
  nodeRef: string;
  /** Bare document id (beat/dialogue/decision/outcome id). */
  bareId: string;
  isNew: boolean;
};

function speakerRefFromLabel(
  project: BranchingProject,
  label: string | undefined,
): { ref?: string; found: boolean } {
  if (!label || /^narrator$/i.test(label)) return { ref: undefined, found: true };
  if (label === "???") return { ref: UNKNOWN_SPEAKER_REF, found: true };
  const normalized = label.trim().toLowerCase();
  const canon = project.canonRefs.find((ref) =>
    ref.id.toLowerCase() === normalized ||
    ref.label?.trim().toLowerCase() === normalized ||
    (ref.aliases ?? []).some((alias) => alias.trim().toLowerCase() === normalized),
  );
  return canon ? { ref: canon.id, found: true } : { found: false };
}

function variantIdFromLabel(
  project: BranchingProject,
  characterRef: string | undefined,
  label: string | undefined,
): string | undefined {
  if (!characterRef || !label) return undefined;
  const canon = project.canonRefs.find((ref) => ref.id === characterRef);
  if (!canon) return undefined;
  const normalized = label.trim().toLowerCase();
  return canonVariantsForRef(canon).find(
    (variant) => variant.id.toLowerCase() === normalized || variant.label.trim().toLowerCase() === normalized,
  )?.id;
}

export function applyEvpathToEvent(
  project: BranchingProject,
  eventId: string,
  text: string,
): EvpathApplyResult {
  const parsedDocument = parseEvpath(text);
  if (parsedDocument.errors.length) {
    return { project, errors: parsedDocument.errors, warnings: [], changed: false };
  }
  const original = project;
  const event = findEvent(project, eventId);
  if (!event) {
    return {
      project,
      errors: [{ line: 1, message: "El evento ya no existe en el proyecto." }],
      warnings: [],
      changed: false,
    };
  }

  const warnings: string[] = [];
  const errors: EvpathParseError[] = [];
  const { registry } = serializeEventEvpathDetailed(project, eventId);
  const primary = primaryLocaleOf(project);

  let current = project;
  const run = (result: { project: BranchingProject; message?: string }, context: string) => {
    if (result.message && result.project === current) {
      warnings.push(`${context}: ${result.message}`);
    }
    current = result.project;
    return result;
  };

  // ------------------------------------------------------------------
  // Pass 1 — resolve document structure and create missing elements.
  // ------------------------------------------------------------------
  const scopeStack: ScopeFrame[] = [{ kind: "main" }];
  const parsedAnchors = new Set<string>();
  const elements: ResolvedElement[] = [];
  /** Implicit adjacency: previous content node per indent level. */
  const chainTip = new Map<number, string | undefined>();
  const desiredPairs: Array<{ from: string; to: string }> = [];
  const explicitDiverts: Array<{
    parsedLine: EvpathParsedLine;
    from: string;
  }> = [];
  let lastSpeechRef: { nodeRef: string; container?: string } | undefined;
  let pendingDecision: { decisionId: string; indent: number } | undefined;
  const seenRoots: Array<{ ref: string; bare: string }> = [];
  const consumedNotes = new Map<string, { note?: string; img?: string }>();
  const parsedOutcomeCons = new Map<string, string[]>();

  const currentScope = () => scopeStack[scopeStack.length - 1];

  const popScopesTo = (indent: number) => {
    while (scopeStack.length > 1) {
      const top = scopeStack[scopeStack.length - 1];
      const baseIndent = scopeBaseIndent.get(top);
      if (baseIndent !== undefined && indent <= baseIndent) {
        scopeStack.pop();
      } else {
        break;
      }
    }
  };
  const scopeBaseIndent = new Map<ScopeFrame, number>();

  const pushScope = (frame: ScopeFrame, baseIndent: number) => {
    scopeStack.push(frame);
    scopeBaseIndent.set(frame, baseIndent);
  };

  const containerDialogueId = (): string | undefined => {
    for (let index = scopeStack.length - 1; index >= 0; index -= 1) {
      const frame = scopeStack[index];
      if (frame.kind === "dialogue") return frame.dialogueId;
      if (frame.kind === "trigger") return undefined;
    }
    return undefined;
  };

  const linkFromTip = (indent: number, nodeRef: string, bareId: string) => {
    const tip = chainTip.get(indent);
    if (tip) {
      desiredPairs.push({ from: tip, to: nodeRef });
    } else if (indent === 0 && currentScope().kind === "main") {
      seenRoots.push({ ref: nodeRef, bare: bareId });
    } else {
      // First content under a scope header.
      for (let index = scopeStack.length - 1; index >= 0; index -= 1) {
        const frame = scopeStack[index];
        if (scopeBaseIndent.get(frame) === indent - 1 || (frame.kind === "main" && indent === 0)) {
          if (frame.kind === "option") {
            desiredPairs.push({ from: frame.outcomeRef, to: nodeRef });
          } else if (frame.kind === "trigger" && frame.startId) {
            desiredPairs.push({ from: `dialogue-start:${eventId}:${frame.startId}`, to: nodeRef });
          }
          // Dialogue scope: entry beat handled through entryBeatId below.
          return;
        }
      }
    }
  };

  for (const parsedLine of parsedDocument.lines) {
    const { indent, kind, anchor } = parsedLine;
    if (kind !== "note" && kind !== "img" && kind !== "consequence") {
      popScopesTo(indent);
    }
    if (anchor) {
      if (parsedAnchors.has(anchor)) {
        errors.push({ line: parsedLine.line, message: `Ancla duplicada #^${anchor}.` });
        continue;
      }
      parsedAnchors.add(anchor);
    }

    if (kind === "header" || kind === "category") {
      if (kind === "category" && parsedLine.text) {
        const category = (current.eventCategories ?? []).find(
          (item) =>
            item.id.toLowerCase() === parsedLine.text!.toLowerCase() ||
            item.label.toLowerCase() === parsedLine.text!.toLowerCase(),
        );
        const nextType = category?.id ?? parsedLine.text;
        if (nextType !== findEvent(current, eventId)?.type) {
          run(updateEvent(current, eventId, { type: nextType }), "category");
        }
      }
      if (kind === "header" && parsedLine.text) {
        const currentEvent = findEvent(current, eventId);
        if (currentEvent && parsedLine.text !== (currentEvent.name || currentEvent.id)) {
          run(updateEvent(current, eventId, { name: parsedLine.text }), "header");
        }
      }
      continue;
    }

    if (kind === "trigger") {
      const startId = anchor && registry.get(anchor)?.kind === "trigger" ? anchor : undefined;
      if (!startId) {
        warnings.push(`Línea ${parsedLine.line}: los triggers se crean desde el canvas; la línea se ignora.`);
      }
      pushScope({ kind: "trigger", startId }, indent);
      chainTip.set(indent + 1, undefined);
      pendingDecision = undefined;
      lastSpeechRef = undefined;
      continue;
    }

    if (kind === "dialogue") {
      let dialogueId = anchor && registry.get(anchor)?.kind === "dialogue" ? anchor : undefined;
      let isNew = false;
      if (!dialogueId) {
        const result = run(createDialogue(current, eventId), `línea ${parsedLine.line}`);
        const created = findEvent(current, eventId)?.dialogues?.at(-1);
        dialogueId = created?.id;
        isNew = true;
        if (result.message && !dialogueId) continue;
      }
      if (dialogueId) {
        const dialogue = findEvent(current, eventId)?.dialogues?.find((item) => item.id === dialogueId);
        if (dialogue && parsedLine.text && dialogue.title !== parsedLine.text) {
          run(updateDialogue(current, eventId, dialogueId, { title: parsedLine.text }), "dialogue");
        }
        const nodeRef = dialogueNodeId(eventId, dialogueId);
        linkFromTip(indent, nodeRef, dialogueId);
        chainTip.set(indent, nodeRef);
        elements.push({ parsedLine, nodeRef, bareId: dialogueId, isNew });
      }
      pushScope({ kind: "dialogue", dialogueId, anchor }, indent);
      chainTip.set(indent + 1, undefined);
      pendingDecision = undefined;
      lastSpeechRef = undefined;
      continue;
    }

    if (kind === "decision") {
      let decisionId = anchor && registry.get(anchor)?.kind === "decision" ? anchor : undefined;
      let isNew = false;
      if (!decisionId) {
        run(createDecision(current, eventId), `línea ${parsedLine.line}`);
        decisionId = findEvent(current, eventId)?.decisions?.at(-1)?.id;
        isNew = true;
      }
      if (!decisionId) continue;
      const decision = findEvent(current, eventId)?.decisions?.find((item) => item.id === decisionId);
      if (decision && parsedLine.text && decision.name !== parsedLine.text) {
        run(updateDecision(current, eventId, decisionId, { name: parsedLine.text }), "decision");
      }
      const nodeRef = decisionNodeId(eventId, decisionId);
      linkFromTip(indent, nodeRef, decisionId);
      chainTip.set(indent, undefined);
      elements.push({ parsedLine, nodeRef, bareId: decisionId, isNew });
      pendingDecision = { decisionId, indent };
      lastSpeechRef = undefined;
      continue;
    }

    if (kind === "option") {
      if (!pendingDecision || pendingDecision.indent !== indent) {
        errors.push({ line: parsedLine.line, message: "Una opción `*` debe ir después de una decisión `?` al mismo nivel." });
        continue;
      }
      const decisionId = pendingDecision.decisionId;
      let outcomeId = anchor && registry.get(anchor)?.kind === "outcome" ? anchor : undefined;
      let isNew = false;
      if (!outcomeId) {
        run(createOutcome(current, eventId, decisionId), `línea ${parsedLine.line}`);
        outcomeId = findEvent(current, eventId)
          ?.decisions?.find((item) => item.id === decisionId)
          ?.outcomes.at(-1)?.id;
        isNew = true;
      }
      if (!outcomeId) continue;
      const decision = findEvent(current, eventId)?.decisions?.find((item) => item.id === decisionId);
      const outcome = decision?.outcomes.find((item) => item.id === outcomeId);
      if (outcome) {
        const updates: Partial<Outcome> = {};
        if ((outcome.visibleText || outcome.name) !== parsedLine.text) {
          updates.visibleText = parsedLine.text ?? "";
        }
        const previous = registry.get(outcomeId);
        const parsedCond = parsedLine.condText ?? "";
        if ((previous?.condText ?? "") !== parsedCond) {
          const conditions = parseConditionText(parsedCond);
          if (conditions === null) {
            warnings.push(`Línea ${parsedLine.line}: condición no reconocida; se conserva la lógica existente.`);
          } else {
            updates.availability = conditions;
          }
        }
        if (Object.keys(updates).length) {
          run(updateOutcome(current, eventId, decisionId, outcomeId, updates), "option");
        }
      }
      const nodeRef = outcomeNodeId(eventId, decisionId, outcomeId);
      elements.push({ parsedLine, nodeRef, bareId: outcomeId, isNew });
      parsedOutcomeCons.set(outcomeId, []);
      pushScope({ kind: "option", decisionId, outcomeId, outcomeRef: nodeRef }, indent);
      chainTip.set(indent + 1, undefined);
      lastSpeechRef = { nodeRef: outcomeId, container: "outcome" };
      continue;
    }

    if (kind === "consequence") {
      const scope = currentScope();
      if (scope.kind === "option") {
        parsedOutcomeCons.get(scope.outcomeId)?.push(parsedLine.text ?? "");
      } else {
        warnings.push(`Línea ${parsedLine.line}: las consecuencias solo se aplican bajo opciones en esta versión.`);
      }
      continue;
    }

    if (kind === "note" || kind === "img") {
      if (!lastSpeechRef || lastSpeechRef.container === "outcome") {
        warnings.push(`Línea ${parsedLine.line}: esta línea debe ir después de un beat de diálogo.`);
        continue;
      }
      const entry = consumedNotes.get(lastSpeechRef.nodeRef) ?? {};
      if (kind === "note") entry.note = parsedLine.text ?? "";
      else entry.img = parsedLine.text ?? "";
      consumedNotes.set(lastSpeechRef.nodeRef, entry);
      continue;
    }

    if (kind === "divert") {
      const scope = currentScope();
      let from: string | undefined = chainTip.get(indent);
      if (!from && scope.kind === "option" && scopeBaseIndent.get(scope) === indent - 1) {
        from = scope.outcomeRef;
      }
      if (!from && scope.kind === "trigger" && scope.startId && scopeBaseIndent.get(scope) === indent - 1) {
        from = `dialogue-start:${eventId}:${scope.startId}`;
      }
      if (!from && indent === 0) from = eventId;
      if (!from) {
        errors.push({ line: parsedLine.line, message: "No hay un origen claro para este divert." });
        continue;
      }
      explicitDiverts.push({ parsedLine, from });
      chainTip.set(indent, undefined);
      continue;
    }

    // speech / direction beats
    const dialogueId = containerDialogueId();
    let beatId = anchor && registry.get(anchor)?.kind === "beat" ? anchor : undefined;
    let isNew = false;
    if (anchor && !beatId) {
      warnings.push(`Línea ${parsedLine.line}: ancla #^${anchor} desconocida; se crea un beat nuevo.`);
    }
    if (!beatId) {
      const beatKind = kind === "direction" ? "direction" : "speech";
      if (dialogueId) {
        run(createDialogueBeat(current, eventId, dialogueId, beatKind), `línea ${parsedLine.line}`);
        beatId = findEvent(current, eventId)
          ?.dialogues?.find((item) => item.id === dialogueId)
          ?.beats?.at(-1)?.id;
      } else {
        run(createEventDialogueBeat(current, eventId, beatKind), `línea ${parsedLine.line}`);
        beatId = findEvent(current, eventId)?.dialogueBeats?.at(-1)?.id;
      }
      isNew = true;
    }
    if (!beatId) continue;

    const currentEvent = findEvent(current, eventId)!;
    const containedIn = currentEvent.dialogues?.find((item) =>
      item.beats?.some((beat) => beat.id === beatId),
    )?.id;
    if (!isNew && containedIn !== dialogueId) {
      warnings.push(
        `Línea ${parsedLine.line}: mover beats entre diálogos aún no se soporta desde el texto; se conserva su ubicación.`,
      );
    }
    const beat = (containedIn
      ? currentEvent.dialogues?.find((item) => item.id === containedIn)?.beats
      : currentEvent.dialogueBeats
    )?.find((item) => item.id === beatId);
    if (!beat) continue;

    const found = findBlock(current, beat);
    if (found) {
      const existingText = beatText(current, beat);
      if ((parsedLine.text ?? "") !== existingText) {
        const textKey = found.block.textKey ?? `script.${found.scriptId}.${found.block.id}`;
        current = updateLocalizedEntry(current, textKey, primary, parsedLine.text ?? "", primary);
      }
      if (kind === "speech" || kind === "direction") {
        const speakerResolution = speakerRefFromLabel(current, parsedLine.speaker);
        if (!speakerResolution.found) {
          warnings.push(
            `Línea ${parsedLine.line}: personaje "${parsedLine.speaker}" no encontrado en el canon; se conserva el actual.`,
          );
        } else {
          const existingRef = found.block.characterRef ?? found.block.speakerRef;
          const nextVariant = variantIdFromLabel(current, speakerResolution.ref, parsedLine.variant);
          if (parsedLine.variant && speakerResolution.ref && !nextVariant) {
            warnings.push(
              `Línea ${parsedLine.line}: variante "${parsedLine.variant}" no encontrada; se usa la base.`,
            );
          }
          if (existingRef !== speakerResolution.ref || (found.block.characterVariantId ?? BASE_VARIANT_ID) !== (nextVariant ?? BASE_VARIANT_ID)) {
            run(
              updateScriptBlock(current, found.scriptId, found.block.id, {
                characterRef: speakerResolution.ref,
                characterVariantId: nextVariant,
              }),
              "speaker",
            );
          }
        }
      }
    }

    const nodeRef = beatNodeId(eventId, beatId);
    linkFromTip(indent, nodeRef, beatId);
    chainTip.set(indent, nodeRef);
    elements.push({ parsedLine, nodeRef, bareId: beatId, isNew });
    lastSpeechRef = beat.kind === "speech" ? { nodeRef: beatId } : undefined;
    pendingDecision = pendingDecision && pendingDecision.indent === indent ? undefined : pendingDecision;
  }

  if (errors.length) {
    return { project: original, errors, warnings, changed: false };
  }

  // ------------------------------------------------------------------
  // Pass 2 — director notes, scene images, and outcome consequences.
  // ------------------------------------------------------------------
  const applyBeatExtras = (beatId: string) => {
    const currentEvent = findEvent(current, eventId)!;
    const containedIn = currentEvent.dialogues?.find((item) => item.beats?.some((beat) => beat.id === beatId))?.id;
    const beat = (containedIn
      ? currentEvent.dialogues?.find((item) => item.id === containedIn)?.beats
      : currentEvent.dialogueBeats
    )?.find((item) => item.id === beatId);
    if (!beat || beat.kind !== "speech") return;
    const extras = consumedNotes.get(beatId) ?? {};
    const updates: Partial<DialogueBeat> = {};
    if ((beat.directorNote ?? "") !== (extras.note ?? "")) {
      updates.directorNote = extras.note || undefined;
    }
    const currentAsset = beat.sceneImage
      ? (current.assets ?? []).find((item) => item.id === beat.sceneImage?.assetId)
      : undefined;
    const currentImgName = currentAsset?.name ?? beat.sceneImage?.assetId ?? "";
    if ((extras.img ?? "") !== currentImgName) {
      if (!extras.img) {
        updates.sceneImage = undefined;
      } else {
        const asset = (current.assets ?? []).find(
          (item) => item.kind === "image" && item.name.toLowerCase() === extras.img!.toLowerCase(),
        );
        if (asset) {
          updates.sceneImage = { id: beat.sceneImage?.id ?? `scene:${beatId}:${asset.id}`, assetId: asset.id };
        } else {
          warnings.push(`Imagen "${extras.img}" no encontrada entre los assets; se conserva la actual.`);
        }
      }
    }
    if (Object.keys(updates).length) {
      if (containedIn) run(updateDialogueBeat(current, eventId, containedIn, beatId, updates), "beat extras");
      else run(updateEventDialogueBeat(current, eventId, beatId, updates), "beat extras");
    }
  };
  elements
    .filter((element) => element.parsedLine.kind === "speech")
    .forEach((element) => applyBeatExtras(element.bareId));

  parsedOutcomeCons.forEach((consTexts, outcomeId) => {
    const decision = findEvent(current, eventId)?.decisions?.find((item) =>
      item.outcomes.some((outcome) => outcome.id === outcomeId),
    );
    if (!decision) return;
    const previous = registry.get(outcomeId);
    const previousTexts = previous?.consTexts ?? [];
    if (previousTexts.join("\n") === consTexts.join("\n")) return;
    const outcome = decision.outcomes.find((item) => item.id === outcomeId)!;
    const kept: Consequence[] = [];
    let parseFailed = false;
    consTexts.forEach((text) => {
      const parsedConsequence = parseConsequenceText(text);
      if (parsedConsequence) {
        kept.push(parsedConsequence);
        return;
      }
      // Opaque line: keep the original consequence it rendered from, if any.
      const originalIndex = previousTexts.indexOf(text);
      if (originalIndex >= 0 && outcome.consequences?.[originalIndex]) {
        kept.push(outcome.consequences[originalIndex]);
      } else {
        parseFailed = true;
      }
    });
    if (parseFailed) {
      warnings.push(`Consecuencia no reconocida en la opción "${outcome.visibleText || outcome.name}"; se conserva la lógica existente.`);
      return;
    }
    run(updateOutcome(current, eventId, decision.id, outcomeId, { consequences: kept }), "consequences");
  });

  // ------------------------------------------------------------------
  // Pass 3 — deletions (elements rendered before but absent now).
  // ------------------------------------------------------------------
  const staleTransitionIds: string[] = [];
  registry.forEach((entry, anchor) => {
    if (entry.kind === "transition") return;
    if (parsedAnchors.has(anchor)) return;
    if (entry.kind === "trigger") {
      warnings.push(`El trigger #^${anchor} no se elimina desde el texto; usa el canvas.`);
      return;
    }
    if (entry.kind === "beat") {
      const containedIn = findEvent(current, eventId)?.dialogues?.find((item) =>
        item.beats?.some((beat) => beat.id === anchor),
      )?.id;
      if (containedIn) run(deleteDialogueBeat(current, eventId, containedIn, anchor), "delete beat");
      else run(deleteEventDialogueBeat(current, eventId, anchor), "delete beat");
      return;
    }
    if (entry.kind === "outcome") {
      const decision = findEvent(current, eventId)?.decisions?.find((item) =>
        item.outcomes.some((outcome) => outcome.id === anchor),
      );
      if (!decision) return;
      const outcomeNode = outcomeNodeId(eventId, decision.id, anchor);
      (findEvent(current, eventId)?.transitions ?? [])
        .filter((transition) => transition.from === outcomeNode)
        .forEach((transition) => staleTransitionIds.push(transition.id));
      staleTransitionIds.forEach((id) => {
        current = deleteTransition(current, id).project;
      });
      staleTransitionIds.length = 0;
      run(deleteOutcome(current, eventId, decision.id, anchor), "delete outcome");
      return;
    }
    if (entry.kind === "decision") {
      const decisionNode = decisionNodeId(eventId, anchor);
      (findEvent(current, eventId)?.transitions ?? [])
        .filter((transition) => transition.from.startsWith(`outcome:${eventId}:${anchor}:`) || transition.from === decisionNode || transition.to === decisionNode)
        .forEach((transition) => {
          current = deleteTransition(current, transition.id).project;
        });
      run(deleteDecision(current, eventId, anchor), "delete decision");
      return;
    }
    if (entry.kind === "dialogue") {
      const dialogue = findEvent(current, eventId)?.dialogues?.find((item) => item.id === anchor);
      if (dialogue?.beats?.length) {
        warnings.push(`El diálogo "${dialogue.title}" aún tiene beats sin eliminar; se conserva.`);
        return;
      }
      run(
        updateEvent(current, eventId, {
          dialogues: (findEvent(current, eventId)?.dialogues ?? []).filter((item) => item.id !== anchor),
        }),
        "delete dialogue",
      );
    }
  });

  // ------------------------------------------------------------------
  // Pass 4 — transitions: explicit diverts, implicit adjacency, stale edges.
  // ------------------------------------------------------------------
  const keptTransitionIds = new Set<string>();
  const nodeIdForBareAnchor = (bare: string): string | undefined => {
    const currentEvent = findEvent(current, eventId)!;
    if (currentEvent.dialogueBeats?.some((beat) => beat.id === bare)) return beatNodeId(eventId, bare);
    if (currentEvent.dialogues?.some((dialogue) => dialogue.beats?.some((beat) => beat.id === bare))) {
      return beatNodeId(eventId, bare);
    }
    if (currentEvent.dialogues?.some((dialogue) => dialogue.id === bare)) return dialogueNodeId(eventId, bare);
    const owningDecision = currentEvent.decisions?.find((decision) => decision.id === bare);
    if (owningDecision) return decisionNodeId(eventId, bare);
    return undefined;
  };

  const resolveDivertTarget = (parsedLine: EvpathParsedLine): string | undefined => {
    const target = parsedLine.divertTarget!;
    if (target.type === "caret") {
      const resolved = nodeIdForBareAnchor(target.value);
      if (!resolved) {
        warnings.push(`Línea ${parsedLine.line}: destino ^${target.value} no encontrado.`);
      }
      return resolved;
    }
    if (target.type === "event-name") {
      const normalized = target.value.trim().toLowerCase();
      const targetEvent = current.events.find(
        (item) => (item.name || item.id).trim().toLowerCase() === normalized,
      );
      if (!targetEvent) {
        warnings.push(`Línea ${parsedLine.line}: evento "${target.value}" no encontrado.`);
        return undefined;
      }
      return targetEvent.id;
    }
    if (target.value === "END" || target.value === "DONE") {
      warnings.push(
        `Línea ${parsedLine.line}: el final de un evento se define con su categoría terminal, no con \`-> END\`; la línea se ignora.`,
      );
      return undefined;
    }
    return target.value;
  };

  explicitDiverts.forEach(({ parsedLine, from }) => {
    const to = resolveDivertTarget(parsedLine);
    const anchor = parsedLine.anchor;
    const existing = anchor
      ? (findEvent(current, eventId)?.transitions ?? []).find((transition) => transition.id === anchor)
      : undefined;
    if (existing) {
      keptTransitionIds.add(existing.id);
      const updates: Partial<Transition> = {};
      if (to && existing.to !== to) updates.to = to;
      if (existing.from !== from) updates.from = from;
      const previous = registry.get(existing.id);
      const parsedCond = parsedLine.condText ?? "";
      if ((previous?.condText ?? "") !== parsedCond) {
        const conditions = parseConditionText(parsedCond);
        if (conditions === null) {
          warnings.push(`Línea ${parsedLine.line}: condición del divert no reconocida; se conserva.`);
        } else {
          updates.conditions = conditions;
        }
      }
      if (Object.keys(updates).length) {
        run(updateTransition(current, existing.id, updates), "divert");
      }
      return;
    }
    if (!to) return;
    run(createInternalTransition(current, eventId, from, to), "divert");
    const created = (findEvent(current, eventId)?.transitions ?? []).find(
      (transition) => transition.from === from && transition.to === to,
    );
    if (created) {
      keptTransitionIds.add(created.id);
      if (parsedLine.condText) {
        const conditions = parseConditionText(parsedLine.condText);
        if (conditions === null) {
          warnings.push(`Línea ${parsedLine.line}: condición del divert no reconocida; se ignora.`);
        } else if (conditions) {
          run(updateTransition(current, created.id, { conditions }), "divert");
        }
      }
    }
  });

  // Entry adjacency: the first main root keeps/creates the event entry edge.
  const desiredWithEntry = [...desiredPairs];
  seenRoots.forEach(({ ref, bare }, index) => {
    const previous = registry.get(bare);
    if (previous?.rootSource === "boundary" || previous?.rootSource === "orphan") return;
    if (index === 0 || previous?.rootSource === "entry") {
      desiredWithEntry.push({ from: eventId, to: ref });
    } else {
      warnings.push("Nueva cadena sin conexión de entrada; conéctala desde el canvas si debe ser alcanzable.");
    }
  });

  desiredWithEntry.forEach(({ from, to }) => {
    const existing = (findEvent(current, eventId)?.transitions ?? []).find(
      (transition) => transition.from === from && transition.to === to,
    );
    if (existing) {
      keptTransitionIds.add(existing.id);
      return;
    }
    run(createInternalTransition(current, eventId, from, to), "flow");
    const created = (findEvent(current, eventId)?.transitions ?? []).find(
      (transition) => transition.from === from && transition.to === to,
    );
    if (created) keptTransitionIds.add(created.id);
  });

  registry.forEach((entry, anchor) => {
    if (entry.kind !== "transition") return;
    if (keptTransitionIds.has(anchor)) return;
    const stillExists = (findEvent(current, eventId)?.transitions ?? []).some(
      (transition) => transition.id === anchor,
    );
    if (!stillExists) return;
    current = deleteTransition(current, anchor).project;
  });

  const changed = current !== original;
  return {
    project: changed ? current : original,
    errors: [],
    warnings,
    changed,
    message: changed ? "Evpath aplicado al evento." : undefined,
  };
}
