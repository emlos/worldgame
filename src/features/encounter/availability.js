import { getEncounterAction, getEncounterActions } from "./actions/index.js";
import {
  getControlledHelplessActionId,
  getEffectiveHoldLeverage,
  holdsControlledBy,
  hostileHoldsOn,
} from "./combatants.js";
import { calculateContestChance } from "./actions/helpers.js";
import { effortBlockerText, getActionEffortStatus } from "./effort.js";
import { controlledParticipantId, goalOwnerId } from "./roles.js";
import { actionIntentProse } from "./proseData.js";
import {
  getPlayerCombatRank,
  isCombatActionUnlocked,
  minimumCombatRankForAction,
} from "./combatSkill.js";

export const ENCOUNTER_ACTION_PURPOSES = Object.freeze([
  Object.freeze({ id: "helpless", heading: "Unable to act" }),
  Object.freeze({ id: "attack", heading: "Attack" }),
  Object.freeze({ id: "control", heading: "Control" }),
  Object.freeze({ id: "break-control", heading: "Break control" }),
  Object.freeze({ id: "defend", heading: "Defend" }),
  Object.freeze({ id: "escape", heading: "Escape" }),
]);

function stableParameters(parameters) {
  return JSON.stringify(parameters || {});
}

export function sameActionInstance(left, right) {
  return (
    left?.actionId === right?.actionId &&
    left?.actorId === right?.actorId &&
    left?.targetId === right?.targetId &&
    stableParameters(left?.parameters) === stableParameters(right?.parameters)
  );
}

function definitionAllowsActor(context, definition, actorId) {
  if (!Object.hasOwn(context.state.participants, actorId)) return false;
  if (definition.usableBy === "any") return true;
  if (definition.usableBy === "controlled") {
    return actorId === controlledParticipantId(context.state);
  }
  if (definition.usableBy === "goal-owner")
    return actorId === goalOwnerId(context.state);
  return false;
}

export function getAvailableActionInstances(context, actorId) {
  const helplessActionId = getControlledHelplessActionId(context, actorId);
  const instances = [];
  for (const definition of getEncounterActions(context)) {
    if (!definitionAllowsActor(context, definition, actorId)) continue;
    if (
      actorId === controlledParticipantId(context.state) &&
      !isCombatActionUnlocked(context.game.player, definition.id)
    )
      continue;
    if (helplessActionId && definition.id !== helplessActionId) continue;
    if (!helplessActionId && definition.tags.includes("helpless")) continue;
    for (const instance of definition.enumerateTargets(context, actorId)) {
      if (isActionInstanceAvailable(context, instance))
        instances.push(instance);
    }
  }
  return instances;
}

const AVAILABILITY_HINTS = Object.freeze({
  "too-tired-to-move": "Available only while the player's Energy is below one.",
  "writhe-in-pain":
    "Available only while the player's pain is at its tolerance limit.",
  "scream-for-help": "Only the player can call for outside help.",
  "cover-and-brace": "Actor cannot begin a physical action.",
  "catch-breath": "Only useful while exerted, hurt, winded, or dazed.",
  "strike-face": "Needs a usable free hand and striking range.",
  "drive-body": "Needs a usable free hand and striking range.",
  "strike-holding-arm": "Needs a hostile arm hold that can be struck.",
  headbutt: "Needs close facing, a usable head, and a constrained target.",
  "knee-strike": "Needs a usable knee and close positional access.",
  "shove-away": "Needs a usable free hand and close enough range.",
  "grab-arm":
    "Needs clinch access, a free hand, and an uncontrolled target arm.",
  "wrench-free":
    "Requires a hostile hold on a restrained limb that can still resist.",
  "stand-up": "Actor must be grounded and able to support standing.",
  "roll-toward": "Actor must be grounded with room and capacity to roll.",
  "create-distance":
    "Needs room to disengage and no unbroken hold preventing it.",
  run: "Requires far range, standing posture, and enough movement capacity.",
  flee: "NPC retreat requires far range, standing posture, and movement capacity.",
  "tighten-hold": "Requires a controlled hold below maximum stored leverage.",
  "pin-limb":
    "Requires a hold plus grounded or wall-supported control geometry.",
  "force-to-ground": "Requires a usable hold on a standing target.",
  "force-to-wall": "Requires a usable hold on a standing, unsupported target.",
  "turn-target-away": "Requires a usable hold and compatible facing.",
  "close-distance": "Requires open distance and enough movement capacity.",
});

export function isActionInstanceAvailable(context, instance) {
  const definition = getEncounterAction(instance?.actionId);
  if (
    !definition ||
    !getEncounterActions(context).includes(definition) ||
    !definitionAllowsActor(context, definition, instance.actorId)
  )
    return false;
  if (
    instance.actorId === controlledParticipantId(context.state) &&
    !isCombatActionUnlocked(context.game.player, definition.id)
  )
    return false;
  const helplessActionId = getControlledHelplessActionId(
    context,
    instance.actorId,
  );
  if (helplessActionId && definition.id !== helplessActionId) return false;
  if (!helplessActionId && definition.tags.includes("helpless")) return false;
  if (!definition.isAvailable(context, instance)) return false;
  // The player's list is a promise that the action is realistically executable.
  // NPC intent may overreach; resolution gives such attempts a small desperation roll.
  return (
    instance.actorId !== controlledParticipantId(context.state) ||
    getActionEffortStatus(context, instance).allowed
  );
}

export function getActionAvailabilityDiagnostics(context, actorId) {
  const helplessActionId = getControlledHelplessActionId(context, actorId);
  const diagnostics = [];
  for (const definition of getEncounterActions(context)) {
    if (!definitionAllowsActor(context, definition, actorId)) continue;
    const requiredCombatRank =
      actorId === controlledParticipantId(context.state)
        ? minimumCombatRankForAction(definition.id)
        : 0;
    if (requiredCombatRank > getPlayerCombatRank(context.game.player)) {
      diagnostics.push({
        actionId: definition.id,
        available: false,
        instance: null,
        reasons: [`Requires Combat rank ${requiredCombatRank}.`],
      });
      continue;
    }
    const enumerated = definition.enumerateTargets(context, actorId);
    if (!enumerated.length) {
      diagnostics.push({
        actionId: definition.id,
        available: false,
        instance: null,
        reasons: [
          definition.availabilityHint ||
            AVAILABILITY_HINTS[definition.id] ||
            "No legal target or source limb.",
        ],
      });
      continue;
    }
    for (const instance of enumerated) {
      const mechanicallyAvailable = definition.isAvailable(context, instance);
      const blockedByHelplessness =
        (helplessActionId && definition.id !== helplessActionId) ||
        (!helplessActionId && definition.tags.includes("helpless"));
      const effort =
        mechanicallyAvailable &&
        !blockedByHelplessness &&
        actorId === controlledParticipantId(context.state)
          ? getActionEffortStatus(context, instance)
          : null;
      const available =
        mechanicallyAvailable &&
        !blockedByHelplessness &&
        (!effort || effort.allowed);
      diagnostics.push({
        actionId: definition.id,
        available,
        instance,
        reasons: available
          ? []
          : blockedByHelplessness && helplessActionId
            ? ["The player is currently limited to their helpless response."]
            : effort?.blockers.length
              ? effort.blockers.map(effortBlockerText)
              : [
                  definition.availabilityHint ||
                    AVAILABILITY_HINTS[definition.id] ||
                    "Its positional or physical prerequisites are not met.",
                ],
      });
    }
  }
  return diagnostics;
}

export function requireAvailableAction(context, actorId, requested) {
  const available = getAvailableActionInstances(context, actorId);
  const instance = available.find((candidate) =>
    sameActionInstance(candidate, requested),
  );
  if (!instance) {
    throw new Error(
      `Physical encounter: action '${String(requested?.actionId)}' is unavailable for '${actorId}'`,
    );
  }
  return instance;
}

export function actionDurationSeconds(instance) {
  const definition = getEncounterAction(instance?.actionId);
  if (!definition) {
    throw new Error(
      `Physical encounter: unknown action '${String(instance?.actionId)}'`,
    );
  }
  return definition.durationSeconds;
}

function contestPreviewOptions(context, instance) {
  const fixed = {
    "strike-face": { baseChance: 0.57, defense: "impact" },
    "drive-body": { baseChance: 0.64, defense: "impact" },
    "strike-holding-arm": { baseChance: 0.67, defense: "impact" },
    headbutt: { baseChance: 0.58, defense: "impact" },
    "knee-strike": { baseChance: 0.61, defense: "impact" },
    "shove-away": { baseChance: 0.61, actorStat: "strength", targetStat: "strength" },
    "grab-arm": { baseChance: 0.6, actorStat: "fitness", targetStat: "fitness" },
  };
  if (fixed[instance.actionId]) return fixed[instance.actionId];

  const controlledHold = holdsControlledBy(context, instance.actorId).find(
    ({ id }) => id === instance.parameters?.holdId,
  );
  const leverage = controlledHold ? getEffectiveHoldLeverage(context, controlledHold) : 0;
  if (instance.actionId === "force-to-wall") {
    return { baseChance: 0.5, actorStat: "strength", targetStat: "strength", modifier: leverage * 0.003 };
  }
  if (instance.actionId === "force-to-ground") {
    return { baseChance: 0.48, actorStat: "strength", targetStat: "strength", modifier: leverage * 0.003 };
  }
  if (instance.actionId === "turn-target-away") {
    return { baseChance: 0.56, actorStat: "fitness", targetStat: "fitness", modifier: leverage * 0.002 };
  }
  if (instance.actionId === "pin-limb") {
    return { baseChance: 0.62, actorStat: "strength", targetStat: "strength", modifier: leverage * 0.002 };
  }

  const hostile = hostileHoldsOn(context, instance.actorId);
  const totalLeverage = hostile.reduce(
    (sum, hold) => sum + getEffectiveHoldLeverage(context, hold),
    0,
  );
  if (instance.actionId === "create-distance" && hostile.length) {
    return {
      baseChance: 0.58,
      actorStat: "fitness",
      targetStat: "strength",
      modifier: -totalLeverage * 0.006,
      defense: "neutral",
    };
  }
  if (instance.actionId === "stand-up" && hostile.length) {
    return {
      baseChance: 0.61,
      actorStat: "fitness",
      targetStat: "strength",
      modifier: -totalLeverage * 0.0015,
    };
  }
  if (instance.actionId === "roll-toward" && hostile.length) {
    const strongest = Math.max(
      ...hostile.map((hold) => getEffectiveHoldLeverage(context, hold)),
    );
    return {
      baseChance: 0.64,
      actorStat: "fitness",
      targetStat: "strength",
      modifier: -strongest * 0.002,
    };
  }
  return null;
}

function previewContestChance(context, instance) {
  const options = contestPreviewOptions(context, instance);
  if (!options) return null;
  const npcAction = getEncounterAction(context.state.npcIntent?.actionId);
  const playerSeconds = actionDurationSeconds(instance);
  const npcActsInTime = npcAction?.durationSeconds <= playerSeconds;
  const runtime = {
    guarded: new Set(
      npcActsInTime && npcAction?.id === "cover-and-brace" ? [instance.targetId] : [],
    ),
    evading: new Set(
      npcActsInTime && npcAction?.id === "create-distance" ? [instance.targetId] : [],
    ),
  };
  return calculateContestChance(context, instance, runtime, options);
}

function timingInsight(context, definition) {
  const opponentSeconds = getEncounterAction(
    context.state.npcIntent?.actionId,
  )?.durationSeconds;
  if (!Number.isFinite(opponentSeconds)) return null;
  if (definition.durationSeconds < opponentSeconds) return "acts first";
  if (definition.durationSeconds === opponentSeconds) return "same timing";
  return "acts after their move";
}

function tacticalInsight(context, instance, definition) {
  const npcTags = new Set(getEncounterAction(context.state.npcIntent?.actionId)?.tags || []);
  if (instance.actionId === "cover-and-brace") {
    return npcTags.has("impact") ? "reduces incoming impact" : "does not stop control attempts";
  }
  if (instance.actionId === "create-distance") return "evades attacks while moving";
  if (instance.actionId === "strike-holding-arm") return "can weaken or break the grip";
  if (definition.tags.includes("self-risk")) return "can daze you on a miss";
  if (definition.tags.includes("balance-risk")) return "risks your balance";
  if (definition.tags.includes("takedown")) return "converts a strong hold into ground control";
  if (definition.tags.includes("pin")) return "upgrades a grip into a pin";
  return null;
}

export function actionLabel(context, instance) {
  const definition = getEncounterAction(instance.actionId);
  if (!definition) return instance.actionId;
  const specificLabel = definition.label(context, instance);
  if (instance.actorId !== controlledParticipantId(context.state)) return specificLabel;
  const rank = getPlayerCombatRank(context.game.player);
  const broadLabels = {
    "drive-body": rank === 0 ? "Strike body" : "Strike body (direct attack)",
    "wrench-free":
      rank === 0 ? "Break away" : "Break away (useful against a hold)",
    "cover-and-brace":
      rank === 0 ? "Defend yourself" : "Cover and brace (defensive)",
    "create-distance":
      rank === 0 ? "Try to get away" : "Create distance (escape setup)",
  };
  const label = rank < 2 && broadLabels[instance.actionId]
    ? broadLabels[instance.actionId]
    : specificLabel;
  if (rank < 1 || definition.tags.includes("helpless")) return label;

  const insights = [timingInsight(context, definition)];
  if (rank >= 2) {
    const chance = previewContestChance(context, instance);
    if (chance !== null) {
      insights.push(rank >= 4
        ? `${Math.round(chance * 100)}% estimated chance`
        : chance >= 0.7
          ? "favorable odds"
          : chance >= 0.5
            ? "even odds"
            : "risky odds");
    }
  }
  if (rank >= 3) insights.push(tacticalInsight(context, instance, definition));
  const visible = insights.filter(Boolean);
  return visible.length ? `${label} [${visible.join("; ")}]` : label;
}

export function getActionPurpose(context, instance) {
  const definition = getEncounterAction(instance?.actionId);
  if (!definition) {
    throw new Error(
      `Physical encounter: unknown action '${String(instance?.actionId)}'`,
    );
  }
  const tags = definition.tags;
  if (tags.includes("helpless")) return "helpless";
  const breakingControl =
    tags.includes("disrupt-hold") &&
    hostileHoldsOn(context, instance.actorId).length > 0;

  if (breakingControl) return "break-control";
  if (tags.includes("escape")) return "escape";
  if (
    tags.includes("defense") ||
    tags.includes("recovery") ||
    definition.id === "roll-toward"
  ) {
    return "defend";
  }
  if (tags.includes("attack")) return "attack";
  if (tags.includes("control") || tags.includes("hold")) return "control";

  throw new Error(
    `Physical encounter: action '${definition.id}' has no player-facing purpose`,
  );
}

export function intentLabel(context, intent) {
  return actionIntentProse(context, intent);
}

export function sortPlayerActions(instances) {
  return [...instances].sort((left, right) => {
    const leftDefinition = getEncounterAction(left.actionId);
    const rightDefinition = getEncounterAction(right.actionId);
    return (
      leftDefinition.playerOrder - rightDefinition.playerOrder ||
      left.actionId.localeCompare(right.actionId)
    );
  });
}
