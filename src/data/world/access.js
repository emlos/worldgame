export const NPC_HOME_ACCESS_FLAG_PREFIX = "home_access_";

export function npcHomeAccessFlag(npcId) {
  const id = String(npcId ?? "").trim();
  if (!id) throw new TypeError("NPC home access flags require an NPC id");
  return `${NPC_HOME_ACCESS_FLAG_PREFIX}${id}`;
}
