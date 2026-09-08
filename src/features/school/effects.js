import {
  adjustSubjectAchievement,
  recordSubjectAttendance,
} from "./education.js";

export const SCHOOL_WG_EFFECT_HANDLERS = Object.freeze({
  grade(game, effect) {
    adjustSubjectAchievement(game, effect.id, effect.amount);
  },
  attendance(game, effect) {
    recordSubjectAttendance(game, effect.id, effect.amount);
  },
});
