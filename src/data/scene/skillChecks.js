import {
  SCHOOL_SUBJECTS,
  SUBJECT_ACHIEVEMENT_MAX,
} from "../player/education.js";
import { SKILLS } from "../player/stats.js";

export const SKILL_CHECK_TARGET_TYPE = Object.freeze({
  skill: "skill",
  grade: "grade",
});

const GRADE_CHECK_TARGETS = Object.freeze(
  Object.fromEntries(
    Object.entries(SCHOOL_SUBJECTS).map(([id, subject]) => [
      id,
      Object.freeze({
        label: `${subject.label} Grade`,
        min: 0,
        max: 10,
      }),
    ]),
  ),
);

export const SKILL_CHECK_DIFFICULTIES = Object.freeze({
  trivial: Object.freeze({ label: "Trivial", chance: 1 }),
  easy: Object.freeze({ label: "Easy", target: -0.75 }),
  tricky: Object.freeze({ label: "Tricky", target: 2.5 }),
  difficult: Object.freeze({ label: "Difficult", target: 5.25 }),
  "near-impossible": Object.freeze({ label: "Impossible?", target: 7 }),
  impossible: Object.freeze({ label: "Impossible", chance: 0 }),
});

export const SKILL_CHECK_CURVE_SPREAD = 1.25;

export function getSkillCheckDifficulty(id) {
  return SKILL_CHECK_DIFFICULTIES[String(id)] ?? null;
}

export function getSkillCheckTargetDefinition(targetType, targetId) {
  const type = String(targetType);
  const id = String(targetId);
  if (type === SKILL_CHECK_TARGET_TYPE.skill) return SKILLS[id] ?? null;
  if (type === SKILL_CHECK_TARGET_TYPE.grade) {
    return GRADE_CHECK_TARGETS[id] ?? null;
  }
  return null;
}

export function getPlayerSkillCheckValue(player, targetType, targetId) {
  const type = String(targetType);
  const id = String(targetId);
  if (!getSkillCheckTargetDefinition(type, id)) {
    throw new RangeError(`Unknown skill-check target '${type}.${id}'`);
  }
  if (type === SKILL_CHECK_TARGET_TYPE.skill) {
    return player.getSkillValue(id);
  }

  return (
    player.getSubjectAchievement(id) /
    SUBJECT_ACHIEVEMENT_MAX
  ) * 10;
}

export function skillLevelForCheck(value, { min = 0, max = 10 } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new TypeError("Skill checks require a finite target value");
  }
  return Math.floor(Math.min(max, Math.max(min, numeric)));
}

export function calculateSkillCheckChance(value, difficultyId, bounds = undefined) {
  const difficulty = getSkillCheckDifficulty(difficultyId);
  if (!difficulty) {
    throw new RangeError(`Unknown skill-check difficulty '${String(difficultyId)}'`);
  }
  if (difficulty.chance !== undefined) return difficulty.chance;

  const level = skillLevelForCheck(value, bounds);
  return 1 / (1 + Math.exp((difficulty.target - level) / SKILL_CHECK_CURVE_SPREAD));
}
