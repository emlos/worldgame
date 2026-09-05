import { failWG, sourceLocation } from "./diagnostic.js";
import { parseExpression } from "./expressionParser.js";
import {
  parseWGChangeDirective,
  parseWGEffectDirective,
} from "./effects/effectParsers.js";
import { SKILLS } from "../../../src/characters/player/stats.js";
import { DEFAULT_FEATURE_CATALOG } from "../../../src/features/index.js";
import { PLACE_REGISTRY } from "../../../src/world/data/place.js";
import { NPC_REGISTRY } from "../../../src/characters/npc/npcs.js";
import { SKILL_CHECK_DIFFICULTIES } from "../../../src/game/scene/skillChecks.js";
import {
  WG_AUTO_TRIGGERS,
  WG_CHAT_CHOICE_DIRECTIVES,
  WG_CHOICE_SINGLE_DIRECTIVES,
  WG_DOTTED_PATH_PATTERN,
  WG_DIRECTIVE_NAME_PATTERN,
  WG_DURATION_PATTERN,
  WG_DURATION_UNITS,
  WG_ID_PATTERN,
  WG_PASSAGE_ID_PATTERN,
  WG_PERCENTAGE_PATTERN,
  WG_PROBABILITY_DECIMAL_PATTERN,
  WG_QUOTED_STRING_PATTERN,
  WG_REMINDER_TONES,
  WG_SCENE_FINAL_TARGET_PATTERN,
  WG_SCENE_METADATA_DIRECTIVES,
  WG_SIMPLE_ID_PATTERN,
  WG_SINGLE_SCENE_METADATA_DIRECTIVES,
  WG_STORY_TARGET_PATTERN,
  WG_NEXT_TARGET_PATTERN,
} from "../../../src/story/wg/shared/language.js";

const ID_PATTERN = WG_ID_PATTERN;
const SIMPLE_ID_PATTERN = WG_SIMPLE_ID_PATTERN;
const RELATIONSHIP_TARGET_PATTERN = `(${SIMPLE_ID_PATTERN})\\.(${SIMPLE_ID_PATTERN})`;
const ID_REGEX = new RegExp(`^${ID_PATTERN}$`);
const PASSAGE_ID_PATTERN = WG_PASSAGE_ID_PATTERN;
const STORY_TARGET_PATTERN = WG_STORY_TARGET_PATTERN;
const PATH_REGEX = new RegExp(`^${WG_DOTTED_PATH_PATTERN}$`);
const QUOTED_PATTERN = WG_QUOTED_STRING_PATTERN;

function relationshipMeterDefinition(npcId, meterId, location) {
  const npc = NPC_REGISTRY.find((entry) => entry.id === npcId);
  if (!npc) failWG(`Unknown relationship NPC '${npcId}'`, location);
  const definition = npc.relationshipProfile?.meters?.[meterId];
  if (!definition) {
    failWG(`Unknown relationship meter '${npcId}.${meterId}'`, location);
  }
  return definition;
}

function normalizeFile(file) {
  return String(file || "<wg>").replaceAll("\\", "/");
}

function lineLocation(file, line, column = 1) {
  return sourceLocation(file, line, column);
}

function nodeSource(file, line, column = 1) {
  return { file, line, column };
}

function parseQuotedString(value, location, label, { allowEmpty = false } = {}) {
  const text = value.trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    failWG(`${label} must be a double-quoted string`, location);
  }
  if (typeof parsed !== "string") {
    failWG(`${label} must be a double-quoted string`, location);
  }
  if (!parsed.trim()) {
    if (allowEmpty) return "";
    failWG(`${label} cannot be empty`, location);
  }
  return parsed;
}

function parseSystemMetadata(text, file, line) {
  const location = lineLocation(file, line);
  const match = text.match(
    new RegExp(`^@system\\s+(${ID_PATTERN})(?:\\s+(.+))?\\s*$`),
  );
  if (!match) failWG("Malformed @system", location);

  let config = {};
  if (match[2]) {
    try {
      config = JSON.parse(match[2]);
    } catch {
      failWG("@system config must be valid JSON", location);
    }
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      failWG("@system config must be a JSON object", location);
    }
  }

  return {
    id: match[1],
    config,
    source: nodeSource(file, line),
  };
}

function parseBehaviorMetadata(text, file, line) {
  const location = lineLocation(file, line);
  const systemSyntax = text.replace(/^@behavior\b/, "@system");
  try {
    return parseSystemMetadata(systemSyntax, file, line);
  } catch (error) {
    if (error?.name === "WGCompileError") {
      failWG(error.detail.replaceAll("@system", "@behavior"), location);
    }
    throw error;
  }
}

function directiveArgument(text, directive, location) {
  const prefix = `@${directive}`;
  const argument = text.slice(prefix.length).trim();
  if (!argument) failWG(`@${directive} requires a value`, location);
  return argument;
}

function parseCheck(argument, location, features) {
  const match = argument.match(
    new RegExp(`^(${ID_PATTERN})\\s+(${ID_PATTERN})\\s+(${ID_PATTERN})$`),
  );
  if (!match) {
    failWG("@check needs a target type, target id, and difficulty id", location);
  }

  const [, targetType, targetId, difficultyId] = match;
  const targetTypes = ["skill", ...features.skillCheckTargetTypes];
  if (!targetTypes.includes(targetType)) {
    failWG(`@check target type must be one of: ${targetTypes.join(", ")}`, location);
  }
  if (targetType === "skill" && !SKILLS[targetId]) {
    failWG(`@check references unknown skill '${targetId}'`, location);
  }
  if (
    targetType !== "skill" &&
    !features.getSkillCheckTargetDefinition(targetType, targetId)
  ) {
    failWG(`@check references unknown ${targetType} target '${targetId}'`, location);
  }
  if (!SKILL_CHECK_DIFFICULTIES[difficultyId]) {
    failWG(`@check references unknown difficulty '${difficultyId}'`, location);
  }
  return { targetType, targetId, difficultyId };
}

function directiveName(text) {
  return text.match(new RegExp(`^@(${WG_DIRECTIVE_NAME_PATTERN})`))?.[1] ?? null;
}

function isComment(text) {
  return text.startsWith("@#");
}

function parseInterpolationParts(text, location) {
  const parts = [];
  let cursor = 0;

  while (cursor < text.length) {
    const opening = text.indexOf("{{", cursor);
    const strayClosing = text.indexOf("}}", cursor);
    if (strayClosing !== -1 && (opening === -1 || strayClosing < opening)) {
      failWG("Unexpected interpolation closing marker", {
        ...location,
        column: location.column + strayClosing,
      });
    }
    if (opening === -1) {
      if (cursor < text.length) {
        parts.push({ type: "text", value: text.slice(cursor) });
      }
      break;
    }

    if (opening > cursor) {
      parts.push({ type: "text", value: text.slice(cursor, opening) });
    }
    const closing = text.indexOf("}}", opening + 2);
    if (closing === -1) {
      failWG("Unclosed interpolation", {
        ...location,
        column: location.column + opening,
      });
    }

    const content = text.slice(opening + 2, closing).trim();
    const [pathText, ...filters] = content.split("|").map((part) => part.trim());
    if (!PATH_REGEX.test(pathText)) {
      failWG("Interpolation requires a dotted path", {
        ...location,
        column: location.column + opening + 2,
      });
    }
    for (const filter of filters) {
      if (filter !== "cap") {
        failWG(`Unknown interpolation filter '${filter}'`, {
          ...location,
          column: location.column + opening + 2,
        });
      }
    }
    parts.push({
      type: "interpolation",
      path: pathText.split("."),
      filters,
    });
    cursor = closing + 2;
  }

  return parts.length ? parts : [{ type: "text", value: "" }];
}

export function parseDuration(value, location = {}) {
  const text = String(value).trim();
  const match = text.match(new RegExp(`^${WG_DURATION_PATTERN}$`));
  if (!match || !Object.values(match.groups || {}).some((part) => part !== undefined)) {
    failWG(`Invalid duration '${text}'`, location);
  }

  const minutes = WG_DURATION_UNITS.reduce(
    (total, { name, minutes: multiplier }) =>
      total + Number(match.groups[name] || 0) * multiplier,
    0,
  );
  if (!Number.isFinite(minutes) || minutes < 0) {
    failWG(`Invalid duration '${text}'`, location);
  }
  return minutes;
}

function parseTime(value, location) {
  const text = String(value).trim();
  const modeMatch = text.match(/^(.*?)\s+(free|rest)$/);
  const durationText = modeMatch ? modeMatch[1].trim() : text;
  const rangeParts = durationText.split("..");
  if (rangeParts.length > 2 || rangeParts.some((part) => !part.trim())) {
    failWG(`Invalid duration range '${durationText}'`, location);
  }
  if (rangeParts.length === 2) {
    const min = parseDuration(rangeParts[0], location);
    const max = parseDuration(rangeParts[1], location);
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      failWG("Random duration ranges require whole-minute endpoints", location);
    }
    if (min >= max) {
      failWG("Random duration ranges require the first duration to be smaller", location);
    }
    return {
      durationMinutes: 0,
      durationRangeMinutes: { min, max },
      energyFree: Boolean(modeMatch),
      resting: modeMatch?.[2] === "rest",
    };
  }
  return {
    durationMinutes: parseDuration(durationText, location),
    durationRangeMinutes: null,
    energyFree: Boolean(modeMatch),
    resting: modeMatch?.[2] === "rest",
  };
}

function parseProbability(value, location, directive) {
  const text = String(value).trim();
  const percent = new RegExp(`^${WG_PERCENTAGE_PATTERN}$`).test(text);
  const decimal = new RegExp(`^${WG_PROBABILITY_DECIMAL_PATTERN}$`).test(text);
  if (!percent && !decimal) {
    failWG(`@${directive} must be between 0 and 1 or a percentage`, location);
  }
  const probability = percent ? Number(text.slice(0, -1)) / 100 : Number(text);
  if (probability < 0 || probability > 1) {
    failWG(`@${directive} must be between 0 and 1 or a percentage`, location);
  }
  return probability;
}

function parseInlineChanges(text, file, line) {
  const parts = [];
  let start = 0;
  let quoted = false;

  // Only unquoted, whitespace-separated markers delimit changes. Escaped
  // quotes and directive-like text inside a custom label stay in that label.
  for (let index = 0; index <= text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === "\\") index += 1;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    const nextChange =
      index > 0 &&
      /\s/.test(text[index - 1]) &&
      text.startsWith("@change", index) &&
      (index + 7 === text.length || /\s/.test(text[index + 7]));
    if (index === text.length || nextChange) {
      parts.push({
        type: "change",
        effect: parseWGChangeDirective(text.slice(start, index).trimEnd(), file, line),
      });
      start = index;
    }
  }
  if (quoted) {
    failWG("Unclosed quoted label in inline @change", lineLocation(file, line));
  }
  return parts;
}

function parseSimpleProseParts(text, file, line, columnOffset = 0) {
  const parts = [];
  let cursor = 0;
  const appendText = (value, column) => {
    if (value) {
      parts.push(...parseInterpolationParts(
        value,
        lineLocation(file, line, columnOffset + column),
      ));
    }
  };

  // A trailing chain consumes the rest of the source line. Its parser keeps
  // directive-like text inside quoted labels out of the prose scanner.
  for (const match of text.matchAll(/\\@|@(br|change)(?=\s|$)/g)) {
    let preceding = text.slice(cursor, match.index);
    if (match[1]) preceding = preceding.trimEnd();
    appendText(preceding, cursor + 1);
    if (match[0] === "\\@") {
      parts.push({ type: "text", value: "@" });
      cursor = match.index + match[0].length;
    } else if (match[1] === "br") {
      parts.push({ type: "break" });
      cursor = match.index + match[0].length;
      while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
    } else {
      if (!parts.some((part) => part.type === "interpolation" || part.value?.trim())) {
        failWG("Inline @change requires preceding prose", lineLocation(file, line));
      }
      parts.push(...parseInlineChanges(text.slice(match.index), file, line));
      return parts;
    }
  }
  appendText(text.slice(cursor), cursor + 1);
  return parts;
}

function inlineConditionalMarkers(text, file, line) {
  const markers = [];
  const pattern = /\{\{\s*@(if|elseif|else|endif)\b([\s\S]*?)\}\}/g;
  for (const match of text.matchAll(pattern)) {
    const name = match[1];
    const argument = match[2].trim();
    const location = lineLocation(file, line, match.index + 1);
    if ((name === "if" || name === "elseif") && !argument) {
      failWG(`Inline @${name} requires an expression`, location);
    }
    if ((name === "else" || name === "endif") && argument) {
      failWG(`Inline @${name} takes no arguments`, location);
    }
    markers.push({
      name,
      argument,
      start: match.index,
      end: match.index + match[0].length,
      source: nodeSource(file, line, match.index + 1),
    });
  }
  return markers;
}

function parseProseLine(text, file, line) {
  const markers = inlineConditionalMarkers(text, file, line);
  if (!markers.length) return parseSimpleProseParts(text, file, line);

  let markerIndex = 0;
  const appendSegment = (parts, start, end) => {
    if (end <= start) return;
    parts.push(...parseSimpleProseParts(
      text.slice(start, end),
      file,
      line,
      start,
    ));
  };

  const parseUntil = (start, stopNames) => {
    const parts = [];
    let cursor = start;

    while (markerIndex < markers.length) {
      const marker = markers[markerIndex];
      appendSegment(parts, cursor, marker.start);

      if (stopNames.has(marker.name)) {
        return { parts, stop: marker };
      }
      if (marker.name !== "if") {
        failWG(`Unexpected inline @${marker.name}`, marker.source);
      }

      markerIndex += 1;
      const parsed = parseConditional(marker);
      parts.push(parsed.part);
      cursor = parsed.end;
    }

    appendSegment(parts, cursor, text.length);
    return { parts, stop: null };
  };

  const parseConditional = (opening) => {
    const branches = [];
    let testText = opening.argument;
    let testSource = opening.source;
    let cursor = opening.end;

    while (true) {
      const branch = parseUntil(
        cursor,
        new Set(["elseif", "else", "endif"]),
      );
      branches.push({
        test: parseExpression(testText, testSource),
        parts: branch.parts,
        source: testSource,
      });

      const stop = branch.stop;
      if (!stop) failWG("Unclosed inline @if", opening.source);
      markerIndex += 1;

      if (stop.name === "elseif") {
        testText = stop.argument;
        testSource = stop.source;
        cursor = stop.end;
        continue;
      }

      let elseParts = null;
      let end = stop.end;
      if (stop.name === "else") {
        const fallback = parseUntil(stop.end, new Set(["endif"]));
        if (!fallback.stop) failWG("Unclosed inline @if", opening.source);
        elseParts = fallback.parts;
        end = fallback.stop.end;
        markerIndex += 1;
      }

      return {
        part: {
          type: "inline-if",
          branches,
          elseParts,
          source: opening.source,
        },
        end,
      };
    }
  };

  const parsed = parseUntil(0, new Set());
  if (parsed.stop || markerIndex !== markers.length) {
    failWG("Malformed inline conditional", lineLocation(file, line));
  }
  return parsed.parts;
}

function partHasDisplayContent(part) {
  if (part?.type === "interpolation") return true;
  if (part?.type === "text") return Boolean(part.value?.trim());
  if (part?.type !== "inline-if") return false;
  return (part.branches || []).some((branch) =>
    branch.parts.some(partHasDisplayContent)
  ) || (part.elseParts || []).some(partHasDisplayContent);
}

function paragraphPartsContainChange(parts) {
  return parts.some((part) =>
    part?.type === "change" ||
    (part?.type === "inline-if" && (
      (part.branches || []).some((branch) =>
        paragraphPartsContainChange(branch.parts)
      ) || paragraphPartsContainChange(part.elseParts || [])
    ))
  );
}

class SceneBodyParser {
  constructor(file, lines, startIndex = 0, chat = false, features = DEFAULT_FEATURE_CATALOG) {
    this.file = file;
    this.lines = lines;
    this.index = startIndex;
    this.chat = chat;
    this.features = features;
  }

  current() {
    return this.lines[this.index] ?? null;
  }

  parseNodes(stopDirectives = new Set()) {
    const nodes = [];
    let paragraphLines = [];

    const flushParagraph = () => {
      if (!paragraphLines.length) return;
      const firstLine = paragraphLines[0];
      const parts = [];
      for (const line of paragraphLines) {
        const lineParts = line.break
          ? [{ type: "break" }]
          : parseProseLine(line.text, this.file, line.line);
        if (parts.length && parts.at(-1).type !== "break" && lineParts[0]?.type !== "break") {
          parts.push({ type: "text", value: " " });
        }
        parts.push(...lineParts);
      }
      if (!parts.some(partHasDisplayContent)) {
        failWG("@br must be inside a prose paragraph", lineLocation(this.file, firstLine.line));
      }
      nodes.push({
        type: "paragraph",
        parts,
        source: nodeSource(this.file, firstLine.line),
      });
      paragraphLines = [];
    };

    while (this.current()) {
      const line = this.current();
      const trimmed = line.text.trim();

      if (!trimmed) {
        flushParagraph();
        this.index += 1;
        continue;
      }
      if (isComment(trimmed)) {
        this.index += 1;
        continue;
      }

      if (trimmed === "@br") {
        paragraphLines.push({ break: true, line: line.line });
        this.index += 1;
        continue;
      }

      const name = directiveName(trimmed);
      if (name && stopDirectives.has(name)) {
        flushParagraph();
        return nodes;
      }

      if (this.chat && name === "message") {
        flushParagraph();
        const match = trimmed.match(new RegExp(`^@message\\s+(${PASSAGE_ID_PATTERN})$`));
        if (!match) failWG("Expected @message <id>", lineLocation(this.file, line.line));
        this.index += 1;
        const body = this.parseNodes(new Set(["endmessage"]));
        if (this.current()?.text.trim() !== "@endmessage") failWG("Unclosed @message", lineLocation(this.file, line.line));
        this.index += 1;
        nodes.push({ type: "message", id: match[1], body, source: nodeSource(this.file, line.line) });
        continue;
      }
      if (this.chat && (name === "wait" || name === "finish")) {
        flushParagraph();
        if (name === "finish") {
          if (trimmed !== "@finish") failWG("@finish takes no arguments", lineLocation(this.file, line.line));
          nodes.push({ type: "finish", source: nodeSource(this.file, line.line) });
        } else {
          const match = trimmed.match(new RegExp(`^@wait\\s+(\\S+)\\s+->\\s+(\\.${PASSAGE_ID_PATTERN})$`));
          if (!match) failWG("Expected @wait <duration> -> .passage", lineLocation(this.file, line.line));
          const minutes = parseDuration(match[1], lineLocation(this.file, line.line));
          if (minutes < 1 / 60000) failWG("Chat waits must be at least one millisecond", lineLocation(this.file, line.line));
          nodes.push({ type: "wait", minutes, target: match[2], source: nodeSource(this.file, line.line) });
        }
        this.index += 1;
        continue;
      }
      if (name === "if") {
        flushParagraph();
        nodes.push(this.parseConditional());
        continue;
      }
      if (name === "choice") {
        flushParagraph();
        nodes.push(this.parseChoice());
        continue;
      }
      if (name === "choicegroup") {
        flushParagraph();
        nodes.push(this.parseChoiceGroup());
        continue;
      }
      if (name === "random") {
        flushParagraph();
        nodes.push(this.parseRandom());
        continue;
      }
      if (name === "check") {
        flushParagraph();
        nodes.push(this.parsePassiveCheck());
        continue;
      }
      if (name === "effect" || name === "change") {
        flushParagraph();
        nodes.push({
          type: "effect",
          effect:
            name === "change"
              ? parseWGChangeDirective(trimmed, this.file, line.line)
              : parseWGEffectDirective(trimmed, this.file, line.line),
          source: nodeSource(this.file, line.line),
        });
        this.index += 1;
        continue;
      }
      if (name) {
        flushParagraph();
        failWG(`Unexpected @${name}`, lineLocation(this.file, line.line));
      }
      if (trimmed.startsWith("@")) {
        flushParagraph();
        failWG("Malformed or unknown directive", lineLocation(this.file, line.line));
      }

      const unescaped = trimmed.startsWith("\\::")
        ? trimmed.slice(1)
        : trimmed;
      paragraphLines.push({ text: unescaped, line: line.line });
      this.index += 1;
    }

    flushParagraph();
    return nodes;
  }

  parseChoiceGroup() {
    const opening = this.current();
    const openingText = opening.text.trim();
    const match = openingText.match(
      new RegExp(`^@choicegroup\\s+(${ID_PATTERN})\\s+(${QUOTED_PATTERN})\\s*$`),
    );
    if (!match) {
      failWG(
        'Malformed @choicegroup header; expected @choicegroup <id> "<heading>"',
        lineLocation(this.file, opening.line),
      );
    }

    this.index += 1;
    const nodes = this.parseNodes(new Set(["endchoicegroup"]));
    const closing = this.current();
    if (!closing || closing.text.trim() !== "@endchoicegroup") {
      failWG("Unclosed @choicegroup block", lineLocation(this.file, opening.line));
    }
    this.index += 1;

    let hasChoice = false;
    const inspect = (children) => {
      for (const node of children) {
        if (node.type === "choice") {
          hasChoice = true;
        } else if (node.type === "if") {
          for (const branch of node.branches) inspect(branch.nodes);
          if (node.elseNodes) inspect(node.elseNodes);
        } else if (node.type === "random") {
          for (const variant of node.variants) inspect(variant);
        } else if (node.type === "passive-check") {
          inspect(node.outcomes?.success || []);
          inspect(node.outcomes?.failure || []);
        } else if (node.type === "choice-group") {
          failWG(
            "@choicegroup blocks cannot be nested",
            lineLocation(this.file, node.source?.line || opening.line),
          );
        }
      }
    };
    inspect(nodes);
    if (!hasChoice) {
      failWG(
        "@choicegroup requires at least one @choice",
        lineLocation(this.file, opening.line),
      );
    }

    return {
      type: "choice-group",
      id: match[1],
      heading: parseQuotedString(
        match[2],
        lineLocation(this.file, opening.line),
        "Choice-group heading",
        { allowEmpty: true },
      ),
      nodes,
      source: nodeSource(this.file, opening.line),
    };
  }

  parseRandom() {
    const opening = this.current();
    if (opening.text.trim() !== "@random") {
      failWG(
        "Malformed @random header; expected @random on its own line",
        lineLocation(this.file, opening.line),
      );
    }

    const variants = [];
    this.index += 1;
    while (this.current()) {
      const nodes = this.parseNodes(new Set(["or", "endrandom"]));
      if (!nodes.length) {
        failWG(
          "@random alternatives cannot be empty",
          lineLocation(this.file, this.current()?.line || opening.line),
        );
      }
      variants.push(nodes);

      const separator = this.current();
      if (separator?.text.trim() === "@or") {
        this.index += 1;
        continue;
      }
      if (separator?.text.trim() === "@endrandom") {
        if (variants.length < 2) {
          failWG(
            "@random requires at least two alternatives separated by @or",
            lineLocation(this.file, opening.line),
          );
        }
        this.index += 1;
        return {
          type: "random",
          variants,
          source: nodeSource(this.file, opening.line),
        };
      }
      break;
    }

    failWG("Unclosed @random block", lineLocation(this.file, opening.line));
  }

  parsePassiveCheck() {
    const opening = this.current();
    const location = lineLocation(this.file, opening.line);
    const argument = directiveArgument(opening.text.trim(), "check", location);
    const check = parseCheck(argument, location, this.features);

    this.index += 1;
    const preamble = this.parseNodes(new Set(["success", "failure", "endcheck"]));
    if (preamble.length || this.current()?.text.trim() !== "@success") {
      failWG(
        "A prose @check must begin with @success",
        lineLocation(this.file, this.current()?.line || opening.line),
      );
    }

    this.index += 1;
    const successNodes = this.parseNodes(new Set(["failure", "endcheck"]));
    if (!successNodes.length) {
      failWG("A prose @check requires a non-empty @success branch", location);
    }
    if (this.current()?.text.trim() !== "@failure") {
      failWG(
        "A prose @check requires @failure after @success",
        lineLocation(this.file, this.current()?.line || opening.line),
      );
    }

    this.index += 1;
    const failureNodes = this.parseNodes(new Set(["endcheck"]));
    if (!failureNodes.length) {
      failWG("A prose @check requires a non-empty @failure branch", location);
    }
    if (this.current()?.text.trim() !== "@endcheck") {
      failWG("Unclosed prose @check block", location);
    }
    this.index += 1;

    return {
      type: "passive-check",
      check: {
        ...check,
        source: nodeSource(this.file, opening.line),
      },
      outcomes: {
        success: successNodes,
        failure: failureNodes,
      },
      source: nodeSource(this.file, opening.line),
    };
  }

  parseConditional() {
    const opening = this.current();
    const openingText = opening.text.trim();
    const expressionText = directiveArgument(
      openingText,
      "if",
      lineLocation(this.file, opening.line),
    );
    const conditional = {
      type: "if",
      branches: [],
      elseNodes: null,
      source: nodeSource(this.file, opening.line),
    };

    this.index += 1;
    conditional.branches.push({
      test: parseExpression(expressionText, lineLocation(this.file, opening.line)),
      nodes: this.parseNodes(new Set(["elseif", "else", "endif"])),
      source: nodeSource(this.file, opening.line),
    });

    while (this.current()?.text.trim().startsWith("@elseif")) {
      const line = this.current();
      const text = line.text.trim();
      const testText = directiveArgument(
        text,
        "elseif",
        lineLocation(this.file, line.line),
      );
      this.index += 1;
      conditional.branches.push({
        test: parseExpression(testText, lineLocation(this.file, line.line)),
        nodes: this.parseNodes(new Set(["elseif", "else", "endif"])),
        source: nodeSource(this.file, line.line),
      });
    }

    if (this.current()?.text.trim() === "@else") {
      this.index += 1;
      conditional.elseNodes = this.parseNodes(new Set(["endif"]));
    }

    const closing = this.current();
    if (!closing || closing.text.trim() !== "@endif") {
      failWG("Unclosed @if block", lineLocation(this.file, opening.line));
    }
    this.index += 1;
    return conditional;
  }

  parseChoiceOutcome(kind) {
    const opening = this.current();
    const text = opening.text.trim();
    const closingDirective = `end${kind}`;
    const match = text.match(
      new RegExp(`^@${kind}\\s+->\\s+(${STORY_TARGET_PATTERN})\\s*$`),
    );
    if (!match) failWG(`Malformed @${kind} header`, lineLocation(this.file, opening.line));

    const outcome = {
      target: match[1],
      durationMinutes: 0,
      durationRangeMinutes: null,
      energyFree: false,
      resting: false,
      responses: [],
      effects: [],
      source: nodeSource(this.file, opening.line),
    };
    let sawTime = false;
    this.index += 1;

    while (this.current()) {
      const line = this.current();
      const directive = line.text.trim();
      const location = lineLocation(this.file, line.line);
      if (!directive || isComment(directive)) {
        this.index += 1;
        continue;
      }
      if (directive === `@${closingDirective}`) {
        if (!outcome.responses.length) delete outcome.responses;
        this.index += 1;
        return outcome;
      }

      const name = directiveName(directive);
      if (name === "time") {
        if (sawTime) failWG(`Duplicate @time in @${kind}`, location);
        sawTime = true;
        const parsedTime = parseTime(
          directiveArgument(directive, "time", location),
          location,
        );
        outcome.durationMinutes = parsedTime.durationMinutes;
        outcome.durationRangeMinutes = parsedTime.durationRangeMinutes;
        outcome.energyFree = parsedTime.energyFree;
        outcome.resting = parsedTime.resting;
      } else if (name === "effect") {
        outcome.effects.push(parseWGEffectDirective(directive, this.file, line.line));
      } else if (name === "response") {
        outcome.responses.push(this.parseResponse());
        continue;
      } else {
        failWG(`@${kind} may contain only @time, @response, and @effect directives`, location);
      }
      this.index += 1;
    }

    failWG(`Unclosed @${kind} block`, lineLocation(this.file, opening.line));
  }

  finishChoice(choice, singleFields, location) {
    if (singleFields.has("event-chance") && !choice.eventPool) {
      failWG("@event-chance requires @event-pool", location);
    }
    if (choice.target !== null) {
      if (choice.check || choice.outcomes.success || choice.outcomes.failure) {
        failWG("Direct choices cannot contain skill-check outcomes", location);
      }

      if (choice.eventPool && choice.target === "@leave-place") {
        failWG("@event-pool cannot be used with @leave-place", location);
      }
      if (!choice.responses.length) delete choice.responses;
      if (!choice.eventPool) {
        delete choice.eventPool;
        delete choice.eventChance;
      }
      delete choice.check;
      delete choice.outcomes;
      return choice;
    }

    if (!choice.check) failWG("A targetless choice requires @check", location);
    if (!choice.outcomes.success || !choice.outcomes.failure) {
      failWG("Skill checks require both @success and @failure outcomes", location);
    }
    if (
      singleFields.has("timing") ||
      choice.responses.length ||
      choice.effects.length ||
      choice.previews.length
    ) {
      failWG(
        "Checked choices keep @time, @response, and @effect inside outcome blocks and cannot use @change or @preview",
        location,
      );
    }
    if (
      choice.eventPool &&
      [choice.outcomes.success, choice.outcomes.failure].some(
        (outcome) => outcome?.target === "@leave-place",
      )
    ) {
      failWG("@event-pool cannot be used with a @leave-place outcome", location);
    }
    if (!choice.eventPool) {
      delete choice.eventPool;
      delete choice.eventChance;
    }
    delete choice.target;
    delete choice.durationMinutes;
    delete choice.durationRangeMinutes;
    delete choice.timeUntilPath;
    delete choice.energyFree;
    delete choice.resting;
    delete choice.previews;
    delete choice.effects;
    delete choice.responses;
    return choice;
  }

  parseChoice() {
    const opening = this.current();
    const openingText = opening.text.trim();
    const match = openingText.match(
      new RegExp(`^@choice\\s+(${ID_PATTERN})\\s+(${QUOTED_PATTERN})(?:\\s+->\\s+(${STORY_TARGET_PATTERN}))?\\s*$`),
    );
    if (!match) {
      failWG("Malformed @choice header", lineLocation(this.file, opening.line));
    }

    const choiceLabel = parseQuotedString(
      match[2],
      lineLocation(this.file, opening.line),
      "Choice label",
    );
    const choice = {
      type: "choice",
      id: match[1],
      label: parseInterpolationParts(
        choiceLabel,
        lineLocation(this.file, opening.line),
      ),
      target: match[3] ?? null,
      check: null,
      outcomes: { success: null, failure: null },
      icon: null,
      durationMinutes: 0,
      durationRangeMinutes: null,
      timeUntilPath: null,
      energyFree: false,
      resting: false,
      when: null,
      requirements: [],
      warning: null,
      eventPool: null,
      eventChance: 1,
      responses: [],
      previews: [],
      effects: [],
      source: nodeSource(this.file, opening.line),
    };
    const singleFields = new Set();
    this.index += 1;

    while (this.current()) {
      const line = this.current();
      const text = line.text.trim();
      const location = lineLocation(this.file, line.line);

      if (!text || isComment(text)) {
        this.index += 1;
        continue;
      }
      if (text === "@endchoice") {
        this.index += 1;
        return this.finishChoice(choice, singleFields, location);
      }

      const name = directiveName(text);
      if (!name) {
        failWG("Choice blocks may contain only choice directives", location);
      }

      if (this.chat && !WG_CHAT_CHOICE_DIRECTIVES.includes(name)) {
        failWG("Chat choices support only @send, @when, @require, and @effect; texting takes no time", location);
      }
      if (this.chat && name === "send") {
        if (choice.send) failWG("Duplicate @send", location);
        choice.send = parseInterpolationParts(parseQuotedString(directiveArgument(text, "send", location), location, "Outgoing message"), location);
        this.index += 1;
        continue;
      }


      if (name === "success" || name === "failure") {
        if (choice.outcomes[name]) failWG(`Duplicate @${name}`, location);
        choice.outcomes[name] = this.parseChoiceOutcome(name);
        continue;
      }

      if (
        WG_CHOICE_SINGLE_DIRECTIVES.includes(name)
      ) {
        if (singleFields.has(name)) failWG(`Duplicate @${name}`, location);
        singleFields.add(name);
      }
      if (name === "time" || name === "time-until") {
        if (singleFields.has("timing")) failWG("Duplicate choice timing directive", location);
        singleFields.add("timing");
      }

      if (name === "icon") {
        const value = directiveArgument(text, "icon", location);
        choice.icon = value.startsWith('"')
          ? parseQuotedString(value, location, "Choice icon")
          : value;
      } else if (name === "time") {
        const parsedTime = parseTime(
          directiveArgument(text, "time", location),
          location,
        );
        choice.durationMinutes = parsedTime.durationMinutes;
        choice.durationRangeMinutes = parsedTime.durationRangeMinutes;
        choice.energyFree = parsedTime.energyFree;
        choice.resting = parsedTime.resting;
      } else if (name === "time-until") {
        const pathText = directiveArgument(text, "time-until", location);
        if (!PATH_REGEX.test(pathText)) {
          failWG("@time-until requires a dotted runtime path", location);
        }
        choice.timeUntilPath = pathText.split(".");
      } else if (name === "event-pool") {
        const poolId = directiveArgument(text, "event-pool", location);
        if (!ID_REGEX.test(poolId)) failWG("@event-pool requires a pool id", location);
        choice.eventPool = poolId;
      } else if (name === "event-chance") {
        choice.eventChance = parseProbability(
          directiveArgument(text, "event-chance", location),
          location,
          "event-chance",
        );
      } else if (name === "when") {
        choice.when = parseExpression(
          directiveArgument(text, "when", location),
          location,
        );
      } else if (name === "check") {
        const argument = directiveArgument(text, "check", location);
        choice.check = {
          ...parseCheck(argument, location, this.features),
          source: nodeSource(this.file, line.line),
        };
      } else if (name === "require") {
        const argument = directiveArgument(text, "require", location);
        const requirement = argument.match(
          new RegExp(`^(.*)\\s+(${QUOTED_PATTERN})$`),
        );
        if (!requirement || !requirement[1].trim()) {
          failWG("@require needs an expression and quoted reason", location);
        }
        choice.requirements.push({
          test: parseExpression(requirement[1].trim(), location),
          reason: parseQuotedString(requirement[2], location, "Requirement reason"),
          source: nodeSource(this.file, line.line),
        });
      } else if (name === "warning") {
        choice.warning = parseQuotedString(
          directiveArgument(text, "warning", location),
          location,
          "Choice warning",
        );
      } else if (name === "response") {
        choice.responses.push(this.parseResponse());
        continue;
      } else if (name === "preview") {
        const argument = directiveArgument(text, "preview", location);
        const relationshipPreview = argument.match(
          new RegExp(`^relationship\\s+${RELATIONSHIP_TARGET_PATTERN}\\s+([+-]?\\d+(?:\\.\\d+)?)\\s+(${QUOTED_PATTERN})$`),
        );
        if (relationshipPreview) {
          const definition = relationshipMeterDefinition(
            relationshipPreview[1],
            relationshipPreview[2],
            location,
          );
          choice.previews.push({
            type: "relationship",
            npcId: relationshipPreview[1],
            meterId: relationshipPreview[2],
            higherIsBetter: definition.higherIsBetter !== false,
            amount: Number(relationshipPreview[3]),
            label: parseQuotedString(relationshipPreview[4], location, "Preview label"),
            source: nodeSource(this.file, line.line),
          });
        } else {
          const preview = argument.match(
            new RegExp(`^(${ID_PATTERN})\\s+([+-]?\\d+(?:\\.\\d+)?)\\s+(${QUOTED_PATTERN})$`),
          );
          if (!preview) failWG("Malformed @preview", location);
          choice.previews.push({
            type: preview[1],
            amount: Number(preview[2]),
            label: parseQuotedString(preview[3], location, "Preview label"),
            source: nodeSource(this.file, line.line),
          });
        }
      } else if (name === "effect") {
        choice.effects.push(parseWGEffectDirective(text, this.file, line.line));
      } else if (name === "change") {
        choice.effects.push(parseWGChangeDirective(text, this.file, line.line));
      } else {
        failWG(`Unknown choice directive @${name}`, location);
      }

      this.index += 1;
    }

    failWG("Unclosed @choice block", lineLocation(this.file, opening.line));
  }

  parseResponse() {
    const opening = this.current();
    if (opening.text.trim() !== "@response") {
      failWG(
        "Malformed @response header; expected @response on its own line",
        lineLocation(this.file, opening.line),
      );
    }

    this.index += 1;
    const paragraphs = this.parseNodes(new Set(["endresponse"]));
    const closing = this.current();
    if (!closing || closing.text.trim() !== "@endresponse") {
      failWG("Unclosed @response block", lineLocation(this.file, opening.line));
    }
    if (!paragraphs.length || paragraphs.some((node) =>
      node.type !== "paragraph" || paragraphPartsContainChange(node.parts)
    )) {
      failWG(
        "@response requires prose paragraphs without effects or inline changes",
        lineLocation(this.file, opening.line),
      );
    }
    this.index += 1;
    return {
      paragraphs,
      source: nodeSource(this.file, opening.line),
    };
  }
}

function parseOnEnter(file, lines, startIndex, openingLine) {
  const effects = [];
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index];
    const text = line.text.trim();
    if (!text || isComment(text)) {
      index += 1;
      continue;
    }
    if (text === "@endonenter") {
      return { effects, nextIndex: index + 1 };
    }
    if (directiveName(text) !== "effect") {
      failWG("@onenter may contain only @effect directives", lineLocation(file, line.line));
    }
    effects.push(parseWGEffectDirective(text, file, line.line));
    index += 1;
  }
  failWG("Unclosed @onenter block", lineLocation(file, openingLine));
}

function parseNext(text, file, line) {
  const location = lineLocation(file, line);
  const match = text.match(
    new RegExp(`^@next(?:\\s+(${QUOTED_PATTERN}))?(?:\\s+->\\s+(${WG_NEXT_TARGET_PATTERN}))?\\s*$`),
  );
  if (!match) {
    failWG("Malformed @next", location);
  }
  const label = match[1]
    ? parseQuotedString(match[1], location, "Next label")
    : "Next";
  return {
    label: parseInterpolationParts(label, location),
    target: match[2] ?? null,
    source: nodeSource(file, line),
  };
}

function parseSceneChunk(file, chunk, features) {
  const scene = {
    id: chunk.id,
    finalTarget: chunk.finalTarget,
    kind: "event",
    heading: null,
    choiceHeading: "Choices",
    behavior: null,
    system: null,
    onEnter: [],
    passages: [],
    placeKeys: [],
    placeTags: [],
    locationTags: [],
    hub: null,
    offer: null,
    automaticTriggers: [],
    pools: [],
    conditions: [],
    label: null,
    icon: null,
    hubText: null,
    priority: 0,
    chance: 1,
    weight: 1,
    source: nodeSource(file, chunk.headerLine),
  };
  const singleFields = new Set();
  const passageIds = new Set();
  let anonymousIndex = 1;
  let index = 0;

  while (index < chunk.lines.length) {
    const line = chunk.lines[index];
    const text = line.text.trim();
    if (!text || isComment(text)) {
      index += 1;
      continue;
    }
    const name = directiveName(text);
    if (
      !WG_SCENE_METADATA_DIRECTIVES.includes(name)
    ) break;
    const location = lineLocation(file, line.line);
    if (
      WG_SINGLE_SCENE_METADATA_DIRECTIVES.includes(name)
    ) {
      if (singleFields.has(name)) failWG(`Duplicate @${name}`, location);
      singleFields.add(name);
    }

    if (name === "heading") {
      scene.heading = parseQuotedString(
        directiveArgument(text, "heading", location),
        location,
        "Scene heading",
      );
      index += 1;
    } else if (name === "choices") {
      scene.choiceHeading = parseQuotedString(
        directiveArgument(text, "choices", location),
        location,
        "Choice section heading",
      );
      index += 1;
    } else if (name === "behavior") {
      scene.behavior = parseBehaviorMetadata(text, file, line.line);
      index += 1;
    } else if (name === "system") {
      scene.system = parseSystemMetadata(text, file, line.line);
      index += 1;
    } else if (name === "onenter") {
      if (text !== "@onenter") {
        failWG("@onenter does not accept arguments", location);
      }
      const parsed = parseOnEnter(file, chunk.lines, index + 1, line.line);
      scene.onEnter = parsed.effects;
      index = parsed.nextIndex;
    } else if (name === "hub") {
      const placeKey = directiveArgument(text, "hub", location);
      if (!ID_REGEX.test(placeKey)) {
        failWG("@hub requires a place key", location);
      }
      if (
        !PLACE_REGISTRY.some((place) => place.key === placeKey) &&
        !NPC_REGISTRY.some((npc) => `home_${npc.id}` === placeKey)
      ) {
        failWG(`@hub references unknown place '${placeKey}'`, location);
      }
      if (scene.placeKeys.includes(placeKey)) {
        failWG(`Duplicate place selector '${placeKey}'`, location);
      }
      scene.hub = { type: "place" };
      scene.placeKeys.push(placeKey);
      scene.kind = "place";
      index += 1;
    } else if (["place-key", "place-tag", "location-tag"].includes(name)) {
      const value = directiveArgument(text, name, location);
      const regex = name === "place-key" ? ID_REGEX : TAG_REGEX;
      if (!regex.test(value)) failWG(`Invalid @${name} value '${value}'`, location);
      const target = {
        "place-key": scene.placeKeys,
        "place-tag": scene.placeTags,
        "location-tag": scene.locationTags,
      }[name];
      if (target.includes(value)) failWG(`Duplicate @${name} '${value}'`, location);
      target.push(value);
      index += 1;
    } else if (name === "offer") {
      const argument = directiveArgument(text, "offer", location);
      if (argument === "place") {
        scene.offer = { type: "place" };
      } else {
        const npcOffer = argument.match(new RegExp(`^npc\\s+(${ID_PATTERN})$`));
        if (!npcOffer) failWG("@offer must be 'place' or 'npc <id>'", location);
        scene.offer = { type: "npc", npcId: npcOffer[1] };
      }
      index += 1;
    } else if (name === "auto") {
      const trigger = directiveArgument(text, "auto", location);
      if (
        !WG_AUTO_TRIGGERS.includes(trigger)
      ) {
        failWG(
          `@auto must be one of: ${WG_AUTO_TRIGGERS.join(", ")}`,
          location,
        );
      }
      if (scene.automaticTriggers.includes(trigger)) {
        failWG(`Duplicate @auto '${trigger}'`, location);
      }
      scene.automaticTriggers.push(trigger);
      index += 1;
    } else if (name === "pool") {
      const poolId = directiveArgument(text, "pool", location);
      if (!ID_REGEX.test(poolId)) failWG("@pool requires a pool id", location);
      if (scene.pools.includes(poolId)) failWG(`Duplicate @pool '${poolId}'`, location);
      scene.pools.push(poolId);
      index += 1;
    } else if (name === "when") {
      scene.conditions.push(parseExpression(directiveArgument(text, "when", location), location));
      index += 1;
    } else if (name === "label") {
      scene.label = parseQuotedString(
        directiveArgument(text, "label", location),
        location,
        "Scene label",
      );
      index += 1;
    } else if (name === "icon") {
      const value = directiveArgument(text, "icon", location);
      scene.icon = value.startsWith('"')
        ? parseQuotedString(value, location, "Scene icon")
        : value;
      index += 1;
    } else if (name === "hub-text") {
      scene.hubText = parseQuotedString(
        directiveArgument(text, "hub-text", location),
        location,
        "Scene hub text",
      );
      index += 1;
    } else if (name === "priority") {
      const value = directiveArgument(text, "priority", location);
      if (!/^[+-]?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
        failWG("@priority must be a safe integer", location);
      }
      scene.priority = Number(value);
      index += 1;
    } else if (name === "chance") {
      scene.chance = parseProbability(
        directiveArgument(text, "chance", location),
        location,
        "chance",
      );
      index += 1;
    } else if (name === "weight") {
      const value = Number(directiveArgument(text, "weight", location));
      if (!Number.isFinite(value) || value <= 0) {
        failWG("@weight must be a positive number", location);
      }
      scene.weight = value;
      index += 1;
    }
  }

  const nextAnonymousId = () => {
    while (passageIds.has(`p${anonymousIndex}`)) anonymousIndex += 1;
    const id = `p${anonymousIndex}`;
    anonymousIndex += 1;
    return id;
  };
  const startPassage = (id, line) => {
    if (passageIds.has(id)) {
      failWG(`Duplicate passage id '${id}' in scene '${scene.id}'`, lineLocation(file, line));
    }
    passageIds.add(id);
    const passage = {
      id,
      body: [],
      next: null,
      source: nodeSource(file, line),
    };
    scene.passages.push(passage);
    return passage;
  };

  let currentPassage = null;
  while (index < chunk.lines.length) {
    const line = chunk.lines[index];
    const text = line.text.trim();

    if (!text || isComment(text)) {
      index += 1;
      continue;
    }
    const name = directiveName(text);
    if (name === "passage") {
      const passageId = directiveArgument(text, "passage", lineLocation(file, line.line));
      if (!new RegExp(`^${PASSAGE_ID_PATTERN}$`).test(passageId)) {
        failWG("Passage id must be a lowercase local identifier", lineLocation(file, line.line));
      }
      currentPassage = startPassage(passageId, line.line);
      index += 1;
      continue;
    }
    if (name === "next") {
      if (!currentPassage) currentPassage = startPassage(nextAnonymousId(), line.line);
      if (currentPassage.next) failWG("Duplicate @next in passage", lineLocation(file, line.line));
      currentPassage.next = parseNext(text, file, line.line);
      currentPassage = null;
      index += 1;
      continue;
    }

    if (!currentPassage) currentPassage = startPassage(nextAnonymousId(), line.line);
    const bodyParser = new SceneBodyParser(file, chunk.lines, index, false, features);
    currentPassage.body.push(
      ...bodyParser.parseNodes(new Set(["passage", "next"])),
    );
    index = bodyParser.index;
  }

  if (scene.system && scene.behavior) {
    failWG(
      "@system and @behavior cannot be used on the same scene",
      lineLocation(file, chunk.headerLine),
    );
  }
  if (scene.system && scene.passages.length) {
    failWG(
      "System-backed scenes cannot contain authored passages",
      lineLocation(file, scene.passages[0].source.line),
    );
  }
  if (scene.system && !scene.finalTarget) {
    failWG("System-backed scenes require a final target", lineLocation(file, chunk.headerLine));
  }
  if (!scene.system && !scene.passages.length) {
    failWG("Scene requires at least one passage", lineLocation(file, chunk.headerLine));
  }
  for (let passageIndex = 0; passageIndex < scene.passages.length; passageIndex += 1) {
    const passage = scene.passages[passageIndex];
    if (!passage.body.length) {
      failWG(`Passage '${passage.id}' cannot be empty`, lineLocation(file, passage.source.line));
    }
    if (passage.next && passage.next.target === null) {
      passage.next.target = passageIndex + 1 < scene.passages.length
        ? `.${scene.passages[passageIndex + 1].id}`
        : scene.finalTarget;
      if (!passage.next.target) {
        failWG(
          `Final @next in scene '${scene.id}' requires a target or a scene final target`,
          lineLocation(file, passage.next.source.line),
        );
      }
    }
  }

  const exposed = Boolean(
    scene.hub || scene.offer || scene.automaticTriggers.length || scene.pools.length,
  );
  if (scene.hub && (scene.offer || scene.automaticTriggers.length || scene.pools.length)) {
    failWG(
      "Hub scenes cannot also use @offer, @auto, or @pool",
      lineLocation(file, chunk.headerLine),
    );
  }
  if (
    scene.hub?.type === "place" &&
    (scene.placeKeys.length !== 1 ||
      scene.placeTags.length ||
      scene.locationTags.length)
  ) {
    failWG(
      "@hub selects exactly one place and cannot use additional position selectors",
      lineLocation(file, chunk.headerLine),
    );
  }
  if (scene.offer && scene.label === null) {
    failWG("Offered scenes require @label", lineLocation(file, chunk.headerLine));
  }
  if (!exposed && (
    scene.placeKeys.length || scene.placeTags.length || scene.locationTags.length ||
    scene.conditions.length || scene.label !== null || scene.icon !== null ||
    scene.hubText !== null || scene.priority !== 0 || scene.chance !== 1 || scene.weight !== 1
  )) {
    failWG(
      "Scene exposure metadata requires @hub, @offer, @auto, or @pool",
      lineLocation(file, chunk.headerLine),
    );
  }

  return scene;
}

function parseLocationBlock(file, lines, startIndex, features) {
  const opening = lines[startIndex];
  const header = opening.text.trim().match(new RegExp(`^@location\\s+(${ID_PATTERN})\\s*$`));
  if (!header) failWG("Malformed @location header", lineLocation(file, opening.line));

  const conditions = [];
  let index = startIndex + 1;
  while (index < lines.length) {
    const line = lines[index];
    const text = line.text.trim();
    if (!text || isComment(text)) {
      index += 1;
      continue;
    }
    if (directiveName(text) !== "when") break;
    conditions.push(parseExpression(
      directiveArgument(text, "when", lineLocation(file, line.line)),
      lineLocation(file, line.line),
    ));
    index += 1;
  }

  const bodyStart = index;
  while (index < lines.length) {
    const text = lines[index].text.trim();
    if (text === "@endlocation") {
      const body = new SceneBodyParser(
        file,
        lines.slice(bodyStart, index),
        0,
        false,
        features,
      ).parseNodes();
      if (!body.length) {
        failWG("Location contribution requires prose or choices", lineLocation(file, opening.line));
      }
      return {
        contribution: { id: header[1], conditions, body, source: nodeSource(file, opening.line) },
        nextIndex: index + 1,
      };
    }
    if (
      text.startsWith("::") ||
      ["chat", "location", "reminder"].includes(directiveName(text))
    ) {
      break;
    }
    index += 1;
  }
  failWG("Unclosed @location block", lineLocation(file, opening.line));
}

function parseReminderBlock(file, lines, startIndex) {
  const opening = lines[startIndex];
  const header = opening.text.trim().match(new RegExp(`^@reminder\\s+(${ID_PATTERN})$`));
  if (!header) failWG("Expected @reminder <id>", lineLocation(file, opening.line));
  const reminder = { id: header[1], tone: "info", priority: 0, source: nodeSource(file, opening.line) };
  const seen = new Set();
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const text = line.text.trim();
    if (!text || isComment(text)) continue;
    const location = lineLocation(file, line.line);
    if (text === "@endreminder") {
      if (!seen.has("text")) failWG("Reminder requires @text", lineLocation(file, opening.line));
      return { reminder, nextIndex: index + 1 };
    }
    const name = directiveName(text);
    if (!["text", "tone", "priority"].includes(name)) {
      failWG("Reminder definitions may contain only @text, @tone, and @priority; close with @endreminder", location);
    }
    if (seen.has(name)) failWG(`Duplicate @${name} in reminder '${reminder.id}'`, location);
    seen.add(name);
    const value = directiveArgument(text, name, location);
    if (name === "text") {
      reminder.text = parseQuotedString(value, location, "Reminder text");
      if (reminder.text.includes("{{") || reminder.text.includes("}}")) {
        failWG("Reminder text is literal; interpolation is not supported", location);
      }
    } else if (name === "tone") {
      if (!WG_REMINDER_TONES.includes(value)) {
        failWG(`@tone must be one of: ${WG_REMINDER_TONES.join(", ")}`, location);
      }
      reminder.tone = value;
    } else {
      if (!/^[+-]?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
        failWG("@priority must be a signed safe integer", location);
      }
      reminder.priority = Number(value);
    }
  }
  failWG("Unclosed @reminder block", lineLocation(file, opening.line));
}

function parseChatBlock(file, lines, startIndex, features) {
  const opening = lines[startIndex];
  const match = opening.text.trim().match(new RegExp(`^@chat\\s+(${ID_PATTERN})$`));
  if (!match) failWG("Expected @chat <id>", lineLocation(file, opening.line));
  const chat = { id: match[1], npcId: null, passages: [], source: nodeSource(file, opening.line) };
  let passage = null;
  const finishPassage = () => {
    if (!passage) return;
    const parser = new SceneBodyParser(file, passage.lines, 0, true, features);
    chat.passages.push({ id: passage.id, body: parser.parseNodes(), source: passage.source });
  };
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const text = line.text.trim();
    if (!text || isComment(text)) { if (passage) passage.lines.push(line); continue; }
    if (text === "@endchat") {
      finishPassage();
      if (!chat.npcId || !chat.passages.length) failWG("Chat requires @npc and at least one @passage", lineLocation(file, opening.line));
      return { chat, nextIndex: index + 1 };
    }
    if (text.startsWith("@npc")) {
      if (chat.npcId || passage) failWG("Declare @npc once, before chat passages", lineLocation(file, line.line));
      chat.npcId = directiveArgument(text, "npc", lineLocation(file, line.line));
      if (!ID_REGEX.test(chat.npcId)) failWG("Invalid NPC id", lineLocation(file, line.line));
      continue;
    }
    if (text.startsWith("@passage")) {
      finishPassage();
      const id = directiveArgument(text, "passage", lineLocation(file, line.line));
      if (!new RegExp(`^${PASSAGE_ID_PATTERN}$`).test(id)) failWG("Invalid chat passage id", lineLocation(file, line.line));
      passage = { id, lines: [], source: nodeSource(file, line.line) };
      continue;
    }
    if (!passage) failWG("Chat content requires @passage", lineLocation(file, line.line));
    passage.lines.push(line);
  }
  failWG("Unclosed @chat block", lineLocation(file, opening.line));
}

export function parseWGDocument(
  { file = "<wg>", source },
  { features = DEFAULT_FEATURE_CATALOG } = {},
) {
  if (typeof source !== "string") {
    failWG("WG source must be text", lineLocation(normalizeFile(file), 1));
  }
  const normalizedFile = normalizeFile(file);
  const rawLines = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const lines = rawLines.map((text, index) => ({ text, line: index + 1 }));
  const chunks = [];
  const locationContributions = [];
  const reminders = [];
  const chats = [];
  let currentChunk = null;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.text.trim();

    if (trimmed.startsWith("@chat")) {
      currentChunk = null;
      const parsed = parseChatBlock(normalizedFile, lines, index, features);
      chats.push(parsed.chat);
      index = parsed.nextIndex;
      continue;
    }

    if (trimmed.startsWith("@reminder")) {
      currentChunk = null;
      const parsed = parseReminderBlock(normalizedFile, lines, index);
      reminders.push(parsed.reminder);
      index = parsed.nextIndex;
      continue;
    }
    if (trimmed.startsWith("@location")) {
      currentChunk = null;
      const parsed = parseLocationBlock(normalizedFile, lines, index, features);
      locationContributions.push(parsed.contribution);
      index = parsed.nextIndex;
      continue;
    }
    if (trimmed.startsWith("::")) {
      const header = trimmed.match(
        new RegExp(
          `^::\\s+(${ID_PATTERN})(?:\\s+->\\s+(${WG_SCENE_FINAL_TARGET_PATTERN}))?\\s*$`,
        ),
      );
      if (!header) {
        failWG("Malformed scene header", lineLocation(normalizedFile, line.line));
      }
      currentChunk = {
        id: header[1],
        finalTarget: header[2] ?? null,
        headerLine: line.line,
        lines: [],
      };
      chunks.push(currentChunk);
      index += 1;
      continue;
    }

    if (!currentChunk) {
      if (!trimmed || isComment(trimmed)) {
        index += 1;
        continue;
      }
      failWG(
        "Content appears outside a scene, location, reminder, or chat block",
        lineLocation(normalizedFile, line.line),
      );
    }
    currentChunk.lines.push(line);
    index += 1;
  }

  return {
    scenes: chunks.map((chunk) => parseSceneChunk(normalizedFile, chunk, features)),
    locationContributions,
    reminders,
    chats,
  };
}

export function parseWGSource(input, options) {
  return parseWGDocument(input, options).scenes;
}
