import { FileImage, FileText, Film, FolderUp, Music, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import type { AssetKind, BranchingProject, ProjectAsset } from "../domain.js";
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

export function AssetsPanel({
  project,
  collapsed,
  onCollapsedChange,
  onContextMenu,
  onImport,
}: {
  project: BranchingProject;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onContextMenu: (event: React.MouseEvent<HTMLElement>) => void;
  onImport: () => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AssetKind | "all">("all");
  const [origin, setOrigin] = useState<"all" | ProjectAsset["origin"]>("all");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const assets = useMemo(
    () => (project.assets ?? []).filter((asset) =>
      (kind === "all" || asset.kind === kind) &&
      (origin === "all" || asset.origin === origin) &&
      (!deferredQuery || `${asset.name} ${asset.path} ${asset.tags?.join(" ") ?? ""}`.toLowerCase().includes(deferredQuery)),
    ),
    [deferredQuery, kind, origin, project.assets],
  );

  return (
    <WorkspaceSidePanel title="Assets" side="left" collapsed={collapsed} onCollapsedChange={onCollapsedChange} onContextMenu={onContextMenu}>
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
    </WorkspaceSidePanel>
  );
}
