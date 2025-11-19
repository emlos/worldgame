
import { MS_PER_DAY, MoonPhase } from "../../../data/data.js";
export class Moon {
    constructor({ startDate = new Date() } = {}) {
        this._date = new Date(startDate);
    }

    /** Keep Moon in sync with world time. */
    setDate(date) {
        this._date = new Date(date);
    }

    /** Convenience if you prefer to call it like Weather.step. */
    step(_minutes, currentDate) {
        // World.advance calls this after time is advanced; just mirror the world time.
        if (currentDate instanceof Date) this._date = new Date(currentDate);
    }

    /**
     * Compute moon info for a given date (default: internal date).
     * Returns: { age, fraction, phase, angle }
     *  - age: days since new moon (0..~29.53)
     *  - fraction: illuminated fraction (0..1)
     *  - phase: named phase (string)
     *  - angle: phase angle in degrees (0..360)
     */
    getInfo(date = this._date) {
        const tDays =
            (Date.UTC(
                date.getFullYear(),
                date.getMonth(),
                date.getDate(),
                date.getHours(),
                date.getMinutes(),
                date.getSeconds(),
                date.getMilliseconds()
            ) -
                EPOCH_MS) /
            MS_PER_DAY;

        const age = posMod(tDays, SYNODIC);
        const angle = (360 * age) / SYNODIC; // 0..360
        const fraction = (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2; // 0..1
        const phase = classifyPhase(age);
        return { age, fraction, phase, angle };
    }

    /** Named phase for quick access. */
    getPhase(date = this._date) {
        return this.getInfo(date).phase;
    }
}

function posMod(x, m) {
    return ((x % m) + m) % m;
}

/** Map fractional cycle position to a named phase. */
function classifyPhase(ageDays) {
    const p = ageDays / SYNODIC; // 0..1
    if (p < 1 / 16 || p >= 15 / 16) return MoonPhase.NEW;
    if (p < 3 / 16) return MoonPhase.WAXING_CRESCENT;
    if (p < 5 / 16) return MoonPhase.FIRST_QUARTER;
    if (p < 7 / 16) return MoonPhase.WAXING_GIBBOUS;
    if (p < 9 / 16) return MoonPhase.FULL;
    if (p < 11 / 16) return MoonPhase.WANING_GIBBOUS;
    if (p < 13 / 16) return MoonPhase.LAST_QUARTER;
    return MoonPhase.WANING_CRESCENT;
}



const SYNODIC = 29.530588853;

const EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14, 0, 0);
