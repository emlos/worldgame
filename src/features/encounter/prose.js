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
  ENCOUNTER_POSE,
  ENCOUNTER_RANGE,
  getEncounterFacing,
  getEncounterRange,
} from "./state.js";
import { capitalizeEncounterText, encounterPronoun, encounterVerb } from "./language.js";
import {
  controlledParticipantId,
  opponentParticipantId,
} from "./roles.js";
import { requireEncounterObjective } from "./objectives/index.js";

const isControlled = (context, actorId) =>
  actorId === controlledParticipantId(context.state);

function actorName(context, actorId, { sentence = false, possessive = false } = {}) {
  return encounterPronoun(context, actorId, possessive ? "dependent" : "subject", { sentence });
}

function wristName(partId) {
  return partId === BodyPartId.LOWER_ARM_L ? "left wrist" : "right wrist";
}

function sideName(partId) {
  return partId?.endsWith("_l") ? "left" : "right";
}

function brokenPartText(context, event) {
  const partName = getCombatant(context, event.actorId).body
    .getPart(event.partId)?.displayName?.toLowerCase() || "limb";
  const isLimb = /_(l|r)$/.test(event.partId);
  if (isControlled(context, event.actorId)) {
    return isLimb
      ? `You feel your ${partName} snap. The pain is blinding; you can no longer use it.`
      : `Something in your ${partName} breaks with a sickening crack. The pain is blinding.`;
  }
  const possessive = encounterPronoun(context, event.actorId, "dependent", { sentence: true });
  const subject = encounterPronoun(context, event.actorId, "subject", { sentence: true });
  return isLimb
    ? `${possessive} ${partName} turns at an unnatural angle with a sickening snap. ${subject} can no longer use it.`
    : `A sickening crack comes from ${encounterPronoun(context, event.actorId, "dependent")} ${partName}. ${subject} reels from the break.`;
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
    "catch-breath": ["ease back to catch your breath", `eases back to catch ${encounterPronoun(context, event.actorId, "dependent")} breath`],
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
    "surrender-money": ["offer your money and stop resisting", "offers the money and stops resisting"],
    "controlled-disengage": ["release your holds and spring away", "releases the holds and springs away"],
    "demand-money-back": ["demand your stolen money back", "demands the stolen money back"],
  };
  const forms = phrases[event.actionId] || ["act", "acts"];
  return `${actor} ${encounterVerb(context, event.actorId, forms[1], forms[0])}.`;
}

function missedActionText(context, event) {
  const actorId = event.actorId;
  const targetId = event.targetId || opponentParticipantId(context.state, actorId);
  const actor = actorName(context, actorId, { sentence: true });
  const target = actorName(context, targetId, { sentence: true });
  const targetDependent = encounterPronoun(context, targetId, "dependent");

  if (isControlled(context, actorId)) {
    switch (event.actionId) {
      case "strike-face":
        return `${target} ${encounterVerb(context, targetId, "pulls", "pull")} clear, and your strike cuts past ${targetDependent} face.`;
      case "drive-body":
        return `${target} ${encounterVerb(context, targetId, "shifts", "shift")} away before you can drive the blow into ${targetDependent} body.`;
      case "strike-holding-arm":
        return "You cannot land cleanly on the limb maintaining the hold.";
      case "headbutt":
        return `${target} ${encounterVerb(context, targetId, "draws", "draw")} back, leaving your headbutt short.`;
      default:
        return `${target} ${encounterVerb(context, targetId, "moves", "move")} clear, and your attack misses.`;
    }
  }

  switch (event.actionId) {
    case "strike-face":
      return `${actor} ${encounterVerb(context, actorId, "strikes", "strike")} at your face, but you pull clear.`;
    case "drive-body":
      return `${actor} ${encounterVerb(context, actorId, "drives", "drive")} a blow toward your body, but you shift out of its path.`;
    case "strike-holding-arm":
      return `${actor} cannot land cleanly on the limb maintaining your hold.`;
    case "headbutt":
      return `${actor} ${encounterVerb(context, actorId, "lunges", "lunge")} with a headbutt, but you draw back in time.`;
    default:
      return `${actor} ${encounterVerb(context, actorId, "attacks", "attack")}, but you move clear.`;
  }
}

function actionFailureText(context, event) {
  const actorId = event.actorId;
  const targetId = event.targetId || opponentParticipantId(context.state, actorId);
  const actor = actorName(context, actorId, { sentence: true });
  const target = actorName(context, targetId, { sentence: true });
  const actorDependent = encounterPronoun(context, actorId, "dependent");
  const targetDependent = encounterPronoun(context, targetId, "dependent", { sentence: true });
  const actorIsPlayer = isControlled(context, actorId);

  switch (event.reason) {
    case "missed":
      return missedActionText(context, event);
    case "grip-missed":
      return actorIsPlayer
        ? `${target} ${encounterVerb(context, targetId, "snatches", "snatch")} ${encounterPronoun(context, targetId, "dependent")} wrist clear before your hand can close around it.`
        : `${actor} ${encounterVerb(context, actorId, "reaches", "reach")} for your wrist, but you pull it clear.`;
    case "hold-gone":
      return actorIsPlayer
        ? "The hold is already gone before you can finish using it for leverage."
        : `${actor} ${encounterVerb(context, actorId, "loses", "lose")} the hold before ${encounterPronoun(context, actorId, "subject")} can finish using it for leverage.`;
    case "partly-freed":
      return actorIsPlayer
        ? "You tear one arm free, but the remaining grip still holds you."
        : `${actor} ${encounterVerb(context, actorId, "tears", "tear")} one arm free, but the remaining grip still holds ${encounterPronoun(context, actorId, "object")}.`;
    case "grip-held":
      return actorIsPlayer
        ? "The grip on your arm is too secure; you cannot wrench yourself free."
        : `${targetDependent} grip is too secure for ${encounterPronoun(context, actorId, "object")} to wrench free.`;
    case "position-held":
      return actorIsPlayer
        ? `${target} ${encounterVerb(context, targetId, "keeps", "keep")} ${encounterPronoun(context, targetId, "dependent")} footing and ${encounterVerb(context, targetId, "denies", "deny")} you the leverage to force ${encounterPronoun(context, targetId, "object")} back.`
        : "You keep your footing and deny the attempt to force you against the wall.";
    case "takedown-resisted":
      return actorIsPlayer
        ? `${target} ${encounterVerb(context, targetId, "stays", "stay")} under ${encounterPronoun(context, targetId, "dependent")} balance and ${encounterVerb(context, targetId, "resists", "resist")} your attempt to take ${encounterPronoun(context, targetId, "object")} down.`
        : "You keep your balance and resist the attempt to drag you to the ground.";
    case "turn-resisted":
      return actorIsPlayer
        ? `${target} ${encounterVerb(context, targetId, "braces", "brace")} against your control and ${encounterVerb(context, targetId, "refuses", "refuse")} to be turned away.`
        : "You brace against the hold and keep yourself facing the threat.";
    case "pin-resisted":
      return actorIsPlayer
        ? `${target} ${encounterVerb(context, targetId, "shifts", "shift")} before you can settle enough weight to pin ${encounterPronoun(context, targetId, "dependent")} arm.`
        : "You shift the restrained arm before it can be pinned in place.";
    case "lost-balance":
      return actorIsPlayer
        ? "Your footing gives way as you raise your knee, forcing you to abandon the strike."
        : `${actor} ${encounterVerb(context, actorId, "loses", "lose")} ${actorDependent} footing while raising a knee and ${encounterVerb(context, actorId, "has", "have")} to abandon the strike.`;
    case "held-ground":
      return actorIsPlayer
        ? `${target} ${encounterVerb(context, targetId, "absorbs", "absorb")} the shove and ${encounterVerb(context, targetId, "holds", "hold")} ${encounterPronoun(context, targetId, "dependent")} ground.`
        : "You absorb the shove and hold your ground.";
    case "could-not-disengage":
      return actorIsPlayer
        ? "The hold checks your movement before you can open a gap."
        : `${actor} cannot open a gap while your hold keeps ${encounterPronoun(context, actorId, "object")} close.`;
    case "kept-down":
      return actorIsPlayer
        ? `${targetDependent} control keeps you from getting your feet underneath you.`
        : `Your control keeps ${encounterPronoun(context, actorId, "object")} from getting back to ${actorDependent} feet.`;
    case "turn-blocked":
      return actorIsPlayer
        ? `${targetDependent} hold stops you before you can turn into a safer position.`
        : `Your hold stops ${encounterPronoun(context, actorId, "object")} from turning into a safer position.`;
    case "could-not-close":
      return actorIsPlayer
        ? `${target} ${encounterVerb(context, targetId, "keeps", "keep")} enough distance that you cannot close the gap.`
        : "You keep enough distance that the attacker cannot close the gap.";
    case "disengage-anticipated":
      return `${target} ${encounterVerb(context, targetId, "reads", "read")} your movement and stays close enough to stop you springing clear.`;
    case "demand-refused":
      return `${target} ${encounterVerb(context, targetId, "refuses", "refuse")} and keeps hold of your money.`;
    case "too-winded":
      return actorIsPlayer
        ? "You are too winded to put force behind it, and the attempt dies immediately."
        : `${actor} ${encounterVerb(context, actorId, "is", "are")} too winded to put force behind it, and the attempt dies immediately.`;
    case "too-dazed":
      return actorIsPlayer
        ? "Your daze ruins the coordination, and the attempt falls apart."
        : `${actor} cannot coordinate the movement through the daze, and the attempt falls apart.`;
    case "too-exhausted":
      return actorIsPlayer
        ? "Your exhausted body cannot finish the effort."
        : `${actor} cannot force ${actorDependent} exhausted body through the effort.`;
    default:
      return actorIsPlayer
        ? "Your attempt fails before it can change the situation."
        : `${actor} fails to change the situation.`;
  }
}

function qualitativeOddsText(event) {
  if (!Number.isFinite(event.chance)) return "";
  if (event.chance < 0.35) return "The odds were poor. ";
  if (event.chance < 0.55) return "The contest was uncertain. ";
  if (event.chance < 0.75) return "The odds favored the attempt. ";
  return "The odds strongly favored the attempt. ";
}

function spoiledActionText(context, event) {
  const actorId = event.actorId;
  const spoilerId = event.spoiledByActorId;
  if (!spoilerId) {
    return `${actorName(context, actorId, { sentence: true })} ${encounterVerb(context, actorId, "loses", "lose")} the chance to finish the slower action.`;
  }

  const spoiler = actorName(context, spoilerId, { sentence: true });
  if (isControlled(context, actorId)) {
    if (event.actionId === "run" && event.spoiledByActionId === "close-distance") {
      return `${spoiler} ${encounterVerb(context, spoilerId, "closes", "close")} the gap before you can break away.`;
    }
    return `${spoiler} ${encounterVerb(context, spoilerId, "acts", "act")} first and ${encounterVerb(context, spoilerId, "changes", "change")} the situation before you can finish.`;
  }
  if (isControlled(context, spoilerId)) {
    if (event.spoiledByActionId === "surrender-money") {
      const attacker = actorName(context, actorId, { sentence: true });
      return `${attacker} ${encounterVerb(context, actorId, "accepts", "accept")} your surrender instead of continuing the attack.`;
    }
    if (event.actionId === "search-money") {
      return `You break ${encounterPronoun(context, actorId, "dependent")} control before ${encounterPronoun(context, actorId, "subject")} can reach your money.`;
    }
    if (event.actionId === "grab-arm") {
      return `You move out of reach before ${encounterPronoun(context, actorId, "subject")} can secure the grab.`;
    }
    return `You act first and change the situation before ${encounterPronoun(context, actorId, "subject")} can finish.`;
  }
  return `${spoiler} ${encounterVerb(context, spoilerId, "acts", "act")} first and ${encounterVerb(context, spoilerId, "changes", "change")} the situation before ${encounterPronoun(context, actorId, "subject")} can finish.`;
}

function eventText(context, event) {
  const objectiveText = requireEncounterObjective(context.state).renderEvent(context, event);
  if (objectiveText !== null) return objectiveText;
  switch (event.type) {
    case "action.attempted":
      return actionAttemptText(context, event);
    case "action.failed":
      return `${qualitativeOddsText(event)}${actionFailureText(context, event)}`;
    case "action.spoiled":
      return spoiledActionText(context, event);
    case "state.change-conflicted":
      return "The opposing movements cancel each other out.";
    case "defense.braced":
      return `${actorName(context, event.actorId, { sentence: true })} ${encounterVerb(context, event.actorId, "is", "are")} ready for the impact.`;
    case "exertion.recovered":
      return isControlled(context, event.actorId)
        ? "You slow your breathing and recover some strength."
        : `${actorName(context, event.actorId, { sentence: true })} ${encounterVerb(context, event.actorId, "slows", "slow")} ${encounterPronoun(context, event.actorId, "dependent")} breathing and ${encounterVerb(context, event.actorId, "recovers", "recover")} some strength.`;
    case "acute.eased":
      if (event.id !== "winded") return "";
      return isControlled(context, event.actorId)
        ? "Your breath begins to come back."
        : `${actorName(context, event.actorId, { sentence: true })} ${encounterVerb(context, event.actorId, "gets", "get")} ${encounterPronoun(context, event.actorId, "dependent")} breath partly under control.`;
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
    case "injury.broken":
      return brokenPartText(context, event);
    case "acute.applied": {
      const description = event.id === "winded"
        ? `${encounterVerb(context, event.actorId, "loses", "lose")} ${encounterPronoun(context, event.actorId, "dependent")} breath`
        : event.id === "off-balance"
          ? `${encounterVerb(context, event.actorId, "staggers", "stagger")} off balance`
          : `${encounterVerb(context, event.actorId, "reels", "reel")}, dazed`;
      if (isControlled(context, event.actorId)) {
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
    case "hold.downgraded":
      return "The pin slips, leaving only a wrist grip.";
    case "hold.pinned":
      return `${actorName(context, event.controllerId, { sentence: true })} ${encounterVerb(context, event.controllerId, "pins", "pin")} ${actorName(context, event.targetId, { possessive: true })} ${sideName(event.targetPartId)} arm.`;
    case "hold.priority-resolved": {
      const winner = actorName(context, event.winnerId, { sentence: true });
      if (event.basis === "exertion") {
        return `${winner} ${encounterVerb(context, event.winnerId, "is", "are")} fresher and ${encounterVerb(context, event.winnerId, "wins", "win")} the simultaneous struggle for a wrist.`;
      }
      if (event.basis === "fitness") {
        return `${winner} ${encounterVerb(context, event.winnerId, "moves", "move")} first and ${encounterVerb(context, event.winnerId, "secures", "secure")} the wrist.`;
      }
      if (event.basis === "strength") {
        return `${winner} ${encounterVerb(context, event.winnerId, "overpowers", "overpower")} the competing grab and ${encounterVerb(context, event.winnerId, "secures", "secure")} the wrist.`;
      }
      return `${winner} ${encounterVerb(context, event.winnerId, "wins", "win")} the split-second scramble and ${encounterVerb(context, event.winnerId, "secures", "secure")} the wrist.`;
    }
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
        return isControlled(context, event.actorId)
          ? "You get back to your feet."
          : `${actorName(context, event.actorId, { sentence: true })} ${encounterVerb(context, event.actorId, "gets", "get")} back to ${encounterPronoun(context, event.actorId, "dependent")} feet.`;
      }
      if (event.to === ENCOUNTER_POSE.kneeling) {
        return `${actorName(context, event.actorId, { sentence: true })} ${encounterVerb(context, event.actorId, "drops", "drop")} to a knee.`;
      }
      if (isControlled(context, event.actorId)) {
        return `You go ${event.to === ENCOUNTER_POSE.prone ? "face-down" : "onto your back"}.`;
      }
      return `${actorName(context, event.actorId, { sentence: true })} ${encounterVerb(context, event.actorId, "goes", "go")} ${event.to === ENCOUNTER_POSE.prone ? "face-down" : `onto ${encounterPronoun(context, event.actorId, "dependent")} back`}.`;
    }
    case "facing.changed":
      return event.to === ENCOUNTER_FACING.away
        ? `${actorName(context, event.actorId, { sentence: true })} ${encounterVerb(context, event.actorId, "is", "are")} turned away.`
        : `${actorName(context, event.actorId, { sentence: true })} ${encounterVerb(context, event.actorId, "turns", "turn")} to face the other again.`;
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
  const commitment = getCommitmentBand(context);
  return requireEncounterObjective(context.state).renderPressure(context, commitment);
}

export function renderIntent(context) {
  const intent = context.state.npcIntent;
  const subject = encounterPronoun(context, intent.actorId, "subject", { sentence: true });
  return `${subject} ${intentLabel(context, intent)}. ${actionDurationSeconds({
    actionId: intent.actionId,
  })} seconds.`;
}

export function renderSituationTable(context) {
  const playerId = controlledParticipantId(context.state);
  const opponentId = opponentParticipantId(context.state, playerId);
  return {
    type: "table",
    caption: "Current situation",
    columns: ["State", "You", getCombatant(context, opponentId).title],
    rows: [
      ["Position", positionText(context, playerId), positionText(context, opponentId)],
      ["Condition", conditionText(context, playerId), conditionText(context, opponentId)],
    ],
  };
}

export function outcomeText(context) {
  return requireEncounterObjective(context.state).renderOutcome(context);
}
