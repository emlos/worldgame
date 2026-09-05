# Worldgame architecture

Worldgame is organized by feature ownership. A module should live beside the
state or behavior it owns, rather than in a project-wide `classes`, `data`, or
`content` bucket.

## Repository layout

```text
story/                         Authored `.wg` source
src/
  characters/
    core/                      Character value objects shared by player and NPCs
    player/                    Player model, stats, education, schedule, and save validation
    npc/                       NPC model, AI, definitions, behavior, and save validation
      roster.js                NPC creation, home assignment, and brain startup
      presence.js              NPC location and interaction queries
  world/
    data/                      Static world definitions and tuning values
    model/                     Calendar, places, weather, and map implementation
    world.js                   World aggregate
    saveValidation.js          World, calendar, weather, place, and map save rules
  game/
    chat/                      Chat state, validation, and read models
    persistence/               Save serialization, hydration, and validation orchestration
    scene/                     Scene assembly, choice execution, and scene contracts
    game.js                    Top-level mutable game state and public facade
    actionRunner.js            Ordered player-action transaction
    bootstrap.js               Fresh-game construction only
    events.js                  Runtime-only game subscriptions
    movement.js                Player position, place access, and relocation
    navigation.js              GPS destinations and routes
    timeline.js                Simulation and resynchronization of game time
    timers.js                  Timer runtime
    timerDefinitions.js        Named timer content
  story/
    storyState.js              Flags and active-story lifecycle primitives
    saveValidation.js          Active story, continuation, and interrupt save rules
    systems/                   JavaScript-backed story systems
    wg/
      generated/               Compiler output; never edit by hand
      runtime/                 WG evaluation, resolution, effects, and materialization
      shared/                  WG contracts shared by compiler and runtime
  ui/browser/                  DOM rendering and browser input
  shared/util/                 Domain-neutral utilities only
tools/wg/compiler/             WG compiler implementation
tests/                         Runtime, compiler, and diagnostic-page tests
```

## Dependency direction

- `shared/util` must not import a game domain.
- `characters` and `world` may use shared utilities and their own modules.
- `game` coordinates character and world state and exposes the mutation facade
  used by choices, effects, saves, timers, and chats.
- Game services are stateless functions that accept the aggregate they operate
  on. They must not import the `Game` class or retain a game instance globally.
- Fresh-game bootstrap and save hydration are separate code paths. Loading a
  save must not generate and discard a temporary world or NPC roster.
- Save validation follows state ownership. Character, world, story, and game
  services define their own rules; `game/persistence/saveValidation.js` only
  validates the root envelope and coordinates cross-subsystem checks before
  hydration begins.
- `story/wg/shared` is independent of both compiler and runtime. The compiler
  and runtime may depend on it, but not on each other.
- `story/wg/generated` contains data only. Runtime behavior stays in
  `story/wg/runtime` and `story/systems`.
- `game/scene` is the application boundary that combines game state with WG
  story definitions. WG materializers emit the same validated scene contracts.
- `ui/browser` renders those contracts and delegates mutations to game or scene
  actions. Browser modules should not become a second rules engine.

The graph has no static JavaScript import cycles. Keep it that way: if two
features need the same pure helper or contract, extract that small boundary
instead of making them import each other's implementation internals.

## Placement rules

1. Put static definitions beside their owning feature. World registries belong
   in `world/data`; player and NPC definitions belong in their character folder.
2. Put WG syntax and tree contracts in `story/wg/shared`, WG execution in
   `story/wg/runtime`, and authored gameplay callbacks in `story/systems`.
3. Keep the `Game` class as the small stateful facade. Multi-step behavior
   belongs in a feature module; new UI and WG effects should call a named game
   operation instead of editing nested state directly.
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
