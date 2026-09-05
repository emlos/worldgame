import {
  WG_EFFECT_KEYWORDS,
  WG_EFFECT_SYNTAX,
  WG_EFFECT_SYNTAX_WORDS,
} from "./effects/registry.js";
import {
  WG_DIRECTIVE_NAME_PATTERN,
  WG_DOTTED_PATH_PATTERN,
  WG_DURATION_PATTERN,
  WG_DURATION_TOKEN_PATTERN,
  WG_DURATION_UNITS,
  WG_EXPRESSION_BINARY_PRECEDENCE,
  WG_EXPRESSION_DOUBLE_OPERATORS,
  WG_EXPRESSION_LITERALS,
  WG_EXPRESSION_SINGLE_OPERATORS,
  WG_EXPRESSION_UNARY_OPERATORS,
  WG_EXPRESSION_WORD_OPERATORS,
  WG_ID_PATTERN,
  WG_NUMBER_PATTERN,
  WG_PASSAGE_ID_PATTERN,
  WG_PATH_SEGMENT_PATTERN,
  WG_PERCENTAGE_PATTERN,
  WG_PROBABILITY_DECIMAL_PATTERN,
  WG_QUOTED_STRING_PATTERN,
  WG_SIMPLE_ID_PATTERN,
} from "./languageCore.js";

export * from "./languageCore.js";

function freezeList(values) {
  return Object.freeze([...values]);
}

export const WG_STORY_TARGETS = Object.freeze({
  exit: "@exit",
  return: "@return",
  leavePlace: "@leave-place",
});
export const WG_STORY_TARGET_PATTERN =
  `(?:${Object.values(WG_STORY_TARGETS).join("|")}|\\.${WG_PASSAGE_ID_PATTERN}|${WG_ID_PATTERN})`;
export const WG_SCENE_FINAL_TARGET_PATTERN =
  `(?:${WG_STORY_TARGETS.exit}|${WG_STORY_TARGETS.return}|${WG_ID_PATTERN})`;
export const WG_NEXT_TARGET_PATTERN =
  `(?:${WG_STORY_TARGETS.exit}|${WG_STORY_TARGETS.return}|\\.${WG_PASSAGE_ID_PATTERN}|${WG_ID_PATTERN})`;

export const WG_AUTO_TRIGGER = Object.freeze({
  enterPlace: "enter-place",
  enterLocation: "enter-location",
  leavePlace: "leave-place",
});
export const WG_AUTO_TRIGGERS = freezeList(Object.values(WG_AUTO_TRIGGER));
export const WG_REMINDER_TONES = freezeList(["info", "warning"]);
export const WG_CHECK_TARGET_TYPES = freezeList(["skill", "grade"]);

export const WG_SCENE_METADATA_DIRECTIVES = freezeList([
  "heading",
  "choices",
  "behavior",
  "system",
  "onenter",
  "hub",
  "place-key",
  "place-tag",
  "location-tag",
  "offer",
  "auto",
  "pool",
  "when",
  "label",
  "icon",
  "hub-text",
  "priority",
  "chance",
  "weight",
]);

export const WG_SINGLE_SCENE_METADATA_DIRECTIVES = freezeList([
  "heading",
  "choices",
  "behavior",
  "system",
  "onenter",
  "hub",
  "offer",
  "label",
  "icon",
  "hub-text",
  "priority",
  "chance",
  "weight",
]);

export const WG_CHOICE_SINGLE_DIRECTIVES = freezeList([
  "icon",
  "when",
  "warning",
  "check",
  "event-pool",
  "event-chance",
]);

export const WG_CHAT_CHOICE_DIRECTIVES = freezeList([
  "send",
  "when",
  "require",
  "effect",
]);

export const WG_EXPRESSION_DIRECTIVES = freezeList([
  "if",
  "elseif",
  "when",
  "require",
]);

export const WG_PROPERTY_DIRECTIVES = freezeList([
  "text",
  "tone",
  ...WG_SCENE_METADATA_DIRECTIVES.filter((name) => name !== "onenter"),
  "time",
  "time-until",
  "event-pool",
  "event-chance",
  "warning",
  "preview",
  "check",
]);

export const WG_BLOCKS = Object.freeze([
  { open: "chat", close: "endchat" },
  { open: "message", close: "endmessage" },
  { open: "reminder", close: "endreminder" },
  { open: "location", close: "endlocation" },
  { open: "choice", close: "endchoice" },
  { open: "choicegroup", close: "endchoicegroup" },
  { open: "if", close: "endif", branches: ["elseif", "else"] },
  { open: "success", close: "endsuccess" },
  { open: "failure", close: "endfailure" },
  { open: "response", close: "endresponse" },
  { open: "random", close: "endrandom", branches: ["or"] },
  { open: "onenter", close: "endonenter", bare: true },
  { open: "check", close: "endcheck", branches: ["success", "failure"] },
]);

export const WG_DIRECTIVE_CONTEXTS = Object.freeze([
  {
    label: "Top level",
    syntax: [
      ":: <scene-id> [-> <final-target>]",
      "@chat ... @endchat",
      "@location ... @endlocation",
      "@reminder ... @endreminder",
      "@#",
    ],
  },
  {
    label: "Reminder definition",
    syntax: ["required @text", "optional @tone", "@priority"],
  },
  {
    label: "Location contribution",
    syntax: [
      "leading @when conditions",
      "prose",
      "interpolation",
      "@br",
      "conditionals",
      "@random ... @or ... @endrandom",
      "@choicegroup ... @endchoicegroup",
      "@choice ... @endchoice",
    ],
  },
  {
    label: "Scene metadata",
    syntax: WG_SCENE_METADATA_DIRECTIVES.map((name) => `@${name}`),
  },
  { label: "Passage/navigation", syntax: ["@passage", "@next"] },
  {
    label: "Scene or passage body",
    syntax: [
      "prose",
      "@br",
      "trailing inline @change",
      "inline and block @if / @elseif / @else / @endif",
      "@random / @or / @endrandom",
      "passive @check / @success / @failure / @endcheck",
      "@effect",
      "@change",
      "@choicegroup ... @endchoicegroup",
      "@choice ... @endchoice",
    ],
  },
  {
    label: "Direct choice",
    syntax: [
      "@icon",
      "@time",
      "@time-until",
      "@event-pool",
      "@event-chance",
      "@when",
      "@require",
      "@warning",
      "@response ... @endresponse",
      "@preview",
      "@effect",
      "@change",
    ],
  },
  {
    label: "Checked choice",
    syntax: [
      "@icon",
      "@event-pool",
      "@event-chance",
      "@when",
      "@require",
      "@warning",
      "@check",
      "@success ... @endsuccess",
      "@failure ... @endfailure",
    ],
  },
  {
    label: "Check outcome",
    syntax: ["@time", "@response ... @endresponse", "@effect"],
  },
  { label: "On-enter block", syntax: ["@effect"] },
  {
    label: "Effect operations",
    syntax: WG_EFFECT_SYNTAX,
  },
  {
    label: "Story targets",
    syntax: ["global scene ID", "local .passage", ...Object.values(WG_STORY_TARGETS)],
  },
]);

const blockNames = WG_BLOCKS.flatMap(({ open, close, branches = [] }) => [
  open,
  ...branches,
  close,
]);

export const WG_DIRECTIVE_NAMES = freezeList(new Set([
  "#",
  "br",
  "passage",
  "next",
  "npc",
  "send",
  "wait",
  "finish",
  "text",
  "tone",
  "require",
  "warning",
  "preview",
  "effect",
  "change",
  "time",
  "time-until",
  "event-pool",
  "event-chance",
  ...WG_SCENE_METADATA_DIRECTIVES,
  ...blockNames,
]));

export const WG_LANGUAGE = Object.freeze({
  patterns: Object.freeze({
    id: WG_ID_PATTERN,
    simpleId: WG_SIMPLE_ID_PATTERN,
    passageId: WG_PASSAGE_ID_PATTERN,
    pathSegment: WG_PATH_SEGMENT_PATTERN,
    dottedPath: WG_DOTTED_PATH_PATTERN,
    quotedString: WG_QUOTED_STRING_PATTERN,
    directiveName: WG_DIRECTIVE_NAME_PATTERN,
    number: WG_NUMBER_PATTERN,
    duration: WG_DURATION_PATTERN,
    durationToken: WG_DURATION_TOKEN_PATTERN,
    percentage: WG_PERCENTAGE_PATTERN,
    probabilityDecimal: WG_PROBABILITY_DECIMAL_PATTERN,
    storyTarget: WG_STORY_TARGET_PATTERN,
    sceneFinalTarget: WG_SCENE_FINAL_TARGET_PATTERN,
    nextTarget: WG_NEXT_TARGET_PATTERN,
  }),
  directives: WG_DIRECTIVE_NAMES,
  expressionDirectives: WG_EXPRESSION_DIRECTIVES,
  propertyDirectives: WG_PROPERTY_DIRECTIVES,
  directiveContexts: WG_DIRECTIVE_CONTEXTS,
  blocks: WG_BLOCKS,
  enums: Object.freeze({
    automaticTriggers: WG_AUTO_TRIGGERS,
    reminderTones: WG_REMINDER_TONES,
    checkTargetTypes: WG_CHECK_TARGET_TYPES,
  }),
  storyTargets: WG_STORY_TARGETS,
  expression: Object.freeze({
    binaryPrecedence: WG_EXPRESSION_BINARY_PRECEDENCE,
    unaryOperators: WG_EXPRESSION_UNARY_OPERATORS,
    wordOperators: WG_EXPRESSION_WORD_OPERATORS,
    doubleOperators: WG_EXPRESSION_DOUBLE_OPERATORS,
    singleOperators: WG_EXPRESSION_SINGLE_OPERATORS,
    literals: WG_EXPRESSION_LITERALS,
  }),
  durationUnits: WG_DURATION_UNITS,
  effectKeywords: WG_EFFECT_KEYWORDS,
  effectSyntaxWords: WG_EFFECT_SYNTAX_WORDS,
});
