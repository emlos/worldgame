import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const extensionRoot = new URL("../../tools/vscode-wg/", import.meta.url);

async function readJSON(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, extensionRoot), "utf8"));
}

function collectRegexes(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectRegexes(item, result);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (["match", "begin", "end"].includes(key)) result.push(child);
      else collectRegexes(child, result);
    }
  }
  return result;
}

test("private VS Code extension associates .wg with its grammar", async () => {
  const manifest = await readJSON("package.json");

  assert.equal(manifest.private, true);
  assert.deepEqual(manifest.contributes.languages[0].extensions, [".wg"]);
  assert.equal(manifest.contributes.grammars[0].language, "wg");
  assert.equal(manifest.contributes.grammars[0].scopeName, "source.wg");
});

test("WG editor configuration covers comments and compiler block pairs", async () => {
  const configuration = await readJSON("language-configuration.json");

  assert.equal(configuration.comments.lineComment, "@#");
  assert.match(configuration.folding.markers.start, /entry/);
  assert.match(configuration.folding.markers.start, /choice/);
  assert.match(configuration.folding.markers.end, /endentry/);
  assert.match(configuration.folding.markers.end, /endchoice/);
});

test("WG TextMate grammar contains valid regular expressions and core syntax", async () => {
  const grammar = await readJSON("syntaxes/wg.tmLanguage.json");

  for (const source of collectRegexes(grammar)) new RegExp(source);

  assert.equal(grammar.scopeName, "source.wg");
  const firstPattern = (repositoryName, property = "match") =>
    new RegExp(grammar.repository[repositoryName].patterns[0][property]);

  assert.match(":: taylor.study.peek [event taylor study]", firstPattern("scene-header"));
  assert.match("@entry home.taylor-study", firstPattern("entry-header"));
  assert.match(
    '@choice study "Study" -> taylor.study.back',
    firstPattern("choice-header"),
  );
  for (const line of [
    "@place-key player_home",
    "@offer npc taylor",
    '@hub-text "Taylor waits beside the table."',
    "@auto enter-place",
  ]) {
    assert.match(line, firstPattern("property-directives", "begin"));
  }
  assert.match("@when npc.taylor.present", firstPattern("condition-directives", "begin"));
  assert.match("@effect relationship taylor 0.02", firstPattern("effect-directives", "begin"));
  const effectKeyword = new RegExp(
    grammar.repository["effect-directives"].patterns[0].patterns[0].match,
  );
  assert.match("money", effectKeyword);
  assert.match("@endchoice", firstPattern("block-directives"));
  assert.match("{{npc.taylor.subject|cap}}", firstPattern("interpolation", "begin"));
});
