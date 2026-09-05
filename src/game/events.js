const EVENT_NAMES = Object.freeze(["time", "timeJump", "location"]);

export function createGameEventListeners() {
  return Object.fromEntries(EVENT_NAMES.map((name) => [name, new Set()]));
}

export function emitGameEvent(game, eventName, args) {
  const listeners = game._listeners[eventName];
  if (!listeners) throw new Error(`Unknown event type: ${eventName}`);
  for (const callback of listeners) callback(...args);
}

export function subscribeGameEvent(game, eventName, callback) {
  const listeners = game._listeners[eventName];
  if (!listeners) throw new Error(`Unknown event type: ${eventName}`);
  listeners.add(callback);
  return () => listeners.delete(callback);
}
