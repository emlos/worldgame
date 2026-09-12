import { BodyPartId, InjuryCondition } from "../../characters/core/body.js";
import { actionDurationSeconds, intentLabel } from "./availability.js";
import { getCommitmentBand } from "./ai.js";
import {
  getBodyPain,
  getCombatant,
  getEffectiveHoldLeverage,
  getParticipant,
  holdsControlledBy,
  hostileHoldsOn,
  isDazed,
  isOffBalance,
  isWinded,
} from "./combatants.js";
import {
  ENCOUNTER_FACING,
  ENCOUNTER_OUTCOME,
  ENCOUNTER_POSE,
  ENCOUNTER_RANGE,
  getEncounterFacing,
  getEncounterRange,
} from "./state.js";
import { capitalizeEncounterText, encounterPronoun, encounterVerb } from "./language.js";

function actorName(context, actorId, { sentence = false, possessive = false } = {}) {
  return encounterPronoun(context, actorId, possessive ? "dependent" : "subject", { sentence });
}

function wristName(partId) {
  return partId === BodyPartId.LOWER_ARM_L ? "left wrist" : "right wrist";
}

function sideName(partId) {
  return partId?.endsWith("_l") ? "left" : "right";
}

function poseText(context, actorId, pose) {
  if (pose === ENCOUNTER_POSE.supine) {
    return `on ${encounterPronoun(context, actorId, "dependent")} back`;
  }
  if (pose === ENCOUNTER_POSE.prone) return "face-down";
  return pose;
}

function rangeText(state) {
  switch (getEncounterRange(state)) {
    case ENCOUNTER_RANGE.far:
      return "several steps apart";
    case ENCOUNTER_RANGE.reach:
      return "at arm's reach";
    case ENCOUNTER_RANGE.clinch:
      return "locked at close range";
    default:
      return "at an unclear distance";
  }
}

function positionText(context, actorId) {
  const participant = getParticipant(context, actorId);
  const facing = getEncounterFacing(context.state, actorId);
  const details = [poseText(context, actorId, participant.pose)];
  if (participant.support === "wall") {
    details.push(facing === ENCOUNTER_FACING.away ? "facing the wall" : "back against the wall");
  } else if (facing === ENCOUNTER_FACING.away) details.push("turned away");
  else if (facing === ENCOUNTER_FACING.side) details.push("side-on");
  const held = hostileHoldsOn(context, actorId);
  for (const hold of held) {
    details.push(hold.kind === "limb-pin"
      ? `${sideName(hold.targetPartId)} arm pinned`
      : `${wristName(hold.targetPartId)} held`);
  }
  const controlling = holdsControlledBy(context, actorId);
  for (const hold of controlling) {
    details.push(hold.kind === "limb-pin"
      ? `pinning ${actorName(context, hold.targetId, { possessive: true })} ${sideName(hold.targetPartId)} arm`
      : `holding ${actorName(context, hold.targetId, { possessive: true })} ${wristName(hold.targetPartId)}`);
  }
  details.push(rangeText(context.state));
  return capitalizeEncounterText(details.join("; "));
}

function painText(pain) {
  if (pain === 0) return "unhurt";
  if (pain < 20) return "sore";
  if (pain < 45) return "hurting";
  if (pain < 75) return "badly hurt";
  return "in severe pain";
}

function exertionText(exertion) {
  if (exertion < 15) return "steady";
  if (exertion < 35) return "breathing harder";
  if (exertion < 60) return "breathing hard";
  return "close to exhaustion";
}

const INJURY_DESCRIPTIONS = Object.freeze([
  [InjuryCondition.BROKEN, "broken", 3],
  [InjuryCondition.WOUNDED, "wounded", 2],
  [InjuryCondition.BRUISED, "bruised", 1],
]);

function visibleInjuryText(context, actorId) {
  const injuries = [...getCombatant(context, actorId).body.allParts()]
    .map((part) => {
      const description = INJURY_DESCRIPTIONS.find(([condition]) =>
        part.conditions.has(condition));
      if (!description) return null;
      return {
        text: `${description[1]} ${part.displayName.toLowerCase()}`,
        severity: description[2],
        integrity: part.integrityRatio,
        pain: part.pain,
        id: part.id,
      };
    })
    .filter(Boolean)
    .sort((left, right) =>
      right.severity - left.severity
      || left.integrity - right.integrity
      || right.pain - left.pain
      || left.id.localeCompare(right.id));
  return injuries.slice(0, 2).map(({ text }) => text);
}

function conditionText(context, actorId) {
  const participant = getParticipant(context, actorId);
  const details = [painText(getBodyPain(context, actorId)), exertionText(participant.exertion)];
  details.push(...visibleInjuryText(context, actorId));
  if (isDazed(context, actorId)) details.push("dazed");
  if (isWinded(context, actorId)) details.push("winded");
  if (isOffBalance(context, actorId)) details.push("off balance");
  const holds = holdsControlledBy(context, actorId);
  if (holds.length) {
    const grip = Math.min(...holds.map((hold) => getEffectiveHoldLeverage(context, hold)));
    details.push(grip < 28 ? "grip slipping" : grip < 48 ? "grip unsteady" : "grip secure");
  }
  return capitalizeEncounterText(details.join("; "));
}

function actionAttemptText(context, event) {
  const actor = actorName(context, event.actorId, { sentence: true });
  const targetObject = encounterPronoun(context, event.targetId, "object");
  const targetPossessive = encounterPronoun(context, event.targetId, "dependent");
  const phrases = {
    "cover-and-brace": ["cover up and brace", "covers up and braces"],
    "strike-face": [`strike toward ${targetPossessive} face`, `strikes toward ${targetPossessive} face`],
    "drive-body": [`drive a blow toward ${targetPossessive} body`, `drives a blow toward ${targetPossessive} body`],
    "shove-away": [`try to shove ${targetObject} away`, `tries to shove ${targetObject} away`],
    "grab-arm": [`reach for ${targetPossessive} wrist`, `reaches for ${targetPossessive} wrist`],
    "strike-holding-arm": ["strike at the arm maintaining the hold", "strikes at the arm maintaining the hold"],
    "wrench-free": ["twist hard against the wrist hold", "twists hard against the wrist hold"],
    "create-distance": ["try to make room", "tries to make room"],
    "close-distance": ["lunge to close the gap", "lunges to close the gap"],
    run: ["turn and run", "turns and runs"],
    flee: ["break toward the street", "breaks toward the street"],
    "tighten-hold": ["reinforce the wrist hold", "reinforces the wrist hold"],
    "force-to-wall": [`try to drive ${targetObject} against the wall`, `tries to drive ${targetObject} against the wall`],
    "force-to-ground": [`try to force ${targetObject} to the ground`, `tries to force ${targetObject} to the ground`],
    "turn-target-away": [`try to turn ${targetObject} away`, `tries to turn ${targetObject} away`],
    "pin-limb": [`try to pin ${targetPossessive} restrained arm`, `tries to pin ${targetPossessive} restrained arm`],
    "stand-up": ["try to stand", "tries to stand"],
    "roll-toward": [`twist to face ${targetObject}`, `twists to face ${targetObject}`],
    headbutt: ["try a headbutt", "tries a headbutt"],
    "knee-strike": ["drive a knee toward the body", "drives a knee toward the body"],
    "search-money": [`reach for ${targetPossessive} money`, `reaches for ${targetPossessive} money`],
  };
  const forms = phrases[event.actionId] || ["act", "acts"];
  return `${actor} ${encounterVerb(context, event.actorId, forms[1], forms[0])}.`;
}

function eventText(context, event) {
  switch (event.type) {
    case "encounter.started":
      return `${getCombatant(context, "mugger").title} blocks the alley and ${encounterPronoun(context, "mugger", "subject")} ${encounterVerb(context, "mugger", "demands", "demand")} your money.`;
    case "action.attempted":
      return actionAttemptText(context, event);
    case "action.failed":
      return `${actorName(context, event.actorId, { sentence: true })} cannot make it work.`;
    case "action.spoiled":
      return `${actorName(context, event.actorId, { sentence: true })} ${encounterVerb(context, event.actorId, "loses", "lose")} the chance to finish the slower action.`;
    case "defense.braced":
      return `${actorName(context, event.actorId, { sentence: true })} ${encounterVerb(context, event.actorId, "is", "are")} ready for the impact.`;
    case "impact.landed": {
      const part = {
        [BodyPartId.FACE]: "face",
        [BodyPartId.HEAD]: "head",
        [BodyPartId.ABDOMEN]: "body",
        [BodyPartId.HAND_L]: "left hand",
        [BodyPartId.HAND_R]: "right hand",
        [BodyPartId.KNEE_L]: "left knee",
        [BodyPartId.KNEE_R]: "right knee",
      }[event.partId] || "limb";
      return `The blow lands on ${actorName(context, event.targetId, { possessive: true })} ${part}.`;
    }
    case "acute.applied": {
      const description = event.id === "winded"
        ? `${encounterVerb(context, event.actorId, "loses", "lose")} ${encounterPronoun(context, event.actorId, "dependent")} breath`
        : event.id === "off-balance"
          ? `${encounterVerb(context, event.actorId, "staggers", "stagger")} off balance`
          : `${encounterVerb(context, event.actorId, "reels", "reel")}, dazed`;
      if (event.actorId === "player") {
        return event.id === "winded"
          ? "You lose your breath."
          : event.id === "off-balance"
            ? "You stagger off balance."
            : "You reel, dazed.";
      }
      return `${actorName(context, event.actorId, { sentence: true })} ${description}.`;
    }
    case "hold.created":
      return `${actorName(context, event.controllerId, { sentence: true })} ${encounterVerb(context, event.controllerId, "catches", "catch")} ${actorName(context, event.targetId, { possessive: true })} ${wristName(event.targetPartId)}.`;
    case "hold.weakened":
      return "The wrist hold loosens.";
    case "hold.strengthened":
      return "The wrist hold tightens.";
    case "hold.broken":
      return event.kind === "limb-pin" ? "The pinned arm comes free." : "The wrist comes free.";
    case "hold.pinned":
      return `${actorName(context, event.controllerId, { sentence: true })} ${encounterVerb(context, event.controllerId, "pins", "pin")} ${actorName(context, event.targetId, { possessive: true })} ${sideName(event.targetPartId)} arm.`;
    case "range.changed":
      return event.to === ENCOUNTER_RANGE.far
        ? "A clear gap opens between you."
        : event.to === ENCOUNTER_RANGE.reach
          ? "The struggle opens to arm's reach."
          : "The gap collapses into a clinch.";
    case "support.changed":
      return event.to === "wall"
        ? `${actorName(context, event.actorId, { sentence: true })} ${encounterVerb(context, event.actorId, "is", "are")} forced back against the wall.`
        : `${actorName(context, event.actorId, { sentence: true })} ${encounterVerb(context, event.actorId, "moves", "move")} clear of the wall.`;
    case "pose.changed": {
      if (event.to === ENCOUNTER_POSE.standing) {
        return event.actorId === "player"
          ? "You get back to your feet."
          : `${actorName(context, event.actorId, { sentence: true })} ${encounterVerb(context, event.actorId, "gets", "get")} back to ${encounterPronoun(context, event.actorId, "dependent")} feet.`;
      }
      if (event.to === ENCOUNTER_POSE.kneeling) {
        return `${actorName(context, event.actorId, { sentence: true })} ${encounterVerb(context, event.actorId, "drops", "drop")} to a knee.`;
      }
      if (event.actorId === "player") {
        return `You go ${event.to === ENCOUNTER_POSE.prone ? "face-down" : "onto your back"}.`;
      }
      return `${actorName(context, event.actorId, { sentence: true })} ${encounterVerb(context, event.actorId, "goes", "go")} ${event.to === ENCOUNTER_POSE.prone ? "face-down" : `onto ${encounterPronoun(context, event.actorId, "dependent")} back`}.`;
    }
    case "facing.changed":
      return event.to === ENCOUNTER_FACING.away
        ? `${actorName(context, event.actorId, { sentence: true })} ${encounterVerb(context, event.actorId, "is", "are")} turned away.`
        : `${actorName(context, event.actorId, { sentence: true })} ${encounterVerb(context, event.actorId, "turns", "turn")} to face the other again.`;
    case "theft.completed":
      return `${encounterPronoun(context, "mugger", "subject", { sentence: true })} ${encounterVerb(context, "mugger", "tears", "tear")} away with £${event.amount}.`;
    case "theft.empty":
      return `${encounterPronoun(context, "mugger", "subject", { sentence: true })} ${encounterVerb(context, "mugger", "finds", "find")} nothing to take and ${encounterVerb(context, "mugger", "abandons", "abandon")} the attempt.`;
    case "escape.completed":
      return event.actorId === "player"
        ? "You reach the street and get clear."
        : `${encounterPronoun(context, "mugger", "subject", { sentence: true })} ${encounterVerb(context, "mugger", "turns", "turn")} and ${encounterVerb(context, "mugger", "runs", "run")} from the alley.`;
    default:
      return "";
  }
}

export function renderLastExchange(context) {
  const sentences = context.state.lastEvents
    .map((event) => eventText(context, event))
    .filter(Boolean);
  return sentences.length ? sentences.join(" ") : "Both of you hesitate for a moment.";
}

export function renderObjectivePressure(context) {
  const stage = context.state.objective.stage;
  const commitment = getCommitmentBand(context);
  if (stage === "access-money") {
    return `${encounterPronoun(context, "mugger", "dependent", { sentence: true })} control is enough to reach for your money. ${encounterPronoun(context, "mugger", "subject", { sentence: true })} ${encounterVerb(context, "mugger", "looks", "look")} ${commitment}.`;
  }
  return `${encounterPronoun(context, "mugger", "subject", { sentence: true })} still ${encounterVerb(context, "mugger", "needs", "need")} to control you before ${encounterPronoun(context, "mugger", "subject")} can take anything. ${encounterPronoun(context, "mugger", "subject", { sentence: true })} ${encounterVerb(context, "mugger", "looks", "look")} ${commitment}.`;
}

export function renderIntent(context) {
  const intent = context.state.npcIntent;
  const subject = encounterPronoun(context, "mugger", "subject", { sentence: true });
  return `${subject} ${intentLabel(context, intent)}. ${actionDurationSeconds({
    actionId: intent.actionId,
  })} seconds.`;
}

export function renderSituationTable(context) {
  return {
    type: "table",
    caption: "Current situation",
    columns: ["State", "You", getCombatant(context, "mugger").title],
    rows: [
      ["Position", positionText(context, "player"), positionText(context, "mugger")],
      ["Condition", conditionText(context, "player"), conditionText(context, "mugger")],
    ],
  };
}

export function outcomeText(context) {
  const state = context.state;
  const money = state.outcome?.moneyLost || 0;
  const subject = encounterPronoun(context, "mugger", "subject", { sentence: true });
  switch (state.outcome?.id) {
    case ENCOUNTER_OUTCOME.playerEscaped:
      return `You make it out of the alley before ${encounterPronoun(context, "mugger", "subject")} can catch you.`;
    case ENCOUNTER_OUTCOME.muggerFled:
      return `${subject} ${encounterVerb(context, "mugger", "decides", "decide")} the risk is no longer worth it and ${encounterVerb(context, "mugger", "flees", "flee")}.`;
    case ENCOUNTER_OUTCOME.muggerIncapacitated:
      return `${subject} can no longer continue the struggle. You are safe to leave.`;
    case ENCOUNTER_OUTCOME.theftPlayerConscious:
      return `${subject} ${encounterVerb(context, "mugger", "gets", "get")} away with £${money} while you are still conscious.`;
    case ENCOUNTER_OUTCOME.theftPlayerIncapacitated:
      return money > 0
        ? `By the time you can respond, ${encounterPronoun(context, "mugger", "subject")} has taken £${money} and gone.`
        : `By the time you can respond, ${encounterPronoun(context, "mugger", "subject")} has searched you, found nothing, and gone.`;
    default:
      return "The encounter is over.";
  }
}
