# WG scene-authoring reference

WG is Worldgame's text-first story format. Source files live under
`story/**/*.wg`. The compiler turns them into the generated data module at
`src/generated/wg/scenes.js`:

```text
node tools/wg/compile.mjs
node tools/wg/compile.mjs --check
```

The normal command updates the generated module only when its contents change.
`--check` writes nothing and fails if the committed generated module is missing
or out of date. Never edit the generated module by hand.

## Minimal authored event

An entry exposes a scene to the world. This example adds an event to the
current place's “Things to do” section:

```wg
@entry home.taylor-study
  @scene taylor.study.peek
  @place-key player_home
  @offer place
  @label "Study with Taylor"
  @icon 📚
  @hub-text "Taylor is sitting at the table with a textbook and a loose stack of notes."
  @when npc.taylor.present
  @when npc.taylor.available
@endentry

:: taylor.study.peek [event taylor study]
@kind event
@heading "Studying with Taylor"
@choices "What do you do?"

Taylor looks up from the textbook.

@choice leave "Leave Taylor to study" -> @exit
@endchoice
```

Files are UTF-8 and may contain any number of top-level entry and scene blocks.

## Entries

An entry starts with `@entry <id>` and ends with `@endentry`. Entry IDs use a
lowercase letter followed by lowercase letters, numbers, `_`, `-`, or `.`, and
must be unique across all WG files.

Every entry requires:

- exactly one `@scene <scene-id>` pointing to a compiled scene; and
- at least one exposure directive: `@hub`, `@offer`, or `@auto`.

### Place hubs

```wg
@entry hub.library
  @scene place.library
  @place-key library
  @hub place
@endentry

:: place.library [place library]
@kind place
@heading "Library"

Rows of bookshelves divide the quiet room.

@choice leave "Leave" -> @leave-place
  @time 1m
@endchoice
```

`@hub place` makes a `@kind place` scene the ordinary hub for every matching
place. It requires at least one `@place-key` or `@place-tag`, and a hub entry
cannot also contain `@offer` or `@auto`.

At runtime exactly one hub must match the current place. The compiler rejects
two hubs that explicitly name the same place key; overlapping tag-based hubs
are detected only when the place scene is built. A hub should therefore use
selectors and conditions that always leave one unambiguous match.

The generated place name replaces the authored `@heading` while a scene is
being used as a place hub. The hub still needs `@heading`, and its prose,
choice heading, conditional content, and authored choices are used normally.

### Offered entries

- `@offer place` adds the entry to the current place's “Things to do” section.
- `@offer npc <id>` adds the entry beside that NPC's ordinary interaction. The
  NPC must be at the player's exact indoor or outdoor position.
- Every offered entry requires `@label "..."`. `@icon` is optional and may be
  quoted or written directly.
- `@hub-text "..."` appends a paragraph to the ordinary place hub while an
  `@offer place` entry is eligible. It is not shown inside the event scene and
  has no effect on NPC offers or automatic entries.
- NPC presence does not imply availability. Add
  `@when npc.<id>.available` if the offer should disappear while an NPC is busy
  with, or cannot safely pause for the ordinary five-minute interaction before,
  an obligation.

Offers are pure queries. `@priority`, `@chance`, and `@weight` do not affect
them and rendering an offer consumes no randomness.

### Automatic entries

`@auto enter-place` checks the entry after the player enters a place.
`@auto enter-location` checks it after the player travels to an outdoor
location. Both triggers may be present on one entry.

Automatic entries do not interrupt an already active authored scene. Eligible
entries are resolved after travel or entry time has passed, so conditions see
the arrival clock and final NPC positions.

Selection works as follows:

1. Check priority groups from highest to lowest.
2. Roll each entry's independent chance within that group.
3. Select one surviving entry by relative weight.
4. Try the next lower priority only if no entry in the higher group survives.

`@priority` is a signed safe integer and defaults to `0`. `@chance` accepts a
decimal from `0` to `1` or a percentage from `0%` to `100%`, and defaults to
`100%`. `@weight` must be positive and defaults to `1`.

### Position selectors and conditions

Entries may repeat these selectors:

- `@place-key <key>`
- `@place-tag <tag>`
- `@location-tag <tag>`

Values within one selector kind are ORed. Different selector kinds are ANDed.
If a selector kind is absent it imposes no restriction. Place tags include
both the place's category and its explicit tags. A required place key or tag
cannot match while the player is outdoors.

Every repeated `@when <expression>` must pass. Conditions apply to hubs,
offers, and automatic entries before those entries are used.

## Scenes

A scene starts with a header and continues until the next top-level scene or
entry block:

```wg
:: taylor.study.peek [event taylor study]
@kind event
@heading "Taylor's room"
@choices "What do you do?"

Taylor looks up from the textbook.
```

- Scene IDs follow the same syntax as entry IDs and must be globally unique.
- Header tags are optional lowercase metadata using letters, numbers, `_`, and
  `-`. They are emitted into the compiled data but are not currently used by
  the runtime.
- `@kind` supports `event`, `place`, or `location` and defaults to `event`.
- `@heading "..."` is required.
- `@choices "..."` labels the authored choice section and defaults to
  `"Choices"`.
- `@kind`, `@heading`, `@choices`, and `@onenter` are optional scene metadata
  directives, except for the required heading. They must all appear before
  prose, conditionals, or choices, and each may appear at most once.

Only one authored choice section is produced. If the materialized scene has no
visible choices, that section is omitted.

## Prose and interpolation

Ordinary non-directive lines are prose. Blank lines separate paragraphs.
Consecutive lines inside one paragraph are trimmed and joined with a single
space. WG does not interpret HTML or other inline markup.

```wg
You have £{{player.money}}.
{{npc.taylor.subject|cap}} closes {{npc.taylor.dependent}} book.
```

An interpolation contains a dotted runtime path and may use the implemented
`|cap` filter. It must resolve to a string, number, or boolean. A missing,
`null`, list, or object value causes a runtime error rather than printing an
empty value.

Interpolation is implemented only in prose. Headings, choice labels, entry
labels, hub text, warnings, requirement reasons, and preview labels are literal
strings.

## Runtime values available to expressions and prose

The currently exposed paths are:

- `story.*`: authored story state created by WG effects.
- `player.health`, `player.mind`, `player.stress`, `player.energy`,
  `player.trauma`, `player.hygiene`, and `player.fear`: evaluated player stats.
- `player.subject`, `player.object`, `player.dependent`,
  `player.independent`, and `player.reflexive`: player pronouns.
- `player.gender`, `player.age`, `player.money`, and `player.temperature`. Temperature is one
  of `overheating`, `hot`, `warm`, `comfortable`, `cool`, `cold`, or `freezing`.
- `player.skills.strength`, `.perception`, `.endurance`, `.speech`,
  `.resolve`, and `.fitness`. Skill values retain their fractional progress
  from `0` through `10`.
- `npc.<id>.id`, `.name`, `.shortName`, `.age`, `.gender`, `.relationship`,
  `.present`, and `.available`.
- `npc.<id>` pronouns and every evaluated stat declared for that NPC, such as
  `npc.taylor.subject` or `npc.taylor.intelligence`.
- `npc.<id>.flags.<flag>` for that NPC's stored boolean flags.
- `npc.<id>.schedule.phase`, `.obligationId`, `.startsAt`,
  `.requiredArrivalAt`, `.earlyArrivalMinutes`, and `.minutesUntilStart`.
- `flags.<id>` for active game flags. Inactive flags are absent, so
  `not flags.some_flag` is the normal negative check.
- `daily.<id>` for active daily flags. Inactive flags are absent. Daily flags
  are saved normally and are cleared automatically when forward game time
  crosses UTC midnight.
- `time.hour`, `time.minute`, and `time.minutesSinceMidnight`, using the UTC
  world clock shown by the game.
- `location.id`, `location.name`, and `location.tags` for the containing
  location.
- `place.id`, `place.key`, `place.name`, and `place.tags` while indoors.
  `place` is `null` outdoors.

The player does not currently expose a name, inventory, body, clothing, or a
`player.flags` path to WG. A location does not expose its
district key or type.

NPC relationship scores are between `-1` and `1`. `npc.<id>.present` means the
NPC shares the player's exact position, and `.available` is the authoritative
five-minute interaction check. Schedule phases are `free`, `departing`,
`travelling`, `early`, or `active`; schedule timestamps are ISO strings or
`null`.

Expression path segments use letters, numbers, and `_`, and cannot start with
a number. IDs containing `-` can be used by directives such as `@effect flag`,
but cannot currently be read through a dotted expression path.

A missing expression path evaluates to `undefined`, which is false when used
directly as a condition. The compiler checks expression syntax but does not
verify that an authored runtime path exists.

## Expressions and conditionals

```wg
@if story.taylor.hurt >= 1
Taylor frowns.
@elseif npc.taylor.relationship >= 0.5
Taylor smiles.
@elseif "urban" in location.tags
Traffic murmurs outside.
@else
Taylor returns to the textbook.
@endif
```

`@if`, any number of `@elseif` branches, an optional `@else`, and `@endif`
form a conditional block. Blocks may be nested and may contain prose, choices,
or more conditions. The first truthy branch is materialized.

Expressions support:

- numbers, double-quoted strings, `true`, `false`, and `null`;
- dotted paths and list literals such as `["warm", "hot"]`;
- unary `not` and `-`;
- `+`, `-`, `*`, `/`, and `%` for finite numbers;
- `==`, `!=`, `<`, `<=`, `>`, and `>=`;
- `value in list`, where the right side evaluates to a list;
- `and`, `or`, and parentheses. `and` and `or` short-circuit.

Ordered comparisons require two numbers or two strings. Arithmetic on missing
or non-numeric values is a runtime error. Authored expressions compile to data
and never execute JavaScript.

## Choices

```wg
@choice mess "Mess with Taylor" -> taylor.study.mess
  @icon 😈
  @time 5m
  @when npc.taylor.present
  @require player.energy >= 10 "You are too tired."
  @warning "This may annoy Taylor."
  @preview relationship -0.02 "-Relationship"
  @effect relationship taylor -0.02
@endchoice
```

A direct choice header has the form
`@choice <id> "<label>" -> <target>` and ends with `@endchoice`. Choice IDs
must be unique throughout their scene, including mutually exclusive
conditional branches. A choice block may contain only choice directives; put
prose and conditionals outside it.

The target may be:

- another compiled scene ID;
- `@exit`, which closes the authored scene and returns to the current place hub
  indoors or the ordinary location scene outdoors; or
- `@leave-place`, which performs the authoritative place-exit action and
  closes the authored scene. It fails if the player is already outdoors.

`@leave-place` does not add a duration. Add `@time 1m` when leaving should take
the game's normal one-minute transition.

Choice directives are:

- `@icon <value>`: optional quoted or unquoted display icon.
- `@time <duration>`: action duration; omitted means zero time. Durations may
  combine decimal hours, minutes, and seconds in that order, such as `30s`,
  `5m`, `1h`, or `1h30m`.
- `@when <expression>`: hides the choice when false.
- `@require <expression> "<reason>"`: leaves the choice visible but disabled
  when false. Requirements may repeat; the first failed reason is displayed.
- `@warning "<text>"`: optional display-only warning.
- `@preview <type> <signed-number> "<label>"`: repeatable display-only effect
  preview. A preview never applies or validates a real effect.
- `@effect ...`: repeatable authoritative effect, described below.

Before an action runs, the game rebuilds the current scene and rechecks that
the choice still exists and is enabled. Direct-choice effects run in their
authored order, then a normal target scene is entered and its `@onenter`
effects run, then `@time` advances the world. The resulting scene is rendered
against the post-time state. If any part of the action fails, its state changes
and log entry are rolled back.

A choice with no `@time`, or with a zero duration such as `0m`, does not advance
the clock or update NPC simulation state.

## Skill changes and checks

A direct skill effect changes a registered fractional `0` through `10` skill:

```wg
@choice lift-weights "Lift weights" -> place.player-home
  @time 5m
  @effect skill strength 0.1
@endchoice
```

The runtime clamps the result to the skill's range. A direct positive change
automatically displays green `+Strength`; a negative change displays red
`-Strength`. The exact amount is never included in the display metadata.

A checked choice omits the arrow from its choice header and supplies a skill,
difficulty, and two outcome blocks:

```wg
@choice open-jar "Open a stubborn jar"
  @check strength tricky

  @success -> home.jar-opened
    @time 1m
    @effect flag jar_opened true
  @endsuccess

  @failure -> home.jar-stuck
    @time 2m
    @effect stat stress 2
  @endfailure
@endchoice
```

The player sees only the choice label and orange `Strength: Tricky`. The UI
does not display a probability, roll, selected outcome, branch duration, or
sanitized preview of branch effects. Checked choices cannot use choice-level
`@time`, `@effect`, or `@preview`; put time and effects inside each outcome.
Both outcomes are required and may target another scene, `@exit`, or
`@leave-place`.

Implemented difficulty IDs are:

- `trivial`: exactly 100% success.
- `easy`
- `tricky`
- `difficult`
- `near-impossible`: displayed as `Impossible?`.
- `impossible`: exactly 0% success.

For rolled difficulties, the engine floors the skill before calculating the
chance. Thus `2.05` and `2.99` both check as level `2`. Chance rises smoothly
with skill using the centralized logistic difficulty curve; the author does
not specify percentages. Even level `10` has a failure chance on
`near-impossible`.

Checks are resolved only after the choice is authoritatively rebuilt. Their
keyed roll uses the game seed, successful-action revision, current scene
instance, and choice ID. Saving and reloading the same scene therefore keeps
the same result, while completing another action or re-entering the scene
changes the roll key. Rendering never rolls or advances that revision.

After a result is selected, that branch's effects and target transition run,
then its time advances. The complete branch remains part of the normal atomic
action transaction.

## Effects

Effects may appear inside direct choices, skill-check outcomes, or a scene's
`@onenter` block:

```wg
@onenter
  @effect set story.daily.taylorStudyCompany true
  @effect add story.daily.studyCount 1
@endonenter
```

`@onenter` runs once each time that scene is authoritatively entered. It does
not run while the scene is merely rendered or rebuilt. Entering the same scene
again, including through a self-targeting choice, runs it again. The block may
contain only `@effect` directives, comments, and blank lines.

Implemented effects are:

```wg
@effect set story.some.path true
@effect set story.some.snapshot player.energy
@effect add story.some.counter 1
@effect flag met-taylor true
@effect flag home_access_taylor false
@effect daily-flag home_weightlifting true
@effect daily-flag home_weightlifting false
@effect relationship taylor 0.02
@effect relationship taylor -0.02
@effect money 25
@effect money -5
@effect skill strength 0.1
@effect skill strength -0.05
@effect stat energy -5
```

- `set` and `add` target only `story.*`. Their values are expressions, and
  missing intermediate story objects are created automatically. `add` treats a
  missing final value as zero and requires both values to be finite numbers.
- `flag <id> true|false` enables or removes a game flag.
- `daily-flag <id> true|false` enables or removes a daily flag. All daily flags
  are cleared together when forward game time crosses UTC midnight. Use
  `not daily.<id>` to gate a once-per-day choice.
- `relationship <npc-id> <signed-number>` changes that NPC relationship and
  fails at runtime if the NPC does not exist.
- `money <signed-number>` adjusts `player.money`; positive values earn money
  and negative values spend it.
- `skill <skill-id> <signed-number>` adjusts and clamps a registered player
  skill while preserving fractional progress.
- `stat <stat-id> <signed-number>` adjusts and clamps a registered player's
  base stat.

Effects run sequentially, so a later effect can read state changed by an
earlier effect. Warnings, previews, requirements, and time costs do not create
implicit effects or resource costs.

NPC residences use `home_access_<npc-id>`. Setting, for example,
`home_access_taylor` to `true` grants access to Taylor's home and setting it to
`false` revokes access. The residence remains visible as a disabled place
choice while permission is absent.

## Comments and escaping

```wg
@# This whole line is ignored.
\@if this is prose, not a directive
\:: this is also prose
```

`@#` is a full-line comment, not an inline comment. At the beginning of a
prose line, `\@` and `\::` emit literal `@` and `::` markers.

## Validation and editor support

The compiler rejects malformed directives, duplicate single-value fields,
unclosed blocks, duplicate scene, entry, or choice IDs, invalid expressions
and durations, unknown choice and outcome targets, unknown skill-check
difficulties, unknown registered skill/stat effect IDs, missing entry targets,
and direct duplicate place hubs. It does not validate general runtime paths,
NPC IDs, or overlapping tag-based hub selectors.

The repository includes a zero-build VS Code extension with WG syntax
highlighting, comments, indentation, bracket pairing, and folding. Install or
update it from the repository root with:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\vscode-wg\install.ps1
```

Reload open VS Code windows afterward. See `tools/vscode-wg/README.md` for the
same installation notes.

## Not supported by WG

WG currently has no arbitrary JavaScript, Twine widgets, HTML rendering,
loops, includes, user-defined macros, authored random blocks, localization,
automatic resource costs, undo/history, or hot reloading.
