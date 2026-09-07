"use strict";

const WG_GLOB = "**/*.wg";
const WG_EXCLUDE_GLOB = "**/{.git,node_modules}/**";
const SCENE_DECLARATION_RE = /^\s*::\s+([a-z][a-z0-9_.-]*)(?=\s|$)/;
const GLOBAL_SCENE_ID_RE = /^[a-z][a-z0-9_.-]*$/;

const TOP_LEVEL_OPENERS = new Map([
  ["@journal", "journal"],
  ["@chat", "chat"],
  ["@location", "location"],
  ["@reminder", "reminder"],
]);

const TOP_LEVEL_CLOSERS = new Map([
  ["@endjournal", "journal"],
  ["@endchat", "chat"],
  ["@endlocation", "location"],
  ["@endreminder", "reminder"],
]);

const BLOCK_OPENERS = new Map([
  ["@choice", "choice"],
  ["@choicegroup", "choicegroup"],
  ["@if", "if"],
  ["@random", "random"],
  ["@response", "response"],
  ["@message", "message"],
  ["@onenter", "onenter"],
]);

const BLOCK_CLOSERS = new Map([
  ["@endchoice", "choice"],
  ["@endchoicegroup", "choicegroup"],
  ["@endif", "if"],
  ["@endrandom", "random"],
  ["@endresponse", "response"],
  ["@endmessage", "message"],
  ["@endonenter", "onenter"],
]);

function directiveName(trimmedLine) {
  const match = trimmedLine.match(/^(@[a-z][a-z-]*)\b/);
  return match ? match[1] : null;
}

function stackIndent(stack) {
  return stack.reduce((depth, entry) => depth + (entry.indents ? 1 : 0), 0);
}

function popThrough(stack, type) {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].type === type) {
      stack.splice(i);
      return true;
    }
  }
  return false;
}

function hasOpen(stack, type) {
  return stack.some((entry) => entry.type === type);
}

function formatWgText(text, eol = "\n", indentUnit = "  ") {
  const sourceLines = text.split(/\r?\n/);
  const output = [];
  const stack = [];
  let baseDepth = 0;
  let previousWasBlank = false;

  for (const sourceLine of sourceLines) {
    const trimmed = sourceLine.trim();

    if (trimmed === "") {
      if (!previousWasBlank && output.length > 0) output.push("");
      previousWasBlank = true;
      continue;
    }

    previousWasBlank = false;

    // Scene declarations are implicit top-level boundaries: a new `::` closes
    // the previous scene for formatting purposes.
    if (/^::(?:\s|$)/.test(trimmed)) {
      stack.length = 0;
      output.push(trimmed);
      baseDepth = 1;
      continue;
    }

    const directive = directiveName(trimmed);

    if (directive && TOP_LEVEL_CLOSERS.has(directive)) {
      stack.length = 0;
      baseDepth = 0;
      output.push(trimmed);
      continue;
    }

    if (directive && TOP_LEVEL_OPENERS.has(directive)) {
      stack.length = 0;
      baseDepth = 1;
      output.push(trimmed);
      continue;
    }

    let lineDepth = baseDepth + stackIndent(stack);

    if (directive === "@elseif" || directive === "@else") {
      if (hasOpen(stack, "if")) lineDepth = Math.max(baseDepth, lineDepth - 1);
    } else if (directive === "@or") {
      if (hasOpen(stack, "random")) lineDepth = Math.max(baseDepth, lineDepth - 1);
    } else if (directive === "@success" || directive === "@failure") {
      // Passive checks use @success/@failure as sibling branches without
      // @endsuccess/@endfailure. Close the prior branch if it is still open.
      const top = stack[stack.length - 1];
      if (top && (top.type === "success" || top.type === "failure")) {
        stack.pop();
      }
      lineDepth = baseDepth + stackIndent(stack);
    } else if (directive === "@endsuccess" || directive === "@endfailure") {
      popThrough(stack, directive.slice(4));
      lineDepth = baseDepth + stackIndent(stack);
    } else if (directive === "@endcheck") {
      const top = stack[stack.length - 1];
      if (top && (top.type === "success" || top.type === "failure")) stack.pop();
      popThrough(stack, "check");
      lineDepth = baseDepth + stackIndent(stack);
    } else if (directive && BLOCK_CLOSERS.has(directive)) {
      popThrough(stack, BLOCK_CLOSERS.get(directive));
      lineDepth = baseDepth + stackIndent(stack);
    }

    output.push(indentUnit.repeat(Math.max(0, lineDepth)) + trimmed);

    if (directive === "@check") {
      // @check itself does not increase indentation. Its @success/@failure
      // branches do. This works for both passive checks and checked choices.
      stack.push({ type: "check", indents: false });
    } else if (directive === "@success" || directive === "@failure") {
      stack.push({ type: directive.slice(1), indents: true });
    } else if (directive && BLOCK_OPENERS.has(directive)) {
      stack.push({ type: BLOCK_OPENERS.get(directive), indents: true });
    }
  }

  // Do not manufacture trailing blank lines. Preserve the conventional single
  // final newline when the source had one.
  while (output.length > 0 && output[output.length - 1] === "") output.pop();
  const hadFinalNewline = /(?:\r?\n)$/.test(text);
  return output.join(eol) + (hadFinalNewline ? eol : "");
}


function isSceneTargetDirective(prefix) {
  const trimmed = prefix.trimStart();
  if (trimmed.startsWith("@#") || trimmed.startsWith("\\")) return false;
  return /^(?:::|@(?:choice|next|success|failure)\b)/.test(trimmed);
}

function getArrowBefore(lineText, character) {
  const beforeCursor = lineText.slice(0, character);
  const arrow = beforeCursor.lastIndexOf("->");
  if (arrow < 0 || !isSceneTargetDirective(lineText.slice(0, arrow))) return -1;
  return arrow;
}

function getGlobalSceneTargetAt(lineText, character) {
  const arrow = getArrowBefore(lineText, character + 1);
  if (arrow < 0) return null;

  const afterArrow = lineText.slice(arrow + 2);
  const match = afterArrow.match(/^\s*([a-z][a-z0-9_.-]*)/);
  if (!match) return null;

  const id = match[1];
  if (!GLOBAL_SCENE_ID_RE.test(id)) return null;

  const start = arrow + 2 + match[0].indexOf(id);
  const end = start + id.length;
  if (character < start || character > end) return null;

  return { id, start, end };
}

function getCompletionTargetRange(lineText, character) {
  const arrow = getArrowBefore(lineText, character);
  if (arrow < 0) return null;

  const fragment = lineText.slice(arrow + 2, character);
  if (!/^\s*(?:[a-z][a-z0-9_.-]*)?$/.test(fragment)) return null;

  const idMatch = fragment.match(/([a-z][a-z0-9_.-]*)$/);
  return {
    start: idMatch ? character - idMatch[1].length : character,
    end: character,
  };
}

function sceneDeclarationsFromDocument(document, vscode) {
  const declarations = [];

  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
    const line = document.lineAt(lineNumber);
    const match = line.text.match(SCENE_DECLARATION_RE);
    if (!match) continue;

    const id = match[1];
    const start = line.text.indexOf(id);
    const range = new vscode.Range(
      new vscode.Position(lineNumber, start),
      new vscode.Position(lineNumber, start + id.length),
    );

    declarations.push({
      id,
      location: new vscode.Location(document.uri, range),
    });
  }

  return declarations;
}

class SceneIndex {
  constructor(vscode) {
    this.vscode = vscode;
    this.byId = new Map();
    this.byUri = new Map();
  }

  removeUri(uri) {
    const key = uri.toString();
    const oldEntries = this.byUri.get(key);
    if (!oldEntries) return;

    for (const entry of oldEntries) {
      const locations = this.byId.get(entry.id);
      if (!locations) continue;

      const remaining = locations.filter(
        (location) => location.uri.toString() !== key,
      );

      if (remaining.length > 0) this.byId.set(entry.id, remaining);
      else this.byId.delete(entry.id);
    }

    this.byUri.delete(key);
  }

  indexDocument(document) {
    this.removeUri(document.uri);

    const entries = sceneDeclarationsFromDocument(document, this.vscode);
    this.byUri.set(document.uri.toString(), entries);

    for (const entry of entries) {
      const locations = this.byId.get(entry.id) || [];
      locations.push(entry.location);
      this.byId.set(entry.id, locations);
    }
  }

  async indexUri(uri) {
    try {
      const document = await this.vscode.workspace.openTextDocument(uri);
      this.indexDocument(document);
    } catch {
      this.removeUri(uri);
    }
  }

  async rebuild() {
    this.byId.clear();
    this.byUri.clear();

    const uris = await this.vscode.workspace.findFiles(
      WG_GLOB,
      WG_EXCLUDE_GLOB,
    );
    await Promise.all(uris.map((uri) => this.indexUri(uri)));
  }

  getLocations(id) {
    return this.byId.get(id) || [];
  }

  getSceneIds() {
    return [...this.byId.keys()].sort((a, b) => a.localeCompare(b));
  }
}

function activate(context) {
  const vscode = require("vscode");
  const index = new SceneIndex(vscode);
  const ready = index.rebuild().then(() => {
    for (const document of vscode.workspace.textDocuments) {
      if (document.languageId === "wg") index.indexDocument(document);
    }
  });

  const selector = { language: "wg" };

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(selector, {
      provideDocumentFormattingEdits(document) {
        const eol = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
        const formatted = formatWgText(document.getText(), eol);
        if (formatted === document.getText()) return [];

        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length),
        );
        return [vscode.TextEdit.replace(fullRange, formatted)];
      },
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, {
      async provideDefinition(document, position) {
        await ready;

        const target = getGlobalSceneTargetAt(
          document.lineAt(position.line).text,
          position.character,
        );
        if (!target) return undefined;

        const locations = index.getLocations(target.id);
        if (locations.length === 0) return undefined;
        return locations.length === 1 ? locations[0] : locations;
      },
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      selector,
      {
        async provideCompletionItems(document, position) {
          await ready;

          const targetRange = getCompletionTargetRange(
            document.lineAt(position.line).text,
            position.character,
          );
          if (!targetRange) return undefined;

          return index.getSceneIds().map((id) => {
            const item = new vscode.CompletionItem(
              id,
              vscode.CompletionItemKind.Reference,
            );
            const location = index.getLocations(id)[0];
            const relativePath = location
              ? vscode.workspace.asRelativePath(location.uri, false)
              : "";

            item.detail = relativePath
              ? `WG scene — ${relativePath}:${location.range.start.line + 1}`
              : "WG scene";
            item.range = new vscode.Range(
              new vscode.Position(position.line, targetRange.start),
              new vscode.Position(position.line, targetRange.end),
            );
            item.sortText = id;
            return item;
          });
        },
      },
      ">",
      ".",
    ),
  );

  const watcher = vscode.workspace.createFileSystemWatcher(WG_GLOB);
  watcher.onDidCreate((uri) => index.indexUri(uri));
  watcher.onDidChange((uri) => index.indexUri(uri));
  watcher.onDidDelete((uri) => index.removeUri(uri));
  context.subscriptions.push(watcher);

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === "wg") index.indexDocument(event.document);
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (document.languageId === "wg") index.indexDocument(document);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (document.languageId !== "wg") return;
      if (document.uri.scheme === "untitled") index.removeUri(document.uri);
      else index.indexUri(document.uri);
    }),
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
  _test: {
    getGlobalSceneTargetAt,
    getCompletionTargetRange,
    isSceneTargetDirective,
    formatWgText,
  },
};
