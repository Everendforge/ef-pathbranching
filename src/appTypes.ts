export type Selection =
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "canon"; id: string }
  | { type: "file"; id: string }
  | { type: "dataObject"; id: string }
  | { type: "canonSuggestion"; id: string }
  | { type: "explorerEntity"; id: string }
  | { type: "explorerType"; id: string; source: "canon" | "local" }
  | { type: "explorerProperty"; id: string; source: "canon" | "local" };

export type CanvasMode = "branching" | "focus";
export type AppView = "home" | "workspace";
export type MarkdownDraftFormat =
  "markdown" | "ink" | "gameData" | "frontmatter";

export type MarkdownEditorTab = {
  id: string;
  canonRefId: string;
  title: string;
  sourcePath?: string;
  workingCopyPath?: string;
  format: MarkdownDraftFormat;
  content: string;
  dirty: boolean;
  saving?: boolean;
  lastSavedAt?: number;
  modifiedMs?: number;
};
