import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type OnConnect,
  type ReactFlowInstance,
  Handle,
  Position,
} from "@xyflow/react";
import {
  ArrowLeft,
  Database,
  Download,
  FilePlus2,
  FolderOpen,
  Focus,
  GitBranch,
  Home,
  Palette,
  Play,
  RotateCcw,
  Save,
  SearchCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type {
  Branch,
  BranchingProject,
  ConditionInput,
  Consequence,
  DataFieldDefinition,
  Decision,
  EventNode,
  EventType,
  Outcome,
  ProjectDataObject,
  RuleSet,
  Sequence,
  Transition,
  ValidationFinding,
} from "./domain.js";
import { exportRuntimePackage } from "./exportRuntime.js";
import { exportInkProject, exportSinpoGameData } from "./exportFormats.js";
import { conditionCount, conditionLabels, consequenceLabel } from "./logic.js";
import * as mutations from "./projectMutations.js";
import {
  exportRuntimeDialog,
  normalizeProject,
  openProjectDialog,
  openProjectPath,
  projectFileName,
  exportTextDialog,
  saveProjectAsDialog,
  saveProjectFile,
  type ProjectFileState,
} from "./projectPersistence.js";
import { THEMES, normalizeThemeId, themeById, type ThemeId } from "./themes.js";
import { validateProject } from "./validate.js";
import {
  buildStoryCanvasModel,
  validateStoryCanvasEdges,
  type PathBranchingFileItem,
  type StoryCanvasEdge,
  type StoryCanvasNode,
  type StoryCanvasNodeData,
} from "./canvas/storyCanvasModel.js";

type Selection =
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "canon"; id: string }
  | { type: "file"; id: string }
  | { type: "dataObject"; id: string };

type CanvasMode = "branching" | "focus";
type AppView = "home" | "workspace";
type ExportPreviewMode = "runtime" | "ink" | "gameData";

const DEMO_PROJECT_PATH = "/examples/worldnotion-bridge-demo-project.json";
const SETTINGS_KEY = "pathbranching.settings.v1";

type AppSettings = {
  theme: ThemeId;
  recentProjects: string[];
  lastOpenedProject?: string;
  lastView?: AppView;
};

function loadSettings(): AppSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<AppSettings>;
    return {
      theme: normalizeThemeId(parsed.theme),
      recentProjects: Array.isArray(parsed.recentProjects)
        ? parsed.recentProjects.filter((item): item is string => typeof item === "string")
        : [],
      lastOpenedProject: typeof parsed.lastOpenedProject === "string" ? parsed.lastOpenedProject : undefined,
      lastView: parsed.lastView === "workspace" || parsed.lastView === "home" ? parsed.lastView : "home",
    };
  } catch {
    return { theme: "worldnotion-light", recentProjects: [], lastView: "home" };
  }
}

function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function badgeText(value: string) {
  return value.length > 22 ? `${value.slice(0, 19)}...` : value;
}

function rememberRecentProject(settings: AppSettings, path: string): AppSettings {
  return {
    ...settings,
    lastOpenedProject: path,
    recentProjects: [path, ...settings.recentProjects.filter((candidate) => candidate !== path)].slice(0, 8),
  };
}

function StoryNode({ data, selected }: NodeProps<StoryCanvasNode>) {
  const nodeData = data as StoryCanvasNodeData;
  const isFinalEvent = nodeData.kind === "event" && nodeData.badges.includes("terminal");
  const canReceive = nodeData.kind !== "start" && nodeData.kind !== "sequence";
  const canSource = nodeData.kind === "start" || (nodeData.kind !== "sequence" && !isFinalEvent);

  if (nodeData.isContainer) {
    return (
      <div className={`story-node branch-container ${selected ? "selected" : ""}`}>
        {canReceive ? <Handle type="target" position={Position.Left} /> : null}
        <div className="node-kind">{nodeData.kind}</div>
        <div className="node-title">{nodeData.title}</div>
        {nodeData.subtitle ? <div className="node-subtitle">{nodeData.subtitle}</div> : null}
        {nodeData.badges.length > 0 ? (
          <div className="node-badges">
            {nodeData.badges.slice(0, 5).map((badge) => (
              <span key={badge}>{badgeText(badge)}</span>
            ))}
          </div>
        ) : null}
        {canSource ? <Handle type="source" position={Position.Right} /> : null}
      </div>
    );
  }

  return (
    <div className={`story-node ${nodeData.kind}${isFinalEvent ? " terminal" : ""}${selected ? " selected" : ""}`}>
      {canReceive ? <Handle type="target" position={Position.Left} /> : null}
      <div className="node-kind">{nodeData.kind}</div>
      <div className="node-title">{nodeData.title}</div>
      {nodeData.subtitle ? <div className="node-subtitle">{nodeData.subtitle}</div> : null}
      {nodeData.badges.length > 0 ? (
        <div className="node-badges">
          {nodeData.badges.slice(0, 4).map((badge) => (
            <span key={badge}>{badgeText(badge)}</span>
          ))}
        </div>
      ) : null}
      {canSource ? <Handle type="source" position={Position.Right} /> : null}
    </div>
  );
}

const nodeTypes = {
  story: StoryNode,
} satisfies NodeTypes;

function groupCanon(project: BranchingProject) {
  return project.canonRefs.reduce<Record<string, typeof project.canonRefs>>((groups, ref) => {
    const kind = ref.kind ?? "canon";
    groups[kind] ??= [];
    groups[kind].push(ref);
    return groups;
  }, {});
}

function updateProjectCanvas(project: BranchingProject, nodes: StoryCanvasNode[]): BranchingProject {
  return {
    ...project,
    canvas: {
      ...project.canvas,
      nodes: Object.fromEntries(
        nodes.map((node) => [
          node.id,
          {
            ...project.canvas?.nodes?.[node.id],
            position: node.position,
          },
        ]),
      ),
    },
  };
}

function activeSequenceId(project: BranchingProject) {
  const preferred = project.canvas?.activeSequenceId ?? project.entrySequenceId ?? project.sequences[0]?.id;
  return project.sequences.some((sequence) => sequence.id === preferred) ? preferred : project.sequences[0]?.id;
}

function canonDisplay(project: BranchingProject, id: string) {
  const ref = project.canonRefs.find((canonRef) => canonRef.id === id);
  return ref ? `${ref.kind ?? "canon"} - ${ref.id}` : id;
}

function findSequence(project: BranchingProject, id: string): Sequence | undefined {
  return project.sequences.find((sequence) => sequence.id === id);
}

function findEvent(project: BranchingProject, id: string): EventNode | undefined {
  return project.events.find((event) => event.id === id);
}

function findBranch(project: BranchingProject, id: string): Branch | undefined {
  return project.branches.find((branch) => branch.id === id);
}

function slugify(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function uniqueId(base: string, existingIds: Iterable<string>) {
  const existing = new Set(existingIds);
  if (!existing.has(base)) {
    return base;
  }

  let index = 2;
  while (existing.has(`${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}

function withoutValue(values: string[] | undefined, value: string) {
  return (values ?? []).filter((item) => item !== value);
}

function withValue(values: string[] | undefined, value: string) {
  return Array.from(new Set([...(values ?? []), value]));
}

function nodeStoryId(node: StoryCanvasNode | undefined) {
  return typeof node?.data.storyObjectId === "string" ? node.data.storyObjectId : node?.id;
}

function ownerEventIdForNode(node: StoryCanvasNode | undefined) {
  if (!node) {
    return undefined;
  }
  if (node.data.kind === "event") {
    return nodeStoryId(node);
  }
  return typeof node.data.details?.eventId === "string" ? node.data.details.eventId : undefined;
}

function transitionFrom(sourceId: string, targetId: string, existing: Transition[] | undefined) {
  const count = (existing ?? []).filter((transition) => transition.to === targetId).length + 1;
  return uniqueId(`transition:${sourceId}:${targetId}:${count}`, (existing ?? []).map((transition) => transition.id));
}

function isPointInside(node: StoryCanvasNode, x: number, y: number) {
  const width = Number(node.width ?? node.measured?.width ?? node.style?.width ?? 0);
  const height = Number(node.height ?? node.measured?.height ?? node.style?.height ?? 0);
  return x >= node.position.x && x <= node.position.x + width && y >= node.position.y && y <= node.position.y + height;
}

function focusedGraph(nodes: StoryCanvasNode[], edges: StoryCanvasEdge[], focusNodeId: string | undefined) {
  if (!focusNodeId || !nodes.some((node) => node.id === focusNodeId)) {
    return { nodes, edges };
  }

  const ids = new Set([focusNodeId]);
  const componentKinds = new Set(["contains", "choice", "condition", "consequence", "transition", "entry"]);

  for (let depth = 0; depth < 6; depth += 1) {
    let changed = false;
    edges.forEach((edgeItem) => {
      const kind = edgeItem.data?.kind;
      if (!kind || !componentKinds.has(kind)) {
        return;
      }
      if (ids.has(edgeItem.source) || ids.has(edgeItem.target)) {
        if (!ids.has(edgeItem.source)) {
          ids.add(edgeItem.source);
          changed = true;
        }
        if (!ids.has(edgeItem.target)) {
          ids.add(edgeItem.target);
          changed = true;
        }
      }
    });
    if (!changed) {
      break;
    }
  }

  edges.forEach((edgeItem) => {
    if ((edgeItem.data?.kind === "entry" || edgeItem.data?.kind === "transition") && (edgeItem.source === focusNodeId || edgeItem.target === focusNodeId)) {
      ids.add(edgeItem.source);
      ids.add(edgeItem.target);
    }
  });

  return {
    nodes: nodes.filter((node) => ids.has(node.id)),
    edges: edges.filter((edgeItem) => ids.has(edgeItem.source) && ids.has(edgeItem.target)),
  };
}

function groupDataObjects(project: BranchingProject) {
  return (project.projectDataObjects ?? []).reduce<Record<string, ProjectDataObject[]>>((groups, dataObject) => {
    groups[dataObject.classId] ??= [];
    groups[dataObject.classId].push(dataObject);
    return groups;
  }, {});
}

function fieldSummary(value: unknown) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

function coerceDataFieldValue(type: string, value: string) {
  if (type === "number") {
    const numberValue = Number(value);
    return Number.isNaN(numberValue) ? value : numberValue;
  }
  if (type === "boolean") {
    return value === "true";
  }
  if (type === "multiSelect" || type === "canonRefList" || type === "dataRefList") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value;
}

function conditionSummary(input: ConditionInput | undefined) {
  const labels = conditionLabels(input);
  if (labels.length === 0) {
    return "No conditions.";
  }
  return labels.join(", ");
}

function consequenceSummary(consequences: Consequence[] | undefined) {
  if (!consequences?.length) {
    return "No consequences.";
  }
  return consequences.map(consequenceLabel).join(", ");
}

function LogicSection({
  title,
  availability,
  consequences,
  ruleSets,
}: {
  title?: string;
  availability?: ConditionInput;
  consequences?: Consequence[];
  ruleSets?: RuleSet[];
}) {
  const availabilityCount = conditionCount(availability);

  return (
    <section className="inspector-section">
      <h2>{title ?? "Logic"}</h2>
      <div className="logic-grid">
        <div className="mini-card">
          <strong>Conditions</strong>
          <span>{availabilityCount > 0 ? conditionSummary(availability) : "Always available."}</span>
        </div>
        <div className="mini-card">
          <strong>Consequences</strong>
          <span>{consequenceSummary(consequences)}</span>
        </div>
        <div className="mini-card">
          <strong>RuleSets</strong>
          <span>{ruleSets?.length ? `${ruleSets.length} if/then/else rule(s)` : "No advanced rules."}</span>
        </div>
      </div>
      {ruleSets?.length ? (
        <div className="stack-list">
          {ruleSets.map((ruleSet) => (
            <div className="mini-card" key={ruleSet.id}>
              <strong>{ruleSet.label ?? ruleSet.id}</strong>
              <span>when: {conditionSummary(ruleSet.when)}</span>
              <span>then: {consequenceSummary(ruleSet.then)}</span>
              {ruleSet.else?.length ? <span>else: {consequenceSummary(ruleSet.else)}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function firstSimpleCondition(input: ConditionInput | undefined): Record<string, unknown> | undefined {
  if (!input) {
    return undefined;
  }
  const expression = Array.isArray(input) ? input[0] : input;
  if ("all" in expression || "any" in expression || "not" in expression) {
    return undefined;
  }
  return expression;
}

function conditionInputKind(input: ConditionInput | undefined) {
  if (!input) {
    return "none";
  }
  const expression = Array.isArray(input) ? input[0] : input;
  if ("all" in expression) {
    return "all";
  }
  if ("any" in expression) {
    return "any";
  }
  if ("not" in expression) {
    return "not";
  }
  return typeof expression.type === "string" ? expression.type : "none";
}

function defaultCanonCondition(canonRefs: string[]) {
  return { type: "canonEntryUnlocked" as const, ref: canonRefs[0] ?? "" };
}

function BasicConditionEditor({
  label = "Availability",
  value,
  canonRefs,
  dataObjects,
  onChange,
}: {
  label?: string;
  value?: ConditionInput;
  canonRefs: string[];
  dataObjects: ProjectDataObject[];
  onChange: (value: ConditionInput | undefined) => void;
}) {
  const condition = firstSimpleCondition(value);
  const type = conditionInputKind(value);

  return (
    <section className="inspector-section">
      <h2>{label}</h2>
      <label className="field-label">
        Condition Type
        <select
          value={type}
          onChange={(event) => {
            const nextType = event.target.value;
            if (nextType === "none") {
              onChange(undefined);
            } else if (nextType === "canonEntryUnlocked") {
              onChange({ type: "canonEntryUnlocked", ref: canonRefs[0] ?? "" });
            } else if (nextType === "variable") {
              onChange({ type: "variable", name: "flag", operator: "==", value: true });
            } else if (nextType === "dataObjectExists") {
              onChange({ type: "dataObjectExists", objectId: dataObjects[0]?.id ?? "" });
            } else if (nextType === "visited") {
              onChange({ type: "visited", targetType: "event", targetId: "" });
            } else if (nextType === "all") {
              onChange({ all: [defaultCanonCondition(canonRefs)] });
            } else if (nextType === "any") {
              onChange({ any: [defaultCanonCondition(canonRefs)] });
            } else if (nextType === "not") {
              onChange({ not: defaultCanonCondition(canonRefs) });
            }
          }}
        >
          <option value="none">always available</option>
          <option value="canonEntryUnlocked">canon unlocked</option>
          <option value="variable">variable check</option>
          <option value="dataObjectExists">data object exists</option>
          <option value="visited">visited target</option>
          <option value="all">all condition set</option>
          <option value="any">any condition set</option>
          <option value="not">not condition set</option>
        </select>
      </label>

      {type === "all" || type === "any" || type === "not" ? (
        <div className="mini-card">
          <strong>{type.toUpperCase()}</strong>
          <span>Initial structured condition set. Add detailed nested logic in the RuleSet builder as it grows.</span>
          <button
            type="button"
            onClick={() => {
              if (type === "all") {
                onChange({ all: [defaultCanonCondition(canonRefs)] });
              } else if (type === "any") {
                onChange({ any: [defaultCanonCondition(canonRefs)] });
              } else {
                onChange({ not: defaultCanonCondition(canonRefs) });
              }
            }}
          >
            Seed with canon condition
          </button>
        </div>
      ) : null}

      {type === "canonEntryUnlocked" ? (
        <label className="field-label">
          Canon Ref
          <select
            value={String(condition?.ref ?? "")}
            onChange={(event) => onChange({ type: "canonEntryUnlocked", ref: event.target.value })}
          >
            <option value="">missing ref</option>
            {canonRefs.map((ref) => (
              <option key={ref} value={ref}>
                {ref}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {type === "variable" ? (
        <div className="logic-grid">
          <label className="field-label">
            Variable
            <input
              value={String(condition?.name ?? "")}
              onChange={(event) =>
                onChange({ type: "variable", name: event.target.value, operator: "==", value: condition?.value ?? true })
              }
            />
          </label>
          <label className="field-label">
            Value
            <input
              value={String(condition?.value ?? "")}
              onChange={(event) =>
                onChange({ type: "variable", name: String(condition?.name ?? "flag"), operator: "==", value: event.target.value })
              }
            />
          </label>
        </div>
      ) : null}

      {type === "dataObjectExists" ? (
        <label className="field-label">
          Data Object
          <select
            value={String(condition?.objectId ?? "")}
            onChange={(event) => onChange({ type: "dataObjectExists", objectId: event.target.value })}
          >
            <option value="">missing object</option>
            {dataObjects.map((dataObject) => (
              <option key={dataObject.id} value={dataObject.id}>
                {dataObject.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {type === "visited" ? (
        <div className="logic-grid">
          <label className="field-label">
            Target Type
            <select
              value={String(condition?.targetType ?? "event")}
              onChange={(event) =>
                onChange({ type: "visited", targetType: event.target.value as "sequence" | "branch" | "event" | "decision" | "outcome", targetId: String(condition?.targetId ?? "") })
              }
            >
              <option value="sequence">sequence</option>
              <option value="branch">branch</option>
              <option value="event">event</option>
              <option value="decision">decision</option>
              <option value="outcome">outcome</option>
            </select>
          </label>
          <label className="field-label">
            Target ID
            <input
              value={String(condition?.targetId ?? "")}
              onChange={(event) =>
                onChange({ type: "visited", targetType: (condition?.targetType as "sequence" | "branch" | "event" | "decision" | "outcome") ?? "event", targetId: event.target.value })
              }
            />
          </label>
        </div>
      ) : null}
    </section>
  );
}

function ConsequenceEditor({
  title = "Consequences",
  value,
  canonRefs,
  dataObjects,
  onChange,
}: {
  title?: string;
  value?: Consequence[];
  canonRefs: string[];
  dataObjects: ProjectDataObject[];
  onChange: (value: Consequence[] | undefined) => void;
}) {
  const consequences = value ?? [];
  const update = (index: number, consequence: Consequence) => {
    onChange(consequences.map((item, itemIndex) => (itemIndex === index ? consequence : item)));
  };

  return (
    <section className="inspector-section">
      <h2>{title}</h2>
      <div className="stack-list">
        {consequences.map((consequence, index) => (
          <div className="mini-card" key={`${consequence.type}:${index}`}>
            <label className="field-label">
              Type
              <select
                value={consequence.type}
                onChange={(event) => {
                  const nextType = event.target.value;
                  if (nextType === "unlockCanonEntry") {
                    update(index, { type: "unlockCanonEntry", ref: canonRefs[0] ?? "" });
                  } else if (nextType === "unlockDataObject") {
                    update(index, { type: "unlockDataObject", objectId: dataObjects[0]?.id ?? "" });
                  } else if (nextType === "setVariable") {
                    update(index, { type: "setVariable", name: "flag", value: true });
                  } else {
                    update(index, { type: "engineSignal", name: "signal" });
                  }
                }}
              >
                <option value="unlockCanonEntry">unlock canon</option>
                <option value="unlockDataObject">unlock data</option>
                <option value="setVariable">set variable</option>
                <option value="engineSignal">engine signal</option>
              </select>
            </label>
            {consequence.type === "unlockCanonEntry" ? (
              <label className="field-label">
                Canon Ref
                <select value={String(consequence.ref ?? "")} onChange={(event) => update(index, { ...consequence, ref: event.target.value })}>
                  <option value="">missing ref</option>
                  {canonRefs.map((ref) => (
                    <option key={ref} value={ref}>
                      {ref}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {consequence.type === "unlockDataObject" ? (
              <label className="field-label">
                Data Object
                <select value={String(consequence.objectId ?? "")} onChange={(event) => update(index, { ...consequence, objectId: event.target.value })}>
                  <option value="">missing object</option>
                  {dataObjects.map((dataObject) => (
                    <option key={dataObject.id} value={dataObject.id}>
                      {dataObject.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {consequence.type === "setVariable" ? (
              <div className="logic-grid">
                <label className="field-label">
                  Variable
                  <input value={String(consequence.name ?? "")} onChange={(event) => update(index, { ...consequence, name: event.target.value })} />
                </label>
                <label className="field-label">
                  Value
                  <input value={String(consequence.value ?? "")} onChange={(event) => update(index, { ...consequence, value: event.target.value })} />
                </label>
              </div>
            ) : null}
            {consequence.type === "engineSignal" ? (
              <label className="field-label">
                Signal
                <input value={String(consequence.name ?? "")} onChange={(event) => update(index, { ...consequence, name: event.target.value })} />
              </label>
            ) : null}
            <button type="button" className="danger" onClick={() => onChange(consequences.filter((_, itemIndex) => itemIndex !== index))}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="inspector-actions">
        <button type="button" onClick={() => onChange([...consequences, { type: "unlockCanonEntry", ref: canonRefs[0] ?? "" }])}>
          Add Consequence
        </button>
      </div>
    </section>
  );
}

function RuleSetEditor({
  value,
  canonRefs,
  dataObjects,
  onChange,
}: {
  value?: RuleSet[];
  canonRefs: string[];
  dataObjects: ProjectDataObject[];
  onChange: (value: RuleSet[] | undefined) => void;
}) {
  const ruleSets = value ?? [];
  const update = (index: number, ruleSet: RuleSet) => {
    onChange(ruleSets.map((item, itemIndex) => (itemIndex === index ? ruleSet : item)));
  };

  return (
    <section className="inspector-section">
      <h2>RuleSets</h2>
      <div className="stack-list">
        {ruleSets.map((ruleSet, index) => (
          <div className="mini-card" key={ruleSet.id}>
            <label className="field-label">
              Label
              <input value={ruleSet.label ?? ruleSet.id} onChange={(event) => update(index, { ...ruleSet, label: event.target.value })} />
            </label>
            <BasicConditionEditor
              label="When"
              value={ruleSet.when}
              canonRefs={canonRefs}
              dataObjects={dataObjects}
              onChange={(when) => update(index, { ...ruleSet, when: when ?? { all: [] } })}
            />
            <ConsequenceEditor
              title="Then"
              value={ruleSet.then}
              canonRefs={canonRefs}
              dataObjects={dataObjects}
              onChange={(then) => update(index, { ...ruleSet, then: then ?? [] })}
            />
            <ConsequenceEditor
              title="Else"
              value={ruleSet.else}
              canonRefs={canonRefs}
              dataObjects={dataObjects}
              onChange={(elseConsequences) => update(index, { ...ruleSet, else: elseConsequences })}
            />
            <button type="button" className="danger" onClick={() => onChange(ruleSets.filter((_, itemIndex) => itemIndex !== index))}>
              Remove RuleSet
            </button>
          </div>
        ))}
        {ruleSets.length === 0 ? <span className="empty-line">No rule sets yet.</span> : null}
      </div>
      <div className="inspector-actions">
        <button
          type="button"
          onClick={() =>
            onChange([
              ...ruleSets,
              {
                id: `rule:${ruleSets.length + 1}`,
                label: "New Rule",
                when: { type: "canonEntryUnlocked", ref: canonRefs[0] ?? "" },
                then: [],
              },
            ])
          }
        >
          Add RuleSet
        </button>
      </div>
    </section>
  );
}

function Topbar({
  project,
  fileState,
  findings,
  exportOpen,
  dataOpen,
  theme,
  onOpenProject,
  onSaveProject,
  onSaveProjectAs,
  onExportRuntime,
  onHome,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onReload,
  onCreateSequence,
  onValidate,
  onToggleExport,
  onToggleData,
  onCreateDataObject,
  onResetLayout,
  onThemeChange,
}: {
  project?: BranchingProject;
  fileState?: ProjectFileState;
  findings: ValidationFinding[];
  exportOpen: boolean;
  dataOpen: boolean;
  theme: ThemeId;
  onOpenProject: () => void;
  onSaveProject: () => void;
  onSaveProjectAs: () => void;
  onExportRuntime: () => void;
  onHome: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onReload: () => void;
  onCreateSequence: () => void;
  onValidate: () => void;
  onToggleExport: () => void;
  onToggleData: () => void;
  onCreateDataObject: () => void;
  onResetLayout: () => void;
  onThemeChange: (theme: ThemeId) => void;
}) {
  const errorCount = findings.filter((finding) => finding.severity === "error").length;
  const status = findings.length === 0 ? "Clean" : `${findings.length} findings`;

  return (
    <header className="topbar">
      <div className="brand">
        <strong>Everend PathBranching</strong>
        <span>
          {projectFileName(fileState?.path)}{fileState?.dirty ? " *" : ""} - {project?.name ?? "Loading project"} - {status}
          {errorCount > 0 ? ` (${errorCount} errors)` : ""}
        </span>
      </div>
      <div className="topbar-actions">
        <button type="button" title="Dashboard" onClick={onHome}>
          <Home size={15} />
          <span>Home</span>
        </button>
        <button type="button" title="Open project" onClick={onOpenProject}>
          <FolderOpen size={15} />
          <span>Open</span>
        </button>
        <button type="button" title="Save project" onClick={onSaveProject}>
          <Save size={15} />
          <span>Save</span>
        </button>
        <button type="button" title="Save project as" onClick={onSaveProjectAs}>
          <Save size={15} />
          <span>Save As</span>
        </button>
        <button type="button" title="Undo" onClick={onUndo} disabled={!canUndo}>
          <ArrowLeft size={15} />
          <span>Undo</span>
        </button>
        <button type="button" title="Redo" onClick={onRedo} disabled={!canRedo}>
          <ArrowLeft size={15} style={{ transform: "scaleX(-1)" }} />
          <span>Redo</span>
        </button>
        <button type="button" title="Load demo" onClick={onReload}>
          <Play size={15} />
          <span>Demo</span>
        </button>
        <button type="button" title="New sequence" onClick={onCreateSequence}>
          <FilePlus2 size={15} />
          <span>Sequence</span>
        </button>
        <button type="button" title="Validate project" onClick={onValidate}>
          <SearchCheck size={15} />
          <span>Validate</span>
        </button>
        <button type="button" title="Toggle runtime export preview" className={exportOpen ? "active" : ""} onClick={onToggleExport}>
          <Download size={15} />
          <span>{exportOpen ? "Hide Export" : "Export"}</span>
        </button>
        <button type="button" title="Export runtime package" onClick={onExportRuntime}>
          <Download size={15} />
          <span>Export File</span>
        </button>
        <button type="button" title="Toggle project data drawer" className={dataOpen ? "active" : ""} onClick={onToggleData}>
          <Database size={15} />
          <span>{dataOpen ? "Hide Data" : "Data"}</span>
        </button>
        <button type="button" title="Create knowledge data object" onClick={onCreateDataObject}>
          <FilePlus2 size={15} />
          <span>Knowledge</span>
        </button>
        <button type="button" title="Reset canvas layout" onClick={onResetLayout}>
          <RotateCcw size={15} />
          <span>Layout</span>
        </button>
        <label className="window-style-select" title={`Window style: ${themeById(theme).label}`}>
          <Palette size={15} />
          <select value={theme} onChange={(event) => onThemeChange(normalizeThemeId(event.target.value))}>
            {THEMES.map((themeOption) => (
              <option key={themeOption.id} value={themeOption.id}>
                {themeOption.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}

function HomeDashboard({
  project,
  fileState,
  settings,
  missingRecentProjects,
  findings,
  theme,
  onThemeChange,
  onEnterWorkspace,
  onOpenProject,
  onOpenRecentProject,
  onRemoveRecentProject,
  onLoadDemo,
  onSaveProject,
  onSaveProjectAs,
  onExportRuntime,
}: {
  project?: BranchingProject;
  fileState: ProjectFileState;
  settings: AppSettings;
  missingRecentProjects: Set<string>;
  findings: ValidationFinding[];
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  onEnterWorkspace: () => void;
  onOpenProject: () => void;
  onOpenRecentProject: (path: string) => void;
  onRemoveRecentProject: (path: string) => void;
  onLoadDemo: () => void;
  onSaveProject: () => void;
  onSaveProjectAs: () => void;
  onExportRuntime: () => void;
}) {
  const errorCount = findings.filter((finding) => finding.severity === "error").length;
  const warningCount = findings.filter((finding) => finding.severity === "warning").length;
  const activeSequence =
    project?.sequences.find((sequence) => sequence.id === activeSequenceId(project)) ?? project?.sequences[0];

  return (
    <main className="home-shell">
      <header className="home-topbar">
        <div className="brand">
          <GitBranch size={22} />
          <div>
            <h1>PathBranching</h1>
            <p>Story-flow authoring workspace</p>
          </div>
        </div>
        <label className="window-style-select" title={`Window style: ${themeById(theme).label}`}>
          <Palette size={15} />
          <select value={theme} onChange={(event) => onThemeChange(normalizeThemeId(event.target.value))}>
            {THEMES.map((themeOption) => (
              <option key={themeOption.id} value={themeOption.id}>
                {themeOption.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="home-panel">
        <div className="home-hero">
          <div className="home-copy">
            <p className="eyebrow">Dashboard</p>
            <h2>Controla tu branching narrativo</h2>
            <p>
              Abre un proyecto, revisa salud del flujo, exporta runtime y entra al canvas cuando quieras editar secuencias,
              branches, eventos, decisiones y outcomes.
            </p>
          </div>

          {project ? (
            <button type="button" className="active-project-card" onClick={onEnterWorkspace}>
              <span className="recent-icon">
                <GitBranch size={17} />
              </span>
              <span>
                <strong>{project.name ?? project.projectId}</strong>
                <small>{projectFileName(fileState.path)}{fileState.dirty ? " - unsaved changes" : ""}</small>
              </span>
              <Home size={16} />
            </button>
          ) : null}
        </div>

        <div className="home-actions">
          <button type="button" className="primary-action" onClick={onOpenProject}>
            <FolderOpen size={16} />
            Open Project
          </button>
          <button type="button" onClick={onLoadDemo}>
            <Play size={16} />
            Load Demo
          </button>
          <button type="button" onClick={onEnterWorkspace} disabled={!project}>
            <GitBranch size={16} />
            Workspace
          </button>
          <button type="button" onClick={onSaveProject} disabled={!project}>
            <Save size={16} />
            Save
          </button>
          <button type="button" onClick={onSaveProjectAs} disabled={!project}>
            <Save size={16} />
            Save As
          </button>
          <button type="button" onClick={onExportRuntime} disabled={!project}>
            <Download size={16} />
            Export Runtime
          </button>
        </div>

        <div className="home-metrics">
          <div>
            <strong>{project?.sequences.length ?? 0}</strong>
            <span>Sequences</span>
          </div>
          <div>
            <strong>{project?.branches.length ?? 0}</strong>
            <span>Branches</span>
          </div>
          <div>
            <strong>{project?.events.length ?? 0}</strong>
            <span>Events</span>
          </div>
          <div>
            <strong>{project?.projectDataObjects?.length ?? 0}</strong>
            <span>Data objects</span>
          </div>
          <div>
            <strong>{activeSequence?.name ?? "None"}</strong>
            <span>Active sequence</span>
          </div>
          <div>
            <strong>{findings.length ? `${errorCount}/${warningCount}` : "Clean"}</strong>
            <span>Errors / warnings</span>
          </div>
        </div>

        {findings.length ? (
          <section className="dashboard-findings">
            <h3>Validation</h3>
            <div className="stack-list">
              {findings.slice(0, 5).map((finding) => (
                <div className={`finding ${finding.severity}`} key={`${finding.code}:${finding.id ?? ""}:${finding.ref ?? ""}`}>
                  <strong>{finding.code}</strong>
                  <span>{finding.message}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {settings.recentProjects.length ? (
          <section className="recent-section">
            <h3>Recent projects</h3>
            <div className="recent-list">
              {settings.recentProjects.map((path, itemIndex) => (
                <button
                  key={path}
                  type="button"
                  className={missingRecentProjects.has(path) ? "missing" : ""}
                  style={{ animationDelay: `${120 + itemIndex * 45}ms` }}
                  onClick={() => missingRecentProjects.has(path) ? onRemoveRecentProject(path) : onOpenRecentProject(path)}
                >
                  <span className="recent-icon">
                    <GitBranch size={16} />
                  </span>
                  <span>
                    <strong>{projectFileName(path)}</strong>
                    <small>{missingRecentProjects.has(path) ? "Missing file - click to remove" : path}</small>
                  </span>
                  {missingRecentProjects.has(path) ? <span>x</span> : <FolderOpen size={14} />}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function DiscardChangesDialog({
  open,
  onDiscard,
  onCancel,
}: {
  open: boolean;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <section className="modal-dialog">
        <h2>Unsaved changes</h2>
        <p>This project has unsaved changes. Discard them and continue?</p>
        <div className="inspector-actions">
          <button type="button" className="danger" onClick={onDiscard}>
            Discard
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

function PanelShell({
  title,
  open,
  railLabel,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  railLabel: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  if (!open) {
    return (
      <aside className="side-rail">
        <button type="button" title={`Open ${title}`} onClick={onToggle}>
          <span>{railLabel}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="side-panel">
      <div className="panel-title">
        <div>
          <strong>{title}</strong>
        </div>
        <button type="button" title={`Collapse ${title}`} onClick={onToggle}>
          <span aria-hidden="true">&lt;</span>
        </button>
      </div>
      {children}
    </aside>
  );
}

function CanonPanel({
  project,
  open,
  selectedId,
  onToggle,
  onSelect,
}: {
  project: BranchingProject;
  open: boolean;
  selectedId?: string;
  onToggle: () => void;
  onSelect: (id: string) => void;
}) {
  const groups = groupCanon(project);

  return (
    <PanelShell title="Canon" open={open} railLabel="Canon" onToggle={onToggle}>
      <div className="panel-scroll">
        {Object.entries(groups).map(([kind, refs]) => (
          <section className="panel-group" key={kind}>
            <h2>
              {kind}
              <span>{refs.length}</span>
            </h2>
            <div className="panel-list">
              {refs.map((ref) => (
                <button
                  className={`list-item ${selectedId === ref.id ? "active" : ""}`}
                  type="button"
                  key={ref.id}
                  onClick={() => onSelect(ref.id)}
                >
                  <strong>{ref.id}</strong>
                  <span>{ref.source ?? "unknown source"}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PanelShell>
  );
}

function FilesPanel({
  files,
  open,
  selectedId,
  onToggle,
  onSelect,
}: {
  files: PathBranchingFileItem[];
  open: boolean;
  selectedId?: string;
  onToggle: () => void;
  onSelect: (id: string) => void;
}) {
  const groups = files.reduce<Record<string, PathBranchingFileItem[]>>((acc, file) => {
    acc[file.group] ??= [];
    acc[file.group].push(file);
    return acc;
  }, {});

  return (
    <PanelShell title="PathBranching Files" open={open} railLabel="Files" onToggle={onToggle}>
      <div className="panel-scroll">
        {Object.entries(groups).map(([group, items]) => (
          <section className="panel-group" key={group}>
            <h2>
              {group}
              <span>{items.length}</span>
            </h2>
            <div className="panel-list">
              {items.map((item) => (
                <button
                  className={`list-item ${selectedId === item.id ? "active" : ""}`}
                  type="button"
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                >
                  <strong>{item.label}</strong>
                  {item.detail ? <span>{item.detail}</span> : null}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PanelShell>
  );
}

function DataDrawer({
  project,
  selectedId,
  onSelect,
  onClose,
}: {
  project: BranchingProject;
  selectedId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const groups = groupDataObjects(project);
  const dataObjectCount = project.projectDataObjects?.length ?? 0;

  return (
    <aside className="data-drawer">
      <div className="inspector-header">
        <div>
          <strong>Project Data</strong>
          <span>{dataObjectCount} object(s)</span>
        </div>
        <button type="button" title="Close data drawer" onClick={onClose}>
          x
        </button>
      </div>
      <div className="inspector-scroll">
        {Object.entries(groups).map(([classId, objects]) => (
          <section className="inspector-section" key={classId}>
            <h2>{project.dataClasses?.find((dataClass) => dataClass.id === classId)?.label ?? classId}</h2>
            <div className="stack-list">
              {objects.map((dataObject) => (
                <button
                  className={`list-item ${selectedId === dataObject.id ? "active" : ""}`}
                  key={dataObject.id}
                  type="button"
                  onClick={() => onSelect(dataObject.id)}
                >
                  <strong>{dataObject.name}</strong>
                  <span>{dataObject.canonRefs?.join(", ") ?? "manual project data"}</span>
                  <span>{Object.keys(dataObject.fields).length} field(s)</span>
                </button>
              ))}
            </div>
          </section>
        ))}
        {dataObjectCount === 0 ? (
          <section className="inspector-section">
            <h2>No project data yet</h2>
            <span className="empty-line">Create Knowledge entries or manual data objects from canon refs.</span>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function Inspector({
  project,
  nodes,
  edges,
  files,
  selection,
  findings,
  exportOpen,
  exportPreviewMode,
  onExportPreviewModeChange,
  onClose,
  onUpdateSequence,
  onSetEntrySequence,
  onUpdateBranch,
  onCreateEventInBranch,
  onUpdateEvent,
  onCreateDecision,
  onUpdateDecision,
  onDeleteDecision,
  onCreateOutcome,
  onUpdateOutcome,
  onDeleteOutcome,
  onUpdateTransition,
  onDeleteTransition,
  onUpdateDataObject,
  onDeleteDataObject,
  onUpdateEdgeLabel,
  onDeleteSelection,
}: {
  project: BranchingProject;
  nodes: StoryCanvasNode[];
  edges: StoryCanvasEdge[];
  files: PathBranchingFileItem[];
  selection?: Selection;
  findings: ValidationFinding[];
  exportOpen: boolean;
  exportPreviewMode: ExportPreviewMode;
  onExportPreviewModeChange: (mode: ExportPreviewMode) => void;
  onClose: () => void;
  onUpdateSequence: (id: string, updates: Partial<Sequence>) => void;
  onSetEntrySequence: (id: string) => void;
  onUpdateBranch: (id: string, updates: Partial<Branch>) => void;
  onCreateEventInBranch: (branchId: string, type?: EventType) => void;
  onUpdateEvent: (id: string, updates: Partial<EventNode>) => void;
  onCreateDecision: (eventId: string) => void;
  onUpdateDecision: (eventId: string, decisionId: string, updates: Partial<Decision>) => void;
  onDeleteDecision: (eventId: string, decisionId: string) => void;
  onCreateOutcome: (eventId: string, decisionId: string) => void;
  onUpdateOutcome: (eventId: string, decisionId: string, outcomeId: string, updates: Partial<Outcome>) => void;
  onDeleteOutcome: (eventId: string, decisionId: string, outcomeId: string) => void;
  onUpdateTransition: (transitionId: string, updates: Partial<Transition>) => void;
  onDeleteTransition: (transitionId: string) => void;
  onUpdateDataObject: (id: string, updates: Partial<ProjectDataObject>) => void;
  onDeleteDataObject: (id: string) => void;
  onUpdateEdgeLabel: (edgeId: string, label: string) => void;
  onDeleteSelection: (selection: Selection) => void;
}) {
  const runtimePackage = useMemo(() => exportRuntimePackage(project), [project]);
  const inkExport = useMemo(() => exportInkProject(project), [project]);
  const gameDataExport = useMemo(() => exportSinpoGameData(project), [project]);
  const exportPreview =
    exportPreviewMode === "ink"
      ? inkExport.files.map((file) => `// ${file.path}\n${file.content}`).join("\n\n")
      : JSON.stringify(exportPreviewMode === "gameData" ? gameDataExport : runtimePackage, null, 2);
  const selectedNode = selection?.type === "node" ? nodes.find((node) => node.id === selection.id) : undefined;
  const selectedEdge = selection?.type === "edge" ? edges.find((edgeItem) => edgeItem.id === selection.id) : undefined;
  const selectedCanon =
    selection?.type === "canon" ? project.canonRefs.find((canonRef) => canonRef.id === selection.id) : undefined;
  const selectedFile = selection?.type === "file" ? files.find((file) => file.id === selection.id) : undefined;
  const selectedDataObject =
    selection?.type === "dataObject"
      ? project.projectDataObjects?.find((dataObject) => dataObject.id === selection.id)
      : undefined;

  const sequence = selectedNode ? findSequence(project, selectedNode.id) : undefined;
  const branch = selectedNode ? findBranch(project, selectedNode.id) : undefined;
  const event = selectedNode ? findEvent(project, selectedNode.id) : undefined;
  const selectedDecisionContext =
    selectedNode?.data.kind === "decision" && typeof selectedNode.data.details?.eventId === "string"
      ? {
          eventId: selectedNode.data.details.eventId,
          decision: findEvent(project, selectedNode.data.details.eventId)?.decisions?.find(
            (decision) => decision.id === (selectedNode.data.details?.decision as { id?: string } | undefined)?.id,
          ),
        }
      : undefined;
  const selectedOutcomeContext =
    selectedNode?.data.kind === "outcome" && typeof selectedNode.data.details?.eventId === "string"
      ? {
          eventId: selectedNode.data.details.eventId,
          decisionId: String(selectedNode.data.details.decisionId ?? "").replace(`decision:${selectedNode.data.details.eventId}:`, ""),
          outcome: selectedNode.data.details.outcome as Outcome | undefined,
        }
      : undefined;
  const selectedTransitionId = selectedEdge?.id.startsWith("edge:transition:")
    ? selectedEdge.id.replace("edge:transition:", "")
    : undefined;
  const selectedTransition = selectedTransitionId
    ? project.events.flatMap((eventNode) => eventNode.transitions ?? []).find((transition) => transition.id === selectedTransitionId)
    : undefined;
  const selectedDataClass = selectedDataObject
    ? project.dataClasses?.find((dataClass) => dataClass.id === selectedDataObject.classId)
    : undefined;
  const canonRefIds = project.canonRefs.map((canonRef) => canonRef.id);
  const dataObjects = project.projectDataObjects ?? [];

  return (
    <aside className="canvas-inspector">
      <div className="inspector-header">
        <div>
          <strong>Inspector</strong>
          <span>{selection ? selection.type : "project"}</span>
        </div>
        <button type="button" title="Close inspector" onClick={onClose}>
          x
        </button>
      </div>

      <div className="inspector-scroll">
        {sequence ? (
          <section className="inspector-section">
            <h2>Sequence</h2>
            <label className="field-label">
              Name
              <input value={sequence.name} onChange={(event) => onUpdateSequence(sequence.id, { name: event.target.value })} />
            </label>
            <label className="field-label">
              Entry Event
              <select
                value={sequence.entryEventId}
                onChange={(event) => onUpdateSequence(sequence.id, { entryEventId: event.target.value })}
              >
                {sequence.eventIds.map((eventId) => (
                  <option key={eventId} value={eventId}>
                    {findEvent(project, eventId)?.name ?? eventId}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Character Ref
              <input
                value={sequence.characterRef ?? ""}
                placeholder="optional speaker/character ref"
                onChange={(event) => onUpdateSequence(sequence.id, { characterRef: event.target.value || undefined })}
              />
            </label>
            <dl>
              <div>
                <dt>ID</dt>
                <dd>{sequence.id}</dd>
              </div>
              <div>
                <dt>Events</dt>
                <dd>{sequence.eventIds.length}</dd>
              </div>
              <div>
                <dt>Branches</dt>
                <dd>{sequence.branchIds?.length ?? 0}</dd>
              </div>
            </dl>
            <div className="inspector-actions">
              <button type="button" onClick={() => onSetEntrySequence(sequence.id)}>
                Mark Entry Sequence
              </button>
              <button type="button" className="danger" onClick={() => onDeleteSelection({ type: "node", id: sequence.id })}>
                Delete
              </button>
            </div>
          </section>
        ) : null}

        {sequence ? (
          <>
            <BasicConditionEditor
              value={sequence.availability}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(availability) => onUpdateSequence(sequence.id, { availability })}
            />
            <RuleSetEditor
              value={sequence.ruleSets}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(ruleSets) => onUpdateSequence(sequence.id, { ruleSets })}
            />
            <LogicSection availability={sequence.availability} ruleSets={sequence.ruleSets} />
          </>
        ) : null}

        {branch ? (
          <>
            <section className="inspector-section">
              <h2>Branch</h2>
              <label className="field-label">
                Title
                <input value={branch.title} onChange={(event) => onUpdateBranch(branch.id, { title: event.target.value })} />
              </label>
              <label className="field-label">
                Description
                <textarea
                  value={branch.description ?? ""}
                  rows={3}
                  onChange={(event) => onUpdateBranch(branch.id, { description: event.target.value || undefined })}
                />
              </label>
              <dl>
                <div>
                  <dt>ID</dt>
                  <dd>{branch.id}</dd>
                </div>
                <div>
                  <dt>Events</dt>
                  <dd>{branch.eventIds.length}</dd>
                </div>
              </dl>
              <div className="inspector-actions">
                <button type="button" onClick={() => onCreateEventInBranch(branch.id)}>
                  New Event Inside
                </button>
                <button type="button" onClick={() => onCreateEventInBranch(branch.id, "final")}>
                  New Final Inside
                </button>
                <button type="button" className="danger" onClick={() => onDeleteSelection({ type: "node", id: branch.id })}>
                  Delete
                </button>
              </div>
            </section>
            <BasicConditionEditor
              value={branch.availability}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(availability) => onUpdateBranch(branch.id, { availability })}
            />
            <RuleSetEditor
              value={branch.ruleSets}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(ruleSets) => onUpdateBranch(branch.id, { ruleSets })}
            />
            <LogicSection availability={branch.availability} ruleSets={branch.ruleSets} />
          </>
        ) : null}

        {event ? (
          <>
            <section className="inspector-section">
              <h2>Event</h2>
              <label className="field-label">
                Name
                <input value={event.name} onChange={(inputEvent) => onUpdateEvent(event.id, { name: inputEvent.target.value })} />
              </label>
              <label className="field-label">
                Type
                <select value={event.type} onChange={(inputEvent) => onUpdateEvent(event.id, { type: inputEvent.target.value })}>
                  <option value="normal">normal</option>
                  <option value="exploration">exploration</option>
                  <option value="final">final</option>
                </select>
              </label>
              <dl>
                <div>
                  <dt>ID</dt>
                  <dd>{event.id}</dd>
                </div>
                <div>
                  <dt>Branch</dt>
                  <dd>{event.branchRef ?? "none"}</dd>
                </div>
                <div>
                  <dt>Engine Target</dt>
                  <dd>{project.engineTargets?.unity?.adapter ?? "none"}</dd>
                </div>
              </dl>
            </section>

            <section className="inspector-section">
              <h2>Canon Refs</h2>
              <label className="field-label">
                Refs
                <textarea
                  value={(event.canonRefs ?? []).join(", ")}
                  rows={3}
                  onChange={(inputEvent) =>
                    onUpdateEvent(event.id, {
                      canonRefs: inputEvent.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <div className="tag-list">
                {(event.canonRefs ?? []).map((ref) => (
                  <span key={ref}>{canonDisplay(project, ref)}</span>
                ))}
              </div>
            </section>

            <section className="inspector-section">
              <h2>Script</h2>
              <label className="field-label">
                Ink Source
                <input
                  value={event.script?.sourcePath ?? ""}
                  placeholder="Assets/Ink/scene.ink"
                  onChange={(inputEvent) => {
                    const value = inputEvent.target.value;
                    onUpdateEvent(event.id, {
                      script: value
                        ? {
                            id: event.script?.id ?? `script:${event.id}`,
                            format: event.script?.format ?? "ink",
                            sourcePath: value,
                            compiledPath: event.script?.compiledPath,
                            entrySection: event.script?.entrySection,
                          }
                        : undefined,
                    });
                  }}
                />
              </label>
              <label className="field-label">
                Ink Entry
                <input
                  value={event.script?.entrySection ?? ""}
                  placeholder="opening_signal"
                  onChange={(inputEvent) =>
                    onUpdateEvent(event.id, {
                      script: {
                        id: event.script?.id ?? `script:${event.id}`,
                        format: event.script?.format ?? "ink",
                        sourcePath: event.script?.sourcePath,
                        compiledPath: event.script?.compiledPath,
                        entrySection: inputEvent.target.value || undefined,
                      },
                    })
                  }
                />
              </label>
              <dl>
                <div>
                  <dt>Source</dt>
                  <dd>{event.script?.sourcePath ?? "none"}</dd>
                </div>
                <div>
                  <dt>Compiled</dt>
                  <dd>{event.script?.compiledPath ?? "none"}</dd>
                </div>
                <div>
                  <dt>Entry</dt>
                  <dd>{event.script?.entrySection ?? "none"}</dd>
                </div>
              </dl>
            </section>

            <section className="inspector-section">
              <h2>Unlocks</h2>
              <div className="stack-list">
                {(event.unlocks ?? []).map((unlock, index) => (
                  <div className="mini-card" key={`${unlock.type}:${index}`}>
                    <strong>{unlock.type}</strong>
                    {"ref" in unlock && typeof unlock.ref === "string" ? <span>{unlock.ref}</span> : null}
                    {"sourceFunction" in unlock && typeof unlock.sourceFunction === "string" ? (
                      <span>{unlock.sourceFunction}</span>
                    ) : null}
                  </div>
                ))}
                {(event.unlocks ?? []).length === 0 ? <span className="empty-line">No unlock consequences.</span> : null}
              </div>
            </section>

            <BasicConditionEditor
              value={event.availability}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(availability) => onUpdateEvent(event.id, { availability })}
            />
            <ConsequenceEditor
              title="Unlocks / Runtime Actions"
              value={event.unlocks}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(unlocks) => onUpdateEvent(event.id, { unlocks })}
            />
            <RuleSetEditor
              value={event.ruleSets}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(ruleSets) => onUpdateEvent(event.id, { ruleSets })}
            />
            <section className="inspector-section">
              <h2>Decisions</h2>
              <div className="stack-list">
                {(event.decisions ?? []).map((decision) => (
                  <div className="mini-card" key={decision.id}>
                    <strong>{decision.name}</strong>
                    <span>{decision.type} - {decision.outcomes.length} outcomes</span>
                    <div className="inspector-actions">
                      <button type="button" onClick={() => onCreateOutcome(event.id, decision.id)}>
                        Add Outcome
                      </button>
                      <button type="button" className="danger" onClick={() => onDeleteDecision(event.id, decision.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {(event.decisions ?? []).length === 0 ? <span className="empty-line">No decisions yet.</span> : null}
              </div>
              <div className="inspector-actions">
                <button type="button" onClick={() => onCreateDecision(event.id)}>
                  Add Decision
                </button>
              </div>
            </section>
            <section className="inspector-section">
              <h2>Transitions</h2>
              <div className="stack-list">
                {(event.transitions ?? []).map((transition) => (
                  <div className="mini-card" key={transition.id}>
                    <strong>{transition.label ?? transition.id}</strong>
                    <span>{transition.from} {"->"} {transition.to}</span>
                    <button type="button" className="danger" onClick={() => onDeleteTransition(transition.id)}>
                      Delete Transition
                    </button>
                  </div>
                ))}
                {(event.transitions ?? []).length === 0 ? <span className="empty-line">No outgoing transitions.</span> : null}
              </div>
            </section>
            <LogicSection availability={event.availability} consequences={event.unlocks} ruleSets={event.ruleSets} />
            <section className="inspector-section">
              <div className="inspector-actions">
                <button type="button" className="danger" onClick={() => onDeleteSelection({ type: "node", id: event.id })}>
                  Delete
                </button>
              </div>
            </section>
          </>
        ) : null}

        {selectedDecisionContext?.decision ? (
          <>
            <section className="inspector-section">
              <h2>Decision</h2>
              <label className="field-label">
                Name
                <input
                  value={selectedDecisionContext.decision!.name}
                  onChange={(inputEvent) =>
                    onUpdateDecision(selectedDecisionContext.eventId, selectedDecisionContext.decision!.id, {
                      name: inputEvent.target.value,
                    })
                  }
                />
              </label>
              <label className="field-label">
                Type
                <input
                  value={selectedDecisionContext.decision!.type}
                  onChange={(inputEvent) =>
                    onUpdateDecision(selectedDecisionContext.eventId, selectedDecisionContext.decision!.id, {
                      type: inputEvent.target.value,
                    })
                  }
                />
              </label>
              <label className="field-label">
                Description
                <textarea
                  value={selectedDecisionContext.decision!.description ?? ""}
                  rows={3}
                  onChange={(inputEvent) =>
                    onUpdateDecision(selectedDecisionContext.eventId, selectedDecisionContext.decision!.id, {
                      description: inputEvent.target.value || undefined,
                    })
                  }
                />
              </label>
              <div className="inspector-actions">
                <button type="button" onClick={() => onCreateOutcome(selectedDecisionContext.eventId, selectedDecisionContext.decision!.id)}>
                  Add Outcome
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => onDeleteDecision(selectedDecisionContext.eventId, selectedDecisionContext.decision!.id)}
                >
                  Delete
                </button>
              </div>
            </section>
            <BasicConditionEditor
              value={selectedDecisionContext.decision!.availability}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(availability) =>
                onUpdateDecision(selectedDecisionContext.eventId, selectedDecisionContext.decision!.id, { availability })
              }
            />
            <RuleSetEditor
              value={selectedDecisionContext.decision!.ruleSets}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(ruleSets) =>
                onUpdateDecision(selectedDecisionContext.eventId, selectedDecisionContext.decision!.id, { ruleSets })
              }
            />
          </>
        ) : null}

        {selectedOutcomeContext?.outcome ? (
          <>
            <section className="inspector-section">
              <h2>Outcome</h2>
              <label className="field-label">
                Name
                <input
                  value={selectedOutcomeContext.outcome!.name}
                  onChange={(inputEvent) =>
                    onUpdateOutcome(selectedOutcomeContext.eventId, selectedOutcomeContext.decisionId, selectedOutcomeContext.outcome!.id, {
                      name: inputEvent.target.value,
                    })
                  }
                />
              </label>
              <label className="field-label">
                Description
                <textarea
                  value={selectedOutcomeContext.outcome!.description ?? ""}
                  rows={3}
                  onChange={(inputEvent) =>
                    onUpdateOutcome(selectedOutcomeContext.eventId, selectedOutcomeContext.decisionId, selectedOutcomeContext.outcome!.id, {
                      description: inputEvent.target.value || undefined,
                    })
                  }
                />
              </label>
              <label className="field-label">
                Required Canon Refs
                <textarea
                  value={(selectedOutcomeContext.outcome!.requiredCanonRefs ?? []).join(", ")}
                  rows={3}
                  onChange={(inputEvent) =>
                    onUpdateOutcome(selectedOutcomeContext.eventId, selectedOutcomeContext.decisionId, selectedOutcomeContext.outcome!.id, {
                      requiredCanonRefs: inputEvent.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="danger"
                onClick={() =>
                  onDeleteOutcome(selectedOutcomeContext.eventId, selectedOutcomeContext.decisionId, selectedOutcomeContext.outcome!.id)
                }
              >
                Delete
              </button>
            </section>
            <BasicConditionEditor
              value={selectedOutcomeContext.outcome!.conditions}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(conditions) =>
                onUpdateOutcome(selectedOutcomeContext.eventId, selectedOutcomeContext.decisionId, selectedOutcomeContext.outcome!.id, {
                  conditions,
                })
              }
            />
            <ConsequenceEditor
              value={selectedOutcomeContext.outcome!.consequences}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(consequences) =>
                onUpdateOutcome(selectedOutcomeContext.eventId, selectedOutcomeContext.decisionId, selectedOutcomeContext.outcome!.id, {
                  consequences,
                })
              }
            />
            <RuleSetEditor
              value={selectedOutcomeContext.outcome!.ruleSets}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(ruleSets) =>
                onUpdateOutcome(selectedOutcomeContext.eventId, selectedOutcomeContext.decisionId, selectedOutcomeContext.outcome!.id, {
                  ruleSets,
                })
              }
            />
          </>
        ) : null}

        {selectedNode && !sequence && !branch && !event && !selectedDecisionContext?.decision && !selectedOutcomeContext?.outcome ? (
          <section className="inspector-section">
            <h2>{selectedNode.data.title}</h2>
            <dl>
              <div>
                <dt>Kind</dt>
                <dd>{selectedNode.data.kind}</dd>
              </div>
              <div>
                <dt>ID</dt>
                <dd>{selectedNode.id}</dd>
              </div>
            </dl>
            <pre>{JSON.stringify(selectedNode.data.details ?? {}, null, 2)}</pre>
          </section>
        ) : null}

        {selectedEdge ? (
          <>
            <section className="inspector-section">
              <h2>{selectedEdge.data?.label ?? selectedEdge.label ?? "Edge"}</h2>
              <label className="field-label">
                Label
                <input
                  value={String(selectedEdge.data?.label ?? selectedEdge.label ?? "")}
                  onChange={(event) => onUpdateEdgeLabel(selectedEdge.id, event.target.value)}
                />
              </label>
              <dl>
                <div>
                  <dt>Kind</dt>
                  <dd>{selectedEdge.data?.kind ?? "edge"}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{selectedEdge.source}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>{selectedEdge.target}</dd>
                </div>
              </dl>
              {selectedTransition ? (
                <>
                  <label className="field-label">
                    Target Event
                    <select
                      value={selectedTransition.to}
                      onChange={(event) => onUpdateTransition(selectedTransition.id, { to: event.target.value })}
                    >
                      {project.events.map((eventNode) => (
                        <option key={eventNode.id} value={eventNode.id}>
                          {eventNode.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="inspector-actions">
                    <button type="button" className="danger" onClick={() => onDeleteTransition(selectedTransition.id)}>
                      Delete Transition
                    </button>
                  </div>
                </>
              ) : null}
            </section>
            {selectedTransition ? (
              <>
                <BasicConditionEditor
                  value={selectedTransition.conditions}
                  canonRefs={canonRefIds}
                  dataObjects={dataObjects}
                  onChange={(conditions) => onUpdateTransition(selectedTransition.id, { conditions })}
                />
                <ConsequenceEditor
                  value={selectedTransition.consequences}
                  canonRefs={canonRefIds}
                  dataObjects={dataObjects}
                  onChange={(consequences) => onUpdateTransition(selectedTransition.id, { consequences })}
                />
              </>
            ) : null}
            <LogicSection availability={selectedEdge.data?.conditions} consequences={selectedEdge.data?.consequences} />
          </>
        ) : null}

        {selectedCanon ? (
          <section className="inspector-section">
            <h2>{selectedCanon.kind ?? "canon"}</h2>
            <dl>
              <div>
                <dt>ID</dt>
                <dd>{selectedCanon.id}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{selectedCanon.source ?? "unknown"}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        {selectedFile ? (
          <section className="inspector-section">
            <h2>{selectedFile.label}</h2>
            <dl>
              <div>
                <dt>Group</dt>
                <dd>{selectedFile.group}</dd>
              </div>
              <div>
                <dt>Detail</dt>
                <dd>{selectedFile.detail ?? "none"}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        {selectedDataObject ? (
          <>
            <section className="inspector-section">
              <h2>Project Data Object</h2>
              <label className="field-label">
                Name
                <input
                  value={selectedDataObject.name}
                  onChange={(event) => onUpdateDataObject(selectedDataObject.id, { name: event.target.value })}
                />
              </label>
              <label className="field-label">
                Class
                <select
                  value={selectedDataObject.classId}
                  onChange={(event) => onUpdateDataObject(selectedDataObject.id, { classId: event.target.value })}
                >
                  {(project.dataClasses ?? []).map((dataClass) => (
                    <option key={dataClass.id} value={dataClass.id}>
                      {dataClass.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Canon Refs
                <textarea
                  value={(selectedDataObject.canonRefs ?? []).join(", ")}
                  rows={3}
                  onChange={(event) =>
                    onUpdateDataObject(selectedDataObject.id, {
                      canonRefs: event.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <label className="field-label">
                Tags
                <input
                  value={(selectedDataObject.tags ?? []).join(", ")}
                  onChange={(event) =>
                    onUpdateDataObject(selectedDataObject.id, {
                      tags: event.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <dl>
                <div>
                  <dt>ID</dt>
                  <dd>{selectedDataObject.id}</dd>
                </div>
                <div>
                  <dt>Class</dt>
                  <dd>{selectedDataObject.classId}</dd>
                </div>
                <div>
                  <dt>Canon</dt>
                  <dd>{selectedDataObject.canonRefs?.join(", ") || "manual"}</dd>
                </div>
              </dl>
              <div className="inspector-actions">
                <button type="button" className="danger" onClick={() => onDeleteDataObject(selectedDataObject.id)}>
                  Delete Data Object
                </button>
              </div>
            </section>
            <section className="inspector-section">
              <h2>Fields</h2>
              <div className="stack-list">
                {(selectedDataClass?.fields.length
                  ? selectedDataClass.fields
                  : Object.keys(selectedDataObject.fields).map((field): DataFieldDefinition => ({ name: field, type: "text" }))
                ).map((fieldDefinition) => {
                  const value = selectedDataObject.fields[fieldDefinition.name] ?? fieldDefinition.defaultValue ?? "";
                  return (
                    <div className="mini-card" key={fieldDefinition.name}>
                      <label className="field-label">
                        {fieldDefinition.label ?? fieldDefinition.name}
                        {fieldDefinition.type === "boolean" ? (
                          <select
                            value={String(Boolean(value))}
                            onChange={(event) =>
                              onUpdateDataObject(selectedDataObject.id, {
                                fields: {
                                  ...selectedDataObject.fields,
                                  [fieldDefinition.name]: event.target.value === "true",
                                },
                              })
                            }
                          >
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : fieldDefinition.type === "select" && fieldDefinition.options?.length ? (
                          <select
                            value={String(value)}
                            onChange={(event) =>
                              onUpdateDataObject(selectedDataObject.id, {
                                fields: { ...selectedDataObject.fields, [fieldDefinition.name]: event.target.value },
                              })
                            }
                          >
                            {fieldDefinition.options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={Array.isArray(value) ? value.join(", ") : fieldSummary(value)}
                            onChange={(event) =>
                              onUpdateDataObject(selectedDataObject.id, {
                                fields: {
                                  ...selectedDataObject.fields,
                                  [fieldDefinition.name]: coerceDataFieldValue(fieldDefinition.type, event.target.value),
                                },
                              })
                            }
                          />
                        )}
                      </label>
                      {fieldDefinition.description ? <span>{fieldDefinition.description}</span> : null}
                    </div>
                  );
                })}
              </div>
            </section>
            <BasicConditionEditor
              value={selectedDataObject.availability}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(availability) => onUpdateDataObject(selectedDataObject.id, { availability })}
            />
            <RuleSetEditor
              value={selectedDataObject.ruleSets}
              canonRefs={canonRefIds}
              dataObjects={dataObjects}
              onChange={(ruleSets) => onUpdateDataObject(selectedDataObject.id, { ruleSets })}
            />
            <LogicSection availability={selectedDataObject.availability} ruleSets={selectedDataObject.ruleSets} />
          </>
        ) : null}

        <section className="inspector-section">
          <h2>Validation</h2>
          <div className="stack-list">
            {findings.length === 0 ? <span className="clean">No findings.</span> : null}
            {findings.map((finding) => (
              <div className={`finding ${finding.severity}`} key={`${finding.code}:${finding.id ?? ""}:${finding.ref ?? ""}`}>
                <strong>{finding.code}</strong>
                <span>{finding.message}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="inspector-section">
          <h2>Export Preview</h2>
          <label className="field-label">
            Format
            <select value={exportPreviewMode} onChange={(event) => onExportPreviewModeChange(event.target.value as ExportPreviewMode)}>
              <option value="runtime">Runtime JSON</option>
              <option value="ink">Ink</option>
              <option value="gameData">SINPO GameData</option>
            </select>
          </label>
          <dl>
            <div>
              <dt>Package</dt>
              <dd>{runtimePackage.packageId}</dd>
            </div>
            <div>
              <dt>Entry</dt>
              <dd>{runtimePackage.entryNodeId}</dd>
            </div>
            <div>
              <dt>Nodes</dt>
              <dd>{runtimePackage.nodes.length}</dd>
            </div>
            <div>
              <dt>Ink files</dt>
              <dd>{inkExport.files.length}</dd>
            </div>
          </dl>
          {exportOpen ? <pre>{exportPreview}</pre> : null}
        </section>
      </div>
    </aside>
  );
}

type CanvasContextMenu = {
  x: number;
  y: number;
  flowX: number;
  flowY: number;
};

function StoryCanvas({
  project,
  files,
  nodes,
  edges,
  selection,
  findings,
  message,
  canvasMode,
  focusNodeId,
  exportOpen,
  exportPreviewMode,
  dataOpen,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeDragStop,
  onSelect,
  onEnterFocus,
  onExitFocus,
  onExportPreviewModeChange,
  onToggleData,
  onCreateBranch,
  onCreateEvent,
  onUpdateSequence,
  onSetEntrySequence,
  onUpdateBranch,
  onCreateEventInBranch,
  onUpdateEvent,
  onCreateDecision,
  onUpdateDecision,
  onDeleteDecision,
  onCreateOutcome,
  onUpdateOutcome,
  onDeleteOutcome,
  onUpdateTransition,
  onDeleteTransition,
  onUpdateDataObject,
  onDeleteDataObject,
  onUpdateEdgeLabel,
  onDeleteSelection,
}: {
  project: BranchingProject;
  files: PathBranchingFileItem[];
  nodes: StoryCanvasNode[];
  edges: StoryCanvasEdge[];
  selection?: Selection;
  findings: ValidationFinding[];
  message?: string;
  canvasMode: CanvasMode;
  focusNodeId?: string;
  exportOpen: boolean;
  exportPreviewMode: ExportPreviewMode;
  dataOpen: boolean;
  onNodesChange: (changes: NodeChange<StoryCanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<StoryCanvasEdge>[]) => void;
  onConnect: OnConnect;
  onNodeDragStop: (event: MouseEvent | TouchEvent | ReactMouseEvent, node: StoryCanvasNode) => void;
  onSelect: (selection?: Selection) => void;
  onEnterFocus: (nodeId: string) => void;
  onExitFocus: () => void;
  onExportPreviewModeChange: (mode: ExportPreviewMode) => void;
  onToggleData: () => void;
  onCreateBranch: (position?: { x: number; y: number }) => void;
  onCreateEvent: (type?: EventType, position?: { x: number; y: number }, branchId?: string) => void;
  onUpdateSequence: (id: string, updates: Partial<Sequence>) => void;
  onSetEntrySequence: (id: string) => void;
  onUpdateBranch: (id: string, updates: Partial<Branch>) => void;
  onCreateEventInBranch: (branchId: string, type?: EventType) => void;
  onUpdateEvent: (id: string, updates: Partial<EventNode>) => void;
  onCreateDecision: (eventId: string) => void;
  onUpdateDecision: (eventId: string, decisionId: string, updates: Partial<Decision>) => void;
  onDeleteDecision: (eventId: string, decisionId: string) => void;
  onCreateOutcome: (eventId: string, decisionId: string) => void;
  onUpdateOutcome: (eventId: string, decisionId: string, outcomeId: string, updates: Partial<Outcome>) => void;
  onDeleteOutcome: (eventId: string, decisionId: string, outcomeId: string) => void;
  onUpdateTransition: (transitionId: string, updates: Partial<Transition>) => void;
  onDeleteTransition: (transitionId: string) => void;
  onUpdateDataObject: (id: string, updates: Partial<ProjectDataObject>) => void;
  onDeleteDataObject: (id: string) => void;
  onUpdateEdgeLabel: (edgeId: string, label: string) => void;
  onDeleteSelection: (selection: Selection) => void;
}) {
  const shellRef = useRef<HTMLElement | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<StoryCanvasNode, StoryCanvasEdge>>();
  const [contextMenu, setContextMenu] = useState<CanvasContextMenu>();
  const [draggingEvent, setDraggingEvent] = useState(false);
  const graph = useMemo(() => focusedGraph(nodes, edges, canvasMode === "focus" ? focusNodeId : undefined), [canvasMode, edges, focusNodeId, nodes]);
  const currentSequence = project.sequences.find((sequence) => sequence.id === activeSequenceId(project));
  const focusedNode = graph.nodes.find((node) => node.id === focusNodeId) ?? nodes.find((node) => node.id === focusNodeId);
  const sequenceEvents = currentSequence?.eventIds.length ?? 0;
  const sequenceBranches = currentSequence?.branchIds?.length ?? nodes.filter((node) => node.data.kind === "branch").length;
  const errorCount = findings.filter((finding) => finding.severity === "error").length;
  const selectedNodeId = selection?.type === "node" ? selection.id : undefined;

  useEffect(() => {
    if (!reactFlowInstance) {
      return;
    }
    window.requestAnimationFrame(() => {
      reactFlowInstance.fitView({ padding: canvasMode === "focus" ? 0.32 : 0.24, duration: 180 });
    });
  }, [canvasMode, focusNodeId, graph.nodes.length, reactFlowInstance]);

  const openContextMenu = useCallback(
    (event: MouseEvent | ReactMouseEvent) => {
      event.preventDefault();
      if (!reactFlowInstance) {
        return;
      }
      const shellRect = shellRef.current?.getBoundingClientRect();
      const flowPosition = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setContextMenu({
        x: event.clientX - (shellRect?.left ?? 0),
        y: event.clientY - (shellRect?.top ?? 0),
        flowX: flowPosition.x,
        flowY: flowPosition.y,
      });
    },
    [reactFlowInstance],
  );

  return (
    <main className={`canvas-shell ${canvasMode === "focus" ? "focus-mode" : ""} ${draggingEvent ? "dragging-event" : ""}`} ref={shellRef}>
      <div className="canvas-status">
        <strong>{canvasMode === "focus" ? `Focus: ${focusedNode?.data.title ?? "Node"}` : currentSequence?.name ?? project.name ?? project.projectId}</strong>
        <span>
          {canvasMode === "focus"
            ? `${graph.nodes.length} components - ${graph.edges.length} links`
            : `${sequenceBranches} branches - ${sequenceEvents} events - ${findings.length} findings`}
          {errorCount > 0 ? ` (${errorCount} errors)` : ""}
        </span>
      </div>

      {message ? <div className="canvas-message">{message}</div> : null}

      <div className="canvas-modebar">
        <button type="button" className={canvasMode === "branching" ? "active" : ""} onClick={onExitFocus}>
          <GitBranch size={14} />
          <span>Branching</span>
        </button>
        <button
          type="button"
          className={canvasMode === "focus" ? "active" : ""}
          disabled={!focusNodeId && !selectedNodeId}
          onClick={() => {
            if (focusNodeId) {
              onEnterFocus(focusNodeId);
              return;
            }
            if (selectedNodeId) {
              onEnterFocus(selectedNodeId);
            }
          }}
        >
          <Focus size={14} />
          <span>Focus</span>
        </button>
        {canvasMode === "focus" ? (
          <button type="button" onClick={onExitFocus}>
            <ArrowLeft size={14} />
            <span>Exit</span>
          </button>
        ) : null}
      </div>

      {canvasMode === "branching" ? (
        <div className="canvas-palette">
          <button type="button" onClick={() => onCreateBranch()}>
            Branch
          </button>
          <button type="button" onClick={() => onCreateEvent()}>
            Event
          </button>
          <button type="button" onClick={() => onCreateEvent("final")}>
            Final Event
          </button>
        </div>
      ) : null}

      <ReactFlowProvider>
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onNodeDrag={(_, node) => setDraggingEvent(node.data.kind === "event")}
          onNodeDragStop={(event, node) => {
            setDraggingEvent(false);
            onNodeDragStop(event, node);
          }}
          onNodeClick={(_, node) => onSelect({ type: "node", id: node.id })}
          onNodeDoubleClick={(_, node) => onEnterFocus(node.id)}
          onEdgeClick={(_, edgeItem) => onSelect({ type: "edge", id: edgeItem.id })}
          onPaneClick={() => {
            setContextMenu(undefined);
            onSelect(undefined);
          }}
          onPaneContextMenu={canvasMode === "branching" ? openContextMenu : undefined}
          fitView
          fitViewOptions={{ padding: 0.24 }}
          defaultViewport={project.canvas?.viewport}
        >
          <MiniMap pannable zoomable nodeStrokeWidth={3} />
          <Controls />
          <Background gap={28} size={1} />
        </ReactFlow>
      </ReactFlowProvider>

      {contextMenu ? (
        <div className="canvas-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button
            type="button"
            onClick={() => {
              onCreateBranch({ x: contextMenu.flowX, y: contextMenu.flowY });
              setContextMenu(undefined);
            }}
          >
            Create Branch
          </button>
          <button
            type="button"
            onClick={() => {
              onCreateEvent("normal", { x: contextMenu.flowX, y: contextMenu.flowY });
              setContextMenu(undefined);
            }}
          >
            Create Event
          </button>
          <button
            type="button"
            onClick={() => {
              onCreateEvent("final", { x: contextMenu.flowX, y: contextMenu.flowY });
              setContextMenu(undefined);
            }}
          >
            Create Final Event
          </button>
        </div>
      ) : null}

      {dataOpen ? (
        <DataDrawer
          project={project}
          selectedId={selection?.type === "dataObject" ? selection.id : undefined}
          onSelect={(id) => onSelect({ type: "dataObject", id })}
          onClose={onToggleData}
        />
      ) : null}

      <Inspector
        project={project}
        nodes={nodes}
        edges={edges}
        files={files}
        selection={selection}
        findings={findings}
        exportOpen={exportOpen}
        exportPreviewMode={exportPreviewMode}
        onExportPreviewModeChange={onExportPreviewModeChange}
        onClose={() => onSelect(undefined)}
        onUpdateSequence={onUpdateSequence}
        onSetEntrySequence={onSetEntrySequence}
        onUpdateBranch={onUpdateBranch}
        onCreateEventInBranch={onCreateEventInBranch}
        onUpdateEvent={onUpdateEvent}
        onCreateDecision={onCreateDecision}
        onUpdateDecision={onUpdateDecision}
        onDeleteDecision={onDeleteDecision}
        onCreateOutcome={onCreateOutcome}
        onUpdateOutcome={onUpdateOutcome}
        onDeleteOutcome={onDeleteOutcome}
        onUpdateTransition={onUpdateTransition}
        onDeleteTransition={onDeleteTransition}
        onUpdateDataObject={onUpdateDataObject}
        onDeleteDataObject={onDeleteDataObject}
        onUpdateEdgeLabel={onUpdateEdgeLabel}
        onDeleteSelection={onDeleteSelection}
      />
    </main>
  );
}

export function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [view, setView] = useState<AppView>(() => loadSettings().lastView ?? "home");
  const [project, setProject] = useState<BranchingProject>();
  const [fileState, setFileState] = useState<ProjectFileState>({ dirty: false });
  const [nodes, setNodes] = useState<StoryCanvasNode[]>([]);
  const [edges, setEdges] = useState<StoryCanvasEdge[]>([]);
  const [files, setFiles] = useState<PathBranchingFileItem[]>([]);
  const [selection, setSelection] = useState<Selection>();
  const [canonOpen, setCanonOpen] = useState(true);
  const [filesOpen, setFilesOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPreviewMode, setExportPreviewMode] = useState<ExportPreviewMode>("runtime");
  const [dataOpen, setDataOpen] = useState(false);
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("branching");
  const [focusNodeId, setFocusNodeId] = useState<string>();
  const [undoStack, setUndoStack] = useState<BranchingProject[]>([]);
  const [redoStack, setRedoStack] = useState<BranchingProject[]>([]);
  const [discardDialog, setDiscardDialog] = useState<{ resolve: (discard: boolean) => void }>();
  const [missingRecentProjects, setMissingRecentProjects] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  const applyProject = useCallback((nextProject: BranchingProject, options: { dirty?: boolean; path?: string; modifiedMs?: number } = {}) => {
    const normalizedProject = normalizeProject(nextProject);
    const model = buildStoryCanvasModel(normalizedProject);
    setProject(normalizedProject);
    setNodes(model.nodes);
    setEdges(model.edges);
    setFiles(model.files);
    setFileState((current) => ({
      path: options.path ?? current.path,
      dirty: options.dirty ?? current.dirty,
      lastSavedAt: options.dirty === false ? Date.now() : current.lastSavedAt,
      modifiedMs: options.modifiedMs ?? current.modifiedMs,
    }));
  }, []);

  const updateProject = useCallback(
    (nextProject: BranchingProject, nextSelection?: Selection) => {
      if (project) {
        setUndoStack((current) => [...current.slice(-49), project]);
        setRedoStack([]);
      }
      applyProject(nextProject, { dirty: true });
      if (nextSelection) {
        setSelection(nextSelection);
      }
      setMessage(undefined);
    },
    [applyProject, project],
  );

  const runMutation = useCallback(
    (result: mutations.MutationResult) => {
      if (project && result.project !== project) {
        setUndoStack((current) => [...current.slice(-49), project]);
        setRedoStack([]);
      }
      applyProject(result.project, { dirty: result.project !== project });
      if (result.selection) {
        setSelection(result.selection as Selection);
      }
      setMessage(result.message);
    },
    [applyProject, project],
  );

  const confirmDiscardChanges = useCallback(async () => {
    if (!fileState.dirty) {
      return true;
    }
    return new Promise<boolean>((resolve) => {
      setDiscardDialog({ resolve });
    });
  }, [fileState.dirty]);

  const resolveDiscardDialog = useCallback(
    (discard: boolean) => {
      discardDialog?.resolve(discard);
      setDiscardDialog(undefined);
    },
    [discardDialog],
  );

  const setActiveSequence = useCallback(
    (sequenceId: string) => {
      if (!project) {
        return;
      }
      updateProject(
        {
          ...project,
          canvas: {
            ...project.canvas,
            activeSequenceId: sequenceId,
          },
        },
        { type: "node", id: sequenceId },
      );
      setCanvasMode("branching");
      setFocusNodeId(undefined);
    },
    [project, updateProject],
  );

  const loadDemo = useCallback(async () => {
    if (!(await confirmDiscardChanges())) {
      return;
    }
    try {
      const response = await fetch(DEMO_PROJECT_PATH);
      if (!response.ok) {
        throw new Error(`Could not load demo project: ${response.status}`);
      }

      const rawProject = (await response.json()) as BranchingProject;
      const loadedProject = normalizeProject({
        ...rawProject,
        canvas: {
          ...rawProject.canvas,
          activeSequenceId: rawProject.canvas?.activeSequenceId ?? rawProject.entrySequenceId ?? rawProject.sequences[0]?.id,
        },
      });
      const model = buildStoryCanvasModel(loadedProject);
      setProject(loadedProject);
      setNodes(model.nodes);
      setEdges(model.edges);
      setFiles(model.files);
      setFileState({ dirty: false });
      setUndoStack([]);
      setRedoStack([]);
      setCanonOpen(loadedProject.panels?.canonOpen ?? true);
      setFilesOpen(loadedProject.panels?.filesOpen ?? true);
      setSelection({ type: "node", id: loadedProject.entrySequenceId ?? loadedProject.sequences[0]?.id ?? model.nodes[0]?.id });
      setCanvasMode("branching");
      setFocusNodeId(undefined);
      setError(undefined);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, [confirmDiscardChanges]);

  useEffect(() => {
    let disposed = false;
    async function loadInitialProject() {
      if (settings.lastOpenedProject) {
        try {
          const opened = await openProjectPath(settings.lastOpenedProject);
          if (disposed) {
            return;
          }
          applyProject(opened.project, { dirty: false, path: opened.path, modifiedMs: opened.modifiedMs });
          setFileState({ path: opened.path, dirty: false, lastSavedAt: Date.now(), modifiedMs: opened.modifiedMs });
          setCanonOpen(opened.project.panels?.canonOpen ?? true);
          setFilesOpen(opened.project.panels?.filesOpen ?? true);
          setSelection({ type: "node", id: opened.project.canvas?.activeSequenceId ?? opened.project.entrySequenceId ?? opened.project.sequences[0]?.id });
          return;
        } catch {
          setMissingRecentProjects((current) => new Set(current).add(settings.lastOpenedProject as string));
        }
      }
      await loadDemo();
    }
    void loadInitialProject();
    return () => {
      disposed = true;
    };
    // Initial load only. The settings object is persisted separately after startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    saveSettings({ ...settings, lastView: view });
  }, [settings, view]);

  const changeTheme = useCallback((theme: ThemeId) => {
    setSettings((current) => ({ ...current, theme }));
  }, []);

  const openProject = useCallback(async () => {
    if (!(await confirmDiscardChanges())) {
      return;
    }
    try {
      const opened = await openProjectDialog();
      if (!opened) {
        return;
      }
      applyProject(opened.project, { dirty: false, path: opened.path });
      setFileState({ path: opened.path, dirty: false, lastSavedAt: Date.now(), modifiedMs: opened.modifiedMs });
      setUndoStack([]);
      setRedoStack([]);
      setSettings((current) => rememberRecentProject(current, opened.path));
      setCanonOpen(opened.project.panels?.canonOpen ?? true);
      setFilesOpen(opened.project.panels?.filesOpen ?? true);
      setSelection({ type: "node", id: opened.project.canvas?.activeSequenceId ?? opened.project.entrySequenceId ?? opened.project.sequences[0]?.id });
      setView("workspace");
      setError(undefined);
      setMessage(`Opened ${projectFileName(opened.path)}.`);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : String(openError));
    }
  }, [applyProject, confirmDiscardChanges]);

  const saveProject = useCallback(async () => {
    if (!project) {
      return;
    }
    try {
      const result = fileState.path
        ? await saveProjectFile(fileState.path, project, fileState.modifiedMs)
        : await saveProjectAsDialog(project);
      if (!result) {
        return;
      }
      if (!result.ok) {
        throw new Error(result.message ?? "Could not save project.");
      }
      setFileState({ path: result.path, dirty: false, lastSavedAt: Date.now(), modifiedMs: result.modifiedMs });
      setSettings((current) => rememberRecentProject(current, result.path));
      setMessage(`Saved ${projectFileName(result.path)}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  }, [fileState.modifiedMs, fileState.path, project]);

  const saveProjectAs = useCallback(async () => {
    if (!project) {
      return;
    }
    try {
      const result = await saveProjectAsDialog(project);
      if (!result) {
        return;
      }
      if (!result.ok) {
        throw new Error(result.message ?? "Could not save project.");
      }
      setFileState({ path: result.path, dirty: false, lastSavedAt: Date.now(), modifiedMs: result.modifiedMs });
      setSettings((current) => rememberRecentProject(current, result.path));
      setMessage(`Saved ${projectFileName(result.path)}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  }, [project]);

  const exportRuntime = useCallback(async () => {
    if (!project) {
      return;
    }
    try {
      const runtimePackage = exportRuntimePackage(project);
      const inkExport = exportInkProject(project);
      const gameDataExport = exportSinpoGameData(project);
      const result =
        exportPreviewMode === "ink"
          ? await exportTextDialog(inkExport.files.map((file) => `// ${file.path}\n${file.content}`).join("\n\n"), "story.ink")
          : exportPreviewMode === "gameData"
            ? await exportTextDialog(`${JSON.stringify(gameDataExport, null, 2)}\n`, "sinpo-game-data.json")
            : await exportRuntimeDialog(runtimePackage);
      if (!result) {
        return;
      }
      if (!result.ok) {
        throw new Error(result.message ?? "Could not export runtime package.");
      }
      setMessage(`Exported ${projectFileName(result.path)}.`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    }
  }, [exportPreviewMode, project]);

  const openRecentProject = useCallback(
    async (path: string) => {
      if (!(await confirmDiscardChanges())) {
        return;
      }
      try {
        const opened = await openProjectPath(path);
        applyProject(opened.project, { dirty: false, path: opened.path });
        setFileState({ path: opened.path, dirty: false, lastSavedAt: Date.now(), modifiedMs: opened.modifiedMs });
        setUndoStack([]);
        setRedoStack([]);
        setSettings((current) => rememberRecentProject(current, opened.path));
        setCanonOpen(opened.project.panels?.canonOpen ?? true);
        setFilesOpen(opened.project.panels?.filesOpen ?? true);
        setSelection({ type: "node", id: opened.project.canvas?.activeSequenceId ?? opened.project.entrySequenceId ?? opened.project.sequences[0]?.id });
        setView("workspace");
        setError(undefined);
        setMessage(`Opened ${projectFileName(opened.path)}.`);
      } catch (openError) {
        setMissingRecentProjects((current) => new Set(current).add(path));
        setError(openError instanceof Error ? openError.message : String(openError));
      }
    },
    [applyProject, confirmDiscardChanges],
  );

  const removeRecentProject = useCallback((path: string) => {
    setSettings((current) => ({
      ...current,
      recentProjects: current.recentProjects.filter((candidate) => candidate !== path),
      lastOpenedProject: current.lastOpenedProject === path ? undefined : current.lastOpenedProject,
    }));
    setMissingRecentProjects((current) => {
      const next = new Set(current);
      next.delete(path);
      return next;
    });
  }, []);

  const undoProject = useCallback(() => {
    if (!project || undoStack.length === 0) {
      return;
    }
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current.slice(-49), project]);
    applyProject(previous, { dirty: true });
    setMessage("Undo.");
  }, [applyProject, project, undoStack]);

  const redoProject = useCallback(() => {
    if (!project || redoStack.length === 0) {
      return;
    }
    const next = redoStack[redoStack.length - 1];
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current.slice(-49), project]);
    applyProject(next, { dirty: true });
    setMessage("Redo.");
  }, [applyProject, project, redoStack]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveProject();
      }
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redoProject();
        } else {
          undoProject();
        }
      }
      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openProject();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openProject, redoProject, saveProject, undoProject]);

  const enterFocus = useCallback((nodeId: string) => {
    setFocusNodeId(nodeId);
    setCanvasMode("focus");
    setSelection({ type: "node", id: nodeId });
  }, []);

  const exitFocus = useCallback(() => {
    setCanvasMode("branching");
    setFocusNodeId(undefined);
  }, []);

  const findings = useMemo(() => {
    if (!project) {
      return [];
    }
    return [...validateProject(project), ...validateStoryCanvasEdges(nodes, edges)];
  }, [project, nodes, edges]);

  const createSequence = useCallback(() => {
    if (!project) {
      return;
    }
    runMutation(mutations.createSequence(project));
  }, [project, runMutation]);

  const createBranch = useCallback(
    (position?: { x: number; y: number }) => {
      if (!project) {
        return;
      }

      runMutation(mutations.createBranch(project, position));
    },
    [project, runMutation],
  );

  const createEvent = useCallback(
    (type: EventType = "normal", position?: { x: number; y: number }, branchId?: string) => {
      if (!project) {
        return;
      }

      runMutation(mutations.createEvent(project, type, position, branchId));
    },
    [project, runMutation],
  );

  const createEventInBranch = useCallback(
    (branchId: string, type: EventType = "normal") => {
      createEvent(type, undefined, branchId);
    },
    [createEvent],
  );

  const updateSequence = useCallback(
    (id: string, updates: Partial<Sequence>) => {
      if (!project) {
        return;
      }
      runMutation(mutations.updateSequence(project, id, updates));
    },
    [project, runMutation],
  );

  const setEntrySequence = useCallback(
    (id: string) => {
      if (!project) {
        return;
      }
      runMutation(mutations.setEntrySequence(project, id));
    },
    [project, runMutation],
  );

  const updateBranch = useCallback(
    (id: string, updates: Partial<Branch>) => {
      if (!project) {
        return;
      }
      runMutation(mutations.updateBranch(project, id, updates));
    },
    [project, runMutation],
  );

  const updateEvent = useCallback(
    (id: string, updates: Partial<EventNode>) => {
      if (!project) {
        return;
      }
      runMutation(mutations.updateEvent(project, id, updates));
    },
    [project, runMutation],
  );

  const createDecision = useCallback(
    (eventId: string) => {
      if (!project) {
        return;
      }
      runMutation(mutations.createDecision(project, eventId));
    },
    [project, runMutation],
  );

  const updateDecision = useCallback(
    (eventId: string, decisionId: string, updates: Partial<Decision>) => {
      if (!project) {
        return;
      }
      runMutation(mutations.updateDecision(project, eventId, decisionId, updates));
    },
    [project, runMutation],
  );

  const deleteDecision = useCallback(
    (eventId: string, decisionId: string) => {
      if (!project) {
        return;
      }
      runMutation(mutations.deleteDecision(project, eventId, decisionId));
    },
    [project, runMutation],
  );

  const createOutcome = useCallback(
    (eventId: string, decisionId: string) => {
      if (!project) {
        return;
      }
      runMutation(mutations.createOutcome(project, eventId, decisionId));
    },
    [project, runMutation],
  );

  const updateOutcome = useCallback(
    (eventId: string, decisionId: string, outcomeId: string, updates: Partial<Outcome>) => {
      if (!project) {
        return;
      }
      runMutation(mutations.updateOutcome(project, eventId, decisionId, outcomeId, updates));
    },
    [project, runMutation],
  );

  const deleteOutcome = useCallback(
    (eventId: string, decisionId: string, outcomeId: string) => {
      if (!project) {
        return;
      }
      runMutation(mutations.deleteOutcome(project, eventId, decisionId, outcomeId));
    },
    [project, runMutation],
  );

  const updateTransition = useCallback(
    (transitionId: string, updates: Partial<Transition>) => {
      if (!project) {
        return;
      }
      runMutation(mutations.updateTransition(project, transitionId, updates));
    },
    [project, runMutation],
  );

  const deleteTransition = useCallback(
    (transitionId: string) => {
      if (!project) {
        return;
      }
      runMutation(mutations.deleteTransition(project, transitionId));
    },
    [project, runMutation],
  );

  const updateDataObject = useCallback(
    (id: string, updates: Partial<ProjectDataObject>) => {
      if (!project) {
        return;
      }
      runMutation(mutations.updateDataObject(project, id, updates));
    },
    [project, runMutation],
  );

  const deleteDataObject = useCallback(
    (id: string) => {
      if (!project) {
        return;
      }
      runMutation(mutations.deleteDataObject(project, id));
    },
    [project, runMutation],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<StoryCanvasNode>[]) => {
      setNodes((currentNodes) => {
        const nextNodes = applyNodeChanges(changes, currentNodes);
        setProject((currentProject) => (currentProject ? updateProjectCanvas(currentProject, nextNodes) : currentProject));
        setFileState((current) => ({ ...current, dirty: true }));
        return nextNodes;
      });
    },
    [setProject],
  );

  const handleEdgesChange = useCallback((changes: EdgeChange<StoryCanvasEdge>[]) => {
    setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges));
  }, []);

  const handleConnect = useCallback<OnConnect>(
    (connection: Connection) => {
      if (!project || !connection.source || !connection.target) {
        return;
      }

      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);
      const targetEventId = targetNode?.data.kind === "event" ? nodeStoryId(targetNode) : undefined;

      if (!sourceNode || !targetEventId) {
        setMessage("Connections must target an event in this MVP.");
        return;
      }

      const sequenceId = activeSequenceId(project);
      const sourceKind = sourceNode.data.kind;

      if (sourceKind === "start") {
        const sourceSequenceId =
          typeof sourceNode.data.details?.sequenceId === "string" ? sourceNode.data.details.sequenceId : nodeStoryId(sourceNode);
        if (!sourceSequenceId) {
          setMessage("Start node source could not be resolved.");
          return;
        }
        updateProject(
          {
            ...project,
            sequences: project.sequences.map((sequence) =>
              sequence.id === sourceSequenceId
                ? { ...sequence, entryEventId: targetEventId, eventIds: withValue(sequence.eventIds, targetEventId) }
                : sequence,
            ),
          },
          { type: "edge", id: `edge:entry:${sourceNode.id}:${targetEventId}` },
        );
        return;
      }

      if (sourceKind === "branch") {
        const branchId = nodeStoryId(sourceNode);
        if (!branchId || !sequenceId) {
          setMessage("Branch connection could not be resolved.");
          return;
        }
        updateProject(
          {
            ...project,
            sequences: project.sequences.map((sequence) =>
              sequence.id === sequenceId
                ? {
                    ...sequence,
                    eventIds: withValue(sequence.eventIds, targetEventId),
                    branchIds: withValue(sequence.branchIds, branchId),
                  }
                : sequence,
            ),
            branches: project.branches.map((branch) =>
              branch.id === branchId ? { ...branch, eventIds: withValue(branch.eventIds, targetEventId) } : branch,
            ),
            events: project.events.map((event) => (event.id === targetEventId ? { ...event, branchRef: branchId } : event)),
          },
          { type: "node", id: targetEventId },
        );
        return;
      }

      const sourceEventId = ownerEventIdForNode(sourceNode);
      const sourceEvent = sourceEventId ? findEvent(project, sourceEventId) : undefined;
      if (!sourceEventId || !sourceEvent) {
        setMessage("Only events and outcomes can create runtime transitions.");
        return;
      }

      if (sourceEvent.type === "final") {
        setMessage("Final events are terminal and cannot create outgoing transitions.");
        return;
      }

      const transitionId = transitionFrom(sourceNode.id, targetEventId, sourceEvent.transitions);
      const transition: Transition = {
        id: transitionId,
        from: sourceNode.data.kind === "outcome" ? sourceNode.id : sourceEventId,
        to: targetEventId,
        label: sourceNode.data.kind === "outcome" ? "outcome transition" : "transition",
        source: "graph",
      };

      updateProject(
        {
          ...project,
          sequences: sequenceId
            ? project.sequences.map((sequence) =>
                sequence.id === sequenceId ? { ...sequence, eventIds: withValue(sequence.eventIds, targetEventId) } : sequence,
              )
            : project.sequences,
          events: project.events.map((event) =>
            event.id === sourceEventId ? { ...event, transitions: [...(event.transitions ?? []), transition] } : event,
          ),
        },
        { type: "edge", id: `edge:transition:${transitionId}` },
      );
    },
    [nodes, project, updateProject],
  );

  const handleNodeDragStop = useCallback(
    (_: MouseEvent | TouchEvent | ReactMouseEvent, node: StoryCanvasNode) => {
      if (!project || node.data.kind !== "event") {
        return;
      }

      const eventId = nodeStoryId(node);
      const sequenceId = activeSequenceId(project);
      if (!eventId || !sequenceId) {
        return;
      }
      const branchNodes = nodes.filter((item) => item.data.kind === "branch");
      const absolute = node.parentId
        ? {
            x: (nodes.find((item) => item.id === node.parentId)?.position.x ?? 0) + node.position.x,
            y: (nodes.find((item) => item.id === node.parentId)?.position.y ?? 0) + node.position.y,
          }
        : node.position;
      const center = {
        x: absolute.x + Number(node.width ?? node.measured?.width ?? 230) / 2,
        y: absolute.y + Number(node.height ?? node.measured?.height ?? 118) / 2,
      };
      const targetBranch = branchNodes.find((branchNode) => isPointInside(branchNode, center.x, center.y));
      const targetBranchId = targetBranch?.id;
      const currentEvent = findEvent(project, eventId);

      if (!currentEvent || (currentEvent.branchRef ?? undefined) === targetBranchId) {
        return;
      }

      updateProject(
        {
          ...project,
          sequences: project.sequences.map((sequence) =>
            sequence.id === sequenceId
              ? {
                  ...sequence,
                  eventIds: withValue(sequence.eventIds, eventId),
                  branchIds: targetBranchId ? withValue(sequence.branchIds, targetBranchId) : sequence.branchIds,
                }
              : sequence,
          ),
          branches: project.branches.map((branch) => {
            if (branch.id === targetBranchId) {
              return { ...branch, eventIds: withValue(branch.eventIds, eventId) };
            }
            if (currentEvent.branchRef && branch.id === currentEvent.branchRef) {
              return { ...branch, eventIds: withoutValue(branch.eventIds, eventId) };
            }
            return branch;
          }),
          events: project.events.map((event) => (event.id === eventId ? { ...event, branchRef: targetBranchId } : event)),
        },
        { type: "node", id: eventId },
      );
    },
    [nodes, project, updateProject],
  );

  const updateEdgeLabel = useCallback(
    (edgeId: string, label: string) => {
      if (!project) {
        return;
      }
      const transitionId = edgeId.startsWith("edge:transition:") ? edgeId.replace("edge:transition:", "") : undefined;
      if (!transitionId) {
        setEdges((currentEdges) =>
          currentEdges.map((edgeItem) =>
            edgeItem.id === edgeId ? { ...edgeItem, label, data: edgeItem.data ? { ...edgeItem.data, label } : edgeItem.data } : edgeItem,
          ),
        );
        return;
      }
      updateProject({
        ...project,
        events: project.events.map((event) => ({
          ...event,
          transitions: event.transitions?.map((transition) =>
            transition.id === transitionId ? { ...transition, label } : transition,
          ),
        })),
      });
    },
    [project, updateProject],
  );

  const resetLayout = useCallback(() => {
    if (!project) {
      return;
    }
    const resetProject = { ...project, canvas: { activeSequenceId: activeSequenceId(project) } };
    const model = buildStoryCanvasModel(resetProject);
    setProject(resetProject);
    setNodes(model.nodes);
    setEdges(model.edges);
    setFiles(model.files);
    setFileState((current) => ({ ...current, dirty: true }));
  }, [project]);

  const deleteSelection = useCallback(
    (targetSelection: Selection) => {
      if (!project || targetSelection.type !== "node") {
        return;
      }

      const id = targetSelection.id;
      const sequence = findSequence(project, id);
      if (sequence) {
        if (project.entrySequenceId === sequence.id || sequence.eventIds.length > 0) {
          setMessage("Sequence deletion is blocked while it is entry or still contains events.");
          return;
        }
        const nextSequences = project.sequences.filter((item) => item.id !== sequence.id);
        updateProject(
          {
            ...project,
            sequences: nextSequences,
            canvas: {
              ...project.canvas,
              activeSequenceId: project.canvas?.activeSequenceId === sequence.id ? nextSequences[0]?.id : project.canvas?.activeSequenceId,
            },
          },
          nextSequences[0] ? { type: "node", id: nextSequences[0].id } : undefined,
        );
        return;
      }

      const branch = findBranch(project, id);
      if (branch) {
        if (branch.eventIds.length > 0) {
          setMessage("Branch deletion is blocked while it still contains events.");
          return;
        }
        updateProject(
          {
            ...project,
            branches: project.branches.filter((item) => item.id !== branch.id),
            sequences: project.sequences.map((item) => ({ ...item, branchIds: withoutValue(item.branchIds, branch.id) })),
          },
          undefined,
        );
        setSelection(undefined);
        return;
      }

      const event = findEvent(project, id);
      if (event) {
        const incoming = project.events.some((item) => item.transitions?.some((transition) => transition.to === event.id));
        const outgoing = (event.transitions ?? []).length > 0;
        const entryOwner = project.sequences.find((item) => item.entryEventId === event.id);
        if (incoming || outgoing || entryOwner) {
          setMessage("Event deletion is blocked while it is connected or used as a sequence entry.");
          return;
        }
        updateProject(
          {
            ...project,
            sequences: project.sequences.map((item) => ({
              ...item,
              eventIds: withoutValue(item.eventIds, event.id),
            })),
            branches: project.branches.map((item) => ({ ...item, eventIds: withoutValue(item.eventIds, event.id) })),
            events: project.events.filter((item) => item.id !== event.id),
          },
          undefined,
        );
        setSelection(undefined);
      }
    },
    [project, updateProject],
  );

  const createKnowledgeObject = useCallback(() => {
    if (!project) {
      return;
    }

    const canonRefId = selection?.type === "canon" ? selection.id : undefined;
    const result = mutations.createKnowledgeObject(project, canonRefId);
    applyProject(result.project, { dirty: true });
    setDataOpen(true);
    if (result.selection) {
      setSelection(result.selection as Selection);
    }
  }, [applyProject, project, selection]);

  const toggleCanon = useCallback(() => {
    setCanonOpen((open) => {
      const nextOpen = !open;
      setProject((currentProject) =>
        currentProject ? { ...currentProject, panels: { ...currentProject.panels, canonOpen: nextOpen } } : currentProject,
      );
      setFileState((current) => ({ ...current, dirty: true }));
      return nextOpen;
    });
  }, []);

  const toggleFiles = useCallback(() => {
    setFilesOpen((open) => {
      const nextOpen = !open;
      setProject((currentProject) =>
        currentProject ? { ...currentProject, panels: { ...currentProject.panels, filesOpen: nextOpen } } : currentProject,
      );
      setFileState((current) => ({ ...current, dirty: true }));
      return nextOpen;
    });
  }, []);

  const handleFileSelect = useCallback(
    (id: string) => {
      const sequencePrefix = "file:sequence:";
      if (id.startsWith(sequencePrefix)) {
        setActiveSequence(id.slice(sequencePrefix.length));
        return;
      }

      const eventPrefix = "file:event:";
      if (id.startsWith(eventPrefix)) {
        setSelection({ type: "node", id: id.slice(eventPrefix.length) });
        return;
      }

      const dataPrefix = "file:data-object:";
      if (id.startsWith(dataPrefix)) {
        setSelection({ type: "dataObject", id: id.slice(dataPrefix.length) });
        setDataOpen(true);
        return;
      }

      setSelection({ type: "file", id });
    },
    [setActiveSequence],
  );

  if (error) {
    return (
      <>
        <div className="app-shell">
          <Topbar
            fileState={fileState}
            findings={[]}
            exportOpen={exportOpen}
            dataOpen={dataOpen}
            theme={settings.theme}
            onOpenProject={openProject}
            onSaveProject={saveProject}
            onSaveProjectAs={saveProjectAs}
            onExportRuntime={exportRuntime}
            onHome={() => setView("home")}
            onUndo={undoProject}
            onRedo={redoProject}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onReload={loadDemo}
            onCreateSequence={createSequence}
            onValidate={() => setSelection(undefined)}
            onToggleExport={() => setExportOpen((open) => !open)}
            onToggleData={() => setDataOpen((open) => !open)}
            onCreateDataObject={createKnowledgeObject}
            onResetLayout={resetLayout}
            onThemeChange={changeTheme}
          />
          <div className="error-state">{error}</div>
        </div>
        <DiscardChangesDialog open={Boolean(discardDialog)} onDiscard={() => resolveDiscardDialog(true)} onCancel={() => resolveDiscardDialog(false)} />
      </>
    );
  }

  if (!project) {
    return (
      <>
        <div className="app-shell">
          <Topbar
            fileState={fileState}
            findings={[]}
            exportOpen={exportOpen}
            dataOpen={dataOpen}
            theme={settings.theme}
            onOpenProject={openProject}
            onSaveProject={saveProject}
            onSaveProjectAs={saveProjectAs}
            onExportRuntime={exportRuntime}
            onHome={() => setView("home")}
            onUndo={undoProject}
            onRedo={redoProject}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onReload={loadDemo}
            onCreateSequence={createSequence}
            onValidate={() => setSelection(undefined)}
            onToggleExport={() => setExportOpen((open) => !open)}
            onToggleData={() => setDataOpen((open) => !open)}
            onCreateDataObject={createKnowledgeObject}
            onResetLayout={resetLayout}
            onThemeChange={changeTheme}
          />
          <div className="loading-state">Loading bridge demo project...</div>
        </div>
        <DiscardChangesDialog open={Boolean(discardDialog)} onDiscard={() => resolveDiscardDialog(true)} onCancel={() => resolveDiscardDialog(false)} />
      </>
    );
  }

  if (view === "home") {
    return (
      <>
        <HomeDashboard
          project={project}
          fileState={fileState}
          settings={settings}
          missingRecentProjects={missingRecentProjects}
          findings={findings}
          theme={settings.theme}
          onThemeChange={changeTheme}
          onEnterWorkspace={() => setView("workspace")}
          onOpenProject={openProject}
          onOpenRecentProject={openRecentProject}
          onRemoveRecentProject={removeRecentProject}
          onLoadDemo={loadDemo}
          onSaveProject={saveProject}
          onSaveProjectAs={saveProjectAs}
          onExportRuntime={exportRuntime}
        />
        <DiscardChangesDialog open={Boolean(discardDialog)} onDiscard={() => resolveDiscardDialog(true)} onCancel={() => resolveDiscardDialog(false)} />
      </>
    );
  }

  return (
    <>
      <div className="app-shell">
        <Topbar
        project={project}
        fileState={fileState}
        findings={findings}
        exportOpen={exportOpen}
        dataOpen={dataOpen}
        theme={settings.theme}
        onOpenProject={openProject}
        onSaveProject={saveProject}
        onSaveProjectAs={saveProjectAs}
        onExportRuntime={exportRuntime}
        onHome={() => setView("home")}
        onUndo={undoProject}
        onRedo={redoProject}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onReload={loadDemo}
        onCreateSequence={createSequence}
        onValidate={() => setSelection(undefined)}
        onToggleExport={() => setExportOpen((open) => !open)}
        onToggleData={() => setDataOpen((open) => !open)}
        onCreateDataObject={createKnowledgeObject}
        onResetLayout={resetLayout}
        onThemeChange={changeTheme}
      />

        <div
        className="workspace"
        style={{
          gridTemplateColumns: `${canonOpen ? "282px" : "36px"} ${filesOpen ? "282px" : "36px"} minmax(0, 1fr)`,
        }}
      >
        <CanonPanel
          project={project}
          open={canonOpen}
          selectedId={selection?.type === "canon" ? selection.id : undefined}
          onToggle={toggleCanon}
          onSelect={(id) => setSelection({ type: "canon", id })}
        />
        <FilesPanel
          files={files}
          open={filesOpen}
          selectedId={selection?.type === "file" ? selection.id : `file:sequence:${activeSequenceId(project) ?? ""}`}
          onToggle={toggleFiles}
          onSelect={handleFileSelect}
        />
        <StoryCanvas
          project={project}
          files={files}
          nodes={nodes}
          edges={edges}
          selection={selection}
          findings={findings}
          message={message}
          canvasMode={canvasMode}
          focusNodeId={focusNodeId}
          exportOpen={exportOpen}
          exportPreviewMode={exportPreviewMode}
          dataOpen={dataOpen}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onNodeDragStop={handleNodeDragStop}
          onSelect={setSelection}
          onEnterFocus={enterFocus}
          onExitFocus={exitFocus}
          onExportPreviewModeChange={setExportPreviewMode}
          onToggleData={() => setDataOpen((open) => !open)}
          onCreateBranch={createBranch}
          onCreateEvent={createEvent}
          onUpdateSequence={updateSequence}
          onSetEntrySequence={setEntrySequence}
          onUpdateBranch={updateBranch}
          onCreateEventInBranch={createEventInBranch}
          onUpdateEvent={updateEvent}
          onCreateDecision={createDecision}
          onUpdateDecision={updateDecision}
          onDeleteDecision={deleteDecision}
          onCreateOutcome={createOutcome}
          onUpdateOutcome={updateOutcome}
          onDeleteOutcome={deleteOutcome}
          onUpdateTransition={updateTransition}
          onDeleteTransition={deleteTransition}
          onUpdateDataObject={updateDataObject}
          onDeleteDataObject={deleteDataObject}
          onUpdateEdgeLabel={updateEdgeLabel}
          onDeleteSelection={deleteSelection}
        />
        </div>
      </div>
      <DiscardChangesDialog open={Boolean(discardDialog)} onDiscard={() => resolveDiscardDialog(true)} onCancel={() => resolveDiscardDialog(false)} />
    </>
  );
}
