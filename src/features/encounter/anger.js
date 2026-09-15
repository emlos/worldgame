import { getAiPersonality } from "./personality.js";
import { goalOwnerId } from "./roles.js";

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function angerBandFor(value) {
  if (value < 20) return "controlled";
  if (value < 45) return "irritated";
  if (value < 70) return "angry";
  if (value < 90) return "enraged";
  return "furious";
}

/** Convert actual harm suffered by the NPC into encounter-local anger. */
export function updateNpcAngerFromEvents(context, events) {
  const ownerId = goalOwnerId(context.state);
  const owner = context.state.participants[ownerId];
  const personality = getAiPersonality(owner.controller.personalityId);
  const damage = events.reduce((total, event) => {
    if (event.type !== "impact.landed"
      || event.targetId !== ownerId
      || event.actorId === ownerId) return total;
    return total + Math.max(0, Number(event.damage) || 0);
  }, 0);
  if (damage <= 0) return null;

  const from = owner.anger;
  const amount = Math.max(1, Math.round(damage * 2 * personality.anger.damageSensitivity));
  owner.anger = clamp(from + amount, 0, 100);
  if (owner.anger === from) return null;
  const event = {
    type: "anger.changed",
    actorId: ownerId,
    from,
    to: owner.anger,
    amount: owner.anger - from,
    cause: "injured-by-opponent",
  };
  events.push(event);
  return event;
}
