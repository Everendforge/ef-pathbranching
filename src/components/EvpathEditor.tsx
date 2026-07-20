import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { BranchingProject } from "../domain.js";
import { parseEvpath, serializeEventEvpath, type EvpathParseError } from "../evpathFormat.js";

export type EvpathApplyOutcome = {
  errors: EvpathParseError[];
  warnings: string[];
};

/** Highlights one evpath line as backdrop spans behind the transparent textarea. */
function highlightLine(line: string, key: number): ReactNode {
  const anchorMatch = line.match(/^(.*?)(\s#\^\S+)(\s*)$/);
  const body = anchorMatch ? anchorMatch[1] : line;
  const anchor = anchorMatch ? anchorMatch[2] + (anchorMatch[3] ?? "") : undefined;
  const trimmed = body.trimStart();
  const indent = body.slice(0, body.length - trimmed.length);

  let bodyClass = "";
  if (trimmed.startsWith("=== ")) bodyClass = "evpath-hl-header";
  else if (/^=\s*(dialogue|trigger)\s*:/i.test(trimmed)) bodyClass = "evpath-hl-section";
  else if (trimmed.startsWith("? ")) bodyClass = "evpath-hl-decision";
  else if (trimmed.startsWith("* ")) bodyClass = "evpath-hl-option";
  else if (trimmed.startsWith("->")) bodyClass = "evpath-hl-divert";
  else if (trimmed.startsWith("~")) bodyClass = "evpath-hl-consequence";
  else if (/^\[.*\]$/s.test(trimmed)) bodyClass = "evpath-hl-direction";
  else if (/^\(.*\)$/s.test(trimmed)) bodyClass = "evpath-hl-note";
  else if (/^#/.test(trimmed)) bodyClass = "evpath-hl-meta";

  const parts: ReactNode[] = [indent];
  if (!bodyClass) {
    const speakerMatch = trimmed.match(/^((?:\?\?\?|[^:[\](){}~#*?=\\][^:]*?)(?:\s*\([^)]+\))?\s*):(\s.*)$/s);
    if (speakerMatch && !trimmed.startsWith("\\")) {
      parts.push(
        <span key="speaker" className="evpath-hl-speaker">{speakerMatch[1]}:</span>,
        speakerMatch[2],
      );
    } else {
      parts.push(trimmed);
    }
  } else {
    // Dim `{ ... }` condition groups inside structural lines.
    const segments = trimmed.split(/(\{[^{}]*\})/g);
    parts.push(
      <span key="body" className={bodyClass}>
        {segments.map((segment, index) =>
          segment.startsWith("{") ? (
            <span key={index} className="evpath-hl-cond">{segment}</span>
          ) : (
            segment
          ),
        )}
      </span>,
    );
  }
  if (anchor) parts.push(<span key="anchor" className="evpath-hl-anchor">{anchor}</span>);
  return (
    <span key={key}>
      {parts}
      {"\n"}
    </span>
  );
}

export function EvpathEditor({
  project,
  eventId,
  onApply,
}: {
  project: BranchingProject;
  eventId: string;
  onApply: (eventId: string, text: string) => EvpathApplyOutcome;
}) {
  const serialized = useMemo(() => serializeEventEvpath(project, eventId), [project, eventId]);
  const [draft, setDraft] = useState<string>();
  const [applyOutcome, setApplyOutcome] = useState<EvpathApplyOutcome>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLPreElement>(null);

  const value = draft ?? serialized;
  const dirty = draft !== undefined && draft !== serialized;
  const parseErrors = useMemo(() => parseEvpath(value).errors, [value]);

  // When the canvas changes the event while the editor is clean, follow it.
  useEffect(() => {
    setDraft((currentDraft) => (currentDraft === serialized ? undefined : currentDraft));
  }, [serialized]);
  useEffect(() => {
    setDraft(undefined);
    setApplyOutcome(undefined);
  }, [eventId]);

  const syncScroll = () => {
    const backdrop = backdropRef.current;
    const textarea = textareaRef.current;
    if (!backdrop || !textarea) return;
    backdrop.scrollTop = textarea.scrollTop;
    backdrop.scrollLeft = textarea.scrollLeft;
  };

  const apply = () => {
    if (parseErrors.length) return;
    const outcome = onApply(eventId, value);
    setApplyOutcome(outcome);
    if (!outcome.errors.length) {
      setDraft(undefined);
    }
  };

  const revert = () => {
    setDraft(undefined);
    setApplyOutcome(undefined);
  };

  const errors = parseErrors.length ? parseErrors : applyOutcome?.errors ?? [];

  return (
    <div className="evpath-editor">
      <div className="evpath-editor-toolbar">
        <span className={`evpath-editor-status${dirty ? " dirty" : ""}`}>
          {dirty ? "Cambios sin aplicar" : "Sincronizado con el canvas"}
        </span>
        <div className="evpath-editor-actions">
          <button type="button" onClick={revert} disabled={!dirty}>
            Revert
          </button>
          <button
            type="button"
            className="primary"
            onClick={apply}
            disabled={!dirty || parseErrors.length > 0}
          >
            Apply
          </button>
        </div>
      </div>
      <div className="evpath-editor-surface">
        <pre ref={backdropRef} className="evpath-editor-backdrop" aria-hidden="true">
          {value.split("\n").map((line, index) => highlightLine(line, index))}
        </pre>
        <textarea
          ref={textareaRef}
          className="evpath-editor-input"
          value={value}
          wrap="off"
          spellCheck={false}
          aria-label="Path script"
          onScroll={syncScroll}
          onChange={(event) => {
            setDraft(event.target.value);
            setApplyOutcome(undefined);
          }}
        />
      </div>
      {errors.length > 0 ? (
        <ul className="evpath-editor-errors">
          {errors.map((error, index) => (
            <li key={index}>
              <b>L{error.line}</b> {error.message}
            </li>
          ))}
        </ul>
      ) : null}
      {applyOutcome && !applyOutcome.errors.length && applyOutcome.warnings.length > 0 ? (
        <ul className="evpath-editor-warnings">
          {applyOutcome.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
