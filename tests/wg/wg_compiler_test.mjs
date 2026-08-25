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
  @time 1h30m
  @when npc.taylor.present
  @require player.energy >= 10 "You are too tired."
  @warning "This may take a while."
  @preview relationship 0.02 "+Relationship"
  @effect add story.visit.count 1
  @effect relationship taylor 0.02
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
  sampleScenes[0].onEnter.length === 2 &&
    sampleScenes[0].onEnter[0].op === "set" &&
    sampleScenes[0].onEnter[1].op === "flag",
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
    compiledChoice.warning === "This may take a while.",
);
check(
  "choice visibility, requirements, previews, and effects compile",
  compiledChoice.when.type === "path" &&
    compiledChoice.requirements.length === 1 &&
    compiledChoice.previews.length === 1 &&
    compiledChoice.effects.length === 2,
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
  sampleBundle.formatVersion === 2 &&
    Object.keys(sampleBundle.scenes).join(",") === "intro,next" &&
    Object.keys(sampleBundle.entries).join(",") === "sample.introduction",
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
  "Unknown entry scene 'missing'",
);
rejects(
  "entries require an offer or automatic trigger",
  [
    {
      file: "entry-exposure.wg",
      source: `@entry bad\n@scene alpha\n@endentry\n${sourceA}`,
    },
  ],
  "Entry requires @offer or @auto",
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
  "Unknown target scene 'missing'",
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
  Object.keys(WG_BUNDLE.scenes).join(",") ===
    "taylor.study.back,taylor.study.mess,taylor.study.peek",
);
check(
  "the committed example generated its world entry",
  Object.keys(WG_BUNDLE.entries).join(",") === "home.taylor-study" &&
    WG_BUNDLE.entries["home.taylor-study"].sceneId === "taylor.study.peek",
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
