import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WGCompileError } from "./compiler/diagnostic.js";
import { emitStoryModule } from "./compiler/emitter.js";
import { compileStorySources } from "./compiler/storyCompiler.js";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");
const STORY_ROOT = path.join(PROJECT_ROOT, "story");
const OUTPUT_FILE = path.join(PROJECT_ROOT, "src/generated/wg/scenes.js");

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

async function readExistingOutput() {
  try {
    return await fs.readFile(OUTPUT_FILE, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function compileProject({ check = false } = {}) {
  const output = emitStoryModule(compileStorySources(await readSources()));
  const existing = await readExistingOutput();

  if (check) {
    if (existing !== output) {
      throw new Error(
        "Generated WG output is missing or stale. Run: node tools/wg/compile.mjs",
      );
    }
    return { changed: false, checked: true, outputFile: OUTPUT_FILE };
  }

  if (existing === output) {
    return { changed: false, checked: false, outputFile: OUTPUT_FILE };
  }
  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, output, "utf8");
  return { changed: true, checked: false, outputFile: OUTPUT_FILE };
}

async function main() {
  const argumentsList = process.argv.slice(2);
  const unknown = argumentsList.filter((argument) => argument !== "--check");
  if (unknown.length) {
    throw new Error(`Unknown compiler option: ${unknown.join(", ")}`);
  }

  const result = await compileProject({ check: argumentsList.includes("--check") });
  const relativeOutput = path.relative(PROJECT_ROOT, result.outputFile).split(path.sep).join("/");
  if (result.checked) console.log(`WG output is current: ${relativeOutput}`);
  else if (result.changed) console.log(`Generated ${relativeOutput}`);
  else console.log(`WG output unchanged: ${relativeOutput}`);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    if (error instanceof WGCompileError) console.error(error.message);
    else console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
