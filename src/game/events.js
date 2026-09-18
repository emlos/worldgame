const EVENT_NAMES = Object.freeze(["time", "timeJump", "location"]);
const EVENT_TRANSACTIONS = new WeakMap();

export function createGameEventListeners() {
  return Object.fromEntries(EVENT_NAMES.map((name) => [name, new Set()]));
}

export function beginGameEventTransaction(game) {
  const stack = EVENT_TRANSACTIONS.get(game) ?? [];
  stack.push([]);
  EVENT_TRANSACTIONS.set(game, stack);
}

export function commitGameEventTransaction(game) {
  const stack = EVENT_TRANSACTIONS.get(game);
  if (!stack?.length) {
    throw new Error("No game event transaction is active");
  }

  const queued = stack.pop();
  if (stack.length) {
    stack.at(-1).push(...queued);
    return;
  }

  EVENT_TRANSACTIONS.delete(game);
  const errors = [];
  for (const event of queued) {
    for (const callback of event.listeners) {
      try {
        callback(...event.args);
      } catch (error) {
        errors.push(error);
      }
    }
  }

  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, "Game event listeners failed after commit");
  }
}

export function rollbackGameEventTransaction(game) {
  const stack = EVENT_TRANSACTIONS.get(game);
  if (!stack?.length) {
    throw new Error("No game event transaction is active");
  }

  stack.pop();
  if (!stack.length) EVENT_TRANSACTIONS.delete(game);
}

export function emitGameEvent(game, eventName, args) {
  const listeners = game._listeners[eventName];
  if (!listeners) throw new Error(`Unknown event type: ${eventName}`);

  const callbacks = [...listeners];
  const stack = EVENT_TRANSACTIONS.get(game);
  if (stack?.length) {
    stack.at(-1).push({ eventName, args, listeners: callbacks });
    return;
  }

  dispatchGameEvent(callbacks, args);
}

export function subscribeGameEvent(game, eventName, callback) {
  const listeners = game._listeners[eventName];
  if (!listeners) throw new Error(`Unknown event type: ${eventName}`);
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function dispatchGameEvent(listeners, args) {
  for (const callback of listeners) callback(...args);
}
