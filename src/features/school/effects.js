export const SCHOOL_WG_EFFECT_HANDLERS = Object.freeze({
  grade(game, effect) {
    game.player.adjustSubjectAchievement(effect.id, effect.amount);
  },
  attendance(game, effect) {
    game.player.recordSubjectAttendance(effect.id, effect.amount);
  },
});
