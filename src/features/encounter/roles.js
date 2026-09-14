function fail(message) {
  throw new Error(`Physical encounter roles: ${message}`);
}

export function participantIds(state) {
  return Object.keys(state?.participants || {});
}

export function controlledParticipantId(state) {
  const matches = participantIds(state).filter(
    (participantId) => state.participants[participantId]?.ref?.type === "player",
  );
  if (matches.length !== 1) fail("a fight requires exactly one player-controlled participant");
  return matches[0];
}

export function opponentParticipantId(state, actorId = controlledParticipantId(state)) {
  const ids = participantIds(state);
  if (!ids.includes(actorId)) fail(`unknown participant '${String(actorId)}'`);
  if (ids.length !== 2) fail("the fight scenario currently requires exactly two participants");
  return ids.find((participantId) => participantId !== actorId);
}

export function goalOwnerId(state) {
  const ownerId = state?.objective?.ownerId;
  if (!participantIds(state).includes(ownerId)) fail("the goal owner is not a participant");
  return ownerId;
}

export function goalTargetId(state) {
  const targetId = state?.objective?.targetId;
  if (!participantIds(state).includes(targetId)) fail("the goal target is not a participant");
  return targetId;
}

export function isControlledParticipant(state, actorId) {
  return controlledParticipantId(state) === actorId;
}

export function isGoalOwner(state, actorId) {
  return goalOwnerId(state) === actorId;
}
