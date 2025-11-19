// --------------------------
// Skills
// --------------------------

/**
 * Skill can be a flag or a meter 0..1. Store as { type: 'flag'|'meter', value }.
 */
export const makeFlagSkill = (initial = false) => ({
    type: "flag",
    value: !!initial,
});
export const makeMeterSkill = (initial = 0) => ({
    type: "meter",
    value: clamp(initial, 0, 1),
});
