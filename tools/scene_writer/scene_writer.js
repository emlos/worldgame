const props = [{}, {}];

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

function init() {
    renderJson(copyScene);
    renderI18n(i18n);

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

            const deleteBtn = el("button", { class: "btn small warn", text: "X" });
            deleteBtn.style.float = "right";
            deleteBtn.title = "Delete this extra line";
            deleteBtn.dataset.nr = nr;

            const summary = el("summary", { text: "Extra line" + nr }, deleteBtn);
            const col = el(
                "details",
                { class: "col box", id: "extraLine-" + nr },
                summary,
                rowsCol
            );

            byId("extraTextKeys").appendChild(col);

            copyScene.text.push("");

            keyInput.addEventListener("input", (e) => {
                const currentNr = e.target.dataset.nr;
                copyScene.text[currentNr] = e.target.value.trim();
                renderJson(copyScene);

                if (!i18n.SCENES["extraTextKey" + currentNr]) {
                    i18n.SCENES["extraTextKey" + currentNr] = { key: "", text: "" };
                }

                i18n.SCENES["extraTextKey" + currentNr].key = copyScene.text[currentNr];
                renderI18n(i18n);

                if (checkIdConflict(copyScene.text[currentNr])) {
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

            deleteBtn.addEventListener("click", () => {
                const currentNr = deleteBtn.dataset.nr;

                // keep indexes stable for the editor, but null them
                copyScene.text[currentNr] = null;
                renderJson(copyScene);

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

            const deleteBtn = el("button", { class: "btn small warn", text: "X" });
            deleteBtn.style.float = "right";
            deleteBtn.title = "Delete this variant line";
            deleteBtn.dataset.nr = nr;

            const summary = el("summary", { text: "Variant line" + nr }, deleteBtn);
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

            deleteBtn.addEventListener("click", () => {
                const currentNr = deleteBtn.dataset.nr;

                // remove from scene text (keep indexes stable)
                copyScene.text[currentNr] = null;
                renderJson(copyScene);

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

                if (typeof t === "object" && t?.keys) {
                    const realKeys = t.keys.filter((k) => k);
                    return realKeys.length > 0;
                }
                return true;
            })
            .map((t) => {
                if (typeof t === "object" && t?.keys) {
                    return { ...t, keys: t.keys.filter((k) => k) };
                }
                return t;
            });

        if (outputScene.text.length === 0) delete outputScene.text;
    }

    const rawJSON = cleanIdentifiers(JSON.stringify(outputScene, null, 4));

    pre.textContent = rawJSON;
    byId("jsonOutput").textContent = "";
    byId("jsonOutput").appendChild(pre);

    //"__...__" -> ..., for identifiers
    function cleanIdentifiers(value) {
        return value.replace(/"__([^"]*?)__"/g, (_, inner) => inner);
    }
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
