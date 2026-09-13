import { Body, DamageType } from "../../characters/core/body.js";
import { keyedRandom01 } from "../../shared/util/random.js";
import { getEncounterAction } from "./actions/index.js";
import {
  actionDurationSeconds,
  getAvailableActionInstances,
  isActionInstanceAvailable,
  sameActionInstance,
} from "./availability.js";
import {
  getTheftObjectiveProgress,
  selectNpcIntent,
  intentToActionInstance,
  syncTheftObjectiveStage,
} from "./ai.js";
import {
  createCombatContext,
  getParticipant,
  getStat,
  holdsControlledBy,
  isEncounterIncapacitated,
  isSameLimb,
  persistCombatantBodies,
  validateCombatantInvariants,
} from "./combatants.js";
import {
  ENCOUNTER_OUTCOME,
  ENCOUNTER_PHASE,
  ENCOUNTER_RANGE,
  validateEncounterState,
} from "./state.js";
import {
  addExertion,
  chanceRoll,
  failAction,
  removeHold,
  removeNonfunctionalHolds,
  tickAcuteEffects,
} from "./actions/helpers.js";
import { getActionEffortStatus } from "./effort.js";
import {
  recoverTheftMoney,
  resolveIncapacitatedTheft,
} from "./objectives/steal.js";

function fail(message) {
  throw new Error(`Physical encounter: ${message}`);
}

function resolveOne(context, instance, runtime, { revalidate = true } = {}) {
  const definition = getEncounterAction(instance.actionId);
  if (!definition) fail(`unknown action '${String(instance.actionId)}'`);
  runtime.events.push({
    type: "action.attempted",
    actorId: instance.actorId,
    targetId: instance.targetId,
    actionId: instance.actionId,
  });
  const history = context.state.participants[instance.actorId].actionHistory;
  history.push(instance.actionId);
  if (history.length > 8) history.splice(0, history.length - 8);
  if (revalidate && !isActionInstanceAvailable(context, instance)) {
    runtime.events.push({
      type: "action.spoiled",
      actorId: instance.actorId,
      actionId: instance.actionId,
    });
    if (instance.actorId === "mugger" && definition.tags.includes("control")) {
      context.state.objective.failedControlAttempts += 1;
    }
    return;
  }
  if (instance.actorId !== "player") {
    const effort = getActionEffortStatus(context, instance);
    if (!effort.allowed && !chanceRoll(
      context,
      instance,
      runtime,
      "desperate-effort",
      effort.desperateChance,
      {
        readiness: effort.readiness,
        requiredReadiness: effort.requiredReadiness,
        blockers: effort.blockers,
      },
    )) {
      addExertion(context, instance.actorId, Math.max(2, definition.durationSeconds));
      failAction(runtime, instance, effort.primaryBlocker);
      if (definition.tags.includes("control")) {
        context.state.objective.failedControlAttempts += 1;
      }
      return;
    }
  }
  definition.resolve(context, instance, runtime);
}

function applyIncapacitatedTheft(context, runtime) {
  runtime.outcome = resolveIncapacitatedTheft(context, runtime.events);
}

function releaseControlledHolds(context, runtime, actorId) {
  for (const hold of [...holdsControlledBy(context, actorId)]) {
    removeHold(context, hold, runtime, "controller-incapacitated");
  }
}

function checkPhysicalTerminalState(context, runtime) {
  if (runtime.outcome) return;
  const muggerIncapacitated = isEncounterIncapacitated(context, "mugger");
  const playerIncapacitated = isEncounterIncapacitated(context, "player");
  if (muggerIncapacitated && playerIncapacitated) {
    releaseControlledHolds(context, runtime, "mugger");
    releaseControlledHolds(context, runtime, "player");
    recoverTheftMoney(context, runtime.events);
    runtime.outcome = { id: ENCOUNTER_OUTCOME.bothIncapacitated, moneyLost: 0 };
    return;
  }
  if (muggerIncapacitated) {
    releaseControlledHolds(context, runtime, "mugger");
    recoverTheftMoney(context, runtime.events);
    runtime.outcome = { id: ENCOUNTER_OUTCOME.muggerIncapacitated, moneyLost: 0 };
    return;
  }
  if (playerIncapacitated) {
    releaseControlledHolds(context, runtime, "player");
    applyIncapacitatedTheft(context, runtime);
    return;
  }

  // Capacity predicates should normally prevent this state. Keep resolution
  // total if a new action family or positional rule later exposes a gap: loss
  // of all legal agency is an encounter result, not an invariant exception.
  const muggerCanAct = getAvailableActionInstances(context, "mugger").length > 0;
  const playerCanAct = getAvailableActionInstances(context, "player").length > 0;
  if (!muggerCanAct && !playerCanAct) {
    runtime.events.push({
      type: "participant.unable-to-act",
      actorId: "mugger",
      reason: "no-legal-response",
    });
    runtime.events.push({
      type: "participant.unable-to-act",
      actorId: "player",
      reason: "no-legal-response",
    });
    releaseControlledHolds(context, runtime, "mugger");
    releaseControlledHolds(context, runtime, "player");
    recoverTheftMoney(context, runtime.events);
    runtime.outcome = { id: ENCOUNTER_OUTCOME.bothIncapacitated, moneyLost: 0 };
    return;
  }
  if (!muggerCanAct) {
    runtime.events.push({
      type: "participant.unable-to-act",
      actorId: "mugger",
      reason: "no-legal-response",
    });
    releaseControlledHolds(context, runtime, "mugger");
    recoverTheftMoney(context, runtime.events);
    runtime.outcome = { id: ENCOUNTER_OUTCOME.muggerIncapacitated, moneyLost: 0 };
    return;
  }
  if (!playerCanAct) {
    runtime.events.push({
      type: "participant.unable-to-act",
      actorId: "player",
      reason: "no-legal-response",
    });
    releaseControlledHolds(context, runtime, "player");
    applyIncapacitatedTheft(context, runtime);
  }
}

function finalizeOutcome(context, runtime) {
  const outcome = runtime.outcome;
  if (!outcome) return false;
  context.state.phase = ENCOUNTER_PHASE.terminal;
  context.state.npcIntent = null;
  context.state.objective.stage = "complete";
  context.state.outcome = {
    id: outcome.id,
    moneyLost: Number.isSafeInteger(outcome.moneyLost) ? outcome.moneyLost : 0,
  };
  runtime.events.push({
    type: "encounter.ended",
    outcomeId: context.state.outcome.id,
    moneyLost: context.state.outcome.moneyLost,
  });
  return true;
}

export function validateEncounterRuntime(context) {
  validateEncounterState(context.state);
  validateCombatantInvariants(context);
  if (context.state.phase !== ENCOUNTER_PHASE.active) return context.state;

  const playerActions = getAvailableActionInstances(context, "player");
  if (!playerActions.length) fail("active player state has no legal response");
  const npcActions = getAvailableActionInstances(context, "mugger");
  if (!npcActions.length) fail("active theft objective has no action or retreat fallback");
  const intent = intentToActionInstance(context.state.npcIntent);
  if (!npcActions.some((candidate) => sameActionInstance(candidate, intent))) {
    fail(`stored NPC intent '${intent.actionId}' is no longer legal`);
  }
  return context.state;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function createSimultaneousBranch(context) {
  const branchPlayer = {
    money: context.game.player.money,
    adjustMoney(amount) {
      this.money += amount;
    },
  };
  return {
    game: { seed: context.game.seed, player: branchPlayer },
    state: structuredClone(context.state),
    instanceKey: context.instanceKey,
    combatants: Object.fromEntries(
      Object.entries(context.combatants).map(([actorId, combatant]) => [
        actorId,
        {
          ...combatant,
          body: Body.fromJSON(combatant.body.toJSON()),
          persist() {},
        },
      ]),
    ),
  };
}

function changedValue(baseValue, branchValues, runtime, path) {
  const changed = [...new Set(branchValues.filter((value) => value !== baseValue))];
  if (!changed.length) return baseValue;
  if (changed.length === 1) return changed[0];
  const participantMatch = /^participants\.(player|mugger)\.(pose|support)$/.exec(path);
  const facingMatch = /^relationships\.facing\.(player|mugger)$/.exec(path);
  runtime.events = runtime.events.filter((event) => {
    if (path === "relationships.range") return event.type !== "range.changed";
    if (participantMatch) {
      return event.type !== `${participantMatch[2]}.changed`
        || event.actorId !== participantMatch[1];
    }
    if (facingMatch) {
      return event.type !== "facing.changed" || event.actorId !== facingMatch[1];
    }
    return true;
  });
  runtime.events.push({
    type: "state.change-conflicted",
    path,
    values: changed,
  });
  return baseValue;
}

function acuteById(participant) {
  return new Map(participant.acute.map((acute) => [acute.id, acute]));
}

function mergeParticipantEffects(context, branches, actorId) {
  const participant = context.state.participants[actorId];
  const baseExertion = participant.exertion;
  participant.exertion = clamp(
    baseExertion + branches.reduce(
      (sum, branch) => sum + branch.context.state.participants[actorId].exertion - baseExertion,
      0,
    ),
    0,
    100,
  );

  const baseAcute = acuteById(participant);
  const branchAcute = branches.map((branch) =>
    acuteById(branch.context.state.participants[actorId]));
  const acuteIds = new Set([
    ...baseAcute.keys(),
    ...branchAcute.flatMap((effects) => [...effects.keys()]),
  ]);
  participant.acute = [...acuteIds].map((id) => {
    const base = baseAcute.get(id);
    const baseSeverity = base?.severity || 0;
    const severity = clamp(
      baseSeverity + branchAcute.reduce(
        (sum, effects) => sum + (effects.get(id)?.severity || 0) - baseSeverity,
        0,
      ),
      0,
      3,
    );
    const exchanges = Math.max(
      base?.exchanges || 0,
      ...branchAcute.map((effects) => effects.get(id)?.exchanges || 0),
    );
    return severity > 0 && exchanges > 0 ? { id, severity, exchanges } : null;
  }).filter(Boolean);
}

function holdIdentity(hold) {
  return [
    hold.controllerId,
    hold.sourcePartId,
    hold.targetId,
    hold.targetPartId,
    hold.kind,
  ].join(":");
}

function mutuallyRestrictSourceLimbs(left, right) {
  return left.controllerId === right.targetId
    && right.controllerId === left.targetId
    && isSameLimb(left.sourcePartId, right.targetPartId)
    && isSameLimb(right.sourcePartId, left.targetPartId);
}

/**
 * Resolve two otherwise-successful simultaneous grabs that cannot coexist
 * because each grab restrains the limb supplying the other grab.
 */
export function chooseSimultaneousGrabPriority(context, leftHold, rightHold) {
  const actorIds = [leftHold.controllerId, rightHold.controllerId].sort();
  const [firstId, secondId] = actorIds;
  const first = getParticipant(context, firstId);
  const second = getParticipant(context, secondId);

  if (first.exertion !== second.exertion) {
    return {
      winnerId: first.exertion < second.exertion ? firstId : secondId,
      basis: "exertion",
      roll: null,
    };
  }

  const firstFitness = getStat(context, firstId, "fitness");
  const secondFitness = getStat(context, secondId, "fitness");
  if (firstFitness !== secondFitness) {
    return {
      winnerId: firstFitness > secondFitness ? firstId : secondId,
      basis: "fitness",
      roll: null,
    };
  }

  const firstStrength = getStat(context, firstId, "strength");
  const secondStrength = getStat(context, secondId, "strength");
  if (firstStrength !== secondStrength) {
    return {
      winnerId: firstStrength > secondStrength ? firstId : secondId,
      basis: "strength",
      roll: null,
    };
  }

  const conflictKey = [holdIdentity(leftHold), holdIdentity(rightHold)].sort().join("|");
  const roll = keyedRandom01(
    context.game.seed,
    `encounter-simultaneous-grab-v1:${context.instanceKey}:${context.state.exchange}:${conflictKey}`,
  );
  return {
    winnerId: roll < 0.5 ? firstId : secondId,
    basis: "roll",
    roll: Math.round(roll * 10000) / 10000,
  };
}

function arbitrateNewHoldConflicts(context, holds, runtime) {
  const rejectedIds = new Set();
  for (let leftIndex = 0; leftIndex < holds.length; leftIndex += 1) {
    const left = holds[leftIndex];
    if (rejectedIds.has(left.id)) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < holds.length; rightIndex += 1) {
      const right = holds[rightIndex];
      if (rejectedIds.has(right.id) || !mutuallyRestrictSourceLimbs(left, right)) continue;

      const decision = chooseSimultaneousGrabPriority(context, left, right);
      const winner = decision.winnerId === left.controllerId ? left : right;
      const loser = winner === left ? right : left;
      rejectedIds.add(loser.id);

      runtime.events = runtime.events.filter(
        (event) => event.type !== "hold.created"
          || (event.holdId !== winner.id && event.holdId !== loser.id),
      );
      if (decision.basis === "roll") {
        const [rollActorId, rollTargetId] = [winner.controllerId, loser.controllerId].sort();
        runtime.events.push({
          type: "chance.rolled",
          actorId: rollActorId,
          targetId: rollTargetId,
          actionId: "grab-arm",
          purpose: "simultaneous-grab-priority",
          chance: 0.5,
          roll: decision.roll,
          success: decision.winnerId === rollActorId,
        });
      }
      runtime.events.push({
        type: "hold.priority-resolved",
        winnerId: winner.controllerId,
        loserId: loser.controllerId,
        holdId: winner.id,
        targetPartId: winner.targetPartId,
        basis: decision.basis,
      });
    }
  }
  return holds.filter(({ id }) => !rejectedIds.has(id));
}

function mergeHoldRelations(context, branches, runtime) {
  const baseHolds = context.state.relationships.holds;
  const baseById = new Map(baseHolds.map((hold) => [hold.id, hold]));
  const branchMaps = branches.map((branch) =>
    new Map(branch.context.state.relationships.holds.map((hold) => [hold.id, hold])));
  const merged = [];

  for (const base of baseHolds) {
    const versions = branchMaps.map((holds) => holds.get(base.id) || null);
    if (versions.some((hold) => hold === null)) continue;
    const hold = structuredClone(base);
    hold.leverage = clamp(
      base.leverage + versions.reduce(
        (sum, version) => sum + version.leverage - base.leverage,
        0,
      ),
      1,
      100,
    );
    for (const field of ["sourcePartId", "targetPartId", "kind"]) {
      hold[field] = changedValue(
        base[field],
        versions.map((version) => version[field]),
        runtime,
        `relationships.holds.${base.id}.${field}`,
      );
    }
    merged.push(hold);
  }

  const newHolds = [];
  for (const holds of branchMaps) {
    for (const [holdId, hold] of holds) {
      if (baseById.has(holdId) || newHolds.some(({ id }) => id === holdId)) continue;
      newHolds.push(structuredClone(hold));
    }
  }
  merged.push(...arbitrateNewHoldConflicts(context, newHolds, runtime));
  context.state.relationships.holds = merged;
}

function mergeBodyDamage(context, branches) {
  for (const event of branches.flatMap((branch) => branch.runtime.events)) {
    if (event.type !== "impact.landed") continue;
    context.combatants[event.targetId].body.applyDamage({
      partId: event.partId,
      amount: event.damage,
      damageType: event.damageType || DamageType.BLUNT,
    });
  }
}

const SIMULTANEOUS_OUTCOME_PRIORITY = Object.freeze([
  ENCOUNTER_OUTCOME.theftPlayerIncapacitated,
  ENCOUNTER_OUTCOME.theftPlayerConscious,
  ENCOUNTER_OUTCOME.playerEscaped,
  ENCOUNTER_OUTCOME.muggerFled,
  ENCOUNTER_OUTCOME.muggerIncapacitated,
]);

function mergeProposedOutcomes(branches) {
  const outcomes = branches.map((branch) => branch.runtime.outcome).filter(Boolean);
  if (!outcomes.length) return null;
  const ids = new Set(outcomes.map(({ id }) => id));
  if (ids.size === 1) {
    return {
      id: outcomes[0].id,
      moneyLost: Math.max(...outcomes.map(({ moneyLost }) => moneyLost || 0)),
    };
  }
  const id = SIMULTANEOUS_OUTCOME_PRIORITY.find((candidate) => ids.has(candidate));
  const selected = outcomes.find((outcome) => outcome.id === id);
  return { id: selected.id, moneyLost: selected.moneyLost || 0 };
}

function resolveSimultaneously(context, playerAction, npcAction, sharedRuntime) {
  // Equal-speed actions resolve on isolated copies of the same starting facts.
  // Their effects are merged only afterward: numeric costs and damage add,
  // hold removal wins over hold changes, and incompatible scalar movements
  // cancel back to the pre-exchange value.
  const branches = [playerAction, npcAction].map((instance) => {
    const branchContext = createSimultaneousBranch(context);
    const branchRuntime = {
      events: [],
      guarded: new Set(sharedRuntime.guarded),
      evading: new Set(sharedRuntime.evading),
      outcome: null,
    };
    resolveOne(branchContext, instance, branchRuntime, { revalidate: false });
    return { context: branchContext, runtime: branchRuntime, instance };
  });

  sharedRuntime.events.push(...branches.flatMap((branch) => branch.runtime.events));
  sharedRuntime.outcome = mergeProposedOutcomes(branches);
  mergeBodyDamage(context, branches);
  // Hold priority reads the pre-exchange exertion state, before the costs from
  // either simultaneous branch are merged into the canonical participants.
  mergeHoldRelations(context, branches, sharedRuntime);
  mergeParticipantEffects(context, branches, "player");
  mergeParticipantEffects(context, branches, "mugger");
  for (const branch of branches) {
    const history = context.state.participants[branch.instance.actorId].actionHistory;
    history.push(branch.instance.actionId);
    if (history.length > 8) history.splice(0, history.length - 8);
  }

  const objective = context.state.objective;
  const baseFailedControlAttempts = objective.failedControlAttempts;
  objective.failedControlAttempts += branches.reduce(
    (sum, branch) => sum
      + branch.context.state.objective.failedControlAttempts
      - baseFailedControlAttempts,
    0,
  );
  objective.searched ||= branches.some((branch) => branch.context.state.objective.searched);
  objective.lootAmount = Math.max(
    objective.lootAmount,
    ...branches.map((branch) => branch.context.state.objective.lootAmount),
  );

  const baseMoney = context.game.player.money;
  const moneyDelta = branches.reduce(
    (sum, branch) => sum + branch.context.game.player.money - baseMoney,
    0,
  );
  if (moneyDelta) context.game.player.adjustMoney(moneyDelta);

  for (const actorId of ["player", "mugger"]) {
    const participant = context.state.participants[actorId];
    participant.pose = changedValue(
      participant.pose,
      branches.map((branch) => branch.context.state.participants[actorId].pose),
      sharedRuntime,
      `participants.${actorId}.pose`,
    );
    participant.support = changedValue(
      participant.support,
      branches.map((branch) => branch.context.state.participants[actorId].support),
      sharedRuntime,
      `participants.${actorId}.support`,
    );
    if (participant.pose !== "standing") participant.support = "free";
    const facing = context.state.relationships.facing.find(({ actor }) => actor === actorId);
    facing.value = changedValue(
      facing.value,
      branches.map((branch) => branch.context.state.relationships.facing
        .find(({ actor }) => actor === actorId).value),
      sharedRuntime,
      `relationships.facing.${actorId}`,
    );
  }

  const range = context.state.relationships.range[0];
  range.value = changedValue(
    range.value,
    branches.map((branch) => branch.context.state.relationships.range[0].value),
    sharedRuntime,
    "relationships.range",
  );
  if (context.state.relationships.holds.length) range.value = ENCOUNTER_RANGE.clinch;
  removeNonfunctionalHolds(context, sharedRuntime);
}

export function resolveEncounterExchange({
  game,
  state,
  instanceKey,
  playerAction,
}) {
  const next = structuredClone(state);
  const context = createCombatContext({ game, state: next, instanceKey });
  validateEncounterRuntime(context);
  const startingObjectiveProgress = getTheftObjectiveProgress(context);

  const availablePlayerAction = getAvailableActionInstances(context, "player")
    .find((candidate) => sameActionInstance(candidate, playerAction));
  if (!availablePlayerAction) fail(`player action '${String(playerAction?.actionId)}' is unavailable`);
  const npcAction = intentToActionInstance(next.npcIntent);
  const playerSeconds = actionDurationSeconds(availablePlayerAction);
  const npcSeconds = actionDurationSeconds(npcAction);
  const runtime = {
    events: [],
    guarded: new Set(),
    evading: new Set(),
    outcome: null,
  };

  // A reaction can influence an equal-speed action from the outset. Faster actions
  // resolve before a slower reaction has taken effect.
  for (const [instance, seconds, opposingSeconds] of [
    [availablePlayerAction, playerSeconds, npcSeconds],
    [npcAction, npcSeconds, playerSeconds],
  ]) {
    if (seconds > opposingSeconds) continue;
    if (instance.actionId === "cover-and-brace") runtime.guarded.add(instance.actorId);
    if (instance.actionId === "create-distance") runtime.evading.add(instance.actorId);
  }

  if (playerSeconds === npcSeconds) {
    resolveSimultaneously(context, availablePlayerAction, npcAction, runtime);
  } else {
    const ordered = playerSeconds < npcSeconds
      ? [availablePlayerAction, npcAction]
      : [npcAction, availablePlayerAction];
    resolveOne(context, ordered[0], runtime, { revalidate: false });
    checkPhysicalTerminalState(context, runtime);
    if (!runtime.outcome) resolveOne(context, ordered[1], runtime, { revalidate: true });
    else {
      runtime.events.push({
        type: "action.spoiled",
        actorId: ordered[1].actorId,
        actionId: ordered[1].actionId,
      });
    }
  }

  tickAcuteEffects(context);
  next.elapsedSeconds += Math.max(playerSeconds, npcSeconds);
  next.exchange += 1;
  checkPhysicalTerminalState(context, runtime);
  finalizeOutcome(context, runtime);
  next.lastEvents = runtime.events.slice(-24);
  persistCombatantBodies(context);

  if (next.phase === ENCOUNTER_PHASE.active) {
    const npcTags = getEncounterAction(npcAction.actionId)?.tags || [];
    const npcPursuedObjective = npcTags.includes("control")
      || npcTags.includes("objective")
      || npcTags.includes("theft");
    if (npcPursuedObjective
      && getTheftObjectiveProgress(context) > startingObjectiveProgress) {
      next.objective.lastProgressSecond = next.elapsedSeconds;
    }
    syncTheftObjectiveStage(context);
    next.npcIntent = selectNpcIntent(context);
  }
  validateEncounterRuntime(context);
  return next;
}

export function encounterExchangeDurationSeconds(state, playerAction) {
  return Math.max(
    actionDurationSeconds(playerAction),
    actionDurationSeconds(intentToActionInstance(state.npcIntent)),
  );
}
