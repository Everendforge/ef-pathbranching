import type { BranchingProject, EventNode, Outcome, Transition } from "./domain.js";
import { normalizeProject } from "./projectSerialization.js";

export const TWINE_FORMAT = "SugarCube";
export const TWINE_FORMAT_VERSION = "2.37.3";

export type TwineStorySummary = {
  name: string;
  ifid?: string;
  format: string;
  formatVersion?: string;
  passageCount: number;
  startPassageName?: string;
};

type TwinePassage = {
  pid: string;
  name: string;
  tags: string[];
  position?: { x: number; y: number };
  content: string;
};

type TwineStory = TwineStorySummary & { passages: TwinePassage[] };

function decodeHtml(value: string) {
  return value.replace(/&(?:#(x[\da-f]+|\d+)|([a-z]+));/gi, (_, numeric: string | undefined, named: string | undefined) => {
    if (numeric) {
      const codePoint = numeric.startsWith("x") ? Number.parseInt(numeric.slice(1), 16) : Number.parseInt(numeric, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
    }
    return ({ amp: "&", apos: "'", gt: ">", lt: "<", nbsp: "\u00a0", quot: '"' } as Record<string, string>)[named?.toLowerCase() ?? ""] ?? _;
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
}

function attributes(source: string) {
  const result: Record<string, string> = {};
  const matcher = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (let match = matcher.exec(source); match; match = matcher.exec(source)) {
    result[match[1]] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

function parseStory(html: string): TwineStory {
  const storyMatch = /<tw-storydata\b([^>]*)>([\s\S]*?)<\/tw-storydata>/i.exec(html);
  if (!storyMatch) throw new Error("This file does not contain Twine 2 story data (<tw-storydata>).");
  const storyAttributes = attributes(storyMatch[1]);
  const passages: TwinePassage[] = [];
  const passageMatcher = /<tw-passagedata\b([^>]*)>([\s\S]*?)<\/tw-passagedata>/gi;
  for (let match = passageMatcher.exec(storyMatch[2]); match; match = passageMatcher.exec(storyMatch[2])) {
    const passageAttributes = attributes(match[1]);
    const [x, y] = (passageAttributes.position ?? "").split(",").map(Number);
    passages.push({
      pid: passageAttributes.pid ?? `${passages.length + 1}`,
      name: passageAttributes.name?.trim() || `Passage ${passages.length + 1}`,
      tags: (passageAttributes.tags ?? "").split(/\s+/).filter(Boolean),
      position: Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined,
      content: decodeHtml(match[2]),
    });
  }
  if (!passages.length) throw new Error("The Twine story has no <tw-passagedata> passages to import.");
  const startPid = storyAttributes.startnode;
  return {
    name: storyAttributes.name?.trim() || "Untitled Twine story",
    ifid: storyAttributes.ifid,
    format: storyAttributes.format || "Unknown",
    formatVersion: storyAttributes["format-version"],
    passageCount: passages.length,
    startPassageName: passages.find((passage) => passage.pid === startPid)?.name,
    passages,
  };
}

function linkParts(source: string) {
  const clean = source.replace(/\][\s\S]*$/, "").trim();
  if (!clean || /^(?:img|audio|video)\[/i.test(clean)) return undefined;
  if (clean.includes("|")) {
    const [label, target] = clean.split(/\|(.+)/, 2);
    return { label: label.trim() || target.trim(), target: target.trim() };
  }
  if (clean.includes("->")) {
    const [label, target] = clean.split(/->(.+)/, 2);
    return { label: label.trim() || target.trim(), target: target.trim() };
  }
  if (clean.includes("<-")) {
    const [target, label] = clean.split(/<-(.+)/, 2);
    return { label: label.trim() || target.trim(), target: target.trim() };
  }
  return { label: clean, target: clean };
}

function passageLinks(content: string) {
  const links: Array<{ label: string; target: string }> = [];
  const matcher = /\[\[([\s\S]*?)\]\]/g;
  for (let match = matcher.exec(content); match; match = matcher.exec(content)) {
    const link = linkParts(match[1]);
    if (link) links.push(link);
  }
  return links;
}

function slug(value: string) {
  const result = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return result || "twine-story";
}

function uniqueId(existing: Set<string>, base: string) {
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function inspectTwineHtml(html: string): TwineStorySummary {
  const { passages: _, ...summary } = parseStory(html);
  return summary;
}

export function importTwineHtml(html: string, baseProject?: BranchingProject): BranchingProject {
  const story = parseStory(html);
  if (story.format !== TWINE_FORMAT) {
    throw new Error(`This importer currently supports ${TWINE_FORMAT}; the selected story uses ${story.format}.`);
  }
  const sequenceId = uniqueId(
    new Set((baseProject?.sequences ?? []).map((sequence) => sequence.id)),
    `twine:sequence:${slug(story.name)}`,
  );
  const eventIdByPassage = new Map(story.passages.map((passage) => [passage.name, `${sequenceId}:passage:${passage.pid}`]));
  const events: EventNode[] = story.passages.map((passage) => {
    const eventId = eventIdByPassage.get(passage.name)!;
    const links = passageLinks(passage.content).filter((link) => eventIdByPassage.has(link.target));
    const outcomes: Outcome[] = links.map((link, index) => ({ id: `twine:outcome:${passage.pid}:${index + 1}`, name: link.label, description: link.target }));
    const transitions: Transition[] = outcomes.map((outcome, index) => ({
      id: `twine:transition:${passage.pid}:${index + 1}`,
      from: `${eventId}:${outcome.id}`,
      to: eventIdByPassage.get(links[index].target)!,
      label: links[index].label,
      order: index,
      mode: "conditional",
      source: "twineSugarCube",
    }));
    return {
      id: eventId,
      legacyId: passage.pid,
      name: passage.name,
      type: passage.tags.some((tag) => /^final$/i.test(tag)) || links.length === 0 ? "final" : "normal",
      text: { format: "sugarcube", content: passage.content },
      decisions: outcomes.length ? [{ id: `twine:decision:${passage.pid}`, name: "Choices", type: "dialogue", outcomes }] : [],
      transitions,
    };
  });
  const startEventId = eventIdByPassage.get(story.startPassageName ?? "") ?? events[0].id;
  const importedNodePositions = Object.fromEntries(story.passages.flatMap((passage) => {
    const id = eventIdByPassage.get(passage.name)!;
    return passage.position ? [[id, { position: passage.position }]] : [];
  }));
  return normalizeProject({
    ...(baseProject ?? {}),
    specVersion: "0.1",
    projectId: baseProject?.projectId || `twine:${slug(story.name)}`,
    name: baseProject?.name || story.name,
    canonRefs: baseProject?.canonRefs ?? [],
    sequences: [...(baseProject?.sequences ?? []), { id: sequenceId, name: story.name, entryEventId: startEventId, eventIds: events.map((event) => event.id) }],
    branches: baseProject?.branches ?? [],
    events: [...(baseProject?.events ?? []), ...events],
    scripts: baseProject?.scripts ?? [],
    externalFunctions: baseProject?.externalFunctions ?? [],
    variables: baseProject?.variables ?? {},
    canvas: {
      ...(baseProject?.canvas ?? {}),
      activeSequenceId: sequenceId,
      activeScope: { kind: "sequence", id: sequenceId },
      nodes: baseProject?.canvas?.nodes ?? {},
      scopes: {
        ...(baseProject?.canvas?.scopes ?? {}),
        [`sequence:${sequenceId}`]: { nodes: importedNodePositions },
      },
    },
    entrySequenceId: baseProject?.entrySequenceId ?? sequenceId,
  });
}

function ifid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().toUpperCase();
  return "00000000-0000-4000-8000-000000000000";
}

function toPosition(index: number, event: EventNode, project: BranchingProject) {
  const saved = project.canvas?.nodes?.[event.id]?.position;
  return saved ?? { x: 100 + (index % 6) * 175, y: 100 + Math.floor(index / 6) * 150 };
}

function twinePassageContent(event: EventNode, project: BranchingProject) {
  const choices = (event.decisions ?? []).flatMap((decision) => decision.outcomes.map((outcome) => ({ decision, outcome })));
  const directTransitions = (event.transitions ?? []).filter((transition) => transition.from === event.id);
  const links = [
    ...choices.map(({ outcome }) => {
      const transition = event.transitions?.find((candidate) => candidate.from.endsWith(`:${outcome.id}`));
      const target = transition && project.events.find((candidate) => candidate.id === transition.to)?.name;
      return target ? `[[${outcome.name}|${target}]]` : undefined;
    }),
    ...directTransitions.map((transition) => {
      const target = project.events.find((candidate) => candidate.id === transition.to)?.name;
      return target ? `[[${transition.label ?? target}|${target}]]` : undefined;
    }),
  ].filter((link): link is string => Boolean(link));
  const text = event.text?.content ?? event.name;
  return links.length && !links.every((link) => text.includes(link)) ? `${text}${text ? "\n\n" : ""}${links.join("\n")}` : text;
}

export function exportTwineHtml(project: BranchingProject) {
  const events = project.events;
  const entryEventId = project.sequences.find((sequence) => sequence.id === project.entrySequenceId)?.entryEventId ?? events[0]?.id;
  const entries = events.map((event, index) => {
    const position = toPosition(index, event, project);
    const tags = event.type === "final" ? "Final" : "";
    return `<tw-passagedata pid="${index + 1}" name="${escapeHtml(event.name)}" tags="${tags}" position="${position.x},${position.y}" size="100,100">${escapeHtml(twinePassageContent(event, project))}</tw-passagedata>`;
  }).join("\n");
  const startNode = Math.max(1, events.findIndex((event) => event.id === entryEventId) + 1);
  const name = project.name || project.projectId || "Untitled PathBranching story";
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escapeHtml(name)}</title></head><body>\n<tw-storydata name="${escapeHtml(name)}" startnode="${startNode}" creator="PathBranching" creator-version="0.1" ifid="${ifid()}" format="${TWINE_FORMAT}" format-version="${TWINE_FORMAT_VERSION}" options="" zoom="1" hidden>\n<style role="stylesheet" id="twine-user-stylesheet" type="text/twine-css"></style>\n<script role="script" id="twine-user-script" type="text/twine-javascript"></script>\n${entries}\n</tw-storydata>\n</body></html>\n`;
}
