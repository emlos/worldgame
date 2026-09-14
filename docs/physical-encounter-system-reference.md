# Physical Encounter System Reference

This document describes the physical encounter system that is implemented in the repository now. It is an implementation reference for story authors and developers, not a roadmap. For design rationale and proposed future work, see [`physical-encounter-system-design.md`](physical-encounter-system-design.md).

## Current scope

The registered story system is `encounter.physical`. The registered scenario is `fight`; its current goal modules are `steal-money` and `beat-down`.

The current scenario supports:

- one player and one temporary scene actor used as the opponent;
- telegraphed NPC intent and one player response per exchange;
- second-based action durations and interruption of slower actions;
- range, pose, wall support, facing, wrist grips, and limb pins;
- strikes, defensive reactions, movement, escape, holds, takedowns, pins, and theft;
- persistent body-part damage and pain;
- scene-local exertion, daze, winded, and off-balance effects;
- goal-aware, personality-weighted deterministic NPC action selection;
- player escape or rescue, NPC retreat, NPC incapacitation, conscious theft, and incapacitated theft outcomes;
- save/load validation, deterministic rolls, debug diagnostics, and simulation tooling.

It does not currently provide weapons, armor, selectable stances, more than two participants, mouth restraints, attacks against legs or the groin, or a general injury-healing system.

## Declaring an encounter in WG

Physical encounters are runtime story systems. There is no `@combat` directive.

The implemented alley mugging is declared in [`story/encounters/alley.wg`](../story/encounters/alley.wg):

```wg
:: encounter.alley-mugging -> @exit
  @actor mugger civilian

  @system encounter.physical {"scenario":"fight","opponent":{"id":"mugger","actor":"mugger"},"goal":{"id":"steal-money","maxAmount":20},"outcomes":{"player-rescued":"encounter.alley-mugging-rescue"}}
```

The declarations have these roles:

| Declaration | Purpose |
|---|---|
| `:: encounter.alley-mugging -> @exit` | Declares the WG scene and sends `finish` to the ordinary story exit. |
| `@actor mugger civilian` | Generates and serializes a temporary actor under the alias `mugger`. |
| `@system encounter.physical ...` | Hands the scene body to the registered JavaScript story system. |

### System configuration

The `@system` JSON object currently accepts these meaningful fields:

| Field | Required | Current value | Meaning |
|---|---:|---|---|
| `scenario` | yes | `"fight"` | Selects the general two-participant fight scenario. |
| `opponent` | yes | `{"id":"mugger","actor":"mugger"}` | Gives the non-player participant ID and its WG temporary-actor alias. |
| `goal` | yes | `{"id":"steal-money","maxAmount":20}` | Selects and configures the encounter objective. |
| `outcomes` | no | `{"player-rescued":"..."}` | Maps terminal outcome IDs (or `default`) to authored scene routes. |

The current fight scenario can also route individual terminal outcomes to authored WG scenes. A string route is sufficient when no extra effects or paragraphs are needed:

```wg
@system encounter.physical {"scenario":"fight","opponent":{"id":"mugger","actor":"mugger"},"goal":{"id":"steal-money","maxAmount":20},"outcomes":{"player-rescued":"encounter.alley-mugging-rescue"}}
```

`outcomes.default` may provide a fallback. An outcome route may instead be an object with a required `target` plus optional `effects` and `paragraphs`. If no route matches, finishing the combat uses the encounter scene's ordinary final target.

The opponent actor alias must exist in `game.currentStory.actors` when the system state is created. The current validator requires the scenario to be `fight` and delegates goal-specific validation to the selected objective.

## Feature and scenario registration

The feature is registered in [`src/features/encounter/index.js`](../src/features/encounter/index.js):

```js
export const ENCOUNTER_FEATURE = defineFeature({
  id: "encounter",
  wgSystems: {
    "encounter.physical": PHYSICAL_ENCOUNTER_STORY_SYSTEM,
  },
  timeChangeHandlers: [recoverPlayerPainOutsideEncounter],
  debugActions: {
    "encounter.teleport-player-to-alley": teleportPlayerToAlley,
  },
});
```

This registers three feature surfaces:

1. the `encounter.physical` WG story system;
2. passive player pain recovery when game time changes outside a physical encounter;
3. a debug action that teleports the player to an alley and resolves its automatic scene.

Scenarios are stored in the map in [`src/features/encounter/scenarios/index.js`](../src/features/encounter/scenarios/index.js). A scenario definition currently has this contract:

```js
{
  id: "alley-mugging",
  create({ game, instanceKey, config }) {
    // Return complete, serializable encounter state.
  },
}
```

The alley scenario:

- resolves `config.aggressor` to the temporary actor;
- stores a theft amount equal to the smaller of £20 or the player's current non-negative whole-pound balance;
- deterministically chooses a mugger personality from the game seed and story instance key;
- derives initial commitment from that personality and the actor's resolve;
- creates the canonical state at reach range with both participants standing and facing one another;
- selects and stores the first NPC intent.

## Story-system lifecycle

`PHYSICAL_ENCOUNTER_STORY_SYSTEM` implements three hooks in [`src/features/encounter/system.js`](../src/features/encounter/system.js):

### `create`

1. Validates WG configuration.
2. Looks up the requested scenario.
3. Calls the scenario's `create` function.
4. Validates the serialized state and live combatant invariants.
5. Requires an available player response, an available NPC action, and a legal stored NPC intent.

### `render`

Rendering is pure under normal valid state. It validates the configuration and encounter, builds the active or terminal scene, and exposes every mechanically available player action. It does not reroll intent or combat results.

### `act`

The system accepts two command shapes:

```js
{
  type: "choose-action",
  actionId,
  actorId: "player",
  targetId,
  parameters,
}
```

and, after a terminal outcome:

```js
{ type: "finish" }
```

`choose-action` rechecks the submitted action against the action catalogue before resolution. `finish` is rejected while the encounter remains active and otherwise returns the WG scene's final target.

Combat choices use the general action runner's ordinary energy drain for their full exchange duration. A submitted response resolves before that time cost is applied. If Energy is below one when an encounter screen is built, including on encounter entry, every ordinary response is replaced by the single `too-tired-to-move` choice. That zero-second helpless response and the stored NPC intent resolve in the same exchange, whose total duration remains the NPC action's duration. If the exchange ends combat, the ordinary exhaustion interrupt remains pending until the player leaves the terminal encounter screen.

Encounter exertion remains the short-term measure used by action availability, contests, and AI. When an encounter becomes terminal, an idempotent settlement converts the player's remaining exertion into a post-combat energy-drain multiplier. The multiplier scales linearly from `1×` at zero exertion to `3×` at 100 exertion, then decays linearly to `1×` over 30 in-game minutes. This adds only the multiplier's extra drain during later non-resting time; exertion is not also charged as a lump-sum energy loss.

Hygiene loss is action- and event-specific. Speech and surrender have no inherent hygiene cost. Physical movement, grappling, and strikes have small per-action costs, while direct contact adds further costs: being hit, grabbed, pinned, forced against a wall, or knocked to the ground is dirtier than merely calling for help. The applied amount is recorded as `hygiene.lost` with separate action and event components.

## Canonical encounter state

The current serialized state version is `8`. A newly created state has the following shape:

```js
{
  version: 8,
  scenarioId: "alley-mugging",
  phase: "active",                 // "active" | "terminal"
  elapsedSeconds: 0,
  exchange: 0,

  participants: {
    player: {
      ref: { type: "player" },
      pose: "standing",
      support: "free",
      exertion: 0,
      actionHistory: [],
      acute: [],
    },
    mugger: {
      ref: { type: "scene-actor", alias: "mugger" },
      pose: "standing",
      support: "free",
      exertion: 0,
      commitmentBase: 60,
      personalityId: "opportunist",
      actionHistory: [],
      acute: [],
    },
  },

  relationships: {
    range: [{ a: "player", b: "mugger", value: "reach" }],
    facing: [
      { actor: "player", other: "mugger", value: "toward" },
      { actor: "mugger", other: "player", value: "toward" },
    ],
    holds: [],
  },

  objective: {
    id: "steal-money",
    ownerId: "mugger",
    stage: "gain-control",
    amount: 20,
    hasLoot: false,
    failedControlAttempts: 0,
  },

  npcIntent: {
    actorId: "mugger",
    actionId: "grab-arm",
    parameters: {
      targetId: "player",
      sourcePartId: "hand_l",
      targetPartId: "lower_arm_l",
    },
  },

  screamForHelpRoll: null,
  terminalConsequencesSettled: false,
  lastEvents: [{ type: "encounter.started", actorId: "mugger" }],
  outcome: null,
}
```

The exact initial intent and personality depend on the seed and actor.

### Physical state values

| Dimension | Values | Scope |
|---|---|---|
| Range | `far`, `reach`, `clinch` | One pairwise relationship between player and mugger. |
| Pose | `standing`, `kneeling`, `supine`, `prone` | Stored per participant. |
| Support | `free`, `wall` | Stored per participant. Wall support is valid only while standing. |
| Facing | `toward`, `away`, `side` | One directional relationship per participant. |
| Acute state | `dazed`, `off-balance`, `winded` | Stored per participant with severity and remaining exchanges. |

Creating distance clears the acting participant's wall support. Becoming grounded also clears wall support.

### Authoritative action geometry

Physical access is defined centrally in `ACTION_GEOMETRY` and checked again by each affected action's availability function. Facing `toward` or `side` permits deliberate contact; facing `away` does not. The exceptions are actions whose access comes from an existing tactile relationship, self-directed recovery, or movement away from the opponent.

| Requirement | Actions |
|---|---|
| Actor facing toward/side | `strike-face`, `drive-body`, `strike-holding-arm`, `knee-strike`, `attack-limb`, `shove-away`, `grab-arm`, `close-distance`, `force-to-wall`, `force-to-ground`, `turn-target-away`, `pin-limb`, `search-money` |
| Actor facing strictly toward | `headbutt` |
| Target facing toward/side | `strike-face`, `headbutt`, `attack-limb`, `turn-target-away` |
| Existing-contact or retreat action; actor facing is irrelevant | `wrench-free`, `tighten-hold`, `create-distance`, `stand-up`, `roll-toward`, `controlled-disengage`, `run`, `flee` |
| Actor must be standing | `knee-strike`, `create-distance`, `close-distance`, `run`, `flee`, `controlled-disengage`; also both participants for `force-to-wall` and `force-to-ground` |
| Ground or wall positioning | `stand-up` requires a grounded actor; `roll-toward` requires a grounded or wall-supported actor; `turn-target-away` requires a grounded or wall-supported target; `pin-limb` requires either a standing wall-supported target or a kneeling actor over a grounded target |

Every encounter still assumes that a usable wall is available. `force-to-wall` therefore needs no scenario capability flag; its positional prerequisites are clinch range, both participants standing, and the target not already wall-supported.

### Hold records

A hold is an explicit relationship:

```js
{
  id: "hold-2-mugger-left",
  controllerId: "mugger",
  sourcePartId: "hand_l",
  targetId: "player",
  targetPartId: "lower_arm_l",
  kind: "wrist-grip",              // "wrist-grip" | "limb-pin"
  leverage: 51,                    // stored leverage, 1..100
}
```

Current hold restrictions are:

- wrist grips use `hand_l` or `hand_r` and target `lower_arm_l` or `lower_arm_r`;
- limb pins use a hand or knee and currently target the same wrist/arm parts;
- one source limb cannot maintain two holds;
- one target limb cannot be controlled by two holds;
- all hold IDs must be unique;
- any active hold requires `clinch` range;
- a knee pin requires a kneeling controller and a grounded target;
- a hand pin requires a grounded or wall-supported target.

### Acute records

```js
{
  id: "dazed",
  severity: 2,       // 1..3
  exchanges: 1,      // 1..10 in valid saved state
}
```

Reapplying the same acute effect adds its new severity to the existing severity, capped at 3, and refreshes its duration to the larger duration. Acute durations tick down once after each resolved exchange. Severity 3 daze immediately satisfies an incapacitation condition.

### Terminal state

Terminal state has `phase: "terminal"`, `npcIntent: null`, objective stage `complete`, and:

```js
{
  outcome: {
    id: "player-escaped",
    moneyLost: 0,
  },
}
```

Allowed outcome IDs are:

- `player-rescued`;
- `player-escaped`;
- `mugger-fled`;
- `mugger-incapacitated`;
- `theft-completed-player-conscious`;
- `theft-completed-player-incapacitated`.

## Combatant and body integration

Encounter state does not duplicate either body.

- The player adapter uses `game.player.body` directly.
- The mugger adapter reconstructs a `Body` from the current WG temporary actor's serialized body and writes it back after an exchange.
- Player stats come from `game.player.getSkillValue(name)`.
- Temporary-actor `strength`, `fitness`, `endurance`, and `resolve` each come directly from `actor.stats`.

The four physical combat stats have separate responsibilities:

| Stat | Combat responsibility |
|---|---|
| Strength | Applied force, shoves, hold leverage, and raw impact damage. |
| Fitness | Obtaining or slipping grips, evasion, pursuit, and repositioning. |
| Endurance | Readiness under repeated effort, exertion cost, and recovery. |
| Resolve | Pain tolerance and the chance to complete a desperate overextended action. |

Perception is not part of physical combat resolution for either the player or temporary actors.

### Body-part capacity

Capacity is calculated for a requested body part and its dependency chain. Examples include hand → lower arm → upper arm → shoulder, foot → ankle → calf → knee → thigh, and head → neck.

For every part in the chain:

```text
part capacity = integrity ratio
part capacity *= 0.94 when bruised
part capacity *= max(0.65, 1 - local pain × 0.0035)
chain capacity = minimum capacity in the chain
```

A missing or zero-health part makes the chain capacity zero. A part is considered functional above `0.15` capacity. Body parts support only two condition states: no condition and `bruised`. Existing passive pain recovery restores lost integrity by the same proportion, so even a zero-integrity part recovers instead of permanently disabling the save. The bruise clears once integrity reaches at least 90%.

Usable hands and knees are ordered by current limb capacity, so actions which choose their source automatically use the strongest available limb. When an action has a source part, reduced source-limb capacity lowers both its contest chance and its impact damage.

### Limb capacity under a hold

When a hostile hold controls the same limb:

```text
wrist-grip limb multiplier = max(0.12, 1 - effective leverage / 105)
limb-pin limb multiplier   = max(0.02, 1 - effective leverage / 70)
```

The current usable-hand query is stricter than this multiplier: a hand cannot be selected for ordinary actions while any hostile hold controls its arm. A hand maintaining a hold is likewise committed and unavailable.

### Balance and movement

Each leg's movement capacity is the minimum capacity of its thigh, knee, and foot chains. Overall movement capacity is the better of the two legs. Movement requires standing pose and capacity above `0.20`.

Balance is calculated as:

```text
balance = better foot capacity × 0.70 + worse foot capacity × 0.30
```

It is then multiplied by:

- `0.72` while kneeling;
- `0.35` while supine or prone;
- `max(0.25, 1 - offBalanceSeverity × 0.20 - dazeSeverity × 0.12)`.

### Pain and physical performance

The shared body model calculates visible whole-body pain as the worst local pain plus 30% of every other local pain, capped to `0..100`.

```text
physical performance = clamp(1 - whole-body pain × 0.005, 0.5, 1)
```

Outside an open `encounter.physical` scene, elapsed game time relieves player pain at `1.5` visible pain per minute. Combat exchange time does not apply this recovery. Passive recovery changes pain only, not integrity or injury conditions.

### Encounter incapacitation

A participant is incapacitated when any implemented condition below is true:

- daze severity is 3;
- head capacity is at most `0.08`;
- chest capacity is at most `0.06`;
- both best-arm and best-leg capacity are at most `0.15`, even if the actor remains conscious;
- pain reaches `min(95, 78 + resolve × 1.9)`, which is handled as player helplessness rather than immediate defeat when it is the player's only incapacitating condition;
- while grounded with pain at least 62, both best-leg and best-arm capacity are below `0.25`;
- winded severity is 3 and pain is at least 68.

If the mugger is incapacitated, their holds are removed and the encounter ends. Hard player incapacitation from daze, critical capacity, disabled gross movement, or the combined grounded/winded conditions still follows the objective's immediate unable-target outcome. Pain at the player's tolerance limit instead leaves the encounter active with only `writhe-in-pain`; Energy below one similarly leaves only `too-tired-to-move`. In either helpless state the NPC must resolve its stored intent, with its contest against the helpless target treated as unopposed, and the objective completes only when that action and the resulting state justify it. Resolution also checks the generated catalogue after each action: if a participant has no legal action despite not matching a capacity threshold, that loss of agency follows the same terminal path instead of leaving an invalid active state.

## Common action mechanics

### Calling for help

`scream-for-help` is a two-second, player-only escape action. A successful roll ends the encounter with `player-rescued`; a failed roll consumes the exchange and combat remains active. The first attempt stores its random number in encounter state. Further attempts made before 45 in-game seconds have elapsed reuse that number; the first attempt at or after the deadline generates a new number and starts another 45-second interval. The stored roll and timer survive save/load. Its hearing chances are:

| Conditions | Day | Night |
|---|---:|---:|
| Clear, cloudy, windy, or sunny | 40% | 20% |
| Rain or snow | 25% | 12.5% |
| Storm | 15% | 7.5% |

The action records the daylight period, weather, whether the number was reused, and the next reroll time on its deterministic `chance.rolled` event. Encounter authors can map `player-rescued` to a specific scene through `config.outcomes`; the alley mugging routes it to a scene that creates a random temporary civilian rescuer.

### Action-definition contract

Actions are JavaScript data/function definitions registered in `ENCOUNTER_ACTIONS` in [`src/features/encounter/actions/index.js`](../src/features/encounter/actions/index.js):

```js
export const EXAMPLE_ACTION = Object.freeze({
  id: "example-action",
  tags: Object.freeze(["movement"]),
  durationSeconds: 2,
  usableBy: Object.freeze(["player", "mugger"]),
  playerOrder: 50,

  enumerateTargets(context, actorId) {
    return [actionInstance(this.id, actorId, targetId, parameters)];
  },

  isAvailable(context, instance) {
    return true;
  },

  label(context, instance) {
    return "Player-facing choice label";
  },

  intentLabel(context, instance) {
    return "telegraphed NPC intent text";
  },

  resolve(context, instance, runtime) {
    // Mutate encounter state/body and emit structured events.
  },
});
```

`enumerateTargets` creates concrete action instances. An instance contains `actionId`, `actorId`, `targetId`, and serializable `parameters`. Availability is re-derived from canonical state; functions are never saved.

`usableBy` currently contains the literal internal IDs `player` and/or `mugger`. `playerOrder` determines display order only. AI scoring uses tags and a separate utility profile.

### Contests

Most contested actions calculate success chance as:

```text
chance = base chance
       + optional (actor stat - target stat) × 0.035
       + action modifier
       + (source limb capacity - 1) × 0.32, when the action has a source limb
       + (actor body performance - 1) × 0.40
       + (actor balance - target balance) × 0.18
       - actor exertion × 0.0025
       + target exertion × 0.0015
       - 0.14 if actor is dazed
       + 0.12 if target is dazed
       - 0.18 if target is guarding against an impact
       + 0.06 if target is guarding against control
       - the target's Fitness-scaled evasion when evading
```

The final chance is clamped to `0.18..0.90`. A contest has no stat term unless the action declares one. Ordinary strike accuracy is therefore not improved by Strength; Strength still increases the resulting damage. Force actions use Strength, while grip access, pursuit, evasion, and repositioning use Fitness. Slipping a grip compares the restrained actor's Fitness against the controller's Strength.

### Damage

Current encounter impacts use blunt damage:

```text
source multiplier = 0.45 + source limb capacity × 0.55
damage = round((base damage + actor strength × strength scale) × source multiplier)
```

Actions without a source limb use a source multiplier of `1`. Guarding multiplies received damage by `0.62`, with a minimum of 1. The body model then reduces part health, updates injury conditions, and adds local pain using that part's pain multiplier.

### Exertion

```text
strain = 1 + exertion / 180 + winded × 0.16 + dazed × 0.10 + pain / 250
exertion gained = max(1, round(base action effort × strain - endurance × 0.45))
readiness = 100 - exertion + endurance × 3
          - max(0, pain - resolve × 1.5) × 0.18
          - winded × 10 - dazed × 8
recovery = max(6, round(8 + endurance × 2.4))
```

Participant exertion is capped at 100. It affects contests and effective hold leverage and contributes to mugger commitment. Fitness does not reduce exertion or improve recovery. When an NPC attempts an action despite failing its effort profile, its desperate-effort chance is `0.13 + resolve × 0.01 - readiness deficit × 0.008 - excess acute severity × 0.06`, clamped to `0.02..0.23`.

### Deterministic randomness

Combat rolls are keyed by game seed, WG instance key, exchange number, actor ID, action ID, and roll purpose. Re-rendering and save/load therefore do not reroll an exchange. Chance events retain the calculated chance, roll, purpose, and result for debugging.

## Implemented action catalogue

The order below groups actions by purpose. `P` means player, `M` means mugger.

### Defense

#### `cover-and-brace`

| Property | Value |
|---|---|
| Users | P, M |
| Duration | 1 second |
| Effort | 2 |
| Availability | Active encounter and actor not incapacitated. |

Marks the actor as guarding for the exchange, reducing incoming contest chance by `0.24` and incoming damage to 55%. Emits `defense.braced`.

### Strikes

#### `strike-face`

| Property | Value |
|---|---|
| Users | P, M |
| Duration | 2 seconds |
| Effort | 7 |
| Availability | A usable free hand, not at far range, attacker facing toward/side, and target facing toward/side. |

Uses a `0.57` base contest. On success it deals `10 + strength × 0.70` damage to the face. Daze chance is `min(0.68, 0.24 + damage × 0.025)`; severity is 2 at damage 16 or more, otherwise 1. A disabled holding limb automatically releases its holds.

#### `drive-body`

| Property | Value |
|---|---|
| Users | P, M |
| Duration | 2 seconds |
| Effort | 7 |
| Availability | A usable free hand, not at far range, and attacker facing toward/side. |

Uses a `0.64` base contest. On success it deals `12 + strength × 0.75` damage to the abdomen.

#### `strike-holding-arm`

| Property | Value |
|---|---|
| Users | P, M |
| Duration | 2 seconds |
| Effort | 6 |
| Availability | A hostile hold, actor facing toward/side, and either a usable hand or, while standing with balance above 0.40, a usable knee. |

Generates one concrete choice for each hostile hold. It uses a `0.67` base contest and deals `8 + strength × 0.65` damage to the hold's source part. Stored leverage is reduced by `round(20 + strength × 1.5)`. The hold breaks when leverage reaches zero, the impact deals at least 14 damage, or the source limb becomes nonfunctional.

#### `headbutt`

| Property | Value |
|---|---|
| Users | P, M |
| Duration | 1 second |
| Effort | 7 |
| Availability | Clinch range; actor not supine/prone; head capacity above 0.30; actor facing target; target facing toward/side. |

Uses a `0.58` base contest. A miss has an 18% self-daze chance. A hit:

- deals `8 + strength × 0.45` damage to the target's face;
- deals `4 + strength × 0.10` damage to the actor's head;
- has target-daze chance `min(0.62, 0.28 + damage × 0.02)`, severity 2 at damage 13 or more;
- has a separate 12% self-daze chance;
- releases holds whose source limb becomes nonfunctional.

#### `knee-strike`

| Property | Value |
|---|---|
| Users | P, M |
| Duration | 2 seconds |
| Effort | 9 |
| Availability | Clinch range; actor standing and facing toward/side; target not prone; usable knee; opposite planted leg capacity above 0.32; balance above 0.40. |

Uses a `0.61` base contest. A miss has a 38% chance to apply severity-1 off-balance for two exchanges. A hit deals `10 + strength × 0.60` damage to the abdomen, applies winded for two exchanges (severity 2 at damage 15 or more), and has a 16% chance to apply severity-1 off-balance to the attacker for one exchange.

### Movement and escape

#### `shove-away`

| Property | Value |
|---|---|
| Users | P, M |
| Duration | 2 seconds |
| Effort | 9 |
| Availability | A usable free hand, reach or clinch range, and actor facing toward/side. |

Uses a Strength-versus-Strength contest with base `0.61`. On success, hostile holds below 48 effective leverage break; stronger holds lose 20 stored leverage. If no hostile hold remains, the actor releases their own holds and range opens by one step.

#### `create-distance`

| Property | Value |
|---|---|
| Users | P, M |
| Duration | 3 seconds |
| Effort | 5 |
| Availability | Standing movement capacity above 0.20, range other than far, and no movement-denying hold. |

The action releases all holds controlled by or targeting the actor, clears the actor's wall support, and opens range by one step. It counts as evasion only against an equal-speed or slower opposing action; a faster attack resolves before its evasion modifier begins.

A movement-denying hold is any limb pin with at least 28 effective leverage or hostile holds with combined effective leverage of at least 52.

#### `stand-up`

| Property | Value |
|---|---|
| Users | P, M |
| Duration | 3 seconds |
| Effort | 10 |
| Availability | Grounded; no limb pin at 32 or more effective leverage; movement capacity at least 0.22; and either best-arm capacity at least 0.20 or balance at least 0.28. |

With hostile holds, it uses a fitness-versus-strength contest with base `0.61` and modifier `-0.0015 × combined effective leverage`. On success, knee pins maintained by the rising actor are released, their pose becomes standing, and they face the opponent.

#### `roll-toward`

| Property | Value |
|---|---|
| Users | P, M |
| Duration | 2 seconds |
| Effort | 7 |
| Availability | Grounded or wall-supported and not already facing toward, except that a prone actor may always attempt it. |

Against a hostile hold, it uses a fitness-versus-strength contest with base `0.64` and modifier `-0.002 × strongest effective leverage`. Failure weakens that hold by 8. Success turns the actor toward the opponent, changes prone to supine, weakens wrist grips by 8 and pins by 14, and breaks any hold reduced to zero.

#### `close-distance`

| Property | Value |
|---|---|
| Users | M only |
| Duration | 2 seconds |
| Effort | 6 |
| Availability | Far range, actor facing toward/side, and sufficient standing movement capacity. |

Uses a Fitness-versus-Fitness contest with base `0.68`. Success changes far range to reach. Failure increments the mugger's failed-control count.

#### `run`

| Property | Value |
|---|---|
| Users | P only |
| Duration | 4 seconds |
| Effort | 10 |
| Availability | Far range, sufficient standing movement capacity, and no movement-denying hold. |

Proposes the terminal `player-escaped` outcome. A faster successful intercept can invalidate it before it resolves.

#### `flee`

| Property | Value |
|---|---|
| Users | M only |
| Duration | 3 seconds |
| Effort | 7 |
| Availability | Reach or far range and sufficient standing movement capacity. |

Proposes the terminal `mugger-fled` outcome.

### Holds, position, and theft

#### `grab-arm`

| Property | Value |
|---|---|
| Users | P, M |
| Duration | 2 seconds |
| Effort | 7 |
| Availability | Reach or clinch range, actor facing toward/side, strongest usable hand, and at least one functional uncontrolled target arm. The target may be facing away. |

One concrete action instance is generated for each uncontrolled target arm. Uses a Fitness-versus-Fitness contest with base `0.60`. Success creates a wrist grip, changes range to clinch, and sets stored leverage to:

```text
clamp(round(36 + actor strength × 3 - target strength), 22, 68)
```

A failed mugger grab increments failed-control attempts.

#### `wrench-free`

| Property | Value |
|---|---|
| Users | P, M |
| Duration | 3 seconds |
| Effort | `9 + 3 × number of targeted holds` |
| Availability | Clinch range and at least one hostile hold on a restrained limb whose unrestrained part capacity remains above `0.15`. Facing is irrelevant because the actor can feel the established hold. |

One action instance targets every hostile hold. Each hold is rolled separately:

```text
chance = 0.58
       + (actor fitness - controller strength) × 0.035
       + (restrained limb capacity - 1) × 0.28
       - effective leverage × 0.004
       - 0.12 for a limb pin
       - 0.08 for each additional simultaneously targeted hold
chance = clamp(chance, 0.16, 0.84)
```

Success breaks that hold. On failure, the leverage reduction is scaled by the restrained limb's capacity; reaching zero still breaks it. Partial success is possible with multiple holds. Holds on nonfunctional restrained limbs are not included in the generated wrench action.

#### `tighten-hold`

| Property | Value |
|---|---|
| Users | P, M |
| Duration | 2 seconds |
| Effort | 6 |
| Availability | Clinch range and any hold controlled by the actor with stored leverage below 100. Facing is irrelevant because the hold is already established. |

Generates one instance per controlled hold. It is uncontested and increases stored leverage by `round(14 + strength × 0.5)`, capped at 100.

#### `force-to-wall`

| Property | Value |
|---|---|
| Users | P, M |
| Duration | 3 seconds |
| Effort | 10 |
| Availability | Clinch; actor facing toward/side; both standing; target support free; selected hold has at least 42 effective leverage. A usable wall is assumed to exist in every encounter. |

Uses a Strength-versus-Strength contest with base `0.50` plus `effective leverage × 0.003`. Success changes target support to wall and adds 8 stored leverage. A failed mugger attempt increments failed-control attempts.

#### `force-to-ground`

| Property | Value |
|---|---|
| Users | P, M |
| Duration | 3 seconds |
| Effort | 12 |
| Availability | Strongest eligible hold has at least 34 effective leverage; clinch; actor facing toward/side; both standing; actor balance above 0.35. |

Uses a Strength-versus-Strength contest with base `0.48` plus `effective leverage × 0.003`. Success makes the target supine, the actor kneeling, both facing toward, and adds 6 leverage. A failed mugger attempt increments failed-control attempts.

#### `turn-target-away`

| Property | Value |
|---|---|
| Users | P, M |
| Duration | 2 seconds |
| Effort | 7 |
| Availability | Strongest eligible hold has at least 28 effective leverage; clinch; actor and target facing toward/side; target wall-supported or grounded. |

Uses a Fitness-versus-Fitness contest with base `0.56` plus `effective leverage × 0.002`. Success turns the target away, changes a grounded target to prone, and adds 5 leverage.

#### `pin-limb`

| Property | Value |
|---|---|
| Users | P, M |
| Duration | 2 seconds |
| Effort | 8 |
| Availability | Actor facing toward/side and controlling a non-pin hold in clinch. A standing wall-supported target keeps the holding hand as the pin source; a grounded target requires a kneeling actor and usable knee. |

Uses a Strength-versus-Strength contest with base `0.62` plus `effective leverage × 0.002`. Success converts the wrist grip to `limb-pin`, replaces the source part when using a knee, and adds 15 leverage.

#### `search-money`

| Property | Value |
|---|---|
| Users | M only |
| Duration | 4 seconds |
| Effort | 6 |
| Availability | Clinch range, actor facing toward/side, a usable free hand, and usable control over the player. |

Usable control requires clinch range, at least one hold, a constrained target, and either:

- a limb pin with at least 38 effective leverage; or
- at least 72 combined effective leverage, with each hold contributing at most 70.

The target is constrained when wall-supported, grounded, or dazed. On resolution, the action deducts the smaller of the stored theft amount and the player's current whole-pound balance. Positive theft ends with `theft-completed-player-conscious`; finding nothing ends with `mugger-fled`.

Although `disengage` and `hasLoot` exist in the state and AI, successful `search-money` currently ends the encounter immediately, so there is no active post-theft disengagement exchange.

## Hold effectiveness

Stored leverage is modified at query time:

```text
effective leverage = stored leverage
                   × source-part capacity
                   × controller balance
                   × daze multiplier
                   × exertion multiplier
                   × position multiplier
```

Where:

- daze multiplier is `0.70` while dazed, otherwise `1`;
- exertion multiplier is `max(0.55, 1 - exertion × 0.0045)`;
- ordinary wrist-grip position multiplier is `1`;
- a limb pin uses `1.08` against a wall-supported target or `1.18` against a grounded target;
- an away-facing pinned target adds another `0.08` to the pin's position multiplier.

Damage to any part in the source limb's dependency chain can therefore weaken or disable the hold without changing its stored leverage.

## Exchange timing and resolution

Each active screen shows the stored NPC intent and its action duration before the player chooses one response.

Resolution proceeds as follows:

1. Validate the state, bodies, available responses, and stored intent.
2. Re-resolve the player's submitted action to a canonical available instance.
3. Calculate both action durations.
4. If the player's response is a helpless action, record it, resolve the stored NPC intent unopposed against the player, release any holds the player can no longer maintain, and continue at step 9.
5. Activate guard or evasion at the start only when that reaction is no slower than the opposing action.
6. If durations differ, resolve the faster action first.
7. Check incapacitation and terminal outcomes.
8. Revalidate the slower action. If its requirements were invalidated, emit `action.spoiled`; otherwise resolve it. If durations are equal, resolve the player action and then the NPC action without revalidating either between them. Both were legal in the pre-exchange state, but the current implementation does not clone a separate calculation snapshot for each action.
9. Tick acute effects once.
10. Add the longer of the two durations to encounter time and advance the exchange counter once.
11. Check terminal state, retain the last 24 events, and persist bodies.
12. If still active, synchronize the theft stage and select/store the next NPC intent.
13. Validate the resulting runtime state.

The general game clock advances by the same longer duration through the choice contract. A player action that takes one second against a three-second NPC action is labelled as acting in one second, while the choice timer represents the complete three-second exchange.

### Terminal precedence

For unequal speeds, a terminal result from the faster action prevents the slower action. For equal speeds, both actions resolve and the first proposed explicit outcome is retained. Physical terminal checking tests mugger incapacitation before player incapacitation.

## Theft objective

The objective stage is synchronized from current facts:

- `gain-control` when the mugger lacks usable control;
- `access-money` when usable control exists;
- `disengage` when `hasLoot` is true;
- `complete` for every terminal outcome.

Current conscious theft completes and terminates in the same action, so `disengage` is not normally observed in active play.

If the player becomes hard-incapacitated, theft resolves immediately without requiring `search-money`. Pain-only or Energy helplessness does not use that shortcut: the mugger must gain control, search, and escape through actual selected intents. Any deducted amount remains capped by the stored amount and current balance.

Money consequences are applied once during resolution and stored in the terminal outcome. Rendering and finishing a terminal scene do not apply them again.

## NPC decision system

The NPC uses the same generated availability catalogue as the player, filtered by each action's `usableBy` field.

### Personality selection

Personality is deterministically selected from seed and story instance key:

| Personality | Probability | Bias | Time sensitivity | Pain sensitivity | Exertion sensitivity |
|---|---:|---:|---:|---:|---:|
| Opportunist | 35% | 0 | 0.85 | 0.80 | 0.35 |
| Desperate | 20% | +14 | 0.45 | 0.25 | 0.15 |
| Forceful | 25% | +8 | 0.85 | 0.70 | 0.30 |
| Skittish | 20% | -10 | 1.10 | 1.05 | 0.45 |

The opportunist occupies both the first 20% and final 15% of the selection range.

Each personality also weights the utility motives `objective`, `control`, `pressure`, `safety`, `escape`, `speed`, and `novelty`. Forceful emphasizes control and pressure; skittish emphasizes safety and escape; desperate strongly emphasizes pressure and discounts risk; opportunist emphasizes objective progress.

### Initial commitment

```text
commitment base = min(75, 50 + personality bias + round(actor resolve × 3))
```

### Current commitment

```text
commitment = clamp(
    base
  + reward
  - elapsed seconds × personality time sensitivity
  - pain × personality pain sensitivity
  - exertion × personality exertion sensitivity
  - failed control attempts × 3
  - impairment,
  0,
  100
)
```

Reward is half the stored theft amount up to +10, or `-45` when there is nothing to steal. Impairment is based on the better of best-hand capacity and movement capacity, with a maximum 22-point penalty.

Visible commitment bands are:

| Value | Text |
|---:|---|
| `0..22` | ready to run |
| `23..39` | hesitating |
| `40..64` | frustrated but committed |
| `65..100` | confident |

### Utility selection

At commitment 22 or below, the candidate pool is restricted when possible to retreat-supporting actions: flee, run, create distance, shove, stand, wrench free, strike a holding arm, and brace. Above that threshold, `flee` and `run` are excluded from the normal pool.

Every candidate receives:

- its action-specific base and motive profile;
- situation bonuses for current objective stage, holds, failed control, pain, safety, and position;
- a duration penalty of `1.5 × seconds × personality speed weight`;
- an exertion-sensitive risk penalty;
- a repetition penalty weighted by personality novelty;
- deterministic seeded variation from `-2.5` to `+2.5`;
- an additional escape priority while retreating.

The immediate repeated action penalty begins at 12, plus 1.5 for every occurrence of that action in the retained history, then receives the novelty weight. Each participant retains at most eight action IDs.

Candidates are sorted by total score, with a stable action-instance key as the tie-breaker. The highest-scoring candidate is stored as `npcIntent`; exact scores and components are available through debugging but are not shown to players.

## Player-facing presentation

An active encounter renders:

- threat and maximum theft amount;
- elapsed encounter clock;
- exact telegraphed NPC action and duration;
- a situation table for position and condition;
- current theft pressure and qualitative commitment;
- prose generated from the last exchange's structured events;
- every mechanically available player action.

Position summaries include pose, wall relationship, facing, held or pinned arms, holds controlled by the participant, and current range.

Condition summaries include:

- qualitative whole-body pain;
- qualitative exertion;
- up to two most significant bruised body parts, prioritized by integrity and pain;
- dazed, winded, and off-balance states;
- qualitative hold security for a participant maintaining holds.

Action labels describe attempts rather than guaranteed outcomes where appropriate. When several instances share an action ID, rendered choice IDs receive numeric suffixes while their commands retain distinct parameters.

Terminal presentation shows the outcome, final situation, last exchange, and a single `Continue` choice.

## Structured event output

Resolution emits structured events before prose is assembled. Currently emitted event types include:

| Event | Meaning |
|---|---|
| `encounter.started` | Initial confrontation. |
| `action.attempted` | An action began resolution. |
| `chance.rolled` | Deterministic roll with chance, value, purpose, and success. Hidden from normal prose. |
| `action.failed` | A resolved action failed its own roll or requirement. |
| `action.spoiled` | A slower action became unavailable before completion. |
| `defense.braced` | Guard was established. |
| `impact.landed` | Body-part damage was applied. |
| `acute.applied` | Daze, winded, or off-balance was applied or accumulated. |
| `hold.created` | A wrist grip was created. |
| `hold.weakened` | Stored hold leverage fell. |
| `hold.strengthened` | Stored hold leverage rose. |
| `hold.broken` | A wrist grip or pin ended. |
| `hold.pinned` | A grip became a limb pin. |
| `range.changed` | Pairwise range changed. |
| `pose.changed` | A participant changed pose. |
| `support.changed` | A participant entered or left wall support. |
| `facing.changed` | A participant changed facing. |
| `theft.completed` | Money was deducted. |
| `theft.empty` | No money was available. |
| `escape.completed` | Player escape or mugger retreat resolved. |
| `encounter.ended` | Terminal state and outcome were finalized. |

Only the most recent 24 events are saved in `lastEvents`. The prose renderer ignores diagnostic roll events and turns the remaining events into the last-exchange paragraph.

## Validation and persistence

Serialized encounter validation uses exact-key schemas. Unknown or missing state keys are rejected. It checks:

- state version, scenario, phase, counters, objective, intent, events, and outcome;
- exact player and mugger participant shapes;
- allowed physical values and acute-effect bounds;
- the single range relation and both facing directions;
- hold structure, IDs, source-limb uniqueness, target-limb uniqueness, and clinch requirement;
- terminal/active consistency.

Live runtime validation additionally checks:

- hold source and target body parts exist;
- every hold source limb remains functional;
- pin geometry is valid;
- active participants are not already hard-incapacitated; the controlled participant may remain active at maximum pain with only the helpless response;
- an active player has at least one legal response;
- an active mugger has at least one legal action;
- stored NPC intent exactly matches a currently available action instance.

Save/load preserves encounter state, WG temporary-actor body state, player body state, NPC intent, available actions, last-exchange prose, and deterministic future resolution.

## Debugging and simulation

### In-browser debug action

The feature exposes `encounter.teleport-player-to-alley`. It finds a generated place with key `alleyway`, moves the player there, and resolves the `enter-place` automatic scene trigger.

### Debug snapshot

`getEncounterDebugSnapshot(game)` returns data only while an `encounter.physical` system is open:

```js
{
  state,
  decision: {
    personality,
    commitment,
    candidates,
    selected,
  },
  availability: {
    player,
    mugger,
  },
  rolls,
  invariants,
}
```

Availability diagnostics contain action instances and a generic explanation when an action is unavailable. Decision candidates contain total utility and a component breakdown. Invariant diagnostics cover schema, body relations, player affordances, NPC affordances, and stored intent legality.

### Simulation harness

[`tools/encounter/simulationHarness.mjs`](../tools/encounter/simulationHarness.mjs) exports:

- `runEncounterSimulation(options)` for one deterministic encounter;
- `runStatDifferenceMatrix(options)` for batches across stat differences;
- `runEncounterStateSpaceMatrix(options)` for batches across valid high-pressure starting states;
- scripted player policies named `escape`, `fight`, `resist`, `brace`, `control`, and `surrender`.

The named starting scenarios are `baseline`, `player-wall-pinned`, `player-grounded-injured`, `mutual-grips`, and `player-complete-control`. They exercise wall and ground support, wrist grips and pins, existing injuries, high exertion, acute effects, already-stolen money, and the complete-control objective actions without constructing invalid encounter states.

Simulation results include outcome, exchange count, elapsed seconds, both pain totals, money lost, separate player and NPC action counts, player/NPC action histories, diagnostic rolls, and invariant failures. Coverage data records visited range, pose, support, objective, hold, acute, injury, exertion, meaningful-choice, and availability-reason state. Terminal states receive a final invariant check as well as the checks performed before every exchange.

The harness currently chooses from the full mechanical availability list. The combat screen also exposes the full list, so simulated policies are not selecting hidden actions.

The command-line runner accepts `--scenario <id>`. Use `--scenario all` to run the state-space matrix; omit it to retain the stat-difference matrix for the baseline scenario.

### Test command

Run the encounter-specific suite from the repository root:

```powershell
node --test tests/encounter_*.test.mjs
```

The encounter tests cover contextual action generation, AI decisions and personalities, theft outcomes, debugging, pain recovery, pronouns, timing and interruption, holds and pins, injury persistence and display, acute accumulation, save/load determinism, seeded simulation, state schema, and body/relationship invariants.

## Source map

| Area | Source |
|---|---|
| Feature registration | [`src/features/encounter/index.js`](../src/features/encounter/index.js) |
| WG system adapter and screen choices | [`src/features/encounter/system.js`](../src/features/encounter/system.js) |
| State schema and validation | [`src/features/encounter/state.js`](../src/features/encounter/state.js) |
| Combatant/body adapters | [`src/features/encounter/combatants.js`](../src/features/encounter/combatants.js) |
| Derived physical affordances | [`src/features/encounter/affordances.js`](../src/features/encounter/affordances.js) |
| Action enumeration and diagnostics | [`src/features/encounter/availability.js`](../src/features/encounter/availability.js) |
| Exchange resolution | [`src/features/encounter/resolution.js`](../src/features/encounter/resolution.js) |
| NPC scoring and intent | [`src/features/encounter/ai.js`](../src/features/encounter/ai.js) |
| Mugger personalities | [`src/features/encounter/personality.js`](../src/features/encounter/personality.js) |
| Prose and situation summaries | [`src/features/encounter/prose.js`](../src/features/encounter/prose.js) |
| Pronoun helpers | [`src/features/encounter/language.js`](../src/features/encounter/language.js) |
| Passive pain recovery | [`src/features/encounter/pain.js`](../src/features/encounter/pain.js) |
| Debug actions and snapshots | [`src/features/encounter/debug.js`](../src/features/encounter/debug.js) |
| Action catalogue | [`src/features/encounter/actions/`](../src/features/encounter/actions/) |
| Scenario registry | [`src/features/encounter/scenarios/`](../src/features/encounter/scenarios/) |
| Authored alley encounter | [`story/encounters/alley.wg`](../story/encounters/alley.wg) |
| Simulation harness | [`tools/encounter/simulationHarness.mjs`](../tools/encounter/simulationHarness.mjs) |
| Encounter tests | [`tests/`](../tests/) files beginning with `encounter_` |
