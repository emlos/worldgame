import { promises as fs } from "node:fs";
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
  const changedArtifacts = artifacts.filter(
    ({ content }, index) => existing[index] !== content,
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
  for (const { file, content } of changedArtifacts) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, "utf8");
  }
  return {
    changed: true,
    checked: false,
    outputFile: OUTPUT_FILE,
    changedFiles: changedArtifacts.map(({ file }) => file),
  };
}

async function main() {
  const argumentsList = process.argv.slice(2);
  const unknown = argumentsList.filter((argument) => argument !== "--check");
  if (unknown.length) {
    throw new Error(`Unknown compiler option: ${unknown.join(", ")}`);
  }

  const result = await compileProject({ check: argumentsList.includes("--check") });
  if (result.checked) console.log("WG generated artifacts are current.");
  else if (result.changed) {
    const files = result.changedFiles
      .map((file) => path.relative(PROJECT_ROOT, file).split(path.sep).join("/"))
      .join(", ");
    console.log(`Generated WG artifacts: ${files}`);
  }
  else console.log("WG generated artifacts are unchanged.");
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    if (error instanceof WGCompileError) console.error(error.message);
    else console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
