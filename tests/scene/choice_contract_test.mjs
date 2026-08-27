import { Game } from "../../src/classes/game/game.js";
import {
  ChoiceContractError,
  createChoice,
  validateChoice,
} from "../../src/classes/game/scene/choiceContract.js";
import { buildScene } from "../../src/classes/game/scene/sceneEngine.js";

const failures = [];

function check(label, condition) {
  if (condition) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    failures.push(label);
  }
}

function rejects(label, callback) {
  let error = null;
  try {
    callback();
  } catch (caught) {
    error = caught;
  }
  check(label, error instanceof ChoiceContractError);
}

const minimal = createChoice({
  id: "wait",
  label: "Wait",
  action: { type: "wait" },
});
check(
  "minimal choices receive every optional contract field",
  minimal.icon === null &&
    minimal.durationMinutes === 0 &&
    minimal.energyFree === false &&
    Array.isArray(minimal.costs) &&
    minimal.costs.length === 0 &&
    Array.isArray(minimal.effectsPreview) &&
    minimal.effectsPreview.length === 0 &&
    Array.isArray(minimal.skillChanges) &&
    minimal.skillChanges.length === 0 &&
    minimal.skillCheck === null &&
    minimal.enabled === true &&
    minimal.disabledReason === null &&
    minimal.warning === null,
);

const detailed = createChoice({
  id: "service",
  icon: "☀",
  label: "Use service",
  durationMinutes: 2.5,
  energyFree: true,
  costs: [{ type: "money", amount: 25, label: "£25", currency: "GBP" }],
  effectsPreview: [{ type: "stress", amount: -10, label: "−Stress" }],
  enabled: false,
  disabledReason: "Closed",
  warning: "You may be late.",
  analyticsTag: "service-choice",
  action: { type: "service", serviceId: "spa" },
});
check(
  "fractional energy-free choice durations remain valid",
  detailed.durationMinutes === 2.5 && detailed.energyFree === true,
);
check(
  "choice metadata preserves engine-specific fields",
  detailed.costs[0].currency === "GBP" &&
    detailed.action.serviceId === "spa" &&
    detailed.analyticsTag === "service-choice",
);
check(
  "disabled choices may carry reasons and warnings",
  detailed.disabledReason === "Closed" && detailed.warning === "You may be late.",
);

const checked = createChoice({
  id: "open-jar",
  label: "Open the jar",
  skillCheck: {
    skillId: "strength",
    skillLabel: "Strength",
    difficultyId: "tricky",
    difficultyLabel: "Tricky",
  },
  action: {
    type: "skill-check",
    check: { skillId: "strength", difficultyId: "tricky" },
    outcomes: {
      success: { target: "opened", durationMinutes: 1, energyFree: true, effects: [] },
      failure: { target: "stuck", durationMinutes: 2, energyFree: false, effects: [] },
    },
  },
});
check(
  "skill-check choices preserve only public check labels",
  checked.skillCheck.skillLabel === "Strength" &&
    checked.skillCheck.difficultyLabel === "Tricky" &&
    checked.durationMinutes === 0,
);

rejects("skill previews cannot expose exact amounts", () =>
  createChoice({
    id: "train",
    label: "Train",
    skillChanges: [
      { skillId: "strength", label: "+Strength", direction: "increase", amount: 0.1 },
    ],
    action: { type: "train" },
  }),
);
rejects("skill checks require both outcome payloads", () =>
  createChoice({
    id: "open",
    label: "Open",
    skillCheck: {
      skillId: "strength",
      skillLabel: "Strength",
      difficultyId: "tricky",
      difficultyLabel: "Tricky",
    },
    action: {
      type: "skill-check",
      check: { skillId: "strength", difficultyId: "tricky" },
      outcomes: {
        success: {
          target: "opened",
          durationMinutes: 1,
          energyFree: false,
          effects: [],
        },
      },
    },
  }),
);

rejects("choice objects are required", () => createChoice(null));
rejects("choice ids are required", () =>
  createChoice({ id: "", label: "Wait", action: { type: "wait" } }),
);
rejects("choice labels are required", () =>
  createChoice({ id: "wait", label: "", action: { type: "wait" } }),
);
rejects("choice actions are required", () =>
  createChoice({ id: "wait", label: "Wait" }),
);
rejects("choice action types are required", () =>
  createChoice({ id: "wait", label: "Wait", action: {} }),
);
rejects("negative choice durations are rejected", () =>
  createChoice({
    id: "wait",
    label: "Wait",
    durationMinutes: -1,
    action: { type: "wait" },
  }),
);
rejects("non-finite choice durations are rejected", () =>
  createChoice({
    id: "wait",
    label: "Wait",
    durationMinutes: Number.NaN,
    action: { type: "wait" },
  }),
);
rejects("energy-free choice metadata must be boolean", () =>
  createChoice({
    id: "wait",
    label: "Wait",
    energyFree: "yes",
    action: { type: "wait" },
  }),
);
rejects("choice icons have a renderable type", () =>
  createChoice({ id: "wait", icon: 3, label: "Wait", action: { type: "wait" } }),
);
rejects("choice enabled state must be boolean", () =>
  createChoice({
    id: "wait",
    label: "Wait",
    enabled: "yes",
    action: { type: "wait" },
  }),
);
rejects("choice display explanations must be text", () =>
  createChoice({
    id: "wait",
    label: "Wait",
    disabledReason: { text: "No" },
    action: { type: "wait" },
  }),
);
rejects("choice costs must be arrays", () =>
  createChoice({
    id: "buy",
    label: "Buy",
    costs: { type: "money", amount: 5 },
    action: { type: "buy" },
  }),
);
rejects("choice metadata entries require types", () =>
  createChoice({
    id: "buy",
    label: "Buy",
    costs: [{ amount: 5 }],
    action: { type: "buy" },
  }),
);
rejects("choice metadata amounts must be finite", () =>
  createChoice({
    id: "rest",
    label: "Rest",
    effectsPreview: [{ type: "energy", amount: Number.POSITIVE_INFINITY }],
    action: { type: "rest" },
  }),
);
rejects("choice costs cannot have negative amounts", () =>
  createChoice({
    id: "buy",
    label: "Buy",
    costs: [{ type: "money", amount: -5 }],
    action: { type: "buy" },
  }),
);
rejects("raw unnormalized choices fail validation", () =>
  validateChoice({ id: "wait", label: "Wait", action: { type: "wait" } }),
);

const game = new Game({
  seed: 117,
  startDate: new Date("2026-08-24T08:00:00.000Z"),
  playerOptions: { startPlaceId: null },
});
const choices = buildScene(game).sections.flatMap((section) => section.choices);
check(
  "every generated choice independently satisfies the Choice contract",
  choices.every((choice) => validateChoice(choice) === choice),
);

if (failures.length) {
  console.error("\nChoice contract failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All choice contract tests passed.");
}
