import { DEFAULT_NPC_INTERACTION_MINUTES } from "../../game/scene/actions.js";

export function getNPCsAtLocation(game, locationId = game.currentLocationId) {
  const id = String(locationId);
  return game.npcsArray.filter((npc) => String(npc.locationId) === id);
}

export function getNPCsAtCurrentPosition(game) {
  const locationId = String(game.currentLocationId);
  const placeId = game.currentPlaceId == null ? null : String(game.currentPlaceId);
  return game.npcsArray.filter(
    (npc) =>
      String(npc.locationId) === locationId &&
      (npc.currentPlaceId == null ? null : String(npc.currentPlaceId)) === placeId,
  );
}

export function getNPCInteractionAccess(
  game,
  npcOrId,
  { at = game.now, durationMinutes = DEFAULT_NPC_INTERACTION_MINUTES } = {},
) {
  const date = at instanceof Date ? new Date(at.getTime()) : new Date(at);
  const duration = Number(durationMinutes);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError("NPC interaction access requires a valid date");
  }
  if (!Number.isFinite(duration) || duration < 0) {
    throw new TypeError("NPC interaction duration must be a non-negative number");
  }

  const npc =
    npcOrId && typeof npcOrId === "object"
      ? npcOrId
      : game.npcs.get(String(npcOrId));
  if (!npc || game.npcs.get(String(npc.id)) !== npc) {
    return { allowed: false, code: "unknown-npc", npc: null };
  }
  if (!getNPCsAtCurrentPosition(game).includes(npc)) {
    return { allowed: false, code: "not-here", npc };
  }
  if (npc.brain?.isBusyWithObligation) {
    return { allowed: false, code: "busy-obligation", npc };
  }

  const conflict = npc.brain?.getInteractionObligationConflict?.(game, {
    at: date,
    durationMinutes: duration,
  });
  if (conflict) {
    return { allowed: false, code: "obligation-deadline", npc, conflict };
  }
  return { allowed: true, code: "allowed", npc };
}
