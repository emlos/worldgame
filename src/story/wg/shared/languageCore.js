function freezeList(values) {
  return Object.freeze([...values]);
}

export const WG_ID_PATTERN = "[a-z][a-z0-9_.-]*";
export const WG_SIMPLE_ID_PATTERN = "[a-z][a-z0-9_-]*";
export const WG_PASSAGE_ID_PATTERN = WG_SIMPLE_ID_PATTERN;
export const WG_TAG_PATTERN = WG_SIMPLE_ID_PATTERN;
export const WG_PATH_SEGMENT_PATTERN = "[A-Za-z_][A-Za-z0-9_]*";
export const WG_DOTTED_PATH_PATTERN =
  `${WG_PATH_SEGMENT_PATTERN}(?:\\.${WG_PATH_SEGMENT_PATTERN})+`;
export const WG_QUOTED_STRING_PATTERN = '"(?:\\\\.|[^"\\\\])*"';
export const WG_DIRECTIVE_NAME_PATTERN = "[a-z][a-z-]*";
export const WG_NUMBER_PATTERN = "\\d+(?:\\.\\d+)?";
export const WG_DURATION_UNITS = Object.freeze([
  { name: "days", suffix: "d", minutes: 1440 },
  { name: "hours", suffix: "h", minutes: 60 },
  { name: "minutes", suffix: "m", minutes: 1 },
  { name: "seconds", suffix: "s", minutes: 1 / 60 },
].map(Object.freeze));

const durationStart =
  `(?=${WG_NUMBER_PATTERN}[${WG_DURATION_UNITS.map(({ suffix }) => suffix).join("")}])`;

export const WG_DURATION_PATTERN = durationStart + WG_DURATION_UNITS
  .map(({ name, suffix }) => `(?:(?<${name}>${WG_NUMBER_PATTERN})${suffix})?`)
  .join("");
export const WG_DURATION_TOKEN_PATTERN = durationStart + WG_DURATION_UNITS
  .map(({ suffix }) => `(?:${WG_NUMBER_PATTERN}${suffix})?`)
  .join("");
export const WG_PERCENTAGE_PATTERN = `${WG_NUMBER_PATTERN}%`;
export const WG_PROBABILITY_DECIMAL_PATTERN = "(?:0(?:\\.\\d+)?|1(?:\\.0+)?)";

export const WG_EXPRESSION_BINARY_PRECEDENCE = Object.freeze({
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
export const WG_EXPRESSION_UNARY_OPERATORS = freezeList(["not", "-"]);
export const WG_EXPRESSION_WORD_OPERATORS = freezeList(["and", "or", "not", "in"]);
export const WG_EXPRESSION_DOUBLE_OPERATORS = freezeList(["==", "!=", "<=", ">="]);
export const WG_EXPRESSION_SINGLE_OPERATORS = freezeList(["<", ">", "+", "-", "*", "/", "%"]);
export const WG_EXPRESSION_LITERALS = freezeList(["true", "false", "null"]);
