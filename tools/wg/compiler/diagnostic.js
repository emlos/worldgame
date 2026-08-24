export class WGCompileError extends SyntaxError {
  constructor(message, { file = "<wg>", line = 1, column = 1 } = {}) {
    super(`${file}:${line}:${column}: ${message}`);
    this.name = "WGCompileError";
    this.file = file;
    this.line = line;
    this.column = column;
    this.detail = message;
  }
}

export function failWG(message, location = {}) {
  throw new WGCompileError(message, location);
}

export function sourceLocation(file, line, column = 1) {
  return { file, line, column };
}
