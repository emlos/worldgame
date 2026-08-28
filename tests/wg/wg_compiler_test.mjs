import { WG_BUNDLE } from "../../src/generated/wg/scenes.js";
import { compileProject } from "../../tools/wg/compile.mjs";
import { WGCompileError } from "../../tools/wg/compiler/diagnostic.js";
import { emitStoryModule } from "../../tools/wg/compiler/emitter.js";
import { parseExpression } from "../../tools/wg/compiler/expressionParser.js";
import {
  parseDuration,
  parseWGDocument,
  parseWGSource,
} from "../../tools/wg/compiler/sourceParser.js";
import { compileStorySources } from "../../tools/wg/compiler/storyCompiler.js";

const failures = [];

function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures.push(label);
  }
}

function captureError(callback) {
  try {
    callback();
    return null;
  } catch (error) {
    return error;
  }
}

function rejects(label, sources, expectedText) {
  const error = captureError(() => compileStorySources(sources));
  check(
    label,
    error instanceof WGCompileError && error.message.includes(expectedText),
  );
}

const expression = parseExpression(
  'player.energy + 5 * 2 >= 20 and location.type in ["urban", "suburban"]',
  { file: "expression.wg", line: 4, column: 5 },
);
check(
  "expression precedence keeps boolean conjunction at the root",
  expression.type === "binary" && expression.operator === "and",
);
check(
  "multiplication binds more tightly than addition and comparison",
  expression.left.operator === ">=" &&
    expression.left.left.operator === "+" &&
    expression.left.left.right.operator === "*",
);
check(
  "list membership compiles to a list AST",
  expression.right.operator === "in" &&
    expression.right.right.type === "list" &&
    expression.right.right.values.length === 2,
);
check(
  "unary expressions compile without authored JavaScript",
  parseExpression("not story.taylor.hurt").type === "unary",
);

check("seconds compile to fractional minutes", parseDuration("30s") === 0.5);
check("compound durations compile to minutes", parseDuration("1h30m") === 90);

const SAMPLE_SOURCE = `@# leading comment

@entry sample.introduction
  @scene intro
  @place-key player_home
  @place-tag housing
  @location-tag residential
  @offer npc taylor
  @label "Spend time with Taylor"
  @icon "📚"
  @hub-text "Taylor waits beside the table."
  @auto enter-place
  @auto enter-location
  @when true
  @when npc.taylor.present
  @priority 25
  @chance 40%
  @weight 3
@endentry

:: intro [event example]
@heading "Introduction"
@choices "What next?"

@onenter
  @effect set story.visit.started true
  @effect flag met-taylor true
  @effect daily-flag introduced_today true
@endonenter

Hello, {{player.name}}.
This continues the same paragraph.

@if story.visit.count >= 2
Welcome back.
@elseif npc.taylor.relationship >= 0.5
Taylor smiles.
@else
Taylor waits.
@endif

@choice continue "Continue" -> next
  @icon "→"
  @time 1h30m free
  @when npc.taylor.present
  @require player.energy >= 10 "You are too tired."
  @warning "This may take a while."
  @preview relationship 0.02 "+Relationship"
  @effect add story.visit.count 1
  @effect relationship taylor 0.02
  @effect money -5
@endchoice

\\@if this line is prose
\\:: this line is also prose

:: next [event]
@kind event
@heading "Next"

Done.

@choice leave "Leave" -> @exit
@endchoice
`;

const sampleScenes = parseWGSource({
  file: "story\\sample.wg",
  source: SAMPLE_SOURCE,
});
const sampleDocument = parseWGDocument({
  file: "story\\sample.wg",
  source: SAMPLE_SOURCE,
});
check("one WG file may contain multiple scenes", sampleScenes.length === 2);
check("one WG file may contain entry declarations", sampleDocument.entries.length === 1);
const sampleEntry = sampleDocument.entries[0];
check(
  "entry selectors and exposure directives compile",
  sampleEntry.sceneId === "intro" &&
    sampleEntry.placeKeys.join(",") === "player_home" &&
    sampleEntry.placeTags.join(",") === "housing" &&
    sampleEntry.locationTags.join(",") === "residential" &&
    sampleEntry.offer.type === "npc" &&
    sampleEntry.offer.npcId === "taylor" &&
    sampleEntry.hubText === "Taylor waits beside the table." &&
    sampleEntry.automaticTriggers.join(",") === "enter-place,enter-location",
);
check(
  "entry conditions and random-selection metadata compile",
  sampleEntry.conditions.length === 2 &&
    sampleEntry.priority === 25 &&
    sampleEntry.chance === 0.4 &&
    sampleEntry.weight === 3,
);
check(
  "source paths are normalized for deterministic output",
  sampleScenes[0].source.file === "story/sample.wg",
);
check(
  "scene metadata and tags compile",
  sampleScenes[0].heading === "Introduction" &&
    sampleScenes[0].choiceHeading === "What next?" &&
    sampleScenes[0].tags.join(",") === "event,example",
);
check(
  "entry effects remain separate from renderable body nodes",
  sampleScenes[0].onEnter.length === 3 &&
    sampleScenes[0].onEnter[0].op === "set" &&
    sampleScenes[0].onEnter[1].op === "flag" &&
    sampleScenes[0].onEnter[2].op === "daily-flag",
);

const introduction = sampleScenes[0].body[0];
check(
  "consecutive prose lines form one paragraph",
  introduction.type === "paragraph" &&
    introduction.parts.at(-1).value === ". This continues the same paragraph.",
);
check(
  "interpolations compile to path and filter data",
  introduction.parts.some(
    (part) =>
      part.type === "interpolation" && part.path.join(".") === "player.name",
  ),
);

const conditional = sampleScenes[0].body.find((node) => node.type === "if");
check(
  "if, elseif, and else branches compile",
  conditional.branches.length === 2 && conditional.elseNodes.length === 1,
);
const compiledChoice = sampleScenes[0].body.find(
  (node) => node.type === "choice",
);
check(
  "choice presentation and timing directives compile",
    compiledChoice.icon === "→" &&
    compiledChoice.durationMinutes === 90 &&
    compiledChoice.energyFree === true &&
    compiledChoice.warning === "This may take a while.",
);
check(
  "choice visibility, requirements, previews, and effects compile",
    compiledChoice.when.type === "path" &&
    compiledChoice.requirements.length === 1 &&
    compiledChoice.previews.length === 1 &&
    compiledChoice.effects.length === 3 &&
    compiledChoice.effects[2].op === "money" &&
    compiledChoice.effects[2].amount === -5,
);
check(
  "escaped directive markers remain prose",
  sampleScenes[0].body.some(
    (node) =>
      node.type === "paragraph" &&
      node.parts.some(
        (part) => part.type === "text" && part.value.startsWith("@if"),
      ),
  ),
);

const sampleBundle = compileStorySources([
  { file: "story/sample.wg", source: SAMPLE_SOURCE },
]);
check(
  "linked bundles use a versioned scene map",
  sampleBundle.formatVersion === 8 &&
    Object.keys(sampleBundle.scenes).join(",") === "intro,next" &&
    Object.keys(sampleBundle.sequences).length === 0 &&
    Object.keys(sampleBundle.entries).join(",") === "sample.introduction",
);

const GROUPED_CHOICE_SOURCE = `:: grouped.example
@heading "Grouped choices"
@choices "Other"

@choicegroup activities "Activities"
Room descriptions may remain inside a choice group.
@choice room "Visit a room" -> @exit
@endchoice
@if true
@choice current "Do the current activity" -> @exit
@endchoice
@endif
@endchoicegroup

@choice leave "Leave" -> @exit
@endchoice`;
const groupedScene = parseWGSource({
  file: "story/grouped.wg",
  source: GROUPED_CHOICE_SOURCE,
})[0];
const groupedNode = groupedScene.body.find(
  (node) => node.type === "choice-group",
);
check(
  "choice groups compile stable ids, headings, prose, and conditional choices",
  groupedNode.id === "activities" &&
    groupedNode.heading === "Activities" &&
    groupedNode.nodes.some((node) => node.type === "paragraph") &&
    groupedNode.nodes.some((node) => node.type === "choice") &&
    groupedNode.nodes.some((node) => node.type === "if"),
);
check(
  "choice-group targets link through the ordinary compiler walk",
  Boolean(
    compileStorySources([
      { file: "story/grouped.wg", source: GROUPED_CHOICE_SOURCE },
    ]),
  ),
);

const SCHOOL_CHOICE_SOURCE = `:: school.example
@heading "School"
@choice wait "Wait for class" -> @exit
  @time-until school.nextBoundaryAt
  @effect attendance english 1
  @effect grade english 1
@endchoice`;
const schoolChoice = parseWGSource({
  file: "story/school.wg",
  source: SCHOOL_CHOICE_SOURCE,
})[0].body.find((node) => node.type === "choice");
check(
  "dynamic timing compiles a runtime timestamp path",
  schoolChoice.timeUntilPath.join(".") === "school.nextBoundaryAt" &&
    schoolChoice.durationMinutes === 0,
);
check(
  "school attendance and grade effects compile against registered subjects",
  schoolChoice.effects[0].op === "attendance" &&
    schoolChoice.effects[0].id === "english" &&
    schoolChoice.effects[1].op === "grade" &&
    schoolChoice.effects[1].amount === 1,
);

const sequenceBundle = compileStorySources([
  {
    file: "story/sequence.wg",
    source: `@sequence example.flow -> @exit
@heading "Example flow"

First passage.
@next

@passage decision
Second passage.
@choice finish "Finish" -> .ending
@endchoice

@passage ending
Final passage.
@next "Return"
@endsequence`,
  },
]);
const exampleSequence = sequenceBundle.sequences["example.flow"];
check(
  "sequences compile ordered anonymous and named passages",
  exampleSequence?.passages.map((passage) => passage.id).join(",") ===
    "p1,decision,ending",
);
check(
  "bare @next links to the following passage and the sequence final target",
  exampleSequence?.passages[0].next?.target === ".decision" &&
    exampleSequence?.passages[2].next?.target === "@exit" &&
    exampleSequence?.passages[2].next?.label === "Return",
);
check(
  "sequence choices retain local passage targets",
  exampleSequence?.passages[1].body.find((node) => node.type === "choice")?.target ===
    ".ending",
);

const HUB_SOURCE = `@entry place.hub.home
  @scene place.home
  @place-key player_home
  @hub place
@endentry

:: place.home [place hub]
@kind place
@heading "Home"
@choice rest "Rest" -> place.home
@endchoice
@choice leave "Leave" -> @leave-place
@endchoice`;
const hubDocument = parseWGDocument({
  file: "story/places/home.wg",
  source: HUB_SOURCE,
});
const hubBundle = compileStorySources([
  { file: "story/places/home.wg", source: HUB_SOURCE },
]);
check(
  "place hubs and authoritative leave targets compile",
  hubDocument.entries[0].hub?.type === "place" &&
    hubBundle.entries["place.hub.home"].sceneId === "place.home" &&
    hubBundle.scenes["place.home"].body.some(
      (node) => node.type === "choice" && node.target === "@leave-place",
  ),
);

const CHECK_SOURCE = [
  ":: check.start",
  "@heading \"Check\"",
  "@choice jar \"Open the jar\"",
  "  @check strength tricky",
  "  @success -> check.success",
  "    @time 1m free",
  "    @response",
  "      The lid pops open.",
  "    @endresponse",
  "    @effect skill strength 0.1",
  "    @effect stat energy -2",
  "  @endsuccess",
  "  @failure -> check.failure",
  "    @time 2m",
  "    @response",
  "      The lid refuses to move.",
  "    @endresponse",
  "    @effect flag jar_stuck true",
  "  @endfailure",
  "@endchoice",
  ":: check.success",
  "@heading \"Opened\"",
  ":: check.failure",
  "@heading \"Stuck\"",
].join("\n");
const checkedDocument = parseWGDocument({
  file: "story/check.wg",
  source: CHECK_SOURCE,
});
const checkedChoice = checkedDocument.scenes[0].body.find(
  (node) => node.type === "choice",
);
check(
  "skill checks compile their skill and difficulty",
  checkedChoice.target === undefined &&
    checkedChoice.check.skillId === "strength" &&
    checkedChoice.check.difficultyId === "tricky",
);
check(
  "skill-check outcomes compile separate targets, times, and effects",
  checkedChoice.outcomes.success.target === "check.success" &&
    checkedChoice.outcomes.success.durationMinutes === 1 &&
    checkedChoice.outcomes.success.energyFree === true &&
    checkedChoice.outcomes.success.responses[0].paragraphs.length === 1 &&
    checkedChoice.outcomes.success.effects[0].op === "skill" &&
    checkedChoice.outcomes.success.effects[1].op === "stat" &&
    checkedChoice.outcomes.failure.target === "check.failure" &&
    checkedChoice.outcomes.failure.durationMinutes === 2 &&
    checkedChoice.outcomes.failure.responses[0].paragraphs.length === 1 &&
    checkedChoice.outcomes.failure.energyFree === false,
);
check(
  "skill-check outcome targets link across the bundle",
  Boolean(compileStorySources([{ file: "story/check.wg", source: CHECK_SOURCE }])),
);

const RESPONSE_SOURCE = `:: response.test
@heading "Responses"
@choice talk "Talk" -> @exit
  @response
    Taylor smiles.
  @endresponse
  @response
    {{npc.taylor.subject|cap}} waves.

    You wave back.
  @endresponse
@endchoice`;
const responseChoice = parseWGDocument({
  file: "story/response.wg",
  source: RESPONSE_SOURCE,
}).scenes[0].body.find((node) => node.type === "choice");
check(
  "direct choices compile repeatable prose response variants",
  responseChoice.responses.length === 2 &&
    responseChoice.responses[0].paragraphs.length === 1 &&
    responseChoice.responses[1].paragraphs.length === 2 &&
    responseChoice.responses[1].paragraphs[0].parts[0].type === "interpolation",
);

const sourceA = `:: alpha\n@heading "Alpha"\n@choice leave "Leave" -> @exit\n@endchoice`;
const sourceZ = `:: zeta\n@heading "Zeta"\n@choice leave "Leave" -> @exit\n@endchoice`;
const emittedForward = emitStoryModule(
  compileStorySources([
    { file: "story/z.wg", source: sourceZ },
    { file: "story/a.wg", source: sourceA },
  ]),
);
const emittedReverse = emitStoryModule(
  compileStorySources([
    { file: "story/a.wg", source: sourceA },
    { file: "story/z.wg", source: sourceZ },
  ]),
);
check("compiler output is deterministic", emittedForward === emittedReverse);
check(
  "generated modules contain only a data export",
  emittedForward.startsWith("// Generated by tools/wg/compile.mjs") &&
    emittedForward.includes("export const WG_BUNDLE =") &&
    !emittedForward.includes("function (") &&
    !emittedForward.includes("eval("),
);

rejects(
  "scenes require headings",
  [{ file: "missing-heading.wg", source: ":: intro\nSome prose." }],
  "Scene requires @heading",
);
rejects(
  "scene headings cannot be empty",
  [{ file: "empty-heading.wg", source: ':: intro\n@heading ""' }],
  "Scene heading cannot be empty",
);
rejects(
  "duplicate scene ids are rejected across files",
  [
    { file: "one.wg", source: sourceA },
    { file: "two.wg", source: sourceA },
  ],
  "Duplicate scene id 'alpha'",
);
rejects(
  "duplicate entry ids are rejected across files",
  [
    {
      file: "one.wg",
      source: `@entry same\n@scene alpha\n@auto enter-location\n@endentry\n${sourceA}`,
    },
    {
      file: "two.wg",
      source: `@entry same\n@scene zeta\n@auto enter-location\n@endentry\n${sourceZ}`,
    },
  ],
  "Duplicate entry id 'same'",
);
rejects(
  "entry scene targets must exist",
  [
    {
      file: "entry-target.wg",
      source: `@entry bad\n@scene missing\n@auto enter-location\n@endentry\n${sourceA}`,
    },
  ],
  "Unknown entry target 'missing'",
);
rejects(
  "entries require a hub, offer, or automatic trigger",
  [
    {
      file: "entry-exposure.wg",
      source: `@entry bad\n@scene alpha\n@endentry\n${sourceA}`,
    },
  ],
  "Entry requires @hub, @offer, or @auto",
);
rejects(
  "offered entries require labels",
  [
    {
      file: "entry-label.wg",
      source: `@entry bad\n@scene alpha\n@offer place\n@endentry\n${sourceA}`,
    },
  ],
  "Offered entries require @label",
);
rejects(
  "place hubs require a place selector",
  [
    {
      file: "hub-selector.wg",
      source: HUB_SOURCE.replace("  @place-key player_home\n", ""),
    },
  ],
  "Place hub entries require @place-key or @place-tag",
);
rejects(
  "place hubs must reference place scenes",
  [
    {
      file: "hub-kind.wg",
      source: HUB_SOURCE.replace("@kind place\n", ""),
    },
  ],
  "must reference a scene with @kind place",
);
rejects(
  "a place key cannot have two authored hubs",
  [
    { file: "hub-one.wg", source: HUB_SOURCE },
    {
      file: "hub-two.wg",
      source: HUB_SOURCE
        .replace("place.hub.home", "place.hub.home-two")
        .replaceAll("place.home", "place.home-two"),
    },
  ],
  "Duplicate place hub for 'player_home'",
);
rejects(
  "entry chance stays within its probability range",
  [
    {
      file: "entry-chance.wg",
      source: `@entry bad\n@scene alpha\n@auto enter-location\n@chance 125%\n@endentry\n${sourceA}`,
    },
  ],
  "@chance must be between 0 and 1 or a percentage",
);
rejects(
  "entry weights must be positive",
  [
    {
      file: "entry-weight.wg",
      source: `@entry bad\n@scene alpha\n@auto enter-location\n@weight 0\n@endentry\n${sourceA}`,
    },
  ],
  "@weight must be a positive number",
);
rejects(
  "duplicate choice ids are rejected across conditional branches",
  [
    {
      file: "duplicate-choice.wg",
      source: `:: intro
@heading "Intro"
@if true
@choice same "One" -> @exit
@endchoice
@else
@choice same "Two" -> @exit
@endchoice
@endif`,
    },
  ],
  "Duplicate choice id 'same'",
);
rejects(
  "duplicate choice-group ids are rejected",
  [
    {
      file: "duplicate-choice-group.wg",
      source: `:: intro
@heading "Intro"
@choicegroup same "First"
@choice one "One" -> @exit
@endchoice
@endchoicegroup
@choicegroup same "Second"
@choice two "Two" -> @exit
@endchoice
@endchoicegroup`,
    },
  ],
  "Duplicate choice-group id 'same'",
);
rejects(
  "choice groups require at least one choice",
  [
    {
      file: "empty-choice-group.wg",
      source: `:: intro
@heading "Intro"
@choicegroup empty "Empty"
Only prose.
@endchoicegroup`,
    },
  ],
  "@choicegroup requires at least one @choice",
);
rejects(
  "choice groups cannot be nested",
  [
    {
      file: "nested-choice-group.wg",
      source: `:: intro
@heading "Intro"
@choicegroup outer "Outer"
@choicegroup inner "Inner"
@choice one "One" -> @exit
@endchoice
@endchoicegroup
@endchoicegroup`,
    },
  ],
  "@choicegroup blocks cannot be nested",
);
rejects(
  "unknown target scenes are rejected",
  [
    {
      file: "unknown-target.wg",
      source: `:: intro
@heading "Intro"
@choice next "Next" -> missing
@endchoice`,
    },
  ],
  "Unknown story target 'missing'",
);
rejects(
  "unclosed condition blocks are rejected",
  [
    {
      file: "unclosed-if.wg",
      source: `:: intro\n@heading "Intro"\n@if true\nNever ends.`,
    },
  ],
  "Unclosed @if block",
);
rejects(
  "unclosed choice blocks are rejected",
  [
    {
      file: "unclosed-choice.wg",
      source: `:: intro\n@heading "Intro"\n@choice stay "Stay" -> @exit`,
    },
  ],
  "Unclosed @choice block",
);
rejects(
  "malformed durations are rejected",
  [
    {
      file: "duration.wg",
      source: `:: intro
@heading "Intro"
@choice wait "Wait" -> @exit
@time tomorrow
@endchoice`,
    },
  ],
  "Invalid duration 'tomorrow'",
);
rejects(
  "unknown time modifiers are rejected",
  [
    {
      file: "time-modifier.wg",
      source: `:: intro
@heading "Intro"
@choice wait "Wait" -> @exit
@time 1h restful
@endchoice`,
    },
  ],
  "Invalid duration '1h restful'",
);
rejects(
  "fixed and dynamic timing cannot be combined",
  [
    {
      file: "duplicate-timing.wg",
      source: SCHOOL_CHOICE_SOURCE.replace(
        "  @time-until school.nextBoundaryAt",
        "  @time 5m\n  @time-until school.nextBoundaryAt",
      ),
    },
  ],
  "Duplicate choice timing directive",
);
rejects(
  "dynamic timing requires a dotted runtime path",
  [
    {
      file: "dynamic-timing.wg",
      source: SCHOOL_CHOICE_SOURCE.replace(
        "school.nextBoundaryAt",
        "nextBoundaryAt",
      ),
    },
  ],
  "@time-until requires a dotted runtime path",
);
rejects(
  "grade effects reject unknown school subjects",
  [
    {
      file: "school-subject.wg",
      source: SCHOOL_CHOICE_SOURCE.replace("grade english", "grade alchemy"),
    },
  ],
  "references unknown school subject 'alchemy'",
);
rejects(
  "attendance effects require positive whole segments",
  [
    {
      file: "school-attendance.wg",
      source: SCHOOL_CHOICE_SOURCE.replace(
        "attendance english 1",
        "attendance english 0.5",
      ),
    },
  ],
  "attendance requires a positive whole number",
);
rejects(
  "malformed interpolation is rejected",
  [
    {
      file: "interpolation.wg",
      source: `:: intro\n@heading "Intro"\nHello, {{player.name}.`,
    },
  ],
  "Unclosed interpolation",
);
rejects(
  "story mutations cannot target arbitrary game objects",
  [
    {
      file: "effect.wg",
      source: `:: intro
@heading "Intro"
@onenter
@effect set player.energy 100
@endonenter`,
    },
  ],
  "may only target story.*",
);
rejects(
  "money effects require a numeric amount",
  [
    {
      file: "money-effect.wg",
      source: `:: intro
@heading "Intro"
@onenter
@effect money plenty
@endonenter`,
    },
  ],
  "Unknown or malformed @effect",
);
rejects(
  "skill checks reject unknown skills",
  [{ file: "check-skill.wg", source: CHECK_SOURCE.replace("@check strength", "@check unknown") }],
  "@check references unknown skill 'unknown'",
);
rejects(
  "skill checks reject unknown difficulties",
  [{ file: "check-difficulty.wg", source: CHECK_SOURCE.replace("strength tricky", "strength absurd") }],
  "@check references unknown difficulty 'absurd'",
);
rejects(
  "skill checks require both outcomes",
  [
    {
      file: "check-outcomes.wg",
      source: CHECK_SOURCE.replace(
        [
          "  @failure -> check.failure",
          "    @time 2m",
          "    @response",
          "      The lid refuses to move.",
          "    @endresponse",
          "    @effect flag jar_stuck true",
          "  @endfailure",
        ].join("\n"),
        "",
      ),
    },
  ],
  "Skill checks require both @success and @failure outcomes",
);
rejects(
  "checked choices reject outcome previews",
  [
    {
      file: "check-preview.wg",
      source: CHECK_SOURCE.replace(
        "  @success -> check.success",
        "  @preview skill 1 \"Hidden\"\n  @success -> check.success",
      ),
    },
  ],
  "cannot use @preview",
);
rejects(
  "skill-check outcome scene targets must exist",
  [
    {
      file: "check-target.wg",
      source: CHECK_SOURCE.replace("@success -> check.success", "@success -> missing"),
    },
  ],
  "Unknown story target 'missing'",
);
rejects(
  "sequences require headings",
  [
    {
      file: "sequence-heading.wg",
      source: `@sequence example.flow -> @exit\nProse.\n@next\n@endsequence`,
    },
  ],
  "Sequence requires @heading",
);
rejects(
  "sequence final targets must exist",
  [
    {
      file: "sequence-final.wg",
      source: `@sequence example.flow -> missing\n@heading "Flow"\nProse.\n@next\n@endsequence`,
    },
  ],
  "Unknown story target 'missing'",
);
rejects(
  "local passage targets must exist in their sequence",
  [
    {
      file: "sequence-local.wg",
      source: `@sequence example.flow -> @exit\n@heading "Flow"\n@choice next "Next" -> .missing\n@endchoice\n@endsequence`,
    },
  ],
  "Unknown passage target '.missing'",
);
rejects(
  "local passage targets are rejected in ordinary scenes",
  [
    {
      file: "scene-local.wg",
      source: `:: intro\n@heading "Intro"\n@choice next "Next" -> .missing\n@endchoice`,
    },
  ],
  "only valid inside a sequence",
);
rejects(
  "duplicate sequence passage ids are rejected",
  [
    {
      file: "sequence-duplicate.wg",
      source: `@sequence example.flow -> @exit\n@heading "Flow"\n@passage same\nFirst.\n@passage same\nSecond.\n@endsequence`,
    },
  ],
  "Duplicate passage id 'same'",
);
rejects(
  "unknown directives are rejected",
  [
    {
      file: "directive.wg",
      source: `:: intro\n@heading "Intro"\n@widget magic`,
    },
  ],
  "Unexpected @widget",
);

const locatedError = captureError(() =>
  compileStorySources([
    {
      file: "story/location.wg",
      source: `:: intro\n@heading "Intro"\n@if player.energy >\n@endif`,
    },
  ]),
);
check(
  "compiler diagnostics include source file and line",
  locatedError instanceof WGCompileError &&
    locatedError.message.startsWith("story/location.wg:3:"),
);

check(
  "the committed example generated all linked passages",
  ["taylor.study.back", "taylor.study.mess", "taylor.study.peek"].every(
    (sceneId) => WG_BUNDLE.scenes[sceneId],
  ),
);
check(
  "the committed example generated its world entry",
  WG_BUNDLE.entries["home.taylor-study"]?.sceneId === "taylor.study.peek",
);

let generatedCheckError = null;
try {
  await compileProject({ check: true });
} catch (error) {
  generatedCheckError = error;
}
check("the committed generated module is current", generatedCheckError === null);

if (failures.length) {
  console.error("\nWG compiler failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All WG compiler tests passed.");
}
