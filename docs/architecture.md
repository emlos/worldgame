# Worldgame architecture

Worldgame separates reusable game machinery from one-off gameplay features.
Generic modules define contracts and extension points; a feature owns every
concrete rule, data contribution, and authored story file that exists only for
that feature.

## Repository layout

```text
story/                         Authored `.wg` source, grouped by feature
  bus/                         Bus hubs and authored bus text
  school/                      School scenes, events, and class content
src/
  features/                    Cross-cutting gameplay feature slices
    catalog.js                 Registration contract and composition
    index.js                   The game's enabled feature list
    placeContributions.js      Cycle-free composition of feature-owned places
    bus/                       Bus places, timetable, scene decoration, actions
    school/                    School timetable, classes, quizzes, context,
                               effects, reminders, views, and places
    rent/                      Rent timer definition
  characters/
    core/                      Character value objects shared by player and NPCs
    player/                    Player aggregate and save validation
    npc/                       NPC model, AI, definitions, behavior, and validation
  world/
    data/                      Shared world definitions and registry composition
    model/                     Calendar, places, weather, and map implementation
    world.js                   World aggregate
    saveValidation.js          World, calendar, weather, place, and map save rules
  game/
    chat/                      Chat state, validation, and read models
    persistence/               Save serialization, hydration, and validation
    scene/                     Generic scene assembly and choice execution
    game.js                    Top-level mutable game state and public facade
    actionRunner.js            Ordered player-action transaction
    bootstrap.js               Fresh-game construction only
    events.js                  Runtime-only game subscriptions
    movement.js                Player position, place access, and relocation
    navigation.js              GPS destinations and routes
    timeline.js                Simulation and resynchronization of game time
    timers.js                  Generic timer runtime
  story/
    storyState.js              Active-story lifecycle primitives
    saveValidation.js          Story, continuation, and interrupt save rules
    wg/
      generated/               Compiler output; never edit by hand
      runtime/                 Generic WG evaluation and materialization
      shared/                  WG grammar and contracts shared by all consumers
  ui/browser/                  DOM rendering and browser input
  shared/util/                 Domain-neutral utilities only
tools/wg/compiler/             WG compiler implementation
tests/                         Runtime, compiler, boundary, and diagnostic tests
```

## Feature boundary

Use `src/features/<name>/` when behavior is specific to one gameplay system and
crosses ordinary technical layers. A feature may own places, dynamic scene
content, choice actions, WG systems or behaviors, context, effects, checks,
  timers, reminders, NPC schedule conditions, navigation metadata, and
  feature-specific views. Its `.wg`
source belongs in `story/<name>/`.

`src/features/catalog.js` is the integration boundary. The application enables
features in `src/features/index.js`; generic infrastructure asks the catalog for
registered contributions. It must not switch on story IDs such as
`transit.bus-boarding`, place keys such as `bus_stop`, or feature names such as
`school.class`.

Choose the smallest fitting extension:

- A scene decorator adds dynamic content to an otherwise ordinary scene.
- A registered action handles a serializable, feature-owned choice command.
- `@behavior` augments an authored WG scene while leaving prose and passages in WG.
- `@system` delegates an entire scene or minigame to programmatic rendering.
- Context, effect, skill-check, timer, reminder, NPC schedule-condition, place,
  navigation, and view providers contribute their corresponding pieces without
  teaching the core runtime about the feature.

This is intended for unique systems such as bus travel, school, labyrinths,
minigames, jobs, combat, or shops with custom logic. Do not turn every ordinary
piece of authored content into a feature: static prose stays in WG, and data used
by many systems stays with its shared domain owner.

## Dependency direction

- `shared/util` must not import a game domain.
- `features/catalog.js` contains only generic registration mechanics.
- Feature implementations may depend on generic character, world, game, and WG
  contracts. Features must not import one another's implementation internals.
- Generic game and WG infrastructure consumes `game.features`; it does not import
  concrete bus, school, rent, or future feature modules.
- `features/index.js` is the composition root for runtime contributions.
  `features/placeContributions.js` is the deliberately narrow, cycle-free
  composition root used while constructing the world place registry.
- Game services are stateless functions that accept the aggregate they operate
  on. They must not import the `Game` class or retain a game instance globally.
- Fresh-game bootstrap and save hydration are separate code paths. Loading a save
  must not generate and discard a temporary world or NPC roster.
- Save validation follows state ownership. Subsystems define their rules;
  `game/persistence/saveValidation.js` only coordinates the root envelope and
  cross-subsystem checks before hydration.
- `story/wg/shared` is independent of compiler and runtime. Both consume the same
  grammar schema; neither keeps a private copy of WG syntax.
- `story/wg/generated` contains data only. Runtime callbacks remain in feature
  registrations and are never serialized.
- `ui/browser` renders scene/view contracts and delegates mutations to game or
  scene actions. It must not become a second rules engine.

The static JavaScript graph should remain cycle-free. If a registry composition
would introduce a cycle, extract a narrow data-only contribution module rather
than importing a feature through its full runtime entry point.

## Placement rules

1. Put reusable infrastructure beside the contract it implements; put concrete,
   one-off behavior in its feature folder.
2. Put a feature's authored WG under `story/<feature>/` and its programmatic
   implementation under `src/features/<feature>/`.
3. Keep the `Game` class as a small stateful facade. Multi-step behavior belongs
   in a service or feature operation.
4. Do not add forwarding modules or old-path aliases while the project is in
   active development. Update imports and tests with a move.
5. Treat generated WG output as a build artifact. Change `.wg` sources or the
   compiler and run `node tools/wg/compile.mjs`.

## Verification

Run both checks after architectural changes:

```powershell
node tools/wg/compile.mjs --check
node --test tests/*.test.mjs
```
