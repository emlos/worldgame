
import { ymd } from "../../../shared/modules.js";

import {
    DayKind,
    HOLIDAY_REGISTRY,
    RANDOM_HOLIDAYS,
    HolidayCategory, MS_PER_DAY
} from "../../../data/data.js";

/**
 * Calendar: builds & holds holiday/special info for a given year.
 */
export class Calendar {
    constructor({ year, rnd }) {
        this.rnd = rnd || Math.random;
        this.map = new Map();
        this.randomHolidayAssignments = new Map();

        // one-time, per-calendar-instance random placements
        this._initRandomHolidays();

        this.setYear(year);
    }

    /** Pick stable random dates for RANDOM_HOLIDAYS (per Calendar instance). */
    _initRandomHolidays() {
        const used = new Set(); // avoid duplicates among random holidays themselves

        for (const def of RANDOM_HOLIDAYS) {
            let month, day, key;
            do {
                ({ month, day } = randomMonthDay(this.rnd));
                key = `${month}-${day}`;
            } while (used.has(key));
            used.add(key);
            this.randomHolidayAssignments.set(def.name, { month, day });
        }
    }

    /** Explicitly set the calendar year and rebuild if it changed. */
    setYear(year) {
        if (this.year === year) return;
        this.year = year;
        this._buildYear();
    }

    /** Internal builder for the current year. */
    _buildYear() {
        const year = this.year;
        this.map.clear();

        const add = (m, d, holidayDef) => {
            const {
                name,
                category,
                special = false,
                dayOff = false,
            } = holidayDef;
            const key = ymd(year, m, d);

            if (!this.map.has(key)) {
                this.map.set(key, {
                    holidays: [],
                    specials: [],
                    dayOff: false,
                });
            }

            const v = this.map.get(key);
            const entry = { name, category };

            if (special) {
                v.specials.push(entry);
            } else {
                v.holidays.push(entry);
            }

            if (dayOff) v.dayOff = true;
        };

        // From registry
        for (const def of HOLIDAY_REGISTRY) {
            const dates = def.resolveDates(year);
            for (const { month, day } of dates) {
                add(month, day, def);
            }
        }

        // Randoms: use stable assignments
        for (const def of RANDOM_HOLIDAYS) {
            const assigned = this.randomHolidayAssignments.get(def.name);
            if (!assigned) continue;
            add(assigned.month, assigned.day, def);
        }
    }

    /**
     * Get info for a specific Date.
     */
    getDayInfo(date) {
        const y = date.getUTCFullYear();
        const key = ymd(y, date.getUTCMonth() + 1, date.getUTCDate());
        const info = this.map.get(key) || {
            holidays: [],
            specials: [],
            dayOff: false,
        };

        const dow = date.getUTCDay(); // 0=Sunday
        const isWeekend = dow === 0 || dow === 6;
        const dayOff = info.dayOff || isWeekend;

        return {
            ...info,
            isWeekend,
            dayOff,
            kind: dayOff ? DayKind.DAY_OFF : DayKind.WORKDAY,
        };
    }

    daysUntil(name, fromDate) {
        const target = name.toLowerCase();
        const fromYear = fromDate.getUTCFullYear();

        if (fromYear !== this.year) {
            return undefined;
        }

        const fromMidnight = new Date(Date.UTC(
            fromYear,
            fromDate.getUTCMonth(),
            fromDate.getUTCDate()
        ));

        let best = Infinity;

        for (const [key, info] of this.map.entries()) {
            const allNames = [...info.holidays, ...info.specials].map((h) =>
                typeof h === "string" ? h : h.name
            );

            const matches = allNames.some((n) => n.toLowerCase() === target);
            if (!matches) continue;

            const [yStr, mStr, dStr] = key.split("-");
            const y = parseInt(yStr, 10);
            const m = parseInt(mStr, 10) - 1;
            const d = parseInt(dStr, 10);

            if (y !== fromYear) continue;

            const targetDate = new Date(Date.UTC(y, m, d));
            const diffDays = Math.round(
                (targetDate - fromMidnight) / MS_PER_DAY
            );

            if (diffDays >= 0 && diffDays < best) best = diffDays;
        }

        return Number.isFinite(best) ? best : undefined;
    }
}

/** Gregorian leap year check */
const isLeap = (year) =>
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

/** Random YYYY-MM-DD string helper for a given year & RNG. */
function randomYmd(year, rnd) {
    const monthDays = [
        31,
        isLeap(year) ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];

    const month = Math.floor(rnd() * 12) + 1; // 1–12
    const day = Math.floor(rnd() * monthDays[month - 1]) + 1; // 1–days in month

    return ymd(year, month, day);
}

/** Helper: pick a random (month, day) pair, independent of target year. */
function randomMonthDay(rnd) {
    const dateStr = randomYmd(2000, rnd); // year here doesn’t matter
    const [, mStr, dStr] = dateStr.split("-");
    return { month: Number(mStr), day: Number(dStr) };
}
