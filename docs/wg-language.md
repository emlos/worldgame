# WG story-authoring reference

WG is Worldgame's text-first story format. Source files live under
`story/**/*.wg`. The compiler turns them into the generated data module at
`src/story/wg/generated/scenes.js`:

```text
node tools/wg/compile.mjs
node tools/wg/compile.mjs --check
```

The normal command updates the generated module only when its contents change.
`--check` writes nothing and fails if the committed generated module is missing
or out of date. The generated module is deliberately formatted as readable
JavaScript and retains WG file, line, and column locations for runtime errors.
Never edit the generated module by hand.

## Phone chats

Chats are authored in `story/chats/*.wg` and compiled with the rest of the story.
They keep their own conversation state; opening the phone never replaces the
  active world scene. Sending a reply costs zero game time. Exclusive event scenes
  must finish before the player can send; history remains readable.

```wg
@effect contact add "kim"
@effect chat start kim.rent
```

Add the contact before starting the exchange. Having a number does not mark the
NPC as met. Both effects are idempotent. Exchanges are one-time: restarting an
active, queued, or completed exchange does nothing. A second exchange for a busy
contact queues until the active one finishes. Contacts appear in the Chats app.

```wg
@chat kim.rent
  @npc kim

  @passage opening
  @choice ask "Ask about the notice" -> .checking
    @send "Hi. Could you check this rent notice?"
  @endchoice

  @passage checking
  @message promise
    I'll look into it and get back to you.
  @endmessage
  @wait 3h -> .followup

  @passage followup
  @message answer
    It's sorted. You can ignore that notice.
  @endmessage
  @effect flag kim_rent_corrected true
  @finish
@endchat
```

- `@npc` names a registered NPC and precedes all passages. The first passage is
  the entry point. All targets stay within this chat and use `.passage-id`.
- `@message <id> ... @endmessage` makes one incoming bubble. Message IDs are unique
  throughout the chat. Paragraphs, interpolation, `@br`, `@if`, and `@random` are
  supported inside messages. Effects belong outside message blocks.
- Chat choices require `@send "..."`: this is the outgoing text sent immediately
  when clicked. The choice label is the short button label. Choice IDs are unique
  within their passage. `@when`, `@require`, and `@effect` are supported;
  timing, checks, and ordinary scene response directives are rejected.
- Passages end with reply choices, `@wait`, or `@finish`. Wait/finish directives
  must be the final top-level node, without choices in that passage. Conditions
  and random blocks may select messages, effects, or reply sets. Every resolved
  path must leave a reply, a wait, or a finished exchange.
- `@wait 3h -> .followup` suspends the exchange without advancing the clock.
  Durations support `d`, `h`, `m`, `s` in order, e.g. `1d2h30m`; waits must be
  positive. One day is exactly 24 elapsed game hours. The deadline is anchored
  when the wait executes, not reset by reopening the phone or saving.
- Normal time simulation processes deadlines chronologically, including rests
  across midnight. Follow-up branches observe the state at delivery time.
  Debug/resync clock jumps do not deliver messages; overdue messages deliver at
  the current clock on the next positive simulated advance, without rewinding.
- Effects execute once in authored order. Incoming message effects happen at
  delivery, including while the phone is closed. Delivery errors propagate
  without restoring messages or effects that already ran. Do not add contacts
  or start another exchange from within a chat; trigger those from world scenes.
- Saves store message references, frozen random/conditional choices, and captured
  interpolation values, not transcript bodies. Rendering/loading history never
  reruns effects. Editing authored wording changes the reconstructed wording;
  renamed/removed references invalidate development saves. Game save format is
  currently 32; the separately versioned compiled WG bundle format is 28.
- Unread counts include incoming messages after each contact's saved read
  position. Opening the contact list does not mark messages read. Reading to the
  end of a visible thread does. The app badge totals all contacts.
- CSS typing dots and length-based pauses are cosmetic. Immediate NPC responses
  are committed with the send, then revealed one by one. Closing the phone or
  loading a save skips unfinished animations without losing messages. Disable
  pauses in Phone Settings; reduced-motion preference also skips them.

Kim's working example is `story/chats/kim.wg`, activated by the final contact
passage of the civil-office quest. The project compiler checks its authoring and
cross-references. Dedicated chat timing, save, branch, and unread-state runtime
tests have not been added yet.

## Minimal authored event

Exposure metadata lives on the scene it exposes. This example adds a scene to
the current place's “Things to do” section:

```wg
:: taylor.study.peek
@place-key player_home
@offer place
@label "Study with Taylor"
@icon 📚
@hub-text "Taylor is sitting at the table with a textbook and a loose stack of notes."
@when npc.taylor.present
@when npc.taylor.available
@heading "Studying with Taylor"
@choices "What do you do?"

Taylor looks up from the textbook.

@choice leave "Leave Taylor to study" -> @exit
@endchoice
```

Files are UTF-8 and may contain any number of top-level scene, chat,
location-contribution, and reminder blocks.

## Core syntax and identifiers

WG is line-oriented. Leading and trailing whitespace does not change how a
directive is recognized, so indentation is for readability. Directives occupy
their own logical lines, except for prose `@br` markers, trailing inline
`@change`, and delimited inline conditionals, described below.

- Scene, chat, location-contribution, reminder, choice, and choice-group IDs start with a
  lowercase letter and may then contain lowercase letters, numbers, `_`, `-`,
  or `.`.
- Passage IDs use the same rules but do not allow `.`. A local
  passage is declared as `@passage result` and targeted as `.result`.
- Expression paths contain one or more segments. Every segment starts with a
  letter or `_` and then uses letters, numbers, or `_`. Interpolation and
  `@time-until` specifically require a dotted path with at least two segments.
- Quoted directive fields are JSON-style double-quoted strings and must be
  non-empty, except that a choice-group heading may be empty to hide its title.
  Normal JSON escapes such as `\"` and `\\` are supported. Expression string
  literals use the same escaping but may be empty. Single-quoted strings are
  not supported.
- `@icon` accepts either a quoted string or the non-empty remainder of its line,
  which makes a bare emoji convenient.

Only blank lines, comments, and top-level `@chat`, `@location`, `@reminder`, or
`::` scene declarations may appear outside a block. Chats, location
contributions, and reminders have explicit closing directives. A scene ends at
the next top-level declaration or at the end of its file. Source files and emitted object keys are sorted
deterministically, so compiling unchanged sources produces an unchanged
module.

## Scene exposure metadata

A scene becomes discoverable through at least one exposure directive: `@hub`,
`@offer`, `@auto`, or `@pool`. Exposure metadata must appear immediately after
the scene header, with the other scene metadata, and before its first passage or
body content.

The following fields may appear once: `@hub`, `@offer`, `@label`, `@icon`,
`@hub-text`, `@priority`, `@chance`, and `@weight`. `@place-key`, `@place-tag`,
`@location-tag`, `@when`, and `@pool` may repeat. `@auto` may repeat once per
distinct trigger. An offered scene may also be automatic or pooled; only
`@hub` is exclusive with the other exposure types. Selector, display, or
selection metadata without an exposure directive is rejected.

### Place hubs

Every generated place has a hub automatically. If no WG hub is authored, the
runtime supplies its generated place name, generic place prose, eligible offers
and NPC interactions, plus a one-minute **Leave** choice.

Author a hub only when a place needs its own prose or choices:

```wg
:: place.library
@hub library
@choices "Activities"

Rows of bookshelves divide the quiet room.

@choice study "Study for a while" -> library.study
  @time 1h
@endchoice
```

`@hub <place-key>` selects exactly one registered place (including generated
`home_<npc-id>` keys) and implies the corresponding `@place-key`. Do not repeat
that selector or add other position selectors.
An authored hub contains exactly one passage and cannot also use `@offer`,
`@auto`, or `@pool`.

The compiler rejects duplicate authored hubs for a place. A hub's `@when`
conditions may make its custom content conditional; when they do not pass, the
implicit hub is used instead.

The generated place name is always the heading. Authored prose, choice headings,
conditional content, and choices are used normally. The engine appends the
eligible offers, NPC interactions, and Navigation section. Its `leave` choice
ID is reserved, and hub source must not author an `@leave-place` choice.

### Offered scenes

- `@offer place` adds the scene to the current place's “Things to do” section.
- `@offer npc <id>` adds an authored interaction for that NPC. The
  NPC must be at the player's exact indoor or outdoor position.
- Every offered scene requires `@label "..."`. `@icon` is optional and may be
  quoted or written directly.
- `@hub-text "..."` appends a paragraph to the ordinary place hub while an
  `@offer place` scene is eligible. It is not shown inside the event scene and
  has no effect on NPC offers or automatic scenes.
- NPC presence does not imply availability. Add
  `@when npc.<id>.available` if the offer should disappear while an NPC is busy
  with, or cannot safely pause for the ordinary five-minute interaction before,
  an obligation.

Offers are pure queries. `@priority`, `@chance`, and `@weight` do not affect
them and rendering an offer consumes no randomness.

### Automatic scenes

`@auto enter-place` checks the scene after the player enters a place.
`@auto enter-location` checks it after the player travels to an outdoor
location. `@auto leave-place` checks after the one-minute exit using the place
the player just left for position selectors. Any combination of the three
triggers may be present on one scene.

Use the leave trigger for a scene that should run immediately after exiting a
particular place:

```wg
:: library.closing-encounter
@auto leave-place
@place-key library
@when not flags.library_closing_seen
@onenter
  @effect flag library_closing_seen true
@endonenter

Someone calls after you as the library door closes.

@next -> @exit
```

`@onenter` initializes the selected event; it does not select or trigger the
event by itself. If no leave-triggered event is eligible, the ordinary outdoor
location hub appears.

Automatic scenes do not interrupt an already active authored scene. Eligible
scenes are resolved after the transition time has passed, so conditions see the
arrival or exit clock and final NPC positions. A leave trigger's `@place-key`
and `@place-tag` selectors alone use the departed place snapshot.

Selection works as follows:

1. Check priority groups from highest to lowest.
2. Roll each scene's independent chance within that group.
3. Select one surviving scene by relative weight.
4. Try the next lower priority only if no scene in the higher group survives.

`@priority` is a signed safe integer and defaults to `0`. `@chance` accepts a
decimal from `0` to `1` or a percentage from `0%` to `100%`, and defaults to
`100%`. `@weight` must be positive and defaults to `1`.

Automatic resolution uses the saved `wg-events` random stream. Chance rolls
and the weighted pick therefore advance that stream only when automatic
candidates are actually resolved. A selected target is authoritatively entered
and runs its `@onenter` effects.

### Event-pool scenes

`@pool <id>` registers a scene as a candidate in a named event pool. A choice
invokes that pool with `@event-pool <id>` and may set the overall trigger
frequency with `@event-chance`. Pool IDs are validated across the whole WG
project and a scene may belong to more than one pool.

When a pool is invoked, position selectors and every `@when` condition first
filter its members. Only scenes at the highest remaining `@priority` are
considered, and one is selected by relative `@weight`. The scene-level
`@chance` belongs to automatic-scene resolution and is ignored by pool
selection; `@event-chance` controls whether the pool triggers at all. This
keeps the overall event frequency stable as more members are added.

A selected event temporarily suspends the choice's ordinary target. The event
can navigate normally. Target `@return` to
resume the suspended target. Targeting `@exit` instead abandons all suspended
continuations and returns to the world hub. The continuation stack, selected
event, and inherited school arrival snapshot are saved, so save/load cannot
reroll or lose an interrupted class.

### Engine interrupts

The pool ID `interrupt` is reserved for state-driven scenes that replace the
ordinary result of a player action. Define them with normal scene exposure metadata, selectors,
conditions, and priorities:

```wg
:: interrupt.exhaustion.school -> @exit
@pool interrupt
@place-key high_school
@when player.energy <= 0
@priority 100

You wake in the school nurse's office.

@choice recover "Rest" -> @exit
  @time 1h rest
@endchoice
```

After action effects and elapsed time, the runtime tests this pool before
entering the action's ordinary target or automatic arrival event. The highest
eligible priority wins; equally prioritized scenes use their normal weights.
Interrupts are replacements, not continuations, so they do not use `@return`.
The pool cannot be invoked manually with `@event-pool interrupt`.

Eligibility is edge-triggered. Every eligible variant is latched when one is
selected, preventing a generic fallback from immediately following a more
specific version. Scenes re-arm after their conditions become false. When an
interrupt arises during a scene, its selected scene ID is saved and fires as
soon as the player leaves that scene. Interrupt selection and pending state
survive save/load.

Keep consequences in the interrupt scene using ordinary effects. A recovery
choice can use `@time 1h..3h rest` to choose a stable random whole-minute
duration, advance the full world simulation, and recover energy at the normal
sleep rate while the player is unconscious.

### Position selectors and conditions

Exposed scenes may repeat these selectors:

- `@place-key <key>`
- `@place-tag <tag>`
- `@location-tag <tag>`

Values within one selector kind are ORed. Different selector kinds are ANDed.
If a selector kind is absent it imposes no restriction. Place tags include
both the place's category and its explicit tags. A required place key or tag
cannot match while the player is outdoors.

Every repeated `@when <expression>` must pass. Conditions apply to hubs,
offers, automatic scenes, and pool scenes before those scenes are used.

### Locked generated places

A place definition with `unlocked: false` is still created during world
generation and remains available to NPC simulation, but is completely hidden
from the player. It is omitted from local and world maps, place-entry choices,
bus destinations, player schedule destinations, and GPS targets. The player
cannot be loaded into it or enter it through a direct runtime call.

WG hubs and place offers for a locked place remain compiled but dormant because
  the player cannot enter or select that place. An `@auto enter-place` scene can
therefore trigger only after the place has been unlocked. Runtime code can call
`game.unlockPlacesByKey("place_key")` to unlock every generated instance with
that key. Unlocking is saved and irreversible: an unlocked instance never
returns to the locked state.

WG can reveal these places with the effect
`@effect unlock place <place-key>`, for example
`@effect unlock place civil_office`.
The key must come from `PLACE_REGISTRY` or be `home_<npc-id>` for an NPC in
`NPC_REGISTRY`. Other generated instance IDs and outdoor location/district IDs
are not valid place keys. WG does not currently expose `place.unlocked`
or a per-key unlock-state query. See **Unlocking places** below for effect rules.

## Outdoor location contributions

Use `@location <id> ... @endlocation` to add prose and ordinary choices to a
generated outdoor hub, without entering a story or replacing its map, places,
people, or travel choices. The ID names the contribution, not a map location.
Multiple contributions may match the same hub. Their IDs are unique across WG
files in a separate namespace and are not valid scene targets.

```wg
@location home-door
  @when "player_home" in location.visiblePlaceKeys

You live at this juncture.

@choicegroup notices ""
  @choice read "Check the notice on the door" -> @exit
    @when not flags.home_notice_read
    @time 1m
    @effect flag home_notice_read true
    @response
      A notice has been pinned to your front door.
      Someone is asking you to contact the civil office.
    @endresponse
  @endchoice
@endchoicegroup
@endlocation
```

Every block-level `@when` must pass. These conditions are optional, repeatable,
and must precede all body content. Without conditions the contribution matches
every outdoor hub. Use the normal expression language, including `and`, `or`,
`in`, `flags.*`, `daily.*`, `player.*`, `npc.*`, and `time.*`. Contributions
never appear indoors or while an authored scene is active.

Two location lists support containment conditions in any WG expression:

- `location.placeKeys`: sorted, unique, non-empty keys of all generated places
  in the current location, including locked places.
- `location.visiblePlaceKeys`: the same, limited to unlocked places. Opening
  hours and access requirements do not affect this list; a closed building
  still exists outside. Prefer this list for player-visible opportunities.

Use registry keys such as `player_home` and `civil_office`, not scene IDs or
generated place IDs. `place` continues to mean the building the player is
inside and remains `null` outdoors. A containment test does not select a
building or change `place`. Unknown keys in expressions are not compiler errors;
a membership test simply returns false. These lists are derived from the
current world each time, so unlocking a place updates conditions immediately.

Matching contributions are ordered by ID. Their prose is appended after the
ordinary outdoor introduction; their sections precede **Places of interest**.
All prose still renders before all choice sections, as in scenes. Within each
contribution, sections follow the source order of their first visible choice.
Ungrouped choices have no heading; use `@choicegroup <id> "Heading"` for a
title or `""` for a separate heading-free group. Empty visible groups disappear,
but independent prose remains. Runtime choice and section IDs are prefixed
with `location:<contribution-id>:` so separate contributions can reuse local IDs.

The body supports prose, interpolation, `@br`, conditionals, deterministic
`@random` variants, choice groups, and ordinary or checked choices. Rendering
and choice revalidation are pure: no state changes or random-stream advancement.
Choice effects, skill checks, requirements, time, previews, unlocks, and responses
use the same execution order as other WG choices. Runtime errors propagate and
do not restore earlier state; reload a previous save after a fatal error.
A successful `@exit` choice stays at the outdoor hub; a global scene
target enters that story. Responses use the completed post-action state and
are displayed only for the immediate result. Flags persist through save/load.

Location contributions require a non-empty body, but prose-only blocks are
allowed. They do not support scene metadata such as `@offer` or `@hub`,
`@heading`, or `@choices`, or passage directives such as `@passage` and
`@next`. Put effects and changes inside
choices, not persistent hub prose; body effects, inline changes, passive checks,
and `@onenter` are rejected even inside unreachable branches. Local passage
targets, `@leave-place`, and `@return` are rejected in direct choices and check
outcomes. `@event-pool` is also rejected: enter a scene first if a
choice needs a pooled continuation. No location contribution is stored as an
active story frame or saved separately.

## Scenes

A scene starts with a header and continues until the next top-level scene,
chat, location-contribution, or reminder declaration:

```wg
:: taylor.study.peek
@heading "Taylor's room"
@choices "What do you do?"

Taylor looks up from the textbook.
```

- Scene IDs must be globally unique.
- WG scenes are events unless `@hub <place-key>` identifies them as persistent
  place hubs. Scene kind is inferred and cannot be authored separately.
- `@heading "..."` optionally sets the page heading. If it is omitted, the
  scene renders without an `<h1>` heading.
- `@choices "..."` labels the default section for ungrouped choices and
  defaults to `"Choices"`.
- `@heading`, `@choices`, `@behavior`, `@system`, `@onenter`, and
  all exposure directives are scene metadata. They must appear before prose,
  passages, conditionals, or choices. Single-value directives may appear only
  once.

WG materialization does not create map data: authored scenes of any kind have
`map: null`. The ordinary generated outdoor location screen still supplies the
interactive map. `@hub <place-key>` is the authoring form for a persistent
place-kind scene; ordinary places need no WG scene at all.

### Choice groups

Use a choice group when one screen needs multiple choice headings:

```wg
@choicegroup rooms "Rooms"
@choice cafeteria "Go to the cafeteria" -> school.cafeteria
@endchoice
@choice gym "Go to the school gym" -> school.gym
@endchoice
@endchoicegroup

@choicegroup current "Current Activities"
@if school.phase == "class"
Class is currently in progress.
@choice attend "Attend class" -> school.class.english
@endchoice
@endif
@endchoicegroup
```

A group begins with `@choicegroup <id> "<heading>"` and ends with
`@endchoicegroup`. Group IDs must be unique within their scene passage. Groups
cannot be nested, and each group must contain at least one
authored choice somewhere in its direct, conditional, or random content.

Choices inside the block render under that group's heading. Prose still joins
the scene's ordinary paragraphs, so a group may wrap conditionals containing
both descriptive text and choices. A group with no visible choices at runtime
is omitted. Choices outside every group continue to render in the default
`@choices` section. Sections preserve the source order in which their first
visible choice appears.

To keep a separate group without displaying a heading, use an empty quoted
heading. This works in every scene passage:

```wg
@choicegroup navigation ""
@choice back "Go back" -> @exit
@endchoice
@endchoicegroup
```

An empty or whitespace-only group heading hides the title, without displaying
"Choices" or an empty heading element. The group still has its own spacing,
source order, and ID; it does not merge into the previous group. The quoted
heading remains required. Choices outside a group still use the default
`@choices` heading, and `@choices ""` is not supported.

For hub activities, do not hide the general group merely because a scheduled
activity is currently happening. Keep the hub group unconditional and make
  the scheduled choice target a scene. While that target is active,
its screen replaces the hub automatically; returning through `@exit` restores
the hub and its general choices.

## Passages and final targets

A scene can group several rendered passages under one global ID. Use passages
when prose should be paced behind one or more zero-time Next buttons without
creating a separate global scene and choice for every screen:

```wg
@choice inspect "Inspect the room" -> example.inspection
  @icon 👀
  @time 5m
@endchoice

:: example.inspection -> @exit
@heading "Inspecting the room"

You look over the room carefully.

@next

Nothing else catches your attention.

@next "Return"
```

A scene header may end with `-> <final-target>`. The final target may be
`@exit`, `@return`, or another scene ID.
`@return` is valid at runtime only while a pooled event continuation is
active. A final target is optional unless the scene uses a final bare `@next`
or `@system`. Choice groups work identically in implicit and named passages.

Every non-system scene contains at least one non-empty passage. Prose before the
first `@passage` or between `@next` directives creates anonymous passages named
`p1`, `p2`, and so on, skipping any ID already explicitly declared. Those
generated names may be targeted just like named passages, but explicit names
are less fragile when source order may change.

Each `@next` ends the current passage and creates a navigation choice. Prose
after it begins the next anonymous passage. A bare `@next` uses the label
`"Next"` and targets the following passage. The last bare `@next` uses the
scene's final target. A quoted label changes only the displayed text:

```wg
@next "Wake up"
```

Next buttons appear in their own heading-free navigation section, including
custom-labelled Next buttons. A passage containing both normal choices and
`@next` retains its authored `@choices` and `@choicegroup` headings; the
Next section is always heading-free.

Next navigation never advances time, adds an action-log entry, or runs
`@onenter` on either the current scene or a global target it enters. It is
an atomic zero-time transition: entering its target resolves that passage's
prose effects and passive checks and advances the gameplay action revision.
Use an ordinary choice when the transition itself needs authored choice
effects or a duration.
The active authored scene and passage, or a runtime system's JSON state,
are included in save data, so loading resumes on the same screen.

### Runtime story systems

Use `@system <system-id> [config]` to delegate a whole scene to a registered
JavaScript story system. The optional config is a JSON object emitted into the
WG bundle as ordinary data:

```wg
:: school.math.event.surprise-quiz -> @return
@heading "Surprise Math Quiz"
@choices "Choose an answer"
@system school.quiz {"bank":"math.core","questions":3}
```

System-backed scenes cannot contain authored passages or use `@behavior`.
Their registered system creates serializable instance state
once on entry, renders ordinary scene and choice contracts from that state,
and handles JSON command objects from its choices. Rendering must be pure:
random selection belongs in system creation so repeated renders and save/load
cannot reroll active content. Completing the system follows the scene's
declared final target, including pooled-event `@return` continuations.

WG stores only the system ID, config, and current JSON state. JavaScript
callbacks remain in the runtime registry and are never emitted into generated
story data or save files.
The school quiz feature currently resolves `math.core` and `english.core`
through `src/features/school/quiz/banks/index.js`; add new subject banks there
without changing the generic WG runtime.

### Named passages and local targets

Use `@passage <id>` when a choice or Next button must address a passage. Passage
IDs are lowercase local identifiers and need to be unique only within their
  scene; unlike global IDs, they cannot contain dots. Prefix one with `.` when
targeting it:

```wg
:: taylor.study -> @exit
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
```

`@next -> <target>` and `@next "<label>" -> <target>` override the normal
source-order target. They may point to a local passage, `@exit`, `@return`, a
scene. `@next` cannot perform `@leave-place`; use an ordinary
choice for an authoritative place exit.

Ordinary choices inside passages keep their normal effects, duration, skill
checks, and requirements. Choice IDs must be unique within their passage.
Local `.passage` targets are valid in every scene.

### Runtime story behaviors

Use `@behavior <behavior-id> [config]` when a registered feature needs to
augment an otherwise authored scene. The optional config is a JSON object.
Unlike `@system`, the scene keeps its WG prose, passages, choices, and effects.
Its feature-owned behavior can validate the definition, choose the starting
passage, expose additional context, and respond to scene lifecycle events.

For example, the school feature uses `school.class` to follow the active
timetable segment:

```wg
:: school.class.english -> @exit
@behavior school.class {"subject":"english"}
@heading "English Class"

@passage segment-1
The first segment begins.

@passage segment-2
The second segment is underway.

@passage segment-3
The final segment is underway.
```

This behavior's class passages must be named consecutively in source order, starting
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
cleared when the scene ends. This is intended as the input for later
lateness penalties or detention rules; those consequences are not applied
automatically.

## Prose and interpolation

Ordinary non-directive lines are prose. Blank lines separate paragraphs.
Consecutive lines inside one paragraph are trimmed and joined with a single
space. Use `@br` to start a new displayed line without starting a new paragraph:

```wg
"Are you ready?"
@br
"Almost." @br "Take your time."

This starts a new paragraph.
```

`@br` may stand on its own source line within a paragraph, or appear inside
a prose line. Whitespace beside the marker is not displayed. Consecutive
markers create consecutive breaks. A paragraph cannot contain only breaks.
These rules also apply inside `@response` blocks. Write `\@br` to display
the marker literally; HTML such as `<br>` remains literal text.

HTML stays literal and is never executed. Passage prose, response paragraphs,
choice labels, and custom Next labels support these outcome-colour markers:

```wg
[good]A very good result.[/good]
[ok]Things are under control.[/ok]
[warning]This may become a problem.[/warning]
[bad]The outcome is bad.[/bad]
[dire]The situation is dire.[/dire]
```

Markers are not nested. Missing or mismatched closing markers remain visible as
ordinary text, which makes authoring mistakes obvious instead of swallowing
prose.

```wg
You have £{{player.money}}.
{{npc.taylor.subject|cap}} closes {{npc.taylor.dependent}} book.
```

An interpolation contains a dotted runtime path and may use the implemented
`|cap` filter. It must resolve to a string, number, or boolean. A missing,
`null`, list, or object value causes a runtime error rather than printing an
empty value.

Choice labels and custom Next labels support the same interpolation and
outcome-colour markers as prose. Interpolation resolves before the markers are
rendered, so both features may be combined:

```wg
@choice pay "[warning]Pay £{{player.money}}[/warning]" -> .paid
@endchoice

@next "[good]Continue with {{npc.taylor.object}}[/good]" -> .continue
```

Headings, scene labels, hub text, warnings, requirement reasons, and preview
labels remain literal strings.

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
- `player.education.<subject-id>.achievement`, `.grade`, `.progress`, and
  `.attendedSegments` for each registered school subject: `english`, `math`,
  `history`, `science`, `art`, and `physical_education`. `achievement` is the
  canonical whole-number score from `0` through `399`. `grade` is derived as
  `D`, `C`, `B`, or `A`, and `progress` is the `0`–`99` position within that
  grade. Progress within `A` represents mastery rather than another promotion.
- `npc.<id>.id`, `.name`, `.shortName`, `.age`, `.gender`, `.relationship.<meter-id>`,
  `.present`, and `.available`.
- `home.location.name`: the name of the location containing the player's home,
  independent of the player's current position.
- `npc.<id>.home.location.name`: the name of the location containing that NPC's
  home, independent of their current position. For example,
  `{{npc.kim.home.location.name}}`.
  For either home path, `home.location` is `null` if no home location is assigned
  or its location no longer exists; guard optional homes with `@if` before
  interpolating their names.
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
- `time.day`: calendar-day index relative to the saved game-start date. The
  starting date is day 1, and UTC midnight begins the next day, even when less
  than 24 hours have elapsed. It survives save/load without being reset.
- `school.isSchoolDay`, `.noSchoolReason`, `.atSchool`, `.phase`,
  `.periodId`, `.periodLabel`, `.subjectId`, `.currentClass`, `.nextClass`,
  `.nextClassPeriodId`, `.nextClassLabel`, `.nextClassStartsAt`,
  `.nextClassEndsAt`, `.minutesUntilNextClass`, `.segment`,
  `.segmentCount`, `.periodStartsAt`, `.periodEndsAt`, `.minutesIntoPeriod`,
  `.nextBoundaryAt`, `.minutesUntilNextBoundary`, and `.closesAt`. Timestamps
  are ISO strings or `null`.
  `currentClass` is the active class's subject ID or `null`; `nextClass` is
  the next class that starts later on the current school day, or `null`.
- During an active `@behavior school.class` scene: `school.arrival.periodId`,
  `.subjectId`, `.scheduledAt`, `.arrivedAt`, `.minutesLate`, and
  `.startingSegment`. These remain available inside an interrupting pooled
  event.
- During an active pooled event: `event.poolId`, `event.sceneId`,
  `event.source.sceneId`, `.passageId`, and `.choiceId`. `event` is `null`
  outside a pooled event.
- `location.id`, `location.name`, `location.tags`, `location.placeKeys`, and
  `location.visiblePlaceKeys` for the containing location. The two key lists
  are described under **Outdoor location contributions**.
- `place.id`, `place.key`, `place.name`, and `place.tags` while indoors.
  `place` is `null` outdoors.

Home location names work in prose, incoming messages, and outgoing `@send` text:

```wg
@send "I'm the new tenant in {{home.location.name}}."
@send "Do you still live in {{npc.kim.home.location.name}}?"
```

As with other message interpolations, the home name is captured when a message
is sent. Existing messages retain that name after moving, renaming a location,
or saving and loading. Use the NPC's actual key (`npc.kim`), not bracket notation.

The player does not currently expose a name, inventory, body, clothing, or a
`player.flags` path to WG. A location does not expose its
district key or type.

NPC relationship profiles expose only the meters declared by that NPC. Meter
values are between `0` and `100`; for example, Taylor exposes
`npc.taylor.relationship.friendship` and `npc.taylor.relationship.love`, while
Kim exposes `npc.kim.relationship.intimidation`. The meaning and preferred
direction of each meter comes from the NPC definition. `npc.<id>.present` means
the NPC shares the player's exact position, and `.available` is the authoritative
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
@elseif npc.taylor.relationship.friendship >= 50
Taylor smiles.
@elseif "urban" in location.tags
Traffic murmurs outside.
@else
Taylor returns to the textbook.
@endif
```

`@if`, any number of `@elseif` branches, an optional `@else`, and `@endif`
form a conditional block. Blocks may be nested and may contain prose, choices,
effects, passive checks, or more conditions. When an event scene passage is
entered, its selected structural branches are saved for that story
instance. This ensures an effect cannot change the condition that selected its
own prose. Authored `@hub` scenes remain live and read-only, so their
conditionals are evaluated on every materialization.

For a conditional fragment inside one prose line, wrap the same directives in
double braces:

```wg
Kim sits behind the desk, {{@if npc.kim.gender == "female"}}wearing a business suit{{@elseif npc.kim.gender == "male"}}wearing an ironed shirt{{@else}}dressed formally{{@endif}}. {{npc.kim.subject | cap}} looks up.
```

Inline conditionals support any number of `{{@elseif ...}}` branches, an
optional `{{@else}}`, nesting, ordinary interpolation, and `@br`. Their markers
and branch text must stay on the same source line. They produce paragraph parts,
so selecting a phrase never inserts a paragraph break or visual gap. Inline
changes in a selected branch run only when that branch is selected; response
blocks retain their normal rule forbidding changes.

Entered scenes save inline decisions alongside block decisions,
while persistent place prose evaluates them live. Use block conditionals when a
branch needs choices, standalone effects, passive checks, or multiple source
lines; inline conditionals are for conditional prose fragments.

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

Entered event scene passages resolve their structural content
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
`attendance` operations. It derives labels such as `-English` from the
registered data. Add an optional quoted label to override that text:

```wg
@change relationship taylor.friendship 2 "+Taylor friendship"
```

Stat feedback follows the stat's `higherIsBetter` definition, including when
the label is overridden: reducing stress, fear, or trauma is green; increasing
them uses the bad-outcome colour. Zero changes are neutral.

Put `@change` at the end of a prose source line to attach its coloured feedback
to that sentence:

```wg
You give Taylor a pep talk. @change relationship taylor.friendship 2
You feel more relaxed. @change stat stress -2
```

This displays `You give Taylor a pep talk. | +Relationship` followed by
`You feel more relaxed. | -Stress` in the same paragraph. Add `@br` on a
separate line between them to display the second sentence on a new line.

Each source line supports any number of trailing inline changes, separated
by whitespace. They use the same operations, amounts, and optional quoted
labels as a standalone `@change`, and execute and display left to right:

```wg
You compare notes with Taylor. @change relationship taylor.friendship 1 @change grade history 1
```

This displays `You compare notes with Taylor. | +Friendship | +History`.
There is no fixed limit on the number of inline changes. Quoted labels may
contain literal `@change` text and escaped quotes without starting a new
directive. The chain consumes the remainder of the source line; put further
prose on the next source line. A standalone `@change` continues to display a
separate feedback block.

Inline changes run once during passage resolution in source order, before
subsequent body conditions or checks. Rendering, choice revalidation, and
save/load do not reapply them. Like standalone body effects, they are forbidden
in authored `@hub` scenes. They are also forbidden in presentation-only
`@response` blocks. Write `\@change` to display that marker literally.

A body-level `@preview` is invalid:
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

Persistent `@hub` scenes cannot contain prose effects or passive checks,
because they are live views rather than entered story instances. Put such an
outcome in a targeted event scene passage instead.

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
  @preview relationship taylor.friendship -2 "-Friendship"
  @effect relationship taylor.friendship -2
@endchoice
```

A direct choice header has the form
`@choice <id> "<label>" -> <target>` and ends with `@endchoice`. Choice IDs
must be unique throughout their current scene passage, including
mutually exclusive conditional branches. A choice block may contain only
choice directives; put prose and conditionals outside it.

The target may be:

- another compiled scene ID;
- a local `.passage-id` inside the current scene;
- `@return`, which resumes the target suspended by a pooled event and fails if
  there is no active continuation;
- `@exit`, which closes the authored story and returns to the current place hub
  indoors or the ordinary location scene outdoors; or
- `@leave-place`, which performs the authoritative place-exit action and
  closes the authored story. It fails if the player is already outdoors.

`@leave-place` does not add a duration. Add `@time 1m` when an event choice
should perform the game's normal one-minute exit. Place hubs already receive
that standard Leave choice from the engine.

Choice directives are:

- `@icon <value>`: optional quoted or unquoted display icon.
- `@time <duration>`: action duration; omitted means zero time. Durations may
  combine non-negative decimal days, hours, minutes, and seconds in that order, with
  no spaces, such as `30s`, `5m`, `0.5h`, `1h30m`, or `1d2h`. Each unit may appear at
  most once. Use `0m` for an explicit zero duration; bare `0` is invalid.
- `@time <minimum>..<maximum>`: picks a whole-minute duration, including both
  endpoints. The result is deterministic for that story passage, so rerendering
  or saving and loading cannot reroll the displayed `HH:MM` choice duration.
  Both endpoints must resolve to whole minutes and the minimum must be smaller.
- `@time <duration> free`: advances the full world simulation for the given
  duration but suppresses the player's passive elapsed-time energy drain for
  this action. It is valid in direct choices and skill-check outcomes. Explicit
  effects such as `@effect stat energy -10` still apply.
  NPC simulation, the calendar and weather, age synchronization, midnight
  daily-flag clearing, listeners, and action logging are unchanged.
- `@time <duration> rest`: has the same simulation behavior as `free` and also
  restores energy at 10 points per in-game hour. It accepts either a fixed
  duration or a random range and is the shared time policy used by normal sleep
  and forced-rest scenes.
- `@time-until <runtime.path>`: calculates the duration from `time.iso` to
  a future ISO timestamp at materialization time. It is useful for waiting for
  the next class or closing time. It is valid only on direct choices, cannot
  be combined with `@time`, and fails if the path is missing, invalid, or not
  in the future.
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
  preview. Use the stat ID as the type for stat-aware colours, for example
  `@preview stress -2 "-Stress"`. A preview never applies or validates a real effect.
- `@effect ...`: repeatable authoritative effect, described below.
- `@change ... ["<label>"]`: an authoritative effect with a derived or custom
  preview. It is valid in direct choices for the same player-facing operations
  supported by prose changes.

Before an action runs, the game rebuilds the current scene and rechecks that
the choice still exists and is enabled. Direct-choice effects run in their
authored order, then `@time` advances the world. Engine interrupts are resolved
against that resulting state. If no interrupt replaces or defers the normal
transition, an event pool or ordinary target is entered and its `@onenter`
effects run. The resulting screen is rendered against the completed state. If
any part of the action fails, its state changes and log entry are rolled back.

A scheduled classroom wait therefore looks like:

```wg
@choice wait-for-class "Wait for class" -> school.class.english
  @time-until school.nextClassStartsAt
  @when school.phase != "class" and school.nextClass == "english"
@endchoice
```

A choice with no `@time`, or with a zero duration such as `0m`, does not advance
the clock or update NPC simulation state.

For example, an eight-hour rest uses:

```wg
@choice rest "Rest" -> @exit
  @time 8h rest
@endchoice
```

## Skill changes and checks

A direct skill effect changes a registered fractional `0` through `10` skill:

```wg
@choice lift-weights "Lift weights" -> @exit
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
`@require` directives. Both outcomes are required and may target another scene,
a local passage, `@exit`, or
`@leave-place`.

To check a school grade instead, use syntax such as
`@check grade english difficult`. The UI displays `English Grade: Difficult`.
The subject's achievement is normalized to the same `0`–`10` check level used
by skills. `D` begins near level `0`, `C` near `2.5`, `B` near `5`, and `A`
near `7.5`; progress fills the space within each letter grade.

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
`2`. A high-progress `D` and a new `C` therefore sit near the same check level.
Chance rises smoothly with the target value using the centralized logistic
difficulty curve; the author does not specify percentages. Even level `10`
has a failure chance on `near-impossible`.

Checks are resolved only after the choice is authoritatively rebuilt. Their
keyed roll uses the game seed, successful-action revision, current scene
instance, and choice ID. Saving and reloading the same scene therefore keeps
the same result, while completing another action or re-entering the scene
changes the roll key. Rendering never rolls or advances that revision.

After a result is selected, that branch's effects and target transition run,
then its time advances. Runtime errors propagate without restoring effects that
were already applied.

## Effects

Effects may appear inside direct choices, skill-check outcomes, a scene
`@onenter` block, or the body of an entered event scene passage:

```wg
@onenter
  @effect set story.daily.taylorStudyCompany true
  @effect add story.daily.studyCount 1
@endonenter
```

`@onenter` runs once each time that scene is authoritatively
entered. It does not run while a screen is merely rendered or rebuilt. Moving
between passages in the same scene does not run it again. Entering the same
story target again through an ordinary choice does. The block may contain only
`@effect` directives, comments, and blank lines.

Body effects instead run during one-time post-time prose resolution. Moving to
a new passage resolves that passage and can run its body effects without
rerunning the scene's `@onenter`. Use `@change` rather than `@effect` when
the mutation should create visible result feedback.

Implemented effects are:

```wg
@effect set story.some.path true
@effect set story.some.snapshot player.energy
@effect add story.some.counter 1
@effect flag met-taylor true
@effect flag met-taylor false
@effect daily-flag home_weightlifting true
@effect daily-flag home_weightlifting false
@effect relationship taylor.friendship 2
@effect relationship taylor.friendship -2
@effect money 25
@effect money -5
@effect skill strength 0.1
@effect skill strength -0.05
@effect stat energy -5
@effect grade english 1
@effect attendance english 1
@effect reminder add civil_notice
@effect reminder clear civil_notice
@effect timer start rent.weekly
@effect timer restart rent.weekly
@effect timer stop rent.weekly
@effect unlock place civil_office
@effect relocate home
@effect relocate nearest-place hospital
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
- `reminder add <id>` activates an authored reminder; `reminder clear <id>`
  removes it. Both require a declared reminder ID. See **Reminders** below.
- `timer start <id>` starts a named JavaScript timer definition if it is not
  already active. `timer restart <id>` replaces its deadline with a fresh
  schedule from the current UTC world time, and `timer stop <id>` removes it.
  Unknown timer IDs fail during WG compilation and again at runtime.
- `relationship <npc-id>.<meter-id> <signed-number>` changes and clamps that
  named meter to `0` through `100`, marks the NPC as met, and fails during
  compilation if the NPC or meter does not exist. A meter configured with
  `revealOnChange` becomes visible after its first change. Feedback colours use
  the meter's `higherIsBetter` definition, so increasing Kim's intimidation is
  bad while increasing Taylor's friendship is good.
- `money <signed-number>` adjusts `player.money`; positive values earn money
  and negative values spend it. WG does not implicitly require or clamp a
  non-negative balance; use `@require` when an action needs sufficient funds.
- `skill <skill-id> <signed-number>` adjusts and clamps a registered player
  skill while preserving fractional progress.
- `stat <stat-id> <signed-number>` adjusts and clamps a registered player stat:
  `health`, `mind`, `stress`, `energy`, `trauma`, `hygiene`, or `fear`.
  `health` routes through the player's body health rather than an ordinary
  stored base-stat meter.
- `grade <subject-id> <signed-whole-number>` adjusts a registered school
  subject's achievement. Crossing a hundred-point boundary changes the letter
  grade in either direction and carries the remainder: `D · 99 + 1` becomes
  `C · 0`, while `B · 3 - 10` becomes `C · 93`. Achievement clamps at
  `D · 0` and `A · 99`.
- `attendance <subject-id> <positive-whole-number>` records completed class
  segments for a registered school subject.
- `relocate home` immediately moves the player into their generated home.
  `relocate nearest-place <place-key>` moves them into the closest unlocked
  generated place with that key. Relocation is intended for authoritative story
  transitions such as recovery, arrest, or forced transport; follow it with a
  target scene belonging to the destination place.

Effects and changes run sequentially, so a later mutation, condition, or
passive check can read state changed by an earlier one. Warnings, previews,
requirements, and time costs do not create implicit effects or resource costs.

All generated NPC residences start with `unlocked: false`. They remain
available to NPC simulation but hidden from the player until unlocked with
`@effect unlock place home_<npc-id>`, for example
`@effect unlock place home_taylor`.
This uses the same saved, irreversible unlock state as other places.

### Timers

Named definitions belong to the feature that owns them (for example,
`src/features/rent/timerDefinitions.js`); the generic scheduling engine lives
in `src/game/timers.js`. Definitions may use elapsed
`interval` schedules in hours or days, UTC `weekly` and `monthly` calendar
schedules, or a one-shot `once` schedule. Repeating deadlines are always
calculated from the previous deadline, so late processing cannot make them
drift. Prefer an `effects` array for ordinary state changes; an `onDue`
callback remains available for timers that require algorithmic behavior.

Only active state is serialized under `game.timers`: each entry stores its
ISO `dueAt` timestamp and completed `occurrences`. During simulated time, the
engine stops at the earliest timer or chat deadline, runs all timers due at
that instant in stable ID order, then delivers chats. Timer effect lists change
durable state such as `story.*` and reminders; they do not enter scenes.
Ordinary WG interrupt conditions decide whether that state unlocks a scene.

Forward `jumpToDate(..., { mode: "resync" })` applies no timer effects. It
removes elapsed one-shots and advances repeating deadlines past the target,
matching resync's rule that skipped time must not manufacture gameplay events.
Timer state and effect mutations are saved normally. Effect failures
propagate and do not restore the clock or earlier timer mutations.

### Unlocking places

Use `@effect unlock place <place-key>` to reveal every generated
instance of a registered place key or an NPC home key (`home_<npc-id>`):

```wg
@choice directions "Ask for directions to the civil office" -> @exit
  @effect unlock place civil_office
@endchoice
```

It can also appear in an entered event scene body (including conditional,
random, and passive-check branches), an `@onenter` block, or either outcome
of a checked choice. Chats support it in passage bodies and reply choices;
Kim's rent chat uses `@effect unlock place home_kim` after sharing the address.
Place-hub choices can unlock places, but persistent
place-hub prose and presentation-only `@response` blocks cannot. In a checked
choice, put the unlock inside `@success` or `@failure`, not at choice level.

- Unlocking is silent: author the discovery text yourself. It does not add
  automatic feedback, a choice preview, a time cost, or move the player.
- It uses the normal effect order. Body unlocks run once per entered passage,
  never during rendering or choice revalidation.
- A committed unlock is saved and irreversible. Repeating it is harmless.
  If a valid key has no instances in the current world, it does nothing.
- Newly unlocked places appear in the existing map, place-choice, GPS, bus,
  and schedule systems wherever those systems normally include that place.
  Opening hours and age restrictions still apply.
- Unknown keys and malformed syntax fail compilation, including inside
  unreachable branches. Runtime effects also validate against registered place
  keys and NPC home keys.

This directive unlocks generated **places**, not outdoor map locations. It
does not expose locking/relocking or instance-specific unlocking. Use the
effect spelling above; `@change unlock` is not syntax.

## Reminders

Declare a reminder once, anywhere at the top level of a WG file:

```wg
@reminder civil_notice
  @text "Visit the civil office about the notice on your door."
@endreminder
```

Definitions have a separate, global ID namespace using the normal WG ID rules.
Every definition requires exactly one nonempty `@text "..."` string. Optional
`@tone info|warning` defaults to `info`; optional `@priority <signed-integer>`
defaults to `0` and must be a safe integer. Each field may appear once. Text
supports the existing safe outcome markup, such as `[warning]...[/warning]`,
but is literal: interpolation, expressions, and scripts are not supported.

A definition alone does not activate the reminder. Use normal silent effects:

```wg
@effect reminder add civil_notice
@effect reminder clear civil_notice
```

These effects are legal inside ordinary choices, checked outcomes, `@onenter`,
and one-time event-scene prose. They are illegal inside persistent hub or
location prose and presentation-only `@response` blocks. `@change` cannot be
used for reminder effects, even with a custom label. Author any immediate
feedback in the choice response.

Adding an active reminder and clearing an inactive reminder are harmless.
Duplicate definitions, unknown references, and malformed operations fail
compilation, including inside unreachable branches. Effect order, save/load,
and runtime error handling follow the ordinary WG effect rules.

The phone's Reminders app shows active authored reminders under **To do**.
The school-day reminder is built in: the school schedule automatically supplies
its declaration, visibility, and start-time text under **Today**. Authors do
not declare or activate it. It is absent on non-school days and cannot be
manually added or cleared. The current school-day note remains for that day,
including after classes, matching the existing daily school announcement.
Empty groups are hidden. Viewing the phone takes no time and changes no state.

When forward time crosses UTC midnight, all current reminder strings are
snapshotted into the ordinary passage announcement area. Lower priorities
display first, with IDs breaking ties; phone items use the same order within
their groups. The next successful game action dismisses that batch, including
`@next`, but leaves its source reminders active. They repeat on later days
until cleared. Clearing a reminder also removes its pending announcement.
Reading a scene or opening the phone never consumes a batch. New games seed
automatic notices for their starting day; loading restores the saved batch
without emitting it again. A jump across several dates emits only the
destination day's batch, and a backward date change clears the batch.

Only active authored IDs are saved; automatic school reminders are derived
from the schedule. The built-in and authored namespaces cannot collide.
Game save format 32 includes the reminder state and game-start date; older saves
are intentionally unsupported. The compiled WG bundle has its own format version,
currently 28.

Reminder lifecycle integration is covered by
`node --test tests/timers.test.mjs tests/cafe_job.test.mjs`; all authored reminder
references are also checked by the project WG compiler.

For a notice that first appears at 13:00 on day one and persists until read,
use the same condition for prose and its read choice:

```wg
@when not flags.home_notice_read and (time.day > 1 or (time.day == 1 and time.hour >= 13))
```

After the read choice adds `civil_notice`, the office's completion choice can
clear it and set `home_notice_resolved`. Gate that choice on
`flags.home_notice_read and not flags.home_notice_resolved`. Reminder absence
alone does not prove completion, since the reminder is also absent before the
notice has been read. Rent amounts, deadlines, and penalties remain separate
story/gameplay rules.

## Comments and escaping

```wg
@# This whole line is ignored.
\@if this is prose, not a directive
\:: this is also prose
```

`@#` is a full-line comment, not an inline comment. A comment between two prose
lines does not split their paragraph; use a blank line for that. At the
beginning of a prose line, `\@` and `\::` emit literal `@` and `::` markers.
Within prose, `\@` also escapes inline markers such as `\@br` and `\@change`.

## Validation and editor support

The compiler rejects malformed directives, duplicate single-value fields,
unclosed blocks, duplicate scene, passage, location-contribution, choice, or
choice-group IDs,
invalid expressions and durations, unknown global and local targets, unknown
skill-check target types, target IDs, and difficulties, unknown registered
effect references, hub place keys, explicit hub leave choices, and duplicate
authored place hubs. It checks
`@effect unlock place` keys and `@time-until` path syntax, but not whether that
runtime timestamp value exists. It does not validate other general runtime
paths.

Compilation is whole-project rather than file-local. Scene IDs have one global
namespace. Location-contribution IDs have their own global namespace. Their local choice
and choice-group IDs are validated across all conditional and random branches.
Choice and choice-group IDs are checked across all conditional and random
branches separately within each scene passage. Passage IDs are local to one
scene. The compiler validates all global and local
targets even if their branch is unreachable at runtime.

Effect contracts are centralized in `src/story/wg/shared/effects/registry.js`.
Compiler syntax adapters and runtime handlers are checked against that registry,
so adding an operation requires all three pieces and a missing piece fails the
effect-registry tests. Static references are validated only after every WG file
has been parsed, which permits forward references to reminders and chats.

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

<!-- WG-DIRECTIVE-INDEX:START -->
<!-- Generated from src/story/wg/shared/language.js. -->
| Context | Directives |
| --- | --- |
| Top level | `:: <scene-id> [-> <final-target>]`, `@chat ... @endchat`, `@location ... @endlocation`, `@reminder ... @endreminder`, `@#` |
| Reminder definition | `required @text`, `optional @tone`, `@priority` |
| Location contribution | `leading @when conditions`, `prose`, `interpolation`, `@br`, `conditionals`, `@random ... @or ... @endrandom`, `@choicegroup ... @endchoicegroup`, `@choice ... @endchoice` |
| Scene metadata | `@heading`, `@choices`, `@behavior`, `@system`, `@onenter`, `@hub`, `@place-key`, `@place-tag`, `@location-tag`, `@offer`, `@auto`, `@pool`, `@when`, `@label`, `@icon`, `@hub-text`, `@priority`, `@chance`, `@weight` |
| Passage/navigation | `@passage`, `@next` |
| Scene or passage body | `prose`, `@br`, `trailing inline @change`, `inline and block @if / @elseif / @else / @endif`, `@random / @or / @endrandom`, `passive @check / @success / @failure / @endcheck`, `@effect`, `@change`, `@choicegroup ... @endchoicegroup`, `@choice ... @endchoice` |
| Direct choice | `@icon`, `@time`, `@time-until`, `@event-pool`, `@event-chance`, `@when`, `@require`, `@warning`, `@response ... @endresponse`, `@preview`, `@effect`, `@change` |
| Checked choice | `@icon`, `@event-pool`, `@event-chance`, `@when`, `@require`, `@warning`, `@check`, `@success ... @endsuccess`, `@failure ... @endfailure` |
| Check outcome | `@time`, `@response ... @endresponse`, `@effect` |
| On-enter block | `@effect` |
| Effect operations | `contact add`, `chat start`, `set`, `add`, `flag`, `daily-flag`, `reminder add`, `reminder clear`, `timer start`, `timer restart`, `timer stop`, `unlock place`, `relocate home`, `relocate nearest-place`, `relationship`, `money`, `skill`, `stat`, `grade`, `attendance` |
| Story targets | `global scene ID`, `local .passage`, `@exit`, `@return`, `@leave-place` |
<!-- WG-DIRECTIVE-INDEX:END -->

## Not supported by WG

WG currently has no inline arbitrary JavaScript, Twine widgets, HTML rendering,
loops, includes, user-defined WG macros, localization, automatic resource costs,
outdoor-location unlocking, relocking, undo/history, or hot reloading.
