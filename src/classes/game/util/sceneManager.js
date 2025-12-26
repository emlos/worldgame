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

const uniq = (arr) => Array.from(new Set(arr));

function asArray(v) {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
}

function normalizeStringSet(v) {
    return uniq(asArray(v).filter(Boolean).map(String));
}

function timeOfDayFromHourUTC(hour) {
    // Simple buckets you can refine later.
    // night: 22-4, morning: 5-10, day: 11-16, evening: 17-21
    const h = ((Number(hour) % 24) + 24) % 24;
    if (h >= 22 || h <= 4) return "night";
    if (h >= 5 && h <= 10) return "morning";
    if (h >= 11 && h <= 16) return "day";
    return "evening";
}

export class SceneManager {
    constructor({ game, scenes = [], localizer = null, rnd = Math.random } = {}) {
        if (!game) throw new Error("SceneManager requires { game }");
        this.game = game;
        this.rnd = rnd || Math.random;
        this.localizer = localizer;

        this._sceneDefs = new Map(); // id -> def
        this.registerScenes(scenes);

        this.activeSceneId = null;
        this._queue = []; // [{ sceneId, priority }]

        // Remember last picked textKey for a scene (for random textKeys arrays)
        this._chosenTextKey = new Map();
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

    // --------------------------
    // Resolution
    // --------------------------

    update({ forceSceneId = null } = {}) {
        let nextId = forceSceneId ? String(forceSceneId) : null;

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
            const first = this._sceneDefs.keys().next();
            nextId = first.done ? null : first.value;
        }

        if (!nextId) return null;

        // Pick a random textKey if the scene offers multiple (legacy: def.textKeys)
        const def = this.getSceneDef(nextId);
        if (def && Array.isArray(def.textKeys) && def.textKeys.length) {
            const pick = def.textKeys[(this.rnd() * def.textKeys.length) | 0];
            this._chosenTextKey.set(nextId, pick);
        } else {
            this._chosenTextKey.delete(nextId);
        }

        this.activeSceneId = nextId;

        const presentation = this.getPresentation(nextId);
        this.game.startScene(presentation);
        return presentation;
    }

    getPresentation(sceneId = this.activeSceneId) {
        const id = String(sceneId || "");
        const def = this.getSceneDef(id);
        if (!def) return null;

        const vars = this._buildVars();

        const resolved = this._resolveSceneText({ def, sceneId: id, vars });

        const choices = (def.choices || []).map((c) => {
            const minutes = Number(c.minutes) || 0;
            const choiceVars = { ...vars, minutes };
            const label = this.localizer ? this.localizer.t(c.textKey, choiceVars) : c.textKey;
            return {
                id: String(c.id),
                textKey: c.textKey,
                text: label,
                minutes,
                _def: c,
            };
        });

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

    /**
     * Resolve scene text from:
     *  - def.text (string key)
     *  - def.text (array of blocks)
     *  - legacy: def.textKey / def.textKeys
     *
     * Array block formats:
     *  - "scene.some.text" (always)
     *  - { when: { ...conditions }, key: "scene.some.extra" }
     *  - { when: { ... }, keys: ["...", "..."], pick: "random" }
     */
    _resolveSceneText({ def, sceneId, vars }) {
        const joiner = typeof def.textJoiner === "string" ? def.textJoiner : "\n\n";

        // Build a list of blocks to evaluate.
        let blocks = null;
        if (Array.isArray(def.text)) {
            blocks = def.text;
        } else if (typeof def.text === "string") {
            blocks = [def.text];
        }

        // Legacy fallback: use chosen random textKey or def.textKey
        const chosenTextKey = this._chosenTextKey.get(sceneId);
        const legacyPrimary = chosenTextKey || def.textKey || null;
        if (!blocks) {
            blocks = legacyPrimary ? [legacyPrimary] : [];
        }

        const out = [];
        const usedKeys = [];

        for (const block of blocks) {
            // Block: string => always include
            if (typeof block === "string") {
                if (!block) continue;
                usedKeys.push(block);
                out.push(this.localizer ? this.localizer.t(block, vars) : block);
                continue;
            }

            if (!block || typeof block !== "object") continue;

            const cond = block.when || block.if || block.conditions || null;
            if (cond && !this._matchesConditions(cond)) continue;

            const directKey = block.key || block.textKey || null;
            const keyList = Array.isArray(block.keys || block.textKeys)
                ? block.keys || block.textKeys
                : null;

            let keys = [];
            if (directKey) keys = [directKey];
            else if (keyList) keys = keyList.filter(Boolean).map(String);
            else continue;

            if ((block.pick || block.mode) === "random" || block.random === true) {
                const pick = keys.length ? keys[(this.rnd() * keys.length) | 0] : null;
                keys = pick ? [pick] : [];
            }

            for (const k of keys) {
                usedKeys.push(k);
                out.push(this.localizer ? this.localizer.t(k, vars) : k);
            }
        }

        // Filter empty strings, but keep intentional whitespace in strings.
        const text = out.filter((s) => typeof s === "string" && s.length > 0).join(joiner);

        return {
            text,
            textKeys: usedKeys,
            primaryTextKey: legacyPrimary || usedKeys[0] || null,
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

        const c = choice._def || {};

        // We run everything through a single action so:
        // - time is advanced
        // - changes are logged
        // - scene auto-refresh happens consistently
        this.game.runAction({
            label: c.textKey || id,
            minutes: Number(c.minutes) || 0,
            apply: (game) => {
                // Place movement (within current location)
                if (typeof c.setPlaceKey === "string") {
                    game.setCurrentPlace({ placeId: null, placeKey: c.setPlaceKey });
                }
                if (typeof c.setPlaceId === "string") {
                    game.setCurrentPlace({ placeId: c.setPlaceId, placeKey: null });
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
                for (const f of normalizeStringSet(c.setFlags || c.setFlag)) game.setFlag(f, true);
                for (const f of normalizeStringSet(c.clearFlags || c.clearFlag)) game.clearFlag(f);

                // Optional: enqueue an urgent scene immediately
                if (c.queueSceneId) {
                    this.queueScene(c.queueSceneId, c.queuePriority ?? 999);
                }
            },
        });

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
        return this._matchesConditions(def?.conditions || {});
    }

    /**
     * Evaluate a condition object.
     * This is shared by scene selection AND conditional text blocks.
     */
    _matchesConditions(c) {
        const cond = c || {};

        // Location id (district node)
        if (cond.locationId && String(cond.locationId) !== String(this.game.currentLocationId)) {
            return false;
        }

        // Location tags
        const locationTags = normalizeStringSet(cond.locationTags || cond.locationTag);
        if (locationTags.length) {
            const tags = normalizeStringSet(this.game.location?.tags || []);
            if (!locationTags.some((t) => tags.includes(t))) return false;
        }

        // Place key (sub-location)
        const placeKeys = normalizeStringSet(cond.placeKeys || cond.placeKey);
        if (placeKeys.length) {
            const cur = this.game.currentPlaceKey;
            if (!cur || !placeKeys.includes(String(cur))) return false;
        }

        // NPCs present in current location
        const requiredNPCs = normalizeStringSet(cond.npcsPresent || cond.npcPresent);
        if (requiredNPCs.length) {
            const here = new Set(this.game.getNPCsAtLocation().map((n) => String(n.id)));
            for (const id of requiredNPCs) {
                if (!here.has(id)) return false;
            }
        }

        // Time of day
        const tod = normalizeStringSet(cond.timeOfDay);
        if (tod.length) {
            const current = timeOfDayFromHourUTC(this.game.now.getUTCHours());
            if (!tod.includes(current)) return false;
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
        const pad2 = (n) => String(n).padStart(2, "0");
        const loc = this.game.location;
        const place = this.game.currentPlace;

        // pick any connected street name as "the street" near you
        const anyEdge = loc?.neighbors?.size ? loc.neighbors.values().next().value : null;
        const streetName = anyEdge?.streetName || "Street";

        const npcsHere = this.game.getNPCsAtLocation().map((n) => ({
            id: String(n.id),
            name: n.name,
        }));

        return {
            time: {
                hour: d.getUTCHours(),
                minute: d.getUTCMinutes(),
                hhmm: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`,
                tod: timeOfDayFromHourUTC(d.getUTCHours()),
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
                    place?.name ??
                    (this.game.currentPlaceKey === "street"
                        ? streetName
                        : this.game.currentPlaceKey),
            },
            street: {
                name: streetName,
            },
            npcsHere,
        };
    }
}
