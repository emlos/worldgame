# Worldgame code review — 2026-08-23

Reviewed repository: `C:\Users\milo\Documents\projects\Programming\worldgame`

Reviewed revision: `95d8720` (`main`, one commit ahead of `origin/main`). The worktree was clean before this report. The review assumes the current data/save format may be changed freely and does not recommend backward-compatibility work.

## Executive summary

The deterministic world, clock, weather, calendar, and NPC-save paths are in good shape: every existing Node test passes, all JavaScript parses, and 25 seeded worlds survived two simulated days plus exact save/load round-trips.

The most important defects found outside that coverage were:

1. Default NPC registry entries used to have a separate registry shape. **Resolved:** registry entries are now direct `NPC` constructor data, use stable IDs, preserve metadata, and entries marked `meta.example` are omitted from the default roster.
2. Reading a player stat used to mutate its stored modifier state, while NPC evaluation discarded stored modifiers. **Resolved:** evaluation now uses a detached clone and serialization continues to preserve `base`, `add`, and `mult` separately.
3. Current-version saves are not validated as a coherent object graph, so invalid locations, duplicate IDs, missing bodies, and broken map references can be accepted or fail with unrelated runtime errors.

## Verification performed

- Passed `tests/random/random_determinism_test.mjs`.
- Passed `tests/npc/npc_save_continuity_test.mjs`.
- Passed `tests/weather/weather_timeline_test.mjs`.
- Passed `tests/world/time_integrity_test.mjs`.
- Passed `tests/world/calendar_query_test.mjs`.
- Passed `node --check` for every `.js` and `.mjs` file.
- Passed a 25-seed smoke test checking map connectivity/IDs, NPC locations and homes, two days of simulation, and exact save/load output.
- Ran focused reproductions for every behavior marked "confirmed" below.

## Findings

### WG-01 — High — Default NPCs are built from the wrong registry shape

**Status: resolved in the working tree.** `NPC_REGISTRY` entries now use the `NPC` constructor shape directly (`id` plus `meta`), the redundant adapter has been removed, and `Game` filters `meta.example` entries only for its default roster. A dedicated Node regression suite covers direct construction, stable IDs, metadata, default filtering, and explicit example construction.

At the reviewed revision, `Game` passed `NPC_REGISTRY` entries directly to `new NPC(def)`, but those entries used `key`, `shortName`, top-level `tags`, and `description` while `NPC` expected `id` and `meta`.

The original confirmed result for a normal `new Game(...)` was:

- Taylor is keyed and identified as `"Taylor Morgan"`, not `"taylor"`.
- Every NPC loses `meta.shortName`, `meta.tags`, and `meta.description`; only `meta.registryKey` is patched back in later.
- Taylor is included even though the registry marks that entry as example-only and comments that it is not a real NPC.

The implementation resolves this at the data boundary rather than adding another adapter:

- Every registry entry is a complete `NPC` constructor object with a stable `id` and display metadata under `meta`.
- `Game` excludes `meta.example` entries only when the caller uses the default roster.
- Explicit `npcTemplates` remain authoritative, so tests can still construct Taylor directly.
- The old registry adapter and registry-specific runtime patch have been removed.

### WG-02 — High — Stat reads destroy or rewrite modifier state

**Status: resolved in the working tree.** `Stat.clone()` creates a detached structural copy, and both player and NPC evaluation apply trait modifiers only to that temporary copy. `Stat.toJSON()` deliberately remains structural—`base`, `add`, and `mult` are serialized separately rather than flattened into the resolved value. Regression coverage verifies pure repeated reads and player/NPC save/load behavior.

At the reviewed revision, `Player.getStatValue` called `clearModifiers()` on the stored `Stat` and then wrote trait modifiers into that same object. `NPC.getStatValue`, meanwhile, created a fresh `Stat` from only the base value and ignored any stored modifiers.

The original confirmed behavior was:

- A player stat with base `10` and a stored `+5` modifier reports `15` before the read, but `getStatValue()` returns `10` and deletes the modifier.
- After evaluating a `+2` trait, the player's serialized stat contains `add: [2]`; merely reading the stat changed the save payload.
- An NPC stat whose stored value is `15` returns `10` from `getStatValue()`.

The implementation keeps two layers distinct:

- Persistent modifiers remain in the character's stored `Stat` and in its structured save data.
- Trait/context modifiers exist in trait data and are added only to a temporary evaluation clone.
- The resolved numeric value is returned by `getStatValue()` but is never substituted for modifier structure in `toJSON()`.

### WG-03 — High — Save hydration does not validate current-schema referential integrity

`Game.fromJSON` verifies only the top-level version before hydrating (`src/classes/game/game.js:347-415`). It does not ensure that player/home/NPC location and place IDs exist, that NPC IDs are unique, or that the game seed agrees with saved random streams. `WorldMap.fromJSON` silently skips edges whose endpoints are missing and overwrites duplicate location IDs (`src/classes/world/util/worldmap.js:682-715`).

Confirmed behavior: changing a valid v6 save's `currentLocationId` to `"missing"` is accepted; the loaded game then exposes `game.location === undefined`.

There is also a direct broken fallback in `NPC.fromJSON`: when `body` is absent, it references an undeclared `template` variable (`src/classes/npc/npc.js:331-334`) and throws `ReferenceError: template is not defined` rather than a schema error or an intentional default.

Impact: the editable save dashboard can load a game that is internally inconsistent and fails later, far from the source of the bad data. Duplicate NPCs/locations can silently disappear through `Map#set` replacement.

Recommended fix: validate the complete v6 schema and object graph before constructing runtime objects. Because compatibility is not required, reject missing required fields rather than retaining accidental fallbacks. Validate uniqueness, all cross-references, edge endpoints, finite numeric state, behavior/brain clocks, and seed agreement. Fix or remove the undeclared `template` fallback.

### WG-04 — Medium — Passing an `NPC` instance shares mutable state across games

`_createNPCs` reuses an `NPC` instance verbatim (`src/classes/game/game.js:458-460`) and then mutates its home, location, ID, metadata, and brain.

Confirmed behavior: creating two games with the same `NPC` instance makes both maps point to the exact same object. The second construction changes the first game's NPC home, and the reused NPC does not start at its newly assigned second-game home because its first-game location is already set.

Impact: tests, previews, or multiple saves running in one page contaminate each other; the first game can reference a home created only in the second world.

Recommended fix: reject runtime `NPC` instances as templates, or deep-clone them through a deliberate template/snapshot API before assignment. Never mutate a caller-owned template object.

### WG-05 — Medium — A goal with `weight: 0` is still selectable

Candidate construction uses `Math.max(0, Number(rule.weight) || 1)` (`src/classes/npc/npcBrain.js:490-503`, repeated at `src/classes/npc/npcBrain.js:521-528`). Since `0 || 1` is `1`, zero cannot disable a rule.

Confirmed behavior: with equal-priority home goals weighted `0` and `1`, an RNG roll of zero selects the zero-weight rule.

Impact: content authors cannot turn a rule off or express a true zero probability, and authored weights do not match runtime behavior.

Recommended fix: default only nullish/missing weights, then validate: `const weight = rule.weight == null ? 1 : Number(rule.weight)`. Reject non-finite or negative values and preserve zero.

### WG-06 — Medium — `respectOpening` checks departure time, not arrival time

Both general map helpers check `place.isOpen(atTime)` before calculating travel (`src/classes/world/util/worldmap.js:1206-1227`, `src/classes/world/util/worldmap.js:1233-1253`). The NPC brain correctly checks the computed arrival time, but these public helpers do not.

Confirmed behavior: at 16:59, a five-minute-away bank closing at 17:00 is returned by `findNearestPlace(..., respectOpening=true)` even though it is closed at the 17:04 arrival.

Impact: callers can route a player or non-brain system to a place that is closed when reached.

Recommended fix: calculate travel first, derive `arrivalAt`, and check opening at arrival. Return travel/arrival data with the selected result so callers do not recalculate it inconsistently.

### WG-07 — Medium — Game time APIs silently disagree on numeric strings

`Game.advanceMinutes` requires an actual finite number and silently returns otherwise (`src/classes/game/game.js:130-134`), while `World.advance` explicitly converts with `Number(...)` (`src/classes/world/world.js:61-68`). `runAction` first uses coercive `minutes > 0`, then calls the strict method (`src/classes/game/game.js:295-307`).

Confirmed behavior: `game.advanceMinutes("60")` advances zero minutes. `runAction({ minutes: "60", ... })` applies and logs the action but also advances zero minutes. HTML form and dataset values are strings by default.

Impact: gameplay effects can commit without their intended time cost, with no error to tell the caller.

Recommended fix: choose one contract. Prefer strict conversion and validation at the public boundary: convert once, reject non-finite/non-positive values with a useful error, and use the validated value throughout `runAction`.

### WG-08 — Medium — Place instances and raw save objects expose shared mutable data

Generated places receive `def.props` (`src/classes/world/util/worldmap.js:325-366`), and `Place` only shallow-copies it while specially cloning opening hours (`src/classes/world/util/place.js:123-137`). Nested arrays/objects such as `category` and `ages` remain shared between every instance and the static registry.

Confirmed behavior: two generated `jewelry_store` instances share the exact same `props.category` array with each other and with `PLACE_REGISTRY`. Mutating one mutates all of them.

`Place.toJSON` also returns the live `props` object (`src/classes/world/util/place.js:140-147`). Confirmed behavior: mutating `game.toJSON().world.map.locations[...].places[...].props` mutates the running game. Other serializers also return selected live nested objects.

Impact: per-instance state can leak across the world and into registry templates; editing a raw snapshot can mutate the game before it is serialized.

Recommended fix: clone/freeze registry inputs at the boundary and return detached save data. `structuredClone` is suitable for data-only objects; a small explicit serializer is preferable where classes/functions are allowed.

### WG-09 — Medium — Generated changelog data is unsafe and can be invalid

The Pages workflow manually assembles JSON and escapes only backslashes/quotes in the commit subject, not the author name (`.github/workflows/pages.yml:36-45`). A quote or backslash in the configured Git author name can make `commits.json` invalid.

The index then interpolates author and message fields into `innerHTML` (`index.html:90-107`). Commit metadata containing HTML can inject markup/event handlers into the deployed page.

Impact: a valid Git commit can break the changelog, and contributor-controlled metadata can execute browser-side markup/script gadgets on the Pages origin.

Recommended fix: generate JSON with a real JSON encoder (for example a short Node script), and render each DOM node with `textContent` plus a separately validated commit URL. Do not concatenate commit metadata into HTML.

### WG-10 — Low — Several public numeric boundaries permit poisoned or non-terminating state

Examples:

- `WorldMap` documents non-negative density but does not validate it (`src/classes/world/util/worldmap.js:634-667`). `density: Infinity` produces an infinite target count and can leave generation looping indefinitely.
- Body damage/healing checks only `amount <= 0`; `NaN` passes that guard and poisons health/pain with `NaN` (`src/shared/classes/body.js:445-499`).
- `Stat.addMult(0)` stores `1` because it uses `Number(factor) || 1` (`src/shared/classes/stat.js:15`), so a legitimate zero multiplier cannot be represented through the public API.
- `parseTimeToMinutes` turns malformed time text into midnight despite documenting `defaultValue` for invalid input, and it accepts values such as `24:30` (`src/shared/util/date.js:22-54`).

Recommended fix: centralize finite-number/time validation and fail immediately at public/data-loading boundaries. Do not use `||` when zero is a valid value.

### WG-11 — Low — Removed localization work left an orphan module and compatibility branches

The latest commit removes the scene player and internationalization, but `src/classes/game/util/localisation.js` remains with no references. There are also explicit legacy branches in active code (for example `preferLocationsWith`, legacy weather saves, old `Stat` private-field names, and string place categories) even though backward compatibility is not a project goal.

Impact: dead code and unused compatibility paths make the active contract harder to see and enlarge the review/test surface.

Recommended fix: remove the orphan module and decide which legacy branches are still intentionally useful for current authoring. Delete the rest together with their obsolete comments/tests.

## Prioritized TODO list

### P0 — Correctness before adding gameplay systems

- [x] Make every NPC registry entry direct `NPC` constructor data; no adapter is required.
- [x] Use stable registry IDs as runtime NPC IDs and preserve `shortName`, nicknames, tags, and descriptions in `meta`.
- [x] Exclude `meta.example` NPCs from the default game roster.
- [x] Make player/NPC stat evaluation pure and keep persistent versus contextual modifiers separate.
- [ ] Add strict validation for the complete current save schema and all ID/reference relationships.
- [ ] Fix/remove the undeclared `template` branch in `NPC.fromJSON`.

### P1 — Behavior and state isolation

- [ ] Reject or clone caller-provided `NPC` instances before adding them to a game.
- [ ] Preserve zero NPC-goal weights and reject invalid weights.
- [ ] Check place opening hours at arrival time in nearest/random place queries.
- [ ] Normalize or strictly reject numeric-string time values consistently across `Game`, `World`, and UI callers.
- [ ] Deep-clone/freeze registry property data per place instance.
- [ ] Make all `toJSON()` results detached snapshots, or document and enforce JSON-stringification-only usage.
- [ ] Generate changelog JSON with a real encoder and render commit metadata without `innerHTML`.

### P2 — Hardening and cleanup

- [ ] Validate density, map dimensions, damage/healing amounts, stat factors, schedule times, listener callbacks, and generated/manual IDs.
- [ ] Reject duplicate NPC, location, place, edge, trait, relationship, and clothing-slot entries rather than silently overwriting them.
- [ ] Avoid constructing and discarding a full generated `World` inside `Game.fromJSON`; add a hydration shell/factory.
- [ ] Remove the orphan `Localizer` module.
- [ ] Remove compatibility branches that no longer serve the current schema.
- [ ] Add a small documented command (or package script) that runs all Node checks locally, matching CI.

### Missing regression tests

- [x] Default game uses stable registry NPC IDs, preserves metadata, and omits example-only entries.
- [x] Stat reads are idempotent and do not alter serialized output.
- [x] Persistent player and NPC modifiers survive and affect a save/load round-trip.
- [ ] Zero-weight goals are never selected.
- [ ] Reusing an NPC template cannot couple two games.
- [ ] Invalid current-version saves fail early with path-specific errors.
- [ ] Duplicate IDs and broken map references are rejected.
- [ ] Opening-hour queries use arrival time.
- [ ] Public time APIs handle numeric strings and invalid numbers consistently.
- [ ] Registry/place/save snapshots do not alias live mutable data.
- [ ] Changelog generation handles quotes, backslashes, Unicode, and HTML-like author/subject text.

## Existing feature TODOs found in source

These are authored backlog items rather than review defects:

- [ ] Add blood and blood-loss conditions (`src/shared/classes/body.js:74`).
- [ ] Add NPC transport preference for bus/car/walking (`src/data/npc/npcs.js:9`).
- [ ] Add behavior preferences for weather, time, day, recent activities, events, and distance (`src/data/npc/behavior.js:19-25`).
- [ ] Add the proposed chase behavior for Luce if that NPC returns (`src/data/npc/npcs.js:322`).
- [ ] Enforce min/max age restrictions on places (`src/data/world/place.js:1280`).
- [ ] Add the proposed NPC archetypes listed at `src/data/npc/npcs.js:1053`.
