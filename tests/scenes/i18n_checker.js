// tests/i18n/i18n_audit.js
// I18N Coverage / Diff tool
// ------------------------------------------------------------
// Open: tests/i18n/i18n_audit.html

import { SCENE_DEFS } from "../../src/data/scenes/index.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(s) {
    return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function uniq(arr) {
    return Array.from(new Set(arr));
}

function isPlainObject(v) {
    return v && typeof v === "object" && !Array.isArray(v);
}

function getPlaceholders(str) {
    const set = new Set();
    String(str).replace(/\{([a-zA-Z0-9_.-]+)\}/g, (_, p) => (set.add(p), ""));
    return set;
}

function setEq(a, b) {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
}

function setDiff(a, b) {
    const out = [];
    for (const x of a) if (!b.has(x)) out.push(x);
    return out;
}

function sortKeys(keys) {
    return keys.slice().sort((a, b) => a.localeCompare(b));
}

function collectSceneI18nKeys(sceneDefs) {
    const used = new Set();
    const rawLiterals = [];

    const isKeyCandidate = (s) => {
        if (typeof s !== "string") return false;
        const t = s.trim();
        if (!t) return false;
        if (t === "\n") return false;
        if (!t.includes(".")) return false;
        // Keep this intentionally strict to avoid pulling in scene ids, etc.
        return /^[a-zA-Z0-9_.-]+$/.test(t);
    };

    for (const def of sceneDefs || []) {
        if (!def || typeof def !== "object") continue;

        if (typeof def.textKey === "string" && isKeyCandidate(def.textKey)) used.add(def.textKey);

        if (Array.isArray(def.textKeys)) {
            for (const k of def.textKeys)
                if (typeof k === "string" && isKeyCandidate(k)) used.add(k);
        }

        if (Array.isArray(def.text)) {
            for (const part of def.text) {
                if (typeof part === "string") {
                    if (isKeyCandidate(part)) used.add(part);
                    else {
                        const lit = part.trim();
                        if (lit && lit !== "\n") {
                            rawLiterals.push({ sceneId: def.id, text: lit });
                        }
                    }
                } else if (
                    isPlainObject(part) &&
                    typeof part.key === "string" &&
                    isKeyCandidate(part.key)
                ) {
                    used.add(part.key);
                }
            }
        }

        if (Array.isArray(def.choices)) {
            for (const ch of def.choices) {
                if (ch && typeof ch.textKey === "string" && isKeyCandidate(ch.textKey))
                    used.add(ch.textKey);
            }
        }
    }

    return { usedKeys: used, rawLiterals };
}

async function loadLanguageModules(langCode) {
    // Optional: load source modules to detect collisions and category breakdown.
    const base = `../../src/data/i18n/${langCode}`;

    const out = {
        common: null,
        testScenes: null,
        testChoices: null,
        sampleScenes: null,
        sampleChoices: null,
        errors: [],
    };

    const safeImport = async (path) => {
        try {
            return await import(path);
        } catch (e) {
            out.errors.push({ path, error: e });
            return null;
        }
    };

    const common = await safeImport(`${base}/common.js`);
    const test = await safeImport(`${base}/test.js`);
    const sample = await safeImport(`${base}/sample.js`);

    if (common?.COMMON) out.common = common.COMMON;

    if (test?.SCENES) out.testScenes = test.SCENES;
    if (test?.CHOICES) out.testChoices = test.CHOICES;

    if (sample?.SCENES) out.sampleScenes = sample.SCENES;
    if (sample?.CHOICES) out.sampleChoices = sample.CHOICES;

    return out;
}

function buildCollisionReport(mods) {
    // Mirror the merge order in src/data/i18n/<lang>.js
    const layers = [
        { name: "common", dict: mods.common || {} },
        { name: "test.SCENES", dict: mods.testScenes || {} },
        { name: "test.CHOICES", dict: mods.testChoices || {} },
        { name: "sample.SCENES", dict: mods.sampleScenes || {} },
        { name: "sample.CHOICES", dict: mods.sampleChoices || {} },
    ];

    const perKey = new Map(); // key -> [{layer, value}]
    for (const layer of layers) {
        for (const [k, v] of Object.entries(layer.dict || {})) {
            if (!perKey.has(k)) perKey.set(k, []);
            perKey.get(k).push({ layer: layer.name, value: v });
        }
    }

    const collisions = [];
    for (const [key, defs] of perKey.entries()) {
        if (defs.length <= 1) continue;
        const vals = uniq(defs.map((d) => String(d.value)));
        if (vals.length <= 1) continue;

        // Winner is the last layer that defines it.
        const winner = defs[defs.length - 1];
        collisions.push({ key, defs, winner });
    }

    collisions.sort((a, b) => a.key.localeCompare(b.key));
    return collisions;
}

function detectLanguagesFromGlobals() {
    // data.js exports STRINGS_* onto window when debug=true.
    const candidates = [];
    for (const [k, v] of Object.entries(window)) {
        if (!k.startsWith("STRINGS_")) continue;
        if (!isPlainObject(v)) continue;
        candidates.push({ exportName: k, dict: v });
    }

    // Prefer stable order: EN first if present, then alphabetic.
    candidates.sort((a, b) => {
        const aCode = a.exportName.replace("STRINGS_", "");
        const bCode = b.exportName.replace("STRINGS_", "");
        if (aCode === "EN") return -1;
        if (bCode === "EN") return 1;
        return aCode.localeCompare(bCode);
    });

    return candidates.map((c) => {
        const code = c.exportName.replace("STRINGS_", "").toLowerCase();
        return {
            code,
            exportName: c.exportName,
            dict: c.dict,
        };
    });
}

function renderTabs() {
    const tabs = [
        { id: "overview", label: "Overview" },
        { id: "missing", label: "Missing keys" },
        { id: "placeholders", label: "Placeholders" },
        { id: "conflicts", label: "Key conflicts" },
        { id: "scenes", label: "Scene coverage" },
        { id: "explorer", label: "Explorer" },
    ];

    const tabsEl = $("#tabs");
    tabsEl.innerHTML = tabs
        .map(
            (t, i) =>
                `<button class="tabbtn ${i === 0 ? "active" : ""}" data-tab="${t.id}">${esc(
                    t.label
                )}</button>`
        )
        .join("");

    tabsEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".tabbtn");
        if (!btn) return;
        const id = btn.dataset.tab;

        $$(".tabbtn", tabsEl).forEach((b) => b.classList.toggle("active", b === btn));
        $$(".panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${id}`));

        // When entering Explorer, ensure table is rendered.
        if (id === "explorer") {
            state.renderExplorer();
        }
    });
}

function makePill(text, cls = "") {
    return `<span class="pill ${cls}">${esc(text)}</span>`;
}

function buildOverviewHTML() {
    const unionCount = state.unionKeys.length;

    const rows = state.languages
        .map((L) => {
            const keys = Object.keys(L.dict);
            const missVsUnion = state.unionKeys.filter((k) => L.dict[k] == null).length;

            const missVsBaseline =
                state.baselineCode && state.baselineCode !== L.code
                    ? state.baselineKeys.filter((k) => L.dict[k] == null).length
                    : 0;

            const pills = [
                makePill(`${keys.length} keys`, "ok"),
                makePill(`${missVsUnion} missing (union)`, missVsUnion ? "bad" : "ok"),
            ];
            if (state.baselineCode && state.baselineCode !== L.code) {
                pills.push(
                    makePill(
                        `${missVsBaseline} missing (vs ${state.baselineCode})`,
                        missVsBaseline ? "bad" : "ok"
                    )
                );
            }
            if (L.modules?.errors?.length)
                pills.push(makePill(`${L.modules.errors.length} load warnings`, "warn"));

            return `
                <div class="item">
                    <div>
                        <div><b>${esc(L.code)}</b> <span class="small muted">(${esc(
                L.exportName
            )})</span></div>
                        <div class="small muted">${pills.join(" ")}</div>
                    </div>
                    <div class="meta">union: ${unionCount}</div>
                </div>
            `;
        })
        .join("");

    const baselineNote = state.baselineCode
        ? `<div class="small muted">Baseline: <code>${esc(
              state.baselineCode
          )}</code> (used for placeholder checks and “missing vs baseline”).</div>`
        : `<div class="small muted">No baseline selected.</div>`;

    return `
        <div class="card">
            <h2>Languages</h2>
            ${baselineNote}
            <div class="list" style="margin-top:10px">${rows}</div>
        </div>

        <div class="grid2">
            <div class="card">
                <h2>Quick stats</h2>
                <table>
                    <tr><th>Union keys</th><td><code>${unionCount}</code></td></tr>
                    <tr><th>Scene i18n keys</th><td><code>${state.sceneKeys.usedKeys.size}</code></td></tr>
                    <tr><th>Raw literals in scenes</th><td><code>${state.sceneKeys.rawLiterals.length}</code></td></tr>
                    <tr><th>Placeholder mismatches</th><td><code>${state.placeholderIssues.length}</code></td></tr>
                    <tr><th>Key conflicts (all langs)</th><td><code>${state.totalConflicts}</code></td></tr>
                </table>
            </div>
            <div class="card">
                <h2>What this is checking</h2>
                <div class="small muted">
                    <div>• Missing keys: per language vs the union of keys across all loaded languages.</div>
                    <div>• Placeholder mismatches: compares <code>{placeholders}</code> vs the baseline language.</div>
                    <div>• Key conflicts: same key defined in multiple source modules (common/test/sample) with different values.</div>
                    <div>• Scene coverage: keys referenced by <code>src/data/scenes/**</code> vs translations.</div>
                </div>
            </div>
        </div>
    `;
}

function buildMissingHTML() {
    const lang = state.missingLang || state.languages[0]?.code;
    const L = state.languages.find((x) => x.code === lang);
    if (!L)
        return `<div class="card">No languages detected. Ensure <code>debug=true</code> and that data.js exports STRINGS_*.</div>`;

    const missing = state.unionKeys.filter((k) => L.dict[k] == null);
    const missingVsBaseline =
        state.baselineCode && state.baselineCode !== lang
            ? state.baselineKeys.filter((k) => L.dict[k] == null)
            : [];

    const list = missing
        .slice(0, 5000)
        .map(
            (k) =>
                `<div class="item"><span class="k">${esc(
                    k
                )}</span><span class="meta missing">missing</span></div>`
        )
        .join("");

    const list2 = missingVsBaseline
        .slice(0, 5000)
        .map(
            (k) =>
                `<div class="item"><span class="k">${esc(
                    k
                )}</span><span class="meta missing">missing</span></div>`
        )
        .join("");

    return `
        <div class="card">
            <h2>Missing keys</h2>
            <div class="small muted">Showing missing keys for <code>${esc(lang)}</code>.</div>
            <div class="row" style="margin-top:10px">
                ${makePill(`${missing.length} missing vs union`, missing.length ? "bad" : "ok")}
                ${
                    state.baselineCode && state.baselineCode !== lang
                        ? makePill(
                              `${missingVsBaseline.length} missing vs baseline`,
                              missingVsBaseline.length ? "bad" : "ok"
                          )
                        : ""
                }
                <button id="copy-missing" class="btnlink">Copy list</button>
            </div>

            <div class="grid2">
                <div>
                    <div class="small muted" style="margin-bottom:6px">Missing vs union</div>
                    <div class="list" id="missing-list">${
                        list || `<div class="small muted">None 🎉</div>`
                    }</div>
                </div>
                <div>
                    <div class="small muted" style="margin-bottom:6px">Missing vs baseline</div>
                    <div class="list" id="missing-baseline-list">${
                        state.baselineCode && state.baselineCode !== lang
                            ? list2 || `<div class="small muted">None 🎉</div>`
                            : `<div class="small muted">(Pick a baseline to use this panel.)</div>`
                    }</div>
                </div>
            </div>
        </div>
    `;
}

function buildPlaceholdersHTML() {
    if (!state.baselineCode) {
        return `
            <div class="card">
                <h2>Placeholders</h2>
                <div class="small muted">Pick a baseline language to compare placeholders.</div>
            </div>
        `;
    }

    const issues = state.placeholderIssues;

    const rows = issues
        .slice(0, 2000)
        .map((row) => {
            const parts = row.mismatches
                .map((m) => {
                    const extra = m.extra.length
                        ? ` extra: <code>${esc(m.extra.join(", "))}</code>`
                        : "";
                    const missing = m.missing.length
                        ? ` missing: <code>${esc(m.missing.join(", "))}</code>`
                        : "";
                    return `<div class="small"><b>${esc(m.lang)}</b> ${missing}${extra}</div>`;
                })
                .join("");

            const baseVal = state.languages.find((l) => l.code === state.baselineCode)?.dict?.[
                row.key
            ];
            return `
                <tr>
                    <td class="mono">${esc(row.key)}</td>
                    <td>
                        <div class="small muted">baseline (${esc(state.baselineCode)}): <code>${esc(
                Array.from(row.base).join(", ")
            )}</code></div>
                        ${parts}
                        <div class="small muted" style="margin-top:6px">baseline text: <span class="mono">${esc(
                            baseVal ?? ""
                        )}</span></div>
                    </td>
                </tr>
            `;
        })
        .join("");

    return `
        <div class="card">
            <h2>Placeholder mismatches</h2>
            <div class="small muted">Compares <code>{placeholders}</code> vs baseline <code>${esc(
                state.baselineCode
            )}</code>. (This catches things like missing <code>{minutes}</code>.)</div>
            <div class="row" style="margin-top:10px">
                ${makePill(`${issues.length} keys with mismatches`, issues.length ? "warn" : "ok")}
            </div>
            <table>
                <tr><th style="width:340px">Key</th><th>Mismatch details</th></tr>
                ${rows || `<tr><td colspan="2" class="small muted">None 🎉</td></tr>`}
            </table>
        </div>
    `;
}

function buildConflictsHTML() {
    const sections = state.languages
        .map((L) => {
            const conflicts = L.conflicts || [];
            const rows = conflicts
                .slice(0, 2000)
                .map((c) => {
                    const defs = c.defs
                        .map(
                            (d) =>
                                `<div class="small"><code>${esc(
                                    d.layer
                                )}</code> → <span class="mono">${esc(d.value)}</span></div>`
                        )
                        .join("");

                    return `
                        <tr>
                            <td class="mono">${esc(c.key)}</td>
                            <td>
                                <div class="small muted">winner: <code>${esc(
                                    c.winner.layer
                                )}</code></div>
                                ${defs}
                            </td>
                        </tr>
                    `;
                })
                .join("");

            return `
                <div class="card">
                    <h2>Key conflicts – ${esc(L.code)}</h2>
                    <div class="small muted">Same key defined multiple times across i18n source modules with different values (merge order decides the winner).</div>
                    <div class="row" style="margin-top:10px">
                        ${makePill(
                            `${conflicts.length} conflicts`,
                            conflicts.length ? "warn" : "ok"
                        )}
                    </div>
                    <table>
                        <tr><th style="width:340px">Key</th><th>Definitions</th></tr>
                        ${rows || `<tr><td colspan="2" class="small muted">None 🎉</td></tr>`}
                    </table>
                </div>
            `;
        })
        .join("");

    return sections || `<div class="card">No languages detected.</div>`;
}

function buildScenesHTML() {
    const used = sortKeys(Array.from(state.sceneKeys.usedKeys));

    const perLang = state.languages
        .map((L) => {
            const missing = used.filter((k) => L.dict[k] == null);
            const pills = [
                makePill(`${used.length} referenced`, "ok"),
                makePill(`${missing.length} missing`, missing.length ? "bad" : "ok"),
            ];
            return `
                <div class="card">
                    <h2>Scene coverage – ${esc(L.code)}</h2>
                    <div class="row" style="margin-top:10px">${pills.join(" ")}
                        <button class="btnlink" data-copy-scenes-missing="${esc(
                            L.code
                        )}">Copy missing</button>
                    </div>
                    <div class="list" style="max-height:360px; overflow:auto">
                        ${
                            missing.length
                                ? missing
                                      .slice(0, 5000)
                                      .map(
                                          (k) =>
                                              `<div class="item"><span class="k">${esc(
                                                  k
                                              )}</span><span class="meta missing">missing</span></div>`
                                      )
                                      .join("")
                                : `<div class="small muted">None 🎉</div>`
                        }
                    </div>
                </div>
            `;
        })
        .join("");

    const rawLits = state.sceneKeys.rawLiterals
        .slice(0, 2000)
        .map(
            (r) =>
                `<div class="item"><span class="k">${esc(r.sceneId)}</span><span class="mono">${esc(
                    r.text
                )}</span></div>`
        )
        .join("");

    return `
        <div class="grid2">
            <div class="card">
                <h2>Keys referenced by scenes</h2>
                <div class="small muted">Collected from <code>textKey</code>, <code>textKeys</code>, and <code>text</code>/<code>choices[].textKey</code> inside <code>src/data/scenes/**</code>.</div>
                <div class="row" style="margin-top:10px">
                    ${makePill(`${used.length} total referenced`, "ok")}
                    <button id="copy-scenes-all" class="btnlink">Copy all referenced keys</button>
                </div>
                <div class="list" style="max-height:360px; overflow:auto">
                    ${used
                        .slice(0, 5000)
                        .map((k) => `<div class="item"><span class="k">${esc(k)}</span></div>`)
                        .join("")}
                </div>
            </div>
            <div class="card">
                <h2>Raw (non-key) literals found in scenes</h2>
                <div class="small muted">These are strings in scene definitions that don’t look like i18n keys (potentially non-localized text).</div>
                <div class="row" style="margin-top:10px">${makePill(
                    `${state.sceneKeys.rawLiterals.length} literals`,
                    state.sceneKeys.rawLiterals.length ? "warn" : "ok"
                )}</div>
                <div class="list" style="max-height:360px; overflow:auto">
                    ${rawLits || `<div class="small muted">None 🎉</div>`}
                </div>
            </div>
        </div>

        ${perLang}
    `;
}

function buildExplorerShellHTML() {
    // Render once; rows rendered by state.renderExplorer()
    return `
        <div class="card">
            <h2>Explorer</h2>
            <div class="small muted">Search keys and compare values across languages.</div>
            <div class="row" style="margin-top:10px">
                <label>Filter</label>
                <input id="ex-filter" type="text" placeholder="e.g. scene.home, choice., button." />

                <label>Missing in</label>
                <select id="ex-missing-lang">
                    <option value="">(any)</option>
                    ${state.languages
                        .map((l) => `<option value="${esc(l.code)}">${esc(l.code)}</option>`)
                        .join("")}
                </select>

                <button id="ex-refresh" class="btnlink">Apply</button>
                <span class="small muted" id="ex-count"></span>
            </div>

            <div style="overflow:auto; max-height:70vh; border:1px solid var(--line); border-radius:12px;">
                <table id="ex-table"></table>
            </div>
        </div>
    `;
}

function renderExplorerTable() {
    const filter = (state.exFilter || "").trim().toLowerCase();
    const missingLang = state.exMissingLang || "";

    let keys = state.unionKeys;

    if (filter) {
        keys = keys.filter((k) => k.toLowerCase().includes(filter));
    }

    if (missingLang) {
        const L = state.languages.find((l) => l.code === missingLang);
        if (L) keys = keys.filter((k) => L.dict[k] == null);
    }

    const header = `
        <tr>
            <th style="width:340px">Key</th>
            ${state.languages.map((l) => `<th>${esc(l.code)}</th>`).join("")}
        </tr>
    `;

    const rows = keys
        .slice(0, 4000)
        .map((k) => {
            const tds = state.languages
                .map((l) => {
                    const v = l.dict[k];
                    if (v == null) return `<td><span class="missing">missing</span></td>`;
                    return `<td><span class="mono">${esc(v)}</span></td>`;
                })
                .join("");

            return `<tr><td class="mono">${esc(k)}</td>${tds}</tr>`;
        })
        .join("");

    const table = $("#ex-table");
    if (table)
        table.innerHTML =
            header +
            (rows ||
                `<tr><td colspan="${
                    1 + state.languages.length
                }" class="small muted">No matches.</td></tr>`);

    const countEl = $("#ex-count");
    if (countEl) countEl.textContent = `showing ${Math.min(keys.length, 4000)} of ${keys.length}`;
}

function copyToClipboard(text) {
    navigator.clipboard?.writeText(text).catch(() => {
        // fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
    });
}

const state = {
    languages: [],
    unionKeys: [],
    baselineCode: "",
    baselineKeys: [],

    // derived reports
    placeholderIssues: [],
    totalConflicts: 0,

    // UI state
    missingLang: "",
    exFilter: "",
    exMissingLang: "",

    // scene coverage
    sceneKeys: { usedKeys: new Set(), rawLiterals: [] },

    renderAll() {
        $("#tab-overview").innerHTML = buildOverviewHTML();
        $("#tab-missing").innerHTML = buildMissingHTML();
        $("#tab-placeholders").innerHTML = buildPlaceholdersHTML();
        $("#tab-conflicts").innerHTML = buildConflictsHTML();
        $("#tab-scenes").innerHTML = buildScenesHTML();

        // Explorer is rendered lazily, but we still build the shell once.
        $("#tab-explorer").innerHTML = buildExplorerShellHTML();

        this.bindUI();
    },

    renderExplorer() {
        // If user comes here after changing state, ensure shell exists.
        if (!$("#ex-table")) {
            $("#tab-explorer").innerHTML = buildExplorerShellHTML();
        }
        renderExplorerTable();
        this.bindExplorerUI();
    },

    bindUI() {
        // Missing tab copy
        const copyBtn = $("#copy-missing");
        if (copyBtn) {
            copyBtn.onclick = () => {
                const lang = state.missingLang || state.languages[0]?.code;
                const L = state.languages.find((x) => x.code === lang);
                if (!L) return;
                const missing = state.unionKeys.filter((k) => L.dict[k] == null);
                copyToClipboard(missing.join("\n"));
            };
        }

        // Scenes copy
        const copyAllScenes = $("#copy-scenes-all");
        if (copyAllScenes) {
            copyAllScenes.onclick = () => {
                const used = sortKeys(Array.from(state.sceneKeys.usedKeys));
                copyToClipboard(used.join("\n"));
            };
        }

        $$("[data-copy-scenes-missing]").forEach((btn) => {
            btn.onclick = () => {
                const lang = btn.getAttribute("data-copy-scenes-missing");
                const L = state.languages.find((l) => l.code === lang);
                if (!L) return;
                const used = sortKeys(Array.from(state.sceneKeys.usedKeys));
                const missing = used.filter((k) => L.dict[k] == null);
                copyToClipboard(missing.join("\n"));
            };
        });

        this.bindExplorerUI();
    },

    bindExplorerUI() {
        const filter = $("#ex-filter");
        const missSel = $("#ex-missing-lang");
        const refresh = $("#ex-refresh");
        if (!filter || !missSel || !refresh) return;

        filter.value = state.exFilter || "";
        missSel.value = state.exMissingLang || "";

        const apply = () => {
            state.exFilter = filter.value;
            state.exMissingLang = missSel.value;
            renderExplorerTable();
        };

        refresh.onclick = apply;
        filter.onkeydown = (e) => {
            if (e.key === "Enter") apply();
        };
    },
};

function renderControls() {
    const controls = $("#controls");

    const langOptions = state.languages
        .map((l) => `<option value="${esc(l.code)}">${esc(l.code)}</option>`)
        .join("");

    controls.innerHTML = `
        <label>Baseline</label>
        <select id="baseline">${langOptions}</select>

        <label>Missing tab: language</label>
        <select id="missing-lang">${langOptions}</select>

        <button id="rerun" class="btnlink">Re-run analysis</button>

        <span class="small muted" id="status"></span>
    `;

    const baselineSel = $("#baseline");
    const missingSel = $("#missing-lang");

    baselineSel.value = state.baselineCode;
    missingSel.value = state.missingLang || state.baselineCode;

    baselineSel.onchange = () => {
        state.baselineCode = baselineSel.value;
        recomputeDerived();
        state.renderAll();
    };

    missingSel.onchange = () => {
        state.missingLang = missingSel.value;
        $("#tab-missing").innerHTML = buildMissingHTML();
        state.bindUI();
    };

    $("#rerun").onclick = async () => {
        await init(true);
    };
}

function recomputeDerived() {
    // union
    const union = new Set();
    for (const L of state.languages) {
        for (const k of Object.keys(L.dict)) union.add(k);
    }
    state.unionKeys = sortKeys(Array.from(union));

    // baseline
    state.baselineKeys = [];
    if (state.baselineCode) {
        const base = state.languages.find((l) => l.code === state.baselineCode);
        state.baselineKeys = sortKeys(Object.keys(base?.dict || {}));
    }

    // placeholder issues
    state.placeholderIssues = [];
    if (state.baselineCode) {
        const base = state.languages.find((l) => l.code === state.baselineCode);
        for (const key of state.unionKeys) {
            const baseVal = base?.dict?.[key];
            if (baseVal == null) continue;
            const basePH = getPlaceholders(baseVal);

            if (!basePH.size) continue;

            const mismatches = [];
            for (const L of state.languages) {
                if (L.code === state.baselineCode) continue;
                const v = L.dict[key];
                if (v == null) continue;
                const ph = getPlaceholders(v);
                if (!setEq(basePH, ph)) {
                    mismatches.push({
                        lang: L.code,
                        missing: sortKeys(setDiff(basePH, ph)),
                        extra: sortKeys(setDiff(ph, basePH)),
                    });
                }
            }

            if (mismatches.length) state.placeholderIssues.push({ key, base: basePH, mismatches });
        }
    }

    // scene keys
    state.sceneKeys = collectSceneI18nKeys(SCENE_DEFS);

    // conflicts
    state.totalConflicts = state.languages.reduce((sum, L) => sum + (L.conflicts?.length || 0), 0);
}

async function init(forceReload = false) {
    const status = $("#status");
    if (status) status.textContent = "Scanning languages…";

    const langs = detectLanguagesFromGlobals();
    if (!langs.length) {
        $("#tab-overview").innerHTML = `
            <div class="card">
                <h2>No STRINGS_* dictionaries found</h2>
                <div class="small muted">This tool expects <code>src/data/data.js</code> to export STRINGS_* onto <code>window</code> when <code>debug=true</code>.</div>
            </div>
        `;
        return;
    }

    // Load optional module breakdown for each language
    const enriched = [];
    for (const L of langs) {
        const modules = await loadLanguageModules(L.code);
        const conflicts = buildCollisionReport(modules);
        enriched.push({ ...L, modules, conflicts });
    }

    state.languages = enriched;

    // Baseline default: EN if present
    if (forceReload || !state.baselineCode) {
        state.baselineCode = state.languages.find((l) => l.code === "en")
            ? "en"
            : state.languages[0].code;
        state.missingLang = state.baselineCode;
    }

    recomputeDerived();

    renderControls();
    state.renderAll();

    if (status) status.textContent = "Ready.";
}

renderTabs();

init(false);
