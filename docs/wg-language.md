# WG story-authoring reference

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

Files are UTF-8 and may contain any number of top-level entry, scene, and
sequence blocks.

## Core syntax and identifiers

WG is line-oriented. Leading and trailing whitespace does not change how a
directive is recognized, so indentation is for readability. A directive must
occupy its own logical line unless its documented syntax includes arguments.

- Story, scene, sequence, entry, choice, and choice-group IDs start with a
  lowercase letter and may then contain lowercase letters, numbers, `_`, `-`,
  or `.`.
- Passage IDs and scene tags use the same rules but do not allow `.`. A local
  passage is declared as `@passage result` and targeted as `.result`.
- Expression paths contain one or more segments. Every segment starts with a
  letter or `_` and then uses letters, numbers, or `_`. Interpolation and
  `@time-until` specifically require a dotted path with at least two segments.
- Quoted directive fields are non-empty JSON-style double-quoted strings.
  Normal JSON escapes such as `\"` and `\\` are supported. Expression string
  literals use the same escaping but may be empty. Single-quoted strings are
  not supported.
- `@icon` accepts either a quoted string or the non-empty remainder of its line,
  which makes a bare emoji convenient.

Only blank lines, comments, and top-level `@entry`, `@sequence`, or `::` scene
declarations may appear outside a block. Entries and sequences have explicit
closing directives. A scene ends at the next top-level declaration or at the
end of its file. Source files and emitted object keys are sorted
deterministically, so compiling unchanged sources produces an unchanged
module.

## Entries

An entry starts with `@entry <id>` and ends with `@endentry`. Entry IDs use a
lowercase letter followed by lowercase letters, numbers, `_`, `-`, or `.`, and
must be unique across all WG files.

Every entry requires:

- exactly one `@scene <story-id>` pointing to a compiled scene or sequence; and
- at least one exposure directive: `@hub`, `@offer`, `@auto`, or `@pool`.

The following entry fields may appear once: `@scene`, `@hub`, `@offer`,
`@label`, `@icon`, `@hub-text`, `@priority`, `@chance`, and `@weight`.
`@place-key`, `@place-tag`, `@location-tag`, `@when`, and `@pool` may repeat.
`@auto` may repeat once per distinct trigger. An offered entry may also be
automatic or pooled; only `@hub` is exclusive with the other exposure types.

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
cannot also contain `@offer`, `@auto`, or `@pool`.

Place hubs must target scenes rather than sequences. Offered, automatic, and
pooled entries may target either kind of authored story block.

At runtime exactly one hub must match the current place. The compiler rejects
two hubs that explicitly name the same place key; overlapping tag-based hubs
are detected only when the place scene is built. A hub should therefore use
selectors and conditions that always leave one unambiguous match.

The generated place name replaces any authored `@heading` while a scene is
being used as a place hub. Its prose, choice heading, conditional content, and
authored choices are used normally.

### Offered entries

- `@offer place` adds the entry to the current place's “Things to do” section.
- `@offer npc <id>` adds an authored interaction for that NPC. The
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

Automatic resolution uses the saved `wg-events` random stream. Chance rolls
and the weighted pick therefore advance that stream only when automatic
candidates are actually resolved. A selected target is authoritatively entered
and runs its `@onenter` effects.

### Event-pool entries

`@pool <id>` registers an entry as a candidate in a named event pool. A choice
invokes that pool with `@event-pool <id>` and may set the overall trigger
frequency with `@event-chance`. Pool IDs are validated across the whole WG
project and an entry may belong to more than one pool.

When a pool is invoked, position selectors and every `@when` condition first
filter its members. Only entries at the highest remaining `@priority` are
considered, and one is selected by relative `@weight`. The entry-level
`@chance` belongs to automatic-entry resolution and is ignored by pool
selection; `@event-chance` controls whether the pool triggers at all. This
keeps the overall event frequency stable as more members are added.

A selected event temporarily suspends the choice's ordinary target. The event
may be a scene or sequence and can navigate normally. Target `@return` to
resume the suspended target. Targeting `@exit` instead abandons all suspended
continuations and returns to the world hub. The continuation stack, selected
event, and inherited school arrival snapshot are saved, so save/load cannot
reroll or lose an interrupted class.

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
offers, automatic entries, and pool entries before those entries are used.

### Locked generated places

A place definition with `unlocked: false` is still created during world
generation and remains available to NPC simulation, but is completely hidden
from the player. It is omitted from local and world maps, place-entry choices,
bus destinations, player schedule destinations, and GPS targets. The player
cannot be loaded into it or enter it through a direct runtime call.

WG hubs and place offers for a locked place remain compiled but dormant because
the player cannot enter or select that place. An `@auto enter-place` entry can
therefore trigger only after the place has been unlocked. Runtime code can call
`game.unlockPlacesByKey("place_key")` to unlock every generated instance with
that key. Unlocking is saved and irreversible: an unlocked instance never
returns to the locked state.

WG does not yet expose `place.unlocked` or implement an unlock effect/directive.
Until `@unlock` is added, unlocking must be initiated by game code outside WG.

## Scenes

A scene starts with a header and continues until the next top-level scene,
entry, or sequence declaration:

```wg
:: taylor.study.peek [event taylor study]
@kind event
@heading "Taylor's room"
@choices "What do you do?"

Taylor looks up from the textbook.
```

- Scene IDs follow the same syntax as entry IDs and must be globally unique.
- Header tags are optional lowercase metadata using letters, numbers, `_`, and
  `-`. Duplicate tags on one header are collapsed. Tags are emitted into the
  compiled data but are not currently used by the runtime.
- `@kind` supports `event`, `place`, or `location` and defaults to `event`.
- `@heading "..."` optionally sets the page heading. If it is omitted, the
  scene renders without an `<h1>` heading.
- `@choices "..."` labels the default section for ungrouped choices and
  defaults to `"Choices"`.
- `@kind`, `@heading`, `@choices`, and `@onenter` are optional scene metadata
  directives. They must all appear before prose, conditionals, or choices, and
  each may appear at most once.

WG materialization does not create map data: authored scenes of any kind have
`map: null`. The ordinary generated outdoor location screen still supplies the
interactive map. A `place` kind has additional hub behavior only when selected
by a matching `@hub place` entry.

### Choice groups

Use a choice group when one screen needs multiple choice headings:

```wg
@choicegroup rooms "Rooms"
@choice cafeteria "Go to the cafeteria" -> place.high-school
@endchoice
@choice gym "Go to the school gym" -> place.high-school
@endchoice
@endchoicegroup

@choicegroup current "Current Activities"
@if school.phase == "class"
Class is currently in progress.
@choice attend "Attend class" -> place.high-school
@endchoice
@endif
@endchoicegroup
```

A group begins with `@choicegroup <id> "<heading>"` and ends with
`@endchoicegroup`. Group IDs must be unique within a scene or sequence
passage. Groups cannot be nested, and each group must contain at least one
authored choice somewhere in its direct, conditional, or random content.

Choices inside the block render under that group's heading. Prose still joins
the scene's ordinary paragraphs, so a group may wrap conditionals containing
both descriptive text and choices. A group with no visible choices at runtime
is omitted. Choices outside every group continue to render in the default
`@choices` section. Sections preserve the source order in which their first
visible choice appears.

For hub activities, do not hide the general group merely because a scheduled
activity is currently happening. Keep the hub group unconditional and make
the scheduled choice target a scene or sequence. While that target is active,
its screen replaces the hub automatically; returning through `@exit` restores
the hub and its general choices.

## Sequences and passages

A sequence groups several rendered screens under one global story ID. Use it
when prose should be paced behind one or more zero-time Next buttons without
creating a separate scene and choice for every screen:

```wg
@choice inspect "Inspect the room" -> example.inspection
  @icon 👀
  @time 5m
@endchoice

@sequence example.inspection -> @exit
@heading "Inspecting the room"

You look over the room carefully.

@next

Nothing else catches your attention.

@next "Return"
@endsequence
```

A sequence starts with `@sequence <id> -> <final-target>` and ends with
`@endsequence`. Its ID shares the global namespace used by scene IDs. The
final target may be `@exit`, `@return`, a scene ID, or another sequence ID.
`@return` is valid at runtime only while a pooled event continuation is
active. `@heading`, `@kind`, `@choices`, and `@onenter` are optional and have
the same metadata placement rules and defaults as scenes. `@school-class` and
`@system` are the additional sequence metadata directives. Choice groups work
inside authored sequence passages as they do in ordinary scenes.

Every authored sequence must contain at least one non-empty passage. Prose before the
first `@passage` or between `@next` directives creates anonymous passages named
`p1`, `p2`, and so on, skipping any ID already explicitly declared. Those
generated names may be targeted just like named passages, but explicit names
are less fragile when source order may change.

Each `@next` ends the current passage and creates a navigation choice. Prose
after it begins the next anonymous passage. A bare `@next` uses the label
`"Next"` and targets the following passage. The last bare `@next` uses the
sequence's final target. A quoted label changes only the displayed text:

```wg
@next "Wake up"
```

Next navigation never advances time, adds an action-log entry, or runs
`@onenter` on either the current sequence or a global target it enters. It is
an atomic zero-time transition: entering its target resolves that passage's
prose effects and passive checks and advances the gameplay action revision.
Use an ordinary choice when the transition itself needs authored choice
effects or a duration.
The active authored sequence and passage, or a runtime system's JSON state,
are included in save data, so loading resumes on the same screen.

### Runtime story systems

Use `@system <system-id> [config]` to delegate a whole sequence to a registered
JavaScript story system. The optional config is a JSON object emitted into the
WG bundle as ordinary data:

```wg
@sequence school.math.event.surprise-quiz -> @return
@heading "Surprise Math Quiz"
@choices "Choose an answer"
@system school.quiz {"bank":"math.core","questions":3}
@endsequence
```

System-backed sequences cannot contain authored passages or use
`@school-class`. Their registered system creates serializable instance state
once on entry, renders ordinary scene and choice contracts from that state,
and handles JSON command objects from its choices. Rendering must be pure:
random selection belongs in system creation so repeated renders and save/load
cannot reroll active content. Completing the system follows the sequence's
declared final target, including pooled-event `@return` continuations.

WG stores only the system ID, config, and current JSON state. JavaScript
callbacks remain in the runtime registry and are never emitted into generated
story data or save files.

### Named passages and local targets

Use `@passage <id>` when a choice or Next button must address a passage. Passage
IDs are lowercase local identifiers and need to be unique only within their
sequence; unlike global IDs, they cannot contain dots. Prefix one with `.` when
targeting it:

```wg
@sequence taylor.study -> @exit
@heading "Studying with Taylor"
@choices "What do you do?"

@passage peek

Taylor remains focused on the textbook.

@choice study "Return to studying" -> .studying
  @time 1h
@endchoice

@choice leave "Give up" -> @exit
@endchoice

@passage studying

You return your attention to your notes.

@next -> .peek
@endsequence
```

`@next -> <target>` and `@next "<label>" -> <target>` override the normal
source-order target. They may point to a local passage, `@exit`, `@return`, a
scene, or a sequence. `@next` cannot perform `@leave-place`; use an ordinary
choice for an authoritative place exit.

Ordinary choices inside passages keep their normal effects, duration, skill
checks, requirements, and atomic rollback behavior. Choice IDs must be unique
within their passage. Local `.passage` targets are invalid in ordinary scenes.

### School class sequences

Use `@school-class <subject-id>` on a sequence to make its initial passage
follow the active school timetable segment:

```wg
@sequence school.class.english -> @exit
@school-class english
@heading "English Class"

@passage segment-1
The first segment begins.

@passage segment-2
The second segment is underway.

@passage segment-3
The final segment is underway.
@endsequence
```

School class passages must be named consecutively in source order, starting
with `segment-1`. Entry is allowed only while the player is at school during a
class for the declared subject. The runtime opens the passage matching
`school.segment`; for a 45-minute, three-segment class, arrival at 0–14 minutes
late opens `segment-1`, 15–29 opens `segment-2`, and 30–44 opens `segment-3`.
Ordinary local passage transitions continue from there, and
`@time-until school.nextBoundaryAt` advances exactly to the next segment or
the end of class.

Entry also records an immutable arrival snapshot on the active story frame.
It is available to class prose and expressions as `school.arrival.*`, survives
local passage transitions, pooled event interruptions, and save/load, and is
cleared when the sequence ends. This is intended as the input for later
lateness penalties or detention rules; those consequences are not applied
automatically.

## Prose and interpolation

Ordinary non-directive lines are prose. Blank lines separate paragraphs.
Consecutive lines inside one paragraph are trimmed and joined with a single
space. HTML stays literal and is never executed. Passage prose and response
paragraphs support these outcome-colour markers:

```wg
[good]A very good result.[/good]
[ok]Things are under control.[/ok]
[warning]This may become a problem.[/warning]
[bad]The outcome is bad.[/bad]
[dire]The situation is dire.[/dire]
```

`[good]` is the short form of `[very-good]`. Markers are not nested. Missing
or mismatched closing markers remain visible as ordinary text, which makes
authoring mistakes obvious instead of swallowing prose.

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
- `player.education.<subject-id>.grade` and `.attendedSegments` for each
  registered school subject: `english`, `math`, `history`, `science`, `art`,
  and `physical_education`.
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
- `time.iso`, `time.hour`, `time.minute`, and
  `time.minutesSinceMidnight`, using the UTC world clock shown by the game.
- `school.isSchoolDay`, `.noSchoolReason`, `.atSchool`, `.phase`,
  `.periodId`, `.periodLabel`, `.subjectId`, `.currentClass`, `.nextClass`,
  `.nextClassPeriodId`, `.nextClassLabel`, `.nextClassStartsAt`,
  `.nextClassEndsAt`, `.minutesUntilNextClass`, `.segment`,
  `.segmentCount`, `.periodStartsAt`, `.periodEndsAt`, `.minutesIntoPeriod`,
  `.nextBoundaryAt`, `.minutesUntilNextBoundary`, and `.closesAt`. Timestamps
  are ISO strings or `null`.
  `currentClass` is the active class's subject ID or `null`; `nextClass` is
  the next class that starts later on the current school day, or `null`.
- During an active `@school-class` sequence: `school.arrival.periodId`,
  `.subjectId`, `.scheduledAt`, `.arrivedAt`, `.minutesLate`, and
  `.startingSegment`. These remain available inside an interrupting pooled
  event.
- During an active pooled event: `event.poolId`, `event.entryId`,
  `event.source.storyId`, `.passageId`, and `.choiceId`. `event` is `null`
  outside a pooled event.
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

School phases are `closed`, `no_school`, `before_school`, `class`,
`break`, `lunch`, or `after_school`. The timetable stored on the high
school place definition determines periods and segment boundaries; WG scenes
use these semantic values rather than comparing clock strings themselves.

Expression path segments use letters, numbers, and `_`, and cannot start with
a number. IDs containing `-` can be used by directives such as `@effect flag`,
but cannot currently be read through a dotted expression path.

A missing expression path evaluates to `undefined`, which is false when used
directly as a condition. The compiler checks expression syntax but does not
verify that an authored runtime path exists.

Condition truthiness follows JavaScript boolean conversion: `false`, `0`, an
empty string, `null`, and a missing value are false; other finite numbers,
non-empty strings, lists, and objects are true.

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
effects, passive checks, or more conditions. When an event scene or sequence
passage is entered, its selected structural branches are saved for that story
instance. This ensures an effect cannot change the condition that selected its
own prose. Persistent place hubs remain live and read-only, so their
conditionals are evaluated on every materialization.

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

Numbers use decimal notation without exponents; a negative value is parsed as
unary `-` applied to a positive number. Lists may contain any expression and
may be nested, but cannot end in a trailing comma. `==` and `!=` use strict
type-sensitive equality. `in` requires a list on the right and uses the same
strict equality for membership. An ordered comparison involving `null` or a
missing value is false. Division or remainder by zero fails because WG never
permits a non-finite numeric result.

From highest to lowest, operator precedence is: unary `not`/`-`; `*`, `/`,
`%`; `+`, `-`; `in` and ordered comparisons; `==`, `!=`; `and`; `or`.
Binary operators at the same level are left-associative. Parentheses override
that order. Logical operators always return booleans rather than one of their
operands.

## Random scene blocks

```wg
This text is always shown.

@random
This is the first possible passage.
@or
This is the second possible passage.
@or
This is the third possible passage.
@endrandom
```

`@random` chooses exactly one alternative, with alternatives separated by
`@or` and the block closed by `@endrandom`. A block requires at least two
non-empty alternatives. Alternatives may contain prose, choices, effects,
passive checks, conditionals, choice groups, or nested random blocks. Random
blocks may likewise appear inside `@if` branches.

Selection is deterministic for an entered story instance and the selected
alternative is recorded in the active story save frame. Rebuilding, saving,
or loading therefore keeps the same alternative. Entering another scene or
passage creates a new story instance and may choose differently. Selection
never consumes a mutable random stream.

## Prose effects, visible changes, and passive checks

Entered event scenes and sequence passages resolve their structural content
exactly once. Resolution happens after the incoming action's time has advanced
and before the screen is rendered. Active `@effect` and `@change` directives
run in authored order; a later condition or passive check observes state
changed by an earlier directive. The selected conditional, random, and check
branches are stored with `currentStory`, so rendering and authoritative choice
revalidation are read-only.

Use `@effect` for a silent prose mutation and `@change` when the player should
also see a coloured result beside the prose:

```wg
@random
The lesson goes poorly—you leave more confused than before.
@change grade english -1
@or
The lesson goes well—you learn a lot!
@change grade english 1
@or
You get through the work normally.
@endrandom
```

`@change` accepts `relationship`, `money`, `skill`, `stat`, `grade`, and
`attendance` operations. It derives labels such as `-English grade` from the
registered data. Add an optional quoted label to override that text:

```wg
@change relationship taylor 0.02 "+Taylor relationship"
```

Directives must occupy their own lines. A body-level `@preview` is invalid:
previews describe an uncommitted choice, while a prose change has already been
committed.

A body-level `@check` opens a passive, targetless skill check:

```wg
@check skill resolve tricky
@success
You manage to focus and follow the explanation.
@change grade english 1
@failure
Most of the explanation goes over your head.
@change grade english -1
@endcheck
```

Both branches are required and may contain any normal body content, including
nested conditions, random blocks, effects, and passive checks. A check target
is written as `skill <skill-id>` or `grade <subject-id>`, followed by the
difficulty. Both use the same difficulty curve and hidden keyed roll. The
result is saved for the story instance and is never rerolled by rendering or
loading.

Persistent `@kind place` hubs cannot contain prose effects or passive checks,
because they are live views rather than entered story instances. Put such an
outcome in a targeted event scene or sequence passage instead.

## Choices

```wg
@choice mess "Mess with Taylor" -> taylor.study.mess
  @icon 😈
  @time 5m
  @when npc.taylor.present
  @response
    Taylor gives you an unimpressed look.
  @endresponse
  @require player.energy >= 10 "You are too tired."
  @warning "This may annoy Taylor."
  @preview relationship -0.02 "-Relationship"
  @effect relationship taylor -0.02
@endchoice
```

A direct choice header has the form
`@choice <id> "<label>" -> <target>` and ends with `@endchoice`. Choice IDs
must be unique throughout their scene or current sequence passage, including
mutually exclusive conditional branches. A choice block may contain only
choice directives; put prose and conditionals outside it.

The target may be:

- another compiled scene or sequence ID;
- a local `.passage-id` while authoring inside a sequence;
- `@return`, which resumes the target suspended by a pooled event and fails if
  there is no active continuation;
- `@exit`, which closes the authored story and returns to the current place hub
  indoors or the ordinary location scene outdoors; or
- `@leave-place`, which performs the authoritative place-exit action and
  closes the authored story. It fails if the player is already outdoors.

`@leave-place` does not add a duration. Add `@time 1m` when leaving should take
the game's normal one-minute transition.

Choice directives are:

- `@icon <value>`: optional quoted or unquoted display icon.
- `@time <duration>`: action duration; omitted means zero time. Durations may
  combine non-negative decimal hours, minutes, and seconds in that order, with
  no spaces, such as `30s`, `5m`, `0.5h`, or `1h30m`. Each unit may appear at
  most once. Use `0m` for an explicit zero duration; bare `0` is invalid.
- `@time <duration> free`: advances the full world simulation for the given
  duration but suppresses the player's passive elapsed-time energy drain for
  this action. It is valid in direct choices and skill-check outcomes. Explicit
  effects such as `@effect stat energy -10` still apply.
  NPC simulation, the calendar and weather, age synchronization, midnight
  daily-flag clearing, listeners, and action logging are unchanged.
- `@time-until <runtime.path>`: calculates the duration from `time.iso` to
  a future ISO timestamp at materialization time. It is useful for waiting for
  the next class or closing time. It is valid only on direct choices, cannot
  be combined with `@time`, and fails if the path is missing, invalid, or not
  in the future.
- `@enter-after-time`: delays entry into the choice target until after its
  `@time` or `@time-until` duration has elapsed. It requires a positive direct
  choice duration and cannot target `@leave-place`. Choice effects still apply
  before time advances. Use this when the target is valid only in the resulting
  world state, such as waiting in a classroom until its scheduled class begins.
- `@event-pool <id>`: after the choice's effects, try to enter one eligible
  member of the named pool while suspending the ordinary choice target.
  It is valid on direct and checked choices, but not when a direct target or
  either checked outcome is `@leave-place`.
- `@event-chance <probability>`: optional overall trigger chance for
  `@event-pool`, written from `0` to `1` or `0%` to `100%`; it defaults to
  `100%`. If the roll fails or the pool has no eligible members, the ordinary
  target is entered immediately.
- `@when <expression>`: hides the choice when false.
- `@require <expression> "<reason>"`: leaves the choice visible but disabled
  when false. Requirements may repeat; the first failed reason is displayed.
- `@warning "<text>"`: optional display-only warning.
- `@response ... @endresponse`: prose shown before the target scene's normal
  paragraphs on the immediate post-action render. The block may contain one or
  more prose paragraphs and supports normal `{{interpolation}}`. Repeat the
  block to author variants; the game deterministically picks one at random when
  the action succeeds. Responses are presentation-only and are not stored in
  flags or save data, so a later render does not show them again. Interpolation
  is evaluated against the completed post-effect, post-transition, and
  post-time state.
- `@preview <type> <signed-number> "<label>"`: repeatable display-only effect
  preview. A preview never applies or validates a real effect.
- `@effect ...`: repeatable authoritative effect, described below.
- `@change ... ["<label>"]`: an authoritative effect with a derived or custom
  preview. It is valid in direct choices for the same player-facing operations
  supported by prose changes.

Before an action runs, the game rebuilds the current scene and rechecks that
the choice still exists and is enabled. Direct-choice effects run in their
authored order, then an event pool is resolved when present. A selected event
is entered in place of the normal target and that target becomes its saved
continuation; otherwise the normal target is entered. The entered target's
`@onenter` effects run, then `@time` advances the world. The resulting screen
is rendered against the post-time state. If any part of the action fails, its
state changes and log entry are rolled back.

With `@enter-after-time`, the effects run first, time advances second, and the
pool or ordinary target and its `@onenter` effects run third.

A scheduled classroom wait therefore looks like:

```wg
@choice wait-for-class "Wait for class" -> school.class.english
  @time-until school.nextClassStartsAt
  @enter-after-time
  @when school.phase != "class" and school.nextClass == "english"
@endchoice
```

A choice with no `@time`, or with a zero duration such as `0m`, does not advance
the clock or update NPC simulation state.

For example, an eight-hour rest that restores energy without losing passive
energy during those same hours can use:

```wg
@choice rest "Rest" -> place.player-home
  @time 8h free
  @effect stat energy 75
@endchoice
```

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

A checked choice omits the arrow from its choice header and supplies a target,
difficulty, and two outcome blocks:

```wg
@choice open-jar "Open a stubborn jar"
  @check skill strength tricky

  @success -> home.jar-opened
    @time 1m
    @response
      The lid pops open.
    @endresponse
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
`@time`, `@response`, `@effect`, `@change`, or `@preview`; put time,
responses, and silent effects inside each outcome.
They may still use one `@icon`, `@when`, `@warning`, and `@check`, plus repeated
`@require` directives. Both outcomes are required and may target another scene
or sequence, a local passage when inside a sequence, `@exit`, or
`@leave-place`.

To check a school grade instead, use syntax such as
`@check grade english difficult`. The UI displays `English Grade: Difficult`.
Grades are normalized from their `0`–`100` range to the same `0`–`10` check
level used by skills.

Each `@success` or `@failure` block may contain at most one `@time`, including
the optional `free` suffix, and any number of `@response` and `@effect`
directives. It cannot contain `@time-until`, conditions, requirements,
warnings, previews, icons, nested checks, or ordinary prose outside a response
block.

Implemented difficulty IDs are:

- `trivial`: exactly 100% success.
- `easy`
- `tricky`
- `difficult`
- `near-impossible`: displayed as `Impossible?`.
- `impossible`: exactly 0% success.

For rolled difficulties, the engine floors the normalized check level before
calculating the chance. Thus skill values `2.05` and `2.99` both check as level
`2`, while English grades `20.5` and `29.9` both do the same. Chance rises
smoothly with the target value using the centralized logistic difficulty
curve; the author does not specify percentages. Even level `10` has a failure
chance on `near-impossible`.

Checks are resolved only after the choice is authoritatively rebuilt. Their
keyed roll uses the game seed, successful-action revision, current scene
instance, and choice ID. Saving and reloading the same scene therefore keeps
the same result, while completing another action or re-entering the scene
changes the roll key. Rendering never rolls or advances that revision.

After a result is selected, that branch's effects and target transition run,
then its time advances. The complete branch remains part of the normal atomic
action transaction.

## Effects

Effects may appear inside direct choices, skill-check outcomes, a scene or
sequence `@onenter` block, or the body of an entered event scene or sequence
passage:

```wg
@onenter
  @effect set story.daily.taylorStudyCompany true
  @effect add story.daily.studyCount 1
@endonenter
```

`@onenter` runs once each time that scene or sequence is authoritatively
entered. It does not run while a screen is merely rendered or rebuilt. Moving
between passages in the same sequence does not run it again. Entering the same
story target again through an ordinary choice does. The block may contain only
`@effect` directives, comments, and blank lines.

Body effects instead run during one-time post-time prose resolution. Moving to
a new passage resolves that passage and can run its body effects without
rerunning the sequence's `@onenter`. Use `@change` rather than `@effect` when
the mutation should create visible result feedback.

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
@effect grade english 1
@effect attendance english 1
```

- `set` and `add` target only `story.*`. Their values are expressions, and
  missing intermediate story objects are created automatically. `add` treats a
  missing or `null` final value as zero and requires both values to be finite
  numbers. Neither operation can write through an existing scalar or list used
  as an intermediate path segment.
- `flag <id> true|false` enables or removes a game flag.
- `daily-flag <id> true|false` enables or removes a daily flag. All daily flags
  are cleared together when forward game time crosses UTC midnight. Use
  `not daily.<id>` to gate a once-per-day choice.
- The ordinary flags `announcement_vega_station` and
  `announcement_school_project_last_day` feed the day-start announcement
  registry. When set as midnight is crossed, their registered text joins all
  automatic announcements at the top of the destination passage. The visible
  batch is dismissed by the next successful action, including `@next`, but its
  source flags remain set until an authored effect unsets them. This makes a
  reminder repeat on later days unless the story explicitly cancels it.
- `relationship <npc-id> <signed-number>` changes and clamps that NPC
  relationship to `-1` through `1`, marks the relationship as met, and fails at
  runtime if the NPC does not exist.
- `money <signed-number>` adjusts `player.money`; positive values earn money
  and negative values spend it. WG does not implicitly require or clamp a
  non-negative balance; use `@require` when an action needs sufficient funds.
- `skill <skill-id> <signed-number>` adjusts and clamps a registered player
  skill while preserving fractional progress.
- `stat <stat-id> <signed-number>` adjusts and clamps a registered player stat:
  `health`, `mind`, `stress`, `energy`, `trauma`, `hygiene`, or `fear`.
  `health` routes through the player's body health rather than an ordinary
  stored base-stat meter.
- `grade <subject-id> <signed-number>` adjusts and clamps a registered
  school subject grade from `0` through `100`.
- `attendance <subject-id> <positive-whole-number>` records completed class
  segments for a registered school subject.

Effects and changes run sequentially, so a later mutation, condition, or
passive check can read state changed by an earlier one. Warnings, previews,
requirements, and time costs do not create implicit effects or resource costs.

NPC residences use `home_access_<npc-id>`. Setting, for example,
`home_access_taylor` to `true` grants access to Taylor's home and setting it to
`false` revokes access. The residence remains visible as a disabled place
choice while permission is absent.

This residence permission flag is separate from a generated place's
irreversible `unlocked` state. There is currently no WG effect for unlocking a
place.

## Comments and escaping

```wg
@# This whole line is ignored.
\@if this is prose, not a directive
\:: this is also prose
```

`@#` is a full-line comment, not an inline comment. A comment between two prose
lines does not split their paragraph; use a blank line for that. At the
beginning of a prose line, `\@` and `\::` emit literal `@` and `::` markers.

## Validation and editor support

The compiler rejects malformed directives, duplicate single-value fields,
unclosed blocks, duplicate scene, sequence, passage, entry, choice, or
choice-group IDs,
invalid expressions and durations, unknown global and local targets, unknown
skill-check target types, target IDs, and difficulties, unknown registered
skill/stat/school-subject effect IDs, missing entry targets, and direct
duplicate place hubs. It checks
`@time-until` path syntax but not whether that runtime value exists. It does
not validate other general runtime paths, NPC IDs, or overlapping tag-based
hub selectors.

Compilation is whole-project rather than file-local. Scene and sequence IDs
share one global namespace; entry IDs have a separate global namespace.
Choice and choice-group IDs are checked across all conditional and random
branches in their scene, or separately within each sequence passage. Passage
IDs are local to one sequence. The compiler validates all global and local
targets even if their branch is unreachable at runtime.

The repository includes a zero-build VS Code extension with WG syntax
highlighting, comments, indentation, bracket pairing, and folding. Install or
update it from the repository root with:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\vscode-wg\install.ps1
```

Reload open VS Code windows afterward. See `tools/vscode-wg/README.md` for the
same installation notes.

## Complete directive index

This index is the complete accepted WG surface. A directive not listed here is
not implemented.

| Context | Directives |
| --- | --- |
| Top level | `:: <scene-id> [tags...]`, `@entry ... @endentry`, `@sequence ... @endsequence`, `@#` |
| Entry | `@scene`, `@hub`, `@offer`, `@auto`, `@pool`, `@place-key`, `@place-tag`, `@location-tag`, `@when`, `@label`, `@icon`, `@hub-text`, `@priority`, `@chance`, `@weight` |
| Scene metadata | `@kind`, `@heading`, `@choices`, `@onenter ... @endonenter` |
| Sequence metadata/navigation | scene metadata plus `@school-class`, `@system`, `@passage`, `@next` |
| Scene or passage body | prose, `@if` / `@elseif` / `@else` / `@endif`, `@random` / `@or` / `@endrandom`, passive `@check` / `@success` / `@failure` / `@endcheck`, `@effect`, `@change`, `@choicegroup ... @endchoicegroup`, `@choice ... @endchoice` |
| Direct choice | `@icon`, `@time`, `@time-until`, `@enter-after-time`, `@event-pool`, `@event-chance`, `@when`, `@require`, `@warning`, `@response ... @endresponse`, `@preview`, `@effect`, `@change` |
| Checked choice | `@icon`, `@event-pool`, `@event-chance`, `@when`, `@require`, `@warning`, `@check`, `@success ... @endsuccess`, `@failure ... @endfailure` |
| Check outcome | `@time`, `@response ... @endresponse`, `@effect` |
| Effect operations | `set`, `add`, `flag`, `daily-flag`, `relationship`, `money`, `skill`, `stat`, `grade`, `attendance` |
| Story targets | global scene/sequence ID, local `.passage`, `@return`, `@exit`, `@leave-place` (`@next` and sequence final targets have the narrower rules documented above) |

## Not supported by WG

WG currently has no inline arbitrary JavaScript, Twine widgets, HTML rendering,
loops, includes, user-defined WG macros, localization, automatic resource costs,
place-unlock directive/effect, undo/history, or hot reloading.
