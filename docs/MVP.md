# PathBranching MVP

The first PathBranching MVP should prove the authoring and export loop without trying to become a full production suite.

## Goals

- Load the bridge demo project.
- Show a story-flow-first event graph.
- Show sequences, event nodes, and event transitions.
- Inspect an event's canon refs, unlocks, script ref, and engine target.
- Show canon refs imported from a WorldNotion-compatible vault.
- Export a runtime package from the playable story.
- Create sequences and event nodes.
- Connect events with explicit transitions.
- Define initial data classes and graph modules behind the story flow.
- Define projection rules from WorldNotion entities to PathBranching data classes as advanced/export infrastructure.
- Attach Ink source and compiled Ink JSON references to events.
- Parse Ink sections, choices, tags, diverts, and external functions in read-only form.
- Reference canon entities by stable ID from a WorldNotion-compatible vault.
- Define simple conditions and consequences.
- Export a runtime package compatible with Everend Spec v0.1.
- Include PathBranching extensions for sequences, events, scripts, transitions, and engine targets.
- Include PathBranching extensions for data classes, graph modules, and projection rules.
- Validate missing canon refs, missing Ink files, missing entry events, and broken graph transitions.
- Provide a Unity Ink-oriented export path.

## Non-goals

- No real-time collaboration.
- No cloud storage.
- No full engine runtime implementation inside PathBranching.
- No replacement for WorldNotion canon editing.
- No full visual Ink editor in the first MVP.
- No advanced graph-module/projection editor in the first MVP.
