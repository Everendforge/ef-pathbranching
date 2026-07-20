<p align="center">
  <img src="src/assets/pathbranching-icon.png" width="120" alt="Everend PathBranching icon" />
</p>

<h1 align="center">Everend PathBranching</h1>
<p align="center">
  The visual branching narrative editor for <a href="https://github.com/Everendforge/everend-forge">Everend Forge</a>.<br />
  Interactive narrative graphs, Ink and SINPO GameData export, Everend Spec compatible.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg" alt="License">
  <img src="https://img.shields.io/badge/built%20with-Tauri%20%2B%20React%20Flow%20%2B%20TypeScript-1e2a4a.svg" alt="Built with Tauri, React Flow, TypeScript">
  <a href="https://github.com/Everendforge/everend-forge"><img src="https://img.shields.io/badge/Everend%20Forge-open%20core%20suite-0a0e1a.svg" alt="Part of Everend Forge"></a>
</p>

---

Everend PathBranching is the visual branching narrative editor for Everend Forge. It creates interactive narrative graphs and exports runtime packages and narrative format projections defined by Everend Spec.

PathBranching references canon entities by stable IDs from WorldNotion-compatible vaults, but it does not replace the canon vault.

## Product direction

PathBranching is the narrative structure and branching layer of Everend Forge. Its direction covers connected story creation for video games, roleplaying, and literature, with WorldNotion as canon and Compendium as a reading/publication surface. See [docs/PRODUCT_DIRECTION.md](docs/PRODUCT_DIRECTION.md) for the milestones and PathBranching's role in each one.

## Current Status

This repository currently contains design documentation, runtime examples, a TypeScript core, a React + React Flow story canvas, and a Tauri desktop shell. The UI opens the same universe folder used by WorldNotion, previews Markdown canon as references, stores branching metadata under `.everend/.pathbranching`, keeps the narrative canvas always open, validates modular conditions and rules, and previews runtime export.

The near-term export target is the SINPO-style Unity ecosystem: Ink-centered narrative output plus GameData-compatible runtime structures. Longer term, PathBranching should support additional narrative exports such as Twine and other engine/story formats without making those formats the authoring source of truth.

## V1 Authoring Contract

PathBranching v1 treats `BranchingProject` as the document source of truth. React Flow nodes, panel sizes, focus mode, preview drawers, and workspace sessions are authoring UI state; engine exports must be generated from the document model and must not depend on canvas layout.

The first complete authoring loop is:

1. Open a WorldNotion universe folder.
2. Preview canon read-only and create PathBranching data objects from selected canon refs when needed.
3. Reference WorldNotion files dynamically from events through stable canon refs; PathBranching refreshes labels, paths, warnings, and preview metadata from the current universe index.
4. Create safe WorldNotion edit suggestions from PathBranching when story authoring exposes canon changes. Suggestions are stored in the PathBranching story and remain `worldnotion-review-required`; they do not overwrite source Markdown.
5. Author a sequence as a branching map with Start, Event, Branch, and Final nodes.
6. Edit event text, decisions, outcomes, conditions, consequences, rule sets, Ink refs, and project data.
7. Save the story under `.everend/.pathbranching/stories`.
8. Export Runtime JSON, Ink, or SINPO GameData from the same `BranchingProject`.

Twine/Twee/Harlowe/SugarCube remain planned format projections. They should not become alternate authoring sources before the SINPO/Ink/GameData pipeline is stable.

## Development

~~~bash
npm install
npm run typecheck
npm run build
npm run verify:core
npm run verify:persistence
~~~

## Desktop Shell

PathBranching uses the same React/Vite frontend in web and desktop modes. Tauri is only the desktop packaging/runtime layer, which keeps the architecture aligned with the future Everend Forge suite.

~~~bash
npm run dev
npm run tauri:dev
npm run tauri:build
~~~

The Tauri shell supports Windows and macOS development and packaging with the same local-folder workflow as WorldNotion: open universe, save branching story into `.everend/.pathbranching`, runtime export, window-state restore, and desktop dialog permissions.

## Everend Forge Suite Compatibility

PathBranching remains a standalone app, but its core modules are exported so a future Everend Forge suite can mount it as the Branch page in a DaVinci Resolve-style workspace. Suite code should use the public exports from `src/index.ts` for domain types, project serialization, workspace loading, validation, runtime export, canvas modeling, environment helpers, and the `PathBranchingApp` component. It should not read private React state or Tauri command internals.

The future suite should share the same active universe folder that WorldNotion edits by default. PathBranching should continue to treat canon Markdown as read-mostly source data and store branching authoring state under `.everend/.pathbranching`.

Until WorldNotion and PathBranching reach beta-quality integration surfaces, Everend Forge should pin compatible releases or commits for suite integration rather than tracking every latest app change automatically.

## Implementation Starting Point

- [Docs Index](docs/README.md): recommended reading order.
- [Evpath Format](docs/EVPATH_FORMAT.md): the native `.evpath` text projection of events, editable from the inspector's Path tab.
- [Integration Architecture](docs/INTEGRATION_ARCHITECTURE.md): communication contracts between WorldNotion, PathBranching, and engine adapters.
- [Ontology and Projection Reanalysis](docs/ONTOLOGY_PROJECTION_REANALYSIS.md): revised model separating WorldNotion canon, PathBranching data classes, and engine runtime projections.
- [MVP](docs/MVP.md): first build boundary.
- [Unity Ink Adapter Notes](docs/UNITY_INK_ADAPTER_NOTES.md): practical notes for the first Unity + Ink engine adapter.
- [WorldNotion Bridge Fixture](examples/worldnotion-bridge-demo-project.json): generic bridge fixture for tests and documentation.
- [Unity Ink Runtime Package Example](examples/unity-ink-runtime-package.json): extended v0.1-compatible package example for Unity Ink import.

## Core Concepts

- Playable story flow
- Sequences
- Events
- Decisions
- Outcomes
- Variables
- Conditions
- Consequences
- Condition sets
- Rule sets
- Canon references
- Project data objects
- Ink script references and Ink-oriented export
- Data classes
- Projection rules
- Graph modules
- Localization keys

## Output

PathBranching exports JSON/YAML runtime packages that engine plugins can execute without the authoring app installed. The first practical adapter should also produce SINPO-compatible Ink/GameData output. Future exporters may target Twine and other branching narrative formats as projections from the same story graph.

## Related Repositories

- [Everend Forge portal](https://github.com/Everendforge/everend-forge)
- [Everend Spec](https://github.com/Everendforge/specs)
- [Everend WorldNotion](https://github.com/Everendforge/ef-worldnotion)

## License

Code is licensed under MIT OR Apache-2.0. Documentation is licensed under CC BY 4.0 unless stated otherwise.
