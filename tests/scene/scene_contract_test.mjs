import { Game } from "../../src/classes/game/game.js";
import { createChoice } from "../../src/classes/game/scene/choiceContract.js";
import {
  SceneContractError,
  createScene,
  validateScene,
} from "../../src/classes/game/scene/sceneContract.js";
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
  check(label, error instanceof TypeError);
}

const waitChoice = createChoice({
  id: "wait",
  label: "Wait",
  action: { type: "wait" },
});
const validScene = {
  id: "place:home:2026-08-24T08:00:00.000Z",
  kind: "place",
  heading: "Home",
  status: {
    now: "2026-08-24T08:00:00.000Z",
    weather: "sunny",
    temperatureC: 21,
  },
  map: null,
  alerts: [],
  paragraphs: ["You are home."],
  sections: [
    { id: "actions", heading: "Actions", choices: [waitChoice] },
  ],
};

check("a complete scene passes validation", validateScene(validScene) === validScene);
check(
  "createScene supplies the optional map default",
  createScene({ ...validScene, map: undefined }).map === null,
);

rejects("scene objects are required", () => validateScene(null));
rejects("scene ids are required", () => validateScene({ ...validScene, id: "" }));
rejects("scene kinds are constrained", () =>
  validateScene({ ...validScene, kind: "unknown" }),
);
rejects("scene headings are required", () =>
  validateScene({ ...validScene, heading: null }),
);
rejects("scene status objects are required", () =>
  validateScene({ ...validScene, status: null }),
);
rejects("scene timestamps must be valid", () =>
  validateScene({
    ...validScene,
    status: { ...validScene.status, now: "not-a-date" },
  }),
);
rejects("scene weather is required", () =>
  validateScene({
    ...validScene,
    status: { ...validScene.status, weather: "" },
  }),
);
rejects("scene temperatures must be finite", () =>
  validateScene({
    ...validScene,
    status: { ...validScene.status, temperatureC: Number.NaN },
  }),
);
rejects("scene maps require node arrays", () =>
  validateScene({
    ...validScene,
    map: { scope: "local", centerLocationId: "home", edges: [] },
  }),
);
rejects("scene maps require edge arrays", () =>
  validateScene({
    ...validScene,
    map: { scope: "local", centerLocationId: "home", nodes: [] },
  }),
);
rejects("scene paragraphs must be arrays", () =>
  validateScene({ ...validScene, paragraphs: "You are home." }),
);
rejects("scene paragraphs must contain strings", () =>
  validateScene({ ...validScene, paragraphs: [null] }),
);
rejects("scene sections must be arrays", () =>
  validateScene({ ...validScene, sections: null }),
);
rejects("scene section ids are required", () =>
  validateScene({
    ...validScene,
    sections: [{ id: "", heading: "Actions", choices: [] }],
  }),
);
rejects("scene section headings are required", () =>
  validateScene({
    ...validScene,
    sections: [{ id: "actions", heading: "", choices: [] }],
  }),
);
rejects("duplicate scene section ids are rejected", () =>
  validateScene({
    ...validScene,
    sections: [
      { id: "actions", heading: "Actions", choices: [] },
      { id: "actions", heading: "More actions", choices: [] },
    ],
  }),
);
rejects("scene choices must be arrays", () =>
  validateScene({
    ...validScene,
    sections: [{ id: "actions", heading: "Actions", choices: null }],
  }),
);
rejects("corrupted choices are rejected with their scene", () =>
  validateScene({
    ...validScene,
    sections: [
      {
        id: "actions",
        heading: "Actions",
        choices: [{ ...waitChoice, action: null }],
      },
    ],
  }),
);
rejects("duplicate choice ids are rejected across sections", () =>
  validateScene({
    ...validScene,
    sections: [
      { id: "actions", heading: "Actions", choices: [waitChoice] },
      {
        id: "more",
        heading: "More actions",
        choices: [{ ...waitChoice, label: "Wait again" }],
      },
    ],
  }),
);

let namedError = null;
try {
  validateScene({ ...validScene, id: "" });
} catch (error) {
  namedError = error;
}
check(
  "scene-level failures use SceneContractError",
  namedError instanceof SceneContractError,
);

const game = new Game({
  seed: 117,
  startDate: new Date("2026-08-24T08:00:00.000Z"),
  playerOptions: { startPlaceId: null },
  npcTemplates: [],
});
const generatedLocationScene = buildScene(game);
check(
  "generated location scenes satisfy the complete Scene contract",
  validateScene(generatedLocationScene) === generatedLocationScene,
);
const enabledPlaceChoice = generatedLocationScene.sections
  .flatMap((section) => section.choices)
  .find((choice) => choice.action.type === "enter" && choice.enabled);
game.setCurrentPlace({ placeId: enabledPlaceChoice.action.placeId });
const generatedPlaceScene = buildScene(game);
check(
  "generated place scenes satisfy the complete Scene contract",
  validateScene(generatedPlaceScene) === generatedPlaceScene,
);

if (failures.length) {
  console.error("\nScene contract failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("All scene contract tests passed.");
}
