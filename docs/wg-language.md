# WG language MVP

WG is Worldgame's text-first authored-story format. Source files live under
`story/**/*.wg`; `node tools/wg/compile.mjs` compiles them into the pure-data
ES module at `src/generated/wg/scenes.js`.

The generated module is committed but never edited by hand. It is story IR,
not a finished runtime Scene. The runtime materializer evaluates the IR against
a `Game` and passes the result through the existing Scene and Choice contracts.

## Scenes

Each file is UTF-8 and may contain multiple scenes:

```wg
:: taylor.study.peek [event taylor study]
@heading "Taylor's room"
@choices "What do you do?"

Taylor looks up from the textbook.
```

- `:: scene.id` starts a scene and the next header ends it.
- Scene IDs use lowercase letters, numbers, `_`, `-`, and `.`.
- IDs must be unique across every `.wg` file.
- Header tags are optional compiler metadata.
- `@kind` defaults to `event`.
- `@heading "..."` is required.
- `@choices "..."` defaults to `"Choices"`.
- Metadata must appear before prose, conditions, or choices.

## Prose and interpolation

Ordinary lines are prose. Blank lines separate paragraphs; consecutive lines
inside a paragraph are joined with a space. WG does not interpret HTML.

```wg
Hello, {{player.name}}.
{{npc.taylor.subject|cap}} closes {{npc.taylor.dependent}} book.
```

Interpolations contain a dotted path and optionally `|cap`. A line beginning
with `\@` or `\::` emits the escaped marker as prose. `@#` starts a compiler
comment.

## Conditions

```wg
@if story.taylor.hurt >= 1
Taylor frowns.
@elseif npc.taylor.relationship >= 0.5
Taylor smiles.
@else
Taylor returns to the textbook.
@endif
```

Conditions may be nested and may contain prose or choices. Expressions support:

- numbers, double-quoted strings, `true`, `false`, and `null`;
- dotted paths and list literals;
- `+`, `-`, `*`, `/`, and `%`;
- `==`, `!=`, `<`, `<=`, `>`, `>=`, and `in`;
- `not`, `and`, `or`, and parentheses.

Expressions compile to data ASTs. WG never emits or evaluates authored
JavaScript.

Runtime paths currently expose `story.*`, evaluated `player` stats and
pronouns, `npc.<id>` identity/pronouns/relationship/presence, and active game
flags through `flags.<id>`. A missing path evaluates to `undefined`, which is
false in conditions; interpolating a missing path is a runtime error.

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

- Choice IDs are required and unique within their scene.
- Targets are another scene ID or the reserved target `@exit`.
- `@time` accepts combinations of hours, minutes, and seconds such as `30s`,
  `5m`, `1h`, or `1h30m`.
- `@when` hides the choice when its expression is false.
- Every `@require` must pass; otherwise the choice remains visible but disabled
  with the supplied reason.
- `@warning` and `@preview` are display metadata.
- `@effect` contains authoritative typed effects for the future runtime.

## Entry effects

```wg
@onenter
  @effect set story.daily.taylorStudyCompany true
@endonenter
```

Entry effects are kept separate from rendering because scene materialization
must remain pure. The runtime will execute them once during the authoritative
transition into a passage, never while rebuilding a scene.

## MVP effects

```wg
@effect set story.some.path true
@effect add story.some.counter 1
@effect flag met-taylor true
@effect relationship taylor 0.02
```

`set` and `add` currently target only `story.*`. Other game mutations will be
added through explicit effect types as their systems stabilize.

## Comments and escaping

```wg
@# This line is ignored.
\@if this is prose, not a directive
\:: this is also prose
```

## Compiler commands

```text
node tools/wg/compile.mjs
node tools/wg/compile.mjs --check
```

The normal command writes the generated module only when its contents change.
`--check` performs no write and fails when the committed output is missing or
out of date.

The compiler rejects malformed directives, unclosed blocks, duplicate scene or
choice IDs, invalid expressions or durations, and unknown choice targets. It
does not attempt to validate all future runtime state paths or freeze generated
data.

## Outside the MVP

Arbitrary JavaScript, Twine widgets, HTML, loops, includes, user-defined macros,
random blocks, localization, automatic resource costs, undo/history, hot
reloading, and editor tooling are intentionally deferred.
