import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { BranchingProject, LogicVariable, LogicVariableGroup, LogicVariableType } from "../domain.js";
import { WorkspaceSidePanel } from "./WorkspaceSidePanel.js";

const types: LogicVariableType[] = ["text", "number", "boolean", "list", "canonRef"];

export function LogicPanel({ project, collapsed, onCollapsedChange, onContextMenu, onUpdate }: {
  project: BranchingProject; collapsed: boolean; onCollapsedChange: (collapsed: boolean) => void;
  onContextMenu: (event: React.MouseEvent<HTMLElement>) => void; onUpdate: (project: BranchingProject) => void;
}) {
  const groups = [...(project.logicVariableGroups ?? [])].sort((a, b) => a.order - b.order);
  const updateGroups = (next: LogicVariableGroup[]) => onUpdate({ ...project, logicVariableGroups: next });
  const updateVariables = (next: LogicVariable[]) => onUpdate({ ...project, logicVariables: next });
  const addGroup = () => updateGroups([...groups, { id: `group:${crypto.randomUUID()}`, name: `Group ${groups.length + 1}`, order: groups.length }]);
  const addVariable = (groupId: string) => updateVariables([...(project.logicVariables ?? []), { id: `variable:${crypto.randomUUID()}`, name: `variable_${(project.logicVariables?.length ?? 0) + 1}`, type: "text", value: "", groupId }]);
  const projectVariableValue = (variable: LogicVariable) => variable.type === "list" ? variable.value.join(", ") : String(variable.value);
  const updateVariable = (id: string, changes: Partial<LogicVariable>) => updateVariables((project.logicVariables ?? []).map((variable) => variable.id === id ? { ...variable, ...changes } : variable));

  return <WorkspaceSidePanel title="Logic" side="left" collapsed={collapsed} onCollapsedChange={onCollapsedChange} onContextMenu={onContextMenu}>
    <div className="panel-toolbar"><strong>Variables</strong><button type="button" onClick={addGroup}><Plus size={14} /> Group</button></div>
    <div className="logic-groups">{groups.map((group, index) => <section className="logic-group" key={group.id}>
      <header><input aria-label="Group name" value={group.name} onChange={(event) => updateGroups(groups.map((item) => item.id === group.id ? { ...item, name: event.target.value } : item))} />
        <button type="button" disabled={index === 0} onClick={() => updateGroups(groups.map((item, position) => position === index ? { ...item, order: index - 1 } : position === index - 1 ? { ...item, order: index } : item))}><ChevronUp size={13} /></button>
        <button type="button" disabled={index === groups.length - 1} onClick={() => updateGroups(groups.map((item, position) => position === index ? { ...item, order: index + 1 } : position === index + 1 ? { ...item, order: index } : item))}><ChevronDown size={13} /></button>
        <button type="button" disabled={group.id === "ungrouped"} onClick={() => updateGroups(groups.filter((item) => item.id !== group.id))}><Trash2 size={13} /></button>
      </header>
      {(project.logicVariables ?? []).filter((variable) => variable.groupId === group.id).map((variable) => <div className="logic-variable" key={variable.id}>
        <input aria-label="Variable name" value={variable.name} onChange={(event) => updateVariable(variable.id, { name: event.target.value })} />
        <select value={variable.type} onChange={(event) => updateVariable(variable.id, { type: event.target.value as LogicVariableType, value: event.target.value === "boolean" ? false : event.target.value === "number" ? 0 : event.target.value === "list" ? [] : "" })}>{types.map((type) => <option key={type}>{type}</option>)}</select>
        {variable.type === "canonRef" ? <select value={projectVariableValue(variable)} onChange={(event) => updateVariable(variable.id, { value: event.target.value })}><option value="">Select Canon…</option>{project.canonRefs.map((ref) => <option key={ref.id} value={ref.id}>{ref.label ?? ref.id}</option>)}</select> : <input aria-label="Variable value" value={projectVariableValue(variable)} onChange={(event) => updateVariable(variable.id, { value: variable.type === "number" ? Number(event.target.value) || 0 : variable.type === "boolean" ? event.target.value === "true" : variable.type === "list" ? event.target.value.split(",").map((item) => item.trim()).filter(Boolean) : event.target.value })} />}
        <button type="button" onClick={() => updateVariables((project.logicVariables ?? []).filter((item) => item.id !== variable.id))}><Trash2 size={13} /></button>
      </div>)}
      <button type="button" className="logic-add-variable" onClick={() => addVariable(group.id)}><Plus size={13} /> Variable</button>
    </section>)}</div>
  </WorkspaceSidePanel>;
}
