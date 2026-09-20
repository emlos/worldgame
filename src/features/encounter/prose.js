import { actionDurationSeconds } from "./availability.js";
import { getCommitmentBand } from "./ai.js";
import { getCombatant } from "./combatants.js";
import {
  ENCOUNTER_POSE,
  ENCOUNTER_RANGE,
} from "./state.js";
import {
  controlledParticipantId,
  opponentParticipantId,
} from "./roles.js";
import { requireEncounterObjective } from "./objectives/index.js";
import { getEncounterAction } from "./actions/index.js";
import {
  braceProseVariants,
  closingDistanceProseName,
  distanceProseName,
  EMPTY_EXCHANGE_PROSE,
  genericEventProse,
  grabArmProseVariants,
  impactPartProseName,
  intentDisplayProse,
  movementProseVariants,
  positionProseVariants,
  releasedHoldProseName,
  sideProseName,
  situationConditionProse,
  situationPositionProse,
  spoiledActionProse,
  strikeProseDescription,
  strikeProseVariants,
  withFailureOddsProse,
  wrenchFreeProseVariants,
  wristProseName,
} from "./proseData.js";
import { pickProseVariant } from "./proseVariants.js";

function actionWasRepeated(context, event) {
  const history = context.state.participants[event.actorId]?.actionHistory || [];
  return history.length >= 2
    && history.at(-1) === event.actionId
    && history.at(-2) === event.actionId;
}

function actionVariant(context, event, result, variants) {
  return pickProseVariant(
    context,
    [event.actorId, event.targetId, event.actionId, result].join(":"),
    variants,
    { avoidPreviousExchange: actionWasRepeated(context, event) },
  );
}

function grabBeatText(context, attempted, events) {
  const failure = events.find((event) => event.type === "action.failed");
  const hold = events.find((event) => event.type === "hold.created"
    && event.controllerId === attempted.actorId
    && event.targetId === attempted.targetId);

  if (failure?.reason === "grip-missed") {
    const variants = grabArmProseVariants(context, attempted, "failed.grip-missed");
    return {
      text: withFailureOddsProse(failure, actionVariant(context, attempted, "failed.grip-missed", variants)),
      consumed: new Set([attempted, failure]),
    };
  }

  if (!hold) return null;
  const wrist = wristProseName(hold.targetPartId);
  const variants = grabArmProseVariants(context, attempted, "success", { wrist });
  const range = events.find((event) => event.type === "range.changed"
    && event.to === ENCOUNTER_RANGE.clinch);
  return {
    text: actionVariant(context, attempted, "success", variants),
    consumed: new Set([attempted, hold, ...(range ? [range] : [])]),
  };
}

function wrenchBeatText(context, attempted, events) {
  const failure = events.find((event) => event.type === "action.failed");
  const broken = events.filter((event) => event.type === "hold.broken"
    && event.targetId === attempted.actorId);
  if (!failure && !broken.length) return null;

  let variants;
  let result;

  if (failure?.reason === "partly-freed") {
    result = "partial";
    variants = wrenchFreeProseVariants(context, attempted, result);
  } else if (failure?.reason === "grip-held") {
    result = "failed.grip-held";
    variants = wrenchFreeProseVariants(context, attempted, result);
  } else {
    result = "success";
    const wrist = releasedHoldProseName(broken);
    variants = wrenchFreeProseVariants(context, attempted, result, { wrist });
  }

  const weakened = events.filter((event) => event.type === "hold.weakened");
  const text = actionVariant(context, attempted, result, variants);
  return {
    text: failure ? withFailureOddsProse(failure, text) : text,
    consumed: new Set([attempted, ...broken, ...weakened, ...(failure ? [failure] : [])]),
  };
}

const STRIKE_ACTIONS = new Set([
  "strike-face",
  "drive-body",
  "rough-up",
  "strike-holding-arm",
  "headbutt",
  "knee-strike",
  "attack-limb",
]);

function strikeBeatText(context, attempted, events) {
  const failure = events.find((event) => event.type === "action.failed");
  const impact = events.find((event) => event.type === "impact.landed"
    && event.actorId === attempted.actorId
    && event.targetId === attempted.targetId);
  if (!failure && !impact) return null;

  const strike = strikeProseDescription(attempted.actionId);

  if (failure?.reason === "missed") {
    const variants = strikeProseVariants(context, attempted, "failed.missed", { strike });
    return {
      text: withFailureOddsProse(failure, actionVariant(context, attempted, "failed.missed", variants)),
      consumed: new Set([attempted, failure]),
    };
  }
  if (failure) return null;

  const part = impactPartProseName(impact.partId);
  const variants = strikeProseVariants(context, attempted, "success", { strike, part });
  return {
    text: actionVariant(context, attempted, "success", variants),
    consumed: new Set([attempted, impact]),
  };
}

function braceBeatText(context, attempted, events) {
  const braced = events.find((event) => event.type === "defense.braced"
    && event.actorId === attempted.actorId);
  if (!braced) return null;
  const variants = braceProseVariants(context, attempted);
  return {
    text: actionVariant(context, attempted, "success", variants),
    consumed: new Set([attempted, braced]),
  };
}

function movementBeatText(context, attempted, events) {
  const failure = events.find((event) => event.type === "action.failed");
  const range = events.find((event) => event.type === "range.changed");
  const escaped = events.find((event) => ["escape.completed", "escape.disengaged"]
    .includes(event.type));
  const broken = events.filter((event) => event.type === "hold.broken");
  let variants = null;
  const result = failure ? `failed.${failure.reason}` : "success";

  if (failure && ["create-distance", "close-distance", "controlled-disengage"]
    .includes(attempted.actionId)) {
    variants = movementProseVariants(context, attempted, result);
  } else if (!failure && attempted.actionId === "create-distance" && range) {
    variants = movementProseVariants(context, attempted, result, {
      destination: distanceProseName(range.to),
      brokeHold: broken.length > 0,
    });
  } else if (!failure && attempted.actionId === "close-distance" && range) {
    variants = movementProseVariants(context, attempted, result, {
      destination: closingDistanceProseName(range.to),
    });
  } else if (!failure && attempted.actionId === "controlled-disengage" && escaped) {
    variants = movementProseVariants(context, attempted, result);
  } else if (!failure && ["run", "flee"].includes(attempted.actionId) && escaped) {
    variants = movementProseVariants(context, attempted, result);
  }

  if (!variants?.length) return null;
  const text = actionVariant(context, attempted, result, variants);
  return {
    text: failure ? withFailureOddsProse(failure, text) : text,
    consumed: new Set([
      attempted,
      ...(failure ? [failure] : []),
      ...(range ? [range] : []),
      ...(escaped ? [escaped] : []),
      ...broken,
    ]),
  };
}

function positionBeatText(context, attempted, events) {
  const failure = events.find((event) => event.type === "action.failed");
  const poses = events.filter((event) => event.type === "pose.changed");
  const support = events.find((event) => event.type === "support.changed"
    && event.actorId === attempted.targetId);
  const facing = events.find((event) => event.type === "facing.changed"
    && event.actorId === attempted.targetId);
  const pinned = events.find((event) => event.type === "hold.pinned"
    && event.controllerId === attempted.actorId);
  let variants = null;
  let successEvents = [];
  const result = failure ? `failed.${failure.reason}` : "success";

  if (failure && ["force-to-ground", "stand-up"].includes(attempted.actionId)) {
    variants = positionProseVariants(context, attempted, result);
  } else if (!failure && attempted.actionId === "force-to-ground"
    && poses.some((event) => event.actorId === attempted.targetId)) {
    successEvents = poses;
    variants = positionProseVariants(context, attempted, result);
  } else if (!failure && attempted.actionId === "stand-up"
    && poses.some((event) => event.actorId === attempted.actorId
      && event.to === ENCOUNTER_POSE.standing)) {
    successEvents = poses.filter((event) => event.actorId === attempted.actorId);
    variants = positionProseVariants(context, attempted, result);
  } else if (!failure && attempted.actionId === "force-to-wall" && support) {
    successEvents = [support];
    variants = positionProseVariants(context, attempted, result);
  } else if (!failure && attempted.actionId === "turn-target-away" && facing) {
    successEvents = [facing, ...poses];
    variants = positionProseVariants(context, attempted, result);
  } else if (!failure && attempted.actionId === "pin-limb" && pinned) {
    successEvents = [pinned];
    variants = positionProseVariants(context, attempted, result, {
      side: sideProseName(pinned.targetPartId),
    });
  }

  if (!variants?.length) return null;
  const text = actionVariant(context, attempted, result, variants);
  return {
    text: failure ? withFailureOddsProse(failure, text) : text,
    consumed: new Set([attempted, ...(failure ? [failure] : []), ...successEvents]),
  };
}

function renderActionBeat(context, events) {
  const attempted = events[0];
  const spoiled = events.find((event) => event.type === "action.spoiled"
    && event.actorId === attempted.actorId
    && event.actionId === attempted.actionId);
  if (spoiled) {
    return [
      spoiledActionProse(context, spoiled),
      ...events
        .filter((event) => event !== attempted && event !== spoiled)
        .map((event) => eventText(context, event))
        .filter(Boolean),
    ];
  }
  let rendered = null;
  if (attempted.actionId === "grab-arm") {
    rendered = grabBeatText(context, attempted, events);
  } else if (attempted.actionId === "wrench-free") {
    rendered = wrenchBeatText(context, attempted, events);
  } else if (STRIKE_ACTIONS.has(attempted.actionId)) {
    rendered = strikeBeatText(context, attempted, events);
  } else if (attempted.actionId === "cover-and-brace") {
    rendered = braceBeatText(context, attempted, events);
  } else if (["create-distance", "close-distance", "controlled-disengage", "run", "flee"]
    .includes(attempted.actionId)) {
    rendered = movementBeatText(context, attempted, events);
  } else if (["force-to-ground", "stand-up", "force-to-wall", "turn-target-away", "pin-limb"]
    .includes(attempted.actionId)) {
    rendered = positionBeatText(context, attempted, events);
  }

  if (!rendered) return events.map((event) => eventText(context, event)).filter(Boolean);
  return [
    rendered.text,
    ...events
      .filter((event) => !rendered.consumed.has(event))
      .map((event) => eventText(context, event))
      .filter(Boolean),
  ];
}

function renderNarrativeEvents(context, events) {
  return renderNarrativeGroups(context, events).flatMap(({ sentences }) => sentences);
}

function renderNarrativeGroups(context, events) {
  const groups = [];
  let current = null;
  for (const event of events) {
    if (event.type === "pain.changed") continue;
    if (event.type === "action.attempted") {
      current = [event];
      groups.push(current);
    } else if (current) {
      current.push(event);
    } else {
      groups.push([event]);
    }
  }
  return groups.map((group) => ({
    events: group,
    sentences: group[0].type === "action.attempted"
      ? renderActionBeat(context, group)
      : group.map((event) => eventText(context, event)).filter(Boolean),
  }));
}

function eventText(context, event) {
  const objectiveText = requireEncounterObjective(context.state).renderEvent(context, event);
  return objectiveText !== null ? objectiveText : genericEventProse(context, event);
}

export function renderLastExchange(context) {
  const sentences = renderNarrativeEvents(context, context.state.lastEvents);
  return sentences.length ? sentences.join(" ") : EMPTY_EXCHANGE_PROSE;
}

function painChangeFeedback(event) {
  return {
    type: "stat",
    statId: "pain",
    amount: event.amount,
    higherIsBetter: false,
    direction: "increase",
    label: "+Pain",
  };
}

function renderExchangeParts(context, events, { emptyText = "" } = {}) {
  const playerId = controlledParticipantId(context.state);
  const painChange = [...events].reverse().find((event) =>
    event.type === "pain.changed" && event.actorId === playerId && event.amount > 0);
  const groups = renderNarrativeGroups(context, events)
    .filter(({ sentences }) => sentences.length > 0);
  if (!groups.length) return emptyText ? [{ type: "text", text: emptyText }] : [];

  let changeGroupIndex = -1;
  if (painChange) {
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      if (groups[index].events.some((event) =>
        event.type === "impact.landed" && event.targetId === playerId)) {
        changeGroupIndex = index;
        break;
      }
    }
    if (changeGroupIndex < 0) changeGroupIndex = groups.length - 1;
  }

  const parts = [];
  for (const [index, group] of groups.entries()) {
    parts.push({
      type: "text",
      text: `${parts.length ? " " : ""}${group.sentences.join(" ")}`,
    });
    if (index === changeGroupIndex) {
      parts.push({ type: "change", change: painChangeFeedback(painChange) });
    }
  }
  return parts;
}

export function renderLastExchangeParts(context) {
  return renderExchangeParts(context, context.state.lastEvents, {
    emptyText: EMPTY_EXCHANGE_PROSE,
  });
}

const TERMINAL_RESOLUTION_EVENT_TYPES = new Set([
  "beat-down.completed",
  "encounter.ended",
  "escape.completed",
  "help.heard",
  "participant.unable-to-act",
  "surrender.completed",
  "theft.completed",
  "theft.empty",
]);

/**
 * Preserve the actions and mechanical results from the exchange that ended an
 * encounter without repeating the outcome events covered by renderTerminal().
 */
export function renderTerminalExchange(context) {
  const events = terminalExchangeEvents(context);
  const sentences = renderNarrativeEvents(context, events);
  return sentences.join(" ");
}

function terminalExchangeEvents(context) {
  const events = context.state.lastEvents;
  const hasTerminalTransition = events.some((event) =>
    ["escape.completed", "help.heard", "surrender.completed"].includes(event.type));
  const isTerminalAction = (actionId) =>
    getEncounterAction(actionId)?.tags.includes("terminal");
  return events.filter((event) => {
      if (TERMINAL_RESOLUTION_EVENT_TYPES.has(event.type)) return false;
      if (event.type === "range.changed"
        && event.to === ENCOUNTER_RANGE.far
        && hasTerminalTransition) return false;
      if (event.type === "action.attempted") return !isTerminalAction(event.actionId);
      if (event.type === "action.spoiled") {
        return !isTerminalAction(event.actionId)
          && !isTerminalAction(event.spoiledByActionId);
      }
      return true;
    });
}

export function renderTerminalExchangeParts(context) {
  return renderExchangeParts(context, terminalExchangeEvents(context));
}

export function renderObjectivePressure(context) {
  const commitment = getCommitmentBand(context);
  return requireEncounterObjective(context.state).renderPressure(context, commitment);
}

export function renderIntent(context) {
  const intent = context.state.npcIntent;
  return intentDisplayProse(
    context,
    intent,
    actionDurationSeconds({ actionId: intent.actionId }),
  );
}

export function renderSituationTable(context) {
  const playerId = controlledParticipantId(context.state);
  const opponentId = opponentParticipantId(context.state, playerId);
  return {
    type: "table",
    caption: "Current situation",
    columns: ["State", "You", getCombatant(context, opponentId).title],
    rows: [
      ["Position", situationPositionProse(context, playerId), situationPositionProse(context, opponentId)],
      ["Condition", situationConditionProse(context, playerId), situationConditionProse(context, opponentId)],
    ],
  };
}

function situationDetails(text) {
  return text
    .split("; ")
    .map((detail) => `${detail[0].toLowerCase()}${detail.slice(1)}`);
}

function flowingSituationDetails(details) {
  if (details.length < 2) return details[0];
  if (details.length === 2) return `${details[0]} and ${details[1]}`;
  return `${details.slice(0, -1).join(", ")}, and ${details.at(-1)}`;
}

function actorSituationProse(context, actorId) {
  const position = situationDetails(situationPositionProse(context, actorId));
  const condition = situationDetails(situationConditionProse(context, actorId));
  const positionText = position.length === 2
    ? `${position[0]} ${position[1]}`
    : position.join(", ");
  return `${positionText}, ${flowingSituationDetails(condition)}`;
}

export function renderSituationProse(context) {
  const playerId = controlledParticipantId(context.state);
  const opponentId = opponentParticipantId(context.state, playerId);
  const opponent = getCombatant(context, opponentId).title;
  return `You are ${actorSituationProse(context, playerId)}. ${opponent} is ${actorSituationProse(context, opponentId)}.`;
}
