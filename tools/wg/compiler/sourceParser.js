import { failWG, sourceLocation } from "./diagnostic.js";
import { parseExpression } from "./expressionParser.js";
import { SKILLS, STATS } from "../../../src/data/player/stats.js";
import { SCHOOL_SUBJECTS } from "../../../src/data/player/education.js";
import { SKILL_CHECK_DIFFICULTIES } from "../../../src/data/scene/skillChecks.js";

const ID_PATTERN = "[a-z][a-z0-9_.-]*";
const ID_REGEX = new RegExp(`^${ID_PATTERN}$`);
const PASSAGE_ID_PATTERN = "[a-z][a-z0-9_-]*";
const STORY_TARGET_PATTERN = `(?:@exit|@leave-place|\\.${PASSAGE_ID_PATTERN}|${ID_PATTERN})`;
const TAG_REGEX = /^[a-z][a-z0-9_-]*$/;
const PATH_REGEX = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/;
const QUOTED_PATTERN = '"(?:\\\\.|[^"\\\\])*"';

function normalizeFile(file) {
  return String(file || "<wg>").replaceAll("\\", "/");
}

function lineLocation(file, line, column = 1) {
  return sourceLocation(file, line, column);
}

function nodeSource(file, line, column = 1) {
  return { file, line, column };
}

function parseQuotedString(value, location, label) {
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
  if (!parsed.trim()) failWG(`${label} cannot be empty`, location);
  return parsed;
}

function directiveArgument(text, directive, location) {
  const prefix = `@${directive}`;
  const argument = text.slice(prefix.length).trim();
  if (!argument) failWG(`@${directive} requires a value`, location);
  return argument;
}

function directiveName(text) {
  return text.match(/^@([a-z][a-z-]*)/)?.[1] ?? null;
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
  const match = text.match(
    /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/,
  );
  if (!match || !match.slice(1).some((part) => part !== undefined)) {
    failWG(`Invalid duration '${text}'`, location);
  }

  const minutes =
    Number(match[1] || 0) * 60 +
    Number(match[2] || 0) +
    Number(match[3] || 0) / 60;
  if (!Number.isFinite(minutes) || minutes < 0) {
    failWG(`Invalid duration '${text}'`, location);
  }
  return minutes;
}

function parseTime(value, location) {
  const text = String(value).trim();
  const freeMatch = text.match(/^(.*?)\s+free$/);
  const durationText = freeMatch ? freeMatch[1].trim() : text;
  return {
    durationMinutes: parseDuration(durationText, location),
    energyFree: Boolean(freeMatch),
  };
}

function parseEffect(text, file, line) {
  const location = lineLocation(file, line);
  const argument = directiveArgument(text, "effect", location);

  const storyMutation = argument.match(
    /^(set|add)\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+)\s+(.+)$/,
  );
  if (storyMutation) {
    const [, operation, pathText, valueText] = storyMutation;
    const path = pathText.split(".");
    if (path[0] !== "story" || path.length < 2) {
      failWG(`@effect ${operation} may only target story.*`, location);
    }
    return {
      op: operation,
      path,
      value: parseExpression(valueText, location),
      source: nodeSource(file, line),
    };
  }

  const flag = argument.match(
    new RegExp(`^(flag|daily-flag)\\s+(${ID_PATTERN})\\s+(true|false)$`),
  );
  if (flag) {
    return {
      op: flag[1],
      flag: flag[2],
      value: flag[3] === "true",
      source: nodeSource(file, line),
    };
  }

  const relationship = argument.match(
    new RegExp(`^relationship\\s+(${ID_PATTERN})\\s+([+-]?\\d+(?:\\.\\d+)?)$`),
  );
  if (relationship) {
    return {
      op: "relationship",
      npcId: relationship[1],
      amount: Number(relationship[2]),
      source: nodeSource(file, line),
    };
  }

  const money = argument.match(/^money\s+([+-]?\d+(?:\.\d+)?)$/);
  if (money) {
    const amount = Number(money[1]);
    if (!Number.isFinite(amount)) failWG("@effect money requires a finite amount", location);
    return {
      op: "money",
      amount,
      source: nodeSource(file, line),
    };
  }

  const playerValue = argument.match(
    new RegExp(`^(skill|stat)\\s+(${ID_PATTERN})\\s+([+-]?\\d+(?:\\.\\d+)?)$`),
  );
  if (playerValue) {
    const [, operation, id, amountText] = playerValue;
    const registry = operation === "skill" ? SKILLS : STATS;
    if (!registry[id]) failWG(`@effect ${operation} references unknown ${operation} '${id}'`, location);
    return {
      op: operation,
      id,
      amount: Number(amountText),
      source: nodeSource(file, line),
    };
  }

  const educationValue = argument.match(
    new RegExp(`^(grade|attendance)\\s+(${ID_PATTERN})\\s+([+-]?\\d+(?:\\.\\d+)?)$`),
  );
  if (educationValue) {
    const [, operation, id, amountText] = educationValue;
    if (!SCHOOL_SUBJECTS[id]) {
      failWG(`@effect ${operation} references unknown school subject '${id}'`, location);
    }
    const amount = Number(amountText);
    if (operation === "attendance" && (!Number.isInteger(amount) || amount <= 0)) {
      failWG("@effect attendance requires a positive whole number", location);
    }
    return {
      op: operation,
      id,
      amount,
      source: nodeSource(file, line),
    };
  }

  failWG("Unknown or malformed @effect", location);
}

class SceneBodyParser {
  constructor(file, lines, startIndex = 0) {
    this.file = file;
    this.lines = lines;
    this.index = startIndex;
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
      const text = paragraphLines.map((line) => line.text.trim()).join(" ");
      nodes.push({
        type: "paragraph",
        parts: parseInterpolationParts(
          text,
          lineLocation(this.file, firstLine.line),
        ),
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

      const name = directiveName(trimmed);
      if (name && stopDirectives.has(name)) {
        flushParagraph();
        return nodes;
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
      if (name) {
        flushParagraph();
        failWG(`Unexpected @${name}`, lineLocation(this.file, line.line));
      }
      if (trimmed.startsWith("@")) {
        flushParagraph();
        failWG("Malformed or unknown directive", lineLocation(this.file, line.line));
      }

      const unescaped = trimmed.startsWith("\\@") || trimmed.startsWith("\\::")
        ? trimmed.slice(1)
        : trimmed;
      paragraphLines.push({ text: unescaped, line: line.line });
      this.index += 1;
    }

    flushParagraph();
    return nodes;
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
      energyFree: false,
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
        outcome.energyFree = parsedTime.energyFree;
      } else if (name === "effect") {
        outcome.effects.push(parseEffect(directive, this.file, line.line));
      } else {
        failWG(`@${kind} may contain only @time and @effect directives`, location);
      }
      this.index += 1;
    }

    failWG(`Unclosed @${kind} block`, lineLocation(this.file, opening.line));
  }

  finishChoice(choice, singleFields, location) {
    if (choice.target !== null) {
      if (choice.check || choice.outcomes.success || choice.outcomes.failure) {
        failWG("Direct choices cannot contain skill-check outcomes", location);
      }
      delete choice.check;
      delete choice.outcomes;
      return choice;
    }

    if (!choice.check) failWG("A targetless choice requires @check", location);
    if (!choice.outcomes.success || !choice.outcomes.failure) {
      failWG("Skill checks require both @success and @failure outcomes", location);
    }
    if (singleFields.has("timing") || choice.effects.length || choice.previews.length) {
      failWG("Checked choices keep @time and @effect inside outcome blocks and cannot use @preview", location);
    }
    delete choice.target;
    delete choice.durationMinutes;
    delete choice.timeUntilPath;
    delete choice.energyFree;
    delete choice.previews;
    delete choice.effects;
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

    const choice = {
      type: "choice",
      id: match[1],
      label: parseQuotedString(
        match[2],
        lineLocation(this.file, opening.line),
        "Choice label",
      ),
      target: match[3] ?? null,
      check: null,
      outcomes: { success: null, failure: null },
      icon: null,
      durationMinutes: 0,
      timeUntilPath: null,
      energyFree: false,
      when: null,
      requirements: [],
      warning: null,
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

      if (name === "success" || name === "failure") {
        if (choice.outcomes[name]) failWG(`Duplicate @${name}`, location);
        choice.outcomes[name] = this.parseChoiceOutcome(name);
        continue;
      }

      if (["icon", "when", "warning", "check"].includes(name)) {
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
        choice.energyFree = parsedTime.energyFree;
      } else if (name === "time-until") {
        const pathText = directiveArgument(text, "time-until", location);
        if (!PATH_REGEX.test(pathText)) {
          failWG("@time-until requires a dotted runtime path", location);
        }
        choice.timeUntilPath = pathText.split(".");
      } else if (name === "when") {
        choice.when = parseExpression(
          directiveArgument(text, "when", location),
          location,
        );
      } else if (name === "check") {
        const argument = directiveArgument(text, "check", location);
        const check = argument.match(new RegExp(`^(${ID_PATTERN})\\s+(${ID_PATTERN})$`));
        if (!check) failWG("@check needs a skill id and difficulty id", location);
        const [, skillId, difficultyId] = check;
        if (!SKILLS[skillId]) failWG(`@check references unknown skill '${skillId}'`, location);
        if (!SKILL_CHECK_DIFFICULTIES[difficultyId]) {
          failWG(`@check references unknown difficulty '${difficultyId}'`, location);
        }
        choice.check = { skillId, difficultyId, source: nodeSource(this.file, line.line) };
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
      } else if (name === "preview") {
        const argument = directiveArgument(text, "preview", location);
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
      } else if (name === "effect") {
        choice.effects.push(parseEffect(text, this.file, line.line));
      } else {
        failWG(`Unknown choice directive @${name}`, location);
      }

      this.index += 1;
    }

    failWG("Unclosed @choice block", lineLocation(this.file, opening.line));
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
    effects.push(parseEffect(text, file, line.line));
    index += 1;
  }
  failWG("Unclosed @onenter block", lineLocation(file, openingLine));
}

function parseSceneChunk(file, chunk) {
  let index = 0;
  let kind = "event";
  let heading = null;
  let choiceHeading = "Choices";
  let onEnter = [];
  const seenMetadata = new Set();

  while (index < chunk.lines.length) {
    const line = chunk.lines[index];
    const text = line.text.trim();
    if (!text || isComment(text)) {
      index += 1;
      continue;
    }

    const name = directiveName(text);
    if (!["kind", "heading", "choices", "onenter"].includes(name)) break;
    if (seenMetadata.has(name)) {
      failWG(`Duplicate @${name}`, lineLocation(file, line.line));
    }
    seenMetadata.add(name);

    if (name === "kind") {
      kind = directiveArgument(text, "kind", lineLocation(file, line.line));
      if (!ID_REGEX.test(kind)) {
        failWG("Scene kind must be a lowercase identifier", lineLocation(file, line.line));
      }
      index += 1;
    } else if (name === "heading") {
      heading = parseQuotedString(
        directiveArgument(text, "heading", lineLocation(file, line.line)),
        lineLocation(file, line.line),
        "Scene heading",
      );
      index += 1;
    } else if (name === "choices") {
      choiceHeading = parseQuotedString(
        directiveArgument(text, "choices", lineLocation(file, line.line)),
        lineLocation(file, line.line),
        "Choice section heading",
      );
      index += 1;
    } else {
      if (text !== "@onenter") {
        failWG("@onenter does not accept arguments", lineLocation(file, line.line));
      }
      const parsed = parseOnEnter(file, chunk.lines, index + 1, line.line);
      onEnter = parsed.effects;
      index = parsed.nextIndex;
    }
  }

  if (heading === null) {
    failWG("Scene requires @heading", lineLocation(file, chunk.headerLine));
  }

  const bodyParser = new SceneBodyParser(file, chunk.lines, index);
  const body = bodyParser.parseNodes();
  return {
    id: chunk.id,
    kind,
    heading,
    choiceHeading,
    tags: chunk.tags,
    onEnter,
    body,
    source: nodeSource(file, chunk.headerLine),
  };
}

function parseNext(text, file, line) {
  const location = lineLocation(file, line);
  const match = text.match(
    new RegExp(`^@next(?:\\s+(${QUOTED_PATTERN}))?(?:\\s+->\\s+(${STORY_TARGET_PATTERN}))?\\s*$`),
  );
  if (!match || match[2] === "@leave-place") {
    failWG("Malformed @next", location);
  }
  return {
    label: match[1] ? parseQuotedString(match[1], location, "Next label") : "Next",
    target: match[2] ?? null,
    source: nodeSource(file, line),
  };
}

function parseSequenceBlock(file, lines, startIndex) {
  const opening = lines[startIndex];
  const header = opening.text.trim().match(
    new RegExp(`^@sequence\\s+(${ID_PATTERN})\\s+->\\s+(@exit|${ID_PATTERN})\\s*$`),
  );
  if (!header) failWG("Malformed @sequence header", lineLocation(file, opening.line));

  const sequence = {
    id: header[1],
    finalTarget: header[2],
    kind: "event",
    heading: null,
    choiceHeading: "Choices",
    onEnter: [],
    passages: [],
    source: nodeSource(file, opening.line),
  };
  const seenMetadata = new Set();
  const passageIds = new Set();
  let anonymousIndex = 1;
  let index = startIndex + 1;

  while (index < lines.length) {
    const line = lines[index];
    const text = line.text.trim();
    if (!text || isComment(text)) {
      index += 1;
      continue;
    }
    const name = directiveName(text);
    if (!["kind", "heading", "choices", "onenter"].includes(name)) break;
    if (seenMetadata.has(name)) failWG(`Duplicate @${name}`, lineLocation(file, line.line));
    seenMetadata.add(name);

    if (name === "kind") {
      sequence.kind = directiveArgument(text, "kind", lineLocation(file, line.line));
      if (!ID_REGEX.test(sequence.kind)) {
        failWG("Sequence kind must be a lowercase identifier", lineLocation(file, line.line));
      }
      index += 1;
    } else if (name === "heading") {
      sequence.heading = parseQuotedString(
        directiveArgument(text, "heading", lineLocation(file, line.line)),
        lineLocation(file, line.line),
        "Sequence heading",
      );
      index += 1;
    } else if (name === "choices") {
      sequence.choiceHeading = parseQuotedString(
        directiveArgument(text, "choices", lineLocation(file, line.line)),
        lineLocation(file, line.line),
        "Choice section heading",
      );
      index += 1;
    } else {
      if (text !== "@onenter") {
        failWG("@onenter does not accept arguments", lineLocation(file, line.line));
      }
      const parsed = parseOnEnter(file, lines, index + 1, line.line);
      sequence.onEnter = parsed.effects;
      index = parsed.nextIndex;
    }
  }

  if (sequence.heading === null) {
    failWG("Sequence requires @heading", lineLocation(file, opening.line));
  }

  const nextAnonymousId = () => {
    while (passageIds.has(`p${anonymousIndex}`)) anonymousIndex += 1;
    const id = `p${anonymousIndex}`;
    anonymousIndex += 1;
    return id;
  };
  const startPassage = (id, line) => {
    if (passageIds.has(id)) {
      failWG(`Duplicate passage id '${id}' in sequence '${sequence.id}'`, lineLocation(file, line));
    }
    passageIds.add(id);
    const passage = {
      id,
      body: [],
      next: null,
      source: nodeSource(file, line),
    };
    sequence.passages.push(passage);
    return passage;
  };

  let currentPassage = null;
  while (index < lines.length) {
    const line = lines[index];
    const text = line.text.trim();

    if (!text || isComment(text)) {
      index += 1;
      continue;
    }
    if (text === "@endsequence") {
      if (!sequence.passages.length) {
        failWG("Sequence requires at least one passage", lineLocation(file, opening.line));
      }
      for (let passageIndex = 0; passageIndex < sequence.passages.length; passageIndex += 1) {
        const passage = sequence.passages[passageIndex];
        if (!passage.body.length) {
          failWG(
            `Passage '${passage.id}' cannot be empty`,
            lineLocation(file, passage.source.line),
          );
        }
        if (passage.next && passage.next.target === null) {
          passage.next.target = passageIndex + 1 < sequence.passages.length
            ? `.${sequence.passages[passageIndex + 1].id}`
            : sequence.finalTarget;
        }
      }
      return { sequence, nextIndex: index + 1 };
    }
    if (text.startsWith("@sequence") || text.startsWith("@entry") || text.startsWith("::")) {
      failWG("Unclosed @sequence block", lineLocation(file, opening.line));
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
    const bodyParser = new SceneBodyParser(file, lines, index);
    currentPassage.body.push(
      ...bodyParser.parseNodes(new Set(["passage", "next", "endsequence"])),
    );
    index = bodyParser.index;
  }

  failWG("Unclosed @sequence block", lineLocation(file, opening.line));
}

function parseEntryBlock(file, lines, startIndex) {
  const opening = lines[startIndex];
  const openingText = opening.text.trim();
  const header = openingText.match(new RegExp(`^@entry\\s+(${ID_PATTERN})\\s*$`));
  if (!header) failWG("Malformed @entry header", lineLocation(file, opening.line));

  const entry = {
    id: header[1],
    sceneId: null,
    placeKeys: [],
    placeTags: [],
    locationTags: [],
    hub: null,
    offer: null,
    automaticTriggers: [],
    conditions: [],
    label: null,
    icon: null,
    hubText: null,
    priority: 0,
    chance: 1,
    weight: 1,
    source: nodeSource(file, opening.line),
  };
  const singleFields = new Set();
  let index = startIndex + 1;

  while (index < lines.length) {
    const line = lines[index];
    const text = line.text.trim();
    const location = lineLocation(file, line.line);

    if (!text || isComment(text)) {
      index += 1;
      continue;
    }
    if (text === "@endentry") {
      if (entry.sceneId === null) failWG("Entry requires @scene", location);
      if (entry.hub === null && entry.offer === null && entry.automaticTriggers.length === 0) {
        failWG("Entry requires @hub, @offer, or @auto", location);
      }
      if (entry.hub && (entry.offer || entry.automaticTriggers.length)) {
        failWG("Hub entries cannot also use @offer or @auto", location);
      }
      if (entry.hub?.type === "place" && !entry.placeKeys.length && !entry.placeTags.length) {
        failWG("Place hub entries require @place-key or @place-tag", location);
      }
      if (entry.offer && entry.label === null) {
        failWG("Offered entries require @label", location);
      }
      return { entry, nextIndex: index + 1 };
    }
    if (text.startsWith("::") || text.startsWith("@entry")) {
      failWG("Unclosed @entry block", lineLocation(file, opening.line));
    }

    const name = directiveName(text);
    if (!name) failWG("Entry blocks may contain only entry directives", location);

    if (
      ["scene", "hub", "offer", "label", "icon", "hub-text", "priority", "chance", "weight"].includes(
        name,
      )
    ) {
      if (singleFields.has(name)) failWG(`Duplicate @${name}`, location);
      singleFields.add(name);
    }

    if (name === "scene") {
      const sceneId = directiveArgument(text, "scene", location);
      if (!ID_REGEX.test(sceneId)) failWG("Entry scene must be a scene id", location);
      entry.sceneId = sceneId;
    } else if (name === "hub") {
      const hubType = directiveArgument(text, "hub", location);
      if (hubType !== "place") failWG("@hub must be 'place'", location);
      entry.hub = { type: hubType };
    } else if (["place-key", "place-tag", "location-tag"].includes(name)) {
      const value = directiveArgument(text, name, location);
      const regex = name === "place-key" ? ID_REGEX : TAG_REGEX;
      if (!regex.test(value)) failWG(`Invalid @${name} value '${value}'`, location);
      const target = {
        "place-key": entry.placeKeys,
        "place-tag": entry.placeTags,
        "location-tag": entry.locationTags,
      }[name];
      if (target.includes(value)) failWG(`Duplicate @${name} '${value}'`, location);
      target.push(value);
    } else if (name === "offer") {
      const argument = directiveArgument(text, "offer", location);
      if (argument === "place") {
        entry.offer = { type: "place" };
      } else {
        const npcOffer = argument.match(new RegExp(`^npc\\s+(${ID_PATTERN})$`));
        if (!npcOffer) failWG("@offer must be 'place' or 'npc <id>'", location);
        entry.offer = { type: "npc", npcId: npcOffer[1] };
      }
    } else if (name === "auto") {
      const trigger = directiveArgument(text, "auto", location);
      if (!["enter-place", "enter-location"].includes(trigger)) {
        failWG("@auto must be 'enter-place' or 'enter-location'", location);
      }
      if (entry.automaticTriggers.includes(trigger)) {
        failWG(`Duplicate @auto '${trigger}'`, location);
      }
      entry.automaticTriggers.push(trigger);
    } else if (name === "when") {
      entry.conditions.push(
        parseExpression(directiveArgument(text, "when", location), location),
      );
    } else if (name === "label") {
      entry.label = parseQuotedString(
        directiveArgument(text, "label", location),
        location,
        "Entry label",
      );
    } else if (name === "icon") {
      const value = directiveArgument(text, "icon", location);
      entry.icon = value.startsWith('"')
        ? parseQuotedString(value, location, "Entry icon")
        : value;
    } else if (name === "hub-text") {
      entry.hubText = parseQuotedString(
        directiveArgument(text, "hub-text", location),
        location,
        "Entry hub text",
      );
    } else if (name === "priority") {
      const value = directiveArgument(text, "priority", location);
      if (!/^[+-]?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
        failWG("@priority must be a safe integer", location);
      }
      entry.priority = Number(value);
    } else if (name === "chance") {
      const value = directiveArgument(text, "chance", location);
      const percent = value.match(/^(\d+(?:\.\d+)?)%$/);
      const decimal = value.match(/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/);
      if (!percent && !decimal) {
        failWG("@chance must be between 0 and 1 or a percentage", location);
      }
      entry.chance = percent ? Number(percent[1]) / 100 : Number(value);
      if (entry.chance < 0 || entry.chance > 1) {
        failWG("@chance must be between 0 and 1 or a percentage", location);
      }
    } else if (name === "weight") {
      const value = Number(directiveArgument(text, "weight", location));
      if (!Number.isFinite(value) || value <= 0) {
        failWG("@weight must be a positive number", location);
      }
      entry.weight = value;
    } else {
      failWG(`Unknown entry directive @${name}`, location);
    }

    index += 1;
  }

  failWG("Unclosed @entry block", lineLocation(file, opening.line));
}

export function parseWGDocument({ file = "<wg>", source }) {
  if (typeof source !== "string") {
    failWG("WG source must be text", lineLocation(normalizeFile(file), 1));
  }
  const normalizedFile = normalizeFile(file);
  const rawLines = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const lines = rawLines.map((text, index) => ({ text, line: index + 1 }));
  const chunks = [];
  const entries = [];
  const sequences = [];
  let currentChunk = null;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.text.trim();

    if (trimmed.startsWith("@entry")) {
      currentChunk = null;
      const parsed = parseEntryBlock(normalizedFile, lines, index);
      entries.push(parsed.entry);
      index = parsed.nextIndex;
      continue;
    }
    if (trimmed.startsWith("@sequence")) {
      currentChunk = null;
      const parsed = parseSequenceBlock(normalizedFile, lines, index);
      sequences.push(parsed.sequence);
      index = parsed.nextIndex;
      continue;
    }
    if (trimmed.startsWith("::")) {
      const header = trimmed.match(
        new RegExp(`^::\\s+(${ID_PATTERN})(?:\\s+\\[([^\\]]*)\\])?\\s*$`),
      );
      if (!header) {
        failWG("Malformed scene header", lineLocation(normalizedFile, line.line));
      }
      const tags = header[2]
        ? header[2].trim().split(/\s+/).filter(Boolean)
        : [];
      for (const tag of tags) {
        if (!TAG_REGEX.test(tag)) {
          failWG(`Invalid scene tag '${tag}'`, lineLocation(normalizedFile, line.line));
        }
      }
      currentChunk = {
        id: header[1],
        tags: [...new Set(tags)],
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
      failWG("Content appears outside a scene or entry", lineLocation(normalizedFile, line.line));
    }
    currentChunk.lines.push(line);
    index += 1;
  }

  return {
    scenes: chunks.map((chunk) => parseSceneChunk(normalizedFile, chunk)),
    sequences,
    entries,
  };
}

export function parseWGSource(input) {
  return parseWGDocument(input).scenes;
}
