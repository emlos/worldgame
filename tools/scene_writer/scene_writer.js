const baseScene = {
    id: "",
    priority: 0,
    text: [""],
    choices: [],
};

const copyScene = {
    id: "",
    priority: 0,
    text: [""],
    choices: [],
};

const i18n = {
    SCENES: {}, // SCENES["main"] = {key, text}
    CHOICES: {},
};

//helpers
const byId = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") n.className = v;
        else if (k === "id") n.id = v;
        else if (k === "text") n.textContent = v;
        else if (k === "html") n.innerHTML = v;
        else n.setAttribute(k, v);
    }
    for (const c of kids) n.append(c);
    return n;
};
const delEl = (id) => {
    const node = byId(id);
    if (node && node.parentNode) node.parentNode.removeChild(node);
};

// ---- Identifier helper (shared) ----
// In outputs, wrap identifiers as "__Something.SOMETHING__" and this will unquote them.
function cleanIdentifiers(value) {
    return (value ?? "").replace(/"__([^"]*?)__"/g, (_, inner) => inner);
}

const TIME_OF_DAY = {
    morning: { gte: 5, lt: 11 },
    day: { gte: 11, lt: 18 },
    evening: { gte: 18, lt: 23 },
    night: { between: [23, 5] },
};

function toIdentifierOption(prefix, key) {
    return { label: `${prefix}.${key}`, value: `__${prefix}.${key}__` };
}
function enumIdentifierOptions(prefix, obj) {
    return Object.keys(obj ?? {}).map((k) => toIdentifierOption(prefix, k));
}
function registryKeyOptions(registry, labelKey = "key") {
    if (!Array.isArray(registry)) return [];
    return registry
        .map((x) => x?.[labelKey])
        .filter((x) => typeof x === "string" && x.trim().length > 0)
        .sort()
        .map((k) => ({ label: k, value: k }));
}
function holidayNameOptions() {
    const a = HOLIDAY_REGISTRY;
    const b = RANDOM_HOLIDAYS;
    const names = [...a, ...b]
        .map((x) => x?.name)
        .filter((x) => typeof x === "string" && x.trim().length > 0);
    // unique + sort
    return Array.from(new Set(names))
        .sort()
        .map((n) => ({ label: n, value: n }));
}
function timeOfDayOptions() {
    const tod = TIME_OF_DAY;
    if (!tod || typeof tod !== "object") return [];
    return Object.keys(tod).map((k) => ({
        label: `TIME_OF_DAY.${k}`,
        value: `__TIME_OF_DAY.${k}__`,
    }));
}

const CONDITION_DEFS = [
    {
        key: "playerFlags",
        label: "Player flags",
        kind: "flagRegistryList",
        hint: "All listed flags must be set.",
    },
    {
        key: "npcsPresent",
        label: "NPCs present",
        kind: "npcRegistryList",
        hint: "All listed NPC ids must be present.",
    },

    {
        key: "locationIds",
        label: "Location ids",
        kind: "locationRegistryList",
        hint: "Match current location id.",
    },
    {
        key: "locationTags",
        label: "Location tags",
        kind: "locationTagList",
        hint: "Match any location tag.",
    },

    {
        key: "placeKeys",
        label: "Place keys",
        kind: "placeRegistryList",
        hint: "Match current place key.",
    },

    {
        key: "outside",
        label: "Outside",
        kind: "bool",
        hint: "True if player is outside (no place).",
    },
    {
        key: "inPlace",
        label: "Inside any place",
        kind: "bool",
        hint: "True if player is inside a place.",
    },

    {
        key: "weatherKinds",
        label: "Weather kinds",
        kind: "weatherList",
        hint: "Match world weather kind.",
    },
    { key: "seasons", label: "Seasons", kind: "seasonList", hint: "Match world season." },
    {
        key: "moonPhase",
        label: "Moon phase",
        kind: "moonPhaseList",
        hint: "Match current moon phase.",
    },

    {
        key: "dayKinds",
        label: "Day kinds",
        kind: "stringList",
        hint: "Project-specific day kind(s).",
    },
    {
        key: "daysOfWeek",
        label: "Days of week",
        kind: "dayKeyList",
        hint: "Uses DAY_KEYS[i] identifiers.",
    },

    {
        key: "holidays",
        label: "Holidays",
        kind: "holidayList",
        hint: "Match today holiday name (case-insensitive).",
    },

    {
        key: "hour",
        label: "Hour gate",
        kind: "hour",
        hint: "Exact hour, TIME_OF_DAY bucket, or between.",
    },

    { key: "placeTags", label: "Place tags", kind: "placeTagList", hint: "Match any place tag." },
];

function defForKey(key) {
    return CONDITION_DEFS.find((d) => d.key === key) ?? CONDITION_DEFS[0];
}

let __condId = 1;
function newId() {
    __condId += 1;
    return "c" + __condId;
}
function deepClone(x) {
    return JSON.parse(JSON.stringify(x));
}

function defaultLeaf(key) {
    const d = defForKey(key);
    if (d.kind === "bool") return { id: newId(), type: "leaf", key: d.key, value: true };
    if (d.kind === "hour")
        return {
            id: newId(),
            type: "leaf",
            key: d.key,
            value: { mode: "bucket", bucket: "__TIME_OF_DAY.morning__" },
        };
    return { id: newId(), type: "leaf", key: d.key, value: [] };
}
function defaultGroup(op = "all") {
    return { id: newId(), type: "group", op, children: [] };
}

function nodeToCondition(node) {
    if (!node) return {};
    if (node.type === "group") {
        if (node.op === "not") {
            const child = node.children?.[0] ? nodeToCondition(node.children[0]) : {};
            return { not: child };
        }
        const key = node.op === "any" ? "any" : "all";
        const kids = (node.children ?? [])
            .map(nodeToCondition)
            .filter((x) => x && Object.keys(x).length > 0);
        return { [key]: kids };
    }

    // leaf
    const d = defForKey(node.key);
    if (d.kind === "bool") return { [node.key]: true };

    if (d.kind === "hour") {
        const v = node.value ?? {};
        if (v.mode === "exact") return { hour: Number.isFinite(v.hour) ? v.hour : 0 };
        if (v.mode === "between") {
            const a = Number.isFinite(v.from) ? v.from : 0;
            const b = Number.isFinite(v.to) ? v.to : 0;
            return { hour: { between: [a, b] } };
        }
        // bucket (identifier) fallback
        if (typeof v.bucket === "string" && v.bucket.length) return { hour: v.bucket };
        return { hour: 0 };
    }

    // list-like
    const arr = Array.isArray(node.value)
        ? node.value.filter((x) => x !== null && x !== undefined && String(x).trim().length > 0)
        : [];
    if (arr.length === 0) return {};
    return { [node.key]: arr };
}

class ConditionBuilderModal {
    constructor(mountEl) {
        this.mountEl = mountEl;
        this.isOpen = false;
        this.onSave = null;
        this.tree = defaultGroup("all"); // root
        this._buildDom();
        this._render();
    }

    open({ initialTree = null, onSave = null } = {}) {
        console.log(this.root);
        this.onSave = onSave;
        this.tree = initialTree ? deepClone(initialTree) : defaultGroup("all");
        if (!this.tree.children) this.tree.children = [];
        this.isOpen = true;
        this.mountEl.classList.remove("modalHidden");
        this._render();
    }

    close() {
        this.isOpen = false;
        this.mountEl.classList.add("modalHidden");
    }

    getWhenObject() {
        // Export as { any/all/not } object (root group)
        const cond = nodeToCondition(this.tree);
        // If empty, prefer an empty when-block.
        if (cond?.all && Array.isArray(cond.all) && cond.all.length === 0) return {};
        if (cond?.any && Array.isArray(cond.any) && cond.any.length === 0) return {};
        if (cond?.not && Object.keys(cond.not ?? {}).length === 0) return {};
        return cond;
    }

    _buildDom() {
        const root = el("div", { class: "modalRoot modalHidden", id: "conditionModalRoot" });
        const backdrop = el("div", { class: "modalBackdrop" });
        const panel = el("div", { class: "modalPanel" });

        const headerLeft = el("div", { class: "modalTitle", text: "Conditions" });
        const closeBtn = el("button", { class: "btn small", text: "Close" });

        const header = el("div", { class: "modalHeader" }, headerLeft, closeBtn);
        const body = el("div", { class: "modalBody" });
        const footer = el("div", { class: "modalFooter" });

        const cancelBtn = el("button", { class: "btn", text: "Cancel" });
        const saveBtn = el("button", { class: "btn", text: "Save" });

        footer.append(cancelBtn, saveBtn);
        panel.append(header, body, footer);
        root.append(backdrop, panel);

        this.root = root;
        this.body = body;

        closeBtn.addEventListener("click", () => this.close());
        cancelBtn.addEventListener("click", () => this.close());
        backdrop.addEventListener("click", () => this.close());
        saveBtn.addEventListener("click", () => {
            const whenObj = this.getWhenObject();
            if (this.onSave) this.onSave(deepClone(this.tree), whenObj);
            this.close();
        });

        this.mountEl.appendChild(root);
    }

    _render() {
        this.body.textContent = "";
        const treeWrap = el("div", { class: "condTree" });

        // Root operator picker
        const rootNode = this._renderNode(this.tree, { isRoot: true });
        treeWrap.appendChild(rootNode);

        this.body.appendChild(treeWrap);
    }

    _renderNode(node, { isRoot = false } = {}) {
        const nodeEl = el("div", { class: "condNode" });
        const header = el("div", { class: "condNodeHeader" });
        const left = el("div", { class: "left" });

        if (node.type === "group") {
            // Group operator select
            const opSelect = el("select");
            const ops = [
                { value: "all", label: "AND (all)" },
                { value: "any", label: "OR (any)" },
                { value: "not", label: "NOT" },
            ];
            for (const o of ops)
                opSelect.appendChild(el("option", { value: o.value, text: o.label }));
            opSelect.value = node.op ?? "all";
            opSelect.addEventListener("change", (e) => {
                node.op = e.target.value;
                if (node.op === "not") {
                    // ensure single child only
                    node.children = node.children?.slice?.(0, 1) ?? [];
                }
                this._render();
            });

            left.appendChild(el("strong", { text: isRoot ? "Root group" : "Group" }));
            left.appendChild(opSelect);

            const hint = el("span", {
                class: "hintTiny",
                text: isRoot ? "This is the top-level when block." : "",
            });
            if (isRoot) left.appendChild(hint);

            const btns = el("div", {
                class: "inline",
                style: "gap: 8px; justify-content: flex-end;",
            });

            const addCondBtn = el("button", { class: "btn small", text: "+ condition" });
            const addGroupBtn = el("button", { class: "btn small", text: "+ group" });
            const delBtn = el("button", { class: "btn small danger", text: "Delete" });

            addCondBtn.addEventListener("click", () => {
                if (!node.children) node.children = [];
                if (node.op === "not" && node.children.length >= 1) return;
                node.children.push(defaultLeaf("playerFlags"));
                this._render();
            });
            addGroupBtn.addEventListener("click", () => {
                if (!node.children) node.children = [];
                if (node.op === "not" && node.children.length >= 1) return;
                node.children.push(defaultGroup("all"));
                this._render();
            });

            if (isRoot) {
                delBtn.classList.add("disabled");
                delBtn.title = "Root can't be deleted";
            } else {
                delBtn.addEventListener("click", () => {
                    this._deleteNodeById(node.id);
                    this._render();
                });
            }

            btns.append(addCondBtn, addGroupBtn, delBtn);

            header.append(left, btns);
            nodeEl.appendChild(header);

            if (node.op === "not" && node.children.length === 0) {
                nodeEl.appendChild(
                    el("div", {
                        class: "hintTiny",
                        text: "NOT expects exactly one child. Add one condition or group.",
                    })
                );
            }

            // Children
            const kidsWrap = el("div", { class: "condChildren" });
            for (const child of node.children ?? []) {
                kidsWrap.appendChild(this._renderNode(child, { isRoot: false }));
            }
            nodeEl.appendChild(kidsWrap);
            return nodeEl;
        }

        // Leaf
        const def = defForKey(node.key);
        left.appendChild(el("strong", { text: "Condition" }));
        const keySelect = el("select");
        for (const d of CONDITION_DEFS)
            keySelect.appendChild(el("option", { value: d.key, text: `${d.label} (${d.key})` }));
        keySelect.value = node.key;
        keySelect.addEventListener("change", (e) => {
            const nextKey = e.target.value;
            const nextDef = defForKey(nextKey);
            node.key = nextKey;
            // reset value based on kind
            if (nextDef.kind === "bool") node.value = true;
            else if (nextDef.kind === "hour")
                node.value = { mode: "bucket", bucket: "__TIME_OF_DAY.morning__" };
            else node.value = [];
            this._render();
        });
        left.appendChild(keySelect);
        if (def?.hint) left.appendChild(el("span", { class: "hintTiny", text: def.hint }));

        const btns = el("div", { class: "inline", style: "gap: 8px; justify-content: flex-end;" });
        const delBtn = el("button", { class: "btn small danger", text: "Delete" });
        delBtn.addEventListener("click", () => {
            this._deleteNodeById(node.id);
            this._render();
        });
        btns.appendChild(delBtn);

        header.append(left, btns);
        nodeEl.appendChild(header);

        // Editor block
        const editor = el("div", { style: "margin-top: 10px;" });
        editor.appendChild(this._renderLeafEditor(node));
        nodeEl.appendChild(editor);

        return nodeEl;
    }

    _renderLeafEditor(node) {
        const def = defForKey(node.key);

        if (def.kind === "bool") {
            const wrap = el("div", { class: "inline", style: "gap: 10px;" });
            const cb = el("input", { type: "checkbox" });
            cb.checked = true;
            cb.disabled = true;
            wrap.append(
                el("div", { class: "hintTiny", text: "Always outputs true for this matcher." }),
                cb
            );
            return wrap;
        }

        if (def.kind === "hour") {
            const v = node.value ?? { mode: "exact", hour: 0 };
            if (!node.value) node.value = v;

            const wrap = el("div", { class: "col" });
            const modeSel = el("select");
            const modes = [
                { value: "bucket", label: "TIME_OF_DAY bucket" },
                { value: "exact", label: "Exact hour (0-23)" },
                { value: "between", label: "Between (wraps midnight)" },
            ];
            for (const m of modes)
                modeSel.appendChild(el("option", { value: m.value, text: m.label }));
            modeSel.value = v.mode ?? "bucket";

            const row = el("div", { class: "row" }, el("label", { text: "Hour mode" }), modeSel);
            row.style.alignItems = "center";
            row.style.gap = "10px";
            wrap.appendChild(row);

            const editorHost = el("div");
            const rerenderEditor = () => {
                editorHost.textContent = "";
                const mode = node.value.mode;

                if (mode === "bucket") {
                    const opts = timeOfDayOptions();
                    const sel = el("select");
                    if (opts.length === 0) {
                        sel.disabled = true;
                        sel.appendChild(
                            el("option", { value: "", text: "TIME_OF_DAY not found in this page" })
                        );
                    } else {
                        for (const o of opts)
                            sel.appendChild(el("option", { value: o.value, text: o.label }));
                        sel.value = node.value.bucket ?? opts[0].value;
                    }
                    sel.addEventListener("change", (e) => {
                        node.value.bucket = e.target.value;
                    });
                    editorHost.appendChild(el("label", { text: "Bucket" }));
                    editorHost.appendChild(sel);
                } else if (mode === "exact") {
                    const inp = el("input", { type: "number", min: "0", max: "23", step: "1" });
                    inp.value = Number.isFinite(node.value.hour) ? node.value.hour : 0;
                    inp.addEventListener("input", (e) => {
                        node.value.hour = parseInt(e.target.value);
                    });
                    editorHost.appendChild(el("label", { text: "Hour (UTC)" }));
                    editorHost.appendChild(inp);
                } else if (mode === "between") {
                    const from = el("input", { type: "number", min: "0", max: "23", step: "1" });
                    const to = el("input", { type: "number", min: "0", max: "23", step: "1" });
                    from.value = Number.isFinite(node.value.from) ? node.value.from : 0;
                    to.value = Number.isFinite(node.value.to) ? node.value.to : 0;

                    from.addEventListener(
                        "input",
                        (e) => (node.value.from = parseInt(e.target.value))
                    );
                    to.addEventListener("input", (e) => (node.value.to = parseInt(e.target.value)));

                    const row = el(
                        "div",
                        { class: "inline", style: "gap: 10px;" },
                        el("div", {}, el("label", { text: "From" }), from),
                        el("div", {}, el("label", { text: "To" }), to)
                    );
                    editorHost.appendChild(row);
                    editorHost.appendChild(
                        el("div", { class: "hintTiny", text: "Example: 22 → 5 means 22:00..05:00" })
                    );
                }
            };

            modeSel.addEventListener("change", (e) => {
                node.value.mode = e.target.value;
                if (node.value.mode === "bucket" && !node.value.bucket)
                    node.value.bucket = "__TIME_OF_DAY.morning__";
                rerenderEditor();
            });

            rerenderEditor();
            wrap.appendChild(editorHost);
            return wrap;
        }

        // list editors
        const wrap = el("div", { class: "col" });

        const list = Array.isArray(node.value) ? node.value : [];
        node.value = list;

        const addRow = el("div", { class: "inline", style: "gap: 10px;" });
        let inputEl = null;

        const addBtn = el("button", { class: "btn small", text: "+ add" });

        const addValue = (val) => {
            const v = (val ?? "").toString().trim();
            if (!v) return;
            if (!node.value.includes(v)) node.value.push(v);
            this._render();
        };

        if (def.kind === "stringList") {
            inputEl = el("input", { placeholder: "type value…" });
            addBtn.addEventListener("click", () => addValue(inputEl.value));
            inputEl.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    addValue(inputEl.value);
                }
            });
            addRow.append(inputEl, addBtn);
        } else {
            const sel = el("select");
            const options = this._optionsForKind(def.kind);
            if (options.length === 0) {
                sel.disabled = true;
                sel.appendChild(
                    el("option", { value: "", text: "No options found (registry missing?)" })
                );
                addBtn.classList.add("disabled");
            } else {
                for (const o of options)
                    sel.appendChild(el("option", { value: o.value, text: o.label }));
            }
            addBtn.addEventListener("click", () => addValue(sel.value));
            addRow.append(sel, addBtn);
        }

        wrap.appendChild(addRow);

        // Chips list
        const chips = el("div", { class: "chipRow" });
        for (const item of node.value) {
            const chipLabel = this._displayLabelForValue(def.kind, item);
            const x = el("button", { text: "×", title: "Remove" });
            x.addEventListener("click", () => {
                node.value = node.value.filter((v) => v !== item);
                this._render();
            });
            const chip = el("span", { class: "chip" }, el("span", { text: chipLabel }), x);
            chips.appendChild(chip);
        }
        if (node.value.length === 0)
            chips.appendChild(el("span", { class: "hintTiny", text: "No values yet." }));
        wrap.appendChild(chips);

        return wrap;
    }

    _optionsForKind(kind) {
        if (kind === "weatherList") return enumIdentifierOptions("WeatherType", WeatherType);
        if (kind === "seasonList") return enumIdentifierOptions("Season", Season);
        if (kind === "moonPhaseList") return enumIdentifierOptions("MoonPhase", MoonPhase);
        if (kind === "locationTagList")
            return enumIdentifierOptions("LOCATION_TAGS", LOCATION_TAGS);
        if (kind === "placeTagList") return enumIdentifierOptions("PLACE_TAGS", PLACE_TAGS);

        if (kind === "dayKeyList") {
            return (DAY_KEYS ?? []).map((k, idx) => ({ label: k, value: `__DAY_KEYS[${idx}]__` }));
        }

        if (kind === "placeRegistryList") {
            const reg = PLACE_REGISTRY;
            return registryKeyOptions(reg, "key");
        }
        if (kind === "locationRegistryList") {
            const reg = LOCATION_REGISTRY;
            return registryKeyOptions(reg, "key");
        }
        if (kind === "holidayList") return holidayNameOptions();

        if (kind === "npcRegistryList") return registryKeyOptions(NPC_REGISTRY, "key");
        if (kind === "flagRegistryList") return enumIdentifierOptions("Flags", Flags);

        return [];
    }

    _displayLabelForValue(kind, value) {
        if (kind === "dayKeyList") {
            // value is "__DAY_KEYS[i]__"
            const m = String(value).match(/DAY_KEYS\[(\d+)\]/);
            if (m) return DAY_KEYS?.[parseInt(m[1])] ?? value;
        }
        if (String(value).startsWith("__") && String(value).endsWith("__")) {
            return String(value).slice(2, -2);
        }
        return String(value);
    }

    _deleteNodeById(id) {
        const walk = (node) => {
            if (!node || node.type !== "group") return false;
            node.children = (node.children ?? []).filter((c) => c?.id !== id);
            for (const c of node.children ?? []) {
                if (c.id === id) return true;
                if (walk(c)) return true;
            }
            return false;
        };
        walk(this.tree);
    }
}

// small clipboard helper (used by the conditions preview)
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        // fallback
        const ta = el("textarea", { style: "position:fixed;left:-9999px;top:-9999px;" });
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand("copy");
            ta.remove();
            return true;
        } catch (e2) {
            ta.remove();
            return false;
        }
    }
}

function init() {
    renderJson(copyScene);
    renderI18n(i18n);

    // Condition builder modal (shared: scene conditions + per-line conditions)
    const modalMount = byId("conditionModalMount") ?? document.body;
    const condModal = new ConditionBuilderModal(modalMount);

    // Per-text-line conditions (extra + randomized lines), keyed by text array index
    const lineWhenTrees = {};
    const lineWhenObjects = {};

    const isEmptyWhen = (w) => !w || (typeof w === "object" && Object.keys(w).length === 0);

    const applyWhenToTextLine = (idx, tree, whenObj) => {
        const block = copyScene.text?.[idx];
        if (block === null || block === undefined) return;

        const empty = isEmptyWhen(whenObj);

        // Saving an empty tree = clear conditions for that line
        if (empty) {
            delete lineWhenTrees[idx];
            delete lineWhenObjects[idx];

            if (block && typeof block === "object") {
                delete block.when;

                // If this is a simple { key } block, collapse back to a string
                const otherKeys = Object.keys(block).filter((k) => k !== "key");
                if (otherKeys.length === 0 && typeof block.key === "string") {
                    copyScene.text[idx] = block.key;
                }
            }

            renderJson(copyScene);
            return;
        }

        lineWhenTrees[idx] = tree;
        lineWhenObjects[idx] = whenObj;

        if (typeof block === "string") {
            // transform string key -> conditional block object
            copyScene.text[idx] = { when: whenObj, key: block };
        } else if (block && typeof block === "object") {
            block.when = whenObj;
        }

        renderJson(copyScene);
    };

    //bind inputs
    const sceneId = byId("sceneId");
    {
        sceneId.value = copyScene.id;
        sceneId.addEventListener("input", (e) => {
            copyScene.id = e.target.value.trim();
            renderJson(copyScene);

            if (checkIdConflict(copyScene.id)) {
                if (byId("sceneIdConflictWarning")) return;
                const idConflictPill = el("div", {
                    id: "sceneIdConflictWarning",
                    class: "pill warn",
                    text: "scene id already exists",
                });
                byId("sceneProblems").appendChild(idConflictPill);
            } else {
                delEl("sceneIdConflictWarning");
            }
        });

        function checkIdConflict(id) {
            return !!SCENE_DEFS.find((s) => s.id === id);
        }
    }

    const scenePriority = byId("scenePriority");
    {
        scenePriority.value = copyScene.priority;
        scenePriority.addEventListener("input", (e) => {
            const val = parseInt(e.target.value);
            copyScene.priority = isNaN(val) ? 0 : val;
            renderJson(copyScene);
        });
    }

    // textJoiner (scene root)
    const sceneTextJoiner = byId("sceneTextJoiner");
    if (sceneTextJoiner) {
        sceneTextJoiner.value = "";
        sceneTextJoiner.addEventListener("input", (e) => {
            const v = e.target.value;
            if (!v) delete copyScene.textJoiner;
            else copyScene.textJoiner = v;
            renderJson(copyScene);
        });
    }

    // auto choice UI
    const autoExit = byId("autoExit");
    const autoTraversal = byId("autoTraversal");

    const applyAutoChoicesFromCheckboxes = () => {
        const exitOn = !!autoExit.checked;
        const traversalOn = !!autoTraversal.checked;

        if (!exitOn && !traversalOn) {
            delete copyScene.autoChoices;
            renderJson(copyScene);
            return;
        }

        if (!copyScene.autoChoices || typeof copyScene.autoChoices !== "object") {
            copyScene.autoChoices = {};
        }

        if (exitOn) copyScene.autoChoices.exit = true;
        else delete copyScene.autoChoices.exit;

        if (traversalOn) copyScene.autoChoices.traversal = true;
        else delete copyScene.autoChoices.traversal;

        // clean up empty object
        if (!copyScene.autoChoices.exit && !copyScene.autoChoices.traversal) {
            delete copyScene.autoChoices;
        }

        renderJson(copyScene);
    };

    // autoChoices.exit/traversal (scene root)
    {
        autoExit.checked = false;
        autoTraversal.checked = false;

        autoExit.addEventListener("change", applyAutoChoicesFromCheckboxes);
        autoTraversal.addEventListener("change", applyAutoChoicesFromCheckboxes);
    }

    // explicit overrides (scene root): autoTraversal / autoExit
    const autoTraversalOverride = byId("autoTraversalOverride");
    if (autoTraversalOverride) {
        autoTraversalOverride.value = "";
        autoTraversalOverride.addEventListener("change", (e) => {
            const v = e.target.value;
            if (!v) delete copyScene.autoTraversal;
            else copyScene.autoTraversal = v === "true";
            renderJson(copyScene);
        });
    }

    const autoExitOverride = byId("autoExitOverride");
    if (autoExitOverride) {
        autoExitOverride.value = "";
        autoExitOverride.addEventListener("change", (e) => {
            const v = e.target.value;
            if (!v) delete copyScene.autoExit;
            else copyScene.autoExit = v === "true";
            renderJson(copyScene);
        });
    }

    // ---- Text ----
    const mainTextKey = byId("mainTextKey");
    {
        mainTextKey.value = "";
        i18n.SCENES["main"] = { key: "", text: "" };

        mainTextKey.addEventListener("input", (e) => {
            copyScene.text[0] = e.target.value.trim();
            renderJson(copyScene);

            i18n.SCENES["main"].key = copyScene.text[0];
            renderI18n(i18n);

            if (checkIdConflict(copyScene.text[0])) {
                if (byId("mainTextKeyConflictWarning")) return;
                const idConflictPill = el("div", {
                    id: "mainTextKeyConflictWarning",
                    class: "pill warn",
                    text: "main text key already exists",
                });
                byId("sceneProblems").appendChild(idConflictPill);
            } else {
                delEl("mainTextKeyConflictWarning");
            }
        });

        function checkIdConflict(id) {
            return !!Object.keys(STRINGS_EN).find((s) => s === id);
        }
    }

    const mainTextContent = byId("mainTextContent");
    {
        mainTextContent.value = "";

        mainTextContent.addEventListener("input", (e) => {
            const val = e.target.value;
            i18n.SCENES["main"].text = val;
            renderI18n(i18n);
        });
    }

    //extra text lines
    let linesCount = 0;

    const addTextLineBtn = byId("addtextLine");
    {
        addTextLineBtn.addEventListener("click", () => {
            const nr = linesCount + 1;

            const keyLabel = el("label", { text: "Extra text key" + nr });
            const keyInput = el("input", {
                id: "extraTextKey" + nr,
                placeholder: "scene.home.default.extra",
            });
            keyInput.dataset.nr = nr;
            const keyRow = el("div", { class: "row" }, keyLabel, keyInput);

            const textLabel = el("label", { text: "Extra text content" + nr });
            const textInput = el("input", {
                id: "extraTextContent" + nr,
                placeholder: "An extra line of description.",
            });
            textInput.dataset.nr = nr;
            const textRow = el("div", { class: "row" }, textLabel, textInput);
            const rowsCol = el("div", { class: "col" }, keyRow, textRow);

            const condBtn = el("button", { class: "btn small", text: "When" });
            condBtn.title = "Add/edit conditions for this line";
            condBtn.dataset.nr = nr;

            const deleteBtn = el("button", { class: "btn small warn", text: "X" });
            deleteBtn.style.float = "right";
            deleteBtn.title = "Delete this extra line";
            deleteBtn.dataset.nr = nr;

            const updateCondBtnLabel = () => {
                const b = copyScene.text[nr];
                const hasWhen = b && typeof b === "object" && !isEmptyWhen(b.when);
                condBtn.textContent = hasWhen ? "When ✓" : "When";
            };

            const summary = el("summary", { text: "Extra line" + nr }, condBtn, deleteBtn);
            const col = el(
                "details",
                { class: "col box", id: "extraLine-" + nr },
                summary,
                rowsCol
            );

            byId("extraTextKeys").appendChild(col);

            copyScene.text.push("");
            renderJson(copyScene);
            updateCondBtnLabel();

            condBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                condModal.open({
                    initialTree: lineWhenTrees[nr] ?? null,
                    onSave: (tree, whenObj) => {
                        applyWhenToTextLine(nr, tree, whenObj);
                        updateCondBtnLabel();
                    },
                });
            });

            keyInput.addEventListener("input", (e) => {
                const currentNr = Number(e.target.dataset.nr);
                const v = e.target.value.trim();

                const blk = copyScene.text[currentNr];
                if (blk && typeof blk === "object") {
                    blk.key = v;
                } else {
                    copyScene.text[currentNr] = v;
                }
                renderJson(copyScene);
                updateCondBtnLabel();

                if (!i18n.SCENES["extraTextKey" + currentNr]) {
                    i18n.SCENES["extraTextKey" + currentNr] = { key: "", text: "" };
                }

                i18n.SCENES["extraTextKey" + currentNr].key = v;
                renderI18n(i18n);

                if (checkIdConflict(v)) {
                    if (byId("extraTextKeyConflictWarning" + currentNr)) return;
                    const idConflictPill = el("div", {
                        id: "extraTextKeyConflictWarning" + currentNr,
                        class: "pill warn",
                        text: "extra text key #" + currentNr + " already exists",
                    });
                    byId("sceneProblems").appendChild(idConflictPill);
                } else {
                    delEl("extraTextKeyConflictWarning" + currentNr);
                }
            });

            textInput.addEventListener("input", (e) => {
                const currentNr = e.target.dataset.nr;
                const val = e.target.value;

                if (!i18n.SCENES["extraTextKey" + currentNr]) {
                    i18n.SCENES["extraTextKey" + currentNr] = { key: "", text: "" };
                }

                i18n.SCENES["extraTextKey" + currentNr].text = val;
                renderI18n(i18n);
            });

            deleteBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const currentNr = deleteBtn.dataset.nr;

                // keep indexes stable for the editor, but null them
                copyScene.text[currentNr] = null;
                renderJson(copyScene);

                delete lineWhenTrees[currentNr];
                delete lineWhenObjects[currentNr];

                delete i18n.SCENES["extraTextKey" + currentNr];
                renderI18n(i18n);

                if (byId("extraTextKeyConflictWarning" + currentNr)) {
                    delEl("extraTextKeyConflictWarning" + currentNr);
                }

                byId("extraLine-" + currentNr).remove();
            });

            linesCount++;
        });

        function checkIdConflict(id) {
            return !!Object.keys(STRINGS_EN).find((s) => s === id);
        }
    }

    const addBreakBtn = byId("addTextBreak");
    {
        addBreakBtn.addEventListener("click", () => {
            const nr = linesCount + 1;

            copyScene.text.push("__BREAK__");
            renderJson(copyScene);

            const deleteBtn = el("button", { class: "btn small warn", text: "X" });
            deleteBtn.style.float = "right";
            deleteBtn.title = "Delete this break";
            deleteBtn.dataset.nr = nr;

            const breakLineElement = el(
                "div",
                {
                    text: "[Text Break]",
                    class: "btn disabled",
                    id: "extraLine-" + nr,
                },
                deleteBtn
            );

            byId("extraTextKeys").appendChild(breakLineElement);

            deleteBtn.addEventListener("click", () => {
                const currentNr = deleteBtn.dataset.nr;
                copyScene.text[currentNr] = null; //keep indexes stable
                renderJson(copyScene);

                byId("extraLine-" + currentNr).remove();
            });

            linesCount++;
        });
    }

    // Random pick line: { keys: [...], pick: "random" } (writer docs)
    const addRandomizedLineBtn = byId("addRandomizedLine");
    {
        addRandomizedLineBtn.addEventListener("click", () => {
            const nr = linesCount + 1;

            //html
            const title = el("h2", { text: "Line Variants", class: "meta" });
            const variantsBox = el("div", { class: "col" });
            const addVariantBtn = el("button", { class: "btn small", text: "+ variant" });

            const condBtn = el("button", { class: "btn small", text: "When" });
            condBtn.title = "Add/edit conditions for this randomized line";
            condBtn.dataset.nr = nr;

            const deleteBtn = el("button", { class: "btn small warn", text: "X" });
            deleteBtn.style.float = "right";
            deleteBtn.title = "Delete this variant line";
            deleteBtn.dataset.nr = nr;

            const updateCondBtnLabel = () => {
                const b = copyScene.text[nr];
                const hasWhen = b && typeof b === "object" && !isEmptyWhen(b.when);
                condBtn.textContent = hasWhen ? "When ✓" : "When";
            };

            const summary = el("summary", { text: "Variant line" + nr }, condBtn, deleteBtn);
            const col = el(
                "details",
                { class: "col box", id: "extraLine-" + nr },
                summary,
                title,
                variantsBox,
                addVariantBtn
            );
            byId("extraTextKeys").appendChild(col);

            //json output logic
            copyScene.text[nr] = { keys: [], pick: "random" };
            renderJson(copyScene);
            updateCondBtnLabel();

            condBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                condModal.open({
                    initialTree: lineWhenTrees[nr] ?? null,
                    onSave: (tree, whenObj) => {
                        applyWhenToTextLine(nr, tree, whenObj);
                        updateCondBtnLabel();
                    },
                });
            });

            //key bindings
            let variantsCount = 0;

            addVariantBtn.addEventListener("click", () => {
                const variantNr = variantsCount + 1;

                const vKeyLabel = el("label", { text: "Variant " + variantNr });
                const vKeyInput = el("input", {
                    id: `extraTextLine${nr}-variantKey${variantNr}`,
                    placeholder: `scene.home.default.random.${variantNr}`,
                });
                vKeyInput.dataset.nr = variantNr;
                const vKeyRow = el("div", { class: "row" }, vKeyLabel, vKeyInput);

                const vTextLabel = el("label", { text: "Variant " + variantNr + " content" });
                const vTextInput = el("input", {
                    id: `extraTextLine${nr}-variantText${variantNr}`,
                    placeholder: "An extra line of description.",
                });
                vTextInput.dataset.nr = variantNr;

                const vDeleteBtn = el("button", { class: "btn small warn", text: "X" });
                vDeleteBtn.style.width = "8%";
                vDeleteBtn.title = "Delete this variant";
                vDeleteBtn.dataset.nr = variantNr;

                const vTextRow = el("div", { class: "row" }, vTextLabel, vTextInput);
                const variantInstanceElem = el(
                    "div",
                    { class: "col box", id: `extraTextLine${nr}-variant${variantNr}` },
                    vKeyRow,
                    vTextRow,
                    vDeleteBtn
                );

                variantsBox.appendChild(variantInstanceElem);

                vTextInput.addEventListener("input", (e) => {
                    const currentVNr = e.target.dataset.nr;
                    const val = e.target.value;

                    if (!i18n.SCENES[`extraTextLine${nr}-variant${currentVNr}`]) {
                        i18n.SCENES[`extraTextLine${nr}-variant${currentVNr}`] = {
                            key: "",
                            text: "",
                        };
                    }

                    i18n.SCENES[`extraTextLine${nr}-variant${currentVNr}`].text = val;
                    renderI18n(i18n);
                });

                vKeyInput.addEventListener("input", (e) => {
                    const currentVNr = e.target.dataset.nr;
                    copyScene.text[nr].keys[currentVNr] = e.target.value.trim();
                    renderJson(copyScene);

                    if (!i18n.SCENES[`extraTextLine${nr}-variant${currentVNr}`]) {
                        i18n.SCENES[`extraTextLine${nr}-variant${currentVNr}`] = {
                            key: "",
                            text: "",
                        };
                    }

                    i18n.SCENES[`extraTextLine${nr}-variant${currentVNr}`].key =
                        copyScene.text[nr].keys[currentVNr];

                    renderI18n(i18n);

                    // optional duplicate check (EN only, like other inputs)
                    if (checkIdConflict(copyScene.text[nr].keys[currentVNr])) {
                        const warnId = `extraTextLineKeyConflictWarning${nr}-${currentVNr}`;
                        if (byId(warnId)) return;
                        const idConflictPill = el("div", {
                            id: warnId,
                            class: "pill warn",
                            text: `variant key line #${nr} variant #${currentVNr} already exists`,
                        });
                        byId("sceneProblems").appendChild(idConflictPill);
                    } else {
                        delEl(`extraTextLineKeyConflictWarning${nr}-${currentVNr}`);
                    }
                });

                vDeleteBtn.addEventListener("click", () => {
                    const currentVNr = vDeleteBtn.dataset.nr;
                    copyScene.text[nr].keys[currentVNr] = null; //keep indexes stable
                    renderJson(copyScene);

                    delete i18n.SCENES[`extraTextLine${nr}-variant${currentVNr}`];
                    renderI18n(i18n);

                    delEl(`extraTextLineKeyConflictWarning${nr}-${currentVNr}`);
                    byId(`extraTextLine${nr}-variant${currentVNr}`).remove();
                });

                variantsCount++;
            });

            deleteBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const currentNr = deleteBtn.dataset.nr;

                // remove from scene text (keep indexes stable)
                copyScene.text[currentNr] = null;
                renderJson(copyScene);

                delete lineWhenTrees[currentNr];
                delete lineWhenObjects[currentNr];

                // remove all i18n entries for this randomized line
                for (const k of Object.keys(i18n.SCENES)) {
                    if (k.startsWith(`extraTextLine${currentNr}-variant`)) {
                        delete i18n.SCENES[k];
                    }
                }
                renderI18n(i18n);

                // remove any conflict warnings for variants in that line
                for (const k of Array.from(byId("sceneProblems")?.children ?? [])) {
                    if (k?.id?.startsWith?.(`extraTextLineKeyConflictWarning${currentNr}-`)) {
                        k.remove();
                    }
                }

                byId("extraLine-" + currentNr).remove();
            });

            function checkIdConflict(id) {
                return !!Object.keys(STRINGS_EN).find((s) => s === id);
            }

            linesCount++;
        });
    }

    // ---- Conditions (unified modal, NOT wired into scene output yet) ----
    const sceneConditionsPreview = byId("sceneConditionsPreview");
    const editSceneConditions = byId("editSceneConditions");
    const copySceneConditions = byId("copySceneConditions");

    if (sceneConditionsPreview && editSceneConditions && copySceneConditions) {
        let sceneWhenTree = null;
        let sceneWhenObject = null;

        const renderPreview = () => {
            sceneConditionsPreview.textContent = "";
            const pre = el("pre");
            const payload = sceneWhenObject ? { when: sceneWhenObject } : { when: {} };
            pre.textContent = cleanIdentifiers(JSON.stringify(payload, null, 4));
            sceneConditionsPreview.appendChild(pre);
        };

        renderPreview();

        editSceneConditions.addEventListener("click", () => {
            condModal.open({
                initialTree: sceneWhenTree,
                onSave: (tree, whenObj) => {
                    sceneWhenTree = tree;
                    sceneWhenObject = whenObj;
                    renderPreview();
                },
            });
        });

        copySceneConditions.addEventListener("click", async () => {
            const payload = sceneWhenObject ? { when: sceneWhenObject } : { when: {} };
            const text = cleanIdentifiers(JSON.stringify(payload, null, 4));
            const ok = await copyToClipboard(text);
            copySceneConditions.textContent = ok ? "Copied" : "Copy failed";
            setTimeout(() => (copySceneConditions.textContent = "Copy"), 900);
        });
    }
}

function renderJson(scene = baseScene) {
    const pre = el("pre");

    // Build a clean output object (avoid mutating the live editor model)
    const outputScene = JSON.parse(JSON.stringify(scene));

    // Clean text blocks for OUTPUT:
    if (Array.isArray(outputScene.text)) {
        outputScene.text = outputScene.text
            .filter((t) => {
                if (t === null || t === undefined) return false;
                if (t === "") return false;

                if (typeof t === "object" && t) {
                    // { keys: [...] }
                    if (t?.keys) {
                        const realKeys = (t.keys ?? []).filter((k) => k);
                        return realKeys.length > 0;
                    }
                    // { key: "..." }
                    if (typeof t?.key === "string") {
                        return t.key.trim().length > 0;
                    }
                }

                return true;
            })
            .map((t) => {
                if (typeof t === "object" && t) {
                    // drop empty when blocks
                    if (t.when && typeof t.when === "object" && Object.keys(t.when).length === 0) {
                        delete t.when;
                    }
                    if (t?.keys) {
                        return { ...t, keys: (t.keys ?? []).filter((k) => k) };
                    }
                }
                return t;
            });

        if (outputScene.text.length === 0) delete outputScene.text;
    }

    const rawJSON = cleanIdentifiers(JSON.stringify(outputScene, null, 4));

    pre.textContent = rawJSON;
    byId("jsonOutput").textContent = "";
    byId("jsonOutput").appendChild(pre);
}

function renderI18n(strings = i18n) {
    const outputDiv = byId("stringsOutput");
    outputDiv.textContent = "";

    const pre = el("pre");
    const text = ["// SCENES"];
    for (const [k, v] of Object.entries(strings.SCENES)) {
        if (!v?.key) continue;
        text.push(`"${v.key}": "${(v.text ?? "").replace(/"/g, '\\"')}",`);
    }
    text.push("\n// CHOICES");
    for (const [k, v] of Object.entries(strings.CHOICES)) {
        if (!v?.key) continue;
        text.push(`"${v.key}": "${(v.text ?? "").replace(/"/g, '\\"')}",`);
    }
    pre.textContent = text.join("\n");
    outputDiv.appendChild(pre);
}

// ---------- Boot ----------
window.addEventListener("DOMContentLoaded", () => {
    init();
});
