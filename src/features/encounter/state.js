import { AI_PERSONALITY_IDS } from "./personality.js";
import { requireEncounterObjective } from "./objectives/index.js";

export const ENCOUNTER_STATE_VERSION = 6;
export const FIGHT_SCENARIO_ID = "fight";

export const ENCOUNTER_PHASE = Object.freeze({
  active: "active",
  terminal: "terminal",
});

export const ENCOUNTER_RANGE = Object.freeze({
  far: "far",
  reach: "reach",
  clinch: "clinch",
});

export const ENCOUNTER_POSE = Object.freeze({
  standing: "standing",
  kneeling: "kneeling",
  supine: "supine",
  prone: "prone",
});

export const ENCOUNTER_SUPPORT = Object.freeze({
  free: "free",
  wall: "wall",
});

export const ENCOUNTER_FACING = Object.freeze({
  toward: "toward",
  away: "away",
  side: "side",
});

const PHASES = new Set(Object.values(ENCOUNTER_PHASE));
const RANGES = new Set(Object.values(ENCOUNTER_RANGE));
const POSES = new Set(Object.values(ENCOUNTER_POSE));
const SUPPORTS = new Set(Object.values(ENCOUNTER_SUPPORT));
const FACINGS = new Set(Object.values(ENCOUNTER_FACING));
const WRIST_PARTS = new Set(["lower_arm_l", "lower_arm_r"]);
const HAND_PARTS = new Set(["hand_l", "hand_r"]);
const PIN_SOURCE_PARTS = new Set(["hand_l", "hand_r", "knee_l", "knee_r"]);
const HOLD_KINDS = new Set(["wrist-grip", "limb-pin"]);
const ACUTE_IDS = new Set(["dazed", "off-balance", "winded"]);
const PERSONALITY_IDS = new Set(AI_PERSONALITY_IDS);

function fail(message) {
  throw new Error(`Physical encounter state: ${message}`);
}

function record(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${path} must be an object`);
  }
  return value;
}

function exactKeys(value, keys, path) {
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) fail(`${path}.${key} is not supported`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) fail(`${path}.${key} is required`);
  }
}

function string(value, path, allowed = null) {
  if (typeof value !== "string" || !value) fail(`${path} must be a non-empty string`);
  if (allowed && !allowed.has(value)) fail(`${path} has invalid value '${value}'`);
  return value;
}

function integer(value, path, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail(`${path} must be an integer from ${min} through ${max}`);
  }
  return value;
}

function boolean(value, path) {
  if (typeof value !== "boolean") fail(`${path} must be a boolean`);
  return value;
}

function array(value, path) {
  if (!Array.isArray(value)) fail(`${path} must be an array`);
  return value;
}

function validateRef(ref, path) {
  record(ref, path);
  if (ref.type === "player") {
    exactKeys(ref, ["type"], path);
    return;
  }
  exactKeys(ref, ["type", "alias"], path);
  if (ref.type !== "scene-actor") fail(`${path}.type must be 'scene-actor'`);
  string(ref.alias, `${path}.alias`);
}

function validateAcute(acute, path) {
  record(acute, path);
  exactKeys(acute, ["id", "severity", "exchanges"], path);
  string(acute.id, `${path}.id`, ACUTE_IDS);
  integer(acute.severity, `${path}.severity`, { min: 1, max: 3 });
  integer(acute.exchanges, `${path}.exchanges`, { min: 1, max: 10 });
}

function validateParticipant(participant, path) {
  record(participant, path);
  const keys = ["ref", "controller", "pose", "support", "exertion", "actionHistory", "acute"];
  exactKeys(participant, keys, path);
  validateRef(participant.ref, `${path}.ref`);
  record(participant.controller, `${path}.controller`);
  if (participant.controller.type === "human") {
    exactKeys(participant.controller, ["type"], `${path}.controller`);
    if (participant.ref.type !== "player") fail(`${path}.controller human must reference the player`);
  } else if (participant.controller.type === "ai") {
    exactKeys(
      participant.controller,
      ["type", "policyId", "commitmentBase", "personalityId"],
      `${path}.controller`,
    );
    string(participant.controller.policyId, `${path}.controller.policyId`);
    integer(participant.controller.commitmentBase, `${path}.controller.commitmentBase`, {
      min: 0,
      max: 100,
    });
    string(participant.controller.personalityId, `${path}.controller.personalityId`, PERSONALITY_IDS);
  } else {
    fail(`${path}.controller.type is invalid`);
  }
  string(participant.pose, `${path}.pose`, POSES);
  string(participant.support, `${path}.support`, SUPPORTS);
  integer(participant.exertion, `${path}.exertion`, { min: 0, max: 100 });
  const history = array(participant.actionHistory, `${path}.actionHistory`);
  if (history.length > 8) fail(`${path}.actionHistory cannot contain more than eight actions`);
  history.forEach((actionId, index) => string(actionId, `${path}.actionHistory[${index}]`));
  array(participant.acute, `${path}.acute`).forEach((acute, index) =>
    validateAcute(acute, `${path}.acute[${index}]`));
  const acuteIds = participant.acute.map(({ id }) => id);
  if (new Set(acuteIds).size !== acuteIds.length) fail(`${path}.acute contains duplicate effects`);
  if (participant.pose !== ENCOUNTER_POSE.standing && participant.support === ENCOUNTER_SUPPORT.wall) {
    fail(`${path} cannot be grounded and wall-supported`);
  }
}

function validateRange(range, path, participantIdSet) {
  record(range, path);
  exactKeys(range, ["a", "b", "value"], path);
  string(range.a, `${path}.a`, participantIdSet);
  string(range.b, `${path}.b`, participantIdSet);
  if (range.a === range.b) fail(`${path} must connect different participants`);
  string(range.value, `${path}.value`, RANGES);
}

function validateFacing(facing, path, participantIdSet) {
  record(facing, path);
  exactKeys(facing, ["actor", "other", "value"], path);
  string(facing.actor, `${path}.actor`, participantIdSet);
  string(facing.other, `${path}.other`, participantIdSet);
  if (facing.actor === facing.other) fail(`${path} must relate different participants`);
  string(facing.value, `${path}.value`, FACINGS);
}

function validateHold(hold, path, participantIdSet) {
  record(hold, path);
  exactKeys(
    hold,
    ["id", "controllerId", "sourcePartId", "targetId", "targetPartId", "kind", "leverage"],
    path,
  );
  string(hold.id, `${path}.id`);
  string(hold.controllerId, `${path}.controllerId`, participantIdSet);
  string(hold.targetId, `${path}.targetId`, participantIdSet);
  if (hold.controllerId === hold.targetId) fail(`${path} cannot target its controller`);
  string(hold.kind, `${path}.kind`, HOLD_KINDS);
  const allowedSources = hold.kind === "wrist-grip" ? HAND_PARTS : PIN_SOURCE_PARTS;
  string(hold.sourcePartId, `${path}.sourcePartId`, allowedSources);
  string(hold.targetPartId, `${path}.targetPartId`, WRIST_PARTS);
  integer(hold.leverage, `${path}.leverage`, { min: 1, max: 100 });
}

function limbKey(partId) {
  const side = partId.endsWith("_l") ? "left" : partId.endsWith("_r") ? "right" : "centre";
  const family = partId.startsWith("hand")
    || partId.includes("arm")
    || partId.startsWith("shoulder")
    ? "arm"
    : partId.startsWith("knee")
      ? "leg"
      : partId;
  return `${family}:${side}`;
}

function validateIntent(intent, path, participantIdSet, ownerId) {
  record(intent, path);
  exactKeys(intent, ["actorId", "actionId", "parameters"], path);
  string(intent.actorId, `${path}.actorId`, participantIdSet);
  if (intent.actorId !== ownerId) fail(`${path}.actorId must be the goal owner`);
  string(intent.actionId, `${path}.actionId`);
  record(intent.parameters, `${path}.parameters`);
}

function validateEvents(events, path) {
  array(events, path);
  if (events.length > 24) fail(`${path} cannot contain more than 24 recent events`);
  events.forEach((event, index) => {
    const eventPath = `${path}[${index}]`;
    record(event, eventPath);
    string(event.type, `${eventPath}.type`);
  });
}

export function createFightState({
  controlledId = "player",
  opponentId = "opponent",
  opponentAlias,
  objective,
  personalityId = "opportunist",
}) {
  const ownerId = opponentId;
  const targetId = controlledId;
  return {
    version: ENCOUNTER_STATE_VERSION,
    scenarioId: FIGHT_SCENARIO_ID,
    phase: ENCOUNTER_PHASE.active,
    elapsedSeconds: 0,
    exchange: 0,
    participants: {
      [controlledId]: {
        ref: { type: "player" },
        controller: { type: "human" },
        pose: ENCOUNTER_POSE.standing,
        support: ENCOUNTER_SUPPORT.free,
        exertion: 0,
        actionHistory: [],
        acute: [],
      },
      [opponentId]: {
        ref: { type: "scene-actor", alias: opponentAlias },
        controller: {
          type: "ai",
          policyId: "hostile",
          commitmentBase: 60,
          personalityId,
        },
        pose: ENCOUNTER_POSE.standing,
        support: ENCOUNTER_SUPPORT.free,
        exertion: 0,
        actionHistory: [],
        acute: [],
      },
    },
    relationships: {
      range: [{ a: targetId, b: ownerId, value: ENCOUNTER_RANGE.reach }],
      facing: [
        { actor: targetId, other: ownerId, value: ENCOUNTER_FACING.toward },
        { actor: ownerId, other: targetId, value: ENCOUNTER_FACING.toward },
      ],
      holds: [],
    },
    objective: { ...objective, ownerId, targetId },
    npcIntent: null,
    lastEvents: [{ type: "encounter.started", actorId: ownerId, targetId }],
    outcome: null,
  };
}

export function getEncounterRange(state) {
  return state.relationships.range[0].value;
}

export function setEncounterRange(state, value) {
  if (!RANGES.has(value)) fail(`cannot set invalid range '${String(value)}'`);
  state.relationships.range[0].value = value;
}

export function getEncounterFacing(state, actorId) {
  return state.relationships.facing.find(({ actor }) => actor === actorId)?.value || null;
}

export function setEncounterFacing(state, actorId, value) {
  if (!Object.hasOwn(state.participants, actorId)) fail(`unknown facing actor '${String(actorId)}'`);
  if (!FACINGS.has(value)) fail(`cannot set invalid facing '${String(value)}'`);
  const relation = state.relationships.facing.find(({ actor }) => actor === actorId);
  if (!relation) fail(`missing facing relation for '${actorId}'`);
  relation.value = value;
}

export function validateEncounterState(state) {
  record(state, "state");
  exactKeys(
    state,
    [
      "version",
      "scenarioId",
      "phase",
      "elapsedSeconds",
      "exchange",
      "participants",
      "relationships",
      "objective",
      "npcIntent",
      "lastEvents",
      "outcome",
    ],
    "state",
  );
  if (state.version !== ENCOUNTER_STATE_VERSION) fail("state.version is invalid");
  if (state.scenarioId !== FIGHT_SCENARIO_ID) fail("state.scenarioId is invalid");
  string(state.phase, "state.phase", PHASES);
  integer(state.elapsedSeconds, "state.elapsedSeconds", { min: 0 });
  integer(state.exchange, "state.exchange", { min: 0 });

  record(state.participants, "state.participants");
  const participantIds = Object.keys(state.participants);
  if (participantIds.length !== 2 || new Set(participantIds).size !== 2) {
    fail("state.participants must contain exactly two distinct participants");
  }
  const participantIdSet = new Set(participantIds);
  for (const participantId of participantIds) {
    validateParticipant(
      state.participants[participantId],
      `state.participants.${participantId}`,
    );
  }
  if (participantIds.filter((id) => state.participants[id].ref.type === "player").length !== 1) {
    fail("state.participants must contain exactly one player reference");
  }

  record(state.relationships, "state.relationships");
  exactKeys(state.relationships, ["range", "facing", "holds"], "state.relationships");
  const ranges = array(state.relationships.range, "state.relationships.range");
  if (ranges.length !== 1) fail("state.relationships.range must contain the participant pair once");
  validateRange(ranges[0], "state.relationships.range[0]", participantIdSet);
  if (new Set([ranges[0].a, ranges[0].b]).size !== 2) {
    fail("state.relationships.range must contain the participant pair");
  }
  const facings = array(state.relationships.facing, "state.relationships.facing");
  if (facings.length !== 2) fail("state.relationships.facing must contain both directions");
  facings.forEach((facing, index) => validateFacing(
    facing,
    `state.relationships.facing[${index}]`,
    participantIdSet,
  ));
  if (new Set(facings.map(({ actor }) => actor)).size !== 2) {
    fail("state.relationships.facing must contain one entry for each participant");
  }
  const holds = array(state.relationships.holds, "state.relationships.holds");
  if (holds.length > 8) fail("state.relationships.holds cannot contain more than eight holds");
  holds.forEach((hold, index) => validateHold(
    hold,
    `state.relationships.holds[${index}]`,
    participantIdSet,
  ));
  const holdIds = new Set();
  const committedSources = new Set();
  const controlledTargets = new Set();
  for (const hold of holds) {
    if (holdIds.has(hold.id)) fail(`state.relationships.holds duplicates id '${hold.id}'`);
    holdIds.add(hold.id);
    const sourceKey = `${hold.controllerId}:${limbKey(hold.sourcePartId)}`;
    if (committedSources.has(sourceKey)) {
      fail(`state.relationships.holds reuses source limb '${sourceKey}'`);
    }
    committedSources.add(sourceKey);
    const targetKey = `${hold.targetId}:${limbKey(hold.targetPartId)}`;
    if (controlledTargets.has(targetKey)) {
      fail(`state.relationships.holds controls target limb '${targetKey}' more than once`);
    }
    controlledTargets.add(targetKey);
  }
  for (let leftIndex = 0; leftIndex < holds.length; leftIndex += 1) {
    const left = holds[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < holds.length; rightIndex += 1) {
      const right = holds[rightIndex];
      const mutuallyRestrained = left.controllerId === right.targetId
        && right.controllerId === left.targetId
        && limbKey(left.sourcePartId) === limbKey(right.targetPartId)
        && limbKey(right.sourcePartId) === limbKey(left.targetPartId);
      if (mutuallyRestrained) {
        fail(`state.relationships.holds '${left.id}' and '${right.id}' use mutually restrained source limbs`);
      }
    }
  }
  if (holds.length && getEncounterRange(state) !== ENCOUNTER_RANGE.clinch) {
    fail("an active hold requires clinch range");
  }

  const objective = record(state.objective, "state.objective");
  string(objective.id, "state.objective.id");
  string(objective.ownerId, "state.objective.ownerId", participantIdSet);
  string(objective.targetId, "state.objective.targetId", participantIdSet);
  if (objective.ownerId === objective.targetId) fail("state.objective cannot target its owner");
  const objectiveDefinition = requireEncounterObjective(state);
  validateEvents(state.lastEvents, "state.lastEvents");

  if (state.phase === ENCOUNTER_PHASE.active) {
    if (state.outcome !== null) fail("an active encounter cannot have an outcome");
    validateIntent(state.npcIntent, "state.npcIntent", participantIdSet, objective.ownerId);
  } else {
    if (state.npcIntent !== null) fail("a terminal encounter cannot retain NPC intent");
    record(state.outcome, "state.outcome");
    string(state.outcome.id, "state.outcome.id");
  }

  objectiveDefinition.validateState(state, { fail, exactKeys, string, integer, boolean });

  return state;
}
