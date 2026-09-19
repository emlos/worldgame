import { BodyPartId, InjuryCondition } from "../../characters/core/body.js";
import {
  getBodyPain,
  getBodyPart,
  getCombatant,
  getEffectiveHoldLeverage,
  getParticipant,
  holdsControlledBy,
  hostileHoldsOn,
  isDazed,
  isOffBalance,
  isWinded,
} from "./combatants.js";
import { encounterPronoun, encounterVerb } from "./language.js";
import {
  controlledParticipantId,
  goalOwnerId,
  goalTargetId,
  opponentParticipantId,
} from "./roles.js";
import {
  ENCOUNTER_FACING,
  ENCOUNTER_POSE,
  ENCOUNTER_RANGE,
  getEncounterFacing,
  getEncounterRange,
} from "./spatialState.js";

const isControlled = (context, actorId) =>
  actorId === controlledParticipantId(context.state);

function actorName(context, actorId, { sentence = false, possessive = false } = {}) {
  return encounterPronoun(context, actorId, possessive ? "dependent" : "subject", { sentence });
}

function capitalize(text) {
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

export function grabArmProseVariants(context, attempted, result, { wrist } = {}) {
  const actor = actorName(context, attempted.actorId, { sentence: true });
  const actorPossessive = encounterPronoun(context, attempted.actorId, "dependent");
  const target = actorName(context, attempted.targetId, { sentence: true });
  const targetPossessive = encounterPronoun(context, attempted.targetId, "dependent");
  const playerActs = isControlled(context, attempted.actorId);

  if (result === "failed.grip-missed") {
    return playerActs
      ? [
        `${target} ${encounterVerb(context, attempted.targetId, "jerks", "jerk")} ${targetPossessive} wrist beyond your grasp.`,
        `Your hand closes on empty air as ${encounterPronoun(context, attempted.targetId, "subject")} ${encounterVerb(context, attempted.targetId, "snatches", "snatch")} ${targetPossessive} wrist back.`,
        `You lunge for ${targetPossessive} wrist, but ${encounterPronoun(context, attempted.targetId, "subject")} ${encounterVerb(context, attempted.targetId, "pulls", "pull")} it clear.`,
      ]
      : [
        `${actor} ${encounterVerb(context, attempted.actorId, "reaches", "reach")} for your wrist, but you whip it clear.`,
        `You twist away just before ${actorPossessive} hand can close around your wrist.`,
        `${actor} ${encounterVerb(context, attempted.actorId, "lunges", "lunge")} for your wrist and ${encounterVerb(context, attempted.actorId, "catches", "catch")} only air.`,
      ];
  }

  if (result === "success") {
    return playerActs
      ? [
        `You catch ${targetPossessive} ${wrist} and pull ${encounterPronoun(context, attempted.targetId, "object")} into a clinch.`,
        `Your hand closes around ${targetPossessive} ${wrist}, dragging the struggle into close quarters.`,
        `You seize ${targetPossessive} ${wrist} before ${encounterPronoun(context, attempted.targetId, "subject")} can pull away.`,
      ]
      : [
        `${actor} ${encounterVerb(context, attempted.actorId, "catches", "catch")} your ${wrist} and ${encounterVerb(context, attempted.actorId, "pulls", "pull")} you into a clinch.`,
        `${capitalize(actorPossessive)} hand closes around your ${wrist}, dragging you into close quarters.`,
        `${actor} ${encounterVerb(context, attempted.actorId, "seizes", "seize")} your ${wrist} before you can pull away.`,
      ];
  }

  return [];
}

export function wrenchFreeProseVariants(context, attempted, result, { wrist } = {}) {
  const actor = actorName(context, attempted.actorId, { sentence: true });
  const actorPossessive = encounterPronoun(context, attempted.actorId, "dependent");
  const targetPossessive = encounterPronoun(context, attempted.targetId, "dependent");
  const playerActs = isControlled(context, attempted.actorId);

  if (result === "partial") {
    return playerActs
      ? [
        "You rip one arm loose, but the other grip keeps you trapped.",
        "One wrist tears free; the remaining hold stops you escaping completely.",
        "You break half the restraint, only for the other grip to hold firm.",
      ]
      : [
        `${actor} ${encounterVerb(context, attempted.actorId, "tears", "tear")} one arm free, but the remaining grip keeps ${encounterPronoun(context, attempted.actorId, "object")} close.`,
        `One of ${actorPossessive} wrists comes loose; your other grip still holds.`,
        `${actor} ${encounterVerb(context, attempted.actorId, "breaks", "break")} half the restraint, but cannot escape the other hold.`,
      ];
  }

  if (result === "failed.grip-held") {
    return playerActs
      ? [
        `You wrench against ${targetPossessive} grip, but it refuses to give.`,
        "You twist hard; the grip bites down and keeps your wrist trapped.",
        "The hold shifts under your effort, but stays locked around your wrist.",
      ]
      : [
        `${actor} ${encounterVerb(context, attempted.actorId, "wrenches", "wrench")} against your grip, but it refuses to give.`,
        `${actor} ${encounterVerb(context, attempted.actorId, "twists", "twist")} hard; your grip keeps ${actorPossessive} wrist trapped.`,
        `Your hold shifts under ${actorPossessive} effort, but stays secure.`,
      ];
  }

  if (result === "success") {
    return playerActs
      ? [
        `You wrench your ${wrist} free and tear out of the hold.`,
        `A hard twist breaks the grip on your ${wrist}.`,
        `You rip your ${wrist} loose before the hold can tighten again.`,
      ]
      : [
        `${actor} ${encounterVerb(context, attempted.actorId, "wrenches", "wrench")} ${actorPossessive} ${wrist} free.`,
        `A hard twist breaks your grip on ${actorPossessive} ${wrist}.`,
        `${actor} ${encounterVerb(context, attempted.actorId, "rips", "rip")} ${actorPossessive} ${wrist} loose.`,
      ];
  }

  return [];
}

export function strikeProseVariants(context, attempted, result, { strike, part } = {}) {
  const actor = actorName(context, attempted.actorId, { sentence: true });
  const actorPossessive = encounterPronoun(context, attempted.actorId, "dependent");
  const target = actorName(context, attempted.targetId, { sentence: true });
  const targetPossessive = encounterPronoun(context, attempted.targetId, "dependent");
  const playerActs = isControlled(context, attempted.actorId);

  if (result === "failed.missed") {
    return playerActs
      ? [
        `${target} ${encounterVerb(context, attempted.targetId, "slips", "slip")} clear and your ${strike.possessive} cuts through empty space.`,
        `You commit to the ${strike.direct}, but ${encounterPronoun(context, attempted.targetId, "subject")} ${encounterVerb(context, attempted.targetId, "moves", "move")} beyond it.`,
        `Your ${strike.possessive} misses by inches as ${encounterPronoun(context, attempted.targetId, "subject")} ${encounterVerb(context, attempted.targetId, "pulls", "pull")} away.`,
      ]
      : [
        `${actor} ${encounterVerb(context, attempted.actorId, "commits", "commit")} to the ${strike.direct}, but you slip clear.`,
        `You turn aside and ${actorPossessive} ${strike.possessive} cuts through empty space.`,
        `${capitalize(actorPossessive)} ${strike.possessive} misses you by inches.`,
      ];
  }

  if (result === "success") {
    return playerActs
      ? [
        `Your ${strike.possessive} lands solidly on ${targetPossessive} ${part}.`,
        `You drive the ${strike.direct} into ${targetPossessive} ${part}.`,
        `${target} ${encounterVerb(context, attempted.targetId, "moves", "move")} too late; your ${strike.possessive} catches ${encounterPronoun(context, attempted.targetId, "object")} in the ${part}.`,
      ]
      : [
        `${capitalize(actorPossessive)} ${strike.possessive} lands solidly on your ${part}.`,
        `${actor} ${encounterVerb(context, attempted.actorId, "drives", "drive")} the ${strike.direct} into your ${part}.`,
        `You move too late; ${actorPossessive} ${strike.possessive} catches you in the ${part}.`,
      ];
  }

  return [];
}

export function braceProseVariants(context, attempted) {
  const actor = actorName(context, attempted.actorId, { sentence: true });
  const possessive = encounterPronoun(context, attempted.actorId, "dependent");
  return isControlled(context, attempted.actorId)
    ? [
      "You bring your guard up and brace for the impact.",
      "You set your feet and cover the vulnerable angles.",
      "You tighten your guard, ready to absorb the next hit.",
    ]
    : [
      `${actor} ${encounterVerb(context, attempted.actorId, "raises", "raise")} ${possessive} guard and ${encounterVerb(context, attempted.actorId, "braces", "brace")} for impact.`,
      `${actor} ${encounterVerb(context, attempted.actorId, "sets", "set")} ${possessive} feet and ${encounterVerb(context, attempted.actorId, "covers", "cover")} the vulnerable angles.`,
      `${actor} ${encounterVerb(context, attempted.actorId, "tightens", "tighten")} ${possessive} guard, ready for the next hit.`,
    ];
}

export function movementProseVariants(
  context,
  attempted,
  result,
  { destination = null, brokeHold = false } = {},
) {
  const actor = actorName(context, attempted.actorId, { sentence: true });
  const actorPossessive = encounterPronoun(context, attempted.actorId, "dependent");
  const target = actorName(context, attempted.targetId, { sentence: true });
  const playerActs = isControlled(context, attempted.actorId);
  const failed = result.startsWith("failed.");

  if (failed && attempted.actionId === "create-distance") {
    return playerActs
      ? [
        "You try to retreat, but the hold checks your movement.",
        "You strain for room and get none; the grip keeps you close.",
        "The moment you pull away, the restraint drags you back into reach.",
      ]
      : [
        `${actor} ${encounterVerb(context, attempted.actorId, "tries", "try")} to retreat, but your hold checks the movement.`,
        `${actor} ${encounterVerb(context, attempted.actorId, "strains", "strain")} for room; your grip keeps ${encounterPronoun(context, attempted.actorId, "object")} close.`,
        `The moment ${actor} ${encounterVerb(context, attempted.actorId, "pulls", "pull")} away, your restraint drags ${encounterPronoun(context, attempted.actorId, "object")} back.`,
      ];
  }

  if (failed && attempted.actionId === "close-distance") {
    return playerActs
      ? [
        `${target} ${encounterVerb(context, attempted.targetId, "matches", "match")} your advance and keeps the gap open.`,
        `You surge forward, but ${encounterPronoun(context, attempted.targetId, "subject")} ${encounterVerb(context, attempted.targetId, "stays", "stay")} beyond your reach.`,
        `The distance refuses to close as ${encounterPronoun(context, attempted.targetId, "subject")} ${encounterVerb(context, attempted.targetId, "gives", "give")} ground.`,
      ]
      : [
        `${actor} ${encounterVerb(context, attempted.actorId, "surges", "surge")} forward, but you keep beyond ${actorPossessive} reach.`,
        `You match ${actorPossessive} advance and preserve the gap.`,
        `${actor} ${encounterVerb(context, attempted.actorId, "lunges", "lunge")} after you; you give ground quickly enough to stay clear.`,
      ];
  }

  if (failed && attempted.actionId === "controlled-disengage") {
    return [
      `${target} ${encounterVerb(context, attempted.targetId, "reads", "read")} your release and crowds you before you can spring clear.`,
      `You let go and try to jump back, but ${encounterPronoun(context, attempted.targetId, "subject")} ${encounterVerb(context, attempted.targetId, "follows", "follow")} immediately.`,
      `Your sudden release earns no room; ${encounterPronoun(context, attempted.targetId, "subject")} ${encounterVerb(context, attempted.targetId, "stays", "stay")} with you.`,
    ];
  }

  if (!failed && attempted.actionId === "create-distance") {
    return playerActs
      ? [
        `You ${brokeHold ? "slip the hold and " : ""}retreat ${destination}.`,
        `You ${brokeHold ? "tear loose, then open" : "open"} the distance ${destination}.`,
        `${brokeHold ? "Breaking free, you" : "You"} force enough room to move ${destination}.`,
      ]
      : [
        `${actor} ${brokeHold ? `${encounterVerb(context, attempted.actorId, "slips", "slip")} the hold and ` : ""}${encounterVerb(context, attempted.actorId, "retreats", "retreat")} ${destination}.`,
        `${actor} ${brokeHold ? `${encounterVerb(context, attempted.actorId, "tears", "tear")} loose, then ` : ""}${encounterVerb(context, attempted.actorId, "opens", "open")} the distance ${destination}.`,
        `${brokeHold ? `Breaking free, ${actor.toLowerCase()}` : actor} ${encounterVerb(context, attempted.actorId, "forces", "force")} enough room to move ${destination}.`,
      ];
  }

  if (!failed && attempted.actionId === "close-distance") {
    return playerActs
      ? [
        `You rush the gap and drive the distance ${destination}.`,
        `You match every retreat until the distance collapses ${destination}.`,
        `A sudden advance carries you ${destination}.`,
      ]
      : [
        `${actor} ${encounterVerb(context, attempted.actorId, "rushes", "rush")} the gap and ${encounterVerb(context, attempted.actorId, "drives", "drive")} the distance ${destination}.`,
        `${actor} ${encounterVerb(context, attempted.actorId, "matches", "match")} your retreat until the distance collapses ${destination}.`,
        `${capitalize(actorPossessive)} sudden advance carries ${encounterPronoun(context, attempted.actorId, "object")} ${destination}.`,
      ];
  }

  if (!failed && attempted.actionId === "controlled-disengage") {
    return [
      `You release ${encounterPronoun(context, attempted.targetId, "object")} without warning and spring several steps clear.`,
      `You drop every hold and jump back before ${encounterPronoun(context, attempted.targetId, "subject")} can follow.`,
      "The instant you let go, you burst backward and open a safe gap.",
    ];
  }

  if (!failed && ["run", "flee"].includes(attempted.actionId)) {
    return playerActs
      ? [
        "You turn, sprint for the street, and get clear.",
        "You break into a run and leave the fight behind.",
        "You seize the opening and race out of reach.",
      ]
      : [
        `${actor} ${encounterVerb(context, attempted.actorId, "turns", "turn")} and ${encounterVerb(context, attempted.actorId, "sprints", "sprint")} out of reach.`,
        `${actor} ${encounterVerb(context, attempted.actorId, "breaks", "break")} into a run and ${encounterVerb(context, attempted.actorId, "leaves", "leave")} the fight behind.`,
        `${actor} ${encounterVerb(context, attempted.actorId, "seizes", "seize")} the opening and ${encounterVerb(context, attempted.actorId, "races", "race")} away.`,
      ];
  }

  return [];
}

export function positionProseVariants(context, attempted, result, { side } = {}) {
  const actor = actorName(context, attempted.actorId, { sentence: true });
  const actorPossessive = encounterPronoun(context, attempted.actorId, "dependent");
  const target = actorName(context, attempted.targetId, { sentence: true });
  const targetPossessive = encounterPronoun(context, attempted.targetId, "dependent");
  const targetObject = encounterPronoun(context, attempted.targetId, "object");
  const playerActs = isControlled(context, attempted.actorId);
  const failed = result.startsWith("failed.");

  if (failed && attempted.actionId === "force-to-ground") {
    return playerActs
      ? [
        `${target} ${encounterVerb(context, attempted.targetId, "drops", "drop")} ${targetPossessive} weight and fights off the takedown.`,
        `You pull for the ground, but ${encounterPronoun(context, attempted.targetId, "subject")} ${encounterVerb(context, attempted.targetId, "keeps", "keep")} ${targetPossessive} balance.`,
        `${target} ${encounterVerb(context, attempted.targetId, "widens", "widen")} ${targetPossessive} stance and refuses to go down.`,
      ]
      : [
        "You drop your weight and fight off the takedown.",
        `${actor} ${encounterVerb(context, attempted.actorId, "pulls", "pull")} for the ground, but you keep your balance.`,
        `You widen your stance and refuse to let ${encounterPronoun(context, attempted.actorId, "object")} drag you down.`,
      ];
  }

  if (failed && attempted.actionId === "stand-up") {
    return playerActs
      ? [
        `${capitalize(targetPossessive)} control folds you back down before you can stand.`,
        `You get one foot under you, but ${encounterPronoun(context, attempted.targetId, "subject")} ${encounterVerb(context, attempted.targetId, "forces", "force")} you down again.`,
        "You start to rise; the restraint kills the movement before you find your feet.",
      ]
      : [
        `Your control folds ${encounterPronoun(context, attempted.actorId, "object")} back down before ${encounterPronoun(context, attempted.actorId, "subject")} can stand.`,
        `${actor} ${encounterVerb(context, attempted.actorId, "gets", "get")} one foot underneath ${encounterPronoun(context, attempted.actorId, "reflexive")}, but you force ${encounterPronoun(context, attempted.actorId, "object")} down again.`,
        `${actor} ${encounterVerb(context, attempted.actorId, "starts", "start")} to rise; your restraint stops the movement.`,
      ];
  }

  if (!failed && attempted.actionId === "force-to-ground") {
    return playerActs
      ? [
        `You drag ${targetObject} off balance and drive ${targetObject} onto ${targetPossessive} back.`,
        `${target} ${encounterVerb(context, attempted.targetId, "loses", "lose")} ${targetPossessive} footing as you haul ${targetObject} to the ground.`,
        `You turn the wrist control into a takedown and follow ${targetObject} to the ground.`,
      ]
      : [
        `${actor} ${encounterVerb(context, attempted.actorId, "drags", "drag")} you off balance and ${encounterVerb(context, attempted.actorId, "drives", "drive")} you onto your back.`,
        `Your footing gives way as ${actor} ${encounterVerb(context, attempted.actorId, "hauls", "haul")} you to the ground.`,
        `${actor} ${encounterVerb(context, attempted.actorId, "turns", "turn")} the wrist control into a takedown and ${encounterVerb(context, attempted.actorId, "follows", "follow")} you down.`,
      ];
  }

  if (!failed && attempted.actionId === "stand-up") {
    return playerActs
      ? [
        "You plant a foot, push through the restraint, and regain your stance.",
        "You scramble back to your feet before you can be held down again.",
        "You force enough space to rise and square up again.",
      ]
      : [
        `${actor} ${encounterVerb(context, attempted.actorId, "plants", "plant")} a foot and ${encounterVerb(context, attempted.actorId, "regains", "regain")} ${actorPossessive} stance.`,
        `${actor} ${encounterVerb(context, attempted.actorId, "scrambles", "scramble")} back to ${actorPossessive} feet.`,
        `${actor} ${encounterVerb(context, attempted.actorId, "forces", "force")} enough space to rise and square up again.`,
      ];
  }

  if (!failed && attempted.actionId === "force-to-wall") {
    return playerActs
      ? [
        `You drive ${targetObject} backward until ${targetPossessive} back meets the wall.`,
        `The hold gives you the leverage to pin ${targetObject} against the wall.`,
        `You crowd ${targetObject} into the wall and take away the room to retreat.`,
      ]
      : [
        `${actor} ${encounterVerb(context, attempted.actorId, "drives", "drive")} you backward until your back meets the wall.`,
        `${capitalize(actorPossessive)} hold pins you against the wall.`,
        `${actor} ${encounterVerb(context, attempted.actorId, "crowds", "crowd")} you into the wall and takes away your room to retreat.`,
      ];
  }

  if (!failed && attempted.actionId === "turn-target-away") {
    return playerActs
      ? [
        `You torque the restrained arm and turn ${targetObject} away from you.`,
        `The wrist control lets you twist ${targetObject} around and take ${targetPossessive} sightline.`,
        `You pull ${targetObject} off-angle until ${encounterPronoun(context, attempted.targetId, "subject")} ${encounterVerb(context, attempted.targetId, "faces", "face")} away.`,
      ]
      : [
        `${actor} ${encounterVerb(context, attempted.actorId, "torques", "torque")} your restrained arm and ${encounterVerb(context, attempted.actorId, "turns", "turn")} you away.`,
        `${capitalize(actorPossessive)} wrist control twists you around and takes your sightline.`,
        `${actor} ${encounterVerb(context, attempted.actorId, "pulls", "pull")} you off-angle until you face away.`,
      ];
  }

  if (!failed && attempted.actionId === "pin-limb") {
    return playerActs
      ? [
        `You settle your weight onto ${targetPossessive} ${side} arm and pin it in place.`,
        `${capitalize(targetPossessive)} ${side} arm is trapped beneath your pressure.`,
        `You convert the wrist grip into a firm pin on ${targetPossessive} ${side} arm.`,
      ]
      : [
        `${actor} ${encounterVerb(context, attempted.actorId, "settles", "settle")} ${actorPossessive} weight onto your ${side} arm and ${encounterVerb(context, attempted.actorId, "pins", "pin")} it.`,
        `Your ${side} arm is trapped beneath ${actorPossessive} pressure.`,
        `${actor} ${encounterVerb(context, attempted.actorId, "converts", "convert")} the wrist grip into a firm arm pin.`,
      ];
  }

  return [];
}

export function beatDownEscapeProseVariants(context, ownerId) {
  return [
    `You escape before ${encounterPronoun(context, ownerId, "subject")} can finish beating you down.`,
    `You get beyond ${encounterPronoun(context, ownerId, "dependent")} reach and leave the attack behind.`,
    `You seize a route out and run until ${encounterPronoun(context, ownerId, "subject")} can no longer follow.`,
  ];
}

export function stealPlayerEscapeProseVariants(context, ownerId) {
  return [
    `You make it out of the alley before ${encounterPronoun(context, ownerId, "subject")} can catch you.`,
    `You reach the street with enough distance to leave ${encounterPronoun(context, ownerId, "object")} behind.`,
    "You break free of the alley and do not stop until the threat is well behind you.",
  ];
}

export function stealSurrenderProseVariants(context, ownerId, money) {
  const subject = encounterPronoun(context, ownerId, "subject", { sentence: true });
  if (money > 0) {
    return [
      `You surrender £${money}. ${subject} ${encounterVerb(context, ownerId, "takes", "take")} it and ${encounterVerb(context, ownerId, "leaves", "leave")} without continuing the fight.`,
      `You hand over £${money} and stop resisting. ${subject} ${encounterVerb(context, ownerId, "pockets", "pocket")} the money, then ${encounterVerb(context, ownerId, "backs", "back")} away.`,
      `The struggle ends when you give up £${money}. Satisfied, ${encounterPronoun(context, ownerId, "subject")} ${encounterVerb(context, ownerId, "releases", "release")} you and ${encounterVerb(context, ownerId, "leaves", "leave")} the alley.`,
    ];
  }
  return [
    `You stop resisting and show your empty pockets. Finding nothing to take, ${encounterPronoun(context, ownerId, "subject")} ${encounterVerb(context, ownerId, "lets", "let")} you go and ${encounterVerb(context, ownerId, "leaves", "leave")} the alley.`,
    `You give in and turn out your empty pockets. With nothing to steal, ${encounterPronoun(context, ownerId, "subject")} ${encounterVerb(context, ownerId, "abandons", "abandon")} the mugging.`,
    `You stop fighting and show that you have no money. ${subject} ${encounterVerb(context, ownerId, "finds", "find")} nothing worth staying for and ${encounterVerb(context, ownerId, "leaves", "leave")}.`,
  ];
}

export function stealMuggerFledProseVariants(context, ownerId) {
  const subject = encounterPronoun(context, ownerId, "subject", { sentence: true });
  return [
    `${subject} ${encounterVerb(context, ownerId, "decides", "decide")} the risk is no longer worth it and ${encounterVerb(context, ownerId, "flees", "flee")}.`,
    `${subject} ${encounterVerb(context, ownerId, "breaks", "break")} off the mugging and ${encounterVerb(context, ownerId, "runs", "run")} from the alley.`,
    `${subject} ${encounterVerb(context, ownerId, "abandons", "abandon")} the attack, putting distance between you before you can follow.`,
  ];
}


export function wristProseName(partId) {
  return partId === BodyPartId.LOWER_ARM_L ? "left wrist" : "right wrist";
}

export function sideProseName(partId) {
  return partId?.endsWith("_l") ? "left" : "right";
}

function poseProse(context, actorId, pose) {
  if (pose === ENCOUNTER_POSE.supine) {
    return `on ${encounterPronoun(context, actorId, "dependent")} back`;
  }
  if (pose === ENCOUNTER_POSE.prone) return "face-down";
  return pose;
}

function rangeProse(state) {
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

export function situationPositionProse(context, actorId) {
  const participant = getParticipant(context, actorId);
  const facing = getEncounterFacing(context.state, actorId);
  const details = [poseProse(context, actorId, participant.pose)];
  if (participant.support === "wall") {
    details.push(facing === ENCOUNTER_FACING.away ? "facing the wall" : "back against the wall");
  } else if (facing === ENCOUNTER_FACING.away) details.push("turned away");
  else if (facing === ENCOUNTER_FACING.side) details.push("side-on");
  for (const hold of hostileHoldsOn(context, actorId)) {
    details.push(hold.kind === "limb-pin"
      ? `${sideProseName(hold.targetPartId)} arm pinned`
      : `${wristProseName(hold.targetPartId)} held`);
  }
  for (const hold of holdsControlledBy(context, actorId)) {
    details.push(hold.kind === "limb-pin"
      ? `pinning ${actorName(context, hold.targetId, { possessive: true })} ${sideProseName(hold.targetPartId)} arm`
      : `holding ${actorName(context, hold.targetId, { possessive: true })} ${wristProseName(hold.targetPartId)}`);
  }
  details.push(rangeProse(context.state));
  return capitalize(details.join("; "));
}

function painProse(pain) {
  if (pain === 0) return "unhurt";
  if (pain < 20) return "sore";
  if (pain < 45) return "hurting";
  if (pain < 75) return "badly hurt";
  return "in severe pain";
}

function exertionProse(exertion) {
  if (exertion < 15) return "steady";
  if (exertion < 35) return "breathing harder";
  if (exertion < 60) return "breathing hard";
  return "close to exhaustion";
}

const INJURY_PROSE = Object.freeze([
  [InjuryCondition.BRUISED, "bruised", 1],
]);

function visibleInjuryProse(context, actorId) {
  const injuries = [...getCombatant(context, actorId).body.allParts()]
    .map((part) => {
      const description = INJURY_PROSE.find(([condition]) => part.conditions.has(condition));
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

export function situationConditionProse(context, actorId) {
  const participant = getParticipant(context, actorId);
  const details = [painProse(getBodyPain(context, actorId)), exertionProse(participant.exertion)];
  details.push(...visibleInjuryProse(context, actorId));
  if (isDazed(context, actorId)) details.push("dazed");
  if (isWinded(context, actorId)) details.push("winded");
  if (isOffBalance(context, actorId)) details.push("off balance");
  const holds = holdsControlledBy(context, actorId);
  if (holds.length) {
    const grip = Math.min(...holds.map((hold) => getEffectiveHoldLeverage(context, hold)));
    details.push(grip < 28 ? "grip slipping" : grip < 48 ? "grip unsteady" : "grip secure");
  }
  return capitalize(details.join("; "));
}

function limbProseName(context, actorId, partId) {
  return getBodyPart(context, actorId, partId)?.displayName?.toLowerCase() || "limb";
}

export function actionIntentProse(context, intent) {
  const actorId = intent.actorId;
  const parameters = intent.parameters || {};
  const actorPossessive = encounterPronoun(context, actorId, "dependent");
  const sourcePart = limbProseName(context, actorId, parameters.sourcePartId);
  switch (intent.actionId) {
    case "too-tired-to-move": return "can barely move; exhaustion has left no strength for an attack";
    case "writhe-in-pain": return `${encounterVerb(context, actorId, "curls", "curl")} around the pain, unable to mount an attack`;
    case "catch-breath":
      return `${encounterVerb(context, actorId, "eases", "ease")} back behind a raised guard, trying to recover ${actorPossessive} breath`;
    case "cover-and-brace":
      return `${encounterVerb(context, actorId, "tucks", "tuck")} ${actorPossessive} chin, ${encounterVerb(context, actorId, "covers", "cover")} ${actorPossessive} head, and ${encounterVerb(context, actorId, "braces", "brace")} for your response`;
    case "scream-for-help": return `${encounterVerb(context, actorId, "draws", "draw")} breath to shout for anyone nearby`;
    case "rough-up":
      return `${encounterVerb(context, actorId, "draws", "draw")} ${actorPossessive} ${sourcePart} back, aiming a measured blow at your torso`;
    case "attack-limb":
      return `${encounterVerb(context, actorId, "sets", "set")} ${actorPossessive} ${sourcePart} and ${encounterVerb(context, actorId, "lines", "line")} up a heavy blow at your ${limbProseName(context, goalTargetId(context.state), parameters.targetPartId)}`;
    case "grab-arm":
      return `${encounterVerb(context, actorId, "opens", "open")} ${actorPossessive} ${sourcePart} and ${encounterVerb(context, actorId, "reaches", "reach")} for your ${sideProseName(parameters.targetPartId)} wrist`;
    case "wrench-free":
      return parameters.holdIds?.length > 1
        ? `${encounterVerb(context, actorId, "plants", "plant")} ${actorPossessive} feet and ${encounterVerb(context, actorId, "wrenches", "wrench")} against both arm holds at once`
        : `${encounterVerb(context, actorId, "turns", "turn")} into the wrist hold, preparing to twist hard against it`;
    case "tighten-hold": {
      const hold = holdsControlledBy(context, actorId).find(({ id }) => id === parameters.holdId);
      return hold?.kind === "limb-pin"
        ? `${encounterVerb(context, actorId, "shifts", "shift")} ${actorPossessive} balance and ${encounterVerb(context, actorId, "settles", "settle")} more weight onto your pinned arm`
        : `${encounterVerb(context, actorId, "slides", "slide")} ${actorPossessive} grip higher on your wrist, preparing to clamp down`;
    }
    case "force-to-wall":
      return `${encounterVerb(context, actorId, "turns", "turn")} ${actorPossessive} hips into the hold and ${encounterVerb(context, actorId, "drives", "drive")} toward the wall`;
    case "force-to-ground":
      return `${encounterVerb(context, actorId, "pulls", "pull")} your restrained arm off line and ${encounterVerb(context, actorId, "drops", "drop")} ${actorPossessive} weight for a takedown`;
    case "turn-target-away":
      return `${encounterVerb(context, actorId, "draws", "draw")} your captured arm across your body, trying to turn your back to ${encounterPronoun(context, actorId, "object")}`;
    case "pin-limb":
      return `${encounterVerb(context, actorId, "angles", "angle")} over your restrained arm, preparing to pin it with ${actorPossessive} ${limbProseName(context, actorId, parameters.pinSourcePartId)}`;
    case "shove-away":
      return `${encounterVerb(context, actorId, "sets", "set")} both hands against you and ${encounterVerb(context, actorId, "leans", "lean")} in for a hard shove`;
    case "create-distance":
      return `${encounterVerb(context, actorId, "turns", "turn")} side-on and ${encounterVerb(context, actorId, "edges", "edge")} back, looking for room to break contact`;
    case "stand-up":
      return `${encounterVerb(context, actorId, "plants", "plant")} ${actorPossessive} hands and a foot, gathering ${actorPossessive} weight to stand`;
    case "roll-toward":
      return `${encounterVerb(context, actorId, "tucks", "tuck")} an elbow and ${encounterVerb(context, actorId, "twists", "twist")} toward you to recover a safer facing`;
    case "close-distance":
      return `${encounterVerb(context, actorId, "leans", "lean")} forward and ${encounterVerb(context, actorId, "launches", "launch")} into the gap before you can get clear`;
    case "run": return `${encounterVerb(context, actorId, "checks", "check")} the open route, then ${encounterVerb(context, actorId, "turns", "turn")} to sprint for safety`;
    case "flee":
      return `${encounterVerb(context, actorId, "glances", "glance")} toward an escape route and ${encounterVerb(context, actorId, "loads", "load")} ${actorPossessive} weight to bolt`;
    case "strike-face":
      return `${encounterVerb(context, actorId, "draws", "draw")} ${actorPossessive} ${sourcePart} beside ${actorPossessive} cheek, lining the blow up with your face`;
    case "drive-body":
      return `${encounterVerb(context, actorId, "turns", "turn")} ${actorPossessive} ${sourcePart} inward and ${encounterVerb(context, actorId, "sets", "set")} ${actorPossessive} weight behind a blow to your abdomen`;
    case "strike-holding-arm": {
      const hold = hostileHoldsOn(context, actorId).find(({ id }) => id === parameters.holdId);
      const target = hold ? `${sideProseName(hold.sourcePartId)} limb` : "limb";
      return `${encounterVerb(context, actorId, "lines", "line")} up ${actorPossessive} ${sourcePart} with the ${target} controlling ${actorPossessive} wrist`;
    }
    case "headbutt":
      return `${encounterVerb(context, actorId, "draws", "draw")} ${actorPossessive} forehead back, sighting a short strike at your face`;
    case "knee-strike":
      return `${encounterVerb(context, actorId, "plants", "plant")} one foot and ${encounterVerb(context, actorId, "lifts", "lift")} ${actorPossessive} ${sourcePart}, aiming through your abdomen`;
    case "surrender-money": return `${encounterVerb(context, actorId, "keeps", "keep")} ${actorPossessive} hands visible and ${encounterVerb(context, actorId, "offers", "offer")} to hand over the money`;
    case "controlled-disengage": return `${encounterVerb(context, actorId, "loosens", "loosen")} ${actorPossessive} holds just enough to spring backward without warning`;
    case "demand-money-back": return `${encounterVerb(context, actorId, "keeps", "keep")} both wrists controlled and ${encounterVerb(context, actorId, "demands", "demand")} the stolen money back`;
    case "search-money":
      return `${encounterVerb(context, actorId, "leans", "lean")} into the restraint to keep you pinned while ${encounterPronoun(context, actorId, "dependent")} free hand reaches toward your pockets`;
    default:
      return `${encounterVerb(context, actorId, "shifts", "shift")} ${actorPossessive} stance, preparing an unfamiliar move`;
  }
}

export function actionAttemptProse(context, event) {
  const actor = actorName(context, event.actorId, { sentence: true });
  const targetObject = encounterPronoun(context, event.targetId, "object");
  const targetPossessive = encounterPronoun(context, event.targetId, "dependent");
  const phrases = {
    "too-tired-to-move": ["try to move, but your body will not answer", "tries to move, but cannot"],
    "writhe-in-pain": ["writhe in pain", "writhes in pain"],
    "cover-and-brace": ["cover up and brace", "covers up and braces"],
    "catch-breath": ["ease back to catch your breath", `eases back to catch ${encounterPronoun(context, event.actorId, "dependent")} breath`],
    "strike-face": [`strike toward ${targetPossessive} face`, `strikes toward ${targetPossessive} face`],
    "drive-body": [`drive a blow toward ${targetPossessive} body`, `drives a blow toward ${targetPossessive} body`],
    "rough-up": [`aim a restrained blow at ${targetPossessive} body`, `aims a restrained blow at ${targetPossessive} body`],
    "shove-away": [`try to shove ${targetObject} away`, `tries to shove ${targetObject} away`],
    "grab-arm": [`reach for ${targetPossessive} wrist`, `reaches for ${targetPossessive} wrist`],
    "strike-holding-arm": ["strike at the arm maintaining the hold", "strikes at the arm maintaining the hold"],
    "wrench-free": ["twist hard against the wrist hold", "twists hard against the wrist hold"],
    "create-distance": ["try to make room", "tries to make room"],
    "close-distance": ["lunge to close the gap", "lunges to close the gap"],
    run: ["turn and run", "turns and runs"],
    flee: ["break for an exit", "breaks for an exit"],
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
    "scream-for-help": ["scream for help", "screams for help"],
    "controlled-disengage": ["release your holds and spring away", "releases the holds and springs away"],
    "demand-money-back": ["demand your stolen money back", "demands the stolen money back"],
    "attack-limb": ["drive a blow at a limb", "drives a heavy blow at one of your limbs"],
  };
  const forms = phrases[event.actionId] || ["act", "acts"];
  return `${actor} ${encounterVerb(context, event.actorId, forms[1], forms[0])}.`;
}

function missedActionProse(context, event) {
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

export function actionFailureProse(context, event) {
  const actorId = event.actorId;
  const targetId = event.targetId || opponentParticipantId(context.state, actorId);
  const actor = actorName(context, actorId, { sentence: true });
  const target = actorName(context, targetId, { sentence: true });
  const actorDependent = encounterPronoun(context, actorId, "dependent");
  const targetDependent = encounterPronoun(context, targetId, "dependent", { sentence: true });
  const actorIsPlayer = isControlled(context, actorId);

  switch (event.reason) {
    case "missed": return missedActionProse(context, event);
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
    case "help-not-heard": return "Your scream goes unanswered; nobody comes to help.";
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

export function qualitativeOddsProse(event) {
  if (!Number.isFinite(event.chance)) return "";
  if (event.chance < 0.35) return "The odds were poor. ";
  if (event.chance < 0.55) return "The contest was uncertain. ";
  if (event.chance < 0.75) return "The odds favored the attempt. ";
  return "The odds strongly favored the attempt. ";
}

function lowercaseInitial(text) {
  return text ? `${text[0].toLowerCase()}${text.slice(1)}` : text;
}

export function withFailureOddsProse(event, text) {
  if (!Number.isFinite(event.chance)) return text;
  const lead = event.chance < 0.35
    ? "With only a narrow opening, "
    : event.chance < 0.55
      ? "In an even contest, "
      : event.chance < 0.75
        ? "Despite a promising opening, "
        : "Even with a clear opening, ";
  return `${lead}${lowercaseInitial(text)}`;
}

export function strikeProseDescription(actionId) {
  switch (actionId) {
    case "strike-face": return { possessive: "fist", direct: "strike" };
    case "drive-body": return { possessive: "body blow", direct: "body blow" };
    case "rough-up": return { possessive: "measured blow", direct: "measured blow" };
    case "strike-holding-arm": return { possessive: "counterstrike", direct: "counterstrike" };
    case "headbutt": return { possessive: "headbutt", direct: "headbutt" };
    case "knee-strike": return { possessive: "knee", direct: "knee strike" };
    default: return { possessive: "blow", direct: "blow" };
  }
}

export function impactPartProseName(partId) {
  return {
    [BodyPartId.FACE]: "face",
    [BodyPartId.HEAD]: "head",
    [BodyPartId.ABDOMEN]: "body",
    [BodyPartId.HAND_L]: "left hand",
    [BodyPartId.HAND_R]: "right hand",
    [BodyPartId.KNEE_L]: "left knee",
    [BodyPartId.KNEE_R]: "right knee",
  }[partId] || "limb";
}

export function distanceProseName(range) {
  if (range === ENCOUNTER_RANGE.far) return "several steps away";
  if (range === ENCOUNTER_RANGE.reach) return "back to arm's reach";
  return "into a clinch";
}

export function spoiledActionProse(context, event) {
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

export function genericEventProse(context, event) {
  switch (event.type) {
    case "action.attempted": return actionAttemptProse(context, event);
    case "action.failed": return `${qualitativeOddsProse(event)}${actionFailureProse(context, event)}`;
    case "action.spoiled": return spoiledActionProse(context, event);
    case "help.heard": return "Someone nearby hears you and calls out as they rush toward the fight.";
    case "state.change-conflicted": return "The opposing movements cancel each other out.";
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
    case "impact.landed":
      return `The blow lands on ${actorName(context, event.targetId, { possessive: true })} ${impactPartProseName(event.partId)}.`;
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
      return `${actorName(context, event.controllerId, { sentence: true })} ${encounterVerb(context, event.controllerId, "catches", "catch")} ${actorName(context, event.targetId, { possessive: true })} ${wristProseName(event.targetPartId)}.`;
    case "hold.weakened": return "The wrist hold loosens.";
    case "hold.strengthened": return "The wrist hold tightens.";
    case "hold.broken": return event.kind === "limb-pin" ? "The pinned arm comes free." : "The wrist comes free.";
    case "hold.downgraded": return "The pin slips, leaving only a wrist grip.";
    case "hold.pinned":
      return `${actorName(context, event.controllerId, { sentence: true })} ${encounterVerb(context, event.controllerId, "pins", "pin")} ${actorName(context, event.targetId, { possessive: true })} ${sideProseName(event.targetPartId)} arm.`;
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
    case "pose.changed":
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
    case "facing.changed":
      return event.to === ENCOUNTER_FACING.away
        ? `${actorName(context, event.actorId, { sentence: true })} ${encounterVerb(context, event.actorId, "is", "are")} turned away.`
        : `${actorName(context, event.actorId, { sentence: true })} ${encounterVerb(context, event.actorId, "turns", "turn")} to face the other again.`;
    default: return "";
  }
}

export const EMPTY_EXCHANGE_PROSE = "Both of you hesitate for a moment.";

export function commitmentBandProse(value, retreatThreshold) {
  if (value <= retreatThreshold) return "ready to run";
  if (value < 40) return "hesitating";
  if (value < 65) return "frustrated but committed";
  return "confident";
}

export function beatDownThreatProse(context) {
  const ownerId = goalOwnerId(context.state);
  return context.state.objective.stage === "escalated"
    ? `${encounterPronoun(context, ownerId, "subject", { sentence: true })} ${encounterVerb(context, ownerId, "has", "have")} lost all restraint and ${encounterVerb(context, ownerId, "intends", "intend")} to leave you unable to fight back.`
    : `${encounterPronoun(context, ownerId, "subject", { sentence: true })} ${encounterVerb(context, ownerId, "intends", "intend")} to hurt and humiliate you, but ${encounterVerb(context, ownerId, "is", "are")} still holding back.`;
}

export function beatDownPressureProse(context) {
  const ownerId = goalOwnerId(context.state);
  const objective = context.state.objective;
  const targetPain = getBodyPain(context, goalTargetId(context.state));
  const ownerPain = getBodyPain(context, ownerId);
  const anger = context.state.participants[ownerId].anger;
  const temper = anger >= objective.angerThreshold
    ? ` ${encounterPronoun(context, ownerId, "subject", { sentence: true })} ${encounterVerb(context, ownerId, "has", "have")} lost all restraint.`
    : anger >= 20
      ? ` ${encounterPronoun(context, ownerId, "subject", { sentence: true })} ${encounterVerb(context, ownerId, "looks", "look")} increasingly irritated.`
      : "";
  const persistence = ownerPain >= 45
    ? `Even badly hurt, ${encounterPronoun(context, ownerId, "subject")} ${encounterVerb(context, ownerId, "shows", "show")} no sign of backing off.`
    : `${encounterPronoun(context, ownerId, "subject", { sentence: true })} ${encounterVerb(context, ownerId, "shows", "show")} no sign of backing off.`;
  const pressureRatio = targetPain / objective.painThreshold;
  const pressure = targetPain <= 0
    ? ""
    : pressureRatio < 0.35
      ? "The pain is noticeable, but your body is still responding cleanly. "
      : pressureRatio < 0.7
        ? "The accumulated pain is beginning to interfere with your defence. "
        : pressureRatio < 1
          ? "The pain is close to overwhelming your ability to fight back. "
          : "The pain has reached the limit of what you can fight through. ";
  return `${pressure}${persistence}${temper}`;
}

export function beatDownEventProse(context, event) {
  const ownerId = goalOwnerId(context.state);
  switch (event.type) {
    case "encounter.started":
      return `${context.combatants[ownerId].title} advances with the clear intent of beating you down.`;
    case "participant.unable-to-act":
      if (event.actorId !== goalTargetId(context.state)) return null;
      if (event.reason === "energy-exhausted") {
        return "Your remaining energy gives out, leaving you unable to defend yourself.";
      }
      return event.reason === "already-incapacitated"
        ? "You are already unable to defend yourself when the attacker closes in."
        : "Your injuries leave you unable to continue defending yourself.";
    case "beat-down.completed":
      return event.cause === "pain-threshold"
        ? "The accumulated pain finally overwhelms your ability to fight back."
        : "You can no longer continue the fight.";
    case "beat-down.escalated":
      return "The hit wipes away what restraint the attacker had. This is no longer a light beating.";
    case "escape.completed":
      return event.actorId === controlledParticipantId(context.state)
        ? "You get clear before the attacker can finish the beating."
        : null;
    default: return null;
  }
}

export function beatDownTerminalStaticProse(context, outcome) {
  const ownerId = goalOwnerId(context.state);
  const subject = encounterPronoun(context, ownerId, "subject", { sentence: true });
  switch (outcome?.id) {
    case "player-rescued":
      return `Your call is answered. ${subject} ${encounterVerb(context, ownerId, "breaks", "break")} off the attack as help approaches.`;
    case "player-beaten-down":
      return outcome.cause === "pain-threshold"
        ? `Your pain reaches its limit. ${subject} ${encounterVerb(context, ownerId, "has", "have")} beaten you down.`
        : `You can no longer defend yourself. ${subject} ${encounterVerb(context, ownerId, "has", "have")} beaten you down.`;
    case "attacker-abandoned": return `${subject} abandons the attack and leaves.`;
    case "attacker-incapacitated": return `${subject} can no longer continue the attack. You are safe to leave.`;
    case "both-incapacitated": return "The fight leaves both of you unable to continue.";
    default: return "The fight is over.";
  }
}

export function stealThreatProse(context) {
  const ownerId = goalOwnerId(context.state);
  const objective = context.state.objective;
  if (objective.stage === "disengage") {
    return objective.lootAmount > 0
      ? `${encounterPronoun(context, ownerId, "subject", { sentence: true })} ${encounterVerb(context, ownerId, "has", "have")} £${objective.lootAmount} of your money and ${encounterVerb(context, ownerId, "is", "are")} trying to escape.`
      : `${encounterPronoun(context, ownerId, "subject", { sentence: true })} found nothing to take and ${encounterVerb(context, ownerId, "is", "are")} trying to leave.`;
  }
  return `${encounterPronoun(context, ownerId, "subject", { sentence: true })} ${encounterVerb(context, ownerId, "is", "are")} trying to take up to £${objective.amount}.`;
}

export function stealPressureProse(context, commitment) {
  const ownerId = goalOwnerId(context.state);
  const objective = context.state.objective;
  if (objective.stage === "access-money") {
    return `${encounterPronoun(context, ownerId, "dependent", { sentence: true })} control is enough to reach for your money. ${encounterPronoun(context, ownerId, "subject", { sentence: true })} ${encounterVerb(context, ownerId, "looks", "look")} ${commitment}.`;
  }
  if (objective.stage === "disengage") {
    return objective.lootAmount > 0
      ? `${encounterPronoun(context, ownerId, "subject", { sentence: true })} ${encounterVerb(context, ownerId, "has", "have")} your money but still ${encounterVerb(context, ownerId, "needs", "need")} to get away with it.`
      : `${encounterPronoun(context, ownerId, "subject", { sentence: true })} found nothing and ${encounterVerb(context, ownerId, "is", "are")} looking for a way out.`;
  }
  return `${encounterPronoun(context, ownerId, "subject", { sentence: true })} still ${encounterVerb(context, ownerId, "needs", "need")} to control you before ${encounterPronoun(context, ownerId, "subject")} can take anything. ${encounterPronoun(context, ownerId, "subject", { sentence: true })} ${encounterVerb(context, ownerId, "looks", "look")} ${commitment}.`;
}

export function stealEventProse(context, event) {
  const ownerId = goalOwnerId(context.state);
  switch (event.type) {
    case "encounter.started":
      return `${context.combatants[ownerId].title} blocks the alley and ${encounterPronoun(context, ownerId, "subject")} ${encounterVerb(context, ownerId, "demands", "demand")} your money.`;
    case "participant.unable-to-act":
      if (event.actorId !== goalTargetId(context.state)) return null;
      if (event.reason === "energy-exhausted") {
        return "Your remaining energy gives out, leaving you unable to respond.";
      }
      return event.reason === "already-incapacitated"
        ? "You are already unable to resist when the mugger approaches."
        : "Your injuries leave you unable to mount a physical response.";
    case "theft.taken":
      return `${encounterPronoun(context, ownerId, "subject", { sentence: true })} ${encounterVerb(context, ownerId, "pulls", "pull")} £${event.amount} free.`;
    case "theft.completed":
      return `${encounterPronoun(context, ownerId, "subject", { sentence: true })} ${encounterVerb(context, ownerId, "gets", "get")} away with £${event.amount}.`;
    case "theft.recovered":
      return `You recover your £${event.amount} before ${encounterPronoun(context, ownerId, "subject")} can escape.`;
    case "theft.empty":
      return `${encounterPronoun(context, ownerId, "subject", { sentence: true })} ${encounterVerb(context, ownerId, "finds", "find")} nothing to take and ${encounterVerb(context, ownerId, "abandons", "abandon")} the attempt.`;
    case "surrender.completed":
      return event.amount > 0
        ? `You stop resisting and surrender £${event.amount}.`
        : "You stop resisting and show that you have no money to hand over.";
    case "demand.succeeded":
      return `${encounterPronoun(context, ownerId, "subject", { sentence: true })} ${encounterVerb(context, ownerId, "gives", "give")} in to your demand and ${encounterVerb(context, ownerId, "looks", "look")} for a way to escape.`;
    case "escape.disengaged":
      return `You suddenly release ${encounterPronoun(context, ownerId, "object")} and jump away; before ${encounterPronoun(context, ownerId, "subject")} can react, you are already several steps back.`;
    case "escape.completed":
      return event.actorId === controlledParticipantId(context.state)
        ? "You reach the street and get clear."
        : `${encounterPronoun(context, ownerId, "subject", { sentence: true })} ${encounterVerb(context, ownerId, "turns", "turn")} and ${encounterVerb(context, ownerId, "runs", "run")} from the alley.`;
    default: return null;
  }
}

export function stealTerminalStaticProse(context, outcome) {
  const ownerId = goalOwnerId(context.state);
  const subject = encounterPronoun(context, ownerId, "subject", { sentence: true });
  const money = outcome?.moneyLost || 0;
  switch (outcome?.id) {
    case "player-rescued":
      return `Your call is answered. ${subject} ${encounterVerb(context, ownerId, "breaks", "break")} off the attack as help approaches.`;
    case "mugger-incapacitated": return `${subject} can no longer continue the struggle. You are safe to leave.`;
    case "both-incapacitated": return "The struggle leaves both of you unable to continue.";
    case "theft-completed-player-conscious":
      return `${subject} ${encounterVerb(context, ownerId, "gets", "get")} away with £${money} while you are still conscious.`;
    case "theft-completed-player-incapacitated":
      return money > 0
        ? `By the time you can respond, ${encounterPronoun(context, ownerId, "subject")} ${encounterVerb(context, ownerId, "has", "have")} taken £${money} and gone.`
        : `By the time you can respond, ${encounterPronoun(context, ownerId, "subject")} ${encounterVerb(context, ownerId, "has", "have")} searched you, found nothing, and gone.`;
    default: return "The encounter is over.";
  }
}

export function releasedHoldProseName(brokenHolds) {
  return brokenHolds.length === 1 ? wristProseName(brokenHolds[0].targetPartId) : "arms";
}

export function closingDistanceProseName(range) {
  return range === ENCOUNTER_RANGE.reach ? "to arm's reach" : "into a clinch";
}

export function intentDisplayProse(context, intent, durationSeconds) {
  const subject = encounterPronoun(context, intent.actorId, "subject", { sentence: true });
  const urgency = durationSeconds <= 1
    ? "The move is already unfolding."
    : durationSeconds <= 3
      ? "You have only a moment to react."
      : "The preparation gives you a brief opening to respond.";
  return `${subject} ${actionIntentProse(context, intent)}. ${urgency}`;
}
