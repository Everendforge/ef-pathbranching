import { ArrowLeft, FileText, Filter, GitBranch, Home, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { BranchingProject, ScriptBlock } from "../domain.js";
import { blockValues, localeDisplayName, normalizeLocaleList, scriptBlockTextKey, type LocaleNames } from "../localization.js";

type ScriptRow = {
  nodeId: string;
  order: string;
  key: string;
  identifier: string;
  kind: string;
  dialogue?: string;
  characterRef?: string;
  fallback: string;
  block?: { scriptId: string; block: ScriptBlock };
};

function graphOrder(project: BranchingProject, eventId: string): Map<string, string> {
  const event = project.events.find((candidate) => candidate.id === eventId);
  if (!event) return new Map();
  const transitions = [...(event.transitions ?? [])].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  const internal = new Set<string>([
    ...(event.dialogueBeats ?? []).map((beat) => `beat:${event.id}:${beat.id}`),
    ...(event.dialogues ?? []).flatMap((dialogue) => (dialogue.beats ?? []).map((beat) => `beat:${event.id}:${beat.id}`)),
    ...(event.decisions ?? []).map((decision) => `decision:${event.id}:${decision.id}`),
  ]);
  const incoming = new Set(transitions.filter((transition) => internal.has(transition.to)).map((transition) => transition.to));
  const roots = Array.from(internal).filter((id) => !incoming.has(id));
  const order = new Map<string, string>();
  const visit = (id: string, path: string, seen: Set<string>) => {
    if (order.has(id)) return;
    order.set(id, path);
    if (seen.has(id)) return;
    const nextSeen = new Set(seen).add(id);
    transitions.filter((transition) => transition.from === id && internal.has(transition.to)).forEach((transition, index) => {
      visit(transition.to, `${path}.${String.fromCharCode(65 + index)}`, nextSeen);
    });
  };
  roots.forEach((root, index) => visit(root, String(index + 1), new Set()));
  Array.from(internal).filter((id) => !order.has(id)).forEach((id, index) => order.set(id, `U${index + 1}`));
  return order;
}

export function EventScriptWorkspace({
  project,
  eventId,
  primaryLocale,
  locales,
  localeNames,
  focusedTextKey,
  breadcrumb,
  onClose,
  onUpdateEvent,
  onUpdateText,
  onUpdateBlock,
}: {
  project: BranchingProject;
  eventId: string;
  primaryLocale: string;
  locales: string[];
  localeNames?: LocaleNames;
  focusedTextKey?: string;
  breadcrumb: Array<{ label: string; onClick: () => void }>;
  onClose: () => void;
  onUpdateEvent: (eventId: string, updates: { presentEntityRefs?: string[] }) => void;
  onUpdateText: (key: string, locale: string, value: string) => void;
  onUpdateBlock: (scriptId: string, blockId: string, updates: Partial<ScriptBlock>) => void;
}) {
  const event = project.events.find((candidate) => candidate.id === eventId);
  const presentEntityRefs = event?.presentEntityRefs ?? event?.canonRefs ?? [];
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const languages = normalizeLocaleList(primaryLocale, locales);
  const blocks = useMemo(() => new Map((project.scriptDocuments ?? []).flatMap((script) =>
    script.blocks.map((block) => [`${script.id}:${block.id}`, { scriptId: script.id, block }] as const),
  )), [project.scriptDocuments]);
  const order = useMemo(() => graphOrder(project, eventId), [eventId, project]);
  const rows = useMemo(() => {
    if (!event) return [];
    const next: ScriptRow[] = [];
    if (event.text?.content) next.push({ nodeId: event.id, order: "0", key: `event.${event.id}.text`, identifier: event.id, kind: "Event text", fallback: event.text.content });
    const addBeat = (beat: NonNullable<typeof event.dialogueBeats>[number], dialogue?: string) => {
      const owner = blocks.get(`${beat.blockRef.scriptId}:${beat.blockRef.blockId}`);
      if (!owner) return;
      const key = owner.block.textKey ?? scriptBlockTextKey(owner.scriptId, owner.block.id);
      next.push({
        nodeId: `beat:${event.id}:${beat.id}`,
        order: order.get(`beat:${event.id}:${beat.id}`) ?? "U",
        key,
        identifier: beat.id,
        kind: beat.kind === "speech" ? "Dialogue" : "Direction",
        dialogue,
        characterRef: owner.block.characterRef ?? owner.block.speakerRef,
        fallback: owner.block.content,
        block: owner,
      });
    };
    (event.dialogueBeats ?? []).forEach((beat) => addBeat(beat));
    (event.dialogues ?? []).forEach((dialogue) => {
      next.push({ nodeId: `dialogue:${event.id}:${dialogue.id}`, order: "", key: `dialogue.${dialogue.id}.title`, identifier: dialogue.id, kind: "Dialogue title", dialogue: dialogue.title, fallback: dialogue.title });
      (dialogue.beats ?? []).forEach((beat) => addBeat(beat, dialogue.title));
    });
    (event.decisions ?? []).forEach((decision) => {
      const nodeId = `decision:${event.id}:${decision.id}`;
      const dialogue = decision.dialogueId ? event.dialogues?.find((item) => item.id === decision.dialogueId)?.title : undefined;
      next.push({ nodeId, order: order.get(nodeId) ?? "U", key: `decision.${decision.id}.prompt`, identifier: decision.id, kind: "Decision", dialogue, fallback: decision.name });
      decision.outcomes.forEach((outcome, index) => {
        next.push({ nodeId, order: `${order.get(nodeId) ?? "U"}.${String.fromCharCode(65 + index)}`, key: `outcome.${outcome.id}.text`, identifier: outcome.id, kind: "Option", dialogue, fallback: decision.optionStyle === "followUpText" ? outcome.description || outcome.name : outcome.name });
        if (outcome.lockText?.content) next.push({ nodeId, order: `${order.get(nodeId) ?? "U"}.${String.fromCharCode(65 + index)}L`, key: `outcome.${outcome.id}.lock`, identifier: `${outcome.id}:lock`, kind: "Lock text", dialogue, fallback: outcome.lockText.content });
      });
    });
    return next.sort((left, right) => left.order.localeCompare(right.order, undefined, { numeric: true }));
  }, [blocks, event, order]);
  const visibleRows = rows.filter((row) => {
    const values = project.localizationCatalog?.entries[row.key]?.values ?? (row.block ? blockValues(project, row.block.scriptId, row.block.block, primaryLocale) : {});
    const matches = `${row.identifier} ${row.kind} ${row.dialogue ?? ""} ${Object.values(values).join(" ")}`.toLowerCase().includes(query.toLowerCase());
    return matches && (!missingOnly || languages.some((locale) => !(values[locale] ?? (locale === primaryLocale ? row.fallback : "")).trim()));
  });
  if (!event) return null;
  return <section className="event-script-workspace" aria-label={`Script for ${event.name}`}>
    <div className="canvas-modebar event-script-modebar">
      <nav className="canvas-breadcrumb" aria-label="Canvas path">
        {breadcrumb.map((item, index) => <span className="breadcrumb-crumb" key={`${item.label}:${index}`}>
          <button type="button" onClick={item.onClick}>
            {index === 0 ? <Home size={14} /> : <GitBranch size={14} />}
            <span>{item.label}</span>
          </button>
        </span>)}
        <span className="breadcrumb-crumb">
          <button type="button" className="active" aria-current="page">
            <FileText size={14} />
            <span>Script</span>
          </button>
        </span>
      </nav>
    </div>
    <header className="event-script-header">
      <button type="button" onClick={onClose}><ArrowLeft size={16} /> Canvas</button>
      <div><span>{event.name}</span><h2>Event Script</h2></div>
      <label className="event-script-search"><Search size={14} /><input value={query} onChange={(input) => setQuery(input.target.value)} placeholder="Search dialogue…" /></label>
      <button type="button" className={missingOnly ? "active" : ""} onClick={() => setMissingOnly((value) => !value)}><Filter size={14} /> Missing</button>
    </header>
    <div className="event-script-table-wrap">
      <table className="event-script-table">
        <thead><tr><th>Order</th><th>Identifier</th><th>Context</th><th>Character</th>{languages.map((locale) => <th key={locale}>{localeDisplayName(locale, localeNames)}{locale === primaryLocale ? <small>Primary</small> : null}</th>)}</tr></thead>
        <tbody>{visibleRows.map((row) => {
          const values = project.localizationCatalog?.entries[row.key]?.values ?? (row.block ? blockValues(project, row.block.scriptId, row.block.block, primaryLocale) : {});
          return <tr key={row.key} className={row.key === focusedTextKey ? "focused" : ""}>
            <td className="script-order">{row.order}</td>
            <td><strong>{row.identifier}</strong><small>{row.kind}</small></td>
            <td>{row.dialogue ?? "Event"}</td>
            <td>{row.block ? <select value={row.characterRef ?? ""} disabled={row.kind !== "Dialogue"} onChange={(input) => {
              const characterRef = input.target.value || undefined;
              onUpdateBlock(row.block!.scriptId, row.block!.block.id, { characterRef });
              if (characterRef && !presentEntityRefs.includes(characterRef)) {
                onUpdateEvent(event.id, { presentEntityRefs: [...presentEntityRefs, characterRef] });
              }
            }}><option value="">Narrator</option>{project.canonRefs.filter((ref) => presentEntityRefs.includes(ref.id) || ref.id === row.characterRef).map((ref) => <option value={ref.id} key={ref.id}>{ref.label ?? ref.id}</option>)}</select> : null}</td>
            {languages.map((locale) => <td key={locale}><textarea rows={2} value={values[locale] ?? (locale === primaryLocale ? row.fallback : "")} placeholder={locale === primaryLocale ? row.fallback : values[primaryLocale] || row.fallback} onChange={(input) => onUpdateText(row.key, locale, input.target.value)} /></td>)}
          </tr>;
        })}</tbody>
      </table>
    </div>
  </section>;
}
