// React entry point for embedding the PathBranching app. Kept separate from
// ./index.ts because App.tsx imports browser/DOM assets (e.g. PNG icons) that
// plain Node cannot load; the core barrel must stay Node-safe for verify:core.
export { App as PathBranchingApp } from "./App.js";
