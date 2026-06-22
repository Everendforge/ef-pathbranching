export type PlatformLabels = {
  openProject: string;
  saveProject: string;
  saveProjectAs: string;
  exportRuntime: string;
  revealProject: string;
};

type ShortcutEvent = Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey">;

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function platformLabelsFor(platform: string, userAgent: string): PlatformLabels {
  const normalizedPlatform = platform.toLowerCase();
  const normalizedUserAgent = userAgent.toLowerCase();
  const isMac = normalizedPlatform.includes("mac");
  const isWindows = normalizedPlatform.includes("win") || normalizedUserAgent.includes("windows");

  return {
    openProject: isMac ? "Open universe..." : "Open universe...",
    saveProject: "Save branching story",
    saveProjectAs: "Save into universe...",
    exportRuntime: "Export runtime package...",
    revealProject: isWindows ? "Reveal universe in Explorer" : isMac ? "Reveal universe in Finder" : "Reveal universe in Files",
  };
}

export function platformLabels(): PlatformLabels {
  if (typeof navigator === "undefined") {
    return platformLabelsFor("", "");
  }
  return platformLabelsFor(navigator.platform, navigator.userAgent);
}

export function shortcutMatches(event: ShortcutEvent, shortcut: string): boolean {
  if (!shortcut) return false;

  const parts = shortcut.split("+");
  const needsMod = parts.includes("Mod");
  const needsCtrl = parts.includes("Ctrl");
  const needsMeta = parts.includes("Meta");
  const needsAlt = parts.includes("Alt");
  const needsShift = parts.includes("Shift");
  const key = parts.find((part) => !["Mod", "Ctrl", "Meta", "Alt", "Shift"].includes(part));
  const eventKey = event.key.length === 1 ? event.key.toUpperCase() : event.key;

  const modMatches = !needsMod || event.metaKey || event.ctrlKey;
  const ctrlMatches = !needsCtrl || event.ctrlKey;
  const metaMatches = !needsMeta || event.metaKey;
  const altMatches = event.altKey === needsAlt;
  const shiftMatches = event.shiftKey === needsShift;
  const keyMatches = !key || eventKey === key;

  return modMatches && ctrlMatches && metaMatches && altMatches && shiftMatches && keyMatches;
}
