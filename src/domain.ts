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
  canonSourceModifiedMs?: number;
  workingCopyPath?: string;
};

export type CanonChangeSetStatus =
  "draft" | "proposed" | "conflicted" | "applied" | "dismissed";

export type CanonChangeSet = {
  specVersion: "0.1";
  id: string;
  kind: "canon-change-set";
  sourceApp: "pathbranching" | "worldnotion" | string;
  target: { entityId: string; path: string };
  base: {
    content: string;
    modifiedMs?: number;
    contentHash: string;
    capturedAt: string;
  };
  proposed: { content: string; diff?: string };
  status: CanonChangeSetStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
  appliedAt?: string;
  appliedBy?: string;
  note?: string;
};

export type CanonWorkingCopy = {
  canonRefId: string;
  sourcePath: string;
  sourceModifiedMs?: number;
  sourceContent: string;
  draftContent: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  legacy?: boolean;
};

export type LocalExplorerEntity = {
  id: string;
  type: string;
  name: string;
  status: string;
  tags?: string[];
  aliases?: string[];
  properties?: Record<string, unknown>;
  body?: string;
  createdAt: string;
  updatedAt: string;
  exportedPath?: string;
  publishedPath?: string;
  publishedAt?: string;
};

export type LocalExplorerType = {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  color?: string;
  suggestedFolder?: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalExplorerProperty = {
  id: string;
  label: string;
  valueType: string;
  description?: string;
  appliesToTypes?: string[];
  createdAt: string;
  updatedAt: string;
};

export type AssetKind = "image" | "video" | "audio" | "document" | "other";
export type ProjectAsset = {
  id: string;
  name: string;
  path: string;
  kind: AssetKind;
  origin: "canon" | "uncanon";
  extension?: string;
  size?: number;
  importedAt?: string;
  tags?: string[];
};

export type LogicVariableType = "text" | "number" | "boolean" | "list" | "canonRef";
export type LogicVariableGroup = { id: string; name: string; order: number };
export type LogicVariable = {
  id: string;
  name: string;
  type: LogicVariableType;
  value: string | number | boolean | string[];
  groupId: string;
  description?: string;
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

export type LogicPropertyOverride = {
  propertyId: string;
  source: "canon" | "local";
  conditionReadable?: boolean;
  actionWritable?: boolean;
  grantable?: boolean;
  relationTargetTypes?: string[];
};

export type PlayerSimulationState = {
  inventory?: string[];
  unlockedCanonRefs?: string[];
  variables?: Record<string, unknown>;
  visited?: string[];
  activeNodeId?: string;
  activeDecisionId?: string;
};

export type PlayerProfile = {
  id: string;
  name: string;
  playableCharacterRef?: string;
  simulation: PlayerSimulationState;
};

export type ScriptBlockKind = "scene" | "direction" | "speech" | "annotation";

export type ScriptBlock = {
  id: string;
  kind: ScriptBlockKind;
  content: string;
  /** Localized alternatives keyed by language code; `content` remains the primary text. */
  translations?: Record<string, string>;
  speakerRef?: string;
};

export type ScriptDocument = {
  id: string;
  name: string;
  format: "forge-script";
  blocks: ScriptBlock[];
  createdAt?: string;
  updatedAt?: string;
};

export type ScriptBlockRef = {
  scriptId: string;
  blockId: string;
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
  category?:
    "canonProjection" | "narrative" | "runtime" | "engineAdapter" | string;
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
  graph: "narrative" | "script" | "data" | "projection" | "engine" | string;
  nodeType: string;
  description?: string;
  dataClassId?: string;
  ports: GraphPortDefinition[];
  exportAs?: {
    layer: "runtimePackage" | "engineAdapter" | string;
    type: string;
  };
};

export type CanvasScope =
  | {
      kind: "sequence";
      id: string;
    }
  | {
      kind: "event";
      id: string;
    }
  | {
      kind: "dialogue";
      id: string;
      eventId: string;
    };

export type Sequence = {
  id: string;
  name: string;
  characterRef?: string;
  entryEventId: string;
  entryLabel?: string;
  eventIds: string[];
  branchIds?: string[];
  availability?: ConditionInput;
  ruleSetBindings?: RuleSetBinding[];
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
  ruleSetBindings?: RuleSetBinding[];
  ruleSets?: RuleSet[];
  legacyUnity?: Record<string, unknown>;
};

export type EventType = "normal" | "exploration" | "final" | string;

export type EventNode = {
  id: string;
  legacyId?: string;
  name: string;
  description?: string;
  type: EventType;
  parentEventId?: string;
  childEventIds?: string[];
  text?: StoryTextBlock;
  branchRef?: string | null;
  script?: ScriptRef;
  canonRefs?: string[];
  availability?: ConditionInput;
  decisions?: Decision[];
  /** Narrative beats authored directly on the event canvas. */
  dialogueBeats?: DialogueBeat[];
  dialogues?: DialogueNode[];
  boundaryBindings?: BoundaryPortBinding[];
  unlocks?: Consequence[];
  transitions?: Transition[];
  ruleSetBindings?: RuleSetBinding[];
  ruleSets?: RuleSet[];
  legacyUnity?: Record<string, unknown>;
};

export type DecisionType = "dialogue" | "dice" | "qte" | string;
export type OutcomePresentationStyle = "visibleText" | "followUpText" | "iconOnly";

export type Decision = {
  id: string;
  name: string;
  description?: string;
  type: DecisionType;
  optionStyle?: OutcomePresentationStyle;
  /** @deprecated Legacy grouping only. Decisions now belong directly to the event. */
  dialogueId?: string;
  availability?: ConditionInput;
  ruleSetBindings?: RuleSetBinding[];
  ruleSets?: RuleSet[];
  outcomes: Outcome[];
};

export type DialogueNode = {
  id: string;
  title: string;
  entryBeatId?: string;
  beats?: DialogueBeat[];
  speakerRef?: string;
  text: StoryTextBlock;
  availability?: ConditionInput;
  ruleSetBindings?: RuleSetBinding[];
  ruleSets?: RuleSet[];
  canonRefs?: string[];
};

export type DialogueBeat = {
  id: string;
  kind: "speech" | "direction";
  blockRef: ScriptBlockRef;
  displayCondition?: ConditionInput;
  ruleSetBindings?: RuleSetBinding[];
  ruleSets?: RuleSet[];
};

export type BoundaryPortBinding = {
  id: string;
  portId: string;
  nodeId: string;
  direction: "input" | "output";
};

export type Outcome = {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  requiredCanonRefs?: string[];
  availability?: ConditionInput;
  unavailableBehavior?: "locked" | "hidden";
  lockText?: StoryTextBlock;
  conditions?: ConditionInput;
  consequences?: Consequence[];
  ruleSetBindings?: RuleSetBinding[];
  ruleSets?: RuleSet[];
};

export type Condition =
  | {
      type: "canonEntryUnlocked";
      ref: string;
      negate?: boolean;
    }
  | {
      type: "canonProperty";
      ref: string;
      property: string;
      operator: "==" | "!=" | ">" | ">=" | "<" | "<=" | "contains" | "exists";
      value?: unknown;
    }
  | {
      type: "canonState";
      ref: string;
      state: string;
      operator: "==" | "!=" | "contains" | "exists";
      value?: unknown;
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
  order?: number;
  mode?: "conditional" | "fallback";
  conditions?: ConditionInput;
  consequences?: Consequence[];
  source?: "graph" | "inkDivert" | "inkExternalFunction" | "engine" | string;
  function?: string;
  arguments?: unknown[];
};

export type RuleSetPhase = "onEnter" | "onExit" | "onDisplay" | "onSelect" | "onCreate";

export type RuleSetBinding = {
  id: string;
  ruleId: string;
  phase: RuleSetPhase;
  order: number;
};

export type RuleLibraryGroup = {
  id: string;
  name: string;
  order: number;
};

export type RuleLibraryRule = RuleSet & {
  groupId: string;
  tags?: string[];
};

export type RuleLibrary = {
  groups: RuleLibraryGroup[];
  rules: RuleLibraryRule[];
};

export type CanonRoleMapping = {
  id: string;
  worldnotionTypes: string[];
  classId: string;
  roles: string[];
  comparableProperties?: string[];
  states?: string[];
};

export type PathBranchingIntegrationConfig = {
  specVersion: "0.1";
  mappings: CanonRoleMapping[];
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
  ruleSetBindings?: RuleSetBinding[];
  ruleSets?: RuleSet[];
};

export type ExternalFunction = {
  name: string;
  kind:
    | "condition"
    | "consequence"
    | "transition"
    | "runtimeAction"
    | "engineSignal"
    | string;
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

export type ScopedCanvasAuthoringState = {
  nodes?: Record<string, CanvasNodeAuthoringState>;
  routeGateSources?: string[];
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
};

export type CanvasAuthoringState = {
  activeSequenceId?: string;
  activeScope?: CanvasScope;
  nodes?: Record<string, CanvasNodeAuthoringState>;
  routeGateSources?: string[];
  scopes?: Record<string, ScopedCanvasAuthoringState>;
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
  canonWorkingCopies?: CanonWorkingCopy[];
  canonChangeSets?: CanonChangeSet[];
  localExplorerEntities?: LocalExplorerEntity[];
  localExplorerTypes?: LocalExplorerType[];
  localExplorerProperties?: LocalExplorerProperty[];
  assets?: ProjectAsset[];
  scriptDocuments?: ScriptDocument[];
  integrationConfig?: PathBranchingIntegrationConfig;
  integrationConfigOverride?: PathBranchingIntegrationConfig;
  logicVariableGroups?: LogicVariableGroup[];
  logicVariables?: LogicVariable[];
  logicPropertyOverrides?: LogicPropertyOverride[];
  playerSimulation?: PlayerSimulationState;
  playerProfiles?: PlayerProfile[];
  activePlayerProfileId?: string;
  ruleLibrary?: RuleLibrary;
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
  unavailableBehavior?: "locked" | "hidden";
  lockTextKey?: string;
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
    | "missing_dialogue"
    | "missing_script"
    | "missing_branch"
    | "missing_canon_ref"
    | "missing_canon_identity"
    | "duplicate_id"
    | "broken_transition"
    | "invalid_branch_membership"
    | "invalid_nested_event"
    | "invalid_boundary_binding"
    | "invalid_final_transition"
    | "invalid_projection"
    | "missing_data_class"
    | "missing_data_object"
    | "missing_required_field"
    | "invalid_frontmatter"
    | "invalid_worldnotion_properties"
    | "invalid_condition"
    | "invalid_rule_set"
    | "missing_rule_set"
    | "invalid_rule_set_binding"
    | "invalid_transition_order"
    | "duplicate_fallback"
    | "no_valid_transition"
    | "missing_script_block"
    | "orphan_script_block"
    | "duplicate_script_binding"
    | "invalid_speaker_role"
    | "invalid_scope_transition";
  severity: ValidationSeverity;
  message: string;
  id?: string;
  ref?: string;
};
