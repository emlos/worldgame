import { promises as fs, watch as watchFileSystem } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WGCompileError } from "./compiler/diagnostic.js";
import { emitStoryModule } from "./compiler/emitter.js";
import { compileStorySources } from "./compiler/storyCompiler.js";
import {
  buildWGLanguageConfiguration,
  buildWGTextMateGrammar,
  updateWGDirectiveIndex,
} from "./supportGenerator.js";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");
const STORY_ROOT = path.join(PROJECT_ROOT, "story");
const OUTPUT_FILE = path.join(PROJECT_ROOT, "src/story/wg/generated/scenes.js");
const TEXTMATE_FILE = path.join(
  PROJECT_ROOT,
  "tools/vscode-wg/syntaxes/wg.tmLanguage.json",
);
const LANGUAGE_CONFIGURATION_FILE = path.join(
  PROJECT_ROOT,
  "tools/vscode-wg/language-configuration.json",
);
const LANGUAGE_DOCUMENTATION_FILE = path.join(PROJECT_ROOT, "docs/wg-language.md");
const WATCH_DEBOUNCE_MS = 75;

function compareNames(left, right) {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}

async function discoverWGFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort(compareNames)) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await discoverWGFiles(entryPath)));
    else if (entry.isFile() && entry.name.endsWith(".wg")) files.push(entryPath);
  }
  return files;
}

async function readSources() {
  const files = await discoverWGFiles(STORY_ROOT);
  return Promise.all(
    files.map(async (file) => ({
      file: path.relative(PROJECT_ROOT, file).split(path.sep).join("/"),
      source: await fs.readFile(file, "utf8"),
    })),
  );
}

async function readExistingOutput(file = OUTPUT_FILE) {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function compileProject({ check = false } = {}) {
  const documentation = await fs.readFile(LANGUAGE_DOCUMENTATION_FILE, "utf8");
  const artifacts = [
    {
      file: OUTPUT_FILE,
      content: emitStoryModule(compileStorySources(await readSources())),
    },
    { file: TEXTMATE_FILE, content: buildWGTextMateGrammar() },
    {
      file: LANGUAGE_CONFIGURATION_FILE,
      content: buildWGLanguageConfiguration(),
    },
    {
      file: LANGUAGE_DOCUMENTATION_FILE,
      content: updateWGDirectiveIndex(documentation),
    },
  ];
  const existing = await Promise.all(
    artifacts.map(({ file }) => readExistingOutput(file)),
  );
  const normalizeNewlines = (value) => value?.replace(/\r\n/g, "\n") ?? null;
  const changedArtifacts = artifacts
    .map((artifact, index) => ({ ...artifact, existing: existing[index] }))
    .filter(({ content, existing: previous }) =>
      normalizeNewlines(previous) !== normalizeNewlines(content),
    );

  if (check) {
    if (changedArtifacts.length) {
      const stale = changedArtifacts
        .map(({ file }) => path.relative(PROJECT_ROOT, file).split(path.sep).join("/"))
        .join(", ");
      throw new Error(
        `Generated WG artifacts are missing or stale (${stale}). ` +
          "Run: node tools/wg/compile.mjs",
      );
    }
    return { changed: false, checked: true, outputFile: OUTPUT_FILE };
  }

  if (!changedArtifacts.length) {
    return { changed: false, checked: false, outputFile: OUTPUT_FILE };
  }
  for (const { file, content, existing: previous } of changedArtifacts) {
    const newline = previous?.includes("\r\n") ? "\r\n" : "\n";
    const output = content.replace(/\r?\n/g, newline);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, output, "utf8");
  }
  return {
    changed: true,
    checked: false,
    outputFile: OUTPUT_FILE,
    changedFiles: changedArtifacts.map(({ file }) => file),
  };
}

function formatCompileResult(result) {
  if (result.checked) return "WG generated artifacts are current.";
  if (!result.changed) return "WG generated artifacts are unchanged.";

  const files = result.changedFiles
    .map((file) => path.relative(PROJECT_ROOT, file).split(path.sep).join("/"))
    .join(", ");
  return `Generated WG artifacts: ${files}`;
}

function formatCompileError(error) {
  return error instanceof WGCompileError
    ? error.message
    : error?.stack || String(error);
}

function isRelevantWatchPath(filename) {
  if (filename == null) return true;
  const watchedPath = String(filename);
  const extension = path.extname(watchedPath).toLowerCase();
  return extension === ".wg" || extension === "";
}

export async function watchProject({
  watch = watchFileSystem,
  compile = compileProject,
  storyRoot = STORY_ROOT,
  debounceMs = WATCH_DEBOUNCE_MS,
  log = console.log,
  logError = console.error,
} = {}) {
  let debounceTimer = null;
  let compiling = false;
  let rerunRequested = false;
  let closed = false;

  const queueCompile = () => {
    if (closed) return;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void runCompile();
    }, debounceMs);
  };

  const runCompile = async () => {
    if (closed) return;
    if (compiling) {
      rerunRequested = true;
      return;
    }

    compiling = true;
    try {
      log(formatCompileResult(await compile()));
    } catch (error) {
      logError(formatCompileError(error));
    } finally {
      compiling = false;
      if (rerunRequested) {
        rerunRequested = false;
        queueCompile();
      }
    }
  };

  const watcher = watch(
    storyRoot,
    { recursive: true },
    (_eventType, filename) => {
      if (isRelevantWatchPath(filename)) queueCompile();
    },
  );
  watcher.on("error", (error) => {
    logError(`WG watcher error: ${formatCompileError(error)}`);
  });

  await runCompile();
  log("Watching story/**/*.wg for changes. Press Ctrl+C to stop.");

  return {
    close() {
      closed = true;
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = null;
      watcher.close();
    },
  };
}

export function parseCompilerOptions(argumentsList) {
  const unknown = argumentsList.filter(
    (argument) => argument !== "--check" && argument !== "--watch",
  );
  if (unknown.length) {
    throw new Error(`Unknown compiler option: ${unknown.join(", ")}`);
  }

  const check = argumentsList.includes("--check");
  const watch = argumentsList.includes("--watch");
  if (check && watch) {
    throw new Error("Compiler options --check and --watch cannot be used together");
  }

  return { check, watch };
}

async function main() {
  const options = parseCompilerOptions(process.argv.slice(2));
  if (options.watch) {
    await watchProject();
    return;
  }

  console.log(formatCompileResult(await compileProject({ check: options.check })));
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    if (error instanceof WGCompileError) console.error(error.message);
    else console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
