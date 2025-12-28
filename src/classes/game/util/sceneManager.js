/**
 * SceneManager
 * ------------------------------------------------------------------
 * A tiny Twine-like scene runner.
 *
 * Supports, for now:
 *  - Conditions: locationId, locationTag, placeKey, required NPCs,
 *    time of day, player flags
 *  - Priority resolution
 *  - Choices that advance time, set/clear flags, move/set place,
 *    and jump to a specific next scene
 *  - Conditional text blocks within a single scene (avoid variants)
 */

//TODO: remove menu/isMenu/autoExit/autoTraversal

import { formatHHMMUTC } from "../../../shared/modules.js";
import { DAY_KEYS } from "../../../data/data.js";
const uniq = (arr) => Array.from(new Set(arr));

function asArray(v) {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
}

function normalizeStringSet(v) {
    return uniq(asArray(v).filter(Boolean).map(String));
}

function normalizeHour24(hour) {
    const h = Number(hour);
    if (!Number.isFinite(h)) return 0;
    return ((h % 24) + 24) % 24;
}

function toFiniteNumber(v, fallback = 0) {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * Hour gating for scene conditions.
 *
 * Supported forms:
 *  - hour: 18                (exact hour)
 *  - hour: [18, 19, 20]      (any of these hours)
 *  - hour: { gte: 18, lt: 24 }  (comparators, AND-ed)
 *  - hour: { between: [22, 5] } (wraps midnight; start inclusive, end exclusive)
 */
function matchesHourGate(rule, currentHourUTC) {
    const h = normalizeHour24(currentHourUTC);

    if (rule == null) return true;

    // exact match / list match
    if (typeof rule === "number" || typeof rule === "string") {
        return h === normalizeHour24(rule);
    }
    if (Array.isArray(rule)) {
        return rule.map(normalizeHour24).includes(h);
    }

    if (typeof rule !== "object") return false;

    // between: [start, end)
    if (Array.isArray(rule.between) && rule.between.length >= 2) {
        const start = normalizeHour24(rule.between[0]);
        const end = normalizeHour24(rule.between[1]);

        // If identical, treat as "all day" rather than "empty set"
        if (start !== end) {
            if (start < end) {
                if (!(h >= start && h < end)) return false;
            } else {
                // wraps midnight, e.g. [22, 5)
                if (!(h >= start || h < end)) return false;
            }
        }
    }

    if (rule.gt != null && !(h > Number(rule.gt))) return false;
    if (rule.gte != null && !(h >= Number(rule.gte))) return false;
    if (rule.lt != null && !(h < Number(rule.lt))) return false;
    if (rule.lte != null && !(h <= Number(rule.lte))) return false;

    if (rule.eq != null && !(h === normalizeHour24(rule.eq))) return false;
    if (rule.ne != null && !(h !== normalizeHour24(rule.ne))) return false;

    return true;
}

/**
 * Generic numeric gating (for player stats, meter skills, etc).
 *
 * Supported forms:
 *  - 5                      (exact)
 *  - [3, 4, 5]              (any)
 *  - { gte: 5 }             (comparators, AND-ed)
 *  - { between: [3, 7] }    (inclusive)
 */
function matchesNumberGate(rule, value) {
    const v = toFiniteNumber(value, NaN);

    if (rule == null) return true;

    if (typeof rule === "number" || typeof rule === "string") {
        return v === toFiniteNumber(rule, NaN);
    }

    if (Array.isArray(rule)) {
        const set = rule.map((x) => toFiniteNumber(x, NaN));
        return set.includes(v);
    }

    if (typeof rule !== "object") return false;

    if (Array.isArray(rule.between) && rule.between.length >= 2) {
        const lo = toFiniteNumber(rule.between[0], NaN);
        const hi = toFiniteNumber(rule.between[1], NaN);
        if (!(v >= lo && v <= hi)) return false;
    }

    if (rule.gt != null && !(v > toFiniteNumber(rule.gt, NaN))) return false;
    if (rule.gte != null && !(v >= toFiniteNumber(rule.gte, NaN))) return false;
    if (rule.lt != null && !(v < toFiniteNumber(rule.lt, NaN))) return false;
    if (rule.lte != null && !(v <= toFiniteNumber(rule.lte, NaN))) return false;

    if (rule.eq != null && !(v === toFiniteNumber(rule.eq, NaN))) return false;
    if (rule.ne != null && !(v !== toFiniteNumber(rule.ne, NaN))) return false;

    return true;
}

function getConditionBlock(obj) {
    if (!obj || typeof obj !== "object") return null;
    // Normalize naming: anywhere you can write conditions, you can use any of these keys.
    return obj.when || obj.if || obj.conditions || obj.condition || null;
}

function isValidDateSpec(v) {
    return v && typeof v === "object" && (v.day != null || v.month != null || v.year != null);
}

function ymdKey({ year, month, day }) {
    const y = Number(year) || 0;
    const m = Number(month) || 0;
    const d = Number(day) || 0;
    return y * 10000 + m * 100 + d;
}

function daysInMonthUTC(year, month1to12) {
    const y = Number(year);
    const m = Number(month1to12);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return 31;
    // Date.UTC month is 0-based; day 0 gives last day of previous month.
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function normalizeDateSpecMin(spec, refDate) {
    const refY = refDate.getUTCFullYear();
    const y = spec.year != null ? Number(spec.year) : refY;
    const m = spec.month != null ? Number(spec.month) : 1;
    const d = spec.day != null ? Number(spec.day) : 1;
    return { year: y, month: m, day: d };
}

function normalizeDateSpecMax(spec, refDate) {
    const refY = refDate.getUTCFullYear();
    const y = spec.year != null ? Number(spec.year) : refY;
    const m = spec.month != null ? Number(spec.month) : 12;
    const d = spec.day != null ? Number(spec.day) : daysInMonthUTC(y, m);
    return { year: y, month: m, day: d };
}

function formatMinutesSuffix(localizer, minutes) {
    if (!localizer) return "";
    const m = Number(minutes) || 0;
    if (m <= 0) return "";

    const unitKey = m === 1 ? "time.minute.singular" : "time.minute.plural";
    const unit = localizer.t(unitKey);
    return ` (${m} ${unit})`;
}

function isOutside(game) {
    // Outside = not currently inside a concrete or virtual place.
    // Canonical representation: no placeId and no placeKey.
    return !game?.currentPlaceId && !game?.currentPlaceKey;
}

function isInsidePlace(game) {
    // Inside a place = either we have a concrete placeId, or an explicit virtual placeKey.
    if (isOutside(game)) return false;
    return Boolean(game?.currentPlaceId || game?.currentPlaceKey);
}

export class SceneManager {
    constructor({
        game,
        scenes = [],
        localizer = null,
        rnd = Math.random,
        // If false, SceneManager will not resolve any scene until start() is called.
        autoStart = true,
        // The very first scene shown when the game starts (first update).
        // If omitted, SceneManager will try to pick a reasonable default.
        defaultSceneId = null,
        // Scene to show when we cannot resolve a next scene (invalid forced id,
        // nothing matches, etc). If omitted, SceneManager will fall back to the
        // first registered scene.
        fallbackSceneId = null,
    } = {}) {
        if (!game) throw new Error("SceneManager requires { game }");
        this.game = game;
        this.rnd = rnd || Math.random;
        this.localizer = localizer;

        this._started = Boolean(autoStart);

        this.defaultSceneId = defaultSceneId ? String(defaultSceneId) : null;
        this.fallbackSceneId = fallbackSceneId ? String(fallbackSceneId) : null;

        this._sceneDefs = new Map(); // id -> def
        this.registerScenes(scenes);

        // Only use defaultSceneId once (on the first resolution).
        this._hasShownDefaultScene = false;

        this.activeSceneId = null;
        this._queue = []; // [{ sceneId, priority }]

        // Remember random picks for the currently active scene's text blocks.
        // This prevents re-rolls when UI calls getPresentation() repeatedly.
        // Map: sceneId -> Map(pickId -> chosenKey)
        this._textBlockPicks = new Map();

        // During an action, game setters may call update() repeatedly.
        // Suspend updates to avoid double-resolutions and random re-rolls.
        this._suspendUpdates = 0;
        this._pendingUpdate = false;
    }

    setLocalizer(localizer) {
        this.localizer = localizer;
        this.update();
    }

    registerScenes(defs) {
        for (const def of defs || []) {
            if (!def || !def.id) continue;
            this._sceneDefs.set(String(def.id), def);
        }

        // Late-bind defaults if caller didn't specify them.
        // This keeps the SceneManager usable out of the box for sample packs.
        if (!this.defaultSceneId) {
            if (this._sceneDefs.has("game.start")) this.defaultSceneId = "game.start";
            else if (this._sceneDefs.has("home.default")) this.defaultSceneId = "home.default";
        }
        if (!this.fallbackSceneId) {
            if (this._sceneDefs.has("system.fallback")) this.fallbackSceneId = "system.fallback";
        }
    }

    getSceneDef(id) {
        return this._sceneDefs.get(String(id)) || null;
    }

    queueScene(sceneId, priority = 999) {
        const id = String(sceneId);
        if (!this._sceneDefs.has(id)) {
            throw new Error(`Cannot queue unknown scene '${id}'`);
        }
        this._queue.push({ sceneId: id, priority: Number(priority) || 0 });
        // keep highest priority at the end for O(1) pop
        this._queue.sort((a, b) => (a.priority || 0) - (b.priority || 0));
        this.update();
    }

    /**
     * Start resolving scenes (use for "Start Game" buttons).
     * Resets the one-time default-scene selection.
     */
    start({ forceSceneId = null } = {}) {
        this._started = true;
        this._hasShownDefaultScene = false;
        return this.update({ forceSceneId });
    }

    // --------------------------
    // Resolution
    // --------------------------

    update({ forceSceneId = null } = {}) {
        if (!this._started) return null;

        if (this._suspendUpdates > 0) {
            this._pendingUpdate = true;
            return null;
        }

        let nextId = forceSceneId ? String(forceSceneId) : null;

        // 0) Initial/default scene
        if (!nextId && !this._hasShownDefaultScene && this.defaultSceneId) {
            if (this._sceneDefs.has(this.defaultSceneId)) {
                nextId = this.defaultSceneId;
            }
            this._hasShownDefaultScene = true;
        }

        // If a forced id is invalid, route to fallback (instead of breaking).
        if (nextId && !this._sceneDefs.has(nextId)) {
            nextId = null;
            if (this.fallbackSceneId && this._sceneDefs.has(this.fallbackSceneId)) {
                nextId = this.fallbackSceneId;
            }
        }

        // 1) Forced queue (e.g. urgent medical scene)
        if (!nextId && this._queue.length) {
            nextId = this._queue.pop().sceneId;
        }

        // 2) Best matching scene by conditions + priority
        if (!nextId) {
            const matches = [];
            for (const def of this._sceneDefs.values()) {
                if (this._matches(def)) matches.push(def);
            }
            if (matches.length) {
                matches.sort((a, b) => (b.priority || 0) - (a.priority || 0));
                nextId = String(matches[0].id);
            }
        }

        // 3) Fallback to any scene (stable) if nothing matches
        if (!nextId) {
            // Prefer an explicit fallback scene if configured.
            if (this.fallbackSceneId && this._sceneDefs.has(this.fallbackSceneId)) {
                nextId = this.fallbackSceneId;
            } else {
                const first = this._sceneDefs.keys().next();
                nextId = first.done ? null : first.value;
            }
        }

        if (!nextId || !this._sceneDefs.has(nextId)) return null;

        // When we enter a new scene, reset random text picks for that scene.
        if (this.activeSceneId !== nextId) {
            this._textBlockPicks.delete(nextId);
        }
        this.activeSceneId = nextId;
        if (!this._textBlockPicks.has(nextId)) this._textBlockPicks.set(nextId, new Map());

        const presentation = this.getPresentation(nextId);
        // If the def was somehow removed mid-flight, do not crash.
        if (!presentation) {
            if (this.fallbackSceneId && this._sceneDefs.has(this.fallbackSceneId)) {
                this.activeSceneId = this.fallbackSceneId;
                const fb = this.getPresentation(this.fallbackSceneId);
                this.game.startScene(fb);
                return fb;
            }
            return null;
        }
        this.game.startScene(presentation);
        return presentation;
    }

    getPresentation(sceneId = this.activeSceneId) {
        const id = String(sceneId || "");
        const def = this.getSceneDef(id);
        if (!def) return null;

        const vars = this._buildVars();

        const resolved = this._resolveSceneText({ def, sceneId: id, vars });

        // Scene-level toggle for auto-generated navigation choices (exit/traversal).
        // Default is OFF; only scenes that opt in will get injected choices.
        const auto = this._normalizeAutoChoices(def);

        const choices = [];
        for (const c of def.choices || []) {
            const cond = getConditionBlock(c);
            const ok = !cond || this._matchesConditions(cond);

            // Choice-level conditions work like scene/text conditions.
            // If a choice doesn't match, it is normally hidden, unless showAnyway is true.
            const showAnyway = c?.showAnyway === true;
            if (!ok && !showAnyway) continue;

            const presented = this._presentChoice(c, vars);
            if (!ok) presented.disabled = true;
            choices.push(presented);
        }

        // --- Auto navigation choices (opt-in per scene) ---------------------------
        // When outside (not inside a place), optionally add travel options to
        // connected locations and places available in the current location.
        if (auto.traversal === true && isOutside(this.game)) {
            this._injectTraversalChoices({ choices, vars });
        }

        // When inside any place (real or virtual), optionally ensure an Exit option exists.
        if (auto.exit === true && isInsidePlace(this.game)) {
            this._injectExitChoice({ choices, vars });
        }

        return {
            id,
            def,
            // For debugging / tooling:
            textKey: resolved.primaryTextKey,
            textKeys: resolved.textKeys,
            text: resolved.text,
            vars,
            choices,
        };
    }
    _presentChoice(def, vars) {
        const minutes = Number(def.minutes) || 0;
        const extraVars =
            def && typeof def.vars === "object" && !Array.isArray(def.vars) ? def.vars : null;
        const choiceVars = { ...vars, ...(extraVars || {}), minutes };

        const textKey = typeof def.text === "string" ? def.text : "";
        const keyForLabel = textKey || String(def.id);
        const baseLabel = this.localizer ? this.localizer.t(keyForLabel, choiceVars) : keyForLabel;

        const hideMinutes = def?.hideMinutes === true;
        const label = baseLabel + (hideMinutes ? "" : formatMinutesSuffix(this.localizer, minutes));

        return {
            id: String(def.id),
            textKey,
            text: label,
            minutes,
            disabled: false,
            _def: def,
        };
    }

    /**
     * Normalize the scene-level auto-choice config.
     *
     * Supported forms:
     *  - (default) omitted -> { traversal: false, exit: false }
     *  - { menu: true } or { isMenu: true } -> both true
     *  - { autoChoices: true } -> both true
     *  - { autoChoices: { traversal: true, exit: true } }
     *  - { autoTraversal: true/false } and/or { autoExit: true/false } (overrides)
     */
    _normalizeAutoChoices(def) {
        // Default: no auto-injected navigation choices.
        const out = { traversal: false, exit: false };
        if (!def || typeof def !== "object") return out;

        // Convenience toggles: menu/isMenu implies both.
        if (def.menu === true || def.isMenu === true) {
            out.traversal = true;
            out.exit = true;
        }

        // Primary shape: autoChoices (boolean or object).
        const ac = def.autoChoices;
        if (ac === true) {
            out.traversal = true;
            out.exit = true;
        } else if (ac && typeof ac === "object") {
            if (ac.traversal === true) out.traversal = true;
            if (ac.exit === true) out.exit = true;
        }

        // Explicit overrides.
        if (def.autoTraversal === true) out.traversal = true;
        if (def.autoTraversal === false) out.traversal = false;

        if (def.autoExit === true) out.exit = true;
        if (def.autoExit === false) out.exit = false;

        return out;
    }

    _injectTraversalChoices({ choices, vars }) {
        const loc = this.game.location;
        if (!loc) return;

        const existing = new Set(choices.map((c) => String(c.id)));

        // 1) Connected locations (graph neighbors)
        for (const [neighborId, edge] of loc.neighbors || []) {
            const id = `travel.location.${String(neighborId)}`;
            if (existing.has(id)) continue;
            const nb = this.game.world?.getLocation?.(neighborId) || null;
            if (!nb) continue;

            const def = {
                id,
                text: "choice.travel.toLocation",
                minutes: Number(edge?.minutes) || 0,
                moveToLocationId: String(neighborId),
                vars: { destName: nb.name },
            };

            choices.push(this._presentChoice(def, vars));
            existing.add(id);
        }

        // 2) Places within current location
        const places = Array.isArray(loc.places) ? loc.places : [];
        for (const p of places) {
            if (!p || !p.id) continue;
            // Prefer not to list closed places (you can relax this later).
            if (typeof p.isOpen === "function" && !p.isOpen(this.game.now)) continue;

            const id = `travel.place.${String(p.id)}`;
            if (existing.has(id)) continue;

            const minutesFromStreet =
                Number(
                    p?.props?.minutesFromStreet ?? p?.props?.minutes ?? p?.props?.travelMinutes
                ) || 2;

            const def = {
                id,
                text: "choice.travel.toPlace",
                minutes: minutesFromStreet,
                setPlaceId: String(p.id),
                vars: { destName: p.name },
            };

            choices.push(this._presentChoice(def, vars));
            existing.add(id);
        }
    }

    _injectExitChoice({ choices, vars }) {
        const existing = new Set(choices.map((c) => String(c.id)));

        // Avoid duplicates if a scene already defines an exit.
        const alreadyHasExit = choices.some((c) => {
            const d = c?._def || {};
            return (
                c.id === "place.exit" ||
                d.exitToOutside === true ||
                c.textKey === "choice.place.exit" ||
                ("setPlaceId" in d && d.setPlaceId === null)
            );
        });
        if (alreadyHasExit) return;

        const place = this.game.currentPlace;
        const minutesFromStreet =
            Number(
                place?.props?.minutesFromStreet ??
                    place?.props?.minutes ??
                    place?.props?.travelMinutes
            ) || 2;

        const id = "place.exit";
        if (existing.has(id)) return;

        const def = {
            id,
            text: "choice.place.exit",
            minutes: minutesFromStreet,
            exitToOutside: true,
        };
        choices.push(this._presentChoice(def, vars));
    }

    /**
     * Resolve scene text from:
     *  - def.text (string key)
     *  - def.text (array of blocks)
     *
     * Array block formats:
     *  - "scene.some.text" (always)
     *  - { when: { ...conditions }, key: "scene.some.extra" }
     *  - { when: { ... }, keys: ["...", "..."], pick: "random" }
     *  - { raw: "literal text" }
     *  - BREAK (token from src/data/scenes/util/common.js)
     */
    _resolveSceneText({ def, sceneId, vars }) {
        const joiner =
            typeof def.textJoiner === "string" && def.textJoiner.length
                ? def.textJoiner
                : "<br>";

        let blocks = [];
        if (Array.isArray(def.text)) blocks = def.text;
        else if (typeof def.text === "string") blocks = [def.text];

        let pickMap = this._textBlockPicks.get(sceneId) || null;
        if (!pickMap) {
            pickMap = new Map();
            this._textBlockPicks.set(sceneId, pickMap);
        }

        const out = [];
        const usedKeys = [];

        for (let i = 0; i < blocks.length; i += 1) {
            const block = blocks[i];

            // Explicit single line break token.
            if (block && typeof block === "object" && block.__type === "SCENE_BREAK") {
                out.push({ __break: true });
                continue;
            }

            // Literal text block.
            if (block && typeof block === "object" && typeof block.raw === "string") {
                if (block.raw.length) out.push(String(block.raw));
                continue;
            }

            // String => always include
            if (typeof block === "string") {
                if (!block) continue;
                usedKeys.push(block);
                out.push(this.localizer ? this.localizer.t(block, vars) : block);
                continue;
            }

            if (!block || typeof block !== "object") continue;

            const cond = getConditionBlock(block);
            if (cond && !this._matchesConditions(cond)) continue;

            let keys = [];
            if (typeof block.key === "string" && block.key) {
                keys = [block.key];
            } else if (Array.isArray(block.keys)) {
                keys = block.keys.filter(Boolean).map(String);
            } else {
                continue;
            }

            if (block.pick === "random") {
                const pickId = `text.${i}`;
                let pick = pickMap.get(pickId) || null;
                if (!pick) {
                    pick = keys.length ? keys[(this.rnd() * keys.length) | 0] : null;
                    if (pick) pickMap.set(pickId, pick);
                }
                keys = pick ? [pick] : [];
            }

            for (const k of keys) {
                usedKeys.push(k);
                out.push(this.localizer ? this.localizer.t(k, vars) : k);
            }
        }

        // Join while respecting explicit BREAK tokens.
        const addSep = (sep) => {
            if (!text || !sep) return;

            if (sep === "") {
                if (!text.endsWith("")) text += "";
                return;
            }
            if (sep === "") {
                if (text.endsWith("")) return;
                if (text.endsWith("")) {
                    text += "";
                } else {
                    text += "";
                }
                return;
            }

            // Generic separator.
            if (!text.endsWith(sep)) text += sep;
        };

        let text = "";
        let pendingSep = null; // set by BREAK, applied before the next text chunk

        for (const part of out) {
            if (part && typeof part === "object" && part.__break === true) {
                pendingSep = "";
                continue;
            }

            if (typeof part !== "string") continue;
            if (!part.length) continue;

            if (!text) {
                text = part;
                pendingSep = null;
                continue;
            }

            addSep(pendingSep || joiner);
            text += part;
            pendingSep = null;
        }

        return {
            text,
            textKeys: usedKeys,
            primaryTextKey: usedKeys[0] || null,
        };
    }

    // --------------------------
    // Choice handling
    // --------------------------
    choose(choiceId) {
        const scene = this.getPresentation();
        if (!scene) return null;

        const id = String(choiceId);
        const choice = scene.choices.find((c) => c.id === id) || null;
        if (!choice) throw new Error(`Unknown choice '${id}' for scene '${scene.id}'`);

        // If the choice is present but disabled (showAnyway), do not proceed.
        if (choice.disabled) return scene;

        const c = choice._def || {};

        // Safety: re-check conditions at click-time too.
        const cond = getConditionBlock(c);
        if (cond && !this._matchesConditions(cond)) return scene;

        // We run everything through a single action so:
        // - time is advanced
        // - changes are logged
        // - scene auto-refresh happens consistently
        this._suspendUpdates += 1;
        this._pendingUpdate = false;
        try {
            this.game.runAction({
                label: c.text || id,
                minutes: Number(c.minutes) || 0,
                apply: (game) => {
                    // Place movement (within current location)
                    // Canonical: use setPlaceId (string to enter, null to exit), and/or exitToOutside.
                    if ("setPlaceKey" in c) {
                        throw new Error(
                            `Choice '${id}' uses deprecated 'setPlaceKey'. Use setPlaceId, exitToOutside, or moveToHome instead.`
                        );
                    }

                    if ("setPlaceId" in c) {
                        if (c.setPlaceId === null) {
                            game.setCurrentPlace({ placeId: null, placeKey: null });
                        } else if (typeof c.setPlaceId === "string") {
                            game.setCurrentPlace({ placeId: c.setPlaceId, placeKey: null });
                        }
                    }

                    if (c.exitToOutside === true) {
                        // Outside is represented as: no placeId and no placeKey.
                        game.setCurrentPlace({ placeId: null, placeKey: null });
                    }

                    // Location movement
                    if (typeof c.moveToLocationId === "string") {
                        game.moveTo(c.moveToLocationId);
                    }

                    if (c.moveToHome === true && game.homeLocationId) {
                        game.moveTo(game.homeLocationId);
                        game.setCurrentPlace({ placeId: game.homePlaceId, placeKey: null });
                    }

                    // Flags
                    for (const f of normalizeStringSet(c.setFlags ?? c.setFlag))
                        game.setFlag(f, true);
                    for (const f of normalizeStringSet(c.clearFlags ?? c.clearFlag))
                        game.clearFlag(f);

                    // Optional: enqueue an urgent scene immediately
                    if (c.queueSceneId) {
                        this.queueScene(c.queueSceneId, c.queuePriority ?? 999);
                    }
                },
            });
        } finally {
            this._suspendUpdates = Math.max(0, this._suspendUpdates - 1);
        }

        // Scene jump: if specified, force it even if it doesn't "match".
        if (typeof c.nextSceneId === "string") {
            return this.update({ forceSceneId: c.nextSceneId });
        }
        return this.update();
    }

    // --------------------------
    // Condition evaluation
    // --------------------------

    _matches(def) {
        // Normalize naming at the scene-def level: you can write `conditions`, `when`, or `if`.
        const cond = getConditionBlock(def) || {};
        return this._matchesConditions(cond);
    }

    _getPlayerStatValue(statName, { base = false } = {}) {
        const name = String(statName);
        const p = this.game.player;
        if (!p) return 0;

        if (base && typeof p.getStatBase === "function")
            return toFiniteNumber(p.getStatBase(name), 0);
        if (typeof p.getStatValue === "function") return toFiniteNumber(p.getStatValue(name), 0);

        // fallback if a custom player model is used
        const raw = p?.stats?.[name];
        if (raw && typeof raw === "object") {
            if (base && raw.base != null) return toFiniteNumber(raw.base, 0);
            if (raw.value != null) return toFiniteNumber(raw.value, 0);
        }
        return toFiniteNumber(raw, 0);
    }

    _getPlayerSkillValue(skillName) {
        const p = this.game.player;
        const sk = p?.getSkill?.(String(skillName));
        if (!sk) return NaN;
        return toFiniteNumber(sk.value, NaN);
    }

    /**
     * Evaluate a condition object.
     * This is shared by scene selection, conditional text blocks, and conditional choices.
     */
    _matchesConditions(c) {
        if (c == null) return true;

        // Boolean combinators -------------------------------------------------
        // Default behavior for objects is AND (all keys must match).
        if (Array.isArray(c)) {
            // Treat arrays as implicit AND.
            return c.every((x) => this._matchesConditions(x));
        }

        if (typeof c !== "object") return !!c;

        const andList = c.and || c.all;
        if (Array.isArray(andList)) {
            if (!andList.every((x) => this._matchesConditions(x))) return false;
        }

        const orList = c.or || c.any;
        if (Array.isArray(orList)) {
            if (!orList.some((x) => this._matchesConditions(x))) return false;
        }

        const notBlock = c.not;
        if (notBlock != null) {
            if (this._matchesConditions(notBlock)) return false;
        }

        // Core matchers -------------------------------------------------------
        const cond = c || {};

        // Location id(s) (district nodes)
        const locationIds = normalizeStringSet(cond.locationIds || cond.locationId);
        if (locationIds.length) {
            if (!locationIds.includes(String(this.game.currentLocationId))) return false;
        }

        // Location tags
        const locationTags = normalizeStringSet(cond.locationTags || cond.locationTag);
        if (locationTags.length) {
            const tags = normalizeStringSet(this.game.location?.tags || []);
            if (!locationTags.some((t) => tags.includes(t))) return false;
        }

        // Place key(s) (sub-location)
        const placeKeys = normalizeStringSet(cond.placeKeys || cond.placeKey);
        if (placeKeys.length) {
            const cur = this.game.currentPlaceKey;
            if (!cur || !placeKeys.includes(String(cur))) return false;
        }

        // Outside / in-place helpers
        //   { outside: true } => only when the player is not inside a place
        //   { inPlace: true } => only when the player is inside any place (real or virtual)
        if (cond.outside != null) {
            const want = !!cond.outside;
            if (want !== isOutside(this.game)) return false;
        }
        if (cond.inPlace != null || cond.insidePlace != null) {
            const want = cond.inPlace != null ? !!cond.inPlace : !!cond.insidePlace;
            if (want !== isInsidePlace(this.game)) return false;
        }

        // Weather gate (world time)
        const weatherKinds = normalizeStringSet(cond.weatherKinds);
        if (weatherKinds.length) {
            const cur = String(this.game.world?.currentWeather ?? "");
            if (!cur || !weatherKinds.includes(cur)) return false;
        }
        const notWeatherKinds = normalizeStringSet(cond.notWeatherKinds);
        if (notWeatherKinds.length) {
            const cur = String(this.game.world?.currentWeather ?? "");
            if (cur && notWeatherKinds.includes(cur)) return false;
        }

        // Season gate (world time)
        const seasons = normalizeStringSet(cond.seasons);
        if (seasons.length) {
            const cur = String(this.game.world?.season ?? "");
            if (!cur || !seasons.includes(cur)) return false;
        }
        const notSeasons = normalizeStringSet(cond.notSeasons);
        if (notSeasons.length) {
            const cur = String(this.game.world?.season ?? "");
            if (cur && notSeasons.includes(cur)) return false;
        }

        // Day kind (workday/day off)
        const dayKinds = normalizeStringSet(cond.dayKinds);
        if (dayKinds.length) {
            const info = this.game.world?.getDayInfo?.(this.game.now);
            const cur = String(info?.kind ?? "");
            if (!cur || !dayKinds.includes(cur)) return false;
        }
        const notDayKinds = normalizeStringSet(cond.notDayKinds);
        if (notDayKinds.length) {
            const info = this.game.world?.getDayInfo?.(this.game.now);
            const cur = String(info?.kind ?? "");
            if (cur && notDayKinds.includes(cur)) return false;
        }

        // Day of week (DAY_KEYS)
        const daysOfWeek = normalizeStringSet(cond.daysOfWeek);
        if (daysOfWeek.length) {
            const dowKey = DAY_KEYS[this.game.now.getUTCDay()] || "";
            if (!dowKey || !daysOfWeek.includes(dowKey)) return false;
        }
        const notDaysOfWeek = normalizeStringSet(cond.notDaysOfWeek);
        if (notDaysOfWeek.length) {
            const dowKey = DAY_KEYS[this.game.now.getUTCDay()] || "";
            if (dowKey && notDaysOfWeek.includes(dowKey)) return false;
        }

        // Date match: { date: {day?, month?, year?} }
        const dateSpec = cond.date;
        const notDateSpec = cond.notDate;
        const curY = this.game.now.getUTCFullYear();
        const curM = this.game.now.getUTCMonth() + 1;
        const curD = this.game.now.getUTCDate();
        const matchesDate = (spec) => {
            if (!isValidDateSpec(spec)) return true;
            if (spec.year != null && Number(spec.year) !== curY) return false;
            if (spec.month != null && Number(spec.month) !== curM) return false;
            if (spec.day != null && Number(spec.day) !== curD) return false;
            return true;
        };
        if (dateSpec) {
            const list = Array.isArray(dateSpec) ? dateSpec : [dateSpec];
            if (!list.some((s) => matchesDate(s))) return false;
        }
        if (notDateSpec) {
            const list = Array.isArray(notDateSpec) ? notDateSpec : [notDateSpec];
            if (list.some((s) => matchesDate(s))) return false;
        }

        // Date range match (inclusive):
        //  { dateRange: { from: {..}, to: {..} } }
        const rangeSpec = cond.dateRange;
        const notRangeSpec = cond.notDateRange;
        const currentKey = ymdKey({ year: curY, month: curM, day: curD });

        const matchesRange = (rs) => {
            if (!rs || typeof rs !== "object") return true;

            const fromSpec = rs.from;
            const toSpec = rs.to;
            if (!isValidDateSpec(fromSpec) && !isValidDateSpec(toSpec)) return true;

            const fromKey = isValidDateSpec(fromSpec)
                ? ymdKey(normalizeDateSpecMin(fromSpec, this.game.now))
                : null;
            const toKey = isValidDateSpec(toSpec)
                ? ymdKey(normalizeDateSpecMax(toSpec, this.game.now))
                : null;

            if (fromKey != null && currentKey < fromKey) return false;
            if (toKey != null && currentKey > toKey) return false;
            return true;
        };

        if (rangeSpec) {
            const list = Array.isArray(rangeSpec) ? rangeSpec : [rangeSpec];
            if (!list.some((rs) => matchesRange(rs))) return false;
        }
        if (notRangeSpec) {
            const list = Array.isArray(notRangeSpec) ? notRangeSpec : [notRangeSpec];
            if (list.some((rs) => matchesRange(rs))) return false;
        }

        // Holiday match (from src/data/world/calendar.js; includes random holidays)
        const holidays = normalizeStringSet(cond.holidays);
        if (holidays.length) {
            const names = new Set(
                (this.game.world?.getCurrentHolidayNames?.() || []).map((n) =>
                    String(n).toLowerCase()
                )
            );
            if (!holidays.some((h) => names.has(String(h).toLowerCase()))) return false;
        }
        const notHolidays = normalizeStringSet(cond.notHolidays);
        if (notHolidays.length) {
            const names = new Set(
                (this.game.world?.getCurrentHolidayNames?.() || []).map((n) =>
                    String(n).toLowerCase()
                )
            );
            if (notHolidays.some((h) => names.has(String(h).toLowerCase()))) return false;
        }

        // NPCs present in current location
        const requiredNPCs = normalizeStringSet(cond.npcsPresent || cond.npcPresent);
        if (requiredNPCs.length) {
            const here = new Set(this.game.getNPCsAtLocation().map((n) => String(n.id)));
            for (const id of requiredNPCs) {
                if (!here.has(id)) return false;
            }
        }

        // Hour gate (world time)
        const hourGate = cond.hour ?? cond.hours ?? cond.hourOfDay;
        if (hourGate != null) {
            const currentHour = this.game.now.getUTCHours();
            if (!matchesHourGate(hourGate, currentHour)) return false;
        }

        // Player story flags
        const flags = normalizeStringSet(cond.playerFlags || cond.playerFlag);
        if (flags.length) {
            for (const f of flags) {
                if (!this._hasPlayerFlag(f)) return false;
            }
        }

        // Negative flags
        const notFlags = normalizeStringSet(cond.notPlayerFlags || cond.notPlayerFlag);
        if (notFlags.length) {
            for (const f of notFlags) {
                if (this._hasPlayerFlag(f)) return false;
            }
        }

        // Player stats (computed by default)
        const stats = cond.playerStats || cond.stats;
        if (stats && typeof stats === "object" && !Array.isArray(stats)) {
            for (const [statName, rule] of Object.entries(stats)) {
                if (rule == null) continue;

                // Allow { strength: { gte: 5, base: true } }
                const base = !!(rule && typeof rule === "object" && rule.base === true);
                const v = this._getPlayerStatValue(statName, { base });

                if (!matchesNumberGate(rule, v)) return false;
            }
        }

        // Single stat shorthand:
        //  { playerStat: { name: "strength", gte: 5 } }
        //  { playerStat: { stat: "strength", between: [3,7] } }
        if (cond.playerStat && typeof cond.playerStat === "object") {
            const { name, stat, base, ...gate } = cond.playerStat;
            const statName = name || stat;
            if (statName) {
                const v = this._getPlayerStatValue(statName, { base: !!base });
                if (!matchesNumberGate(gate, v)) return false;
            }
        }

        // Meter skills (0..1), if you want to gate on them.
        // Example: { playerSkills: { athletics: { gte: 0.6 } } }
        const skills = cond.playerSkills || cond.skills;
        if (skills && typeof skills === "object" && !Array.isArray(skills)) {
            for (const [skillName, rule] of Object.entries(skills)) {
                if (rule == null) continue;
                const v = this._getPlayerSkillValue(skillName);
                if (!matchesNumberGate(rule, v)) return false;
            }
        }

        return true;
    }

    _hasPlayerFlag(flag) {
        const key = String(flag);
        if (this.game.hasFlag(key)) return true;
        const sk = this.game.player?.getSkill?.(key);
        return sk?.type === "flag" && !!sk.value;
    }

    _buildVars() {
        const d = this.game.now;
        const loc = this.game.location;
        const place = this.game.currentPlace;

        // pick any connected street name as "the street" near you
        const anyEdge = loc?.neighbors?.size ? loc.neighbors.values().next().value : null;
        const streetName = anyEdge?.streetName || "Street";

        const npcsHere = this.game.getNPCsAtLocation().map((n) => ({
            id: String(n.id),
            name: n.name,
        }));

        // Precompute player stats (useful both for UI text and for i18n interpolation).
        const playerStats = {};
        const p = this.game.player;
        if (p?.stats && typeof p.getStatValue === "function") {
            for (const k of Object.keys(p.stats)) {
                playerStats[k] = this._getPlayerStatValue(k);
            }
        }

        return {
            time: {
                hour: d.getUTCHours(),
                minute: d.getUTCMinutes(),
                hhmm: formatHHMMUTC(d),
            },
            location: {
                id: loc?.id ?? null,
                name: loc?.name ?? "",
                tags: uniq(loc?.tags || []),
            },
            place: {
                id: place?.id ?? null,
                key: this.game.currentPlaceKey ?? null,
                name:
                    place?.name ?? (isOutside(this.game) ? streetName : this.game.currentPlaceKey),
            },
            street: {
                name: streetName,
            },
            player: {
                stats: playerStats,
            },
            npcsHere,
        };
    }
}
