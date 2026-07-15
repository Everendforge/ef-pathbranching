import type { BranchingProject, RuntimePackage } from "./domain.js";
import { exportInkProject, exportSinpoGameData, type InkProjectExport, type SinpoGameDataExport } from "./exportFormats.js";
import { exportRuntimePackage } from "./exportRuntime.js";
import { exportTwineHtml } from "./twineFormat.js";

export type ExportPreviewMode = "runtime" | "ink" | "gameData" | "twine";

export type ExportPreviewBundle = {
  mode: ExportPreviewMode;
  runtimePackage: RuntimePackage;
  inkExport: InkProjectExport;
  gameDataExport: SinpoGameDataExport;
  content: string;
  defaultName: string;
};

export function buildExportPreview(project: BranchingProject, mode: ExportPreviewMode): ExportPreviewBundle {
  const runtimePackage = exportRuntimePackage(project);
  const inkExport = exportInkProject(project);
  const gameDataExport = exportSinpoGameData(project);
  const inkContent = inkExport.files.map((file) => `// ${file.path}\n${file.content}`).join("\n\n");

  if (mode === "ink") {
    return {
      mode,
      runtimePackage,
      inkExport,
      gameDataExport,
      content: inkContent,
      defaultName: "story.ink",
    };
  }

  if (mode === "gameData") {
    return {
      mode,
      runtimePackage,
      inkExport,
      gameDataExport,
      content: `${JSON.stringify(gameDataExport, null, 2)}\n`,
      defaultName: "sinpo-game-data.json",
    };
  }

  if (mode === "twine") {
    return {
      mode,
      runtimePackage,
      inkExport,
      gameDataExport,
      content: exportTwineHtml(project),
      defaultName: "story.twine.html",
    };
  }

  return {
    mode,
    runtimePackage,
    inkExport,
    gameDataExport,
    content: `${JSON.stringify(runtimePackage, null, 2)}\n`,
    defaultName: "runtime-package.json",
  };
}
