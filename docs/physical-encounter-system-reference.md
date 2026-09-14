# Physical Encounter System Reference

This is the maintainer and story-author reference for the physical encounter system as it exists now. It describes implemented behavior only. Values in this document are gameplay tuning unless explicitly described as a validation limit.

## Implemented system at a glance

The registered WG system is `encounter.physical`. Its only scenario is `fight`, a deterministic fight between exactly two participants:

- one human-controlled player;
- one temporary scene actor controlled by the shared hostile AI;
- one attacker-owned objective, currently `steal-money` or `beat-down`;
- one stored, player-visible NPC intent and one player response per exchange;
- second-based action timing, simultaneous actions, interruption, range, pose, facing, wall support, wrist grips, limb pins, blunt damage, pain, exertion, and short acute effects;
- player Combat ranks that progressively reveal technical actions;
- terminal outcomes routed back into ordinary WG scenes;
- persistent body state, deterministic rolls, strict save validation, a browser combat lab, and simulation tests.

Body-part conditions are deliberately limited to no condition or `bruised`. The combat system has no broken-limb or wound state.

## Runtime architecture

The main flow is:

```text
WG @system declaration
  -> encounter.physical adapter
  -> fight scenario creates canonical state
  -> objective creates objective-specific state
  -> AI selects and stores an intent
  -> renderer shows that intent and legal player responses
  -> resolver processes one exchange
  -> objective decides whether the result is terminal
  -> scenario routes the terminal outcome back to WG
```

The important ownership boundaries are:

| Concern | Owner |
|---|---|
| WG configuration and outcome routes | `scenarios/fight.js` |
| Exact serialized shape and structural invariants | `state.js` |
| Player/NPC body and stat adapters | `combatants.js` |
| Geometry and derived movement/control rules | `affordances.js` |
| Concrete action enumeration and player rank filtering | `availability.js` |
| Action effects | `actions/` |
| Exchange order, interruption, simultaneous merge, terminal checks | `resolution.js` |
| Objective stages, objective AI bonuses, money/defeat outcomes | `objectives/` |
| Shared AI commitment and utility scoring | `ai.js` and `personality.js` |
| Screen content and event prose | `system.js` and `prose.js` |
| Aftermath, Combat loss, and hygiene | `consequences.js` |

## Declaring a fight in WG

Physical encounters are runtime story systems; there is no `@combat` directive. The current authored example is:

```wg
:: encounter.alley-mugging -> @exit
  @actor mugger civilian

  @system encounter.physical {"scenario":"fight","opponent":{"id":"mugger","actor":"mugger"},"goal":{"id":"steal-money","maxAmount":20},"outcomes":{"player-rescued":"encounter.alley-mugging-rescue"}}
```

### Fight configuration

| Field | Required | Meaning |
|---|---:|---|
| `scenario` | yes | Must currently be `"fight"`. |
| `opponent.id` | yes | Encounter participant ID. It must be non-empty and cannot be `player`. |
| `opponent.actor` | yes | Alias of an `@actor` available in `game.currentStory.actors`. |
| `goal` | yes | Objective configuration. Its `id` selects the objective module. |
| `outcomes` | no | Outcome-ID-to-route map, with optional `default`. |

An outcome route may be a target string or an object:

```json
{
  "target": "some.scene",
  "effects": [],
  "paragraphs": ["Optional transition prose."],
  "leavePlace": false
}
```

`target` may point at an authored aftermath scene. `effects` and `paragraphs` are optional. `leavePlace` is also optional and overrides the objective's normal post-combat location behavior for that route.

By default, `player-escaped`, `mugger-incapacitated`, and `attacker-incapacitated` leave the current place if the fight began inside one. The location itself does not change. Other outcomes keep the player in the current place, including attacker success, rescue, attacker retreat, and mutual incapacitation. Leaving is a no-op when the player is already outside. If no outcome-specific or default route matches, `finish` uses the encounter scene's normal final target.

When a leaving outcome targets an aftermath scene, the place transition happens before that scene begins. Without an aftermath target, normal `leave-place` automatic scenes remain eligible after combat.

### Current objective configurations

```json
{ "id": "steal-money", "maxAmount": 20 }
```

`maxAmount` must be a non-negative safe integer. At entry, the stored target amount is the smaller of `maxAmount` and the player's current non-negative whole-pound balance. Changing `maxAmount` changes both the maximum loss and the theft reward used by NPC commitment, up to the commitment reward cap described below.

```json
{ "id": "beat-down" }
```

`beat-down` accepts no additional fields. Its pain threshold is calculated from the player's Resolve when the fight begins.

## Story-system lifecycle

### Create

Creation validates configuration, creates the fight and objective state, deterministically selects an AI personality, calculates initial commitment, and stores the first NPC intent.

If the player is already hard-incapacitated on entry, the objective's unopposed-entry resolution runs immediately. Low Energy does not use that shortcut: an active screen is created with only `You're too tired to move`. Pain-only overwhelm likewise creates an active screen with only `Writhe in pain`. This preserves the telegraphed NPC action.

### Render

Rendering validates but does not mutate state or reroll anything. An active screen shows:

- the objective threat and elapsed time;
- the stored NPC intent and its duration;
- position, conditions, current objective pressure, and qualitative commitment;
- prose derived from the latest structured events;
- legal player choices grouped as Unable to act, Escape, Break control, Defend, Attack, or Control.

A terminal screen shows the outcome, final situation, final exchange, and `Continue`.

### Act

`choose-action` re-derives the submitted concrete action instance from canonical state, resolves one exchange, applies hygiene and Combat learning, persists both bodies, commits objective effects, and stores the next intent if combat remains active.

`finish` is accepted only in terminal state. Terminal consequences are settled before that screen is shown, exactly once.

The general action runner advances the game clock by the full exchange duration and performs ordinary Energy drain. The duration of an exchange is the slower of the two actions, not the duration of the player's response alone.

## Canonical state

The exact serialized version is `8`. A representative theft fight is:

```js
{
  version: 8,
  scenarioId: "fight",
  phase: "active",                  // "active" | "terminal"
  elapsedSeconds: 0,
  exchange: 0,

  participants: {
    player: {
      ref: { type: "player" },
      controller: { type: "human" },
      pose: "standing",
      support: "free",
      exertion: 0,
      actionHistory: [],
      acute: [],
    },
    mugger: {
      ref: { type: "scene-actor", alias: "mugger" },
      controller: {
        type: "ai",
        policyId: "hostile",
        commitmentBase: 60,
        personalityId: "opportunist",
      },
      pose: "standing",
      support: "free",
      exertion: 0,
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
    targetId: "player",
    stage: "gain-control",
    amount: 20,
    searched: false,
    lootAmount: 0,
    failedControlAttempts: 0,
    lastProgressSecond: 0,
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
  lastEvents: [{ type: "encounter.started", actorId: "mugger", targetId: "player" }],
  outcome: null,
}
```

### Allowed physical values

| Dimension | Values and limits |
|---|---|
| Participants | Exactly two, exactly one player reference. |
| Range | `far`, `reach`, `clinch`; exactly one pair relationship. |
| Pose | `standing`, `kneeling`, `supine`, `prone`. |
| Support | `free`, `wall`; wall support is valid only while standing. |
| Facing | `toward`, `away`, `side`; exactly one record per participant. |
| Holds | `wrist-grip` or `limb-pin`; maximum eight. |
| Stored hold leverage | Integer `1..100`. |
| Acute effects | `dazed`, `off-balance`, `winded`; severity `1..3`, remaining exchanges `1..10`. |
| Action history | At most eight action IDs per participant. |
| Recent events | At most 24. |
| Exertion | Integer `0..100`. |

Only hands may maintain wrist grips. Hands or knees may maintain pins. Every source limb and every controlled target limb may occur in at most one hold. Any active hold forces clinch range. Mutually restraining the exact source limbs of two reciprocal holds is invalid.

Validation uses exact keys. Adding a serialized field therefore also requires updating the relevant validator; undocumented extra data is rejected instead of silently retained.

## Combat priorities and exchange order

These priorities determine which facts win when two actions interact.

### 1. Helplessness replaces the player's catalogue

For the controlled player, pain overwhelm is checked before low Energy:

1. pain at or above tolerance -> only `writhe-in-pain`;
2. otherwise Energy below `1` -> only `too-tired-to-move`;
3. otherwise enumerate ordinary legal, rank-unlocked responses.

Both helpless actions take zero seconds. The stored NPC intent still resolves afterward, its contest against the player is unopposed, and player-controlled holds are released. The objective ends only if that actual intent or the resulting state satisfies its completion rules.

Energy is not encounter exertion. Energy is a world stat consumed by elapsed time. Exertion is temporary fight-local fatigue used by readiness, contests, holds, AI, and the post-combat fatigue conversion.

### 2. Duration establishes action priority

- A faster action resolves first.
- Physical terminal state is checked before a slower action may resolve.
- If the fight is still active, the slower action is revalidated. Changed range, pose, holds, body capacity, or another prerequisite may spoil it.
- Guard and evasion influence an opposing action from the start only if the defensive response is equally fast or faster.
- The exchange clock advances by `max(player duration, NPC duration)`.

Increasing an action's duration makes it easier to interrupt, delays when its guard/evasion starts, adds a larger AI speed penalty, and lengthens both the encounter and ordinary Energy drain. Decreasing it does the reverse.

### 3. Equal-duration actions use simultaneous resolution

Equal-speed actions resolve from isolated copies of the same starting state. Their effects are merged afterward:

- damage and exertion from both branches add;
- acute severity adds up to 3 and the longest remaining duration wins;
- removing an existing hold beats changing it;
- compatible new holds survive;
- incompatible changes to one scalar position value, such as two different ranges or poses, cancel to the pre-exchange value and emit `state.change-conflicted`;
- objective modules merge their own mutable state and proposed outcomes.

When two successful simultaneous grabs would each restrain the source limb used by the other, the winner is selected in this order: lower pre-exchange exertion, higher Fitness, higher Strength, then a deterministic 50/50 roll.

### 4. Physical terminal checks

After a faster action and again after the whole exchange, resolution checks in this order:

1. objective target escaped;
2. objective owner escaped;
3. both participants hard-incapacitated;
4. objective owner incapacitated;
5. objective-specific completion;
6. objective target hard-incapacitated;
7. neither participant has any legal action;
8. objective owner has no legal action;
9. objective target has no legal action.

Pain-only completion is intentionally deferred until the player has spent an exchange writhing, allowing the stored NPC intent to resolve first.

### 5. Simultaneous terminal outcomes

An objective owns the priority for merging outcomes proposed by equal-speed actions.

`steal-money` uses: rescue -> surrender -> incapacitated theft -> conscious theft -> player escape -> mugger fled -> mugger incapacitated.

`beat-down` uses: rescue -> mutual incapacitation -> attacker incapacitated -> player beaten down -> player escape -> attacker abandoned.

Changing this ordering changes who receives the benefit when terminal events happen on the same beat. It does not affect unequal-speed interruption.

## Player Combat skill

Combat is one total from `0` through `500`, displayed as five ranks of 100 points:

| Total | Display |
|---:|---|
| `0..99.999...` | Rank 0 |
| `100..199.999...` | Rank 1 |
| `200..299.999...` | Rank 2 |
| `300..399.999...` | Rank 3 |
| `400..500` | Rank 4; 500 displays 100/100 |

A successful player action tagged `impact`, `control`, or `hold` awards `0.15` points with no encounter feedback. Failed, spoiled, self-only impacts, and a lost simultaneous grab award nothing. A player-loss outcome subtracts `1` point once during consequence settlement. Subtraction crosses rank boundaries normally; Rank 4 at 0/100 becomes Rank 3 at 99/100.

Changing `0.15` changes progression speed: at the current value, roughly 667 qualifying successes equal 100 points. Changing the `1`-point loss penalty changes how punitive defeat is without changing fight resolution.

### Rank unlocks

| Rank | Newly available behavior |
|---:|---|
| 0 | Core broad responses: body strike, brace, recovery, break away, stand/roll, create distance, run, objective/help/helpless actions. |
| 1 | No new actions; broad fallback labels gain explanatory role hints. |
| 2 | `strike-face`, `strike-holding-arm`, `shove-away`, `grab-arm`, `tighten-hold`, `force-to-wall`. |
| 3 | `headbutt`, `knee-strike`, `controlled-disengage`, `force-to-ground`, `turn-target-away`, `pin-limb`. |
| 4 | No new actions; labels add `acts first`, `same timing`, or `acts after their move`. |

`attack-limb`, `search-money`, `flee`, and `close-distance` have rank entries for registry completeness but are goal-owner-only. Rank gating applies only to the controlled player; the NPC uses the full mechanically legal catalogue.

Changing an action's entry in `COMBAT_ACTION_MINIMUM_RANK` changes only when the player can see/use it. It does not change its chance, AI use, prose, or physical prerequisites.

## Core physical tuning

### Body damage and pain

Every body part has maximum integrity and a pain multiplier:

| Parts | Max integrity | Pain multiplier |
|---|---:|---:|
| Head | 100 | 1.5 |
| Face | 80 | 1.7 |
| Neck | 80 | 1.6 |
| Chest | 120 | 1.3 |
| Back | 120 | 1.2 |
| Abdomen | 100 | 1.4 |
| Groin | 60 | 2.0 |
| Each shoulder | 90 | 1.1 |
| Each upper arm | 90 | 1.0 |
| Each forearm | 80 | 1.1 |
| Each hand | 70 | 1.4 |
| Each thigh | 100 | 1.2 |
| Each knee | 80 | 1.5 |
| Each calf | 90 | 1.3 |
| Each ankle | 70 | 1.5 |
| Each foot | 70 | 1.3 |

`applyDamage` removes structural damage from part integrity. By default the same hit creates `damage × painMultiplier` total local pain, split between a persistent injury floor and acute pain. The injury floor is recalculated from integrity:

```text
injury pain floor = 35 × (missing integrity ratio ^ 1.5) × pain multiplier
local pain = injury pain floor + acute pain, clamped to 100
```

Explicit `painDamage` can make an impact more or less painful without changing its structural damage. Raising maximum integrity makes the part withstand more structural damage. Raising the pain multiplier makes injuries to that part more painful without increasing integrity loss. Randomized combat damage may also apply a bruise.

Whole-body pain is the largest local pain plus 30% of every other local pain, clamped to `0..100`. Increasing the 30% carry-over makes distributed hits much more effective; decreasing it makes the worst single injury dominate.

```text
physical performance = clamp(1 - whole-body pain × 0.005, 0.5, 1)
```

At 100 pain, performance is 0.5. Increasing `0.005` makes pain suppress all contests sooner; changing the 0.5 floor determines the minimum remaining generic performance.

There is no pooled health meter. The UI presents a qualitative body condition:

| Internal condition score | Displayed condition |
|---:|---|
| 90 to 100 | Fine |
| 70 to below 90 | Hurt |
| 45 to below 70 | Injured |
| 20 to below 45 | Badly injured |
| Below 20 | Critical |

The score is the worst of vital-part severity, 65% of the worst individual-part
damage ratio, and twice the body's pooled missing-integrity ratio. It is a
display summary, not expendable hit points. Structural incapacitation overrides
the score and displays `Incapacitated`: head-chain capacity at or below 8%,
chest capacity at or below 6%, or both the better arm chain and better leg chain
at or below 15%.

### Part and limb capacity

For a requested part and its dependency chain:

```text
part capacity = integrity ratio
              × 0.94 if bruised
              × max(0.65, 1 - local pain × 0.0035)
chain capacity = minimum part capacity in the chain
```

Chains include hand -> forearm -> upper arm -> shoulder, foot -> ankle -> calf -> knee -> thigh, and head -> neck. A missing or zero-integrity part gives zero capacity. A part is functional only above `0.15`.

Increasing the bruise multiplier toward 1 weakens the mechanical effect of the condition. Lowering the pain floor below 0.65 lets local pain disable limbs more completely. Raising `0.0035` makes local pain reduce limb use faster. Raising the functional threshold makes actions and holds disappear earlier as parts are damaged.

A usable hand must be functional, not maintaining a hold, not controlled by any hostile hold on that arm, and have final limb capacity above `0.55`. This `0.55` is intentionally much stricter than mere functionality; lowering it preserves hand actions under damage/restraint, while raising it makes grips and strikes easier to shut down.

### Balance and movement

```text
balance = better foot capacity × 0.70 + worse foot capacity × 0.30
balance *= 0.72 while kneeling
balance *= 0.35 while supine or prone
balance *= max(0.25, 1 - off-balance severity × 0.20 - daze severity × 0.12)
```

Favoring the better foot more strongly makes one healthy leg compensate for the other. Lower pose multipliers make grounded actions and resistance harder. The final 0.25 floor prevents acute effects alone from reducing balance to zero.

Movement capacity is the better leg's minimum thigh/knee/foot-chain capacity. Ordinary movement requires standing and capacity above `0.20`.

Movement/control thresholds:

| Threshold | Current value | What raising it does |
|---|---:|---|
| General movement | `> 0.20` | Removes movement and escape earlier under leg damage. |
| Wrenchable restrained part | `> 0.15` unrestrained capacity | Removes the physical wrench response earlier. |
| Stand movement | `>= 0.22` | Makes rising with damaged legs harder. |
| Stand arm alternative | `>= 0.20` | Requires a healthier arm when balance is poor. |
| Stand balance alternative | `>= 0.28` | Requires better footing when arms are poor. |
| Firm pin preventing stand | effective leverage `>= 32` | Makes fewer pins completely deny standing. |
| Knee-strike balance | `> 0.40` | Makes the strike more position-sensitive. |
| Knee-strike planted leg | `> 0.32` | Requires a healthier supporting leg. |
| Force-to-ground balance | `> 0.35` | Makes takedowns harder for an unstable controller. |
| Headbutt head capacity | `> 0.30` | Prevents headbutts at a healthier head state. |

### Incapacitation and helplessness

Pain tolerance is:

```text
min(95, 78 + Resolve × 1.9)
```

Resolve 0 gives 78; Resolve 9 reaches the 95 cap. Raising 78 makes everyone withstand more pain. Raising 1.9 increases the value of Resolve. Raising the 95 cap lets high-Resolve characters remain active closer to maximum pain.

Hard incapacitation occurs if any of these are true:

- daze severity `3`;
- head capacity `<= 0.08`;
- chest capacity `<= 0.06`;
- best leg and best arm capacity are both `<= 0.15`;
- while not standing, pain is at least `62` and both best-leg and best-arm capacity are below `0.25`;
- winded severity is `3` and pain is at least `68`.

Raising a pain/capacity requirement makes that particular defeat condition rarer. Lowering it makes the objective reach unable-target resolution sooner. Player pain reaching tolerance is separated from hard incapacitation so the NPC still has to perform its telegraphed exchange while the player writhes.

### Contest formula

Most contested actions use:

```text
chance = base chance
       + (actor stat - target stat) × 0.035        when stats are configured
       + action-specific modifier
       + (source limb capacity - 1) × 0.32         when a source exists
       + (actor body performance - 1) × 0.40
       + (actor balance - target balance) × 0.18
       - actor exertion × 0.0025
       + target exertion × 0.0015
       - 0.14 if actor is dazed
       + 0.12 if target is dazed
       + guard/evasion adjustment
chance = clamp(chance, 0.18, 0.90)
```

Changing a base chance shifts only that action. The stat coefficient means one stat point is 3.5 percentage points before clamping. Raising the source/body/balance coefficients makes injuries and position more decisive. Raising the actor-exertion coefficient punishes active fatigue; raising the target-exertion coefficient rewards attacking a tired opponent. Widening the 18%-90% clamp increases certainty at extremes; narrowing it preserves more upset results.

Guard subtracts `0.18` from impact contests but adds `0.06` to control contests: covering up makes hits harder to land but makes the defender easier to grab or position. Guarded damage is multiplied by `0.62`, minimum 1. Changing these three values controls the attack-versus-grapple tradeoff of bracing.

Evasion subtracts:

```text
max(0.03,
    clamp(0.08 + defender Fitness × 0.015, 0.08, 0.22)
    - (1 - movement capacity) × 0.12
    - exertion × 0.001
    - 0.04 while wall-supported)
```

Raising the Fitness coefficient or 0.22 cap strengthens skilled evasion. Raising mobility, exertion, or wall penalties makes impaired evasion lose value faster. The 0.03 floor guarantees at least a small benefit after the action activates.

### Damage formula

```text
source multiplier = 0.45 + source limb capacity × 0.55
damage = round((base damage + Strength × strength scale) × source multiplier)
```

An action without a source part uses multiplier 1. Raising an action's base damage helps weak and strong actors equally. Raising its Strength scale increases stat differentiation. The source formula currently leaves a low-capacity limb at 45% nominal force; lowering that floor makes damaged limbs matter more.

### Exertion and readiness

```text
strain = 1 + exertion / 180 + winded × 0.16 + dazed × 0.10 + pain / 250
exertion gained = max(1, round(base effort × strain - Endurance × 0.45))

readiness = clamp(round(
    100 - exertion + Endurance × 3
    - max(0, pain - Resolve × 1.5) × 0.18
    - winded × 10 - dazed × 8
), 0, 120)

catch-breath recovery = max(6, round(8 + Endurance × 2.4))
```

Raising a base effort makes that action more expensive and increasingly expensive late in a fight. Smaller strain denominators/coefficient increases make existing fatigue, pain, winded, or daze snowball faster. Raising Endurance's `0.45`, `3`, or `2.4` coefficient respectively lowers action cost, raises readiness, or improves recovery.

The player never sees actions whose readiness or acute caps are currently violated. The NPC may select an overextended action, but must pass:

```text
clamp(0.13 + Resolve × 0.01
      - readiness deficit × 0.008
      - excess acute severity × 0.06,
      0.02, 0.23)
```

Failure still adds exertion with base `max(2, action duration)` and records the action as failed. Raising the 0.13 base or 0.23 cap makes desperate NPC feats more frequent; raising either penalty makes overextension fail more reliably.

## Action tuning catalogue

`Effort` is the base passed to the strain formula. `Ready` is required readiness. `W/D` are maximum allowed winded/dazed severities. `—` means the action does not add exertion; catch breath instead recovers it.

| Action | Users | Rank | Seconds | Effort | Ready | W/D | Principal tuning/effect |
|---|---|---:|---:|---:|---:|---:|---|
| `too-tired-to-move` | player | 0 | 0 | — | 0 | 3/3 | Exclusive while Energy `< 1`; NPC acts unopposed. |
| `writhe-in-pain` | player | 0 | 0 | — | 0 | 3/3 | Exclusive at pain tolerance; NPC acts unopposed. |
| `surrender-money` | player | 0 | 0 | — | 0 | 3/3 | Immediate theft surrender outcome. |
| `scream-for-help` | player | 0 | 2 | — | 0 | 3/3 | Environmental rescue roll; see below. |
| `controlled-disengage` | player | 3 | 1 | — | 20 | 2/2 | Requires complete player wrist control and opponent exertion `>=35`; chance below. |
| `demand-money-back` | player | 0 | 1 | — | 0 | 3/3 | Requires stolen money and complete control; tricky Speech roll. |
| `cover-and-brace` | both | 0 | 1 | 2 | 14 | 3/2 | Guard adjustments described above. |
| `catch-breath` | both | 0 | 3 | recovery | 0 | 3/2 | Available at exertion `>=12`, pain `>=20`, winded, or dazed; eases winded by 1. |
| `headbutt` | both | 3 | 1 | 7 | 36 | 1/1 | Base 0.58; face `8 + Str×0.45`; self head `4 + Str×0.10`. |
| `knee-strike` | both | 3 | 2 | 9 | 34 | 1/1 | Base 0.61; abdomen `10 + Str×0.60`; applies winded. |
| `strike-face` | both | 2 | 2 | 7 | 18 | 2/1 | Base 0.57; face `10 + Str×0.70`; may daze. |
| `drive-body` | both | 0 | 2 | 7 | 22 | 2/1 | Base 0.64; abdomen `12 + Str×0.75`. |
| `shove-away` | both | 2 | 2 | 9 | 28 | 1/2 | Strength contest base 0.61; breaks/weakens holds and opens range. |
| `grab-arm` | both | 2 | 2 | 7 | 22 | 2/2 | Fitness contest base 0.60; creates wrist grip. |
| `strike-holding-arm` | both | 2 | 2 | 6 | 18 | 2/1 | Base 0.67; source limb `8 + Str×0.65`; weakens hold. |
| `wrench-free` | both | 0 | 3 | `9 + 3×holds` | 36 | 1/2 | One specialized escape roll per hostile hold. |
| `stand-up` | both | 0 | 3 | 10 | 40 | 1/1 | Fitness-vs-Strength base 0.61 if held. |
| `roll-toward` | both | 0 | 2 | 7 | 24 | 2/2 | Base 0.64 if held; changes facing/pose and weakens holds. |
| `create-distance` | both | 0 | 3 | 5 | 30 | 1/2 | May contest light holds; activates evasion and opens range one step. |
| `run` | player | 0 | 4 | 10 | 42 | 1/1 | From far range; proposes player escape. |
| `tighten-hold` | both | 2 | 2 | 6 | 16 | 2/2 | Uncontested leverage gain. |
| `pin-limb` | both | 3 | 2 | 8 | 34 | 1/1 | Strength contest base 0.62; converts grip to pin. |
| `force-to-ground` | both | 3 | 3 | 12 | 44 | 1/1 | Strength contest base 0.48; takedown. |
| `force-to-wall` | both | 2 | 3 | 10 | 38 | 1/1 | Strength contest base 0.50; wall support. |
| `turn-target-away` | both | 3 | 2 | 7 | 28 | 2/1 | Fitness contest base 0.56; facing/pose control. |
| `search-money` | goal owner | 0 | 4 | 6 | 18 | 2/2 | Requires usable theft control; takes money then enters disengage. |
| `attack-limb` | goal owner | 2 | 3 | 9 | 12 | 2/2 | Beat-down only; base 0.52; forearm/knee `14 + Str×0.80`. |
| `flee` | goal owner | 0 | 3 | 7 | 8 | 2/2 | From reach/far; proposes owner escape. |
| `close-distance` | goal owner | 0 | 2 | 6 | 34 | 1/2 | Fitness contest base 0.68; far -> reach. |

### Action geometry

Geometry is authoritative availability, not merely prose. “Front” below means `toward` or `side`.

| Actions | Required geometry |
|---|---|
| `strike-face`, `attack-limb` | Reach or clinch; actor and target front-facing. |
| `drive-body`, `strike-holding-arm`, `shove-away`, `grab-arm` | Reach or clinch; actor front-facing. |
| `headbutt` | Clinch; actor facing toward; target front-facing; actor standing or kneeling. |
| `knee-strike` | Clinch; actor front-facing and standing; target standing, kneeling, or supine. |
| `create-distance` | Reach or clinch; actor standing. |
| `stand-up` | Actor kneeling, supine, or prone. |
| `roll-toward` | Actor grounded, or standing against a wall. |
| `close-distance` | Far; actor front-facing and standing. |
| `run` | Far; actor standing. |
| `flee` | Reach or far; actor standing. |
| `wrench-free`, `tighten-hold` | Clinch; facing is irrelevant because contact already exists. |
| `force-to-wall` | Clinch; actor front-facing; both standing; target support free. |
| `force-to-ground` | Clinch; actor front-facing; both standing. |
| `turn-target-away` | Clinch; actor and target front-facing; target wall-supported or grounded. |
| `pin-limb` | Clinch and actor front-facing; either a standing wall-supported target, or a kneeling actor over a grounded target. |
| `search-money` | Clinch; actor front-facing. |
| `controlled-disengage` | Clinch; actor standing. |

Helpless actions, surrender, calling for help, demanding money back, bracing, and catching breath have no separate range/facing geometry rule; their own availability predicates still apply. Raising a capacity or leverage threshold does not override geometry, and loosening geometry does not override physical readiness.

### Strike secondary tuning

- `strike-face`: target daze chance is `min(0.68, 0.24 + damage × 0.025)`; severity 2 at damage `>=16`, otherwise 1.
- `headbutt`: an outright miss has 18% self-daze chance. On hit, target daze is `min(0.62, 0.28 + damage × 0.02)` and becomes severity 2 at damage `>=13`; self-daze is separately 12%.
- `knee-strike`: a miss has 38% chance to apply severity-1 off-balance for two exchanges. A hit applies winded for two exchanges, severity 2 at damage `>=15`, and has 16% chance to apply self off-balance for one exchange.
- Acute applications stack severity to 3 and keep the longer remaining duration. Every completed exchange reduces remaining duration by one.

Raising a secondary-effect chance or damage breakpoint makes that action more reliable at disrupting future turns. Increasing acute duration does not increase initial severity, but keeps its readiness, balance, or contest penalty active for more exchanges.

### Hold tuning

`grab-arm` creates stored leverage:

```text
clamp(round(36 + attacker Strength × 3 - target Strength), 22, 68)
```

The 36 controls the typical grip, the Strength coefficients control differentiation, and 22/68 prevent an initial grip from being trivial or nearly complete.

Stored leverage becomes effective leverage at query time:

```text
effective = stored
          × source-part capacity
          × controller balance
          × (0.70 if dazed, else 1)
          × max(0.55, 1 - exertion × 0.0045)
          × pin position multiplier
```

Pin position is 1.08 against a wall or 1.18 on the ground, plus 0.08 if the pinned target faces away. Raising these makes positional pins more decisive. Lowering the exertion floor or raising 0.0045 makes tired controllers lose effective control faster.

Hostile restraint reduces the controlled limb:

```text
wrist multiplier = max(0.12, 1 - effective / 105)
pin multiplier   = max(0.02, 1 - effective / 70)
```

Lower denominators make leverage suppress limbs faster. Floors define how much capacity a hold can never remove by itself.

Important control breakpoints and changes:

| Rule | Value | If increased |
|---|---:|---|
| `create-distance` treats combined grip as free | `<=18` | More weak holds are ignored. |
| `create-distance` treats combined grip as contested | `19..30` | Raising the upper bound permits escape attempts against stronger holds. |
| Any pin denies ordinary disengagement | any pin | This is categorical, not leverage-scaled. |
| Movement-denying pin | `>=28` effective | Fewer pins block running/movement if raised. |
| Movement-denying combined holds | `>=52` effective | Requires more total control if raised. |
| Shove breaks a hold | `<48` effective | Raising it lets shove break stronger holds. |
| Stronger hold shove loss | 20 stored | Raising it wears down surviving holds faster. |
| Firm pin blocks standing | `>=32` effective | Raising it allows standing through more pins. |
| Force to wall prerequisite | `>=42` effective | Raising it lengthens the control chain. |
| Force to ground prerequisite | `>=34` effective | Same for takedowns. |
| Turn-away prerequisite | `>=28` effective | Same for facing control. |
| Usable control firm pin | `>=38` effective | Makes objective access require a stronger single pin. |
| Usable control total | `>=72`, max 70 per hold | Makes multiple holds necessary/relevant. |
| Complete player control | each wrist `>=30`, total `>=72` | Makes special player leverage actions harder to unlock. |

`tighten-hold` adds `max(8, round(14 + Strength × 0.5))` stored leverage, capped at 100. `force-to-wall`, `force-to-ground`, and `turn-target-away` add 8, 6, and 5 respectively. `pin-limb` adds 15.

`wrench-free` uses the common injury, balance, exertion, and daze terms but has its own final clamp of `0.12..0.84`, plus `-effective × 0.004`, `-0.12` for a pin, and `-0.08` per additional targeted hold. On failure it removes at least 3 stored leverage; the normal reduction is `round((5 + Fitness × 0.6) × effort multiplier × restrained-part capacity)`. Raising leverage penalties makes clean escapes rarer, while raising failure wear prevents a permanent-feeling deadlock.

### Escape and objective-action tuning

`controlled-disengage` requires both opposing wrists to meet complete-control thresholds, a wall-supported or grounded opponent, player movement, and opponent exertion at least 35:

```text
chance = clamp(0.50 + (opponent exertion - 35) × 0.006, 0.50, 0.88)
```

Raising the exertion prerequisite delays access. Raising 0.006 makes exhausted opponents easier to surprise. The 50%-88% clamp defines its baseline risk and maximum reliability.

`demand-money-back` uses the general `tricky` Speech curve: target 2.5, spread 1.25, with the player's Speech floored to an integer first. Lowering the target makes the demand easier; increasing spread makes the transition from poor to strong Speech more gradual.

`scream-for-help` starts from 40% during daytime. Non-daylight halves it. Rain and snow multiply it by 0.625; storms by 0.375. The penalties compound:

| Weather | Day | Non-daylight |
|---|---:|---:|
| Other/clear | 40% | 20% |
| Rain or snow | 25% | 12.5% |
| Storm | 15% | 7.5% |

The deterministic roll is reused for 45 encounter seconds. Raising 45 makes repeated calls less able to fish for a new result; lowering it gives retries new chances sooner.

## Objective behavior

### `steal-money`

Stages are derived from facts:

1. `gain-control`: the owner lacks usable control;
2. `access-money`: usable control exists;
3. `disengage`: a search occurred, whether or not money was found;
4. `complete`: terminal.

Objective progress is:

```text
range: clinch 20, reach 10, far 0
+ min(70, sum stored hold leverage × 0.5)
+ 20 if any hold is a pin
+ 15 if target is wall-supported
+ 20 if target is not standing
+ 10 if target faces away
+ 30 if usable control is currently true
+ 200 after search
```

This score is used only to detect meaningful AI progress and reset the stall timer. Raising a component makes that transition count more strongly; because the check is simply “greater than before,” relative regressions can still prevent the timer reset.

`search-money` deducts the bounded amount immediately and moves the objective to `disengage`. The encounter remains active: the attacker must actually flee. If the player incapacitates the attacker or is rescued before that escape, `lootAmount` is returned. The player may also recover it through `demand-money-back` while holding complete control. Conscious theft completes only when the owner escapes with positive loot; escaping after finding nothing produces `mugger-fled`.

Hard player incapacitation performs bounded unopposed theft and the attacker leaves. Surrender does the same without further violence. Money mutation is based on the difference in stored `lootAmount`, making rendering and repeated terminal settlement idempotent.

### `beat-down`

The only active stage is `attack`; terminal state is `complete`. Progress is the player's whole-body pain. The attacker never voluntarily retreats: commitment has a minimum of 100, retreat is disallowed, and `flee` is excluded from this objective's action catalogue.

The objective action `attack-limb` can target either forearm or knee with capacity above zero. General attacks also receive strong objective bonuses. Completion occurs when the player's pain reaches the stored tolerance threshold after the helpless exchange, or when hard incapacitation/no legal response makes the player unable to continue.

### Routable outcome IDs

| Objective | Outcome ID | Meaning | Player loss? |
|---|---|---|---:|
| Theft | `player-rescued` | Help interrupts the encounter; taken money is recovered. | no |
| Theft | `player-escaped` | Player gets away. | no |
| Theft | `player-surrendered-money` | Player gives up and the attacker leaves. | yes |
| Theft | `mugger-fled` | Attacker abandons the attempt or escapes with no loot. | no |
| Theft | `mugger-incapacitated` | Attacker cannot continue; taken money is recovered. | no |
| Theft | `both-incapacitated` | Neither can continue; taken money is recovered. | no |
| Theft | `theft-completed-player-conscious` | Attacker escapes with loot after searching. | yes |
| Theft | `theft-completed-player-incapacitated` | Unable player is searched and attacker leaves. | yes |
| Beat-down | `player-rescued` | Help interrupts the attack. | no |
| Beat-down | `player-escaped` | Player gets away. | no |
| Beat-down | `player-beaten-down` | Pain/physical inability completes the goal. | yes |
| Beat-down | `attacker-abandoned` | Owner leaves. | no |
| Beat-down | `attacker-incapacitated` | Owner cannot continue. | no |
| Beat-down | `both-incapacitated` | Neither can continue. | no |

Every theft outcome stores `moneyLost`; beat-down completion additionally stores its cause, final pain, and pain threshold. Use these exact IDs in WG `outcomes` routing.

## NPC AI priorities and tuning

The NPC selects only mechanically enumerated actions. Combat rank does not filter NPC actions. Selection is deterministic for the same game seed, instance key, exchange, personality, action, target, and parameters.

### Personality selection and commitment

| Personality | Probability | Bias | Time | Pain | Exertion |
|---|---:|---:|---:|---:|---:|
| Opportunist | 35% | 0 | 0.85 | 0.80 | 0.35 |
| Desperate | 20% | +14 | 0.45 | 0.25 | 0.15 |
| Forceful | 25% | +8 | 0.85 | 0.70 | 0.30 |
| Skittish | 20% | -10 | 1.10 | 1.05 | 0.45 |

The seeded selection intervals are opportunist 0-.20, desperate .20-.40, forceful .40-.65, skittish .65-.85, and opportunist .85-1. Changing interval boundaries changes encounter frequency, not behavior within a personality.

```text
initial base = min(75, 50 + personality bias + round(actor Resolve × 3))
```

The cap prevents a high-Resolve actor from starting fully committed. Raising it delays retreat for strong actors.

Current commitment is:

```text
stalled seconds = max(0, elapsed - last progress second - 8)
impairment = (1 - max(best-arm capacity, movement capacity)) × 22

commitment = clamp(round(
    base
  + objective reward
  - stalled seconds × personality time sensitivity
  - owner pain × personality pain sensitivity
  - owner exertion × personality exertion sensitivity
  - failed control attempts × 2
  - impairment
  - 100 if pacing limit reached
  + any objective-enforced minimum
), 0, 100)
```

The first 8 seconds after progress are free of stall decay. Raising 8 makes attackers more patient. Raising any sensitivity makes that pressure reduce commitment faster. Raising the 22 impairment scale makes limb/movement damage more intimidating. Theft reward is `min(20, amount) × 0.5`, so it ranges from 0 to +10; an empty target instead gives -45.

The pacing limit applies at exertion `>=95` after 45 seconds, or unconditionally after 66 seconds. It forces retreat-capable objectives to 0 commitment. Lowering either time shortens fights. Lowering 95 causes tired attackers to abandon sooner. `beat-down`'s objective minimum restores commitment to 100, so these pacing limits do not make it retreat.

| Commitment | Player-facing band |
|---:|---|
| `0..22` | ready to run |
| `23..39` | hesitating |
| `40..64` | frustrated but committed |
| `65..100` | confident |

At 22 or below, a retreat-capable objective enters retreat selection. Raising 22 makes retreat start earlier; lowering it makes attackers remain in pursuit longer.

### Forced retreat priority

Theft after a search and low-commitment retreat both prefer the first non-empty executable band:

1. `flee`;
2. `create-distance`;
3. `wrench-free`, `strike-holding-arm`, `shove-away`;
4. `stand-up`, `roll-toward`;
5. `catch-breath`;
6. `cover-and-brace`.

This ordering is stronger than utility scores: a lower band is not considered while a higher band contains a candidate. Reordering bands changes tactical escape plans directly. Within the selected band, ordinary utility scoring chooses the action.

### Utility formula

For each candidate:

```text
each motive = (profile motive × 10 + situational bonus)
              × personality motive weight
duration = -seconds × 1.5 × personality speed weight
risk = -profile risk × (10 + exertion × 0.12)
       / max(0.35, personality safety weight)
overextension = 0 when effort-legal, otherwise
                -45 - readiness deficit × 1.5
                - 15 × additional blocker count
repetition = -(12 if immediately repeated, else 0
               + 1.5 × occurrences in the eight-action history)
             × personality novelty weight
variation = deterministic value from -2.5 through +2.5
retreat priority = profile escape × 35 while low-commitment retreating

total = profile base + objective + control + pressure + safety + escape
        + duration + risk + overextension + repetition + variation
```

Raising a profile motive makes personalities that emphasize that motive choose the action more often. Raising the duration coefficient favors quick actions. Raising risk or the exertion-risk coefficient suppresses demanding actions late in a fight. Raising repetition penalties creates more varied behavior. Raising variation creates more seed-dependent behavior and less predictable tuning.

### Generic action utility profiles

Blank motives are zero.

| Action | Base | Objective | Control | Pressure | Safety | Escape | Risk |
|---|---:|---:|---:|---:|---:|---:|---:|
| Brace | 8 | | | | 1.0 | | |
| Catch breath | 6 | | | | 1.2 | | |
| Strike face | 8 | | .25 | 1.0 | | | .25 |
| Drive body | 8 | | | .85 | | | .15 |
| Strike holding arm | 10 | | | .50 | .50 | .90 | .15 |
| Headbutt | 7 | | .30 | 1.10 | | | .80 |
| Knee strike | 8 | | .20 | .90 | | | .45 |
| Shove | 9 | | .35 | | .40 | .75 | .15 |
| Create distance | 8 | | | | .60 | 1.0 | .10 |
| Stand | 10 | | | | 1.0 | .45 | .10 |
| Roll | 9 | | | | .85 | .35 | .15 |
| Close distance | 8 | .50 | .60 | | | | .20 |
| Run/flee | 12 | | | | 1.0 | 1.50 | .10 |
| Grab | 9 | .50 | 1.0 | | | | .20 |
| Wrench | 11 | | | | .70 | 1.0 | .20 |
| Tighten | 7 | .50 | 1.0 | | | | .10 |
| Force wall | 8 | .80 | 1.10 | | | | .35 |
| Force ground | 8 | .80 | 1.20 | | | | .50 |
| Turn away | 7 | .80 | .80 | | | | .20 |
| Pin | 9 | 1.0 | 1.30 | | | | .20 |

Objectives may supply a profile for their own actions: theft search is base 10, objective 2, risk .6; beat-down limb attack is base 11, objective 1.5, pressure 1.1, risk .35.

### Situational AI bonuses

Shared bonuses include:

- catch breath safety: `max(0, exertion - 55) × 1.2 + winded × 24 + dazed × 16`;
- if held: +20 escape for a hold-disrupting action, otherwise -10 safety;
- attack pressure against a hurting target: `min(35, max(0, (target pain - 40) × 1.5))`;
- after at least two braces in the player's last three actions: +18 control, plus +12 objective for grab;
- after at least two create-distance actions in the last three: +15 objective for close-distance, +10 control for grab;
- owner pain above 35: +7 safety for defense/movement;
- non-standing owner: +12 safety for stand-up.

Theft adds large stage-specific bonuses: search +60 when control is usable; close +48, grabs +44/+54, takedown +62, ground pin +48, and smaller positioning/control bonuses while gaining control; escape-support actions gain +60 after search. A failed prior grab adds +25 pressure to attacks, while a failed prior close adds +90. These are deliberate priorities, not percentages: raising one changes its relative score against every other candidate.

Beat-down adds +70 objective plus up to +35 for existing damage to the selected limb, +30 pressure for `attack-limb`, +50 objective/+20 pressure for other attacks, and +65 objective for closing distance. It subtracts 25 objective from create-distance and shove.

### Personality motive weights

| Personality | Objective | Control | Pressure | Safety | Escape | Speed | Novelty |
|---|---:|---:|---:|---:|---:|---:|---:|
| Opportunist | 1.25 | 1.00 | .65 | 1.00 | 1.00 | .90 | 1.00 |
| Desperate | .80 | .80 | 1.70 | .45 | .45 | 1.00 | .55 |
| Forceful | 1.00 | 1.25 | 1.20 | .65 | .65 | .80 | .70 |
| Skittish | .90 | .80 | .55 | 1.35 | 1.40 | 1.10 | 1.15 |

Increasing a weight increases the importance of that motive. `speed` and `novelty` multiply penalties, so increasing them favors shorter or less-repeated actions rather than increasing a positive score.

## Recovery, aftermath, and hygiene

Outside an open physical encounter, acute pain decays exponentially with a
90-minute half-life. This never restores integrity and cannot reduce local pain
below the floor produced by the injury itself. Direct pain relief likewise
affects only the acute component.

New damage pauses natural integrity recovery for six hours. Once that delay has
expired, each part recovers according to its current integrity ratio:

| Integrity | Natural recovery |
|---:|---:|
| Below 20% | none; treatment is required |
| 20% to below 50% | 2% of maximum integrity per day |
| 50% to below 85% | 5% per day |
| 85% to below 100% | 10% per day |

Recovery crosses these bands continuously, so advancing one long interval and
many short intervals produces the same result. A bruise clears once integrity
reaches at least 90%. Acute pain may fade over hours; meaningful tissue damage
therefore remains for days and critical damage remains until treated.

Terminal settlement converts the player's remaining encounter exertion to post-combat fatigue:

```text
starting multiplier = 1 + 2 × exertion / 100
```

It is capped at 3x, combines with an existing fatigue bonus up to that cap, lasts 30 game minutes, and decays linearly to 1x. It adds only the extra ordinary Energy drain. Base Energy drain is `0.1` per non-resting minute. Raising the 3x cap or 30-minute duration makes fight fatigue more costly; changing base drain affects the entire game, not combat alone.

The exhaustion interrupt remains pending after a terminal combat screen because fatigue settlement does not refill Energy and the terminal choice is not an escape around the normal time/interrupt flow.

### Hygiene tuning

The player's own chosen action costs:

| Cost | Actions |
|---:|---|
| 0 | helpless actions, surrender, scream, demand money back, search money |
| .01 | catch breath |
| .02 | brace |
| .04 | controlled disengage, grab, tighten hold |
| .05 | create distance, close distance |
| .06 | strike face, turn away |
| .07 | shove, strike holding arm |
| .08 | drive body, stand, attack limb |
| .09 | knee strike |
| .10 | headbutt, wrench, pin, flee |
| .12 | run |
| .14 | force to ground |
| .25 | roll toward |

Additional event costs are .08 when hit, .03 when grabbed, .12 when pinned, .12 when forced to a wall, .30 when moved to kneeling, and .75 when moved to prone or supine. Costs add and are clamped only by the player's Hygiene stat. Raising action costs makes player strategy itself dirtier; raising event costs makes losing position/contact the main source of hygiene loss.

## Adding or modifying an objective

An objective is the best extension point for a new attacker goal. Keep generic mechanics in shared actions and put goal state, completion, AI priorities, and outcome semantics in the objective.

1. Add a module in `src/features/encounter/objectives/`.
2. Give it a unique `id`, player-facing `label`, and a valid default `laboratoryConfig`.
3. List outcomes where the player gets out of the current place in `playerLeavesPlaceOutcomeIds`.
4. Register it in `objectives/index.js`; the combat lab reads this registry automatically.
5. Add objective-only actions to `actionIds`. Use `excludedActionIds` to remove otherwise-core actions for this goal.
6. Implement strict config/state validation and update the objective stage from current facts.
7. Define progress, AI profiles/bonuses, retreat policy, outcomes, and simultaneous outcome priority.
8. Define which outcomes count as player losses for the one-point Combat penalty.
9. Add threat, pressure, event, and outcome prose.
10. Add unit, deterministic replay, terminal settlement, and combat-lab-default tests.

The current objective contract is:

```js
{
  id,
  label,
  laboratoryConfig,
  playerLossOutcomeIds,
  playerLeavesPlaceOutcomeIds,
  unopposedActionId,
  actionIds,
  excludedActionIds?,
  outcomePriority,

  validateConfig(config, fail),
  create({ game, config, ownerId, targetId }),
  validateState(state, validation),
  complete(context),
  progress(context, helpers),
  syncStage(context, helpers),
  recordProgress(context),
  recordControlFailure(context, actorId),

  ai: {
    actionUtility(instance),
    commitment(context),
    situationalBonuses(context, instance, helpers),
    allowsRetreat(context),
    forceRetreat(context),
    pursuitPool(candidates),
    isProgressAction(tags),
  },

  mergeSimultaneous(context, branches),
  mergeOutcomes(outcomes),
  commitGameState(context, previousObjective),

  outcomeForCompletion(context, events, options),
  resolveTargetUnable(context, events, options),
  outcomeForTargetEscape(context, events),
  outcomeForTargetRescue(context, events),
  outcomeForOwnerEscape(context, events),
  outcomeForOwnerDefeat(context, events),
  outcomeForMutualDefeat(context, events),

  renderThreat(context),
  renderPressure(context, commitmentBand),
  renderEvent(context, event),
  renderOutcome(context),
}
```

`unopposedActionId` is descriptive/event data for a target already unable to resist on encounter entry; it is not used to replace an NPC's stored intent during normal exchanges. `commitGameState` is where objective state becomes durable game state. Make it delta-based or otherwise idempotent.

## Adding or modifying an action

An action definition contains:

```js
{
  id,
  tags: Object.freeze([...]),
  durationSeconds,
  usableBy: "any" | "controlled" | "goal-owner",
  playerOrder,
  availabilityHint?,
  enumerateTargets(context, actorId),
  isAvailable(context, instance),
  label(context, instance),
  intentLabel(context, instance),
  resolve(context, instance, runtime),
}
```

To add one completely:

1. Implement it under `actions/` and return concrete serializable instances from `enumerateTargets`.
2. Put all range/facing/pose/support rules in `ACTION_GEOMETRY` and call `hasActionGeometry` from availability.
3. Register the definition in `ENCOUNTER_ACTIONS`.
4. Assign a player Combat rank in `COMBAT_ACTION_MINIMUM_RANK`, even if it is currently NPC-only.
5. Assign an effort profile in `ACTION_EFFORT_PROFILES`, or deliberately accept the default readiness 12 / maximum winded 2 / maximum dazed 2.
6. Assign a player action hygiene cost in `PLAYER_ACTION_HYGIENE_COST`; a missing entry throws when chosen by the player.
7. Ensure its tags place it in a player-facing purpose and correctly identify `impact`, `control`, `hold`, `escape`, `defense`, and objective progress behavior.
8. Add a generic `ACTION_UTILITY` profile or have the objective provide one. Without either, base and motives are zero.
9. Add generic event prose in `prose.js` or objective event prose where semantics are goal-specific.
10. Test enumeration, physical prerequisites, timing against faster/equal/slower actions, event output, deterministic rolls, simultaneous merge, skill progression, and terminal behavior.

`playerOrder` affects display order only. `durationSeconds` affects resolution priority, exchange time, guard/evasion activation, and AI speed cost. `usableBy` uses roles, not literal actor names. Do not mutate game money or other durable world state inside an isolated simultaneous branch; store objective state/events and commit it after the canonical merge.

When modifying an action, check all five tuning surfaces together: availability threshold, duration, success chance, effect magnitude, and effort/readiness. Improving several at once can compound sharply.

## Modifying NPC behavior

There are three supported levels of change:

1. Change one action's shared utility profile in `ai.js` to affect every goal that can use it.
2. Change `objective.ai` to alter stage priorities, progress, retreat permission, or an objective-only action.
3. Change or add a personality in `personality.js` to alter motive weights and commitment sensitivities across goals.

When adding a personality, add its immutable definition, ensure its ID appears through `AI_PERSONALITY_IDS`, update `selectAiPersonality` probability intervals, and test seeded selection plus save validation.

The saved `controller.policyId` is currently always `hostile`; the live selector is the shared scorer described above. Changing that string alone does not select a different algorithm. A genuinely new policy would need an explicit policy registry/dispatch in AI selection and corresponding validation.

Useful tuning diagnostics are `getAiCommitmentDiagnostics` and `getAiDecisionDiagnostics`. The latter reports every candidate's total and component breakdown, making it possible to see whether objective, pressure, safety, repetition, effort, or random variation caused a choice.

## Adding a scenario or changing presentation

A scenario owns configuration, initial participants/geometry, entry incapacitation handling, and outcome routing. Add it to `scenarios/index.js`. If its state shape is not the existing two-person fight shape, the central state validator and most role helpers must change as well.

Player-facing prose is event-driven. Action resolution should emit structured facts; `prose.js` handles shared facts and objectives handle goal-specific facts. This keeps rendering pure and save/load stable. New positional values or event types also need situation/outcome rendering and tests.

Choice sections are assigned by action tags in `availability.js`. Rank 0/1 broad labels and Rank 4 timing hints are also defined there.

## Structured events and prose

The resolver records facts first and renders prose from them afterward. Common event families are:

| Family | Events |
|---|---|
| Exchange | `encounter.started`, `action.attempted`, `action.failed`, `action.spoiled`, `encounter.ended` |
| Hidden rolls | `chance.rolled` with purpose, chance, roll, success, and optional diagnostic fields |
| Defense/recovery | `defense.braced`, `exertion.recovered`, `acute.applied`, `acute.eased` |
| Damage | `impact.landed` with actor, target, part, damage, and damage type |
| Holds | `hold.created`, `hold.weakened`, `hold.strengthened`, `hold.pinned`, `hold.downgraded`, `hold.broken`, `hold.priority-resolved` |
| Position | `range.changed`, `pose.changed`, `support.changed`, `facing.changed`, `state.change-conflicted` |
| Help/escape | `help.heard`, `escape.disengaged`, `escape.completed`, `participant.unable-to-act` |
| Theft | `theft.taken`, `theft.empty`, `theft.recovered`, `theft.completed`, `surrender.completed`, `demand.succeeded` |
| Beat-down | `beat-down.completed` |
| Consequences | `hygiene.lost`, `consequences.settled` |

Only the latest 24 are retained in encounter state. Diagnostic roll events are intentionally omitted from normal prose. When an action can fail for several reasons, keep the machine-readable reason specific; it is used by tests and can support better prose later.

## Debugging, combat lab, and tests

Open `tests/combat_inspector.html` through the development web server for the browser combat lab. It can:

- choose any registered objective with a `laboratoryConfig`;
- choose an authored encounter scene and temporary-actor profile/identity;
- set deterministic seed;
- tune player Strength, Endurance, Resolve, Fitness, and Combat from 0 to 500;
- tune attacker Strength, Endurance, Resolve, and Fitness;
- play the real rendered choice flow;
- inspect canonical state, bodies, capacities, readiness, action blockers, hidden rolls, AI score breakdowns, and invariant checks.

`getEncounterDebugSnapshot(game)` provides the same core diagnostics to other debug UI. The in-game debug action `encounter.teleport-player-to-alley` moves the player to an alleyway and resolves its enter-place trigger.

The simulation harness in `tools/encounter/simulationHarness.mjs` supports one deterministic run, stat-difference matrices, and state-space matrices. Current presets include baseline, wall-pinned, grounded/injured, mutual grips, complete player control, and beat-down baseline. Player policies include help, escape, fight, resist, brace, control, and surrender. Simulation uses actual Combat rank gating; configure the desired player Combat value when testing technical policies.

Run encounter tests from the repository root:

```powershell
node --test tests/encounter_*.test.mjs
```

At minimum, changes should preserve:

- strict state and objective validation;
- a legal player response and stored NPC intent in every active state;
- seeded replay across save/load;
- no illegal hold geometry after either sequential or simultaneous actions;
- objective-specific terminal precedence and idempotent game-state consequences;
- player fallbacks at low Combat ranks and exclusive helpless choices at low Energy/max pain.

## Source map

| Area | Source |
|---|---|
| Feature registration and time handlers | [`src/features/encounter/index.js`](../src/features/encounter/index.js) |
| WG adapter and rendered choices | [`src/features/encounter/system.js`](../src/features/encounter/system.js) |
| State schema and validation | [`src/features/encounter/state.js`](../src/features/encounter/state.js) |
| Fight creation and outcome routing | [`src/features/encounter/scenarios/fight.js`](../src/features/encounter/scenarios/fight.js) |
| Objective registry and implementations | [`src/features/encounter/objectives/`](../src/features/encounter/objectives/) |
| Action registry and implementations | [`src/features/encounter/actions/`](../src/features/encounter/actions/) |
| Availability, grouping, labels, rank filtering | [`src/features/encounter/availability.js`](../src/features/encounter/availability.js) |
| Combat skill tuning | [`src/features/encounter/combatSkill.js`](../src/features/encounter/combatSkill.js) |
| Geometry and control affordances | [`src/features/encounter/affordances.js`](../src/features/encounter/affordances.js) |
| Bodies, capacities, holds, incapacitation | [`src/features/encounter/combatants.js`](../src/features/encounter/combatants.js) |
| Effort and readiness | [`src/features/encounter/effort.js`](../src/features/encounter/effort.js) |
| Exchange resolution and priority | [`src/features/encounter/resolution.js`](../src/features/encounter/resolution.js) |
| AI scoring | [`src/features/encounter/ai.js`](../src/features/encounter/ai.js) |
| AI personalities | [`src/features/encounter/personality.js`](../src/features/encounter/personality.js) |
| Consequences and hygiene | [`src/features/encounter/consequences.js`](../src/features/encounter/consequences.js) |
| Pain/integrity recovery | [`src/features/encounter/pain.js`](../src/features/encounter/pain.js) and [`src/characters/core/body.js`](../src/characters/core/body.js) |
| Player-facing prose | [`src/features/encounter/prose.js`](../src/features/encounter/prose.js) |
| Debug snapshot | [`src/features/encounter/debug.js`](../src/features/encounter/debug.js) |
| Browser combat lab | [`tests/combat_inspector.html`](../tests/combat_inspector.html) and [`tests/combat_inspector.js`](../tests/combat_inspector.js) |
| Simulation harness | [`tools/encounter/simulationHarness.mjs`](../tools/encounter/simulationHarness.mjs) |
| Authored alley fight | [`story/encounters/alley.wg`](../story/encounters/alley.wg) |
