import test from "node:test";
import assert from "node:assert/strict";

import { buildScene } from "../src/game/scene/sceneEngine.js";
import {
  ENCOUNTER_ACTION_PURPOSES,
  actionLabel,
  getActionPurpose,
  getAvailableActionInstances,
  sameActionInstance,
} from "../src/features/encounter/availability.js";
import { intentToActionInstance } from "../src/features/encounter/ai.js";
import { getEncounterAction } from "../src/features/encounter/actions/index.js";
import { calculateScreamForHelpChance } from "../src/features/encounter/actions/help.js";
import { createCombatContext } from "../src/features/encounter/combatants.js";
import {
  calculateExertionCost,
  getActionEffortStatus,
} from "../src/features/encounter/effort.js";
import { resolveEncounterExchange } from "../src/features/encounter/resolution.js";
import { gameAtStart, startEncounter } from "./support/encounter.mjs";

function actionIds(instances) {
  return instances.map(({ actionId }) => actionId);
}

function encounterChoices(scene) {
  return scene.sections.flatMap(({ choices }) => choices);
}

test("the opening state exposes the minimum contextual choices", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  const scene = buildScene(game);

  assert.deepEqual(
    encounterChoices(scene).map(({ id }) => id),
    [
      "encounter-action:surrender-money",
      "encounter-action:scream-for-help",
      "encounter-action:create-distance",
      "encounter-action:cover-and-brace",
      "encounter-action:strike-face",
      "encounter-action:drive-body",
      "encounter-action:shove-away",
      "encounter-action:grab-arm:1",
      "encounter-action:grab-arm:2",
    ],
  );
  assert.deepEqual(scene.sections.map(({ heading }) => heading), [
    "Escape",
    "Defend",
    "Attack",
    "Control",
  ]);
  const content = JSON.stringify(scene.content);
  assert.match(content, /You have only a moment to react|already unfolding|brief opening to respond/);
  assert.match(content, /You are standing at arm's reach, unhurt and steady\./);
  assert.doesNotMatch(content, /Next:|Current situation|\d+ seconds\./);
  assert.ok(scene.content.every(({ type }) => type === "paragraph"));
  assert.match(content, /Actions are grouped by immediate purpose/);
  assert.doesNotMatch(content, /complete exchange time/);
  for (const choice of encounterChoices(scene)) {
    assert.equal(choice.showDuration, false);
    assert.doesNotMatch(choice.label, /acts in \d+ sec/);
  }

  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  const npcActions = getAvailableActionInstances(context, "mugger");
  assert.ok(npcActions.some((candidate) =>
    sameActionInstance(candidate, intentToActionInstance(state.npcIntent))));
});

test("calls for help use explicit daylight and weather odds", () => {
  for (const weather of ["clear", "cloudy", "windy", "sunny"]) {
    assert.equal(calculateScreamForHelpChance({ daylightPeriod: "day", weather }), 0.4);
    assert.equal(calculateScreamForHelpChance({ daylightPeriod: "night", weather }), 0.2);
  }
  assert.equal(calculateScreamForHelpChance({ daylightPeriod: "day", weather: "rain" }), 0.25);
  assert.equal(calculateScreamForHelpChance({ daylightPeriod: "day", weather: "snow" }), 0.25);
  assert.equal(calculateScreamForHelpChance({ daylightPeriod: "day", weather: "storm" }), 0.15);
  assert.equal(calculateScreamForHelpChance({ daylightPeriod: "night", weather: "rain" }), 0.125);
  assert.equal(calculateScreamForHelpChance({ daylightPeriod: "night", weather: "snow" }), 0.125);
  assert.equal(calculateScreamForHelpChance({ daylightPeriod: "night", weather: "storm" }), 0.075);
});

test("the combat screen exposes every mechanically available player action", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  state.relationships.range[0].value = "clinch";
  state.npcIntent = {
    actorId: "mugger",
    actionId: "cover-and-brace",
    parameters: { targetId: "mugger" },
  };

  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  const available = getAvailableActionInstances(context, "player");
  const scene = buildScene(game);
  const rendered = encounterChoices(scene).map(({ action }) => ({
    actionId: action.command.actionId,
    actorId: action.command.actorId,
    targetId: action.command.targetId,
    parameters: action.command.parameters,
  }));

  assert.ok(available.length > 7, "test state must exercise the former display cap");
  assert.equal(rendered.length, available.length);
  assert.ok(available.every((instance) =>
    rendered.some((candidate) => sameActionInstance(candidate, instance))));
  assert.ok(rendered.some(({ actionId }) => actionId === "create-distance"));
  assert.equal(new Set(encounterChoices(scene).map(({ id }) => id)).size, available.length);
  assert.ok(scene.sections.every(({ choices }) => choices.length > 0));
});

test("every player action has exactly one immediate-purpose group", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  state.relationships.range[0].value = "clinch";
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  const purposeIds = new Set(ENCOUNTER_ACTION_PURPOSES.map(({ id }) => id));

  for (const instance of getAvailableActionInstances(context, "player")) {
    assert.ok(purposeIds.has(getActionPurpose(context, instance)), instance.actionId);
  }
});

test("a relational wrist hold generates hold-specific responses", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  state.relationships.range[0].value = "clinch";
  state.relationships.holds.push({
    id: "hold-test",
    controllerId: "mugger",
    sourcePartId: "hand_l",
    targetId: "player",
    targetPartId: "lower_arm_l",
    kind: "wrist-grip",
    leverage: 50,
  });
  state.npcIntent = {
    actorId: "mugger",
    actionId: "force-to-wall",
    parameters: { targetId: "player", holdId: "hold-test" },
  };

  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  const ids = actionIds(getAvailableActionInstances(context, "player"));
  assert.ok(ids.includes("strike-holding-arm"));
  assert.ok(ids.includes("wrench-free"));
  assert.ok(!ids.includes("create-distance"));
  assert.equal(Object.hasOwn(state, "is_left_arm_held"), false);
  assert.equal(Object.hasOwn(state.participants.player, "pressed_against_wall"), false);

  const scene = buildScene(game);
  const breakControl = scene.sections.find(({ id }) => id === "encounter-actions-break-control");
  const groupedActionIds = breakControl.choices.map(({ action }) => action.command.actionId);
  assert.ok(groupedActionIds.includes("strike-holding-arm"));
  assert.ok(groupedActionIds.includes("wrench-free"));
  assert.equal(encounterChoices(scene).length, getAvailableActionInstances(context, "player").length);
});

test("wrenching requires capacity in the restrained limb", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  state.relationships.range[0].value = "clinch";
  state.relationships.holds.push({
    id: "disabled-arm-hold",
    controllerId: "mugger",
    sourcePartId: "hand_l",
    targetId: "player",
    targetPartId: "lower_arm_l",
    kind: "wrist-grip",
    leverage: 50,
  });
  game.player.body.getPart("lower_arm_l").integrity = 0;
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });

  assert.ok(!getAvailableActionInstances(context, "player").some(
    ({ actionId }) => actionId === "wrench-free",
  ));
});

test("a fully reinforced hold cannot be reinforced again", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  state.relationships.range[0].value = "clinch";
  state.relationships.holds.push({
    id: "max-player-hold",
    controllerId: "player",
    sourcePartId: "hand_l",
    targetId: "mugger",
    targetPartId: "lower_arm_l",
    kind: "wrist-grip",
    leverage: 100,
  });
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });

  const actions = getAvailableActionInstances(context, "player");
  assert.ok(!actions.some(
    ({ actionId }) => actionId === "tighten-hold",
  ));
  const positionalControl = actions.find(({ actionId }) => actionId === "force-to-ground");
  assert.ok(positionalControl);
  assert.equal(getActionPurpose(context, positionalControl), "control");
});

test("positional control selects the strongest hold independent of relationship order", () => {
  const holds = [
    {
      id: "weak-hold",
      controllerId: "player",
      sourcePartId: "hand_l",
      targetId: "mugger",
      targetPartId: "lower_arm_l",
      kind: "wrist-grip",
      leverage: 20,
    },
    {
      id: "strong-hold",
      controllerId: "player",
      sourcePartId: "hand_r",
      targetId: "mugger",
      targetPartId: "lower_arm_r",
      kind: "wrist-grip",
      leverage: 70,
    },
  ];

  const runScenario = (orderedHolds) => {
    const game = gameAtStart({ seed: 23 });
    const state = startEncounter(game);
    state.relationships.range[0].value = "clinch";
    state.participants.mugger.support = "wall";
    state.relationships.holds = structuredClone(orderedHolds);
    state.npcIntent = {
      actorId: "mugger",
      actionId: "cover-and-brace",
      parameters: { targetId: "mugger" },
    };
    const context = createCombatContext({
      game,
      state,
      instanceKey: game.currentStory.instanceKey,
    });
    const positionalActions = getAvailableActionInstances(context, "player")
      .filter(({ actionId }) => ["force-to-ground", "turn-target-away"].includes(actionId))
      .map(({ actionId, targetId, parameters }) => ({ actionId, targetId, parameters }));
    const playerAction = getAvailableActionInstances(context, "player")
      .find(({ actionId }) => actionId === "force-to-ground");
    assert.ok(playerAction);
    const next = resolveEncounterExchange({
      game,
      state,
      instanceKey: game.currentStory.instanceKey,
      playerAction,
    });
    return {
      positionalActions,
      result: {
        participantPositions: Object.fromEntries(
          Object.entries(next.participants).map(([id, participant]) => [id, {
            pose: participant.pose,
            support: participant.support,
          }]),
        ),
        facing: structuredClone(next.relationships.facing),
        holds: [...next.relationships.holds]
          .sort((left, right) => left.id.localeCompare(right.id)),
        events: structuredClone(next.lastEvents),
      },
    };
  };

  const original = runScenario(holds);
  const reversed = runScenario([...holds].reverse());

  assert.deepEqual(reversed, original);
  assert.deepEqual(
    original.positionalActions.map(
      ({ actionId, parameters }) => [actionId, parameters.holdId],
    ),
    [
      ["force-to-ground", "strong-hold"],
      ["turn-target-away", "strong-hold"],
    ],
  );
});

test("two held arms generate one combined wrench and separate holding-limb attacks", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  state.relationships.range[0].value = "clinch";
  state.relationships.holds.push(
    {
      id: "hold-left",
      controllerId: "mugger",
      sourcePartId: "hand_l",
      targetId: "player",
      targetPartId: "lower_arm_l",
      kind: "wrist-grip",
      leverage: 50,
    },
    {
      id: "hold-right",
      controllerId: "mugger",
      sourcePartId: "hand_r",
      targetId: "player",
      targetPartId: "lower_arm_r",
      kind: "wrist-grip",
      leverage: 48,
    },
  );
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  const actions = getAvailableActionInstances(context, "player");
  const wrench = actions.filter(({ actionId }) => actionId === "wrench-free");
  const holdingLimbStrikes = actions.filter(({ actionId }) => actionId === "strike-holding-arm");

  assert.equal(wrench.length, 1);
  assert.deepEqual(wrench[0].parameters.holdIds, ["hold-left", "hold-right"]);
  assert.equal(actionLabel(context, wrench[0]), "Try to wrestle both arms free");
  assert.equal(holdingLimbStrikes.length, 2);
  assert.ok(holdingLimbStrikes.every(({ parameters }) => parameters.sourcePartId.startsWith("knee_")));
  assert.ok(actionIds(actions).includes("headbutt"));
  assert.ok(actionIds(actions).includes("knee-strike"));
  assert.ok(!actionIds(actions).includes("cover-and-brace"));

  state.npcIntent = {
    actorId: "mugger",
    actionId: "force-to-ground",
    parameters: { targetId: "player", holdId: "hold-left" },
  };
  const choices = encounterChoices(buildScene(game));
  assert.equal(new Set(choices.map(({ id }) => id)).size, choices.length);
  assert.equal(
    choices.filter(({ action }) => action.command.actionId === "strike-holding-arm").length,
    2,
  );
});

test("ground position exposes standing, turning, and pin actions contextually", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  state.relationships.range[0].value = "clinch";
  state.participants.player.pose = "supine";
  state.participants.mugger.pose = "kneeling";
  state.relationships.holds.push({
    id: "ground-grip",
    controllerId: "mugger",
    sourcePartId: "hand_l",
    targetId: "player",
    targetPartId: "lower_arm_l",
    kind: "wrist-grip",
    leverage: 24,
  });
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });

  let playerIds = actionIds(getAvailableActionInstances(context, "player"));
  assert.ok(playerIds.includes("stand-up"));
  assert.ok(!playerIds.includes("knee-strike"));
  assert.ok(!playerIds.includes("headbutt"));
  assert.ok(actionIds(getAvailableActionInstances(context, "mugger")).includes("pin-limb"));

  state.participants.player.pose = "prone";
  state.relationships.facing.find(({ actor }) => actor === "player").value = "away";
  playerIds = actionIds(getAvailableActionInstances(context, "player"));
  assert.ok(playerIds.includes("roll-toward"));
});

test("facing away blocks active contact but preserves recovery and retreat", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  state.relationships.range[0].value = "clinch";
  state.participants.player.support = "wall";
  state.relationships.facing.find(({ actor }) => actor === "player").value = "away";
  state.relationships.holds.push({
    id: "player-grip",
    controllerId: "player",
    sourcePartId: "hand_l",
    targetId: "mugger",
    targetPartId: "lower_arm_l",
    kind: "wrist-grip",
    leverage: 55,
  });
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });

  let ids = actionIds(getAvailableActionInstances(context, "player"));
  for (const blocked of [
    "strike-face",
    "drive-body",
    "shove-away",
    "grab-arm",
    "force-to-wall",
    "force-to-ground",
  ]) {
    assert.ok(!ids.includes(blocked), blocked);
  }
  assert.ok(ids.includes("roll-toward"));
  assert.ok(ids.includes("create-distance"));
  assert.ok(ids.includes("tighten-hold"));

  state.relationships.facing.find(({ actor }) => actor === "player").value = "toward";
  ids = actionIds(getAvailableActionInstances(context, "player"));
  for (const restored of [
    "strike-face",
    "drive-body",
    "shove-away",
    "grab-arm",
    "force-to-wall",
    "force-to-ground",
  ]) {
    assert.ok(ids.includes(restored), restored);
  }
});

test("target facing governs exposed-target attacks without preventing rear control", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  state.relationships.facing.find(({ actor }) => actor === "mugger").value = "away";
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });

  const ids = actionIds(getAvailableActionInstances(context, "player"));
  assert.ok(!ids.includes("strike-face"));
  assert.ok(ids.includes("drive-body"));
  assert.ok(ids.includes("shove-away"));
  assert.ok(ids.includes("grab-arm"));
});

test("facing away blocks pursuit but not fleeing", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  state.relationships.range[0].value = "far";
  state.relationships.facing.find(({ actor }) => actor === "mugger").value = "away";
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });

  let ids = actionIds(getAvailableActionInstances(context, "mugger"));
  assert.ok(!ids.includes("close-distance"));
  assert.ok(ids.includes("flee"));

  state.relationships.facing.find(({ actor }) => actor === "mugger").value = "side";
  ids = actionIds(getAvailableActionInstances(context, "mugger"));
  assert.ok(ids.includes("close-distance"));

  const run = getAvailableActionInstances(context, "player")
    .find(({ actionId }) => actionId === "run");
  assert.equal(actionLabel(context, run), "Run for safety");
  assert.doesNotMatch(
    getEncounterAction("flee").intentLabel(context, { actorId: "mugger" }),
    /alley|street/i,
  );
});

test("severe winded or dazed states hide demanding player actions but not recovery", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  state.relationships.range[0].value = "clinch";
  state.participants.player.exertion = 92;
  state.participants.player.acute = [{ id: "winded", severity: 2, exchanges: 3 }];
  state.relationships.holds.push({
    id: "player-control",
    controllerId: "player",
    sourcePartId: "hand_l",
    targetId: "mugger",
    targetPartId: "lower_arm_l",
    kind: "wrist-grip",
    leverage: 100,
  });
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });

  let ids = actionIds(getAvailableActionInstances(context, "player"));
  assert.ok(ids.includes("catch-breath"));
  assert.ok(!ids.includes("headbutt"));
  assert.ok(!ids.includes("force-to-wall"));
  assert.ok(!ids.includes("force-to-ground"));

  state.participants.player.exertion = 0;
  state.participants.player.acute = [{ id: "dazed", severity: 2, exchanges: 3 }];
  ids = actionIds(getAvailableActionInstances(context, "player"));
  assert.ok(ids.includes("catch-breath"));
  assert.ok(!ids.includes("headbutt"));
  assert.ok(!ids.includes("force-to-wall"));
  assert.ok(!ids.includes("force-to-ground"));
});

test("NPCs retain overexerting actions with a documented desperation chance", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  state.relationships.range[0].value = "clinch";
  state.participants.mugger.exertion = 100;
  state.participants.mugger.acute = [{ id: "winded", severity: 2, exchanges: 3 }];
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  const headbutt = getAvailableActionInstances(context, "mugger")
    .find(({ actionId }) => actionId === "headbutt");

  assert.ok(headbutt);
  const effort = getActionEffortStatus(context, headbutt);
  assert.equal(effort.allowed, false);
  assert.ok(effort.blockers.includes("too-winded"));
  assert.ok(effort.desperateChance >= 0.02 && effort.desperateChance <= 0.23);
});

test("exertion cost rises under fatigue and acute strain while conditioning helps", () => {
  const game = gameAtStart();
  const state = startEncounter(game);
  const context = createCombatContext({
    game,
    state,
    instanceKey: game.currentStory.instanceKey,
  });
  const freshCost = calculateExertionCost(context, "player", 10);
  state.participants.player.exertion = 80;
  state.participants.player.acute = [
    { id: "winded", severity: 2, exchanges: 3 },
    { id: "dazed", severity: 1, exchanges: 2 },
  ];
  const strainedCost = calculateExertionCost(context, "player", 10);
  state.participants.player.exertion = 0;
  state.participants.player.acute = [];
  game.player.setSkillValue("endurance", 10);
  const conditionedCost = calculateExertionCost(context, "player", 10);

  assert.ok(strainedCost > freshCost);
  assert.ok(conditionedCost < freshCost);
});
