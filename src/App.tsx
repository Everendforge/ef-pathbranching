import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type OnConnect,
  Handle,
  Position,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BranchingProject, EventNode, Sequence, ValidationFinding } from "./domain";
import { exportRuntimePackage } from "./exportRuntime";
import { validateProject } from "./validate";
import {
  buildStoryCanvasModel,
  validateStoryCanvasEdges,
  type PathBranchingFileItem,
  type StoryCanvasEdge,
  type StoryCanvasNode,
  type StoryCanvasNodeData,
} from "./canvas/storyCanvasModel";

type Selection =
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "canon"; id: string }
  | { type: "file"; id: string };

const DEMO_PROJECT_PATH = "/examples/worldnotion-bridge-demo-project.json";

function badgeText(value: string) {
  return value.length > 22 ? `${value.slice(0, 19)}...` : value;
}

function StoryNode({ data, selected }: NodeProps<StoryCanvasNode>) {
  const nodeData = data as StoryCanvasNodeData;

  return (
    <div className={`story-node ${nodeData.kind}${selected ? " selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
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
      <Handle type="source" position={Position.Right} />
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

function Topbar({
  project,
  findings,
  exportOpen,
  onReload,
  onValidate,
  onToggleExport,
  onResetLayout,
}: {
  project?: BranchingProject;
  findings: ValidationFinding[];
  exportOpen: boolean;
  onReload: () => void;
  onValidate: () => void;
  onToggleExport: () => void;
  onResetLayout: () => void;
}) {
  const errorCount = findings.filter((finding) => finding.severity === "error").length;
  const status = findings.length === 0 ? "Clean" : `${findings.length} findings`;

  return (
    <header className="topbar">
      <div className="brand">
        <strong>Everend PathBranching</strong>
        <span>
          {project?.name ?? "Loading project"} - Story flow first - {status}
          {errorCount > 0 ? ` (${errorCount} errors)` : ""}
        </span>
      </div>
      <div className="topbar-actions">
        <button type="button" onClick={onReload}>
          Load Demo
        </button>
        <button type="button" onClick={onValidate}>
          Validate
        </button>
        <button type="button" onClick={onToggleExport}>
          {exportOpen ? "Hide Export" : "Export Preview"}
        </button>
        <button type="button" onClick={onResetLayout}>
          Reset Layout
        </button>
      </div>
    </header>
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
  children: React.ReactNode;
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

function Inspector({
  project,
  nodes,
  edges,
  files,
  selection,
  findings,
  exportOpen,
  onClose,
}: {
  project: BranchingProject;
  nodes: StoryCanvasNode[];
  edges: StoryCanvasEdge[];
  files: PathBranchingFileItem[];
  selection?: Selection;
  findings: ValidationFinding[];
  exportOpen: boolean;
  onClose: () => void;
}) {
  const runtimePackage = useMemo(() => exportRuntimePackage(project), [project]);
  const selectedNode = selection?.type === "node" ? nodes.find((node) => node.id === selection.id) : undefined;
  const selectedEdge = selection?.type === "edge" ? edges.find((edgeItem) => edgeItem.id === selection.id) : undefined;
  const selectedCanon =
    selection?.type === "canon" ? project.canonRefs.find((canonRef) => canonRef.id === selection.id) : undefined;
  const selectedFile = selection?.type === "file" ? files.find((file) => file.id === selection.id) : undefined;

  const sequence = selectedNode ? findSequence(project, selectedNode.id) : undefined;
  const event = selectedNode ? findEvent(project, selectedNode.id) : undefined;

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
            <h2>{sequence.name}</h2>
            <dl>
              <div>
                <dt>ID</dt>
                <dd>{sequence.id}</dd>
              </div>
              <div>
                <dt>Entry Event</dt>
                <dd>{sequence.entryEventId}</dd>
              </div>
              <div>
                <dt>Character Ref</dt>
                <dd>{sequence.characterRef ?? "none"}</dd>
              </div>
              <div>
                <dt>Events</dt>
                <dd>{sequence.eventIds.length}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        {event ? (
          <>
            <section className="inspector-section">
              <h2>{event.name}</h2>
              <dl>
                <div>
                  <dt>ID</dt>
                  <dd>{event.id}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{event.type}</dd>
                </div>
                <div>
                  <dt>Engine Target</dt>
                  <dd>{project.engineTargets?.unity?.adapter ?? "none"}</dd>
                </div>
              </dl>
            </section>

            <section className="inspector-section">
              <h2>Canon Refs</h2>
              <div className="tag-list">
                {(event.canonRefs ?? []).map((ref) => (
                  <span key={ref}>{canonDisplay(project, ref)}</span>
                ))}
              </div>
            </section>

            <section className="inspector-section">
              <h2>Script</h2>
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
          </>
        ) : null}

        {selectedNode && !sequence && !event ? (
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
          <section className="inspector-section">
            <h2>{selectedEdge.data?.label ?? selectedEdge.label ?? "Edge"}</h2>
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
          </section>
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
          <h2>Runtime Export</h2>
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
          </dl>
          {exportOpen ? <pre>{JSON.stringify(runtimePackage, null, 2)}</pre> : null}
        </section>
      </div>
    </aside>
  );
}

function StoryCanvas({
  project,
  files,
  nodes,
  edges,
  selection,
  findings,
  exportOpen,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelect,
}: {
  project: BranchingProject;
  files: PathBranchingFileItem[];
  nodes: StoryCanvasNode[];
  edges: StoryCanvasEdge[];
  selection?: Selection;
  findings: ValidationFinding[];
  exportOpen: boolean;
  onNodesChange: (changes: NodeChange<StoryCanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<StoryCanvasEdge>[]) => void;
  onConnect: OnConnect;
  onSelect: (selection?: Selection) => void;
}) {
  return (
    <main className="canvas-shell">
      <div className="canvas-status">
        <strong>{project.name ?? project.projectId}</strong>
        <span>
          {nodes.length} nodes - {edges.length} links - {project.canonRefs.length} canon refs
        </span>
      </div>

      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => onSelect({ type: "node", id: node.id })}
          onEdgeClick={(_, edgeItem) => onSelect({ type: "edge", id: edgeItem.id })}
          onPaneClick={() => onSelect(undefined)}
          fitView
          fitViewOptions={{ padding: 0.24 }}
          defaultViewport={project.canvas?.viewport}
        >
          <MiniMap pannable zoomable nodeStrokeWidth={3} />
          <Controls />
          <Background gap={28} size={1} />
        </ReactFlow>
      </ReactFlowProvider>

      <Inspector
        project={project}
        nodes={nodes}
        edges={edges}
        files={files}
        selection={selection}
        findings={findings}
        exportOpen={exportOpen}
        onClose={() => onSelect(undefined)}
      />
    </main>
  );
}

export function App() {
  const [project, setProject] = useState<BranchingProject>();
  const [nodes, setNodes] = useState<StoryCanvasNode[]>([]);
  const [edges, setEdges] = useState<StoryCanvasEdge[]>([]);
  const [files, setFiles] = useState<PathBranchingFileItem[]>([]);
  const [selection, setSelection] = useState<Selection>();
  const [canonOpen, setCanonOpen] = useState(true);
  const [filesOpen, setFilesOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [error, setError] = useState<string>();

  const loadDemo = useCallback(async () => {
    try {
      const response = await fetch(DEMO_PROJECT_PATH);
      if (!response.ok) {
        throw new Error(`Could not load demo project: ${response.status}`);
      }

      const loadedProject = (await response.json()) as BranchingProject;
      const model = buildStoryCanvasModel(loadedProject);
      setProject(loadedProject);
      setNodes(model.nodes);
      setEdges(model.edges);
      setFiles(model.files);
      setCanonOpen(loadedProject.panels?.canonOpen ?? true);
      setFilesOpen(loadedProject.panels?.filesOpen ?? true);
      setSelection({ type: "node", id: loadedProject.entrySequenceId ?? loadedProject.sequences[0]?.id ?? model.nodes[0]?.id });
      setError(undefined);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, []);

  useEffect(() => {
    void loadDemo();
  }, [loadDemo]);

  const findings = useMemo(() => {
    if (!project) {
      return [];
    }
    return [...validateProject(project), ...validateStoryCanvasEdges(nodes, edges)];
  }, [project, nodes, edges]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<StoryCanvasNode>[]) => {
      setNodes((currentNodes) => {
        const nextNodes = applyNodeChanges(changes, currentNodes);
        setProject((currentProject) => (currentProject ? updateProjectCanvas(currentProject, nextNodes) : currentProject));
        return nextNodes;
      });
    },
    [setProject],
  );

  const handleEdgesChange = useCallback((changes: EdgeChange<StoryCanvasEdge>[]) => {
    setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges));
  }, []);

  const handleConnect = useCallback<OnConnect>((connection: Connection) => {
    setEdges((currentEdges) =>
      addEdge(
        {
          ...connection,
          id: `edge:draft:${connection.source}:${connection.target}:${Date.now()}`,
          label: "draft transition",
          data: { kind: "transition", label: "draft transition" },
          animated: true,
        },
        currentEdges,
      ),
    );
  }, []);

  const resetLayout = useCallback(() => {
    if (!project) {
      return;
    }
    const resetProject = { ...project, canvas: undefined };
    const model = buildStoryCanvasModel(resetProject);
    setProject(resetProject);
    setNodes(model.nodes);
    setEdges(model.edges);
    setFiles(model.files);
  }, [project]);

  const toggleCanon = useCallback(() => {
    setCanonOpen((open) => {
      const nextOpen = !open;
      setProject((currentProject) =>
        currentProject ? { ...currentProject, panels: { ...currentProject.panels, canonOpen: nextOpen } } : currentProject,
      );
      return nextOpen;
    });
  }, []);

  const toggleFiles = useCallback(() => {
    setFilesOpen((open) => {
      const nextOpen = !open;
      setProject((currentProject) =>
        currentProject ? { ...currentProject, panels: { ...currentProject.panels, filesOpen: nextOpen } } : currentProject,
      );
      return nextOpen;
    });
  }, []);

  if (error) {
    return (
      <div className="app-shell">
        <Topbar
          findings={[]}
          exportOpen={exportOpen}
          onReload={loadDemo}
          onValidate={() => setSelection(undefined)}
          onToggleExport={() => setExportOpen((open) => !open)}
          onResetLayout={resetLayout}
        />
        <div className="error-state">{error}</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="app-shell">
        <Topbar
          findings={[]}
          exportOpen={exportOpen}
          onReload={loadDemo}
          onValidate={() => setSelection(undefined)}
          onToggleExport={() => setExportOpen((open) => !open)}
          onResetLayout={resetLayout}
        />
        <div className="loading-state">Loading bridge demo project...</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Topbar
        project={project}
        findings={findings}
        exportOpen={exportOpen}
        onReload={loadDemo}
        onValidate={() => setSelection(undefined)}
        onToggleExport={() => setExportOpen((open) => !open)}
        onResetLayout={resetLayout}
      />

      <div
        className="workspace"
        style={{
          gridTemplateColumns: `${canonOpen ? "286px" : "44px"} ${filesOpen ? "318px" : "44px"} minmax(0, 1fr)`,
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
          selectedId={selection?.type === "file" ? selection.id : undefined}
          onToggle={toggleFiles}
          onSelect={(id) => setSelection({ type: "file", id })}
        />
        <StoryCanvas
          project={project}
          files={files}
          nodes={nodes}
          edges={edges}
          selection={selection}
          findings={findings}
          exportOpen={exportOpen}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onSelect={setSelection}
        />
      </div>
    </div>
  );
}
