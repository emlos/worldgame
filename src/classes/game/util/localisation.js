export class Localizer {
    constructor(dict) {
        this.dict = dict || {};
    }

    /**
     * Translate a key and interpolate {placeholders}.
     *
     * Supports dotted paths, e.g. {time.hhmm}, {street.name}.
     */
    t(key, vars = {}) {
        const raw = this.dict[key] ?? key; // fallback shows missing keys clearly

        const getPath = (obj, path) => {
            if (!path) return undefined;
            const parts = String(path).split(".");
            let cur = obj;
            for (const part of parts) {
                if (cur == null) return undefined;

                // Direct property
                if (Object.prototype.hasOwnProperty.call(cur, part)) {
                    cur = cur[part];
                    continue;
                }

                // Array index
                if (Array.isArray(cur) && /^\d+$/.test(part)) {
                    cur = cur[Number(part)];
                    continue;
                }

                return undefined;
            }
            return cur;
        };

        return String(raw).replace(/\{([a-zA-Z0-9_.-]+)\}/g, (_, path) => {
            const value = getPath(vars, path);
            return value === undefined ? `{${path}}` : String(value);
        });
    }
}
