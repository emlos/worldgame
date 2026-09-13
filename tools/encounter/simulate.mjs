import {
  runEncounterStateSpaceMatrix,
  runStatDifferenceMatrix,
} from "./simulationHarness.mjs";

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const runs = Number(argument("runs", "20"));
const requestedPolicy = argument("policy", null);
const scenario = argument("scenario", "baseline");
const matrix = scenario === "all"
  ? runEncounterStateSpaceMatrix({ seedCount: runs, policy: requestedPolicy })
  : runStatDifferenceMatrix({
    seedCount: runs,
    policy: requestedPolicy || "escape",
    scenario,
  });
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(matrix, null, 2));
} else {
  console.table(matrix.map(({ results, coverage, playerActionCounts, npcActionCounts, ...summary }) => ({
    ...summary,
    outcomes: JSON.stringify(summary.outcomeCounts),
    playerActions: JSON.stringify(playerActionCounts),
    npcActions: JSON.stringify(npcActionCounts),
    ranges: coverage.ranges.join(","),
    poses: coverage.playerPoses.join(","),
    holds: coverage.holdKinds.join(","),
    acute: coverage.acuteEffects.join(","),
  })));
}
