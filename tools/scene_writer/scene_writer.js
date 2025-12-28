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
    const el = byId(id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
};

function init() {
    renderJson();

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

    const sceneMinutes = byId("sceneMinutes");
    {
        sceneMinutes.value = 0;
        sceneMinutes.addEventListener("input", (e) => {
            const val = parseInt(e.target.value);
            if (val == 0 || isNaN(val) || val < 0) {
                delete copyScene.minutes;
            } else {
                copyScene.minutes = val;
            }
            renderJson(copyScene);
        });
    }

    const autoExit = byId("autoExit");
    const autoTraversal = byId("autoTraversal");
    {
        autoExit.checked = false;
        autoExit.addEventListener("change", (e) => {
            const auto = e.target.checked;
            if (!auto && !copyScene?.autoChoices?.traversal) {
                delete copyScene.autoChoices;
            } else if (!auto) {
                delete copyScene.autoChoices?.exit;
            } else {
                if (!copyScene.autoChoices) copyScene.autoChoices = {};
                copyScene.autoChoices.exit = auto;
            }
            renderJson(copyScene);
        });

        autoTraversal.checked = false;
        autoTraversal.addEventListener("change", (e) => {
            const travel = e.target.checked;
            if (!travel && !copyScene?.autoChoices?.exit) {
                delete copyScene.autoChoices;
            } else if (!travel) {
                delete copyScene.autoChoices.traversal;
            } else {
                if (!copyScene.autoChoices) copyScene.autoChoices = {};
                copyScene.autoChoices.traversal = travel;
            }
            renderJson(copyScene);
        });
    }

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

                i18n.SCENES["extraTextKey" + nr].key = copyScene.text[currentNr];
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

                // Remove from scene text (keep indexes stable for the editor)
                copyScene.text[currentNr] = null;
                renderJson(copyScene);

                // Remove all i18n variants belonging to this randomized line
                for (const k of Object.keys(i18n.SCENES)) {
                    if (k.startsWith(`extraTextLine${currentNr}-variant`)) {
                        delete i18n.SCENES[k];
                    }
                }
                renderI18n(i18n);

                byId("extraLine-" + currentNr).remove();
            });

            linesCount++;
        });

        //todo: conditions button + editor

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
                //delete content from scene text
                //delete element

                const currentNr = deleteBtn.dataset.nr;
                copyScene.text[currentNr] = null; //keep indexes stable
                renderJson(copyScene);

                byId("extraLine-" + currentNr).remove();
            });

            linesCount++;
        });
    }

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
                    placeholder: "scene.home.default.random." + variantNr,
                });
                vKeyInput.dataset.nr = variantNr;
                const vKeyRow = el("div", { class: "row" }, vKeyLabel, vKeyInput);

                const vTextLabel = el("label", { text: "Extra text content" + variantNr });
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
                    const currentNr = e.target.dataset.nr;
                    const val = e.target.value;

                    if (!i18n.SCENES[`extraTextLine${nr}-variant${currentNr}`]) {
                        i18n.SCENES[`extraTextLine${nr}-variant${currentNr}`] = {
                            key: "",
                            text: "",
                        };
                    }

                    i18n.SCENES[`extraTextLine${nr}-variant${currentNr}`].text = val;
                    renderI18n(i18n);
                });

                vKeyInput.addEventListener("input", (e) => {
                    const currentNr = e.target.dataset.nr;
                    copyScene.text[nr].keys[currentNr] = e.target.value.trim();
                    renderJson(copyScene);

                    if (!i18n.SCENES[`extraTextLine${nr}-variant${currentNr}`]) {
                        i18n.SCENES[`extraTextLine${nr}-variant${currentNr}`] = {
                            key: "",
                            text: "",
                        };
                    }

                    i18n.SCENES[`extraTextLine${nr}-variant${currentNr}`].key =
                        copyScene.text[nr].keys[currentNr];
                    renderI18n(i18n);
                });

                vDeleteBtn.addEventListener("click", () => {
                    const currentVNr = vDeleteBtn.dataset.nr;
                    copyScene.text[nr].keys[currentVNr] = null; //keep indexes stable
                    renderJson(copyScene);

                    delete i18n.SCENES[`extraTextLine${nr}-variant${currentVNr}`];
                    renderI18n(i18n);

                    byId(`extraTextLine${nr}-variant${currentVNr}`).remove();
                });

                variantsCount++;
            });

            // textInput.addEventListener("input", (e) => {
            //     const currentNr = e.target.dataset.nr;
            //     const val = e.target.value;

            //     if (!i18n.SCENES["extraTextKey" + currentNr]) {
            //         i18n.SCENES["extraTextKey" + currentNr] = { key: "", text: "" };
            //     }

            //     i18n.SCENES["extraTextKey" + currentNr].text = val;
            //     renderI18n(i18n);
            // });

            deleteBtn.addEventListener("click", () => {
                // //delete content from scene text
                // //delete content from i18n
                // //delete element

                const currentNr = deleteBtn.dataset.nr;
                // copyScene.text[currentNr] = null; //keep indexes stable
                // renderJson(copyScene);

                // delete i18n.SCENES["extraTextKey" + currentNr];
                // renderI18n(i18n);

                // if (byId("extraTextKeyConflictWarning" + currentNr)) {
                //     delEl("extraTextKeyConflictWarning" + currentNr);
                // }

                byId("extraLine-" + currentNr).remove();
            });

            linesCount++;
        });
    }
}

function renderJson(scene = baseScene) {
    const pre = el("pre");

    const realText = scene.text;
    scene.text = scene.text
        .filter((t) => {
            if (!t) return false;

            if (typeof t === "object" && t?.keys?.filter((k) => k)?.length === 0) {
                return false;
            }

            return true;
        })
        .map((t) => {
            // Keep editor indexes stable, but strip empty/null keys in the OUTPUT.
            if (typeof t === "object" && t && Array.isArray(t.keys)) {
                return { ...t, keys: t.keys.filter((k) => k) };
            }
            return t;
        });

    const rawJSON = cleanIdentifiers(JSON.stringify(scene, null, 4));

    pre.textContent = rawJSON;
    byId("jsonOutput").textContent = "";
    byId("jsonOutput").appendChild(pre);

    scene.text = realText; //genuinely fuck this

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
        text.push(`"${v.key}": "${v.text.replace(/"/g, '\\"')}",`);
    }
    text.push("\n// CHOICES");
    for (const [k, v] of Object.entries(strings.CHOICES)) {
        if (!v?.key) continue;
        text.push(`"${v.key}": "${v.text.replace(/"/g, '\\"')}",`);
    }
    pre.textContent = text.join("\n");
    outputDiv.appendChild(pre);
}

// ---------- Boot ----------
window.addEventListener("DOMContentLoaded", () => {
    init();
});
