import { runStatDifferenceMatrix } from "./simulationHarness.mjs";

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const runs = Number(argument("runs", "20"));
const policy = argument("policy", "escape");
const matrix = runStatDifferenceMatrix({ seedCount: runs, policy });
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(matrix, null, 2));
} else {
  console.table(matrix.map(({ results, actionCounts, ...summary }) => ({
    ...summary,
    outcomes: JSON.stringify(summary.outcomeCounts),
  })));
}
