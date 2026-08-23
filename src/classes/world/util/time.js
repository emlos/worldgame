const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

function timestampFrom(value, label = "world date") {
  const timestamp =
    value instanceof Date ? value.getTime() : new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    throw new TypeError(`Invalid ${label}: ${String(value)}`);
  }

  return timestamp;
}

/**
 * Authoritative world clock.
 *
 * The instant is stored as a number so no caller can mutate it through a shared
 * Date object. Date-valued accessors always return a fresh snapshot.
 */
export class WorldTime {
  #timestamp;

  constructor({ startDate = new Date() } = {}) {
    this.#timestamp = timestampFrom(startDate, "world start date");
  }

  /** Milliseconds since the Unix epoch. Safe to pass around as an immutable value. */
  get timestamp() {
    return this.#timestamp;
  }

  /** A defensive Date snapshot of the current instant. */
  get date() {
    return this.toDate();
  }

  /** A defensive Date snapshot of the current instant. */
  toDate() {
    return new Date(this.#timestamp);
  }

  /**
   * Advance world time by N minutes.
   * Returns the number of UTC-midnight crossings (negative when rewinding).
   */
  advanceMinutes(minutes) {
    const amount = Number(minutes);
    if (!Number.isFinite(amount)) {
      throw new TypeError(`Invalid minute amount: ${String(minutes)}`);
    }

    const target = this.#timestamp + amount * MS_PER_MINUTE;
    timestampFrom(target, "resulting world date");

    const beforeDay = Math.floor(this.#timestamp / MS_PER_DAY);
    const afterDay = Math.floor(target / MS_PER_DAY);
    this.#timestamp = target;
    return afterDay - beforeDay;
  }

  /** Set the absolute world timestamp without simulating intervening gameplay. */
  setDate(value) {
    this.#timestamp = timestampFrom(value);
    return this.toDate();
  }

  toJSON() {
    return { date: new Date(this.#timestamp).toISOString() };
  }

  static fromJSON(data) {
    if (!data || !Object.prototype.hasOwnProperty.call(data, "date")) {
      throw new TypeError("WorldTime.fromJSON requires a saved date");
    }
    return new WorldTime({ startDate: data.date });
  }
}
