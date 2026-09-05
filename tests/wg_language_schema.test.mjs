import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  WG_BLOCKS,
  WG_DIRECTIVE_NAMES,
  WG_ID_PATTERN,
  WG_LANGUAGE,
  WG_PASSAGE_ID_PATTERN,
} from "../src/story/wg/shared/language.js";
import { WG_EFFECT_KEYWORDS } from "../src/story/wg/shared/effects/registry.js";
import { WG_EFFECT_PARSER_KEYWORDS } from "../tools/wg/compiler/effects/effectParsers.js";
import {
  buildWGLanguageConfiguration,
  buildWGTextMateGrammar,
  updateWGDirectiveIndex,
} from "../tools/wg/supportGenerator.js";

const ROOT = new URL("../", import.meta.url);

function sorted(values) {
  return [...values].sort();
}

test("the WG language schema has unique directives and well-formed block pairs", () => {
  assert.equal(new Set(WG_DIRECTIVE_NAMES).size, WG_DIRECTIVE_NAMES.length);
  assert.equal(new Set(WG_BLOCKS.map(({ open }) => open)).size, WG_BLOCKS.length);
  assert.equal(new Set(WG_BLOCKS.map(({ close }) => close)).size, WG_BLOCKS.length);
  for (const { open, close, branches = [] } of WG_BLOCKS) {
    for (const directive of [open, close, ...branches]) {
      assert.ok(WG_DIRECTIVE_NAMES.includes(directive), directive);
    }
  }
});

test("compiler effect parsers use every authored effect keyword from the schema", () => {
  assert.deepEqual(sorted(WG_EFFECT_PARSER_KEYWORDS), sorted(WG_EFFECT_KEYWORDS));
  assert.deepEqual(sorted(WG_LANGUAGE.effectKeywords), sorted(WG_EFFECT_KEYWORDS));
});

test("shared identifier patterns enforce the compiler's identifier rules", () => {
  const id = new RegExp(`^${WG_ID_PATTERN}$`);
  const passage = new RegExp(`^${WG_PASSAGE_ID_PATTERN}$`);
  assert.ok(id.test("school.math.event"));
  assert.ok(passage.test("segment-1"));
  assert.ok(!id.test("1school"));
  assert.ok(!id.test("_school"));
  assert.ok(!passage.test("scene.segment"));
});

test("checked-in editor support and directive documentation match the schema", async () => {
  const [grammar, configuration, documentation] = await Promise.all([
    readFile(new URL("tools/vscode-wg/syntaxes/wg.tmLanguage.json", ROOT), "utf8"),
    readFile(new URL("tools/vscode-wg/language-configuration.json", ROOT), "utf8"),
    readFile(new URL("docs/wg-language.md", ROOT), "utf8"),
  ]);

  assert.equal(grammar, buildWGTextMateGrammar());
  assert.equal(configuration, buildWGLanguageConfiguration());
  assert.equal(documentation, updateWGDirectiveIndex(documentation));
});

test("generated highlighter patterns share contextual target and identifier rules", () => {
  const grammar = JSON.parse(buildWGTextMateGrammar());
  const choicePattern = grammar.repository["choice-header"].patterns[0].match;
  const nextPattern = grammar.repository["next-directive"].patterns[0].match;
  const bareBlockPattern = grammar.repository["bare-block-directives"].patterns[0].match;
  const choice = new RegExp(choicePattern);
  const next = new RegExp(nextPattern);
  const bareBlock = new RegExp(bareBlockPattern);

  assert.ok(choice.test('@choice valid-id "Valid" -> @leave-place'));
  assert.ok(!choice.test('@choice 1invalid "Invalid" -> @exit'));
  assert.ok(next.test('@next "Continue" -> .local-passage'));
  assert.ok(!next.test('@next -> @leave-place'));
  assert.ok(bareBlock.test("@onenter"));
});
