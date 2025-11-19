import {
    DAY_KEYS,
    emptySchedule,
    DEFAULT_OPENING_HOURS_BY_CATEGORY,
    DEFAULT_OPENING_HOURS_BY_KEY,
} from "../../../data/data.js";

function parseTimeToMinutes(str) {
    if (!str) return null;
    const [h, m] = String(str)
        .split(":")
        .map((n) => Number(n) || 0);
    if (h === 24 && m === 0) return 24 * 60; // allow "24:00"
    return h * 60 + m;
}

function normalizeSlots(slots) {
    if (!slots) return [];
    return slots
        .map((slot) => {
            if (!slot) return null;
            if (Array.isArray(slot)) {
                const [from, to] = slot;
                return { from, to };
            }
            if (typeof slot === "object") {
                return { from: slot.from, to: slot.to };
            }
            return null;
        })
        .filter(Boolean);
}

function getDayIndexAndMinutes(atTime) {
    // Primary: native Date
    if (atTime instanceof Date) {
        return {
            dayIndex: atTime.getDay(), // 0 = Sun
            minutes: atTime.getHours() * 60 + atTime.getMinutes(),
        };
    }
    if (!atTime || typeof atTime !== "object") return null;

    // Fallback: lightweight “time-like” object
    let dayIndex = atTime.dayIndex;
    if (typeof dayIndex !== "number") {
        if (typeof atTime.day === "number") {
            dayIndex = atTime.day;
        } else if (typeof atTime.day === "string") {
            const norm = atTime.day.toLowerCase().slice(0, 3);
            dayIndex = DAY_KEYS.indexOf(norm);
        }
    }
    if (typeof dayIndex !== "number" || dayIndex < 0) return null;

    const hour = Number.isFinite(atTime.hour) ? atTime.hour : 0;
    const minute = Number.isFinite(atTime.minute) ? atTime.minute : 0;

    return {
        dayIndex: ((dayIndex % 7) + 7) % 7,
        minutes: hour * 60 + minute,
    };
}

function cloneSchedule(schedule) {
    if (!schedule) return null;
    const out = emptySchedule();
    for (const day of Object.keys(out)) {
        const slots = normalizeSlots(schedule[day]);
        out[day] = slots.map((s) => ({ from: s.from, to: s.to }));
    }
    return out;
}

function isOpenForSchedule(schedule, dayIndex, minutes) {
    const dayKey = DAY_KEYS[dayIndex];
    if (!dayKey) return true;

    const todaySlots = normalizeSlots(schedule[dayKey]);
    const prevKey = DAY_KEYS[(dayIndex + 6) % 7];
    const prevSlots = normalizeSlots(schedule[prevKey]);

    // 1) same-day slots
    for (const slot of todaySlots) {
        const start = parseTimeToMinutes(slot.from);
        const end = parseTimeToMinutes(slot.to);
        if (start == null || end == null) continue;

        if (end > start) {
            // Normal: e.g. 09:00–17:00
            if (minutes >= start && minutes < end) return true;
        } else if (end < start) {
            // Crosses midnight, this is the “late evening” part for today
            // e.g. Mon 22:00–02:00 -> Monday 22:00–24:00
            if (minutes >= start) return true;
        }
    }

    // 2) after-midnight part of previous day’s overnight slots
    for (const slot of prevSlots) {
        const start = parseTimeToMinutes(slot.from);
        const end = parseTimeToMinutes(slot.to);
        if (start == null || end == null) continue;

        if (end < start) {
            // e.g. Mon 22:00–02:00 -> Tuesday 00:00–02:00
            if (minutes < end) return true;
        }
    }

    return false;
}

function inferOpeningHours({ key, category }) {
    if (DEFAULT_OPENING_HOURS_BY_KEY[key]) {
        return DEFAULT_OPENING_HOURS_BY_KEY[key];
    }
    if (category && DEFAULT_OPENING_HOURS_BY_CATEGORY[category]) {
        return DEFAULT_OPENING_HOURS_BY_CATEGORY[category];
    }
    return null;
}

// ---- Place class ---------------------------------------------------

export class Place {
    constructor({ id, key, name, locationId, props = {} }) {
        this.id = id; // unique string id for this instance
        this.key = key; // registry key ("park", "bus_stop", ...)
        this.name = name; // human label ("Central Park", "Bus Stop")
        this.locationId = locationId; // where on the map it lives

        const inferredHours = inferOpeningHours({
            key,
            category: props.category,
        });

        // clone schedule so instances don't share mutable state
        const openingHours = props.openingHours || inferredHours;
        this.props = {
            ...props,
            ...(openingHours
                ? { openingHours: cloneSchedule(openingHours) }
                : {}),
        };
    }

    /**
     * Check if the place is open at the given local time.
     *
     * @param {Date|{dayIndex?:number, day?:number|string, hour?:number, minute?:number}} atTime
     *   Use a Date (e.g. worldTime.date) or a small `{ dayIndex, hour, minute }` object.
     */
    isOpen(atTime = new Date()) {
        const schedule = this.props && this.props.openingHours;
        if (!schedule) {
            // no hours defined => treat as always accessible
            return true;
        }
        const info = getDayIndexAndMinutes(atTime);
        if (!info) return true;
        const { dayIndex, minutes } = info;
        return isOpenForSchedule(schedule, dayIndex, minutes);
    }
}
