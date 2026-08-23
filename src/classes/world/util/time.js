export class WorldTime {
    constructor({ startDate = new Date() } = {}) {
        // Treat the Date as an absolute timestamp (ms since epoch). All *calendar* math
        // in the game should use UTC getters to stay independent of the user's timezone/DST.
        const startMs =
            typeof startDate === "number"
                ? startDate
                : startDate instanceof Date
                  ? startDate.getTime()
                  : new Date(startDate).getTime();

        this.date = new Date(startMs);
    }

    /**
     * Advance world time by N minutes.
     * Returns the number of UTC-midnight crossings (can be >1 if mins is large).
     */
    advanceMinutes(mins) {
        const MS_PER_DAY = 24 * 60 * 60 * 1000;

        const beforeDayIndex = Math.floor(
            Date.UTC(this.date.getUTCFullYear(), this.date.getUTCMonth(), this.date.getUTCDate()) /
                MS_PER_DAY,
        );

        this.date = new Date(this.date.getTime() + mins * 60 * 1000);

        const afterDayIndex = Math.floor(
            Date.UTC(this.date.getUTCFullYear(), this.date.getUTCMonth(), this.date.getUTCDate()) /
                MS_PER_DAY,
        );

        return afterDayIndex - beforeDayIndex;
    }

    /** Set the absolute world timestamp without implying that intervening time was simulated. */
    setDate(value) {
        const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
        if (!Number.isFinite(date.getTime())) {
            throw new Error(`Invalid world date: ${value}`);
        }
        this.date = date;
        return new Date(this.date.getTime());
    }

    toJSON() {
        return { date: this.date.toISOString() };
    }

    static fromJSON(data) {
        return new WorldTime({ startDate: data.date });
    }
}
