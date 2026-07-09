import { Check, Copy, FileDiff, FileText, Send, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { lineDiff } from "../canonChanges.js";
import type { CanonWorkingCopy } from "../domain.js";

type CopyView = "original" | "modified" | "diff";

export function CanonWorkingCopyEditor({
  copy,
  sourceChanged,
  onCreate,
  onSave,
  onExportProposal,
  onApply,
}: {
  copy?: CanonWorkingCopy;
  sourceChanged: boolean;
  onCreate: () => void;
  onSave: (content: string) => void;
  onExportProposal: () => void;
  onApply: () => void;
}) {
  const [view, setView] = useState<CopyView>("modified");
  const [draft, setDraft] = useState(copy?.draftContent ?? "");

  useEffect(() => {
    setDraft(copy?.draftContent ?? "");
  }, [copy?.canonRefId, copy?.draftContent]);

  if (!copy) {
    return (
      <section className="inspector-section canon-working-copy-empty">
        <h2>Manual Working Copy</h2>
        <p className="empty-line">
          Canon stays read-only until you explicitly create a local snapshot.
        </p>
        <button type="button" onClick={onCreate}>
          <Copy size={14} /> Create working copy
        </button>
      </section>
    );
  }

  const dirty = draft !== copy.draftContent;
  return (
    <section className="inspector-section canon-working-copy-editor">
      <div className="inspector-section-heading">
        <div>
          <h2>Working Copy</h2>
          <span>{copy.legacy ? "legacy copy" : "manual snapshot"}</span>
        </div>
        {sourceChanged ? (
          <span className="warning-text">Source changed</span>
        ) : (
          <span className="success-text">Snapshot current</span>
        )}
      </div>
      <div
        className="segmented-control"
        role="tablist"
        aria-label="Working copy view"
      >
        <button
          type="button"
          className={view === "original" ? "active" : ""}
          onClick={() => setView("original")}
        >
          <FileText size={13} /> Original
        </button>
        <button
          type="button"
          className={view === "modified" ? "active" : ""}
          onClick={() => setView("modified")}
        >
          <FileText size={13} /> Modified
        </button>
        <button
          type="button"
          className={view === "diff" ? "active" : ""}
          onClick={() => setView("diff")}
        >
          <FileDiff size={13} /> Differences
        </button>
      </div>
      {view === "original" ? (
        <pre className="canon-copy-preview">{copy.sourceContent}</pre>
      ) : null}
      {view === "modified" ? (
        <textarea
          className="canon-copy-textarea"
          rows={14}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : null}
      {view === "diff" ? (
        <pre className="canon-copy-diff">
          {lineDiff(copy.sourceContent, draft)}
        </pre>
      ) : null}
      <div className="inspector-actions wrap">
        <button type="button" disabled={!dirty} onClick={() => onSave(draft)}>
          <Check size={14} /> Save copy
        </button>
        <button type="button" onClick={onExportProposal}>
          <Send size={14} /> Export proposal
        </button>
        <button
          type="button"
          className="danger"
          disabled={sourceChanged}
          onClick={onApply}
          title={
            sourceChanged
              ? "Refresh or merge before applying"
              : "Apply after confirmation"
          }
        >
          <Upload size={14} /> Apply to WorldNotion
        </button>
      </div>
    </section>
  );
}
