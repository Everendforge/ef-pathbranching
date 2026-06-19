# Ontology and Projection Reanalysis

This document corrects an important assumption in the first bridge design:

Unity adapter data is not the final structure of WorldNotion worldbuilding.

Unity data is a runtime projection. WorldNotion canon can be broader, looser, more literary, more modular, and organized differently per world. PathBranching should not copy WorldNotion categories directly into Unity classes, and it should not treat the current Unity ScriptableObjects as the source ontology.

## Revised Mental Model

The system has three distinct layers.

~~~text
WorldNotion
  Canon ontology, world categories, classes, relationships, notes
    |
    | selected references and semantic roles
    v
PathBranching
  Modular graph structures, narrative logic, projections, validation
    |
    | runtime package and engine mapping profile
    v
Engine Adapter
  Unity ScriptableObjects, Ink JSON, engine assets, runtime state
~~~

The important word is projection.

PathBranching does not simply migrate WorldNotion into Unity. It projects selected WorldNotion entities into narrative data classes, then projects those classes into engine-specific runtime structures.

## Layer 1: WorldNotion Canon Ontology

WorldNotion should remain flexible and world-first.

It can contain:

- cultures
- eras
- concepts
- species
- religions
- places
- scenes
- routes
- items
- symbolic objects
- characters
- documents
- memories
- historical events
- compendium entries
- project-specific categories

These categories do not need to match Unity classes.

For example, a WorldNotion entity can be:

~~~yaml
id: concept:seasonal-signal
type: seasonal-cycle
name: Seasonal Signal
status: canon
~~~

Later, a projection can decide that this concept produces one Unity knowledge entry, one PathBranching knowledge condition, and maybe no runtime object in another engine.

## Layer 2: PathBranching Authoring Model

PathBranching should own the playable story layer. Its transformation tools exist because the story needs to become game runtime data.

It needs:

- narrative flow objects
- editable story objects
- decisions and outcomes
- conditions and consequences
- visual graph modules
- node types
- data classes
- class dependencies
- subclass rules
- condition modules
- consequence modules
- script modules
- projection rules
- validation rules

This means PathBranching is not only an event graph editor. It is a story-flow editor with modular translation infrastructure behind it.

### PathBranching Graph Types

PathBranching should eventually support several graph views:

- `Narrative Graph`: sequences, branches, events, choices, outcomes.
- `Script Graph`: Ink sections, diverts, tags, external functions.
- `Data Graph`: classes, subclasses, dependencies, required fields, relationships.
- `Projection Graph`: mapping from canon entities to runtime data classes.
- `Engine Graph`: mapping from runtime data classes to Unity/Godot/Unreal adapters.
- `Format Export Graph`: mapping from story objects to Ink, Twine/Twee, and other narrative formats.

The first UI should start with the narrative graph. Data and projection graphs are advanced views that support the story workflow.

The first format target should be the current SINPO-compatible Ink/GameData path. Twine/Twee and other exports should come after the Ink/GameData pipeline is reliable.

## Layer 3: Engine Runtime Projection

Unity is the first adapter target.

Typical Unity adapter classes may include:

- `SequenceData`
- `BranchData`
- `EventsData`
- `DecisionsData`
- `Estado`
- `WorldbuildingData`
- `ItemData`
- `CharacterData`

These are not canon categories. They are runtime data classes.

`WorldbuildingData` or equivalent knowledge data should be treated as a Unity projection inspired by worldbuilding, not as the same thing as the WorldNotion worldbuilding model.

## Classes, Subclasses, and Data Roles

WorldNotion taxonomy describes canon entity types.

PathBranching class definitions describe authoring and runtime roles.

Engine class definitions describe adapter output targets.

These should be separate but mappable.

~~~text
WorldNotion type
  concept
  character
  location
  seasonal-cycle
  memory

PathBranching data class
  KnowledgeEntry
  Speaker
  SceneSetting
  UnlockCondition
  EventSource

Unity output class
  WorldbuildingData
  CharacterData
  EventsData
  ItemData
~~~

One WorldNotion entity may project to multiple PathBranching classes.

One PathBranching class may project to multiple engine classes.

Some WorldNotion entities may never project to runtime.

Some runtime data may be authored only in PathBranching and not exist in WorldNotion.

## Example Projection

WorldNotion entity:

~~~yaml
id: concept:seasonal-signal
type: seasonal-cycle
name: Seasonal Signal
status: canon
tags: [ridina-route]
~~~

PathBranching projection:

~~~json
{
  "sourceRef": "concept:redhtamokat",
  "dataClass": "KnowledgeEntry",
  "roles": ["unlockable", "conditionTarget"],
  "fields": {
    "title": "$source.name",
    "body": "$source.body",
    "route": "sequence:ridina"
  }
}
~~~

Unity projection:

~~~json
{
  "targetClass": "UnityKnowledgeData",
  "fields": {
    "ID_numero": 1,
    "Title": "$projection.fields.title",
    "parrafos": "$projection.fields.body"
  }
}
~~~

This is a three-step mapping, not a direct copy.

## WorldNotion Gaps To Solve

WorldNotion currently handles Markdown entities and taxonomy, but the larger system will need:

- better class/type editing UI for custom taxonomy
- typed relationship fields with selectors
- class inheritance or subtype conventions
- project-specific data roles, such as `unlockable`, `speaker`, `runtime-item`
- views that group entities by role, not only by folder or type
- validation for typed references and required custom fields
- exportable vault index for PathBranching
- optional projection hints without making WorldNotion engine-specific

WorldNotion should not become an engine data editor, but it should be able to express enough semantic structure for PathBranching to consume.

## PathBranching Gaps To Solve

PathBranching needs a strong story-flow experience first:

- playable sequence and event graph
- event inspector with canon refs, decisions, outcomes, scripts, conditions, and consequences
- bridge from WorldNotion canon into story objects
- runtime package export from the playable story
- modular graph node definitions
- data class definitions
- projection mapping definitions
- dependency graphs between classes
- validation of required inputs and outputs
- visual mapping between canon entities and runtime roles
- import of WorldNotion vault indexes
- export of engine-specific mapping profiles
- SINPO-oriented Ink/GameData export
- Ink parser and script graph
- later Twine/Twee and other narrative format exporters
- package validator before engine import

The first PathBranching app should be built around playable story flow, supported by modules, not hardcoded Unity concepts.

## Unity Adapter Gaps To Solve

The current Unity implementation works as proof, but the adapter layer will need:

- stable import IDs separate from Unity asset GUIDs
- generated or synchronized ScriptableObjects
- mapping from WorldNotion stable IDs to legacy numeric IDs when needed
- validation for missing Ink JSON, missing assets, and broken event IDs
- adapter-owned metadata so imports can update existing assets safely
- clear separation between generated data and hand-authored Unity presentation assets

## Revised Build Order

1. Strengthen WorldNotion demo vaults with richer world categories and semantic roles.
2. Build the narrative event graph from a demo project.
3. Define PathBranching class and projection models as infrastructure behind story objects.
4. Build the WorldNotion vault index bridge without assuming Unity output.
5. Build advanced data/projection graph support for classes, dependencies, and projections.
6. Add SINPO-oriented Ink/GameData export.
7. Add Ink parsing and script graph.
8. Export a runtime package with projection metadata.
9. Build the Unity adapter as one projection target.
10. Add Twine/Twee and more engine/narrative format exporters later.

## Design Rule

Never make an engine class the source of truth for canon.

WorldNotion owns canon. PathBranching owns transformation and narrative logic. Engine adapters own runtime materialization.
