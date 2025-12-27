// Scene writer
// -----------------------------------------------------------------------------
// A small authoring helper that generates:
//  1) a scene object literal you can paste into a scene pack
//  2) i18n key/value entries you can paste into src/data/i18n/{en,pl}/*.js
//
// This is intentionally lightweight and dependency-free.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const WeatherType = window.WeatherType || null;
const LOCATION_TAGS = window.LOCATION_TAGS || null;

function escapeJSString(s) {
    const str = String(s ?? "");
    return str
        .replaceAll("\\", "\\\\")
        .replaceAll("\n", "\\n")
        .replaceAll("\r", "")
        .replaceAll("\t", "\\t")
        .replaceAll('"', '\\"');
}

function asQuoted(s) {
    return `"${escapeJSString(s)}"`;
}

function indentLines(s, spaces) {
    const pad = " ".repeat(spaces);
    return String(s)
        .split("\n")
        .map((l) => (l.trim().length ? pad + l : l))
        .join("\n");
}

function normalizeId(s) {
    return String(s || "")
        .trim()
        .replaceAll(" ", "_");
}

function ensureObjectWrapper(text) {
    const t = String(text || "").trim();
    if (!t) return "";
    if (t.startsWith("{") && t.endsWith("}")) return t;
    return `{\n${t}\n}`;
}

function insertLineIntoObjectTextarea(textarea, line) {
    const el = textarea;
    const raw = String(el.value || "");
    if (!raw.trim()) {
        el.value = `{\n  ${line}\n}`;
        return;
    }

    // If user already has braces, insert before the last closing brace.
    const idx = raw.lastIndexOf("}");
    if (idx !== -1) {
        const before = raw.slice(0, idx).replace(/[\s\n]*$/, "");
        const after = raw.slice(idx);
        const needsComma = before.trim().endsWith(",") || before.trim().endsWith("{") ? "" : ",";
        el.value = `${before}${needsComma}\n  ${line}\n${after}`;
        return;
    }

    // Fallback: just append.
    el.value = `${raw.trim()}\n${line}`;
}

function buildKey(prefix, sceneId, suffix) {
    const sid = normalizeId(sceneId);
    return `${prefix}.${sid}.${suffix}`;
}

function fmtKVPairs(entries) {
    // entries: Array<[key, value]>
    return entries
        .filter(([k, v]) => k && (v ?? "") !== "")
        .map(([k, v]) => `    ${asQuoted(k)}: ${asQuoted(v)},`)
        .join("\n");
}

function copyToClipboard(text) {
    const s = String(text || "");
    if (!s) return;
    navigator.clipboard?.writeText(s).catch(() => {
        // fallback: select in a temporary textarea
        const ta = document.createElement("textarea");
        ta.value = s;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
    });
}

const state = {
    sceneId: "",
    priority: 0,
    autoExit: false,
    autoTraversal: false,
    conditionsText: "",

    mainTextKey: "",
    mainTextEn: "",
    mainTextPl: "",

    extraBlocks: [],
    choices: [],
};

function makeExtraBlock(type = "plain") {
    return {
        type, // plain | cond | random
        when: "",
        key: "",
        en: "",
        pl: "",
        variants: [
            { key: "", en: "", pl: "" },
            { key: "", en: "", pl: "" },
        ],
    };
}

function makeChoice() {
    return {
        id: "",
        textKey: "",
        en: "",
        pl: "",
        minutes: 0,
        hideMinutes: false,
        showAnyway: false,
        conditionsText: "",

        // actions
        nextSceneId: "",
        queueSceneId: "",
        queuePriority: "",
        moveToLocationId: "",
        moveToHome: false,
        setPlaceId: "",
        setPlaceKey: "",
        exitToOutside: false,
        setFlags: "",
        clearFlags: "",
    };
}

function renderEditor() {
    const root = $("#editor");
    root.innerHTML = "";

    const header = document.createElement("div");
    header.innerHTML = `
        <h2>Scene</h2>
        <div class="meta">Fill in the fields on the left. Snippets update live on the right.</div>
    `;
    root.appendChild(header);

    // Scene basics ---------------------------------------------------------
    const basics = document.createElement("div");
    basics.innerHTML = `
        <label>Scene id</label>
        <input id="sceneId" placeholder="e.g. home.default" />

        <div class="row">
            <div>
                <label>Priority</label>
                <input id="priority" type="number" step="1" />
            </div>
            <div>
                <label>Auto choices (menu/lobby)</label>
                <div class="inline" style="gap:12px">
                    <label style="margin:0; display:flex; gap:8px; align-items:center; color:var(--fg)">
                        <input id="autoExit" type="checkbox" style="width:auto" />
                        Exit
                    </label>
                    <label style="margin:0; display:flex; gap:8px; align-items:center; color:var(--fg)">
                        <input id="autoTraversal" type="checkbox" style="width:auto" />
                        Traversal
                    </label>
                </div>
            </div>
        </div>
    `;
    root.appendChild(basics);

    $("#sceneId", basics).value = state.sceneId;
    $("#priority", basics).value = String(state.priority ?? 0);
    $("#autoExit", basics).checked = !!state.autoExit;
    $("#autoTraversal", basics).checked = !!state.autoTraversal;

    $("#sceneId", basics).addEventListener("input", (e) => {
        state.sceneId = e.target.value;
        maybeAutoFillKeys();
        renderOutput();
    });
    $("#priority", basics).addEventListener("input", (e) => {
        state.priority = Number(e.target.value) || 0;
        renderOutput();
    });
    $("#autoExit", basics).addEventListener("change", (e) => {
        state.autoExit = !!e.target.checked;
        renderOutput();
    });
    $("#autoTraversal", basics).addEventListener("change", (e) => {
        state.autoTraversal = !!e.target.checked;
        renderOutput();
    });

    // Conditions -----------------------------------------------------------
    const cond = document.createElement("div");
    cond.innerHTML = `
        <label>Scene conditions (object literal)</label>
        <textarea id="sceneConditions" placeholder="e.g. { outside: true, notPlayerFlags: [\"injured\"] }"></textarea>
        <div class="copyRow">
            <div class="hint">Helpers insert common keys into the object below.</div>
            <div class="inline" style="justify-content:flex-end">
                <button class="btn small" id="insOutside">outside</button>
                <button class="btn small" id="insInPlace">inPlace</button>
                <button class="btn small" id="insNotFlag">notPlayerFlags</button>
                <button class="btn small" id="insFlag">playerFlags</button>
            </div>
        </div>
        <div class="row">
            <div>
                <label>Insert weatherType</label>
                <div class="inline">
                    <select id="weatherSel"></select>
                    <button class="btn small" id="insWeather">insert</button>
                </div>
            </div>
            <div>
                <label>Insert locationTag</label>
                <div class="inline">
                    <select id="tagSel"></select>
                    <button class="btn small" id="insTag">insert</button>
                </div>
            </div>
        </div>
    `;
    root.appendChild(cond);

    const ta = $("#sceneConditions", cond);
    ta.value = state.conditionsText;
    ta.addEventListener("input", (e) => {
        state.conditionsText = e.target.value;
        renderOutput();
    });

    $("#insOutside", cond).addEventListener("click", () => {
        insertLineIntoObjectTextarea(ta, "outside: true");
        state.conditionsText = ta.value;
        renderOutput();
    });
    $("#insInPlace", cond).addEventListener("click", () => {
        insertLineIntoObjectTextarea(ta, "inPlace: true");
        state.conditionsText = ta.value;
        renderOutput();
    });
    $("#insNotFlag", cond).addEventListener("click", () => {
        insertLineIntoObjectTextarea(ta, 'notPlayerFlags: ["flagName"]');
        state.conditionsText = ta.value;
        renderOutput();
    });
    $("#insFlag", cond).addEventListener("click", () => {
        insertLineIntoObjectTextarea(ta, 'playerFlags: ["flagName"]');
        state.conditionsText = ta.value;
        renderOutput();
    });

    const weatherSel = $("#weatherSel", cond);
    weatherSel.innerHTML = "";
    const weathers = WeatherType ? Object.keys(WeatherType) : [];
    weatherSel.appendChild(new Option(weathers.length ? "WeatherType…" : "(WeatherType missing)", ""));
    for (const k of weathers) weatherSel.appendChild(new Option(k, k));

    $("#insWeather", cond).addEventListener("click", () => {
        const k = weatherSel.value;
        if (!k) return;
        insertLineIntoObjectTextarea(ta, `weatherType: WeatherType.${k}`);
        state.conditionsText = ta.value;
        renderOutput();
    });

    const tagSel = $("#tagSel", cond);
    tagSel.innerHTML = "";
    const tags = LOCATION_TAGS ? Object.keys(LOCATION_TAGS) : [];
    tagSel.appendChild(new Option(tags.length ? "LOCATION_TAGS…" : "(LOCATION_TAGS missing)", ""));
    for (const k of tags) tagSel.appendChild(new Option(k, k));

    $("#insTag", cond).addEventListener("click", () => {
        const k = tagSel.value;
        if (!k) return;
        insertLineIntoObjectTextarea(ta, `locationTag: LOCATION_TAGS.${k}`);
        state.conditionsText = ta.value;
        renderOutput();
    });

    // Text -----------------------------------------------------------------
    const text = document.createElement("div");
    text.innerHTML = `
        <hr style="border:none; border-top:1px solid var(--line); margin:16px 0" />
        <h2>Text</h2>
        <div class="meta">
            If you add extra lines below, the tool will output <span class="pill">text: [ ... ]</span>.
            Otherwise it outputs a single <span class="pill">textKey</span>.
        </div>

        <div class="row">
            <div>
                <label>Main text key</label>
                <input id="mainTextKey" placeholder="scene.home.default.text" />
            </div>
            <div>
                <label>Tip</label>
                <div class="meta">Keys are not validated; copy/paste is the goal.</div>
            </div>
        </div>

        <label>Main text (EN)</label>
        <textarea id="mainTextEn" placeholder="You are currently in…"></textarea>

        <label>Main text (PL, optional)</label>
        <textarea id="mainTextPl" placeholder="(optional)"></textarea>

        <div class="copyRow">
            <div class="hint">Extra text blocks (plain / conditional / random)</div>
            <div class="inline" style="justify-content:flex-end">
                <button class="btn small" id="addPlain">+ plain line</button>
                <button class="btn small" id="addCond">+ conditional line</button>
                <button class="btn small" id="addRandom">+ random pick</button>
            </div>
        </div>
        <div class="list" id="extraBlocks"></div>
    `;
    root.appendChild(text);

    $("#mainTextKey", text).value = state.mainTextKey;
    $("#mainTextEn", text).value = state.mainTextEn;
    $("#mainTextPl", text).value = state.mainTextPl;

    $("#mainTextKey", text).addEventListener("input", (e) => {
        state.mainTextKey = e.target.value;
        renderOutput();
    });
    $("#mainTextEn", text).addEventListener("input", (e) => {
        state.mainTextEn = e.target.value;
        renderOutput();
    });
    $("#mainTextPl", text).addEventListener("input", (e) => {
        state.mainTextPl = e.target.value;
        renderOutput();
    });

    $("#addPlain", text).addEventListener("click", () => {
        state.extraBlocks.push(makeExtraBlock("plain"));
        maybeAutoFillKeys();
        renderEditor();
        renderOutput();
    });
    $("#addCond", text).addEventListener("click", () => {
        state.extraBlocks.push(makeExtraBlock("cond"));
        maybeAutoFillKeys();
        renderEditor();
        renderOutput();
    });
    $("#addRandom", text).addEventListener("click", () => {
        state.extraBlocks.push(makeExtraBlock("random"));
        maybeAutoFillKeys();
        renderEditor();
        renderOutput();
    });

    renderExtraBlocks($("#extraBlocks", text));

    // Choices --------------------------------------------------------------
    const choices = document.createElement("div");
    choices.innerHTML = `
        <hr style="border:none; border-top:1px solid var(--line); margin:16px 0" />
        <h2>Choices</h2>
        <div class="copyRow">
            <div class="hint">Each choice can have conditions + showAnyway (disabled button when unmet).</div>
            <button class="btn small" id="addChoice">+ add choice</button>
        </div>
        <div class="list" id="choiceList"></div>
    `;
    root.appendChild(choices);

    $("#addChoice", choices).addEventListener("click", () => {
        state.choices.push(makeChoice());
        maybeAutoFillKeys();
        renderEditor();
        renderOutput();
    });

    renderChoices($("#choiceList", choices));
}

function renderExtraBlocks(container) {
    container.innerHTML = "";
    state.extraBlocks.forEach((b, idx) => {
        const wrap = document.createElement("div");
        wrap.className = "item";
        wrap.innerHTML = `
            <div class="itemHeader">
                <div>
                    <strong>Block #${idx + 1}</strong>
                    <span class="pill">${b.type}</span>
                </div>
                <button class="btn small danger" data-del="${idx}">remove</button>
            </div>
        `;

        const body = document.createElement("div");
        body.style.marginTop = "10px";

        if (b.type === "plain") {
            body.innerHTML = `
                <label>Key</label>
                <input data-k />
                <label>Text (EN)</label>
                <textarea data-en></textarea>
                <label>Text (PL, optional)</label>
                <textarea data-pl></textarea>
            `;
        } else if (b.type === "cond") {
            body.innerHTML = `
                <label>Condition (object literal)</label>
                <textarea data-when placeholder='{ playerFlags: ["someFlag"] }'></textarea>
                <label>Key</label>
                <input data-k />
                <label>Text (EN)</label>
                <textarea data-en></textarea>
                <label>Text (PL, optional)</label>
                <textarea data-pl></textarea>
            `;
        } else {
            body.innerHTML = `
                <label>Condition (optional)</label>
                <textarea data-when placeholder='(optional)'></textarea>
                <div class="meta">Variants (the engine will pick one at random)</div>
                <div class="list" data-vars></div>
                <button class="btn small" data-addVar>+ add variant</button>
            `;
        }

        wrap.appendChild(body);
        container.appendChild(wrap);

        $("button[data-del]", wrap).addEventListener("click", () => {
            state.extraBlocks.splice(idx, 1);
            maybeAutoFillKeys();
            renderEditor();
            renderOutput();
        });

        const k = $("[data-k]", wrap);
        if (k) {
            k.value = b.key;
            k.addEventListener("input", (e) => {
                b.key = e.target.value;
                renderOutput();
            });
        }
        const en = $("[data-en]", wrap);
        if (en) {
            en.value = b.en;
            en.addEventListener("input", (e) => {
                b.en = e.target.value;
                renderOutput();
            });
        }
        const pl = $("[data-pl]", wrap);
        if (pl) {
            pl.value = b.pl;
            pl.addEventListener("input", (e) => {
                b.pl = e.target.value;
                renderOutput();
            });
        }
        const when = $("[data-when]", wrap);
        if (when) {
            when.value = b.when;
            when.addEventListener("input", (e) => {
                b.when = e.target.value;
                renderOutput();
            });
        }

        if (b.type === "random") {
            const vars = $("[data-vars]", wrap);
            const renderVars = () => {
                vars.innerHTML = "";
                b.variants.forEach((v, vi) => {
                    const it = document.createElement("div");
                    it.className = "item";
                    it.innerHTML = `
                        <div class="itemHeader">
                            <strong>Variant ${vi + 1}</strong>
                            <button class="btn small danger" data-delVar="${vi}">remove</button>
                        </div>
                        <label>Key</label>
                        <input data-vk />
                        <label>Text (EN)</label>
                        <textarea data-ven></textarea>
                        <label>Text (PL, optional)</label>
                        <textarea data-vpl></textarea>
                    `;
                    vars.appendChild(it);

                    $("[data-vk]", it).value = v.key;
                    $("[data-ven]", it).value = v.en;
                    $("[data-vpl]", it).value = v.pl;

                    $("[data-vk]", it).addEventListener("input", (e) => {
                        v.key = e.target.value;
                        renderOutput();
                    });
                    $("[data-ven]", it).addEventListener("input", (e) => {
                        v.en = e.target.value;
                        renderOutput();
                    });
                    $("[data-vpl]", it).addEventListener("input", (e) => {
                        v.pl = e.target.value;
                        renderOutput();
                    });
                    $("button[data-delVar]", it).addEventListener("click", () => {
                        b.variants.splice(vi, 1);
                        maybeAutoFillKeys();
                        renderEditor();
                        renderOutput();
                    });
                });
            };

            $("button[data-addVar]", wrap).addEventListener("click", () => {
                b.variants.push({ key: "", en: "", pl: "" });
                maybeAutoFillKeys();
                renderEditor();
                renderOutput();
            });

            renderVars();
        }
    });
}

function renderChoices(container) {
    container.innerHTML = "";
    state.choices.forEach((c, idx) => {
        const wrap = document.createElement("div");
        wrap.className = "item";
        wrap.innerHTML = `
            <div class="itemHeader">
                <div>
                    <strong>Choice #${idx + 1}</strong>
                    <span class="pill">id: ${c.id || "(unset)"}</span>
                </div>
                <button class="btn small danger" data-del="${idx}">remove</button>
            </div>

            <div class="row" style="margin-top:10px">
                <div>
                    <label>Choice id</label>
                    <input data-id placeholder="e.g. waitForPackage" />
                </div>
                <div>
                    <label>Text key</label>
                    <input data-textKey placeholder="choice.home.default.waitForPackage" />
                </div>
            </div>

            <div class="row">
                <div>
                    <label>Minutes</label>
                    <input data-min type="number" step="1" />
                </div>
                <div>
                    <label>Display</label>
                    <div class="inline" style="gap:12px">
                        <label style="margin:0; display:flex; gap:8px; align-items:center; color:var(--fg)">
                            <input data-hideMinutes type="checkbox" style="width:auto" />
                            hide minutes
                        </label>
                        <label style="margin:0; display:flex; gap:8px; align-items:center; color:var(--fg)">
                            <input data-showAnyway type="checkbox" style="width:auto" />
                            showAnyway (disabled)
                        </label>
                    </div>
                </div>
            </div>

            <label>Choice conditions (object literal)</label>
            <textarea data-cond placeholder='e.g. { notPlayerFlags: ["waitingForPackage"] }'></textarea>

            <label>Choice label (EN)</label>
            <textarea data-en placeholder="Wait for the package"></textarea>
            <label>Choice label (PL, optional)</label>
            <textarea data-pl placeholder="(optional)"></textarea>

            <hr style="border:none; border-top:1px solid var(--line); margin:12px 0" />
            <div class="meta">Actions (optional)</div>

            <div class="row">
                <div>
                    <label>setFlags (comma separated)</label>
                    <input data-setFlags placeholder="waitingForPackage" />
                </div>
                <div>
                    <label>clearFlags (comma separated)</label>
                    <input data-clearFlags placeholder="waitingForPackage" />
                </div>
            </div>

            <div class="row">
                <div>
                    <label>nextSceneId</label>
                    <input data-nextScene placeholder="e.g. home.default" />
                </div>
                <div>
                    <label>queueSceneId</label>
                    <input data-queueScene placeholder="e.g. medical.ambulance" />
                </div>
            </div>

            <div class="row">
                <div>
                    <label>moveToLocationId</label>
                    <input data-moveLoc placeholder="e.g. district_a" />
                </div>
                <div>
                    <label>queuePriority (number)</label>
                    <input data-queuePrio type="number" step="1" placeholder="999" />
                </div>
            </div>

            <div class="row">
                <div>
                    <label>setPlaceId</label>
                    <input data-placeId placeholder="e.g. cafe_01" />
                </div>
                <div>
                    <label>setPlaceKey</label>
                    <input data-placeKey placeholder="e.g. player_home" />
                </div>
            </div>

            <div class="inline" style="gap:12px">
                <label style="margin:0; display:flex; gap:8px; align-items:center; color:var(--fg)">
                    <input data-exit type="checkbox" style="width:auto" />
                    exitToOutside
                </label>
                <label style="margin:0; display:flex; gap:8px; align-items:center; color:var(--fg)">
                    <input data-moveHome type="checkbox" style="width:auto" />
                    moveToHome
                </label>
            </div>
        `;

        container.appendChild(wrap);

        $("button[data-del]", wrap).addEventListener("click", () => {
            state.choices.splice(idx, 1);
            renderEditor();
            renderOutput();
        });

        const bind = (sel, key, map = (x) => x) => {
            const el = $(sel, wrap);
            if (!el) return;
            if (el.type === "checkbox") el.checked = !!c[key];
            else el.value = String(c[key] ?? "");
            el.addEventListener("input", (e) => {
                c[key] = el.type === "checkbox" ? !!el.checked : map(e.target.value);
                if (key === "id") maybeAutoFillKeys();
                renderOutput();
                // Update pill
                const pill = $$(".pill", wrap)[0];
                if (pill && key === "id") pill.textContent = `id: ${c.id || "(unset)"}`;
            });
        };

        bind("[data-id]", "id", (v) => normalizeId(v));
        bind("[data-textKey]", "textKey");
        bind("[data-min]", "minutes", (v) => Number(v) || 0);
        bind("[data-hideMinutes]", "hideMinutes");
        bind("[data-showAnyway]", "showAnyway");
        bind("[data-cond]", "conditionsText");
        bind("[data-en]", "en");
        bind("[data-pl]", "pl");
        bind("[data-setFlags]", "setFlags");
        bind("[data-clearFlags]", "clearFlags");
        bind("[data-nextScene]", "nextSceneId");
        bind("[data-queueScene]", "queueSceneId");
        bind("[data-queuePrio]", "queuePriority", (v) => v);
        bind("[data-moveLoc]", "moveToLocationId");
        bind("[data-placeId]", "setPlaceId");
        bind("[data-placeKey]", "setPlaceKey");
        bind("[data-exit]", "exitToOutside");
        bind("[data-moveHome]", "moveToHome");
    });
}

function maybeAutoFillKeys() {
    const sid = normalizeId(state.sceneId);
    if (!sid) return;

    if (!state.mainTextKey || state.mainTextKey.startsWith("scene.")) {
        state.mainTextKey = buildKey("scene", sid, "text");
    }

    state.extraBlocks.forEach((b, idx) => {
        if (!b.key || b.key.startsWith("scene.")) {
            b.key = buildKey("scene", sid, `line.${idx + 1}`);
        }
        if (b.type === "random") {
            b.variants.forEach((v, vi) => {
                if (!v.key || v.key.startsWith("scene.")) {
                    v.key = buildKey("scene", sid, `line.${idx + 1}.v${vi + 1}`);
                }
            });
        }
    });

    state.choices.forEach((c) => {
        const cid = normalizeId(c.id);
        if (!cid) return;
        if (!c.textKey || c.textKey.startsWith("choice.")) {
            c.textKey = buildKey("choice", sid, cid);
        }
    });
}

function sceneObjectSnippet() {
    const sid = normalizeId(state.sceneId);
    const idLine = `id: ${asQuoted(sid || state.sceneId || "")}`;
    const prio = `priority: ${Number(state.priority) || 0}`;

    const ac = [];
    if (state.autoTraversal) ac.push("traversal: true");
    if (state.autoExit) ac.push("exit: true");
    const autoChoicesLine = ac.length ? `autoChoices: { ${ac.join(", ")} }` : "";

    const condText = ensureObjectWrapper(state.conditionsText);
    const condLine = condText ? `conditions: ${condText}` : "";

    const hasExtra = state.extraBlocks.length > 0;

    let textLine = "";
    if (!hasExtra) {
        textLine = `textKey: ${asQuoted(state.mainTextKey || "")}`;
    } else {
        const parts = [];
        parts.push(asQuoted(state.mainTextKey || ""));
        for (const b of state.extraBlocks) {
            if (b.type === "plain") {
                parts.push(asQuoted(b.key));
            } else if (b.type === "cond") {
                const w = ensureObjectWrapper(b.when);
                parts.push(`{ when: ${w || "{}"}, key: ${asQuoted(b.key)} }`);
            } else {
                const w = ensureObjectWrapper(b.when);
                const keys = b.variants.map((v) => asQuoted(v.key)).join(", ");
                parts.push(`{ when: ${w || "{}"}, keys: [${keys}], pick: "random" }`);
            }
        }
        textLine = `text: [\n${indentLines(parts.join(",\n"), 8)}\n    ]`;
    }

    const choiceLines = state.choices.map((c) => choiceObjectSnippet(c)).filter(Boolean);
    const choicesBlock = `choices: [\n${indentLines(choiceLines.join(",\n"), 8)}\n    ]`;

    const fields = [idLine, prio, autoChoicesLine, condLine, textLine, choicesBlock].filter(Boolean);

    return `{
    ${fields.join(",\n    ")}
}`;
}

function splitCSV(s) {
    return String(s || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
}

function choiceObjectSnippet(c) {
    const cid = normalizeId(c.id);
    if (!cid) return "{ /* missing choice id */ }";

    const fields = [];
    fields.push(`id: ${asQuoted(cid)}`);
    fields.push(`textKey: ${asQuoted(c.textKey || "")}`);
    fields.push(`minutes: ${Number(c.minutes) || 0}`);
    if (c.hideMinutes) fields.push(`hideMinutes: true`);
    if (c.showAnyway) fields.push(`showAnyway: true`);

    const condText = ensureObjectWrapper(c.conditionsText);
    if (condText) fields.push(`conditions: ${condText}`);

    const setFlags = splitCSV(c.setFlags);
    if (setFlags.length === 1) fields.push(`setFlag: ${asQuoted(setFlags[0])}`);
    else if (setFlags.length > 1)
        fields.push(`setFlags: [${setFlags.map(asQuoted).join(", ")}]`);

    const clearFlags = splitCSV(c.clearFlags);
    if (clearFlags.length === 1) fields.push(`clearFlag: ${asQuoted(clearFlags[0])}`);
    else if (clearFlags.length > 1)
        fields.push(`clearFlags: [${clearFlags.map(asQuoted).join(", ")}]`);

    if (c.exitToOutside) fields.push(`exitToOutside: true`);
    if (c.moveToHome) fields.push(`moveToHome: true`);

    if (c.setPlaceId) fields.push(`setPlaceId: ${asQuoted(c.setPlaceId)}`);
    if (c.setPlaceKey) fields.push(`setPlaceKey: ${asQuoted(c.setPlaceKey)}`);
    if (c.moveToLocationId) fields.push(`moveToLocationId: ${asQuoted(c.moveToLocationId)}`);

    if (c.queueSceneId) fields.push(`queueSceneId: ${asQuoted(c.queueSceneId)}`);
    if (String(c.queuePriority).trim()) fields.push(`queuePriority: ${Number(c.queuePriority) || 0}`);
    if (c.nextSceneId) fields.push(`nextSceneId: ${asQuoted(c.nextSceneId)}`);

    return `{
        ${fields.join(",\n        ")}
    }`;
}

function i18nEntries() {
    const scenesEn = [];
    const scenesPl = [];
    const choicesEn = [];
    const choicesPl = [];

    if (state.mainTextKey) {
        scenesEn.push([state.mainTextKey, state.mainTextEn || ""]);
        if (state.mainTextPl) scenesPl.push([state.mainTextKey, state.mainTextPl]);
    }

    for (const b of state.extraBlocks) {
        if (b.type === "random") {
            for (const v of b.variants) {
                if (v.key) {
                    scenesEn.push([v.key, v.en || ""]);
                    if (v.pl) scenesPl.push([v.key, v.pl]);
                }
            }
        } else {
            if (b.key) {
                scenesEn.push([b.key, b.en || ""]);
                if (b.pl) scenesPl.push([b.key, b.pl]);
            }
        }
    }

    for (const c of state.choices) {
        if (!c.textKey) continue;
        choicesEn.push([c.textKey, c.en || ""]);
        if (c.pl) choicesPl.push([c.textKey, c.pl]);
    }

    return {
        scenesEn,
        scenesPl,
        choicesEn,
        choicesPl,
    };
}

function renderOutput() {
    const root = $("#output");
    const scene = sceneObjectSnippet();
    const { scenesEn, scenesPl, choicesEn, choicesPl } = i18nEntries();

    const scenesEnText = fmtKVPairs(scenesEn);
    const choicesEnText = fmtKVPairs(choicesEn);
    const scenesPlText = fmtKVPairs(scenesPl);
    const choicesPlText = fmtKVPairs(choicesPl);

    const noteMissing =
        !WeatherType || !LOCATION_TAGS
            ? "(Note: WeatherType / LOCATION_TAGS were not found on window; the helpers may be empty.)"
            : "";

    root.innerHTML = `
        <h2>Output</h2>
        <div class="meta">Copy/paste these into your scene + i18n files. ${noteMissing}</div>

        <label>Scene object literal</label>
        <div class="copyRow">
            <div class="hint">Paste into a <code>SCENES</code> array in a scene pack.</div>
            <button class="btn small" id="copyScene">Copy</button>
        </div>
        <div class="item"><pre id="sceneOut"></pre></div>

        <hr style="border:none; border-top:1px solid var(--line); margin:14px 0" />
        <h2>i18n entries</h2>

        <label>EN</label>
        <div class="copyRow">
            <div class="hint">Paste into the matching object in <code>src/data/i18n/en/*.js</code>.</div>
            <button class="btn small" id="copyEn">Copy</button>
        </div>
        <div class="item"><pre id="enOut"></pre></div>

        <label>PL (only filled lines)</label>
        <div class="copyRow">
            <div class="hint">Paste into the matching object in <code>src/data/i18n/pl/*.js</code>.</div>
            <button class="btn small" id="copyPl">Copy</button>
        </div>
        <div class="item"><pre id="plOut"></pre></div>

        <div style="margin-top:12px" class="meta">
            Tip: If you used <code>WeatherType.X</code> / <code>LOCATION_TAGS.Y</code> in conditions,
            make sure those symbols are imported/available in the scene file you're pasting into.
        </div>
    `;

    $("#sceneOut", root).textContent = scene;
    $("#enOut", root).textContent = `// SCENES\n${scenesEnText}\n\n// CHOICES\n${choicesEnText}`.trim();
    $("#plOut", root).textContent = `// SCENES\n${scenesPlText}\n\n// CHOICES\n${choicesPlText}`.trim();

    $("#copyScene", root).addEventListener("click", () => copyToClipboard(scene));
    $("#copyEn", root).addEventListener("click", () =>
        copyToClipboard(`// SCENES\n${scenesEnText}\n\n// CHOICES\n${choicesEnText}`.trim())
    );
    $("#copyPl", root).addEventListener("click", () =>
        copyToClipboard(`// SCENES\n${scenesPlText}\n\n// CHOICES\n${choicesPlText}`.trim())
    );
}

// Boot
renderEditor();
renderOutput();
