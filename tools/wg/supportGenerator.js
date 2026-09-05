import {
  WG_BLOCKS,
  WG_DIRECTIVE_CONTEXTS,
  WG_EXPRESSION_DIRECTIVES,
  WG_LANGUAGE,
  WG_PROPERTY_DIRECTIVES,
} from "../../src/story/wg/shared/language.js";

function alternatives(values) {
  return [...new Set(values)].join("|");
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function buildWGTextMateGrammar() {
  const { id, passageId, quotedString, dottedPath } = WG_LANGUAGE.patterns;
  const localTarget = `\\.${passageId}`;
  const storyTarget = WG_LANGUAGE.patterns.storyTarget;
  const nextTarget = WG_LANGUAGE.patterns.nextTarget;
  const finalTarget = WG_LANGUAGE.patterns.sceneFinalTarget;
  const effects = alternatives(WG_LANGUAGE.effectSyntaxWords);
  const properties = alternatives(WG_PROPERTY_DIRECTIVES);
  const expressions = alternatives(WG_EXPRESSION_DIRECTIVES);
  const closingAndBranchDirectives = alternatives(
    WG_BLOCKS.flatMap(({ close, branches = [] }) => [close, ...branches]),
  );
  const bareBlockOpenDirectives = alternatives(
    WG_BLOCKS.filter(({ bare }) => bare).map(({ open }) => open),
  );

  return json({
    $schema: "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
    name: "Worldgame WG",
    scopeName: "source.wg",
    patterns: [
      { include: "#comments" },
      { include: "#escaped-markers" },
      { include: "#scene-header" },
      { include: "#chat-directives" },
      { include: "#location-header" },
      { include: "#reminder-header" },
      { include: "#passage-header" },
      { include: "#next-directive" },
      { include: "#choicegroup-header" },
      { include: "#choice-header" },
      { include: "#outcome-header" },
      { include: "#response-header" },
      { include: "#random-directives" },
      { include: "#condition-directives" },
      { include: "#effect-directives" },
      { include: "#property-directives" },
      { include: "#bare-block-directives" },
      { include: "#block-directives" },
      { include: "#inline-conditionals" },
      { include: "#interpolation" },
      { include: "#inline-change" },
      { include: "#prose-break" },
      { include: "#unknown-directives" },
    ],
    repository: {
      "chat-directives": {
        patterns: [
          {
            match: `^(\\s*)(@(chat|npc))\\s+(${id})\\s*$`,
            captures: {
              2: { name: "keyword.control.block.wg" },
              4: { name: "entity.name.type.chat.wg" },
            },
          },
          {
            match: `^(\\s*)(@message)\\s+(${passageId})\\s*$`,
            captures: {
              2: { name: "keyword.control.block.wg" },
              3: { name: "entity.name.type.chat.wg" },
            },
          },
          {
            begin: "^\\s*(@send)\\b",
            beginCaptures: { 1: { name: "keyword.control.wg" } },
            end: "$",
            patterns: [{ include: "#expression" }],
          },
          {
            match: `^\\s*(@wait)\\s+(\\S+)\\s+(->)\\s+(${localTarget})\\s*$`,
            captures: {
              1: { name: "keyword.control.wg" },
              2: { name: "constant.numeric.duration.wg" },
              3: { name: "keyword.operator.arrow.wg" },
              4: { name: "entity.name.section.reference.wg" },
            },
          },
          {
            name: "keyword.control.block.wg",
            match: "^\\s*@(endchat|endmessage|finish)\\s*$",
          },
        ],
      },
      "reminder-header": {
        patterns: [{
          name: "meta.reminder.header.wg",
          match: `^(\\s*)(@reminder)\\s+(${id})\\s*$`,
          captures: {
            2: { name: "keyword.control.block.begin.wg" },
            3: { name: "entity.name.type.reminder.wg" },
          },
        }],
      },
      comments: {
        patterns: [{ name: "comment.line.number-sign.wg", match: "^\\s*@#.*$" }],
      },
      "escaped-markers": {
        patterns: [
          {
            match: "^(\\s*)(\\\\)(?=@|::)",
            captures: { 2: { name: "constant.character.escape.wg" } },
          },
          { name: "constant.character.escape.wg", match: "\\\\@" },
        ],
      },
      "scene-header": {
        patterns: [{
          name: "meta.scene.header.wg",
          match: `^(\\s*)(::)(\\s+)(${id})(?:\\s+(\\[)([^\\]]*)(\\]))?(?:\\s+(->)\\s+(${finalTarget}))?\\s*$`,
          captures: {
            2: { name: "keyword.control.section.wg" },
            4: { name: "entity.name.section.wg" },
            5: { name: "punctuation.definition.annotation.begin.wg" },
            6: { name: "storage.modifier.scene-tag.wg" },
            7: { name: "punctuation.definition.annotation.end.wg" },
            8: { name: "keyword.operator.arrow.wg" },
            9: { name: "entity.name.section.reference.wg" },
          },
        }],
      },
      "location-header": {
        patterns: [{
          name: "meta.location.header.wg",
          match: `^(\\s*)(@location)\\s+(${id})\\s*$`,
          captures: {
            2: { name: "keyword.control.block.begin.wg" },
            3: { name: "entity.name.type.location.wg" },
          },
        }],
      },
      "passage-header": {
        patterns: [{
          name: "meta.passage.header.wg",
          match: `^(\\s*)(@passage)\\s+(${passageId})\\s*$`,
          captures: {
            2: { name: "keyword.control.section.wg" },
            3: { name: "entity.name.section.wg" },
          },
        }],
      },
      "next-directive": {
        patterns: [{
          name: "meta.next.directive.wg",
          match: `^(\\s*)(@next)(?:\\s+(${quotedString}))?(?:\\s+(->)\\s+(${nextTarget}))?\\s*$`,
          captures: {
            2: { name: "keyword.control.flow.wg" },
            3: { name: "string.quoted.double.wg" },
            4: { name: "keyword.operator.arrow.wg" },
            5: { name: "entity.name.section.reference.wg" },
          },
        }],
      },
      "choice-header": {
        patterns: [{
          name: "meta.choice.header.wg",
          match: `^(\\s*)(@choice)\\s+(${id})\\s+(${quotedString})(?:\\s+(->)\\s+(${storyTarget}))?\\s*$`,
          captures: {
            2: { name: "keyword.control.block.begin.wg" },
            3: { name: "entity.name.function.choice.wg" },
            4: { name: "string.quoted.double.wg" },
            5: { name: "keyword.operator.arrow.wg" },
            6: { name: "entity.name.section.reference.wg" },
          },
        }],
      },
      "choicegroup-header": {
        patterns: [{
          name: "meta.choicegroup.header.wg",
          match: `^(\\s*)(@choicegroup)\\s+(${id})\\s+(${quotedString})\\s*$`,
          captures: {
            2: { name: "keyword.control.block.begin.wg" },
            3: { name: "entity.name.type.choicegroup.wg" },
            4: { name: "string.quoted.double.wg" },
          },
        }],
      },
      "outcome-header": {
        patterns: [{
          name: "meta.choice.outcome.header.wg",
          match: `^(\\s*)(@(success|failure))\\s+(->)\\s+(${storyTarget})\\s*$`,
          captures: {
            2: { name: "keyword.control.block.begin.wg" },
            4: { name: "keyword.operator.arrow.wg" },
            5: { name: "entity.name.section.reference.wg" },
          },
        }],
      },
      "response-header": {
        patterns: [{
          name: "meta.choice.response.header.wg",
          match: "^(\\s*)(@response)\\s*$",
          captures: { 2: { name: "keyword.control.block.begin.wg" } },
        }],
      },
      "random-directives": {
        patterns: [{
          name: "keyword.control.random.wg",
          match: "^(\\s*)(@(random|or))\\s*$",
        }],
      },
      "condition-directives": {
        patterns: [{
          name: "meta.expression.directive.wg",
          begin: `^(\\s*)(@(${expressions}))\\b`,
          beginCaptures: { 2: { name: "keyword.control.conditional.wg" } },
          end: "$",
          patterns: [{ include: "#expression" }],
        }],
      },
      "effect-directives": {
        patterns: [{
          name: "meta.effect.directive.wg",
          begin: "^(\\s*)(@(effect|change))\\b",
          beginCaptures: { 2: { name: "keyword.control.effect.wg" } },
          end: "$",
          patterns: [
            { name: "storage.type.effect.wg", match: `\\b(?:${effects})\\b` },
            { include: "#expression" },
          ],
        }],
      },
      "inline-change": {
        patterns: [{
          name: "meta.effect.inline.wg",
          begin: "(?<!\\\\)(@change)(?=\\s|$)",
          beginCaptures: { 1: { name: "keyword.control.effect.wg" } },
          end: "$",
          patterns: [
            { name: "keyword.control.effect.wg", match: "@change(?=\\s|$)" },
            { name: "storage.type.effect.wg", match: `\\b(?:${effects})\\b` },
            { include: "#expression" },
          ],
        }],
      },
      "prose-break": {
        patterns: [
          {
            match: "^(\\s*)(@br)\\s*$",
            captures: { 2: { name: "keyword.control.prose-break.wg" } },
          },
          { name: "keyword.control.prose-break.wg", match: "(?<!\\\\)@br(?=\\s|$)" },
        ],
      },
      "property-directives": {
        patterns: [{
          name: "meta.property.directive.wg",
          begin: `^(\\s*)(@(${properties}))\\b`,
          beginCaptures: { 2: { name: "keyword.other.directive.wg" } },
          end: "$",
          patterns: [{ include: "#expression" }],
        }],
      },
      "block-directives": {
        patterns: [{
          name: "keyword.control.block.wg",
          match: `^\\s*(@(?:${closingAndBranchDirectives}))\\s*$`,
        }],
      },
      "bare-block-directives": {
        patterns: [{
          name: "keyword.control.block.begin.wg",
          match: `^\\s*(@(?:${bareBlockOpenDirectives}))\\s*$`,
        }],
      },
      "inline-conditionals": {
        patterns: [
          {
            name: "meta.inline-conditional.wg",
            begin: "(\\{\\{)(\\s*)(@(if|elseif))\\b",
            beginCaptures: {
              1: { name: "punctuation.section.inline-conditional.begin.wg" },
              3: { name: "keyword.control.conditional.wg" },
            },
            end: "\\}\\}",
            endCaptures: { 0: { name: "punctuation.section.inline-conditional.end.wg" } },
            patterns: [{ include: "#expression" }],
          },
          {
            name: "meta.inline-conditional.wg",
            match: "(\\{\\{)(\\s*)(@(else|endif))(\\s*)(\\}\\})",
            captures: {
              1: { name: "punctuation.section.inline-conditional.begin.wg" },
              3: { name: "keyword.control.conditional.wg" },
              6: { name: "punctuation.section.inline-conditional.end.wg" },
            },
          },
        ],
      },
      interpolation: {
        patterns: [{
          name: "meta.interpolation.wg",
          begin: "\\{\\{",
          beginCaptures: { 0: { name: "punctuation.section.interpolation.begin.wg" } },
          end: "\\}\\}",
          endCaptures: { 0: { name: "punctuation.section.interpolation.end.wg" } },
          patterns: [
            {
              match: "(\\|)(cap)\\b",
              captures: {
                1: { name: "punctuation.separator.modifier.wg" },
                2: { name: "support.function.modifier.wg" },
              },
            },
            { include: "#expression" },
          ],
        }],
      },
      "unknown-directives": {
        patterns: [{
          name: "invalid.illegal.unknown-directive.wg",
          match: "^\\s*(@[a-z][a-z-]*)\\b",
        }],
      },
      expression: {
        patterns: [
          { name: "string.quoted.double.wg", match: quotedString },
          { name: "constant.numeric.duration.wg", match: `\\b(?:${WG_LANGUAGE.patterns.durationToken})\\b` },
          { name: "constant.numeric.percentage.wg", match: `\\b${WG_LANGUAGE.patterns.percentage}(?![A-Za-z0-9_])` },
          { name: "constant.numeric.wg", match: `\\b${WG_LANGUAGE.patterns.number}\\b` },
          { name: "constant.language.wg", match: `\\b(?:${alternatives(WG_LANGUAGE.expression.literals)})\\b|(?:${alternatives(Object.values(WG_LANGUAGE.storyTargets))})\\b` },
          { name: "variable.other.object.wg", match: `\\b(?:story|player|npc|flags|daily|time|school|place|location)(?:\\.${WG_LANGUAGE.patterns.pathSegment})+\\b` },
          { name: "keyword.operator.logical.wg", match: `\\b(?:${alternatives(WG_LANGUAGE.expression.wordOperators)})\\b` },
          { name: "keyword.operator.comparison.wg", match: alternatives(["==", "!=", "<=", ">=", "<", ">"]) },
          { name: "keyword.operator.arithmetic.wg", match: `[${WG_LANGUAGE.expression.singleOperators.filter((operator) => !["<", ">"].includes(operator)).map((operator) => `\\${operator}`).join("")}]` },
          { name: "punctuation.definition.list.wg", match: "[\\[\\],()]" },
          { name: "variable.other.identifier.wg", match: `\\b(?:${dottedPath}|${id})\\b` },
        ],
      },
    },
  });
}

export function buildWGLanguageConfiguration() {
  const foldingBlocks = WG_BLOCKS.filter(({ open }) => open !== "check");
  const starts = alternatives(foldingBlocks.map(({ open }) => open));
  const ends = alternatives(foldingBlocks.map(({ close }) => close));
  const indentationStarts = alternatives([
    ...foldingBlocks.map(({ open }) => open),
    ...foldingBlocks.flatMap(({ branches: values = [] }) => values),
  ]);
  const indentationEnds = alternatives([
    ...foldingBlocks.map(({ close }) => close),
    ...foldingBlocks.flatMap(({ branches: values = [] }) => values),
  ]);

  return json({
    comments: { lineComment: "@#" },
    brackets: [["[", "]"], ["(", ")"], ["{{", "}}"]],
    autoClosingPairs: [
      { open: '"', close: '"', notIn: ["string", "comment"] },
      { open: "[", close: "]", notIn: ["string", "comment"] },
      { open: "(", close: ")", notIn: ["string", "comment"] },
      { open: "{{", close: "}}", notIn: ["string", "comment"] },
    ],
    surroundingPairs: [['"', '"'], ["[", "]"], ["(", ")"], ["{{", "}}"]],
    folding: {
      markers: {
        start: `^\\s*@(${starts})\\b`,
        end: `^\\s*@(${ends})\\b`,
      },
    },
    indentationRules: {
      increaseIndentPattern: `^\\s*@(${indentationStarts})\\b.*$`,
      decreaseIndentPattern: `^\\s*@(${indentationEnds})\\b.*$`,
    },
  });
}

export const WG_DIRECTIVE_INDEX_START = "<!-- WG-DIRECTIVE-INDEX:START -->";
export const WG_DIRECTIVE_INDEX_END = "<!-- WG-DIRECTIVE-INDEX:END -->";

export function buildWGDirectiveIndex() {
  const rows = WG_DIRECTIVE_CONTEXTS.map(({ label, syntax }) =>
    `| ${label} | ${syntax.map((entry) => `\`${entry}\``).join(", ")} |`
  );
  return [
    WG_DIRECTIVE_INDEX_START,
    "<!-- Generated from src/story/wg/shared/language.js. -->",
    "| Context | Directives |",
    "| --- | --- |",
    ...rows,
    WG_DIRECTIVE_INDEX_END,
  ].join("\n");
}

export function updateWGDirectiveIndex(document) {
  const start = document.indexOf(WG_DIRECTIVE_INDEX_START);
  const end = document.indexOf(WG_DIRECTIVE_INDEX_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("WG documentation is missing directive-index generation markers");
  }
  return [
    document.slice(0, start),
    buildWGDirectiveIndex(),
    document.slice(end + WG_DIRECTIVE_INDEX_END.length),
  ].join("");
}
