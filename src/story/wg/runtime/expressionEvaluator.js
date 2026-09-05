export class WGExpressionError extends TypeError {
  constructor(message) {
    super(message);
    this.name = "WGExpressionError";
  }
}

function fail(message) {
  throw new WGExpressionError(message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value, operator) {
  if (!Number.isFinite(value)) {
    fail(`Operator '${operator}' requires finite numbers`);
  }
  return value;
}

function comparablePair(left, right, operator) {
  const sameComparableType =
    (typeof left === "number" && typeof right === "number") ||
    (typeof left === "string" && typeof right === "string");
  if (!sameComparableType) {
    fail(`Operator '${operator}' requires two numbers or two strings`);
  }
  if (typeof left === "number") {
    finiteNumber(left, operator);
    finiteNumber(right, operator);
  }
  return [left, right];
}

export function resolveWGPath(context, path) {
  if (!isRecord(context)) fail("Expression context must be an object");
  if (!Array.isArray(path) || !path.length) {
    fail("Expression paths must be non-empty arrays");
  }

  let value = context;
  for (const segment of path) {
    if (typeof segment !== "string" || !segment) {
      fail("Expression path segments must be non-empty strings");
    }
    if (value == null || (typeof value !== "object" && typeof value !== "string")) {
      return undefined;
    }
    value = value[segment];
  }
  return value;
}

function evaluateBinary(expression, context) {
  const { operator } = expression;

  // These are deliberately short-circuited. An unreachable right-hand path
  // must not influence the result or cause an unnecessary runtime failure.
  if (operator === "and") {
    return Boolean(evaluateWGExpression(expression.left, context)) &&
      Boolean(evaluateWGExpression(expression.right, context));
  }
  if (operator === "or") {
    return Boolean(evaluateWGExpression(expression.left, context)) ||
      Boolean(evaluateWGExpression(expression.right, context));
  }

  const left = evaluateWGExpression(expression.left, context);
  const right = evaluateWGExpression(expression.right, context);

  if (operator === "==") return left === right;
  if (operator === "!=") return left !== right;

  if (operator === "in") {
    if (!Array.isArray(right)) fail("Operator 'in' requires a list on the right");
    return right.includes(left);
  }

  if (["<", "<=", ">", ">="].includes(operator)) {
    if (left == null || right == null) return false;
    comparablePair(left, right, operator);
    if (operator === "<") return left < right;
    if (operator === "<=") return left <= right;
    if (operator === ">") return left > right;
    return left >= right;
  }

  const leftNumber = finiteNumber(left, operator);
  const rightNumber = finiteNumber(right, operator);
  let result;
  if (operator === "+") result = leftNumber + rightNumber;
  else if (operator === "-") result = leftNumber - rightNumber;
  else if (operator === "*") result = leftNumber * rightNumber;
  else if (operator === "/") result = leftNumber / rightNumber;
  else if (operator === "%") result = leftNumber % rightNumber;
  else fail(`Unknown binary operator '${String(operator)}'`);

  return finiteNumber(result, operator);
}

export function evaluateWGExpression(expression, context) {
  if (!isRecord(expression)) fail("Expression nodes must be objects");

  if (expression.type === "literal") {
    const { value } = expression;
    if (
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "boolean" &&
      !Number.isFinite(value)
    ) {
      fail("Expression literals must be null, strings, booleans, or finite numbers");
    }
    return value;
  }

  if (expression.type === "path") {
    return resolveWGPath(context, expression.value);
  }

  if (expression.type === "list") {
    if (!Array.isArray(expression.values)) fail("Expression lists require values");
    return expression.values.map((value) => evaluateWGExpression(value, context));
  }

  if (expression.type === "unary") {
    if (!isRecord(expression.value)) fail("Unary expressions require a value");
    const value = evaluateWGExpression(expression.value, context);
    if (expression.operator === "not") return !Boolean(value);
    if (expression.operator === "-") return -finiteNumber(value, "-");
    fail(`Unknown unary operator '${String(expression.operator)}'`);
  }

  if (expression.type === "binary") {
    if (!isRecord(expression.left) || !isRecord(expression.right)) {
      fail("Binary expressions require left and right values");
    }
    return evaluateBinary(expression, context);
  }

  fail(`Unknown expression type '${String(expression.type)}'`);
}
