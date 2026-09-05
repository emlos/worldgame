import {
  failSave,
  requiredSaveField,
  requireSameSaveValue,
  saveArray,
  saveBoolean,
  saveClockMinutes,
  saveDateMilliseconds,
  saveFiniteNumber,
  saveInteger,
  saveNullableString,
  saveRecord,
  saveString,
  saveUniqueStrings,
} from "../../shared/util/saveValidation.js";
import { DayKind } from "../../world/data/calendar.js";
import { DAY_KEYS, MS_PER_MINUTE } from "../../world/data/time.js";
import { PLACE_ENTER_MINUTES, PLACE_LEAVE_MINUTES } from "../../world/data/travel.js";
import {
  validateCharacterCoreSave,
  validateRelationshipProfileDefinitionSave,
} from "../core/saveValidation.js";
import {
  GOAL_TYPE,
  NPC_ACTION_TYPE,
  OBLIGATION_EARLY_ARRIVAL_MINUTES,
  TARGET_TYPE,
} from "./behavior.js";

const GOAL_TYPES = new Set(Object.values(GOAL_TYPE));
const ACTION_TYPES = new Set(Object.values(NPC_ACTION_TYPE));
const TARGET_TYPES = new Set(Object.values(TARGET_TYPE));
const DAY_KEYS_SET = new Set(DAY_KEYS);
const DAY_KINDS = new Set(Object.values(DayKind));

function validateTargetDescriptorSave(data, path) {
  const descriptor = saveRecord(data, path);
  const type = saveString(requiredSaveField(descriptor, "type", path), `${path}.type`, {
    nonEmpty: true,
  });
  if (!TARGET_TYPES.has(type) || type === TARGET_TYPE.home) {
    failSave(`${path}.type`, `has unsupported place target type '${type}'`);
  }
  saveUniqueStrings(
    requiredSaveField(descriptor, "candidates", path),
    `${path}.candidates`,
    { nonEmpty: true },
  );
  if (Object.prototype.hasOwnProperty.call(descriptor, "nearest")) {
    saveBoolean(descriptor.nearest, `${path}.nearest`);
  }
}

function descriptorMatchesPlace(descriptor, place) {
  if (!descriptor || !place) return false;
  const candidates = Array.isArray(descriptor.candidates) ? descriptor.candidates : [];
  if (descriptor.type === TARGET_TYPE.placeKeys) return candidates.includes(place.key);
  if (descriptor.type === TARGET_TYPE.placeCategory) {
    const categories = Array.isArray(place.props?.category) ? place.props.category : [];
    return categories.some((category) => candidates.includes(category));
  }
  return false;
}

function validateBehaviorSave(data, path) {
  const behavior = saveRecord(data, path);
  const rules = new Map();
  saveArray(requiredSaveField(behavior, "goals", path), `${path}.goals`).forEach(
    (ruleData, index) => {
      const rulePath = `${path}.goals[${index}]`;
      const rule = saveRecord(ruleData, rulePath);
      const id = saveString(requiredSaveField(rule, "id", rulePath), `${rulePath}.id`, {
        nonEmpty: true,
      });
      if (rules.has(id)) failSave(`${rulePath}.id`, `duplicates behavior goal '${id}'`);
      const type = saveString(requiredSaveField(rule, "type", rulePath), `${rulePath}.type`, {
        nonEmpty: true,
      });
      if (!GOAL_TYPES.has(type)) failSave(`${rulePath}.type`, `has unknown goal type '${type}'`);
      saveFiniteNumber(requiredSaveField(rule, "priority", rulePath), `${rulePath}.priority`);
      if (Object.prototype.hasOwnProperty.call(rule, "weight")) {
        saveFiniteNumber(rule.weight, `${rulePath}.weight`, { min: 0 });
      }

      const when = saveRecord(requiredSaveField(rule, "when", rulePath), `${rulePath}.when`);
      saveClockMinutes(
        requiredSaveField(when, "from", `${rulePath}.when`),
        `${rulePath}.when.from`,
      );
      saveClockMinutes(
        requiredSaveField(when, "to", `${rulePath}.when`),
        `${rulePath}.when.to`,
      );
      if (Object.prototype.hasOwnProperty.call(when, "schoolDay")) {
        saveBoolean(when.schoolDay, `${rulePath}.when.schoolDay`);
      }
      if (Object.prototype.hasOwnProperty.call(when, "dayKinds")) {
        saveArray(when.dayKinds, `${rulePath}.when.dayKinds`).forEach((value, dayIndex) => {
          if (!DAY_KINDS.has(value)) {
            failSave(
              `${rulePath}.when.dayKinds[${dayIndex}]`,
              `has unknown day kind '${value}'`,
            );
          }
        });
      }
      if (Object.prototype.hasOwnProperty.call(when, "daysOfWeek")) {
        saveArray(when.daysOfWeek, `${rulePath}.when.daysOfWeek`).forEach(
          (value, dayIndex) => {
            const valid =
              (typeof value === "number" &&
                Number.isInteger(value) &&
                value >= 0 &&
                value <= 6) ||
              (typeof value === "string" && DAY_KEYS_SET.has(value));
            if (!valid) {
              failSave(`${rulePath}.when.daysOfWeek[${dayIndex}]`, `has invalid day '${value}'`);
            }
          },
        );
      }

      const descriptors = [];
      if (Object.prototype.hasOwnProperty.call(rule, "target")) {
        descriptors.push([rule.target, `${rulePath}.target`]);
      }
      if (Object.prototype.hasOwnProperty.call(rule, "targets")) {
        saveArray(rule.targets, `${rulePath}.targets`).forEach((descriptor, targetIndex) =>
          descriptors.push([descriptor, `${rulePath}.targets[${targetIndex}]`]),
        );
      }
      if (type !== GOAL_TYPE.home && descriptors.length === 0) {
        failSave(rulePath, "must define at least one target descriptor");
      }
      descriptors.forEach(([descriptor, descriptorPath]) =>
        validateTargetDescriptorSave(descriptor, descriptorPath),
      );
      if (Object.prototype.hasOwnProperty.call(rule, "disallowedTargets")) {
        saveArray(rule.disallowedTargets, `${rulePath}.disallowedTargets`).forEach(
          (descriptor, targetIndex) =>
            validateTargetDescriptorSave(
              descriptor,
              `${rulePath}.disallowedTargets[${targetIndex}]`,
            ),
        );
      }
      if (Object.prototype.hasOwnProperty.call(rule, "requireOpen")) {
        saveBoolean(rule.requireOpen, `${rulePath}.requireOpen`);
      }
      if (Object.prototype.hasOwnProperty.call(rule, "stayMinutes")) {
        const stay = saveRecord(rule.stayMinutes, `${rulePath}.stayMinutes`);
        const min = saveFiniteNumber(
          requiredSaveField(stay, "min", `${rulePath}.stayMinutes`),
          `${rulePath}.stayMinutes.min`,
          { min: Number.MIN_VALUE },
        );
        const max = saveFiniteNumber(
          requiredSaveField(stay, "max", `${rulePath}.stayMinutes`),
          `${rulePath}.stayMinutes.max`,
          { min },
        );
        if (max < min) {
          failSave(`${rulePath}.stayMinutes.max`, "must not be less than the minimum stay");
        }
      }
      rules.set(id, rule);
    },
  );
  return rules;
}

function validateBrainSave(data, path, context) {
  const brain = saveRecord(data, path);
  const lastUpdatedAt = saveDateMilliseconds(
    requiredSaveField(brain, "lastUpdatedAt", path),
    `${path}.lastUpdatedAt`,
  );
  requireSameSaveValue(
    lastUpdatedAt,
    context.gameTime,
    `${path}.lastUpdatedAt`,
    "the game clock",
  );
  const nextDecisionAt = saveDateMilliseconds(
    requiredSaveField(brain, "nextDecisionAt", path),
    `${path}.nextDecisionAt`,
  );
  if (nextDecisionAt <= lastUpdatedAt) {
    failSave(`${path}.nextDecisionAt`, "must be after the last update");
  }

  const goalData = requiredSaveField(brain, "currentGoal", path);
  let goal = null;
  if (goalData !== null) {
    const goalPath = `${path}.currentGoal`;
    goal = saveRecord(goalData, goalPath);
    const ruleId = saveString(requiredSaveField(goal, "ruleId", goalPath), `${goalPath}.ruleId`, {
      nonEmpty: true,
    });
    const rule = context.rules.get(ruleId);
    if (!rule) failSave(`${goalPath}.ruleId`, `references unknown behavior goal '${ruleId}'`);
    requireSameSaveValue(
      saveString(requiredSaveField(goal, "type", goalPath), `${goalPath}.type`, {
        nonEmpty: true,
      }),
      rule.type,
      `${goalPath}.type`,
      "the referenced behavior goal type",
    );
    const priority = saveFiniteNumber(
      requiredSaveField(goal, "priority", goalPath),
      `${goalPath}.priority`,
    );
    requireSameSaveValue(
      priority,
      Number(rule.priority) || 0,
      `${goalPath}.priority`,
      "the referenced behavior goal priority",
    );
    const startedAt = saveDateMilliseconds(
      requiredSaveField(goal, "startedAt", goalPath),
      `${goalPath}.startedAt`,
    );
    const windowStart = saveDateMilliseconds(
      requiredSaveField(goal, "windowStart", goalPath),
      `${goalPath}.windowStart`,
    );
    const windowEnd = saveDateMilliseconds(
      requiredSaveField(goal, "windowEnd", goalPath),
      `${goalPath}.windowEnd`,
    );
    if (windowStart >= windowEnd) {
      failSave(`${goalPath}.windowEnd`, "must be after the goal window start");
    }
    if (startedAt > context.gameTime) {
      failSave(`${goalPath}.startedAt`, "cannot be in the future");
    }
    if (rule.type === GOAL_TYPE.obligation) {
      const earlyArrivalMinutes = saveInteger(
        requiredSaveField(goal, "earlyArrivalMinutes", goalPath),
        `${goalPath}.earlyArrivalMinutes`,
        OBLIGATION_EARLY_ARRIVAL_MINUTES,
      );
      const requiredArrivalAt = saveDateMilliseconds(
        requiredSaveField(goal, "requiredArrivalAt", goalPath),
        `${goalPath}.requiredArrivalAt`,
      );
      requireSameSaveValue(
        requiredArrivalAt,
        windowStart - earlyArrivalMinutes * MS_PER_MINUTE,
        `${goalPath}.requiredArrivalAt`,
        "the obligation window start minus its early-arrival time",
      );
    }
    const targetLocationId = saveString(
      requiredSaveField(goal, "targetLocationId", goalPath),
      `${goalPath}.targetLocationId`,
      { nonEmpty: true },
    );
    const targetPlaceId = saveNullableString(
      requiredSaveField(goal, "targetPlaceId", goalPath),
      `${goalPath}.targetPlaceId`,
    );
    const targetPlace = context.mapIndex.placeAt(
      targetLocationId,
      targetPlaceId,
      `${goalPath}.targetPlaceId`,
    );
    if (rule.type === GOAL_TYPE.home) {
      requireSameSaveValue(
        targetLocationId,
        context.npc.homeLocationId,
        `${goalPath}.targetLocationId`,
        "the NPC home location",
      );
      requireSameSaveValue(
        targetPlaceId,
        context.npc.homePlaceId,
        `${goalPath}.targetPlaceId`,
        "the NPC home place",
      );
    } else {
      if (!targetPlace) {
        failSave(`${goalPath}.targetPlaceId`, "is required for a place-targeting goal");
      }
      const allowed = [rule.target, ...(rule.targets || [])]
        .filter(Boolean)
        .some((descriptor) => descriptorMatchesPlace(descriptor, targetPlace));
      if (!allowed) {
        failSave(`${goalPath}.targetPlaceId`, "does not match the referenced behavior goal targets");
      }
      const disallowed = (rule.disallowedTargets || []).some((descriptor) =>
        descriptorMatchesPlace(descriptor, targetPlace),
      );
      if (disallowed) {
        failSave(`${goalPath}.targetPlaceId`, "matches a disallowed behavior target");
      }
    }
  }

  const actionData = requiredSaveField(brain, "currentAction", path);
  if (actionData === null) return;
  const actionPath = `${path}.currentAction`;
  const action = saveRecord(actionData, actionPath);
  const type = saveString(requiredSaveField(action, "type", actionPath), `${actionPath}.type`, {
    nonEmpty: true,
  });
  if (!ACTION_TYPES.has(type)) {
    failSave(`${actionPath}.type`, `has unknown NPC action type '${type}'`);
  }
  const startedAt = saveDateMilliseconds(
    requiredSaveField(action, "startedAt", actionPath),
    `${actionPath}.startedAt`,
  );
  if (type === NPC_ACTION_TYPE.idle) {
    if (startedAt > context.gameTime) {
      failSave(`${actionPath}.startedAt`, "cannot be in the future");
    }
    if (goal) failSave(actionPath, "an idle action cannot have a current goal");
    return;
  }

  if (type === NPC_ACTION_TYPE.stay || type === NPC_ACTION_TYPE.temporaryStay) {
    if (startedAt > context.gameTime) {
      failSave(`${actionPath}.startedAt`, "cannot be in the future");
    }
    const until = saveDateMilliseconds(
      requiredSaveField(action, "until", actionPath),
      `${actionPath}.until`,
    );
    if (until <= context.gameTime) {
      failSave(`${actionPath}.until`, "must be after the game clock");
    }
    const locationId = saveString(
      requiredSaveField(action, "locationId", actionPath),
      `${actionPath}.locationId`,
      { nonEmpty: true },
    );
    const placeId = saveNullableString(
      requiredSaveField(action, "placeId", actionPath),
      `${actionPath}.placeId`,
    );
    context.mapIndex.placeAt(locationId, placeId, `${actionPath}.placeId`);
    requireSameSaveValue(
      locationId,
      context.npc.locationId,
      `${actionPath}.locationId`,
      "the NPC location",
    );
    requireSameSaveValue(
      placeId,
      context.npc.currentPlaceId,
      `${actionPath}.placeId`,
      "the NPC current place",
    );

    if (type === NPC_ACTION_TYPE.temporaryStay) {
      if (goal) failSave(actionPath, "a temporary stay cannot have a current goal");
      return;
    }

    if (!goal) failSave(actionPath, "stay requires a current goal");
    requireSameSaveValue(
      locationId,
      goal.targetLocationId,
      `${actionPath}.locationId`,
      "the current goal target",
    );
    requireSameSaveValue(
      placeId,
      goal.targetPlaceId,
      `${actionPath}.placeId`,
      "the current goal target place",
    );
    return;
  }

  if (!goal) failSave(actionPath, `${type} requires a current goal`);

  const arrivalAt = saveDateMilliseconds(
    requiredSaveField(action, "arrivalAt", actionPath),
    `${actionPath}.arrivalAt`,
  );
  if (arrivalAt <= context.gameTime) {
    failSave(`${actionPath}.arrivalAt`, "must be after the game clock");
  }
  const fromLocationId = saveString(
    requiredSaveField(action, "fromLocationId", actionPath),
    `${actionPath}.fromLocationId`,
    { nonEmpty: true },
  );
  const fromPlaceId = saveNullableString(
    requiredSaveField(action, "fromPlaceId", actionPath),
    `${actionPath}.fromPlaceId`,
  );
  const targetLocationId = saveString(
    requiredSaveField(action, "targetLocationId", actionPath),
    `${actionPath}.targetLocationId`,
    { nonEmpty: true },
  );
  const targetPlaceId = saveNullableString(
    requiredSaveField(action, "targetPlaceId", actionPath),
    `${actionPath}.targetPlaceId`,
  );
  context.mapIndex.placeAt(fromLocationId, fromPlaceId, `${actionPath}.fromPlaceId`);
  context.mapIndex.placeAt(targetLocationId, targetPlaceId, `${actionPath}.targetPlaceId`);
  requireSameSaveValue(
    targetLocationId,
    goal.targetLocationId,
    `${actionPath}.targetLocationId`,
    "the current goal target",
  );
  requireSameSaveValue(
    targetPlaceId,
    goal.targetPlaceId,
    `${actionPath}.targetPlaceId`,
    "the current goal target place",
  );
  const leavePlaceMinutes = saveFiniteNumber(
    requiredSaveField(action, "leavePlaceMinutes", actionPath),
    `${actionPath}.leavePlaceMinutes`,
    { min: 0 },
  );
  const enterPlaceMinutes = saveFiniteNumber(
    requiredSaveField(action, "enterPlaceMinutes", actionPath),
    `${actionPath}.enterPlaceMinutes`,
    { min: 0 },
  );
  requireSameSaveValue(
    leavePlaceMinutes,
    fromPlaceId == null ? 0 : PLACE_LEAVE_MINUTES,
    `${actionPath}.leavePlaceMinutes`,
    "the shared place-leaving cost",
  );
  requireSameSaveValue(
    enterPlaceMinutes,
    targetPlaceId == null ? 0 : PLACE_ENTER_MINUTES,
    `${actionPath}.enterPlaceMinutes`,
    "the shared place-entering cost",
  );

  const route = saveRecord(requiredSaveField(action, "route", actionPath), `${actionPath}.route`);
  const locations = saveArray(
    requiredSaveField(route, "locations", `${actionPath}.route`),
    `${actionPath}.route.locations`,
  );
  if (locations.length < 1) {
    failSave(`${actionPath}.route.locations`, "must contain at least one location");
  }
  locations.forEach((locationId, index) => {
    const id = saveString(locationId, `${actionPath}.route.locations[${index}]`, {
      nonEmpty: true,
    });
    if (!context.mapIndex.locations.has(id)) {
      failSave(`${actionPath}.route.locations[${index}]`, `references unknown location '${id}'`);
    }
  });
  requireSameSaveValue(
    locations[0],
    fromLocationId,
    `${actionPath}.route.locations[0]`,
    "the travel origin",
  );
  requireSameSaveValue(
    locations[locations.length - 1],
    targetLocationId,
    `${actionPath}.route.locations[${locations.length - 1}]`,
    "the travel target",
  );

  const legMinutes = saveArray(
    requiredSaveField(route, "legMinutes", `${actionPath}.route`),
    `${actionPath}.route.legMinutes`,
  );
  if (legMinutes.length !== locations.length - 1) {
    failSave(`${actionPath}.route.legMinutes`, "must have one duration for every route edge");
  }
  let totalMinutes = 0;
  legMinutes.forEach((minutes, index) => {
    const value = saveFiniteNumber(minutes, `${actionPath}.route.legMinutes[${index}]`, {
      min: Number.MIN_VALUE,
    });
    const expected = context.mapIndex.adjacency
      .get(locations[index])
      ?.get(locations[index + 1]);
    if (expected == null) {
      failSave(
        `${actionPath}.route.locations[${index + 1}]`,
        "is not adjacent to the previous route location",
      );
    }
    requireSameSaveValue(
      value,
      expected,
      `${actionPath}.route.legMinutes[${index}]`,
      "the world-map edge duration",
    );
    totalMinutes += value;
  });
  requireSameSaveValue(
    arrivalAt - startedAt,
    (leavePlaceMinutes + totalMinutes + enterPlaceMinutes) * 60 * 1000,
    `${actionPath}.arrivalAt`,
    "the route and place-transition duration",
  );

  const currentLegIndex = saveInteger(
    requiredSaveField(route, "currentLegIndex", `${actionPath}.route`),
    `${actionPath}.route.currentLegIndex`,
    { min: 0, max: locations.length - 1 },
  );
  requireSameSaveValue(
    context.npc.locationId,
    locations[currentLegIndex],
    `${context.path}.locationId`,
    "the route's current leg",
  );
  const leaveCompletesAt = startedAt + leavePlaceMinutes * 60 * 1000;
  if (context.gameTime < leaveCompletesAt) {
    requireSameSaveValue(
      context.npc.currentPlaceId,
      fromPlaceId,
      `${context.path}.currentPlaceId`,
      "the travel origin before leaving completes",
    );
  } else if (context.npc.currentPlaceId !== null) {
    failSave(`${context.path}.currentPlaceId`, "must be null after leaving while traveling");
  }
}

function validateNPCSave(data, path, context) {
  const npc = saveRecord(data, path);
  validateCharacterCoreSave(npc, path);
  saveString(requiredSaveField(npc, "id", path), `${path}.id`, { nonEmpty: true });
  saveString(requiredSaveField(npc, "name", path), `${path}.name`, { nonEmpty: true });
  const age = requiredSaveField(npc, "age", path);
  if (age !== null) saveFiniteNumber(age, `${path}.age`, { min: 0 });
  saveString(requiredSaveField(npc, "gender", path), `${path}.gender`, { nonEmpty: true });
  saveRecord(requiredSaveField(npc, "flags", path), `${path}.flags`);
  validateRelationshipProfileDefinitionSave(
    requiredSaveField(npc, "relationshipProfile", path),
    `${path}.relationshipProfile`,
  );
  saveRecord(requiredSaveField(npc, "meta", path), `${path}.meta`);

  const locationId = saveString(
    requiredSaveField(npc, "locationId", path),
    `${path}.locationId`,
    { nonEmpty: true },
  );
  if (!context.mapIndex.locations.has(locationId)) {
    failSave(`${path}.locationId`, `references unknown location '${locationId}'`);
  }
  const currentPlaceId = saveNullableString(
    requiredSaveField(npc, "currentPlaceId", path),
    `${path}.currentPlaceId`,
  );
  context.mapIndex.placeAt(locationId, currentPlaceId, `${path}.currentPlaceId`);
  const homeLocationId = saveString(
    requiredSaveField(npc, "homeLocationId", path),
    `${path}.homeLocationId`,
    { nonEmpty: true },
  );
  if (!context.mapIndex.locations.has(homeLocationId)) {
    failSave(`${path}.homeLocationId`, `references unknown location '${homeLocationId}'`);
  }
  const homePlaceId = saveString(
    requiredSaveField(npc, "homePlaceId", path),
    `${path}.homePlaceId`,
    { nonEmpty: true },
  );
  const home = context.mapIndex.placeAt(homeLocationId, homePlaceId, `${path}.homePlaceId`);
  if (home.props?.ownerNpcId !== npc.id) {
    failSave(`${path}.homePlaceId`, `must point to a home owned by NPC '${npc.id}'`);
  }
  if (home.props?.isResidence !== true) {
    failSave(`${path}.homePlaceId`, "must point to a residence");
  }

  const behaviorData = requiredSaveField(npc, "behavior", path);
  const brainData = requiredSaveField(npc, "brain", path);
  if (behaviorData === null) {
    if (brainData !== null) {
      failSave(`${path}.brain`, "must be null when the NPC has no behavior");
    }
    return;
  }
  const rules = validateBehaviorSave(behaviorData, `${path}.behavior`);
  if (brainData === null) failSave(`${path}.brain`, "is required when the NPC has behavior");
  validateBrainSave(brainData, `${path}.brain`, {
    ...context,
    npc: { ...npc, locationId, currentPlaceId },
    path,
    rules,
  });
}

export function validateNPCRosterSave(
  data,
  { path = "save.npcs", mapIndex, gameTime },
) {
  const npcs = saveArray(data, path);
  const npcIds = new Set();
  const npcProfiles = new Map();
  npcs.forEach((npcData, index) => {
    const npcPath = `${path}[${index}]`;
    const npc = saveRecord(npcData, npcPath);
    const id = saveString(requiredSaveField(npc, "id", npcPath), `${npcPath}.id`, {
      nonEmpty: true,
    });
    if (npcIds.has(id)) failSave(`${npcPath}.id`, `duplicates NPC '${id}'`);
    npcIds.add(id);
    npcProfiles.set(
      id,
      validateRelationshipProfileDefinitionSave(
        requiredSaveField(npc, "relationshipProfile", npcPath),
        `${npcPath}.relationshipProfile`,
      ),
    );
  });

  npcs.forEach((npcData, index) =>
    validateNPCSave(npcData, `${path}[${index}]`, { mapIndex, gameTime }),
  );

  for (const { data: place, path: placePath } of mapIndex.places.values()) {
    if (!Object.prototype.hasOwnProperty.call(place.props, "ownerNpcId")) continue;
    const ownerId = saveString(place.props.ownerNpcId, `${placePath}.props.ownerNpcId`, {
      nonEmpty: true,
    });
    if (!npcIds.has(ownerId)) {
      failSave(`${placePath}.props.ownerNpcId`, `references unknown NPC '${ownerId}'`);
    }
  }

  return { npcs, npcIds, npcProfiles };
}
