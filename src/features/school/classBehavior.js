import { SCHOOL_SUBJECTS } from "./education.js";
import { getSchoolDayState, SCHOOL_PHASE } from "./timetable.js";

export const SCHOOL_CLASS_BEHAVIOR_ID = "school.class";

function subjectFromConfig(config) {
  const subjectId = String(config?.subject ?? "");
  if (!SCHOOL_SUBJECTS[subjectId]) {
    throw new Error(`School class references unknown subject '${subjectId}'`);
  }
  return subjectId;
}

function validateSegmentPassages(definition) {
  const passageIds = (definition.passages || []).map((passage) => passage.id);
  if (
    passageIds.length === 0 ||
    passageIds.some((passageId, index) => passageId !== `segment-${index + 1}`)
  ) {
    throw new Error(
      `School class scene '${definition.id}' requires contiguous passages ` +
      `named segment-1 through segment-${passageIds.length}`,
    );
  }
}

function requireDate(value, label) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`${label} must be a valid date`);
  return time;
}

export const SCHOOL_CLASS_BEHAVIOR = Object.freeze({
  validateDefinition(definition) {
    subjectFromConfig(definition.behavior?.config);
    validateSegmentPassages(definition);
  },

  enter({ game, definition, config }) {
    const subjectId = subjectFromConfig(config);
    const state = getSchoolDayState(game);
    if (!state.atSchool || state.phase !== SCHOOL_PHASE.class) {
      throw new Error(`School class '${definition.id}' can only begin during class at school`);
    }
    if (state.subjectId !== subjectId) {
      throw new Error(
        `School class '${definition.id}' requires '${subjectId}', but ` +
        `'${String(state.subjectId)}' is scheduled`,
      );
    }
    if (!Number.isInteger(state.segment) || state.segment < 1) {
      throw new Error(`School class '${definition.id}' has no active timetable segment`);
    }
    if (typeof state.periodStartsAt !== "string" || !Number.isFinite(state.minutesIntoPeriod)) {
      throw new Error(`School class '${definition.id}' has invalid arrival timing`);
    }
    return {
      passageId: `segment-${state.segment}`,
      state: {
        periodId: state.periodId,
        subjectId,
        scheduledAt: state.periodStartsAt,
        arrivedAt: game.now.toISOString(),
        minutesLate: Math.max(0, state.minutesIntoPeriod),
        startingSegment: state.segment,
      },
    };
  },

  validateState(state, { gameTime = Infinity } = {}) {
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      throw new Error("School class state must be an object");
    }
    if (typeof state.periodId !== "string" || !state.periodId) {
      throw new Error("School class periodId must be a non-empty string");
    }
    if (!SCHOOL_SUBJECTS[state.subjectId]) {
      throw new Error(`School class references unknown subject '${String(state.subjectId)}'`);
    }
    const scheduledAt = requireDate(state.scheduledAt, "School class scheduledAt");
    const arrivedAt = requireDate(state.arrivedAt, "School class arrivedAt");
    if (scheduledAt > arrivedAt) throw new Error("School class schedule cannot follow arrival");
    if (arrivedAt > gameTime) throw new Error("School class arrival cannot be in the future");
    if (!Number.isFinite(state.minutesLate) || state.minutesLate < 0) {
      throw new Error("School class minutesLate must be non-negative");
    }
    if (!Number.isInteger(state.startingSegment) || state.startingSegment < 1) {
      throw new Error("School class startingSegment must be a positive integer");
    }
  },
});
