import { failWG, sourceLocation } from "./diagnostic.js";
import { parseExpression } from "./expressionParser.js";

const ID_PATTERN = "[a-z][a-z0-9_.-]*";
const ID_REGEX = new RegExp(`^${ID_PATTERN}$`);
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
  return text.match(/^@([a-z]+)/)?.[1] ?? null;
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

  const flag = argument.match(new RegExp(`^flag\\s+(${ID_PATTERN})\\s+(true|false)$`));
  if (flag) {
    return {
      op: "flag",
      flag: flag[1],
      value: flag[2] === "true",
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

  parseChoice() {
    const opening = this.current();
    const openingText = opening.text.trim();
    const match = openingText.match(
      new RegExp(`^@choice\\s+(${ID_PATTERN})\\s+(${QUOTED_PATTERN})\\s+->\\s+(@exit|${ID_PATTERN})\\s*$`),
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
      target: match[3],
      icon: null,
      durationMinutes: 0,
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
        return choice;
      }

      const name = directiveName(text);
      if (!name) {
        failWG("Choice blocks may contain only choice directives", location);
      }

      if (["icon", "time", "when", "warning"].includes(name)) {
        if (singleFields.has(name)) failWG(`Duplicate @${name}`, location);
        singleFields.add(name);
      }

      if (name === "icon") {
        const value = directiveArgument(text, "icon", location);
        choice.icon = value.startsWith('"')
          ? parseQuotedString(value, location, "Choice icon")
          : value;
      } else if (name === "time") {
        choice.durationMinutes = parseDuration(
          directiveArgument(text, "time", location),
          location,
        );
      } else if (name === "when") {
        choice.when = parseExpression(
          directiveArgument(text, "when", location),
          location,
        );
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

export function parseWGSource({ file = "<wg>", source }) {
  if (typeof source !== "string") {
    failWG("WG source must be text", lineLocation(normalizeFile(file), 1));
  }
  const normalizedFile = normalizeFile(file);
  const rawLines = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const chunks = [];
  let currentChunk = null;

  rawLines.forEach((text, index) => {
    const lineNumber = index + 1;
    const trimmed = text.trim();
    if (trimmed.startsWith("::")) {
      const header = trimmed.match(
        new RegExp(`^::\\s+(${ID_PATTERN})(?:\\s+\\[([^\\]]*)\\])?\\s*$`),
      );
      if (!header) {
        failWG("Malformed scene header", lineLocation(normalizedFile, lineNumber));
      }
      const tags = header[2]
        ? header[2].trim().split(/\s+/).filter(Boolean)
        : [];
      for (const tag of tags) {
        if (!TAG_REGEX.test(tag)) {
          failWG(`Invalid scene tag '${tag}'`, lineLocation(normalizedFile, lineNumber));
        }
      }
      currentChunk = {
        id: header[1],
        tags: [...new Set(tags)],
        headerLine: lineNumber,
        lines: [],
      };
      chunks.push(currentChunk);
      return;
    }

    if (!currentChunk) {
      if (!trimmed || isComment(trimmed)) return;
      failWG("Content appears before the first scene header", lineLocation(normalizedFile, lineNumber));
    }
    currentChunk.lines.push({ text, line: lineNumber });
  });

  return chunks.map((chunk) => parseSceneChunk(normalizedFile, chunk));
}
