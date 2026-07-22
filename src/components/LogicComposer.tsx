import { ChevronDown, CircleAlert, GitBranch, Plus, Trash2, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type {
  BranchingProject,
  ConditionExpression,
  ConditionInput,
  Consequence,
  LogicEffect,
  LogicEffectOperation,
  LogicPredicate,
} from "../domain.js";
import { asConditionExpressions, isConditionSet, migrateConditionInput, migrateConsequence } from "../logic.js";
import {
  LOGIC_COMPARISON_OPERATORS as comparisonOperators,
  logicEffectFor as effectFor,
  logicEffectOperations as effectOperations,
  logicFieldOptions as fieldOptions,
  logicOperatorsFor as operatorsFor,
  logicPredicateFor as predicateFor,
  resolveLogicField,
  logicSubjectKey as subjectKey,
  logicSubjectOptions as subjectOptions,
  type LogicSubjectOption as SubjectOption,
  type LogicFieldOption,
  type LogicPresentation,
} from "../logicCapabilities.js";

type LogicComposerProps = {
  project: BranchingProject;
  contextEntityIds?: string[];
  compact?: boolean;
};

function valueEditor(value: unknown, valueType: string | undefined, onChange: (value: unknown) => void) {
  if (valueType === "boolean") {
    return <select value={String(value ?? true)} onChange={(event) => onChange(event.target.value === "true")}><option value="true">true</option><option value="false">false</option></select>;
  }
  return <input type={valueType === "number" ? "number" : valueType === "date" ? "date" : "text"} value={String(value ?? "")} onChange={(event) => onChange(valueType === "number" ? Number(event.target.value) : event.target.value)} />;
}

function PredicateRow({ project, options, predicate, onChange, onRemove }: {
  project: BranchingProject;
  options: SubjectOption[];
  predicate: LogicPredicate;
  onChange: (predicate: LogicPredicate) => void;
  onRemove: () => void;
}) {
  const enabledFields = fieldOptions(project, predicate.subject, "condition");
  const selectedKey = predicate.type === "state" ? predicate.stateId : predicate.type === "property" ? predicate.propertyId : predicate.type;
  const selectedKind = predicate.type === "state" ? "state" : predicate.type === "property" ? "property" : predicate.type === "visited" ? "visited" : predicate.type === "external" ? "external" : "value";
  const resolvedField = resolveLogicField(project, predicate.subject, "condition", selectedKind, selectedKey);
  const fields = resolvedField.status === "enabled" || enabledFields.some((field) => field.key === resolvedField.key)
    ? enabledFields
    : [resolvedField, ...enabledFields];
  const selectedField = fields.find((field) => field.key === selectedKey) ?? fields[0];
  const operators = selectedField ? operatorsFor(selectedField) : comparisonOperators;
  const operator = predicate.operator;
  const selectedSubjectKey = subjectKey(predicate.subject);
  const selectedSubjectOption = subjectOptions(project).find((option) => option.key === selectedSubjectKey);
  const rowOptions = options.some((option) => option.key === selectedSubjectKey) || !selectedSubjectOption
    ? options
    : [selectedSubjectOption, ...options];
  return <div className="logic-composer-row">
    <select aria-label="Logic subject" value={selectedSubjectKey} onChange={(event) => {
      const subject = rowOptions.find((option) => option.key === event.target.value)?.subject;
      if (!subject) return;
      const field = fieldOptions(project, subject, "condition")[0];
      if (field) onChange(predicateFor(subject, field));
    }}>{rowOptions.map((option) => <option key={option.key} value={option.key}>{option.contextual ? "● " : ""}{option.label} · {option.detail}</option>)}</select>
    <select aria-label="Logic field" value={selectedField?.key ?? ""} onChange={(event) => {
      const field = fields.find((item) => item.key === event.target.value);
      if (field) onChange(predicateFor(predicate.subject, field));
    }}>{fields.map((field) => <option key={`${field.kind}:${field.key}`} value={field.key}>{field.status === "enabled" ? field.label : `${field.label} · capability ${field.status}`}</option>)}</select>
    <select aria-label="Logic operator" value={operator} onChange={(event) => onChange({ ...predicate, operator: event.target.value as LogicPredicate["operator"] } as LogicPredicate)}>{operators.map((item) => <option key={item} value={item}>{item}</option>)}</select>
    {!['has', 'missing', 'exists'].includes(operator) ? valueEditor("value" in predicate ? predicate.value : undefined, selectedField?.valueType, (value) => onChange({ ...predicate, value } as LogicPredicate)) : null}
    {resolvedField.status !== "enabled" ? <span className="logic-row-capability-warning" title="Enable this capability in the Explorer type or property configuration"><CircleAlert size={12} /> Configure capability</span> : null}
    <button type="button" className="icon-only danger" aria-label="Remove condition" onClick={onRemove}><Trash2 size={13} /></button>
  </div>;
}

function EffectRow({ project, options, effect, onChange, onRemove }: {
  project: BranchingProject;
  options: SubjectOption[];
  effect: LogicEffect;
  onChange: (effect: LogicEffect) => void;
  onRemove: () => void;
}) {
  if (effect.type === "external") {
    return <div className="logic-composer-row effect"><code>{effect.subject.functionId}</code><span>call</span><button type="button" className="icon-only danger" aria-label="Remove effect" onClick={onRemove}><Trash2 size={13} /></button></div>;
  }
  const enabledFields = fieldOptions(project, effect.subject, "effect");
  const selectedKey = effect.type === "state" ? effect.stateId : effect.type === "property" ? effect.propertyId : effect.type;
  const selectedKind = effect.type === "state" ? "state" : effect.type === "property" ? "property" : "value";
  const resolvedField = resolveLogicField(project, effect.subject, "effect", selectedKind, selectedKey);
  const fields = resolvedField.status === "enabled" || enabledFields.some((field) => field.key === resolvedField.key)
    ? enabledFields
    : [resolvedField, ...enabledFields];
  const selectedField = fields.find((field) => field.key === selectedKey) ?? fields[0];
  const operations = selectedField ? effectOperations(selectedField) : ["set" as const];
  const selectedSubjectKey = subjectKey(effect.subject);
  const selectedSubjectOption = subjectOptions(project).find((option) => option.key === selectedSubjectKey);
  const rowOptions = options.some((option) => option.key === selectedSubjectKey) || !selectedSubjectOption
    ? options
    : [selectedSubjectOption, ...options];
  return <div className="logic-composer-row effect">
    <select aria-label="Effect subject" value={selectedSubjectKey} onChange={(event) => {
      const subject = rowOptions.find((option) => option.key === event.target.value)?.subject;
      if (!subject) return;
      const field = fieldOptions(project, subject, "effect")[0];
      if (field) onChange(effectFor(subject, field));
    }}>{rowOptions.filter((option) => option.subject.kind !== "progress").map((option) => <option key={option.key} value={option.key}>{option.contextual ? "● " : ""}{option.label} · {option.detail}</option>)}</select>
    <select aria-label="Effect field" value={selectedField?.key ?? ""} onChange={(event) => {
      const field = fields.find((item) => item.key === event.target.value);
      if (field) onChange(effectFor(effect.subject, field));
    }}>{fields.map((field) => <option key={`${field.kind}:${field.key}`} value={field.key}>{field.status === "enabled" ? field.label : `${field.label} · capability ${field.status}`}</option>)}</select>
    <select aria-label="Effect operation" value={effect.operation} onChange={(event) => onChange({ ...effect, operation: event.target.value as LogicEffectOperation })}>{operations.map((item) => <option key={item} value={item}>{item}</option>)}</select>
    {!['toggle', 'clear', 'grant', 'ungrant', 'unlock', 'lock', 'discover', 'hide', 'enter', 'leave'].includes(effect.operation) ? valueEditor("value" in effect ? effect.value : undefined, selectedField?.valueType, (value) => onChange({ ...effect, value })) : null}
    {resolvedField.status !== "enabled" ? <span className="logic-row-capability-warning" title="Enable this capability in the Explorer type or property configuration"><CircleAlert size={12} /> Configure capability</span> : null}
    <button type="button" className="icon-only danger" aria-label="Remove effect" onClick={onRemove}><Trash2 size={13} /></button>
  </div>;
}

function firstPredicate(project: BranchingProject, options: SubjectOption[]): LogicPredicate | undefined {
  for (const option of options) {
    const field = fieldOptions(project, option.subject, "condition")[0];
    if (field) return predicateFor(option.subject, field);
  }
  return undefined;
}

function firstEffect(project: BranchingProject, options: SubjectOption[]): LogicEffect | undefined {
  for (const option of options) {
    const field = fieldOptions(project, option.subject, "effect")[0];
    if (field) return effectFor(option.subject, field);
  }
  return undefined;
}

function ExpressionTreeEditor({
  project,
  options,
  expression,
  onChange,
  onRemove,
  depth = 0,
}: {
  project: BranchingProject;
  options: SubjectOption[];
  expression: ConditionExpression;
  onChange: (expression: ConditionExpression) => void;
  onRemove?: () => void;
  depth?: number;
}) {
  if (!isConditionSet(expression)) {
    return <div className="logic-expression-leaf">
      <PredicateRow
        project={project}
        options={options}
        predicate={expression as LogicPredicate}
        onChange={onChange}
        onRemove={() => onRemove?.()}
      />
    </div>;
  }

  const kind: "all" | "any" | "not" = "all" in expression ? "all" : "any" in expression ? "any" : "not";
  const children: ConditionExpression[] = "all" in expression
    ? expression.all
    : "any" in expression
      ? expression.any
      : [expression.not];
  const replaceChildren = (next: ConditionExpression[]) => {
    if (kind === "not") {
      const fallback = next[0] ?? firstPredicate(project, options);
      if (fallback) onChange({ not: fallback });
      return;
    }
    onChange(kind === "all" ? { all: next } : { any: next });
  };
  const changeKind = (nextKind: "all" | "any" | "not") => {
    if (nextKind === "not") {
      const child = children[0] ?? firstPredicate(project, options);
      if (child) onChange({ not: child });
      return;
    }
    onChange(nextKind === "all" ? { all: children } : { any: children });
  };
  return <div className={`logic-expression-group depth-${Math.min(depth, 3)}`}>
    <div className="logic-expression-group-header">
      <select aria-label="Expression group" value={kind} onChange={(event) => changeKind(event.target.value as "all" | "any" | "not")}>
        <option value="all">ALL · AND</option>
        <option value="any">ANY · OR</option>
        <option value="not">NOT</option>
      </select>
      {onRemove ? <button type="button" className="icon-only danger" aria-label="Remove group" onClick={onRemove}><Trash2 size={13} /></button> : null}
    </div>
    <div className="logic-expression-children">
      {children.map((child, index) => <ExpressionTreeEditor
        key={`${depth}:${index}:${isConditionSet(child) ? "group" : child.type}`}
        project={project}
        options={options}
        expression={child}
        depth={depth + 1}
        onChange={(next) => replaceChildren(children.map((item, childIndex) => childIndex === index ? next : item))}
        onRemove={kind === "not" ? undefined : () => replaceChildren(children.filter((_, childIndex) => childIndex !== index))}
      />)}
    </div>
    {kind !== "not" ? <div className="logic-expression-actions">
      <button type="button" onClick={() => { const predicate = firstPredicate(project, options); if (predicate) replaceChildren([...children, predicate]); }}><Plus size={12} /> Predicate</button>
      <button type="button" onClick={() => { const predicate = firstPredicate(project, options); if (predicate) replaceChildren([...children, { all: [predicate] }]); }}><GitBranch size={12} /> Group</button>
    </div> : null}
  </div>;
}

function isFlatExpression(expression: ConditionExpression): boolean {
  if (!isConditionSet(expression)) return true;
  if ("not" in expression) return false;
  return ("all" in expression ? expression.all : expression.any).every((child) => !isConditionSet(child));
}

export function LogicConditionEditor({ project, contextEntityIds, value, onChange, label = "WHEN", compact }: LogicComposerProps & {
  value?: ConditionInput;
  onChange: (value: ConditionInput | undefined) => void;
  label?: string;
}) {
  const [advanced, setAdvanced] = useState(false);
  const [dropMessage, setDropMessage] = useState<string>();
  const [dropChoice, setDropChoice] = useState<{ option: SubjectOption; fields: LogicFieldOption[] }>();
  const options = useMemo(
    () => subjectOptions(project, contextEntityIds).filter((option) => {
      if (option.subject.kind === "external") {
        const functionId = option.subject.functionId;
        const kind = project.externalFunctions.find((item) => item.name === functionId)?.kind;
        if (kind !== "condition" && kind !== "transition") return false;
      }
      return fieldOptions(project, option.subject, "condition").length > 0;
    }),
    [project, contextEntityIds],
  );
  const migrated = migrateConditionInput(value, project.logicVariables ?? []);
  const expressions = asConditionExpressions(migrated);
  const top = expressions.length === 1 ? expressions[0] : { all: expressions };
  const flat = expressions.length === 0 || isFlatExpression(top);
  const group = flat && isConditionSet(top) && "any" in top ? "any" : "all";
  const rows = expressions.length === 1 && isConditionSet(top) && !('not' in top) ? ("all" in top ? top.all : top.any) : expressions;
  const replaceRows = (next: ConditionExpression[], nextGroup = group) => onChange(next.length ? (next.length === 1 ? next[0] : nextGroup === "any" ? { any: next } : { all: next }) : undefined);
  return <section
    className={`logic-composer ${compact ? "compact" : ""}`}
    onDragOver={(event) => {
      if (event.dataTransfer.types.includes("application/x-pathbranching-canon-ref") || event.dataTransfer.types.includes("application/x-pathbranching-entity")) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }
    }}
    onDrop={(event) => {
      const entityId = event.dataTransfer.getData("application/x-pathbranching-entity") || event.dataTransfer.getData("application/x-pathbranching-canon-ref");
      if (!entityId) return;
      event.preventDefault();
      const option = options.find((candidate) => candidate.subject.kind === "entity" && candidate.subject.entityId === entityId);
      const fields = option ? fieldOptions(project, option.subject, "condition") : [];
      if (!option || !fields.length) {
        setDropMessage("This entity has no condition-readable property or runtime state. Enable one in its type/property capabilities.");
        setDropChoice(undefined);
        return;
      }
      if (fields.length > 1) {
        setDropChoice({ option, fields });
        setDropMessage(undefined);
        return;
      }
      replaceRows([...rows, predicateFor(option.subject, fields[0])]);
      setDropChoice(undefined);
      setDropMessage(undefined);
    }}
  >
    <header><strong>{label}</strong><span>{rows.length ? `${rows.length} condition${rows.length === 1 ? "" : "s"}` : "Always"}</span></header>
    {flat ? <>
      {rows.length > 1 ? <label className="logic-composer-group">Match<select value={group} onChange={(event) => replaceRows(rows, event.target.value as "all" | "any")}><option value="all">All (AND)</option><option value="any">Any (OR)</option></select></label> : null}
      <div className="logic-composer-rows">{rows.map((expression, index) => !isConditionSet(expression) ? <PredicateRow key={`${expression.type}:${index}`} project={project} options={options} predicate={expression as LogicPredicate} onChange={(predicate) => replaceRows(rows.map((item, itemIndex) => itemIndex === index ? predicate : item))} onRemove={() => replaceRows(rows.filter((_, itemIndex) => itemIndex !== index))} /> : null)}</div>
    </> : <p className="logic-composer-summary">Nested expression. Open Advanced to edit its tree without flattening it.</p>}
    <div className="logic-composer-actions"><button type="button" onClick={() => { const predicate = firstPredicate(project, options); if (predicate) replaceRows([...rows, predicate]); }}><Plus size={13} /> Condition</button><button type="button" onClick={() => setAdvanced((current) => !current)}><ChevronDown size={13} /> Advanced</button></div>
    {dropChoice ? <div className="logic-composer-drop-choice" role="dialog" aria-label={`Choose condition field for ${dropChoice.option.label}`}>
      <strong>{dropChoice.option.label}</strong><span>Choose a readable property or state</span>
      <div>{dropChoice.fields.map((field) => <button type="button" key={`${field.kind}:${field.key}`} onClick={() => {
        replaceRows([...rows, predicateFor(dropChoice.option.subject, field)]);
        setDropChoice(undefined);
      }}>{field.label}</button>)}</div>
    </div> : null}
    {dropMessage ? <p className="logic-composer-drop-message" role="status">{dropMessage}</p> : null}
    {advanced ? <div className="logic-composer-advanced" aria-label="Advanced condition expression">
      {expressions.length ? <ExpressionTreeEditor
        project={project}
        options={options}
        expression={top}
        onChange={(expression) => onChange(expression)}
      /> : <button type="button" onClick={() => { const predicate = firstPredicate(project, options); if (predicate) onChange(predicate); }}><Plus size={13} /> First condition</button>}
    </div> : null}
  </section>;
}

export function LogicEffectEditor({ project, contextEntityIds, value, onChange, label = "THEN", compact }: LogicComposerProps & {
  value?: Consequence[];
  onChange: (value: Consequence[] | undefined) => void;
  label?: string;
}) {
  const [dropMessage, setDropMessage] = useState<string>();
  const [dropChoice, setDropChoice] = useState<{ option: SubjectOption; fields: LogicFieldOption[] }>();
  const options = useMemo(
    () => subjectOptions(project, contextEntityIds).filter((option) => {
      if (option.subject.kind === "progress") return false;
      if (option.subject.kind === "external") {
        const functionId = option.subject.functionId;
        const kind = project.externalFunctions.find((item) => item.name === functionId)?.kind;
        if (kind !== "consequence" && kind !== "runtimeAction" && kind !== "engineSignal") return false;
      }
      return fieldOptions(project, option.subject, "effect").length > 0;
    }),
    [project, contextEntityIds],
  );
  const effects = (value ?? []).map((effect) => migrateConsequence(effect, project.logicVariables ?? []));
  return <section
    className={`logic-composer effect ${compact ? "compact" : ""}`}
    onDragOver={(event) => {
      if (event.dataTransfer.types.includes("application/x-pathbranching-canon-ref") || event.dataTransfer.types.includes("application/x-pathbranching-entity")) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }
    }}
    onDrop={(event) => {
      const entityId = event.dataTransfer.getData("application/x-pathbranching-entity") || event.dataTransfer.getData("application/x-pathbranching-canon-ref");
      if (!entityId) return;
      event.preventDefault();
      const option = options.find((candidate) => candidate.subject.kind === "entity" && candidate.subject.entityId === entityId);
      const fields = option ? fieldOptions(project, option.subject, "effect") : [];
      if (!option || !fields.length) {
        setDropMessage("This entity has no action-writable property or runtime state. Enable one in its type/property capabilities.");
        setDropChoice(undefined);
        return;
      }
      if (fields.length > 1) {
        setDropChoice({ option, fields });
        setDropMessage(undefined);
        return;
      }
      onChange([...effects, effectFor(option.subject, fields[0])]);
      setDropChoice(undefined);
      setDropMessage(undefined);
    }}
  >
    <header><strong>{label}</strong><span>{effects.length ? `${effects.length} effect${effects.length === 1 ? "" : "s"}` : "No effects"}</span></header>
    <div className="logic-composer-rows">{effects.map((effect, index) => <EffectRow key={`${effect.type}:${index}`} project={project} options={options} effect={effect} onChange={(next) => onChange(effects.map((item, itemIndex) => itemIndex === index ? next : item))} onRemove={() => onChange(effects.filter((_, itemIndex) => itemIndex !== index))} />)}</div>
    <div className="logic-composer-actions"><button type="button" onClick={() => { const effect = firstEffect(project, options); if (effect) onChange([...effects, effect]); }}><Plus size={13} /> Effect</button></div>
    {dropChoice ? <div className="logic-composer-drop-choice" role="dialog" aria-label={`Choose effect field for ${dropChoice.option.label}`}>
      <strong>{dropChoice.option.label}</strong><span>Choose a writable property or state</span>
      <div>{dropChoice.fields.map((field) => <button type="button" key={`${field.kind}:${field.key}`} onClick={() => {
        onChange([...effects, effectFor(dropChoice.option.subject, field)]);
        setDropChoice(undefined);
      }}>{field.label}</button>)}</div>
    </div> : null}
    {dropMessage ? <p className="logic-composer-drop-message" role="status">{dropMessage}</p> : null}
  </section>;
}

function LogicPresentationToken({ item }: { item: LogicPresentation }) {
  return <span
    className={`logic-presentation-token${item.status === "enabled" ? "" : " warning"}`}
    title={item.status === "enabled" ? item.text : `${item.text} · capability ${item.status}`}
    style={item.color ? { "--logic-subject-color": item.color } as CSSProperties : undefined}
  >
    <i aria-hidden="true" />
    <span>{item.subjectLabel}</span>
    <b>{item.fieldLabel}</b>
    <em>{item.operatorLabel}{item.valueLabel ? ` ${item.valueLabel}` : ""}</em>
    {item.status !== "enabled" ? <CircleAlert size={10} aria-label={`Capability ${item.status}`} /> : null}
  </span>;
}

export function LogicBands({
  when,
  then,
  whenItems = [],
  thenItems = [],
  expanded,
  warningCount = 0,
  onOpenWhen,
  onOpenThen,
}: {
  when?: string;
  then?: string;
  whenItems?: LogicPresentation[];
  thenItems?: LogicPresentation[];
  expanded?: boolean;
  warningCount?: number;
  onOpenWhen?: () => void;
  onOpenThen?: () => void;
}) {
  return <div className={`node-logic-bands${expanded ? " expanded" : ""}`}>
    {when ? <button type="button" className="node-logic-band when" onClick={onOpenWhen}>
      <GitBranch size={10} /><b>WHEN</b>
      <span className="logic-band-summary">{whenItems.length ? whenItems.map((item) => <LogicPresentationToken key={item.id} item={item} />) : when}</span>
    </button> : null}
    {then ? <button type="button" className="node-logic-band then" onClick={onOpenThen}>
      <Zap size={10} /><b>THEN</b>
      <span className="logic-band-summary">{thenItems.length ? thenItems.map((item) => <LogicPresentationToken key={item.id} item={item} />) : then}</span>
    </button> : null}
    {warningCount > 0 ? <span className="node-logic-warning" title={`${warningCount} capability warning${warningCount === 1 ? "" : "s"}`}><CircleAlert size={11} />{warningCount}</span> : null}
  </div>;
}
