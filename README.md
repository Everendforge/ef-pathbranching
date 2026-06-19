# Everend PathBranching

Everend PathBranching is the visual branching narrative editor for Everend Forge. It creates interactive narrative graphs and exports runtime packages and narrative format projections defined by Everend Spec.

PathBranching references canon entities by stable IDs from WorldNotion-compatible vaults, but it does not replace the canon vault.

## Current Status

This repository currently contains design documentation, runtime examples, a TypeScript core, a React + React Flow story canvas, and a Tauri desktop shell. The UI loads the generic bridge project, shows collapsible Canon and PathBranching Files panels, keeps the narrative canvas always open, inspects selected nodes/edges/canon refs/project data objects, validates modular conditions and rules, and previews runtime export.

The near-term export target is the SINPO-style Unity ecosystem: Ink-centered narrative output plus GameData-compatible runtime structures. Longer term, PathBranching should support additional narrative exports such as Twine and other engine/story formats without making those formats the authoring source of truth.

## Development

~~~bash
npm install
npm run typecheck
npm run demo:bridge
~~~

## Desktop Shell

PathBranching uses the same React/Vite frontend in web and desktop modes. Tauri is only the desktop packaging/runtime layer, which keeps the architecture aligned with the future Everend Forge suite.

~~~bash
npm run dev
npm run tauri:dev
npm run tauri:build
~~~

The current Tauri config builds a native executable and keeps bundling disabled until app icons, signing, and distribution targets are finalized.

## Implementation Starting Point

- [Docs Index](docs/README.md): recommended reading order.
- [Integration Architecture](docs/INTEGRATION_ARCHITECTURE.md): communication contracts between WorldNotion, PathBranching, and engine adapters.
- [Ontology and Projection Reanalysis](docs/ONTOLOGY_PROJECTION_REANALYSIS.md): revised model separating WorldNotion canon, PathBranching data classes, and engine runtime projections.
- [MVP](docs/MVP.md): first build boundary.
- [Unity Ink Adapter Notes](docs/UNITY_INK_ADAPTER_NOTES.md): practical notes for the first Unity + Ink engine adapter.
- [WorldNotion Bridge Demo Project](examples/worldnotion-bridge-demo-project.json): generic bridge project using the demo vault.
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
- [Everend Spec](https://github.com/Everendforge/spec)
- [Everend WorldNotion](https://github.com/Everendforge/worldnotion)

## License

Code is licensed under MIT OR Apache-2.0. Documentation is licensed under CC BY 4.0 unless stated otherwise.
