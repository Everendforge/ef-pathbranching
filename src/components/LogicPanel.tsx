import { ChevronDown, ChevronRight, ChevronUp, CircleDot, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { Selection } from "../appTypes.js";
import type { BranchingProject, LogicVariable, LogicVariableGroup, LogicVariableType } from "../domain.js";
import { canonExplorerProperties, type CanonExplorerProperty } from "../explorerSchema.js";
import { WorkspaceSidePanel } from "./WorkspaceSidePanel.js";

const types: LogicVariableType[] = ["text", "number", "boolean", "list", "canonRef"];

export function LogicPanel({ project, propertiesConfig, collapsed, onCollapsedChange, onContextMenu, onUpdate, selected, onSelect, onCreateProperty }: {
  project: BranchingProject; propertiesConfig?: Record<string, unknown>; collapsed: boolean; onCollapsedChange: (collapsed: boolean) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void; onUpdate: (project: BranchingProject) => void;
  selected?: Selection; onSelect: (selection: Selection) => void; onCreateProperty: () => void;
}) {
  const [tab, setTab] = useState<"properties" | "variables">("properties");
  const [collapsedSources, setCollapsedSources] = useState<Set<"canon" | "local">>(() => new Set());
  const groups = [...(project.logicVariableGroups ?? [])].sort((a, b) => a.order - b.order);
  const canonProperties = useMemo(() => canonExplorerProperties(propertiesConfig), [propertiesConfig]);
  const localProperties = project.localExplorerProperties ?? [];
  const updateGroups = (next: LogicVariableGroup[]) => onUpdate({ ...project, logicVariableGroups: next });
  const updateVariables = (next: LogicVariable[]) => onUpdate({ ...project, logicVariables: next });
  const addGroup = () => updateGroups([...groups, { id: `group:${crypto.randomUUID()}`, name: `Group ${groups.length + 1}`, order: groups.length }]);
  const addVariable = (groupId: string) => updateVariables([...(project.logicVariables ?? []), { id: `variable:${crypto.randomUUID()}`, name: `variable_${(project.logicVariables?.length ?? 0) + 1}`, type: "text", value: "", groupId }]);
  const variableValue = (variable: LogicVariable) => variable.type === "list" && Array.isArray(variable.value) ? variable.value.join(", ") : String(variable.value);
  const updateVariable = (id: string, changes: Partial<LogicVariable>) => updateVariables((project.logicVariables ?? []).map((variable) => variable.id === id ? { ...variable, ...changes } : variable));
  const toggleSource = (source: "canon" | "local") => setCollapsedSources((current) => { const next = new Set(current); if (next.has(source)) next.delete(source); else next.add(source); return next; });
  const propertySelected = (id: string, source: "canon" | "local") => selected?.type === "explorerProperty" && selected.id === id && selected.source === source;
  const renderCanonProperty = (property: CanonExplorerProperty, depth = 0): ReactNode => <div className="logic-property-tree-node" key={property.id} style={{ "--property-depth": depth } as CSSProperties}>
    <button type="button" className={`explorer-entity-open logic-property-row ${propertySelected(property.id, "canon") ? "active" : ""}`} onClick={() => onSelect({ type: "explorerProperty", id: property.id, source: "canon" })}><CircleDot size={14} /><span className="explorer-entity-name">{property.label}</span><em className="explorer-origin canon">{property.valueType}</em></button>
    {property.children.length ? <div className="logic-property-children">{property.children.map((child) => renderCanonProperty(child, depth + 1))}</div> : null}
  </div>;

  return <WorkspaceSidePanel title="Logic" side="left" collapsed={collapsed} onCollapsedChange={onCollapsedChange} onContextMenu={onContextMenu}>
    <div className="explorer-view-tabs" role="tablist" aria-label="Logic views">
      <button type="button" role="tab" aria-selected={tab === "properties"} className={tab === "properties" ? "active" : ""} onClick={() => setTab("properties")}>Properties</button>
      <button type="button" role="tab" aria-selected={tab === "variables"} className={tab === "variables" ? "active" : ""} onClick={() => setTab("variables")}>Variables</button>
    </div>
    {tab === "properties" ? <>
      <div className="panel-toolbar"><strong>Property schema</strong><button type="button" onClick={onCreateProperty}><Plus size={14} /> Property</button></div>
      <p className="inspector-connection-hint">Select a property to edit its schema and Pathbranching capabilities in the inspector.</p>
      <div className="explorer-tree logic-property-tree">
        {(["canon", "local"] as const).map((source) => {
          const properties = source === "canon" ? canonProperties : localProperties;
          const expanded = !collapsedSources.has(source);
          return <section className="explorer-type-group" key={source}>
            <button type="button" className="explorer-type-heading" onClick={() => toggleSource(source)}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<CircleDot size={14} /><strong>{source === "canon" ? "Canon properties" : "Local properties"}</strong><span>{properties.length}</span></button>
            {expanded ? source === "canon" ? canonProperties.map((property) => renderCanonProperty(property)) : properties.map((property) => <button type="button" key={property.id} className={`explorer-entity-open logic-property-row ${propertySelected(property.id, source) ? "active" : ""}`} onClick={() => onSelect({ type: "explorerProperty", id: property.id, source })}><CircleDot size={14} /><span className="explorer-entity-name">{property.label}</span><em className={`explorer-origin ${source}`}>{property.valueType}</em></button>) : null}
            {expanded && properties.length === 0 ? <span className="empty-line">No {source} properties.</span> : null}
          </section>;
        })}
      </div>
    </> : <>
      <div className="panel-toolbar"><strong>Variables</strong><button type="button" onClick={addGroup}><Plus size={14} /> Group</button></div>
      <div className="logic-groups">{groups.map((group, index) => <section className="logic-group" key={group.id}>
        <header><input aria-label="Group name" value={group.name} onChange={(event) => updateGroups(groups.map((item) => item.id === group.id ? { ...item, name: event.target.value } : item))} /><button type="button" disabled={index === 0} onClick={() => updateGroups(groups.map((item, position) => position === index ? { ...item, order: index - 1 } : position === index - 1 ? { ...item, order: index } : item))}><ChevronUp size={13} /></button><button type="button" disabled={index === groups.length - 1} onClick={() => updateGroups(groups.map((item, position) => position === index ? { ...item, order: index + 1 } : position === index + 1 ? { ...item, order: index } : item))}><ChevronDown size={13} /></button><button type="button" disabled={group.id === "ungrouped"} onClick={() => updateGroups(groups.filter((item) => item.id !== group.id))}><Trash2 size={13} /></button></header>
        {(project.logicVariables ?? []).filter((variable) => variable.groupId === group.id).map((variable) => <div className="logic-variable" key={variable.id}><input aria-label="Variable name" value={variable.name} onChange={(event) => updateVariable(variable.id, { name: event.target.value })} /><select value={variable.type} onChange={(event) => updateVariable(variable.id, { type: event.target.value as LogicVariableType, value: event.target.value === "boolean" ? false : event.target.value === "number" ? 0 : event.target.value === "list" ? [] : "" })}>{types.map((type) => <option key={type}>{type}</option>)}</select><input aria-label="Variable value" value={variableValue(variable)} onChange={(event) => updateVariable(variable.id, { value: variable.type === "number" ? Number(event.target.value) || 0 : variable.type === "list" ? event.target.value.split(",").map((item) => item.trim()).filter(Boolean) : event.target.value })} /><button type="button" onClick={() => updateVariables((project.logicVariables ?? []).filter((item) => item.id !== variable.id))}><Trash2 size={13} /></button></div>)}
        <button type="button" className="logic-add-variable" onClick={() => addVariable(group.id)}><Plus size={13} /> Variable</button>
      </section>)}</div>
    </>}
  </WorkspaceSidePanel>;
}
