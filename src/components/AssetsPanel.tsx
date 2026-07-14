import { BookOpen, ChevronDown, ChevronRight, CircleDot, FileImage, FileText, Film, FolderUp, MapPin, MoreHorizontal, Music, Package, Plus, ScrollText, Search, Trash2, UserRound } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState, type ComponentType, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { Selection } from "../appTypes.js";
import type { AssetKind, BranchingProject, CanonRef, LocalExplorerEntity, ProjectAsset, ProjectDataObject, ScriptBlock } from "../domain.js";
import { canonRefHasRole } from "../integrationConfig.js";
import { WorkspaceSidePanel } from "./WorkspaceSidePanel.js";

const kinds: Array<{ id: AssetKind | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "image", label: "Images" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "document", label: "Documents" },
  { id: "other", label: "Other" },
];

function iconFor(kind: AssetKind) {
  if (kind === "image") return <FileImage size={15} />;
  if (kind === "video") return <Film size={15} />;
  if (kind === "audio") return <Music size={15} />;
  return <FileText size={15} />;
}

type ExplorerRow =
  | { kind: "canon"; id: string; type: string; label: string; search: string; source: "Canon"; value: CanonRef; parentId?: string }
  | { kind: "local"; id: string; type: string; label: string; search: string; source: "Local" | "Published"; value: LocalExplorerEntity }
  | { kind: "data"; id: string; type: string; label: string; search: string; source: "Project Data"; value: ProjectDataObject };

function displayType(value: string) {
  return value.split(/[-_:]/g).filter(Boolean).map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ") || "Entity";
}

function explorerIconFor(type: string): ComponentType<{ size?: number }> {
  const normalized = type.toLowerCase();
  if (normalized.includes("character") || normalized.includes("speaker")) return UserRound;
  if (normalized.includes("location") || normalized.includes("scene")) return MapPin;
  if (normalized.includes("item") || normalized.includes("inventory")) return Package;
  if (normalized.includes("data") || normalized.includes("runtime")) return FileText;
  if (normalized.includes("concept") || normalized.includes("knowledge")) return BookOpen;
  return CircleDot;
}

function explorerRows(project: BranchingProject): ExplorerRow[] {
  return [
    ...project.canonRefs.map((ref) => ({ kind: "canon" as const, id: ref.id, type: ref.kind ?? "canon", label: ref.label ?? ref.id, search: [ref.id, ref.label, ref.kind, ...(ref.aliases ?? []), ...(ref.tags ?? [])].filter(Boolean).join(" ").toLowerCase(), source: "Canon" as const, value: ref, parentId: ref.parentId })),
    ...(project.localExplorerEntities ?? []).map((entity) => ({ kind: "local" as const, id: entity.id, type: entity.type, label: entity.name, search: [entity.id, entity.name, entity.type, ...(entity.aliases ?? []), ...(entity.tags ?? [])].filter(Boolean).join(" ").toLowerCase(), source: (entity.publishedPath ? "Published" : "Local") as "Local" | "Published", value: entity })),
    ...(project.projectDataObjects ?? []).map((data) => ({ kind: "data" as const, id: data.id, type: `data:${data.classId}`, label: data.name, search: [data.id, data.name, data.classId, ...(data.tags ?? [])].filter(Boolean).join(" ").toLowerCase(), source: "Project Data" as const, value: data })),
  ];
}

function explorerSelection(row: ExplorerRow): Selection {
  if (row.kind === "canon") return { type: "canon", id: row.id };
  if (row.kind === "local") return { type: "explorerEntity", id: row.id };
  return { type: "dataObject", id: row.id };
}

type ExplorerTreeNode = { row: ExplorerRow; children: ExplorerTreeNode[] };

function explorerRowTree(rows: ExplorerRow[]): ExplorerTreeNode[] {
  const byId = new Map<string, ExplorerTreeNode>(rows.map((row) => [row.id, { row, children: [] }]));
  const roots: ExplorerTreeNode[] = [];
  byId.forEach((node) => {
    const parent = node.row.kind === "canon" && node.row.parentId ? byId.get(node.row.parentId) : undefined;
    if (parent) parent.children.push(node); else roots.push(node);
  });
  const sort = (nodes: ExplorerTreeNode[]) => {
    nodes.sort((left, right) => left.row.label.localeCompare(right.row.label));
    nodes.forEach((node) => sort(node.children));
  };
  sort(roots);
  return roots;
}

export function AssetsPanel({
  project,
  collapsed,
  onCollapsedChange,
  onContextMenu,
  onImport,
  onCreateScript,
  onUpdateScript,
  onAddScriptBlock,
  onUpdateScriptBlock,
  onInsertScriptBlock,
  focusScriptBlock,
  selected,
  onSelect,
  onCreateEntity,
  onDeleteEntity,
  onCreateType,
}: {
  project: BranchingProject;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  onImport: () => void;
  onCreateScript: () => void;
  onUpdateScript: (scriptId: string, updates: { name?: string }) => void;
  onAddScriptBlock: (scriptId: string, kind: ScriptBlock["kind"]) => void;
  onUpdateScriptBlock: (scriptId: string, blockId: string, updates: Partial<ScriptBlock>) => void;
  onInsertScriptBlock: (scriptId: string, blockId: string, eventId: string, dialogueId: string) => void;
  focusScriptBlock?: { scriptId: string; blockId: string };
  selected?: Selection;
  onSelect: (selection: Selection) => void;
  onCreateEntity: (type: string) => void;
  onDeleteEntity: (id: string) => void;
  onCreateType: () => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AssetKind | "all">("all");
  const [origin, setOrigin] = useState<"all" | ProjectAsset["origin"]>("all");
  const [view, setView] = useState<"items" | "files" | "scripts">("items");
  const [itemFilter, setItemFilter] = useState<"all" | "canon" | "local" | "data">("all");
  const [newEntityType, setNewEntityType] = useState("concept");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [actionsForId, setActionsForId] = useState<string>();
  const [selectedScriptId, setSelectedScriptId] = useState<string>();
  const [dialogueTarget, setDialogueTarget] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const assets = useMemo(
    () => (project.assets ?? []).filter((asset) =>
      (kind === "all" || asset.kind === kind) &&
      (origin === "all" || asset.origin === origin) &&
      (!deferredQuery || `${asset.name} ${asset.path} ${asset.tags?.join(" ") ?? ""}`.toLowerCase().includes(deferredQuery)),
    ),
    [deferredQuery, kind, origin, project.assets],
  );
  const scripts = project.scriptDocuments ?? [];
  const selectedScript = scripts.find((script) => script.id === selectedScriptId) ?? scripts[0];
  useEffect(() => {
    if (!focusScriptBlock) return;
    setView("scripts");
    setSelectedScriptId(focusScriptBlock.scriptId);
    const frame = window.requestAnimationFrame(() => {
      const key = `${focusScriptBlock.scriptId}:${focusScriptBlock.blockId}`;
      document.querySelector(`[data-script-block-key="${CSS.escape(key)}"]`)?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusScriptBlock]);
  const speakers = project.canonRefs.filter((ref) => canonRefHasRole(project, ref, "speaker"));
  const dialogueTargets = project.events.flatMap((event) =>
    (event.dialogues ?? []).map((dialogue) => ({
      value: `${event.id}|${dialogue.id}`,
      label: `${event.name} · ${dialogue.title}`,
    })),
  );
  const allExplorerRows = useMemo(() => explorerRows(project), [project]);
  const explorerTypes = useMemo(() => Array.from(new Set(["concept", ...allExplorerRows.filter((row) => row.kind !== "data").map((row) => row.type), ...(project.localExplorerTypes ?? []).map((type) => type.id)])).sort((left, right) => left.localeCompare(right)), [allExplorerRows, project.localExplorerTypes]);
  const explorerGroups = useMemo(() => {
    const grouped = new Map<string, ExplorerRow[]>();
    const canonById = new Map(project.canonRefs.map((ref) => [ref.id, ref]));
    const rootCanonType = (ref: CanonRef) => {
      let current = ref;
      const seen = new Set<string>();
      while (current.parentId && !seen.has(current.id)) {
        seen.add(current.id);
        const parent = canonById.get(current.parentId);
        if (!parent) break;
        current = parent;
      }
      return current.kind ?? ref.kind ?? "canon";
    };
    allExplorerRows.filter((row) => (itemFilter === "all" || row.kind === itemFilter) && (!deferredQuery || row.search.includes(deferredQuery))).forEach((row) => {
      const group = row.kind === "data" ? `Project Data · ${row.type.replace(/^data:/, "")}` : row.kind === "canon" ? displayType(rootCanonType(row.value)) : displayType(row.type);
      grouped.set(group, [...(grouped.get(group) ?? []), row]);
    });
    return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [allExplorerRows, deferredQuery, itemFilter, project.canonRefs]);

  return (
    <WorkspaceSidePanel title="Assets" side="left" collapsed={collapsed} onCollapsedChange={onCollapsedChange} onContextMenu={onContextMenu}>
      <div className="explorer-view-tabs" role="tablist" aria-label="Asset views">
        <button type="button" className={view === "items" ? "active" : ""} onClick={() => setView("items")}>Items</button>
        <button type="button" className={view === "files" ? "active" : ""} onClick={() => setView("files")}>Files</button>
        <button type="button" className={view === "scripts" ? "active" : ""} onClick={() => setView("scripts")}>Scripts</button>
      </div>
      {view === "items" ? (
        <>
          <div className="explorer-toolbar">
            <label className="explorer-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items" /></label>
            <select value={newEntityType} onChange={(event) => setNewEntityType(event.target.value)} aria-label="New entity type">
              {explorerTypes.map((type) => <option key={type} value={type}>{displayType(type)}</option>)}
            </select>
            <button type="button" title="New local entity" onClick={() => onCreateEntity(newEntityType)}><Plus size={15} /></button>
            <button type="button" title="New local item type" onClick={onCreateType}>Type</button>
          </div>
          <div className="explorer-filter-row" role="tablist" aria-label="Item origin filter">
            {(["all", "canon", "local", "data"] as const).map((value) => <button key={value} type="button" className={itemFilter === value ? "active" : ""} onClick={() => setItemFilter(value)}>{value === "all" ? "All" : value === "data" ? "Data" : value === "canon" ? "Canon" : "Local"}</button>)}
          </div>
          <div className="explorer-tree asset-explorer-tree">
            {explorerGroups.map(([group, rows]) => {
              const expanded = !collapsedGroups.has(group);
              const GroupIcon = explorerIconFor(group);
              return <section className="explorer-type-group" key={group}>
                <button type="button" className="explorer-type-heading" onClick={() => setCollapsedGroups((current) => { const next = new Set(current); if (next.has(group)) next.delete(group); else next.add(group); return next; })}>
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<GroupIcon size={14} /><strong>{group}</strong><span>{rows.length}</span>
                </button>
                {expanded ? (() => {
                  const renderRow = (node: ExplorerTreeNode, depth = 0): ReactNode => {
                    const row = node.row;
                  const rowSelected = selected?.id === row.id && ((row.kind === "canon" && selected.type === "canon") || (row.kind === "local" && selected.type === "explorerEntity") || (row.kind === "data" && selected.type === "dataObject"));
                  const RowIcon = explorerIconFor(row.type);
                  return <div className="asset-explorer-tree-node" key={`${row.kind}:${row.id}`} style={{ "--asset-tree-depth": depth } as CSSProperties}><div className={`explorer-entity-row ${rowSelected ? "active" : ""}`}>
                    <button type="button" className="explorer-entity-open" title={row.label} onClick={() => onSelect(explorerSelection(row))}><RowIcon size={14} /><span className="explorer-entity-name">{row.label}</span><em className={`explorer-origin ${row.source.toLowerCase().replace(/\s+/g, "-")}`}>{row.source}</em></button>
                    {row.kind === "local" ? <div className="explorer-row-actions"><button type="button" className="icon-only" title={`Actions for ${row.label}`} onClick={() => setActionsForId((current) => current === row.id ? undefined : row.id)}><MoreHorizontal size={15} /></button>{actionsForId === row.id ? <div className="explorer-row-menu"><button type="button" onClick={() => { onSelect(explorerSelection(row)); setActionsForId(undefined); }}>Open inspector</button><button type="button" className="danger" onClick={() => { onDeleteEntity(row.id); setActionsForId(undefined); }}><Trash2 size={13} /> Delete local entity</button></div> : null}</div> : null}
                  </div>{node.children.length ? <div className="asset-explorer-tree-children">{node.children.map((child) => renderRow(child, depth + 1))}</div> : null}</div>;
                  };
                  return explorerRowTree(rows).map((node) => renderRow(node));
                })() : null}
              </section>;
            })}
            {explorerGroups.length === 0 ? <span className="empty-line">No items match this search.</span> : null}
          </div>
        </>
      ) : view === "files" ? (
        <>
          <div className="panel-toolbar asset-toolbar">
            <label className="asset-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assets" /></label>
            <button type="button" onClick={onImport}><FolderUp size={14} /> Import</button>
          </div>
          <div className="asset-filters">
            <select value={kind} onChange={(event) => setKind(event.target.value as AssetKind | "all")} aria-label="Asset category">
              {kinds.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <select value={origin} onChange={(event) => setOrigin(event.target.value as "all" | ProjectAsset["origin"])} aria-label="Asset origin">
              <option value="all">Canon + UnCanon</option><option value="canon">Canon</option><option value="uncanon">UnCanon</option>
            </select>
          </div>
          <div className="asset-list">
            {assets.map((asset) => <article className="asset-row" key={asset.id}>
              {iconFor(asset.kind)}
              <div><strong>{asset.name}</strong><span>{asset.origin === "canon" ? "Canon · read-only" : "UnCanon"} · {asset.kind}</span></div>
            </article>)}
            {assets.length === 0 ? <p className="panel-empty">No matching assets. Imported files remain UnCanon until an explicit publication flow exists.</p> : null}
          </div>
        </>
      ) : (
        <div className="script-assets-view">
          <div className="panel-toolbar">
            <strong>Structured scripts</strong>
            <button type="button" onClick={onCreateScript}><Plus size={14} /> Script</button>
          </div>
          <div className="script-document-tabs">
            {scripts.map((script) => (
              <button key={script.id} type="button" className={selectedScript?.id === script.id ? "active" : ""} onClick={() => setSelectedScriptId(script.id)}>
                <ScrollText size={13} /> {script.name}
              </button>
            ))}
          </div>
          {selectedScript ? (
            <div className="script-document-editor">
              <label className="field-label">
                Script name
                <input value={selectedScript.name} onChange={(event) => onUpdateScript(selectedScript.id, { name: event.target.value })} />
              </label>
              <div className="script-block-actions">
                {(["scene", "direction", "speech", "annotation"] as const).map((blockKind) => (
                  <button key={blockKind} type="button" onClick={() => onAddScriptBlock(selectedScript.id, blockKind)}>+ {blockKind}</button>
                ))}
              </div>
              <div className="script-block-list">
                {selectedScript.blocks.map((block) => (
                  <article className={`script-block ${block.kind}`} data-script-block-key={`${selectedScript.id}:${block.id}`} key={block.id}>
                    <span>{block.kind}</span>
                    {block.kind === "speech" ? (
                      <select value={block.speakerRef ?? ""} onChange={(event) => onUpdateScriptBlock(selectedScript.id, block.id, { speakerRef: event.target.value || undefined })}>
                        <option value="">Narrador</option>
                        {speakers.map((speaker) => <option key={speaker.id} value={speaker.id}>{speaker.label ?? speaker.id}</option>)}
                      </select>
                    ) : null}
                    <textarea rows={block.kind === "scene" ? 2 : 4} value={block.content} onChange={(event) => onUpdateScriptBlock(selectedScript.id, block.id, { content: event.target.value })} />
                    <div className="script-block-insert">
                      <select value={dialogueTarget} onChange={(event) => setDialogueTarget(event.target.value)} aria-label="Dialogue target">
                        <option value="">Insert into dialogue…</option>
                        {dialogueTargets.map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}
                      </select>
                      <button
                        type="button"
                        disabled={!dialogueTarget}
                        onClick={() => {
                          const [eventId, dialogueId] = dialogueTarget.split("|");
                          if (eventId && dialogueId) onInsertScriptBlock(selectedScript.id, block.id, eventId, dialogueId);
                        }}
                      >
                        Insert node
                      </button>
                    </div>
                  </article>
                ))}
                {selectedScript.blocks.length === 0 ? <p className="panel-empty">Add a structured block, then insert it into a dialogue canvas.</p> : null}
              </div>
            </div>
          ) : <p className="panel-empty">Create a script to build the shared narrative text raccord.</p>}
        </div>
      )}
    </WorkspaceSidePanel>
  );
}
