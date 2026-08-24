import { failWG } from "./diagnostic.js";

const BINARY_PRECEDENCE = Object.freeze({
  or: 1,
  and: 2,
  "==": 3,
  "!=": 3,
  in: 4,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
});

function tokenize(expression, location) {
  const tokens = [];
  let index = 0;

  function column() {
    return (location.column || 1) + index;
  }

  function fail(message, tokenColumn = column()) {
    failWG(message, { ...location, column: tokenColumn });
  }

  while (index < expression.length) {
    const character = expression[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    const tokenColumn = column();
    const remaining = expression.slice(index);

    if (character === '"') {
      let end = index + 1;
      let escaped = false;
      for (; end < expression.length; end += 1) {
        const current = expression[end];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (current === "\\") {
          escaped = true;
          continue;
        }
        if (current === '"') break;
      }
      if (end >= expression.length) fail("Unterminated string literal", tokenColumn);

      const raw = expression.slice(index, end + 1);
      let value;
      try {
        value = JSON.parse(raw);
      } catch {
        fail("Invalid string escape", tokenColumn);
      }
      tokens.push({ type: "literal", value, column: tokenColumn });
      index = end + 1;
      continue;
    }

    const numberMatch = remaining.match(/^\d+(?:\.\d+)?/);
    if (numberMatch) {
      tokens.push({
        type: "literal",
        value: Number(numberMatch[0]),
        column: tokenColumn,
      });
      index += numberMatch[0].length;
      continue;
    }

    const identifierMatch = remaining.match(
      /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/,
    );
    if (identifierMatch) {
      const value = identifierMatch[0];
      if (value === "true" || value === "false") {
        tokens.push({
          type: "literal",
          value: value === "true",
          column: tokenColumn,
        });
      } else if (value === "null") {
        tokens.push({ type: "literal", value: null, column: tokenColumn });
      } else if (["and", "or", "not", "in"].includes(value)) {
        tokens.push({ type: "operator", value, column: tokenColumn });
      } else {
        tokens.push({
          type: "path",
          value: value.split("."),
          column: tokenColumn,
        });
      }
      index += value.length;
      continue;
    }

    const doubleOperator = expression.slice(index, index + 2);
    if (["==", "!=", "<=", ">="].includes(doubleOperator)) {
      tokens.push({ type: "operator", value: doubleOperator, column: tokenColumn });
      index += 2;
      continue;
    }

    if (["<", ">", "+", "-", "*", "/", "%"].includes(character)) {
      tokens.push({ type: "operator", value: character, column: tokenColumn });
      index += 1;
      continue;
    }

    const punctuation = {
      "(": "leftParen",
      ")": "rightParen",
      "[": "leftBracket",
      "]": "rightBracket",
      ",": "comma",
    }[character];
    if (punctuation) {
      tokens.push({ type: punctuation, value: character, column: tokenColumn });
      index += 1;
      continue;
    }

    fail(`Unexpected character '${character}'`, tokenColumn);
  }

  tokens.push({
    type: "eof",
    value: null,
    column: (location.column || 1) + expression.length,
  });
  return tokens;
}

export function parseExpression(expression, location = {}) {
  if (typeof expression !== "string" || !expression.trim()) {
    failWG("Expected an expression", location);
  }

  const tokens = tokenize(expression, location);
  let index = 0;

  function current() {
    return tokens[index];
  }

  function consume(type, value = undefined) {
    const token = current();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      const expected = value === undefined ? type : `'${value}'`;
      failWG(`Expected ${expected}`, { ...location, column: token.column });
    }
    index += 1;
    return token;
  }

  function parsePrimary() {
    const token = current();
    if (token.type === "literal") {
      index += 1;
      return { type: "literal", value: token.value };
    }
    if (token.type === "path") {
      index += 1;
      return { type: "path", value: token.value };
    }
    if (token.type === "leftParen") {
      index += 1;
      const value = parseBinary(1);
      consume("rightParen");
      return value;
    }
    if (token.type === "leftBracket") {
      index += 1;
      const values = [];
      if (current().type !== "rightBracket") {
        while (true) {
          values.push(parseBinary(1));
          if (current().type !== "comma") break;
          index += 1;
          if (current().type === "rightBracket") {
            failWG("List literals cannot end with a comma", {
              ...location,
              column: current().column,
            });
          }
        }
      }
      consume("rightBracket");
      return { type: "list", values };
    }

    failWG("Expected a value", { ...location, column: token.column });
  }

  function parseUnary() {
    const token = current();
    if (
      token.type === "operator" &&
      (token.value === "not" || token.value === "-")
    ) {
      index += 1;
      return { type: "unary", operator: token.value, value: parseUnary() };
    }
    return parsePrimary();
  }

  function parseBinary(minimumPrecedence) {
    let left = parseUnary();
    while (true) {
      const token = current();
      const precedence =
        token.type === "operator" ? BINARY_PRECEDENCE[token.value] : undefined;
      if (precedence === undefined || precedence < minimumPrecedence) break;

      index += 1;
      const right = parseBinary(precedence + 1);
      left = {
        type: "binary",
        operator: token.value,
        left,
        right,
      };
    }
    return left;
  }

  const result = parseBinary(1);
  if (current().type !== "eof") {
    failWG(`Unexpected token '${current().value}'`, {
      ...location,
      column: current().column,
    });
  }
  return result;
}
