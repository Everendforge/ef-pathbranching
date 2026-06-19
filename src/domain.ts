export type CanonRef = {
  id: string;
  kind?: string;
  source?: "worldnotion" | "engine-legacy" | "manual" | string;
};

export type ScriptRef = {
  id: string;
  format: "ink" | string;
  sourcePath?: string;
  compiledPath?: string;
  entrySection?: string;
};

export type FieldType =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "multiSelect"
  | "canonRef"
  | "canonRefList"
  | "dataRef"
  | "dataRefList"
  | "scriptRef"
  | "unknown"
  | string;

export type DataFieldDefinition = {
  name: string;
  type: FieldType;
  label?: string;
  description?: string;
  required?: boolean;
  options?: string[];
  acceptedClasses?: string[];
  defaultValue?: unknown;
};

export type DataClassDefinition = {
  id: string;
  label: string;
  description?: string;
  extends?: string;
  category?: "canonProjection" | "narrative" | "runtime" | "engineAdapter" | string;
  roles?: string[];
  fields: DataFieldDefinition[];
};

export type ProjectionFieldMapping = {
  targetField: string;
  sourcePath?: string;
  value?: unknown;
  transform?: string;
  required?: boolean;
};

export type ProjectionRule = {
  id: string;
  label?: string;
  from: {
    layer: "worldnotion" | "pathbranching" | "engine" | string;
    type?: string;
    classId?: string;
    role?: string;
  };
  to: {
    layer: "pathbranching" | "engine" | string;
    classId: string;
    adapter?: string;
  };
  fieldMappings: ProjectionFieldMapping[];
  conditions?: Condition[];
};

export type GraphPortDefinition = {
  id: string;
  label?: string;
  direction: "input" | "output";
  accepts?: string[];
  required?: boolean;
};

export type GraphModuleDefinition = {
  id: string;
  label: string;
  graph:
    | "narrative"
    | "script"
    | "data"
    | "projection"
    | "engine"
    | string;
  nodeType: string;
  description?: string;
  dataClassId?: string;
  ports: GraphPortDefinition[];
  exportAs?: {
    layer: "runtimePackage" | "engineAdapter" | string;
    type: string;
  };
};

export type Sequence = {
  id: string;
  name: string;
  characterRef?: string;
  entryEventId: string;
  eventIds: string[];
  legacyUnity?: Record<string, unknown>;
};

export type Branch = {
  id: string;
  title: string;
  description?: string;
  eventIds: string[];
  legacyUnity?: Record<string, unknown>;
};

export type EventType = "normal" | "exploration" | "final" | string;

export type EventNode = {
  id: string;
  legacyId?: string;
  name: string;
  type: EventType;
  branchRef?: string | null;
  script?: ScriptRef;
  canonRefs?: string[];
  decisions?: Decision[];
  unlocks?: Consequence[];
  transitions?: Transition[];
  legacyUnity?: Record<string, unknown>;
};

export type DecisionType = "dialogue" | "dice" | "qte" | string;

export type Decision = {
  id: string;
  name: string;
  description?: string;
  type: DecisionType;
  outcomes: Outcome[];
};

export type Outcome = {
  id: string;
  name: string;
  description?: string;
  requiredCanonRefs?: string[];
  conditions?: Condition[];
  consequences?: Consequence[];
};

export type Condition =
  | {
      type: "canonEntryUnlocked";
      ref: string;
      negate?: boolean;
    }
  | {
      type: "variable";
      name: string;
      operator: "==" | "!=" | ">" | ">=" | "<" | "<=";
      value: unknown;
    }
  | {
      type: "externalFunction";
      name: string;
      arguments?: unknown[];
    }
  | {
      type: string;
      [key: string]: unknown;
    };

export type Consequence =
  | {
      type: "unlockCanonEntry";
      ref: string;
      sourceFunction?: string;
    }
  | {
      type: "setVariable";
      name: string;
      value: unknown;
    }
  | {
      type: "externalFunction";
      name: string;
      arguments?: unknown[];
    }
  | {
      type: "engineSignal";
      name: string;
      arguments?: unknown[];
    }
  | {
      type: string;
      [key: string]: unknown;
    };

export type Transition = {
  id: string;
  from: string;
  to: string;
  label?: string;
  conditions?: Condition[];
  consequences?: Consequence[];
  source?: "graph" | "inkDivert" | "inkExternalFunction" | "engine" | string;
  function?: string;
  arguments?: unknown[];
};

export type ExternalFunction = {
  name: string;
  kind: "condition" | "consequence" | "transition" | "runtimeAction" | "engineSignal" | string;
  mapsTo?: string;
  arguments?: Array<{
    name: string;
    type: "string" | "number" | "boolean" | "unknown" | string;
  }>;
};

export type EngineTarget = {
  adapter: string;
  minimumAdapterVersion?: string;
  [key: string]: unknown;
};

export type CanvasNodeAuthoringState = {
  position?: {
    x: number;
    y: number;
  };
  collapsed?: boolean;
};

export type CanvasAuthoringState = {
  nodes?: Record<string, CanvasNodeAuthoringState>;
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
};

export type PanelAuthoringState = {
  canonOpen?: boolean;
  filesOpen?: boolean;
};

export type BranchingProject = {
  specVersion: "0.1";
  projectId: string;
  name?: string;
  sourceVault?: {
    kind: "worldnotion" | string;
    relativePath?: string;
    absolutePath?: string;
  };
  dataClasses?: DataClassDefinition[];
  projectionRules?: ProjectionRule[];
  graphModules?: GraphModuleDefinition[];
  canvas?: CanvasAuthoringState;
  panels?: PanelAuthoringState;
  entrySequenceId?: string;
  canonRefs: CanonRef[];
  sequences: Sequence[];
  branches: Branch[];
  events: EventNode[];
  scripts: ScriptRef[];
  externalFunctions: ExternalFunction[];
  variables: Record<string, unknown>;
  engineTargets?: Record<string, EngineTarget>;
};

export type RuntimeChoice = {
  id: string;
  textKey: string;
  targetNodeId: string;
  conditions?: Condition[];
  consequences?: Consequence[];
};

export type RuntimeNode = {
  id: string;
  type: string;
  textKey?: string;
  speakerRef?: string;
  choices?: RuntimeChoice[];
  conditions?: Condition[];
  consequences?: Consequence[];
  [key: string]: unknown;
};

export type RuntimePackage = {
  specVersion: "0.1";
  packageId: string;
  entryNodeId: string;
  canonRefs: CanonRef[];
  variables: Record<string, unknown>;
  localization?: Record<string, string>;
  nodes: RuntimeNode[];
  pathBranching?: Record<string, unknown>;
  engineTargets?: Record<string, EngineTarget>;
};

export type ValidationSeverity = "info" | "warning" | "error";

export type ValidationFinding = {
  code:
    | "missing_entry_sequence"
    | "missing_entry_event"
    | "missing_event"
    | "missing_script"
    | "missing_canon_ref"
    | "duplicate_id"
    | "broken_transition"
    | "invalid_projection";
  severity: ValidationSeverity;
  message: string;
  id?: string;
  ref?: string;
};
