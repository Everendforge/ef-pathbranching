import {
  BookOpen,
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleDot,
  MapPin,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  useDeferredValue,
  useMemo,
  useState,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Selection } from "../appTypes.js";
import type {
  BranchingProject,
  CanonRef,
  LocalExplorerEntity,
  ProjectDataObject,
} from "../domain.js";
import {
  canonExplorerProperties,
  canonExplorerTypes,
} from "../explorerSchema.js";

type ExplorerRow =
  | {
      kind: "canon";
      id: string;
      type: string;
      label: string;
      search: string;
      source: "Canon";
      value: CanonRef;
    }
  | {
      kind: "local";
      id: string;
      type: string;
      label: string;
      search: string;
      source: "Local" | "Published";
      value: LocalExplorerEntity;
    }
  | {
      kind: "data";
      id: string;
      type: string;
      label: string;
      search: string;
      source: "Project Data";
      value: ProjectDataObject;
    };

function displayType(value: string) {
  return (
    value
      .split(/[-_:]/g)
      .filter(Boolean)
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(" ") || "Entity"
  );
}

function iconForType(type: string): ComponentType<{ size?: number }> {
  const normalized = type.toLowerCase();
  if (normalized.includes("character") || normalized.includes("speaker"))
    return UserRound;
  if (normalized.includes("location") || normalized.includes("scene"))
    return MapPin;
  if (normalized.includes("item") || normalized.includes("inventory"))
    return Package;
  if (normalized.includes("data") || normalized.includes("runtime"))
    return Boxes;
  if (normalized.includes("concept") || normalized.includes("knowledge"))
    return BookOpen;
  return CircleDot;
}

function toRows(project: BranchingProject): ExplorerRow[] {
  return [
    ...project.canonRefs.map((ref) => ({
      kind: "canon" as const,
      id: ref.id,
      type: ref.kind ?? "canon",
      label: ref.label ?? ref.id,
      search: [
        ref.id,
        ref.label,
        ref.kind,
        ...(ref.aliases ?? []),
        ...(ref.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      source: "Canon" as const,
      value: ref,
    })),
    ...(project.localExplorerEntities ?? []).map((entity) => ({
      kind: "local" as const,
      id: entity.id,
      type: entity.type,
      label: entity.name,
      search: [
        entity.id,
        entity.name,
        entity.type,
        ...(entity.aliases ?? []),
        ...(entity.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      source: (entity.publishedPath ? "Published" : "Local") as
        "Local" | "Published",
      value: entity,
    })),
    ...(project.projectDataObjects ?? []).map((data) => ({
      kind: "data" as const,
      id: data.id,
      type: `data:${data.classId}`,
      label: data.name,
      search: [data.id, data.name, data.classId, ...(data.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      source: "Project Data" as const,
      value: data,
    })),
  ];
}

function explorerSelection(row: ExplorerRow): Selection {
  if (row.kind === "canon") return { type: "canon", id: row.id };
  if (row.kind === "local") return { type: "explorerEntity", id: row.id };
  return { type: "dataObject", id: row.id };
}

export function ExplorerPanel({
  project,
  propertiesConfig,
  open,
  selected,
  onToggle,
  onSelect,
  onCreateEntity,
  onDeleteEntity,
  onCreateType,
  onCreateProperty,
  onResize,
  onResetWidth,
  onResizeStateChange,
}: {
  project: BranchingProject;
  propertiesConfig?: Record<string, unknown>;
  open: boolean;
  selected?: Selection;
  onToggle: () => void;
  onSelect: (selection: Selection) => void;
  onCreateEntity: (type: string) => void;
  onDeleteEntity: (id: string) => void;
  onCreateType: () => void;
  onCreateProperty: () => void;
  onResize: (width: number) => void;
  onResetWidth: () => void;
  onResizeStateChange: (resizing: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "canon" | "local" | "data">(
    "all",
  );
  const [newType, setNewType] = useState("concept");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [actionsForId, setActionsForId] = useState<string>();
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const rows = useMemo(() => toRows(project), [project]);
  const canonTypes = useMemo(
    () => canonExplorerTypes(propertiesConfig),
    [propertiesConfig],
  );
  const canonProperties = useMemo(
    () => canonExplorerProperties(propertiesConfig),
    [propertiesConfig],
  );
  const types = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...rows.filter((row) => row.kind !== "data").map((row) => row.type),
            ...canonTypes.map((type) => type.id),
            ...(project.localExplorerTypes ?? []).map((type) => type.id),
          ],
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [canonTypes, project.localExplorerTypes, rows],
  );
  const visibleRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (filter === "all" || row.kind === filter) &&
          (!deferredQuery || row.search.includes(deferredQuery)),
      ),
    [deferredQuery, filter, rows],
  );
  const groups = useMemo(() => {
    const map = new Map<string, ExplorerRow[]>();
    visibleRows.forEach((row) => {
      const key =
        row.kind === "data"
          ? `Project Data · ${row.type.replace(/^data:/, "")}`
          : displayType(row.type);
      map.set(key, [...(map.get(key) ?? []), row]);
    });
    return Array.from(map.entries()).sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }, [visibleRows]);

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth =
      event.currentTarget.closest(".side-panel")?.getBoundingClientRect()
        .width ?? 360;
    onResizeStateChange(true);
    const move = (moveEvent: PointerEvent) =>
      onResize(startWidth + moveEvent.clientX - startX);
    const end = () => {
      onResizeStateChange(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  if (!open) {
    return (
      <aside className="side-rail">
        <button type="button" title="Open Explorer" onClick={onToggle}>
          <span>Explorer</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="side-panel explorer-panel">
      <div className="panel-title">
        <strong>Explorer</strong>
        <button type="button" title="Collapse Explorer" onClick={onToggle}>
          ‹
        </button>
      </div>
      <div className="explorer-toolbar">
        <label className="explorer-search">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Explorer"
          />
        </label>
        <select
          value={newType}
          onChange={(event) => setNewType(event.target.value)}
          aria-label="New entity type"
        >
          {Array.from(new Set(["concept", ...types])).map((type) => (
            <option key={type} value={type}>
              {displayType(type)}
            </option>
          ))}
        </select>
        <button
          type="button"
          title="New local entity"
          onClick={() => onCreateEntity(newType)}
        >
          <Plus size={15} />
        </button>
      </div>
      <div
        className="explorer-filter-row"
        role="tablist"
        aria-label="Explorer origin filter"
      >
        {(["all", "canon", "local", "data"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
          >
            {value === "all"
              ? "All"
              : value === "data"
                ? "Data"
                : value === "canon"
                  ? "Canon"
                  : "Local"}
          </button>
        ))}
      </div>
      <div className="explorer-schema-actions">
        <strong>Schema</strong>
        <button type="button" onClick={onCreateType} title="New local type">
          <Plus size={13} /> Type
        </button>
        <button
          type="button"
          onClick={onCreateProperty}
          title="New local property"
        >
          <Plus size={13} /> Property
        </button>
      </div>
      <div className="explorer-tree">
        {groups.map(([group, groupRows]) => {
          const isExpanded = !collapsedGroups.has(group);
          const Icon = iconForType(group);
          return (
            <section className="explorer-type-group" key={group}>
              <button
                type="button"
                className="explorer-type-heading"
                onClick={() =>
                  setCollapsedGroups((current) => {
                    const next = new Set(current);
                    if (next.has(group)) next.delete(group);
                    else next.add(group);
                    return next;
                  })
                }
              >
                {isExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
                <Icon size={14} />
                <strong>{group}</strong>
                <span>{groupRows.length}</span>
              </button>
              {isExpanded
                ? groupRows.map((row) => {
                    const selectedRow =
                      selected?.id === row.id &&
                      ((row.kind === "canon" && selected?.type === "canon") ||
                        (row.kind === "local" &&
                          selected?.type === "explorerEntity") ||
                        (row.kind === "data" &&
                          selected?.type === "dataObject"));
                    const RowIcon = iconForType(row.type);
                    return (
                      <div
                        className={`explorer-entity-row ${selectedRow ? "active" : ""}`}
                        key={`${row.kind}:${row.id}`}
                      >
                        <button
                          type="button"
                          className="explorer-entity-open"
                          title={row.label}
                          onClick={() => onSelect(explorerSelection(row))}
                        >
                          <RowIcon size={14} />
                          <span className="explorer-entity-name">
                            {row.label}
                          </span>
                          <em
                            className={`explorer-origin ${row.source.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            {row.source}
                          </em>
                        </button>
                        {row.kind === "local" ? (
                          <div className="explorer-row-actions">
                            <button
                              type="button"
                              className="icon-only"
                              title={`Actions for ${row.label}`}
                              aria-label={`Actions for ${row.label}`}
                              onClick={() =>
                                setActionsForId((current) =>
                                  current === row.id ? undefined : row.id,
                                )
                              }
                            >
                              <MoreHorizontal size={15} />
                            </button>
                            {actionsForId === row.id ? (
                              <div className="explorer-row-menu">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSelect(explorerSelection(row));
                                    setActionsForId(undefined);
                                  }}
                                >
                                  Open inspector
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() => {
                                    onDeleteEntity(row.id);
                                    setActionsForId(undefined);
                                  }}
                                >
                                  <Trash2 size={13} /> Delete local entity
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                : null}
            </section>
          );
        })}
        <section className="explorer-schema-list">
          <strong>Types</strong>
          {[...canonTypes, ...(project.localExplorerTypes ?? [])].map((type) => {
            const source = "createdAt" in type ? "local" : "canon";
            return (
              <button
                type="button"
                key={`${source}:${type.id}`}
                onClick={() => onSelect({ type: "explorerType", id: type.id, source })}
              >
                <CircleDot size={13} />
                <span>{type.label}</span>
                <em className={`explorer-origin ${source}`}>{source}</em>
              </button>
            );
          })}
        </section>
        <section className="explorer-schema-list">
          <strong>Properties</strong>
          {[...canonProperties, ...(project.localExplorerProperties ?? [])].map(
            (property) => {
              const source = "createdAt" in property ? "local" : "canon";
              return (
                <button
                  type="button"
                  key={`${source}:${property.id}`}
                  onClick={() =>
                    onSelect({
                      type: "explorerProperty",
                      id: property.id,
                      source,
                    })
                  }
                >
                  <Boxes size={13} />
                  <span>{property.label}</span>
                  <em className={`explorer-origin ${source}`}>{source}</em>
                </button>
              );
            },
          )}
        </section>
        {groups.length === 0 ? (
          <span className="empty-line">
            No Explorer items match this search.
          </span>
        ) : null}
      </div>
      <button
        type="button"
        className="resize-handle"
        aria-label="Resize Explorer"
        title="Resize Explorer"
        onPointerDown={startResize}
        onDoubleClick={onResetWidth}
      />
    </aside>
  );
}
