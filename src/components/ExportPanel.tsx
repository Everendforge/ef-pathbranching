import { Download, FileCode2, FileUp, Package } from "lucide-react";
import { useRef, useState, type ChangeEvent, useMemo, type MouseEvent as ReactMouseEvent } from "react";
import { buildExportPreview, type ExportPreviewMode } from "../exportPreview.js";
import type { BranchingProject } from "../domain.js";
import { inspectTwineHtml, TWINE_FORMAT, TWINE_FORMAT_VERSION } from "../twineFormat.js";
import { WorkspaceSidePanel } from "./WorkspaceSidePanel.js";

export function ExportPanel({ project, collapsed, onCollapsedChange, onContextMenu, onExport, onImportTwine, onUpdate }: {
  project: BranchingProject; collapsed: boolean; onCollapsedChange: (collapsed: boolean) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void; onExport: (mode: ExportPreviewMode) => void;
  onImportTwine: (source: string, fileName: string) => void;
  onUpdate: (project: BranchingProject) => void;
}) {
  const preview = useMemo(() => buildExportPreview(project, "runtime"), [project]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [twineFile, setTwineFile] = useState<{ name: string; source: string; summary: ReturnType<typeof inspectTwineHtml> }>();
  const [twineError, setTwineError] = useState<string>();
  const characterRefs = Array.from(new Set((project.scriptDocuments ?? []).flatMap((script) => script.blocks.map((block) => block.characterRef ?? block.speakerRef).filter((ref): ref is string => Boolean(ref)))));
  const engineTargetKey = Object.keys(project.engineTargets ?? {})[0] ?? "default";
  const engineTarget = project.engineTargets?.[engineTargetKey] ?? { adapter: "default" };
  const speakerMappings = (engineTarget.speakerMappings ?? {}) as Record<string, string>;
  const chooseTwineFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const source = await file.text();
      const summary = inspectTwineHtml(source);
      if (summary.format !== TWINE_FORMAT) throw new Error(`Expected ${TWINE_FORMAT}; found ${summary.format}.`);
      setTwineFile({ name: file.name, source, summary });
      setTwineError(undefined);
    } catch (error) {
      setTwineFile(undefined);
      setTwineError(error instanceof Error ? error.message : String(error));
    }
  };
  return <WorkspaceSidePanel title="Export & Import" side="right" collapsed={collapsed} onCollapsedChange={onCollapsedChange} onContextMenu={onContextMenu}>
    <div className="export-panel-list">
      <section className="format-card">
        <div><FileUp size={16} /><span><strong>Import Twine 2 / SugarCube</strong><small>Reads passages, links, tags and canvas positions</small></span></div>
        <input ref={inputRef} className="visually-hidden" type="file" accept=".html,text/html" onChange={chooseTwineFile} />
        <button type="button" onClick={() => inputRef.current?.click()}>Choose HTML file</button>
        {twineFile ? <div className="format-status success"><span>{twineFile.summary.name}</span><small>{twineFile.summary.passageCount} passages · entry: {twineFile.summary.startPassageName ?? "first passage"}</small><button type="button" onClick={() => onImportTwine(twineFile.source, twineFile.name)}>Import as new sequence</button></div> : null}
        {twineError ? <div className="format-status error">{twineError}</div> : null}
        <small className="format-note">Target: Twine 2 HTML · {TWINE_FORMAT} {TWINE_FORMAT_VERSION}. SugarCube macros remain in the passage text.</small>
      </section>
      <button type="button" className="export-target" onClick={() => onExport("twine")}><FileCode2 size={16} /><span><strong>Twine 2 / SugarCube</strong><small>HTML · {preview.runtimePackage.nodes.length} passages</small></span><Download size={14} /></button>
      <button type="button" className="export-target" onClick={() => onExport("runtime")}><Package size={16} /><span><strong>Runtime Package</strong><small>{preview.runtimePackage.nodes.length} nodes · JSON</small></span><Download size={14} /></button>
      <button type="button" className="export-target" onClick={() => onExport("ink")}><FileCode2 size={16} /><span><strong>Ink</strong><small>{preview.inkExport.files.length} files · preview ready</small></span><Download size={14} /></button>
      <button type="button" className="export-target" onClick={() => onExport("gameData")}><FileCode2 size={16} /><span><strong>SINPO / Game Data</strong><small>JSON · preview ready</small></span><Download size={14} /></button>
      {characterRefs.length ? <section className="coming-soon-card"><strong>Character → Speaker</strong>{characterRefs.map((characterRef) => <label key={characterRef}><span>{project.canonRefs.find((ref) => ref.id === characterRef)?.label ?? characterRef}</span><input value={speakerMappings[characterRef] ?? ""} placeholder="Engine speaker ID" onChange={(event) => onUpdate({ ...project, engineTargets: { ...(project.engineTargets ?? {}), [engineTargetKey]: { ...engineTarget, speakerMappings: { ...speakerMappings, [characterRef]: event.target.value } } } })} /></label>)}</section> : null}
      <section className="coming-soon-card"><strong>Harlowe</strong><span>Coming soon · adapter not installed</span></section>
      <section className="coming-soon-card"><strong>More formats</strong><span>Coming soon · configurable adapters</span></section>
    </div>
  </WorkspaceSidePanel>;
}
