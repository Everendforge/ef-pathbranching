import { BookOpen, ChevronDown, ChevronRight, CircleDot, FileImage, FileText, Film, FolderUp, MapPin, MoreHorizontal, Music, Package, Plus, Search, Trash2, UserRound, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { Selection } from "../appTypes.js";
import type { AssetKind, BranchingProject, CanonRef, LocalExplorerEntity, ProjectAsset, ProjectDataObject } from "../domain.js";
import { WorkspaceSidePanel } from "./WorkspaceSidePanel.js";

const CLICK_SEQUENCE_WINDOW_MS = 360;

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
  propertiesConfig,
  collapsed,
  onCollapsedChange,
  onContextMenu,
  onImport,
  selected,
  onSelect,
  onOpenInspector,
  onCreateEntity,
  onDeleteEntity,
  onInitializeProperties,
}: {
  project: BranchingProject;
  propertiesConfig?: Record<string, unknown>;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  onImport: () => void;
  selected?: Selection;
  onSelect: (selection: Selection) => void;
  onOpenInspector: (selection: Selection) => void;
  onCreateEntity: (type: string, name: string) => void;
  onDeleteEntity: (id: string) => void;
  onInitializeProperties?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AssetKind | "all">("all");
  const [origin, setOrigin] = useState<"all" | ProjectAsset["origin"]>("all");
  const [view, setView] = useState<"entities" | "files">("entities");
  const [itemFilter, setItemFilter] = useState<"all" | "canon" | "local" | "data">("all");
  const [newEntityType, setNewEntityType] = useState("concept");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [actionsForId, setActionsForId] = useState<{ id: string; top: number; left: number } | undefined>();
  const [isInitialized, setIsInitialized] = useState(false);
  const [createEntityMenu, setCreateEntityMenu] = useState<{ top: number; left: number } | undefined>();
  const [newEntityName, setNewEntityName] = useState("");
  const createEntityRef = useRef<HTMLDivElement | null>(null);
  const pendingInspectorClickRef = useRef<{ rowId: string; timer: number } | undefined>(undefined);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const assets = useMemo(
    () => (project.assets ?? []).filter((asset) =>
      (kind === "all" || asset.kind === kind) &&
      (origin === "all" || asset.origin === origin) &&
      (!deferredQuery || `${asset.name} ${asset.path} ${asset.tags?.join(" ") ?? ""}`.toLowerCase().includes(deferredQuery)),
    ),
    [deferredQuery, kind, origin, project.assets],
  );
  const allExplorerRows = useMemo(() => explorerRows(project), [project]);
  const propertyTypeMap = useMemo(() => new Map((project.localExplorerProperties ?? []).filter((prop) => prop.valueType === "entity-type").map((prop) => [prop.id, prop.label])), [project.localExplorerProperties]);
  const explorerTypes = useMemo(() => Array.from(new Set(["concept", ...allExplorerRows.filter((row) => row.kind !== "data").map((row) => row.type), ...(project.localExplorerTypes ?? []).map((type) => type.id), ...(project.localExplorerProperties ?? []).filter((prop) => prop.valueType === "entity-type").map((prop) => prop.id)])).sort((left, right) => {
    const labelLeft = propertyTypeMap.get(left) || left;
    const labelRight = propertyTypeMap.get(right) || right;
    return labelLeft.localeCompare(labelRight);
  }), [allExplorerRows, project.localExplorerTypes, project.localExplorerProperties, propertyTypeMap]);
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
      let group: string;
      if (row.kind === "data") {
        group = `Project Data · ${row.type.replace(/^data:/, "")}`;
      } else if (row.kind === "canon") {
        group = displayType(rootCanonType(row.value));
      } else {
        // Check if this type is an entity-type property
        group = propertyTypeMap.get(row.type) || displayType(row.type);
      }
      grouped.set(group, [...(grouped.get(group) ?? []), row]);
    });
    // Add empty groups for entity-type properties that don't have entities
    (project.localExplorerProperties ?? []).filter((prop) => prop.valueType === "entity-type").forEach((prop) => {
      if (!grouped.has(prop.label)) {
        grouped.set(prop.label, []);
      }
    });
    return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [allExplorerRows, deferredQuery, itemFilter, project.canonRefs, project.localExplorerProperties, propertyTypeMap]);

  useEffect(() => {
    if (!isInitialized) {
      setCollapsedGroups(new Set(explorerGroups.map(([group]) => group)));
      setIsInitialized(true);
    }
  }, [explorerGroups, isInitialized]);

  useEffect(() => {
    if (!createEntityMenu) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !createEntityRef.current?.contains(event.target)) {
        setCreateEntityMenu(undefined);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCreateEntityMenu(undefined);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [createEntityMenu]);

  useEffect(() => {
    if (!actionsForId) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      // Don't close if clicking inside the menu itself or the trigger button
      const actionsBtns = document.querySelectorAll(".explorer-row-actions .icon-only");
      const isTrigger = Array.from(actionsBtns).some((btn) => btn.contains(target));
      const menuEl = document.querySelector(".explorer-row-menu");
      const isMenu = menuEl?.contains(target);
      if (!isTrigger && !isMenu) setActionsForId(undefined);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionsForId(undefined);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [actionsForId]);

  const expandAllAssets = () => setCollapsedGroups(new Set());
  const collapseAllAssets = () => setCollapsedGroups(new Set(explorerGroups.map(([group]) => group)));

  const handleCreateEntity = () => {
    const trimmedName = newEntityName.trim();
    if (!trimmedName) return;
    onCreateEntity(newEntityType, trimmedName);
    setCreateEntityMenu(undefined);
    setNewEntityName("");
  };

  const clearPendingInspectorClick = () => {
    if (pendingInspectorClickRef.current) {
      window.clearTimeout(pendingInspectorClickRef.current.timer);
      pendingInspectorClickRef.current = undefined;
    }
  };

  const handleExplorerRowPointerDown = (row: ExplorerRow) => {
    clearPendingInspectorClick();
    const selection = explorerSelection(row);
    const timer = window.setTimeout(() => {
      onOpenInspector(selection);
      pendingInspectorClickRef.current = undefined;
    }, CLICK_SEQUENCE_WINDOW_MS);
    pendingInspectorClickRef.current = { rowId: row.id, timer };
  };

  const handleExplorerRowPointerUp = (row: ExplorerRow) => {
    if (pendingInspectorClickRef.current) {
      clearPendingInspectorClick();
      onSelect(explorerSelection(row));
    }
  };

  return (
    <WorkspaceSidePanel title="Assets" side="left" collapsed={collapsed} onCollapsedChange={onCollapsedChange} onContextMenu={onContextMenu}>
      <div className="explorer-view-tabs" role="tablist" aria-label="Asset views">
        <button type="button" className={view === "entities" ? "active" : ""} onClick={() => setView("entities")}>Entities</button>
        <button type="button" className={view === "files" ? "active" : ""} onClick={() => setView("files")}>Files</button>
      </div>
      {view === "entities" ? (
        <>
          <div className="explorer-toolbar">
            <label className="explorer-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search entities" /></label>
            <button type="button" title="New local entity" onClick={(event) => {
              if (createEntityMenu) {
                setCreateEntityMenu(undefined);
                return;
              }
              const rect = event.currentTarget.getBoundingClientRect();
              const width = 300;
              const height = 220;
              const viewportWidth = typeof window === "undefined" ? width + 24 : window.innerWidth;
              const viewportHeight = typeof window === "undefined" ? height + 24 : window.innerHeight;
              setCreateEntityMenu({
                top: Math.max(8, Math.min(rect.bottom + 4, viewportHeight - height - 8)),
                left: Math.max(8, Math.min(rect.right - width, viewportWidth - width - 8)),
              });
            }}><Plus size={15} /></button>
            <button type="button" title="Expand all entities" onClick={expandAllAssets}><ChevronDown size={15} /></button>
            <button type="button" title="Collapse all entities" onClick={collapseAllAssets}><ChevronRight size={15} /></button>
          </div>
          <div className="explorer-filter-row" role="tablist" aria-label="Entity origin filter">
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
                    return (
                      <div className="asset-explorer-tree-node" key={`${row.kind}:${row.id}`} style={{ "--asset-tree-depth": depth } as CSSProperties}>
                        <div className={`explorer-entity-row ${rowSelected ? "active" : ""}`}>
                          <button type="button" className="explorer-entity-open" title={row.label} draggable={row.kind !== "data"} onDragStart={(event) => {
                            if (row.kind === "data") return;
                            event.dataTransfer.setData("application/x-pathbranching-entity", row.id);
                            event.dataTransfer.setData("text/plain", row.id);
                            event.dataTransfer.effectAllowed = "copy";
                          }} onPointerDown={() => handleExplorerRowPointerDown(row)} onPointerUp={() => handleExplorerRowPointerUp(row)} onPointerLeave={clearPendingInspectorClick}>
                            <RowIcon size={14} />
                            <span className="explorer-entity-name">{row.label}</span>
                            <em className={`explorer-origin ${row.source.toLowerCase().replace(/\s+/g, "-")}`}>{row.source}</em>
                          </button>
                          {row.kind === "local" ? (
                            <div className="explorer-row-actions">
                              <button type="button" className="icon-only" title={`Actions for ${row.label}`} onClick={(event) => {
                                if (actionsForId?.id === row.id) { setActionsForId(undefined); return; }
                                const rect = event.currentTarget.getBoundingClientRect();
                                const width = 180;
                                const height = 80;
                                const viewportWidth = typeof window === "undefined" ? width + 24 : window.innerWidth;
                                const viewportHeight = typeof window === "undefined" ? height + 24 : window.innerHeight;
                                setActionsForId({
                                  id: row.id,
                                  top: Math.max(8, Math.min(rect.bottom + 4, viewportHeight - height - 8)),
                                  left: Math.max(8, Math.min(rect.right - width, viewportWidth - width - 8)),
                                });
                              }}>
                                <MoreHorizontal size={15} />
                              </button>
                              {actionsForId?.id === row.id ? (
                                <div className="explorer-row-menu" style={{ top: actionsForId.top, left: actionsForId.left }}>
                                  <button type="button" onClick={() => { onOpenInspector(explorerSelection(row)); setActionsForId(undefined); }}>Open inspector</button>
                                  <button type="button" className="danger" onClick={() => { onDeleteEntity(row.id); setActionsForId(undefined); }}>
                                    <Trash2 size={13} /> Delete local entity
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        {node.children.length ? (
                          <div className="asset-explorer-tree-children">
                            {node.children.map((child) => renderRow(child, depth + 1))}
                          </div>
                        ) : null}
                      </div>
                    );
                  };
                  return explorerRowTree(rows).map((node) => renderRow(node));
                })() : null}
              </section>;
            })}
            {explorerGroups.length === 0 && !propertiesConfig ? (
              <div className="empty-state" style={{ padding: "16px", textAlign: "center" }}>
                <span className="empty-line" style={{ display: "block", marginBottom: "12px" }}>No properties configured. Initialize to see canon references.</span>
                <button 
                  type="button" 
                  onClick={onInitializeProperties}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "14px"
                  }}
                >
                  <Plus size={14} style={{ marginRight: "6px", verticalAlign: "middle" }} />
                  Initialize Properties
                </button>
              </div>
            ) : explorerGroups.length === 0 ? (
              <span className="empty-line">No entities match this search.</span>
            ) : null}
          </div>
          {createEntityMenu ? (
            <div ref={createEntityRef} className="logic-property-editor explorer-create-menu" style={{ top: createEntityMenu.top, left: createEntityMenu.left }} role="dialog" aria-label="Create new entity">
              <header className="logic-property-editor-header">
                <span className="logic-property-editor-icon"><Plus size={15} /></span>
                <div><strong>New entity</strong><small>Declare type and name</small></div>
                <button type="button" className="icon-only" aria-label="Close create entity menu" onClick={() => setCreateEntityMenu(undefined)}><X size={15} /></button>
              </header>
              <div className="modal-body">
                <label className="field-label">
                  <span>Name</span>
                  <input
                    type="text"
                    value={newEntityName}
                    onChange={(e) => setNewEntityName(e.target.value)}
                    placeholder="Entity name"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateEntity();
                    }}
                  />
                </label>
                <label className="field-label">
                  <span>Type</span>
                  <select value={newEntityType} onChange={(event) => setNewEntityType(event.target.value)}>
                    {explorerTypes.map((type) => <option key={type} value={type}>{propertyTypeMap.get(type) || displayType(type)}</option>)}
                  </select>
                </label>
              </div>
              <footer className="modal-footer">
                <button type="button" onClick={() => setCreateEntityMenu(undefined)}>Cancel</button>
                <button type="button" className="primary" onClick={handleCreateEntity} disabled={!newEntityName.trim()}>Create</button>
              </footer>
            </div>
          ) : null}
        </>
      ) : (
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
      )}
    </WorkspaceSidePanel>
  );
}
