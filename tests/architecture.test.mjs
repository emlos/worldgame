import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SRC_ROOT = fileURLToPath(new URL("../src/", import.meta.url));

function listJavaScriptFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listJavaScriptFiles(absolutePath));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(absolutePath);
  }
  return files;
}

function staticRelativeImports(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const imports = [];
  const statements = source.matchAll(/^\s*(?:import|export)\b[^;]*;/gm);
  for (const match of statements) {
    const statement = match[0];
    const specifier = statement.match(/\bfrom\s+["']([^"']+)["']/)?.[1]
      ?? statement.match(/^\s*import\s+["']([^"']+)["']/)?.[1]
      ?? null;
    if (specifier?.startsWith(".")) imports.push(specifier);
  }
  return imports;
}

function resolveImport(fromFile, specifier, knownFiles) {
  const unresolved = path.resolve(path.dirname(fromFile), specifier);
  const candidates = path.extname(unresolved)
    ? [unresolved]
    : [`${unresolved}.js`, path.join(unresolved, "index.js")];
  return candidates.find((candidate) => knownFiles.has(candidate)) ?? null;
}

function findCycle(graph) {
  const status = new Map();
  const stack = [];

  function visit(node) {
    const state = status.get(node) ?? "unvisited";
    if (state === "visited") return null;
    if (state === "visiting") {
      const start = stack.indexOf(node);
      return [...stack.slice(start), node];
    }

    status.set(node, "visiting");
    stack.push(node);
    for (const dependency of graph.get(node) ?? []) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    stack.pop();
    status.set(node, "visited");
    return null;
  }

  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

test("the src static JavaScript dependency graph is cycle-free", () => {
  const files = listJavaScriptFiles(SRC_ROOT);
  const knownFiles = new Set(files);
  const graph = new Map(files.map((file) => [
    file,
    staticRelativeImports(file)
      .map((specifier) => resolveImport(file, specifier, knownFiles))
      .filter(Boolean),
  ]));

  const cycle = findCycle(graph);
  assert.equal(
    cycle,
    null,
    cycle
      ? `static dependency cycle:\n${cycle
        .map((file) => `  ${path.relative(SRC_ROOT, file)}`)
        .join("\n  -> ")}`
      : undefined,
  );
});
