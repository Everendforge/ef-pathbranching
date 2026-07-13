import { Plus, Trash2 } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { BranchingProject, PlayerProfile, PlayerSimulationState } from "../domain.js";
import { WorkspaceSidePanel } from "./WorkspaceSidePanel.js";

function profileFromLegacy(project: BranchingProject): PlayerProfile {
  return { id: "player:default", name: "Player", simulation: project.playerSimulation ?? {} };
}

export function PlayerPanel({ project, collapsed, onCollapsedChange, onContextMenu, onUpdate }: {
  project: BranchingProject; collapsed: boolean; onCollapsedChange: (collapsed: boolean) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void; onUpdate: (project: BranchingProject) => void;
}) {
  const profiles = project.playerProfiles?.length ? project.playerProfiles : [profileFromLegacy(project)];
  const active = profiles.find((profile) => profile.id === project.activePlayerProfileId) ?? profiles[0];
  const updateProfile = (changes: Partial<PlayerProfile>) => onUpdate({ ...project, playerProfiles: profiles.map((profile) => profile.id === active.id ? { ...profile, ...changes } : profile), activePlayerProfileId: active.id });
  const updateState = (changes: Partial<PlayerSimulationState>) => updateProfile({ simulation: { ...active.simulation, ...changes } });
  const inventory = new Set(active.simulation.inventory ?? []);
  const unlocked = new Set(active.simulation.unlockedCanonRefs ?? []);
  const activeEvent = project.events.find((event) => event.id === active.simulation.activeNodeId);
  const decisions = activeEvent?.decisions ?? [];
  const addProfile = () => {
    const profile = { id: `player:${crypto.randomUUID()}`, name: `Player ${profiles.length + 1}`, simulation: {} };
    onUpdate({ ...project, playerProfiles: [...profiles, profile], activePlayerProfileId: profile.id });
  };
  return <WorkspaceSidePanel title="Player" side="right" collapsed={collapsed} onCollapsedChange={onCollapsedChange} onContextMenu={onContextMenu}>
    <div className="panel-toolbar"><strong>Playable profiles</strong><button type="button" onClick={addProfile}><Plus size={14} /> Profile</button></div>
    <label className="field-label">Selected playable<select value={active.id} onChange={(event) => onUpdate({ ...project, playerProfiles: profiles, activePlayerProfileId: event.target.value })}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
    <label className="field-label">Profile name<input value={active.name} onChange={(event) => updateProfile({ name: event.target.value })} /></label>
    <label className="field-label">Active character<select value={active.playableCharacterRef ?? ""} onChange={(event) => updateProfile({ playableCharacterRef: event.target.value || undefined })}><option value="">No character</option>{project.canonRefs.map((ref) => <option key={ref.id} value={ref.id}>{ref.label ?? ref.id}</option>)}</select></label>
    <section className="logic-group"><header><strong>Simulation position</strong></header><label className="field-label">Current event<select value={active.simulation.activeNodeId ?? ""} onChange={(event) => updateState({ activeNodeId: event.target.value || undefined, activeDecisionId: undefined })}><option value="">Choose event…</option>{project.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label><label className="field-label">Decision<select value={active.simulation.activeDecisionId ?? ""} disabled={!decisions.length} onChange={(event) => updateState({ activeDecisionId: event.target.value || undefined })}><option value="">No decision</option>{decisions.map((decision) => <option key={decision.id} value={decision.id}>{decision.name}</option>)}</select></label></section>
    <section className="logic-group"><header><strong>Inventory</strong></header>{project.canonRefs.map((ref) => <label className="field-label" key={ref.id}><input type="checkbox" checked={inventory.has(ref.id)} onChange={(event) => updateState({ inventory: event.target.checked ? [...inventory, ref.id] : [...inventory].filter((id) => id !== ref.id) })} /> {ref.label ?? ref.id}</label>)}</section>
    <section className="logic-group"><header><strong>Unlocked Canon</strong></header>{project.canonRefs.map((ref) => <label className="field-label" key={ref.id}><input type="checkbox" checked={unlocked.has(ref.id)} onChange={(event) => updateState({ unlockedCanonRefs: event.target.checked ? [...unlocked, ref.id] : [...unlocked].filter((id) => id !== ref.id) })} /> {ref.label ?? ref.id}</label>)}</section>
    <section className="logic-group"><header><strong>Variables</strong></header>{(project.logicVariables ?? []).map((variable) => <label className="field-label" key={variable.id}>{variable.name}<input value={String(active.simulation.variables?.[variable.name] ?? variable.value ?? "")} onChange={(event) => updateState({ variables: { ...(active.simulation.variables ?? {}), [variable.name]: variable.type === "number" ? Number(event.target.value) || 0 : event.target.value } })} /></label>)}</section>
    <button type="button" className="danger" disabled={profiles.length === 1} onClick={() => onUpdate({ ...project, playerProfiles: profiles.filter((profile) => profile.id !== active.id), activePlayerProfileId: profiles.find((profile) => profile.id !== active.id)?.id })}><Trash2 size={13} /> Remove profile</button>
  </WorkspaceSidePanel>;
}
