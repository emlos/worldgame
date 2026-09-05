export const PLACE_ENTER_MINUTES = 2;
export const PLACE_LEAVE_MINUTES = 1;

export function getPlaceTransitionMinutes({
  fromLocationId,
  fromPlaceId = null,
  targetLocationId,
  targetPlaceId = null,
} = {}) {
  const samePosition =
    String(fromLocationId) === String(targetLocationId) &&
    String(fromPlaceId ?? "") === String(targetPlaceId ?? "");

  if (samePosition) {
    return { leaveMinutes: 0, enterMinutes: 0, totalMinutes: 0 };
  }

  const leaveMinutes = fromPlaceId == null ? 0 : PLACE_LEAVE_MINUTES;
  const enterMinutes = targetPlaceId == null ? 0 : PLACE_ENTER_MINUTES;
  return {
    leaveMinutes,
    enterMinutes,
    totalMinutes: leaveMinutes + enterMinutes,
  };
}
