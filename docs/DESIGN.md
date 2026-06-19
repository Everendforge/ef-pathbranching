# Everend PathBranching Design

Everend PathBranching is a standalone app for building playable branching story flow. It is inspired by the intent of tools like Articy Draft X: authors should feel that they are shaping a game narrative, not filling a database or configuring an exporter.

PathBranching models interactive flow and exports runtime packages; it does not replace the canon vault.

## Relationship with WorldNotion

PathBranching references canon entities by stable IDs defined in a WorldNotion-compatible vault. For example, a dialogue node can use speakerRef: example-character without copying the full character sheet.

## Product center

The primary surface is the narrative flow:

- sequences and chapters
- events and scenes
- dialogue beats
- decisions and outcomes
- transitions
- conditions
- consequences
- variables
- canon references

Data classes, graph modules, and projection rules exist behind this flow. They are infrastructure for making the story exportable and engine-ready, not the first thing an author should experience.

## Project concepts

- Story object: a playable narrative unit such as a sequence, event, decision, or outcome.
- Node: a visual representation of a story object.
- Choice: selectable option that points to another node or outcome.
- Variable: persistent state used by conditions and consequences.
- Condition: rule that determines availability.
- Consequence: variable change, event, or narrative marker.
- Event: signal for a runtime or external engine.
- Localization key: stable key for translated text.
- Canon reference: stable ID reference to a vault entity.
- Data class: internal role used by modules and projections.
- Projection rule: export mapping from narrative data to engine data.

## App boundaries

- PathBranching stores graphs in its own authoring format.
- PathBranching exports JSON/YAML runtime packages.
- PathBranching may integrate with a vault, but does not require WorldNotion to be installed.
- Runtime packages must not contain private UI state.

## Export goal

An export should contain package metadata, entry node, narrative nodes, choices, variables, conditions, consequences, events, scripts, localization keys, canon references, and optional projection metadata.

## MVP direction

The first public design should prioritize loading a demo project, showing the narrative flow, inspecting an event, listing WorldNotion canon references, exporting JSON/YAML, and validating broken transitions, missing scripts, and missing canon references.
