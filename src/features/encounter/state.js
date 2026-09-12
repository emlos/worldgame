import { MUGGER_PERSONALITY_IDS } from "./personality.js";

export const ENCOUNTER_STATE_VERSION = 3;
export const ALLEY_MUGGING_SCENARIO_ID = "alley-mugging";

export const ENCOUNTER_PHASE = Object.freeze({
  active: "active",
  terminal: "terminal",
});

export const ENCOUNTER_OUTCOME = Object.freeze({
  playerEscaped: "player-escaped",
  muggerFled: "mugger-fled",
  muggerIncapacitated: "mugger-incapacitated",
  theftPlayerConscious: "theft-completed-player-conscious",
  theftPlayerIncapacitated: "theft-completed-player-incapacitated",
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

const PARTICIPANT_IDS = Object.freeze(["player", "mugger"]);
const PARTICIPANT_ID_SET = new Set(PARTICIPANT_IDS);
const PHASES = new Set(Object.values(ENCOUNTER_PHASE));
const OUTCOMES = new Set(Object.values(ENCOUNTER_OUTCOME));
const RANGES = new Set(Object.values(ENCOUNTER_RANGE));
const POSES = new Set(Object.values(ENCOUNTER_POSE));
const SUPPORTS = new Set(Object.values(ENCOUNTER_SUPPORT));
const FACINGS = new Set(Object.values(ENCOUNTER_FACING));
const OBJECTIVE_STAGES = new Set([
  "gain-control",
  "access-money",
  "disengage",
  "complete",
]);
const WRIST_PARTS = new Set(["lower_arm_l", "lower_arm_r"]);
const HAND_PARTS = new Set(["hand_l", "hand_r"]);
const PIN_SOURCE_PARTS = new Set(["hand_l", "hand_r", "knee_l", "knee_r"]);
const HOLD_KINDS = new Set(["wrist-grip", "limb-pin"]);
const ACUTE_IDS = new Set(["dazed", "off-balance", "winded"]);
const PERSONALITY_IDS = new Set(MUGGER_PERSONALITY_IDS);

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

function validateRef(ref, participantId, path) {
  record(ref, path);
  if (participantId === "player") {
    exactKeys(ref, ["type"], path);
    if (ref.type !== "player") fail(`${path}.type must be 'player'`);
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

function validateParticipant(participant, participantId, path) {
  record(participant, path);
  const keys = participantId === "mugger"
    ? ["ref", "pose", "support", "exertion", "commitmentBase", "personalityId", "actionHistory", "acute"]
    : ["ref", "pose", "support", "exertion", "actionHistory", "acute"];
  exactKeys(participant, keys, path);
  validateRef(participant.ref, participantId, `${path}.ref`);
  string(participant.pose, `${path}.pose`, POSES);
  string(participant.support, `${path}.support`, SUPPORTS);
  integer(participant.exertion, `${path}.exertion`, { min: 0, max: 100 });
  if (participantId === "mugger") {
    integer(participant.commitmentBase, `${path}.commitmentBase`, { min: 0, max: 100 });
    string(participant.personalityId, `${path}.personalityId`, PERSONALITY_IDS);
  }
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

function validateRange(range, path) {
  record(range, path);
  exactKeys(range, ["a", "b", "value"], path);
  string(range.a, `${path}.a`, PARTICIPANT_ID_SET);
  string(range.b, `${path}.b`, PARTICIPANT_ID_SET);
  if (range.a === range.b) fail(`${path} must connect different participants`);
  string(range.value, `${path}.value`, RANGES);
}

function validateFacing(facing, path) {
  record(facing, path);
  exactKeys(facing, ["actor", "other", "value"], path);
  string(facing.actor, `${path}.actor`, PARTICIPANT_ID_SET);
  string(facing.other, `${path}.other`, PARTICIPANT_ID_SET);
  if (facing.actor === facing.other) fail(`${path} must relate different participants`);
  string(facing.value, `${path}.value`, FACINGS);
}

function validateHold(hold, path) {
  record(hold, path);
  exactKeys(
    hold,
    ["id", "controllerId", "sourcePartId", "targetId", "targetPartId", "kind", "leverage"],
    path,
  );
  string(hold.id, `${path}.id`);
  string(hold.controllerId, `${path}.controllerId`, PARTICIPANT_ID_SET);
  string(hold.targetId, `${path}.targetId`, PARTICIPANT_ID_SET);
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

function validateIntent(intent, path) {
  record(intent, path);
  exactKeys(intent, ["actorId", "actionId", "parameters"], path);
  if (intent.actorId !== "mugger") fail(`${path}.actorId must be 'mugger'`);
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

export function createAlleyMuggingState({ aggressorAlias, theftAmount, personalityId = "opportunist" }) {
  return {
    version: ENCOUNTER_STATE_VERSION,
    scenarioId: ALLEY_MUGGING_SCENARIO_ID,
    phase: ENCOUNTER_PHASE.active,
    elapsedSeconds: 0,
    exchange: 0,
    participants: {
      player: {
        ref: { type: "player" },
        pose: ENCOUNTER_POSE.standing,
        support: ENCOUNTER_SUPPORT.free,
        exertion: 0,
        actionHistory: [],
        acute: [],
      },
      mugger: {
        ref: { type: "scene-actor", alias: aggressorAlias },
        pose: ENCOUNTER_POSE.standing,
        support: ENCOUNTER_SUPPORT.free,
        exertion: 0,
        commitmentBase: 60,
        personalityId,
        actionHistory: [],
        acute: [],
      },
    },
    relationships: {
      range: [{ a: "player", b: "mugger", value: ENCOUNTER_RANGE.reach }],
      facing: [
        { actor: "player", other: "mugger", value: ENCOUNTER_FACING.toward },
        { actor: "mugger", other: "player", value: ENCOUNTER_FACING.toward },
      ],
      holds: [],
    },
    objective: {
      id: "steal-money",
      ownerId: "mugger",
      stage: "gain-control",
      amount: theftAmount,
      hasLoot: false,
      failedControlAttempts: 0,
    },
    npcIntent: null,
    lastEvents: [{ type: "encounter.started", actorId: "mugger" }],
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
  if (!PARTICIPANT_ID_SET.has(actorId)) fail(`unknown facing actor '${String(actorId)}'`);
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
  if (state.scenarioId !== ALLEY_MUGGING_SCENARIO_ID) fail("state.scenarioId is invalid");
  string(state.phase, "state.phase", PHASES);
  integer(state.elapsedSeconds, "state.elapsedSeconds", { min: 0 });
  integer(state.exchange, "state.exchange", { min: 0 });

  record(state.participants, "state.participants");
  exactKeys(state.participants, PARTICIPANT_IDS, "state.participants");
  for (const participantId of PARTICIPANT_IDS) {
    validateParticipant(
      state.participants[participantId],
      participantId,
      `state.participants.${participantId}`,
    );
  }

  record(state.relationships, "state.relationships");
  exactKeys(state.relationships, ["range", "facing", "holds"], "state.relationships");
  const ranges = array(state.relationships.range, "state.relationships.range");
  if (ranges.length !== 1) fail("state.relationships.range must contain the participant pair once");
  validateRange(ranges[0], "state.relationships.range[0]");
  const facings = array(state.relationships.facing, "state.relationships.facing");
  if (facings.length !== 2) fail("state.relationships.facing must contain both directions");
  facings.forEach((facing, index) => validateFacing(facing, `state.relationships.facing[${index}]`));
  if (new Set(facings.map(({ actor }) => actor)).size !== 2) {
    fail("state.relationships.facing must contain one entry for each participant");
  }
  const holds = array(state.relationships.holds, "state.relationships.holds");
  if (holds.length > 8) fail("state.relationships.holds cannot contain more than eight holds");
  holds.forEach((hold, index) => validateHold(hold, `state.relationships.holds[${index}]`));
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
  if (holds.length && getEncounterRange(state) !== ENCOUNTER_RANGE.clinch) {
    fail("an active hold requires clinch range");
  }

  const objective = record(state.objective, "state.objective");
  exactKeys(
    objective,
    ["id", "ownerId", "stage", "amount", "hasLoot", "failedControlAttempts"],
    "state.objective",
  );
  if (objective.id !== "steal-money") fail("state.objective.id is invalid");
  if (objective.ownerId !== "mugger") fail("state.objective.ownerId must be 'mugger'");
  string(objective.stage, "state.objective.stage", OBJECTIVE_STAGES);
  integer(objective.amount, "state.objective.amount", { min: 0 });
  boolean(objective.hasLoot, "state.objective.hasLoot");
  integer(objective.failedControlAttempts, "state.objective.failedControlAttempts", { min: 0 });
  validateEvents(state.lastEvents, "state.lastEvents");

  if (state.phase === ENCOUNTER_PHASE.active) {
    if (state.outcome !== null) fail("an active encounter cannot have an outcome");
    validateIntent(state.npcIntent, "state.npcIntent");
  } else {
    if (state.npcIntent !== null) fail("a terminal encounter cannot retain NPC intent");
    record(state.outcome, "state.outcome");
    exactKeys(state.outcome, ["id", "moneyLost"], "state.outcome");
    string(state.outcome.id, "state.outcome.id", OUTCOMES);
    integer(state.outcome.moneyLost, "state.outcome.moneyLost", { min: 0 });
    if (state.objective.stage !== "complete") {
      fail("a terminal encounter must have a complete objective stage");
    }
  }

  return state;
}
