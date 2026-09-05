const FEATURE_ID_PATTERN = /^[a-z][a-z0-9_-]*$/;
const CONTRIBUTION_ID_PATTERN = /^[a-z][a-z0-9_.-]*$/;

function fail(message) {
  throw new TypeError(`Feature catalog: ${message}`);
}

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function contributionEntries(value, label) {
  return Object.entries(record(value ?? {}, label));
}

export function defineFeature(definition) {
  record(definition, "feature");
  const id = String(definition.id ?? "");
  if (!FEATURE_ID_PATTERN.test(id)) fail(`invalid feature id '${id}'`);
  return Object.freeze({
    id,
    sceneDecorators: Object.freeze([...(definition.sceneDecorators ?? [])]),
    actionHandlers: Object.freeze({ ...(definition.actionHandlers ?? {}) }),
    wgSystems: Object.freeze({ ...(definition.wgSystems ?? {}) }),
    wgContexts: Object.freeze({ ...(definition.wgContexts ?? {}) }),
    storyBehaviors: Object.freeze({ ...(definition.storyBehaviors ?? {}) }),
    automaticReminders: Object.freeze([...(definition.automaticReminders ?? [])]),
    timerDefinitions: Object.freeze({ ...(definition.timerDefinitions ?? {}) }),
    navigationDecorators: Object.freeze([...(definition.navigationDecorators ?? [])]),
    placeDefinitions: Object.freeze([...(definition.placeDefinitions ?? [])]),
    skillCheckTargets: Object.freeze({ ...(definition.skillCheckTargets ?? {}) }),
    wgEffectHandlers: Object.freeze({ ...(definition.wgEffectHandlers ?? {}) }),
    wgReferenceCatalogs: Object.freeze({ ...(definition.wgReferenceCatalogs ?? {}) }),
    playerStatsSections: Object.freeze([...(definition.playerStatsSections ?? [])]),
    npcScheduleConditions: Object.freeze({ ...(definition.npcScheduleConditions ?? {}) }),
  });
}

function addUnique(map, id, value, kind, featureId) {
  if (!CONTRIBUTION_ID_PATTERN.test(id)) {
    fail(`${kind} '${id}' from '${featureId}' has an invalid id`);
  }
  if (map.has(id)) fail(`duplicate ${kind} '${id}'`);
  map.set(id, value);
}

export function createFeatureCatalog(featureDefinitions) {
  const features = new Map();
  const actionHandlers = new Map();
  const wgSystems = new Map();
  const wgContexts = new Map();
  const storyBehaviors = new Map();
  const timerDefinitions = new Map();
  const sceneDecorators = [];
  const automaticReminders = [];
  const navigationDecorators = [];
  const reminderIds = new Set();
  const decoratorIds = new Set();
  const placeDefinitions = [];
  const placeKeys = new Set();
  const skillCheckTargets = new Map();
  const wgEffectHandlers = new Map();
  const wgReferenceCatalogs = new Map();
  const playerStatsSections = [];
  const npcScheduleConditions = new Map();

  for (const rawFeature of featureDefinitions) {
    const feature = defineFeature(rawFeature);
    if (features.has(feature.id)) fail(`duplicate feature '${feature.id}'`);
    features.set(feature.id, feature);

    for (const [id, handler] of contributionEntries(
      feature.actionHandlers,
      `feature '${feature.id}' action handlers`,
    )) {
      if (typeof handler !== "function") fail(`action handler '${id}' must be a function`);
      addUnique(actionHandlers, id, handler, "action handler", feature.id);
    }
    for (const [id, system] of contributionEntries(
      feature.wgSystems,
      `feature '${feature.id}' WG systems`,
    )) {
      addUnique(wgSystems, id, record(system, `WG system '${id}'`), "WG system", feature.id);
    }
    for (const [type, provider] of contributionEntries(
      feature.skillCheckTargets,
      `feature '${feature.id}' skill-check targets`,
    )) {
      const checked = record(provider, `skill-check target '${type}'`);
      record(checked.definitions, `skill-check target '${type}' definitions`);
      if (typeof checked.value !== "function") {
        fail(`skill-check target '${type}' requires value()`);
      }
      addUnique(skillCheckTargets, type, checked, "skill-check target", feature.id);
    }
    for (const [op, handler] of contributionEntries(
      feature.wgEffectHandlers,
      `feature '${feature.id}' WG effect handlers`,
    )) {
      if (typeof handler !== "function") fail(`WG effect handler '${op}' must be a function`);
      addUnique(wgEffectHandlers, op, handler, "WG effect handler", feature.id);
    }
    for (const [name, definitions] of contributionEntries(
      feature.wgReferenceCatalogs,
      `feature '${feature.id}' WG reference catalogs`,
    )) {
      addUnique(
        wgReferenceCatalogs,
        name,
        record(definitions, `WG reference catalog '${name}'`),
        "WG reference catalog",
        feature.id,
      );
    }
    for (const [namespace, provider] of contributionEntries(
      feature.wgContexts,
      `feature '${feature.id}' WG contexts`,
    )) {
      if (typeof provider !== "function") fail(`WG context '${namespace}' must be a function`);
      addUnique(wgContexts, namespace, provider, "WG context", feature.id);
    }
    for (const [id, behavior] of contributionEntries(
      feature.storyBehaviors,
      `feature '${feature.id}' story behaviors`,
    )) {
      addUnique(
        storyBehaviors,
        id,
        record(behavior, `story behavior '${id}'`),
        "story behavior",
        feature.id,
      );
    }
    for (const [id, definition] of contributionEntries(
      feature.timerDefinitions,
      `feature '${feature.id}' timers`,
    )) {
      addUnique(
        timerDefinitions,
        id,
        record(definition, `timer '${id}'`),
        "timer",
        feature.id,
      );
    }
    for (const decorator of feature.sceneDecorators) {
      record(decorator, `feature '${feature.id}' scene decorator`);
      const id = `${feature.id}.${String(decorator.id ?? "")}`;
      if (!CONTRIBUTION_ID_PATTERN.test(id)) fail(`invalid scene decorator '${id}'`);
      if (decoratorIds.has(id)) fail(`duplicate scene decorator '${id}'`);
      if (typeof decorator.applies !== "function" || typeof decorator.decorate !== "function") {
        fail(`scene decorator '${id}' requires applies and decorate functions`);
      }
      decoratorIds.add(id);
      sceneDecorators.push(Object.freeze({ ...decorator, id }));
    }
    for (const reminder of feature.automaticReminders) {
      record(reminder, `feature '${feature.id}' automatic reminder`);
      const id = String(reminder.id ?? "");
      if (!id || reminderIds.has(id)) fail(`duplicate or empty automatic reminder '${id}'`);
      if (typeof reminder.text !== "function") fail(`automatic reminder '${id}' needs text()`);
      reminderIds.add(id);
      automaticReminders.push(Object.freeze({ ...reminder }));
    }
    for (const decorator of feature.navigationDecorators) {
      if (typeof decorator !== "function") {
        fail(`feature '${feature.id}' navigation decorators must be functions`);
      }
      navigationDecorators.push(decorator);
    }
    for (const definition of feature.placeDefinitions) {
      record(definition, `feature '${feature.id}' place definition`);
      const key = String(definition.key ?? "");
      if (!CONTRIBUTION_ID_PATTERN.test(key)) {
        fail(`place definition '${key}' from '${feature.id}' has an invalid key`);
      }
      if (placeKeys.has(key)) fail(`duplicate feature place definition '${key}'`);
      placeKeys.add(key);
      placeDefinitions.push(definition);
    }
    for (const provider of feature.playerStatsSections) {
      if (typeof provider !== "function") {
        fail(`feature '${feature.id}' player stats sections must be functions`);
      }
      playerStatsSections.push(provider);
    }
    for (const [field, predicate] of contributionEntries(
      feature.npcScheduleConditions,
      `feature '${feature.id}' NPC schedule conditions`,
    )) {
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(field)) {
        fail(`NPC schedule condition '${field}' from '${feature.id}' has an invalid field`);
      }
      if (typeof predicate !== "function") {
        fail(`NPC schedule condition '${field}' must be a function`);
      }
      if (npcScheduleConditions.has(field)) {
        fail(`duplicate NPC schedule condition '${field}'`);
      }
      npcScheduleConditions.set(field, predicate);
    }
  }

  const catalog = {
    features: Object.freeze([...features.values()]),
    automaticReminders: Object.freeze(automaticReminders),
    timerDefinitions: Object.freeze(Object.fromEntries(timerDefinitions)),
    placeDefinitions: Object.freeze(placeDefinitions),
    skillCheckTargetTypes: Object.freeze([...skillCheckTargets.keys()]),
    wgEffectHandlerOps: Object.freeze([...wgEffectHandlers.keys()]),
    wgReferenceCatalogs: Object.freeze(Object.fromEntries(wgReferenceCatalogs)),
    getActionHandler: (id) => actionHandlers.get(String(id)) ?? null,
    getWGEffectHandler: (op) => wgEffectHandlers.get(String(op)) ?? null,
    getSkillCheckTargetDefinition(type, id) {
      return skillCheckTargets.get(String(type))?.definitions?.[String(id)] ?? null;
    },
    getSkillCheckTargetValue(player, type, id) {
      const provider = skillCheckTargets.get(String(type));
      if (!provider || !provider.definitions[String(id)]) return null;
      return provider.value(player, String(id));
    },
    getWGSystem: (id) => wgSystems.get(String(id)) ?? null,
    getStoryBehavior: (id) => storyBehaviors.get(String(id)) ?? null,
    createWGContext(game) {
      return Object.fromEntries(
        [...wgContexts].map(([namespace, provider]) => [namespace, provider(game)]),
      );
    },
    buildPlayerStatsSections(game) {
      return playerStatsSections.map((provider) => provider(game));
    },
    matchesNPCScheduleConditions(game, when, context = {}) {
      const schedule = when && typeof when === "object" ? when : {};
      for (const [field, predicate] of npcScheduleConditions) {
        if (!Object.prototype.hasOwnProperty.call(schedule, field)) continue;
        if (!predicate({ game, when: schedule, value: schedule[field], ...context })) {
          return false;
        }
      }
      return true;
    },
    decorateScene(game, scene, context = {}) {
      return sceneDecorators.reduce(
        (current, decorator) =>
          decorator.applies({ game, scene: current, ...context })
            ? decorator.decorate({ game, scene: current, ...context })
            : current,
        scene,
      );
    },
    decorateNavigationDestination(game, destination) {
      return navigationDecorators.reduce(
        (current, decorator) => decorator(game, current),
        destination,
      );
    },
  };
  return Object.freeze(catalog);
}
