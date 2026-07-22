import type {
  AuthoringPreferences,
  BranchingProject,
  DataClassDefinition,
  DialogueNode,
  EventCategoryDefinition,
  EventNode,
  LogicVariable,
  LogicVariableGroup,
  LogicPropertyOverride,
  LogicEffect,
  LogicPredicate,
  LogicTypeOverride,
  ScriptDocument,
  SpeechBeatCounterPreference,
  Transition,
} from "./domain.js";
import { normalizeBranchMembership } from "./storyOutlineModel.js";
import { DEFAULT_INTEGRATION_CONFIG, normalizeIntegrationConfig } from "./integrationConfig.js";
import { migrateProjectTypesToProperties } from "./explorerSchema.js";
import { inferredTransitionRole, migrateLogicMoment, walkConditions } from "./logic.js";

function normalizeLogicCapabilities(project: BranchingProject): {
  logicPropertyOverrides: LogicPropertyOverride[];
  logicTypeOverrides: LogicTypeOverride[];
} {
  const types = new Map<string, LogicTypeOverride>();
  (project.logicTypeOverrides ?? []).forEach((override) => {
    const typeId = override.typeId.startsWith("type:") ? override.typeId.slice("type:".length) : override.typeId;
    types.set(`${override.source}:${typeId}`, {
      ...override,
      typeId,
      runtimeRoles: override.runtimeRoles ?? (override.grantable ? ["owned"] : undefined),
    });
  });
  const properties = (project.logicPropertyOverrides ?? []).map((override) => {
    if (!override.propertyId.startsWith("type:")) return override;
    const typeId = override.propertyId.slice("type:".length);
    if (override.grantable || override.location || override.runtimeRoles?.length) {
      const key = `${override.source}:${typeId}`;
      const current = types.get(key);
      types.set(key, {
        typeId,
        source: override.source,
        grantable: current?.grantable ?? override.grantable,
        location: current?.location ?? override.location,
        runtimeRoles: current?.runtimeRoles ?? override.runtimeRoles ?? (override.grantable ? ["owned"] : undefined),
      });
    }
    const { grantable: _grantable, location: _location, runtimeRoles: _runtimeRoles, ...property } = override;
    return property;
  });
  return { logicPropertyOverrides: properties, logicTypeOverrides: Array.from(types.values()) };
}

export function projectFileName(path: string | undefined) {
  if (!path) {
    return "Untitled.pathbranching.json";
  }
  return path.split(/[\\/]/).pop() ?? path;
}

export const DEFAULT_EVENT_CATEGORIES: EventCategoryDefinition[] = [
  { id: "normal", label: "Event" },
  { id: "final", label: "Final", terminal: true },
];

export const DEFAULT_DATA_CLASSES: DataClassDefinition[] = [
  {
    id: "class:KnowledgeEntry",
    label: "Knowledge Entry",
    category: "canonProjection",
    roles: ["knowledge", "unlockable", "runtime"],
    fields: [
      { name: "title", type: "text", label: "Title", required: true },
      { name: "body", type: "text", label: "Body" },
      { name: "sourceRef", type: "canonRef", label: "Canon Source" },
      {
        name: "unlockedByDefault",
        type: "boolean",
        label: "Unlocked By Default",
        defaultValue: false,
      },
    ],
  },
  {
    id: "class:Speaker",
    label: "Speaker",
    category: "narrative",
    roles: ["speaker", "presentation"],
    fields: [
      {
        name: "displayName",
        type: "text",
        label: "Display Name",
        required: true,
      },
      { name: "canonRef", type: "canonRef", label: "Canon Source" },
      { name: "voice", type: "text", label: "Voice" },
    ],
  },
  {
    id: "class:RuntimeItem",
    label: "Runtime Item",
    category: "runtime",
    roles: ["condition", "inventory", "runtime"],
    fields: [
      {
        name: "displayName",
        type: "text",
        label: "Display Name",
        required: true,
      },
      {
        name: "itemId",
        type: "text",
        label: "Runtime Item ID",
        required: true,
      },
      {
        name: "startsOwned",
        type: "boolean",
        label: "Starts Owned",
        defaultValue: false,
      },
    ],
  },
  {
    id: "class:SceneSetting",
    label: "Scene Setting",
    category: "narrative",
    roles: ["scene", "presentation"],
    fields: [
      { name: "title", type: "text", label: "Title", required: true },
      { name: "canonRef", type: "canonRef", label: "Canon Source" },
      { name: "description", type: "text", label: "Description" },
    ],
  },
  {
    id: "class:QuestFlag",
    label: "Quest Flag",
    category: "runtime",
    roles: ["condition", "state", "runtime"],
    fields: [
      { name: "flag", type: "text", label: "Flag", required: true },
      {
        name: "initialValue",
        type: "boolean",
        label: "Initial Value",
        defaultValue: false,
      },
    ],
  },
];

function labelFromCategoryId(id: string) {
  return (
    id
      .split(/[-_:]/g)
      .filter(Boolean)
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(" ") || id
  );
}

export const DEFAULT_SPEECH_BEAT_COUNTER_PREFERENCE: SpeechBeatCounterPreference = {
  enabled: true,
  unit: "characters",
  target: 120,
};

function normalizeSpeechBeatCounterPreference(
  value: unknown,
): SpeechBeatCounterPreference {
  const source =
    value && typeof value === "object"
      ? (value as Partial<SpeechBeatCounterPreference>)
      : {};
  const target =
    typeof source.target === "number" && Number.isFinite(source.target)
      ? Math.min(2000, Math.max(1, Math.round(source.target)))
      : DEFAULT_SPEECH_BEAT_COUNTER_PREFERENCE.target;
  return {
    enabled:
      typeof source.enabled === "boolean"
        ? source.enabled
        : DEFAULT_SPEECH_BEAT_COUNTER_PREFERENCE.enabled,
    unit: source.unit === "words" ? "words" : "characters",
    target,
  };
}

function normalizeAuthoringPreferences(
  project: BranchingProject,
): AuthoringPreferences {
  return {
    speechBeatCounter: normalizeSpeechBeatCounterPreference(
      project.authoringPreferences?.speechBeatCounter,
    ),
  };
}

function normalizeEventCategories(
  project: BranchingProject,
): EventCategoryDefinition[] {
  const categories = new Map<string, EventCategoryDefinition>();
  DEFAULT_EVENT_CATEGORIES.forEach((category) =>
    categories.set(category.id, category),
  );
  (project.eventCategories ?? []).forEach((category) => {
    if (!category.id) return;
    const migratedLabel =
      category.id === "normal" && category.label === "Normal"
        ? "Event"
        : category.label;
    const { terminal, ...categoryWithoutTerminal } = category;
    categories.set(category.id, {
      ...categoryWithoutTerminal,
      label: migratedLabel || labelFromCategoryId(category.id),
      ...(category.id === "final"
        ? { terminal: true }
        : category.id !== "normal" && terminal !== undefined
          ? { terminal }
          : {}),
    });
  });
  (project.events ?? []).forEach((event) => {
    if (!event.type || categories.has(event.type)) return;
    categories.set(event.type, {
      id: event.type,
      label: labelFromCategoryId(event.type),
    });
  });
  return Array.from(categories.values());
}

function normalizeDataClasses(
  project: BranchingProject,
): DataClassDefinition[] {
  const classes = new Map<string, DataClassDefinition>();
  DEFAULT_DATA_CLASSES.forEach((dataClass) =>
    classes.set(dataClass.id, dataClass),
  );
  (project.dataClasses ?? []).forEach((dataClass) => {
    if (!dataClass.id) return;
    classes.set(dataClass.id, {
      ...dataClass,
      fields: dataClass.fields ?? [],
    });
  });
  return Array.from(classes.values());
}

function normalizeTransitionGroups(
  transitions: Transition[] | undefined,
  variables: LogicVariable[] = [],
): Transition[] {
  const next = (transitions ?? []).map((transition, index) => ({ transition, index }));
  const groups = new Map<string, Array<{ transition: Transition; index: number }>>();
  next.forEach((item) => groups.set(item.transition.from, [...(groups.get(item.transition.from) ?? []), item]));
  const normalized = new Map<string, Transition>();
  groups.forEach((items) => {
    items
      .sort((a, b) => {
        if (a.transition.mode === "fallback" && b.transition.mode !== "fallback") return 1;
        if (b.transition.mode === "fallback" && a.transition.mode !== "fallback") return -1;
        return (a.transition.order ?? a.index) - (b.transition.order ?? b.index);
      })
      .forEach(({ transition }, order) => {
        const mode = transition.mode ?? "conditional";
        const logic = migrateLogicMoment(
          transition.id,
          transition.conditions,
          transition.consequences,
          transition.logic,
          variables,
        );
        const role = inferredTransitionRole({ ...transition, logic }, items.length);
        normalized.set(transition.id, {
          ...transition,
          order,
          mode,
          role,
          logic: role === "route" ? logic : undefined,
          conditions: role === "route" && mode !== "fallback" ? logic?.when : undefined,
          consequences: role === "route" ? logic?.then : undefined,
        });
      });
  });
  return next.map(({ transition }) => normalized.get(transition.id) ?? transition);
}

function migrateBoundaryBindingsToTransitions(event: EventNode, variables: LogicVariable[] = []): Transition[] {
  const transitions = [...(event.transitions ?? [])];

  (event.boundaryBindings ?? []).forEach((binding) => {
    const from = binding.direction === "input" ? binding.portId : binding.nodeId;
    const to = binding.direction === "input" ? binding.nodeId : binding.portId;
    if (transitions.some((transition) => transition.from === from && transition.to === to)) {
      return;
    }
    transitions.push({
      id: `transition:boundary:${binding.id}`,
      from,
      to,
      order: transitions.filter((transition) => transition.from === from).length,
      mode: "conditional",
      source: "graph",
    });
  });

  return normalizeTransitionGroups(transitions, variables);
}

function migrateDialogue(
  eventId: string,
  dialogue: DialogueNode,
  documents: Map<string, ScriptDocument>,
): DialogueNode {
  // An explicitly empty beats array is a valid authored state. Only migrate
  // dialogues from the legacy shape where the field was absent altogether;
  // otherwise deleting the last beat would recreate it during normalization.
  if (dialogue.beats) {
    return {
      ...dialogue,
      members: dialogue.members ?? dialogue.beats.map((beat) => ({ kind: "beat" as const, id: beat.id })),
    };
  }
  const scriptId = `script:dialogue:${eventId}:${dialogue.id}`;
  const blockId = `block:${dialogue.id}:speech`;
  if (!documents.has(scriptId)) {
    documents.set(scriptId, {
      id: scriptId,
      name: dialogue.title || "Dialogue",
      format: "forge-script",
      blocks: [
        {
          id: blockId,
          kind: "speech",
          content: dialogue.text?.content ?? "",
          speakerRef: dialogue.speakerRef,
        },
      ],
    });
  }
  return {
    ...dialogue,
    entryBeatId: `beat:${dialogue.id}:1`,
    beats: [
      {
        id: `beat:${dialogue.id}:1`,
        kind: "speech",
        blockRef: { scriptId, blockId },
      },
    ],
    members: [{ kind: "beat", id: `beat:${dialogue.id}:1` }],
  };
}

function normalizeBeatSceneImage<T extends { sceneImage?: unknown; sceneImages?: unknown }>(beat: T): T {
  const { sceneImages, ...withoutLegacyImages } = beat;
  const sceneImage = beat.sceneImage ?? (Array.isArray(sceneImages) ? sceneImages[0] : undefined);
  return {
    ...withoutLegacyImages,
    ...(sceneImage ? { sceneImage } : {}),
  } as T;
}

function normalizedLogic(
  ownerId: string,
  availability: Parameters<typeof migrateLogicMoment>[1],
  consequences: Parameters<typeof migrateLogicMoment>[2],
  existing: Parameters<typeof migrateLogicMoment>[3],
  variables: LogicVariable[],
) {
  return migrateLogicMoment(ownerId, availability, consequences, existing, variables);
}

function addCompatibilityLogicCapabilities(project: BranchingProject): BranchingProject {
  const overrides = new Map(
    (project.logicPropertyOverrides ?? []).map((override) => [`${override.source}:${override.propertyId}`, override]),
  );
  const sourceForEntity = (entityId: string): "canon" | "local" | undefined =>
    project.canonRefs.some((entity) => entity.id === entityId)
      ? "canon"
      : project.localExplorerEntities?.some((entity) => entity.id === entityId)
        ? "local"
        : undefined;
  const enable = (predicateOrEffect: LogicPredicate | LogicEffect, capability: "conditionReadable" | "actionWritable") => {
    if (predicateOrEffect.type !== "property" || predicateOrEffect.subject.kind !== "entity") return;
    const source = sourceForEntity(predicateOrEffect.subject.entityId);
    if (!source) return;
    const key = `${source}:${predicateOrEffect.propertyId}`;
    const current = overrides.get(key) ?? { propertyId: predicateOrEffect.propertyId, source };
    overrides.set(key, { ...current, [capability]: true });
  };
  const visited = new Set<object>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Record<string, unknown>;
    const logic = record.logic && typeof record.logic === "object" ? record.logic as Record<string, unknown> : undefined;
    if (logic?.when) {
      walkConditions(logic.when as Parameters<typeof walkConditions>[0], (condition) => {
        if ("subject" in condition) enable(condition as LogicPredicate, "conditionReadable");
      });
    }
    if (Array.isArray(logic?.then)) {
      logic.then.forEach((effect) => enable(effect as LogicEffect, "actionWritable"));
    }
    Object.values(record).forEach(visit);
  };
  visit(project.sequences);
  visit(project.branches);
  visit(project.events);
  visit(project.projectDataObjects);
  return { ...project, logicPropertyOverrides: Array.from(overrides.values()) };
}

export function normalizeProject(project: BranchingProject): BranchingProject {
  // Migrate local types to properties if they exist
  project = migrateProjectTypesToProperties(project);
  const logicCapabilities = normalizeLogicCapabilities(project);

  const entrySequenceId = project.entrySequenceId ?? project.sequences[0]?.id;
  const activeSequenceId =
    project.canvas?.activeSequenceId ??
    entrySequenceId ??
    project.sequences[0]?.id;
  const candidateScope = project.canvas?.activeScope;
  const dialogueScopeValid =
    candidateScope?.kind === "dialogue" &&
    project.events.some(
      (event) =>
        event.id === candidateScope.eventId &&
        event.dialogues?.some((dialogue) => dialogue.id === candidateScope.id),
    );
  const activeScope =
    dialogueScopeValid
      ? project.canvas!.activeScope
      :
    project.canvas?.activeScope?.kind === "event" &&
    project.events?.some(
      (event) => event.id === project.canvas?.activeScope?.id,
    )
      ? project.canvas.activeScope
      : project.canvas?.activeScope?.kind === "sequence" &&
          project.sequences?.some(
            (sequence) => sequence.id === project.canvas?.activeScope?.id,
          )
        ? project.canvas.activeScope
        : activeSequenceId
          ? { kind: "sequence" as const, id: activeSequenceId }
          : undefined;

  const logicVariableGroups = normalizeLogicGroups(project.logicVariableGroups);
  const logicVariables = normalizeLogicVariables(project, logicVariableGroups);
  const scriptDocuments = new Map((project.scriptDocuments ?? []).map((document) => [document.id, {
    ...document,
    format: "forge-script" as const,
    blocks: document.blocks ?? [],
  }]));
  const events = (project.events ?? []).map((event) => {
    const dialogues = (event.dialogues ?? []).map((dialogue) => {
      const migrated = migrateDialogue(event.id, dialogue, scriptDocuments);
      const beats = (migrated.beats ?? []).map((sourceBeat) => {
        const beat = normalizeBeatSceneImage(sourceBeat);
        const logic = normalizedLogic(beat.id, beat.displayCondition, beat.consequences, beat.logic, logicVariables);
        return { ...beat, logic, displayCondition: logic?.when, consequences: logic?.then };
      });
      const decisionMembers = (event.decisions ?? [])
        .filter((decision) => decision.dialogueId === migrated.id)
        .map((decision) => ({ kind: "decision" as const, id: decision.id }));
      return {
        ...migrated,
        logic: normalizedLogic(migrated.id, migrated.availability, migrated.consequences, migrated.logic, logicVariables),
        availability: normalizedLogic(migrated.id, migrated.availability, migrated.consequences, migrated.logic, logicVariables)?.when,
        consequences: normalizedLogic(migrated.id, migrated.availability, migrated.consequences, migrated.logic, logicVariables)?.then,
        beats,
        members: migrated.members ?? [
          ...beats.map((beat) => ({ kind: "beat" as const, id: beat.id })),
          ...decisionMembers,
        ],
      };
    });
    const transitions = migrateBoundaryBindingsToTransitions(event, logicVariables);
    const dialogueStarts = (event.dialogueStarts ?? []).flatMap((start) => {
      // Automatic starts are already represented by an Event's entry route.
      if (start.mode === "automatic") return [];
      const targetNodeId = start.dialogueId
        ? `dialogue:${event.id}:${start.dialogueId}`
        : undefined;
      const nodeId = `dialogue-start:${event.id}:${start.id}`;
      if (targetNodeId && !transitions.some((transition) => transition.from === nodeId && transition.to === targetNodeId)) {
        transitions.push({
          id: `transition:dialogue-trigger:${event.id}:${start.id}`,
          from: nodeId,
          to: targetNodeId,
          order: transitions.filter((transition) => transition.from === nodeId).length,
          mode: "conditional",
          source: "graph",
        });
      }
      const { dialogueId: _dialogueId, mode: _mode, ...trigger } = start;
      const logic = normalizedLogic(start.id, start.availability, undefined, start.logic, logicVariables);
      return [{ ...trigger, logic, availability: logic?.when }];
    });
    return {
      ...event,
      logic: normalizedLogic(event.id, event.availability, event.consequences, event.logic, logicVariables),
      availability: normalizedLogic(event.id, event.availability, event.consequences, event.logic, logicVariables)?.when,
      consequences: normalizedLogic(event.id, event.availability, event.consequences, event.logic, logicVariables)?.then,
      childEventIds: event.childEventIds ?? [],
      decisions: (event.decisions ?? []).map((decision) => ({
        ...decision,
        logic: normalizedLogic(decision.id, decision.availability, undefined, decision.logic, logicVariables),
        availability: normalizedLogic(decision.id, decision.availability, undefined, decision.logic, logicVariables)?.when,
        outcomes: (decision.outcomes ?? []).map((outcome) => ({
          ...outcome,
          visibleText: outcome.visibleText ?? outcome.name,
          logic: normalizedLogic(
            outcome.id,
            outcome.availability ?? outcome.conditions,
            outcome.consequences,
            outcome.logic,
            logicVariables,
          ),
          availability: normalizedLogic(
            outcome.id,
            outcome.availability ?? outcome.conditions,
            outcome.consequences,
            outcome.logic,
            logicVariables,
          )?.when,
          consequences: normalizedLogic(
            outcome.id,
            outcome.availability ?? outcome.conditions,
            outcome.consequences,
            outcome.logic,
            logicVariables,
          )?.then,
          unavailableBehavior: outcome.unavailableBehavior ?? "locked",
        })),
      })),
      dialogues,
      dialogueBeats: event.dialogueBeats?.map((sourceBeat) => {
        const beat = normalizeBeatSceneImage(sourceBeat);
        const logic = normalizedLogic(beat.id, beat.displayCondition, beat.consequences, beat.logic, logicVariables);
        return { ...beat, logic, displayCondition: logic?.when, consequences: logic?.then };
      }),
      presentEntityRefs: event.presentEntityRefs ?? (event.canonRefs ? [...event.canonRefs] : undefined),
      dialogueStarts,
      boundaryBindings: event.boundaryBindings ?? [],
      transitions: normalizeTransitionGroups(transitions, logicVariables),
    };
  });

  return addCompatibilityLogicCapabilities(normalizeBranchMembership({
    ...project,
    specVersion: project.specVersion ?? "0.1",
    dataClasses: normalizeDataClasses(project),
    projectDataObjects: (project.projectDataObjects ?? []).map((dataObject) => {
      const logic = normalizedLogic(
        dataObject.id,
        dataObject.availability,
        dataObject.consequences,
        dataObject.logic,
        logicVariables,
      );
      return { ...dataObject, logic, availability: logic?.when, consequences: logic?.then };
    }),
    canonEditSuggestions: project.canonEditSuggestions ?? [],
    canonWorkingCopies: project.canonWorkingCopies ?? [],
    canonChangeSets: project.canonChangeSets ?? [],
    localExplorerEntities: project.localExplorerEntities ?? [],
    localExplorerTypes: project.localExplorerTypes ?? [],
    localExplorerProperties: project.localExplorerProperties ?? [],
    assets: project.assets ?? [],
    scriptDocuments: Array.from(scriptDocuments.values()),
    integrationConfig: normalizeIntegrationConfig(project.integrationConfig, DEFAULT_INTEGRATION_CONFIG),
    integrationConfigOverride: project.integrationConfigOverride
      ? normalizeIntegrationConfig(project.integrationConfigOverride, { specVersion: "0.1", mappings: [] })
      : undefined,
    logicVariableGroups,
    logicVariables,
    logicPropertyOverrides: logicCapabilities.logicPropertyOverrides,
    logicTypeOverrides: logicCapabilities.logicTypeOverrides,
    projectionRules: project.projectionRules ?? [],
    graphModules: project.graphModules ?? [],
    panels: {
      canonOpen: project.panels?.canonOpen ?? true,
      filesOpen: project.panels?.filesOpen ?? true,
    },
    canvas: {
      ...project.canvas,
      activeSequenceId,
      activeScope,
      scopes: project.canvas?.scopes ?? {},
    },
    authoringPreferences: normalizeAuthoringPreferences(project),
    entrySequenceId,
    eventCategories: normalizeEventCategories(project),
    canonRefs: project.canonRefs ?? [],
    sequences: (project.sequences ?? []).map((sequence) => {
      const logic = normalizedLogic(sequence.id, sequence.availability, sequence.consequences, sequence.logic, logicVariables);
      return { ...sequence, logic, availability: logic?.when, consequences: logic?.then };
    }),
    branches: (project.branches ?? []).map((branch) => {
      const logic = normalizedLogic(branch.id, branch.availability, branch.consequences, branch.logic, logicVariables);
      return { ...branch, logic, availability: logic?.when, consequences: logic?.then };
    }),
    events,
    scripts: project.scripts ?? [],
    externalFunctions: project.externalFunctions ?? [],
    variables: Object.fromEntries(logicVariables.map((variable) => [variable.name, variable.value])),
  }));
}

function normalizeLogicGroups(groups: LogicVariableGroup[] | undefined): LogicVariableGroup[] {
  const source = groups?.length ? groups : [{ id: "ungrouped", name: "Unassigned", order: 0 }];
  const byId = new Map(source.filter((group) => group.id).map((group) => [group.id, group]));
  if (!byId.has("ungrouped")) byId.set("ungrouped", { id: "ungrouped", name: "Unassigned", order: -1 });
  return Array.from(byId.values()).sort((a, b) => a.order - b.order).map((group, order) => ({ ...group, name: group.name.trim() || "Untitled group", order }));
}

function normalizeLogicVariables(project: BranchingProject, groups: LogicVariableGroup[]): LogicVariable[] {
  const legacy = Object.entries(project.variables ?? {}).map(([name, value]) => ({
    id: `variable:${name}`, name,
    type: Array.isArray(value) ? "list" as const : typeof value === "number" ? "number" as const : typeof value === "boolean" ? "boolean" as const : "text" as const,
    value: Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : String(value),
    groupId: "ungrouped",
  }));
  const seen = new Set<string>();
  return (project.logicVariables ?? legacy).map((variable, index) => {
    const baseName = variable.name.trim() || `variable_${index + 1}`;
    let name = baseName;
    let suffix = 2;
    while (seen.has(name)) name = `${baseName}_${suffix++}`;
    seen.add(name);
    const type = ["text", "number", "boolean", "list", "canonRef"].includes(variable.type) ? variable.type : "text";
    const value = type === "list" ? (Array.isArray(variable.value) ? variable.value.map(String) : []) : type === "number" ? (typeof variable.value === "number" && Number.isFinite(variable.value) ? variable.value : Number(variable.value) || 0) : type === "boolean" ? (typeof variable.value === "boolean" ? variable.value : variable.value === "true") : String(variable.value ?? "");
    return { ...variable, id: variable.id || `variable:${name}`, name, type, value, groupId: groups.some((group) => group.id === variable.groupId) ? variable.groupId : "ungrouped" } as LogicVariable;
  });
}

export function serializeProject(project: BranchingProject) {
  return `${JSON.stringify(project, null, 2)}\n`;
}

export function parseProject(content: string): BranchingProject {
  return normalizeProject(JSON.parse(content) as BranchingProject);
}
