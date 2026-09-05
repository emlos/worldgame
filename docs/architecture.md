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
    player/                    Player model, stats, education, and schedule
    npc/                       NPC model, AI, definitions, and behavior constants
  world/
    data/                      Static world definitions and tuning values
    model/                     Calendar, places, weather, and map implementation
    world.js                   World aggregate
  game/
    chat/                      Chat state, validation, and read models
    persistence/               Save-shape validation boundary
    scene/                     Scene assembly, choice execution, and scene contracts
    game.js                    Top-level mutable game state and public facade
    timers.js                  Timer runtime
    timerDefinitions.js        Named timer content
  story/
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
3. Keep the `Game` class as the stateful facade. New UI and WG effects should
   call a named game operation instead of editing nested state directly.
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
