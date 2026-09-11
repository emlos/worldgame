import { Body, HUMAN_BODY_TEMPLATE } from "../core/body.js";
import { validateBodySave } from "../core/saveValidation.js";
import { Gender, PronounSets } from "../core/pronouns.js";
import {
  failSave,
  requiredSaveField,
  saveFiniteNumber,
  saveInteger,
  saveRecord,
  saveString,
  validateJsonValue,
} from "../../shared/util/saveValidation.js";
import {
  approxNormal01,
  deriveSeed,
  makeRNG,
  randInt,
  weightedPick,
} from "../../shared/util/random.js";

const ACTOR_STAT_NAMES = Object.freeze([
  "strength",
  "endurance",
  "resolve",
]);

const IDENTITY_OPTIONS = Object.freeze([
  Object.freeze({
    category: "man",
    gender: Gender.M,
    noun: "man",
    pronouns: PronounSets.HE_HIM,
    weight: 45,
  }),
  Object.freeze({
    category: "woman",
    gender: Gender.F,
    noun: "woman",
    pronouns: PronounSets.SHE_HER,
    weight: 45,
  }),
  Object.freeze({
    category: "person",
    gender: Gender.NB,
    noun: "person",
    pronouns: PronounSets.THEY_THEM,
    weight: 10,
  }),
]);
const ACTOR_CATEGORIES = new Set(IDENTITY_OPTIONS.map(({ category }) => category));
const ACTOR_GENDERS = new Set(IDENTITY_OPTIONS.map(({ gender }) => gender));

export const ACTOR_PROFILES = Object.freeze({
  civilian: Object.freeze({
    id: "civilian",
    age: Object.freeze({ min: 18, max: 70 }),
    stat: Object.freeze({ min: 1, max: 9 }),
    tags: Object.freeze(["civilian"]),
  }),
});

export function hasActorProfile(profileId) {
  return Object.hasOwn(ACTOR_PROFILES, String(profileId));
}

function capitalize(value) {
  const text = String(value);
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

function rollStat(profile, rnd) {
  const { min, max } = profile.stat;
  return Math.round(min + approxNormal01(rnd) * (max - min));
}

function generateActor(seed, definition, instanceKey) {
  const profile = ACTOR_PROFILES[definition.profileId];
  if (!profile) {
    throw new Error(`Unknown temporary actor profile '${definition.profileId}'`);
  }
  const rnd = makeRNG(deriveSeed(
    seed,
    `wg-actor-v1:${instanceKey}:${definition.alias}`,
  ));
  const identity = weightedPick(IDENTITY_OPTIONS, rnd);

  return {
    id: `${instanceKey}:actor:${definition.alias}`,
    alias: definition.alias,
    profileId: profile.id,
    name: null,
    title: null,
    category: identity.category,
    noun: identity.noun,
    age: randInt(profile.age.min, profile.age.max, rnd),
    gender: identity.gender,
    pronouns: { ...identity.pronouns },
    stats: Object.fromEntries(
      ACTOR_STAT_NAMES.map((statName) => [statName, rollStat(profile, rnd)]),
    ),
    flags: {},
    body: new Body(HUMAN_BODY_TEMPLATE).toJSON(),
    meta: { tags: [...profile.tags] },
  };
}

export function generateSceneActors(seed, definitions, instanceKey) {
  const actors = Object.create(null);
  const categoryCounts = Object.create(null);

  for (const definition of definitions || []) {
    const actor = generateActor(seed, definition, instanceKey);
    categoryCounts[actor.category] = (categoryCounts[actor.category] || 0) + 1;
    actor.title = `${capitalize(actor.category)} ${categoryCounts[actor.category]}`;
    actor.name = actor.title;
    actors[definition.alias] = actor;
  }
  return actors;
}

function validatePronouns(data, path) {
  const pronouns = saveRecord(data, path);
  for (const key of ["subject", "object", "dependent", "independent", "reflexive"]) {
    saveString(requiredSaveField(pronouns, key, path), `${path}.${key}`, {
      nonEmpty: true,
    });
  }
}

function validateActorSave(data, definition, path) {
  const actor = saveRecord(data, path);
  saveString(requiredSaveField(actor, "id", path), `${path}.id`, { nonEmpty: true });
  const alias = saveString(requiredSaveField(actor, "alias", path), `${path}.alias`, {
    nonEmpty: true,
  });
  if (alias !== definition.alias) {
    failSave(`${path}.alias`, `must match scene actor alias '${definition.alias}'`);
  }
  const profileId = saveString(
    requiredSaveField(actor, "profileId", path),
    `${path}.profileId`,
    { nonEmpty: true },
  );
  if (profileId !== definition.profileId) {
    failSave(`${path}.profileId`, `must match actor profile '${definition.profileId}'`);
  }
  const name = saveString(requiredSaveField(actor, "name", path), `${path}.name`, {
    nonEmpty: true,
  });
  const title = saveString(requiredSaveField(actor, "title", path), `${path}.title`, {
    nonEmpty: true,
  });
  if (name !== title) failSave(`${path}.name`, "must match the actor title");
  const category = saveString(
    requiredSaveField(actor, "category", path),
    `${path}.category`,
    { nonEmpty: true },
  );
  if (!ACTOR_CATEGORIES.has(category)) {
    failSave(`${path}.category`, `has unknown actor category '${category}'`);
  }
  saveString(requiredSaveField(actor, "noun", path), `${path}.noun`, { nonEmpty: true });
  const profile = ACTOR_PROFILES[definition.profileId];
  saveInteger(requiredSaveField(actor, "age", path), `${path}.age`, profile.age);
  const gender = saveString(requiredSaveField(actor, "gender", path), `${path}.gender`, {
    nonEmpty: true,
  });
  if (!ACTOR_GENDERS.has(gender)) {
    failSave(`${path}.gender`, `has unknown gender '${gender}'`);
  }
  validatePronouns(requiredSaveField(actor, "pronouns", path), `${path}.pronouns`);

  const stats = saveRecord(requiredSaveField(actor, "stats", path), `${path}.stats`);
  for (const statName of Object.keys(stats)) {
    if (!ACTOR_STAT_NAMES.includes(statName)) {
      failSave(`${path}.stats.${statName}`, "is not a temporary actor stat");
    }
  }
  for (const statName of ACTOR_STAT_NAMES) {
    saveFiniteNumber(
      requiredSaveField(stats, statName, `${path}.stats`),
      `${path}.stats.${statName}`,
      { min: 0, max: 10 },
    );
  }
  const flags = saveRecord(requiredSaveField(actor, "flags", path), `${path}.flags`);
  validateJsonValue(flags, `${path}.flags`);
  validateBodySave(requiredSaveField(actor, "body", path), `${path}.body`);
  const meta = saveRecord(requiredSaveField(actor, "meta", path), `${path}.meta`);
  validateJsonValue(meta, `${path}.meta`);
  return actor;
}

export function validateSceneActorsSave(value, definitions, path) {
  const actors = saveRecord(value, path);
  const expectedAliases = new Set((definitions || []).map(({ alias }) => alias));
  for (const alias of Object.keys(actors)) {
    if (!expectedAliases.has(alias)) {
      failSave(`${path}.${alias}`, "is not declared by this scene");
    }
  }
  for (const definition of definitions || []) {
    validateActorSave(
      requiredSaveField(actors, definition.alias, path),
      definition,
      `${path}.${definition.alias}`,
    );
  }
  return actors;
}
