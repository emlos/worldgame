export class Localizer {
    constructor(dict) {
        this.dict = dict || {};
    }

    t(key, vars = {}) {
        const raw = this.dict[key] ?? key; // fallback shows missing keys clearly
        return raw.replace(/\{(\w+)\}/g, (_, name) =>
            name in vars ? String(vars[name]) : `{${name}}`
        );
    }
}
