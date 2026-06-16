# Everend PathBranching Design

Everend PathBranching is a standalone app for branching narrative design. It models interactive flow and exports runtime packages; it does not replace the canon vault.

## Relationship with WorldNotion

PathBranching references canon entities by stable IDs defined in a WorldNotion-compatible vault. For example, a dialogue node can use speakerRef: example-character without copying the full character sheet.

## Project concepts

- Node: a narrative flow unit.
- Choice: selectable option that points to another node.
- Variable: persistent state used by conditions and consequences.
- Condition: rule that determines availability.
- Consequence: variable change, event, or narrative marker.
- Event: signal for a runtime or external engine.
- Localization key: stable key for translated text.
- Canon reference: stable ID reference to a vault entity.

## App boundaries

- PathBranching stores graphs in its own authoring format.
- PathBranching exports JSON/YAML runtime packages.
- PathBranching may integrate with a vault, but does not require WorldNotion to be installed.
- Runtime packages must not contain private UI state.

## Export goal

An export should contain package metadata, entry node, nodes, choices, variables, conditions, consequences, events, localization keys, and canon references.

## MVP direction

The first public design should prioritize creating nodes and choices, connecting narrative flow, defining simple variables, referencing canon entities by ID, exporting JSON/YAML, and validating broken transitions and missing canon references.
