export type CanonRef = {
  id: string;
  kind?: string;
  label?: string;
  preview?: string;
  tags?: string[];
  status?: string;
  aliases?: string[];
  parentId?: string;
  childrenIds?: string[];
  properties?: Record<string, unknown>;
  frontmatter?: Record<string, unknown>;
  favorite?: boolean;
  folderDescription?: boolean;
  missingIdentity?: boolean;
  identityWarning?: string;
  source?: "worldnotion" | "engine-legacy" | "manual" | string;
  canonSourcePath?: string;
  workingCopyPath?: string;
};

export type CanonEditSuggestionStatus =
  | "draft"
  | "proposed"
  | "sent-to-worldnotion"
  | "applied-in-worldnotion"
  | "dismissed"
  | string;

export type CanonEditSuggestion = {
  id: string;
  canonRefId: string;
  targetPath?: string;
  title: string;
  summary?: string;
  proposedContent: string;
  status: CanonEditSuggestionStatus;
  sourceEventId?: string;
  sourceDataObjectId?: string;
  createdAt?: string;
  updatedAt?: string;
  safety: "worldnotion-review-required" | string;
};

export type ScriptRef = {
  id: string;
  format: "ink" | string;
  sourcePath?: string;
  compiledPath?: string;
  entrySection?: string;
};

export type StoryTextBlock = {
  format: "plain" | "ink" | "harlowe" | "sugarcube" | string;
  content: string;
};

export type EventCategoryDefinition = {
  id: string;
  label: string;
  description?: string;
  color?: string;
  terminal?: boolean;
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
  acceptedCanonKinds?: string[];
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
  conditions?: ConditionInput;
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
  branchIds?: string[];
  availability?: ConditionInput;
  ruleSets?: RuleSet[];
  legacyUnity?: Record<string, unknown>;
};

export type Branch = {
  id: string;
  title: string;
  description?: string;
  color?: string;
  eventIds: string[];
  availability?: ConditionInput;
  ruleSets?: RuleSet[];
  legacyUnity?: Record<string, unknown>;
};

export type EventType = "normal" | "exploration" | "final" | string;

export type EventNode = {
  id: string;
  legacyId?: string;
  name: string;
  type: EventType;
  text?: StoryTextBlock;
  branchRef?: string | null;
  script?: ScriptRef;
  canonRefs?: string[];
  availability?: ConditionInput;
  decisions?: Decision[];
  unlocks?: Consequence[];
  transitions?: Transition[];
  ruleSets?: RuleSet[];
  legacyUnity?: Record<string, unknown>;
};

export type DecisionType = "dialogue" | "dice" | "qte" | string;

export type Decision = {
  id: string;
  name: string;
  description?: string;
  type: DecisionType;
  availability?: ConditionInput;
  ruleSets?: RuleSet[];
  outcomes: Outcome[];
};

export type Outcome = {
  id: string;
  name: string;
  description?: string;
  requiredCanonRefs?: string[];
  conditions?: ConditionInput;
  consequences?: Consequence[];
  ruleSets?: RuleSet[];
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
      type: "dataObjectExists";
      objectId: string;
    }
  | {
      type: "dataObjectField";
      objectId: string;
      field: string;
      operator: "==" | "!=" | ">" | ">=" | "<" | "<=" | "contains" | "exists";
      value?: unknown;
    }
  | {
      type: "runtimeItem";
      itemId: string;
      operator?: "has" | "missing";
    }
  | {
      type: "visited";
      targetType: "sequence" | "branch" | "event" | "decision" | "outcome";
      targetId: string;
      negate?: boolean;
    }
  | {
      type: string;
      [key: string]: unknown;
    };

export type ConditionSet =
  | {
      all: ConditionExpression[];
      label?: string;
    }
  | {
      any: ConditionExpression[];
      label?: string;
    }
  | {
      not: ConditionExpression;
      label?: string;
    };

export type ConditionExpression = Condition | ConditionSet;

export type ConditionInput = ConditionExpression | ConditionExpression[];

export type Consequence =
  | {
      type: "unlockCanonEntry";
      ref: string;
      sourceFunction?: string;
      conditions?: ConditionInput;
    }
  | {
      type: "setVariable";
      name: string;
      value: unknown;
      conditions?: ConditionInput;
    }
  | {
      type: "unlockDataObject";
      objectId: string;
      conditions?: ConditionInput;
    }
  | {
      type: "externalFunction";
      name: string;
      arguments?: unknown[];
      conditions?: ConditionInput;
    }
  | {
      type: "engineSignal";
      name: string;
      arguments?: unknown[];
      conditions?: ConditionInput;
    }
  | {
      type: string;
      [key: string]: unknown;
    };

export type RuleSet = {
  id: string;
  label?: string;
  when: ConditionInput;
  then: Consequence[];
  else?: Consequence[];
};

export type Transition = {
  id: string;
  from: string;
  to: string;
  label?: string;
  conditions?: ConditionInput;
  consequences?: Consequence[];
  source?: "graph" | "inkDivert" | "inkExternalFunction" | "engine" | string;
  function?: string;
  arguments?: unknown[];
};

export type ProjectDataObjectScope = {
  sequenceId?: string;
  branchId?: string;
  eventId?: string;
  global?: boolean;
};

export type ProjectDataObject = {
  id: string;
  classId: string;
  name: string;
  canonRefs?: string[];
  fields: Record<string, unknown>;
  tags?: string[];
  scope?: ProjectDataObjectScope;
  availability?: ConditionInput;
  ruleSets?: RuleSet[];
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
  activeSequenceId?: string;
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
  storyId?: string;
  universeRootPath?: string;
  name?: string;
  sourceVault?: {
    kind: "worldnotion" | string;
    relativePath?: string;
    absolutePath?: string;
  };
  dataClasses?: DataClassDefinition[];
  projectDataObjects?: ProjectDataObject[];
  canonEditSuggestions?: CanonEditSuggestion[];
  projectionRules?: ProjectionRule[];
  graphModules?: GraphModuleDefinition[];
  canvas?: CanvasAuthoringState;
  panels?: PanelAuthoringState;
  entrySequenceId?: string;
  eventCategories?: EventCategoryDefinition[];
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
  conditions?: ConditionInput;
  consequences?: Consequence[];
};

export type RuntimeNode = {
  id: string;
  type: string;
  textKey?: string;
  speakerRef?: string;
  choices?: RuntimeChoice[];
  conditions?: ConditionInput;
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
    | "missing_branch"
    | "missing_canon_ref"
    | "missing_canon_identity"
    | "duplicate_id"
    | "broken_transition"
    | "invalid_branch_membership"
    | "invalid_final_transition"
    | "invalid_projection"
    | "missing_data_class"
    | "missing_data_object"
    | "missing_required_field"
    | "invalid_frontmatter"
    | "invalid_worldnotion_properties"
    | "invalid_condition"
    | "invalid_rule_set";
  severity: ValidationSeverity;
  message: string;
  id?: string;
  ref?: string;
};
