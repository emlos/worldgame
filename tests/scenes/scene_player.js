function init() {
    const byId = (id) => document.getElementById(id);
    const el = (tag, attrs = {}, ...kids) => {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (k === "class") n.className = v;
            else if (k === "text") n.textContent = v;
            else if (k === "html") n.innerHTML = v;
            else n.setAttribute(k, v);
        }
        for (const c of kids) n.append(c);
        return n;
    };

    const pad2 = (n) => String(n).padStart(2, "0");
    const fmtUtc = (d) =>
        `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(
            d.getUTCHours()
        )}:${pad2(d.getUTCMinutes())} UTC`;

    // Create a game seeded for stable refreshes.
    // NOTE: scenes do not resolve until Start Game is pressed.
    const game = new Game({ seed: 12345, strings: STRINGS_EN, autoStartScenes: false });
    let started = false;

    function setLanguage(lang) {
        const dict = lang === "pl" ? STRINGS_PL : STRINGS_EN;
        game.localizer = new Localizer(dict);
        game.sceneManager.setLocalizer(game.localizer);
    }

    function ensureStarted({ forceSceneId = null } = {}) {
        const id = forceSceneId ? String(forceSceneId).trim() : "";
        if (!started) {
            game.startGame({ forceSceneId: id || null });
            started = true;
        } else if (id) {
            // Allow testing fallback behavior by forcing a scene id.
            game.sceneManager.update({ forceSceneId: id });
        }

        const startedEl = byId("started");
        const startBtn = byId("start");
        if (startedEl) startedEl.textContent = started ? "(started)" : "(not started)";
        if (startBtn) startBtn.disabled = started;
    }

    function render() {
        const status = byId("status");
        const sceneBox = byId("scene");

        const loc = game.location;
        const scene = game.currentScene; // set by SceneManager.update()

        status.innerHTML = "";
        status.append(
            el(
                "div",
                { class: "meta" },
                el("div", {
                    html:
                        `<strong>Time</strong>: <code>${fmtUtc(game.now)}</code> &nbsp; ` +
                        `<strong>Location</strong>: <code>${loc?.name || "?"}</code> &nbsp; ` +
                        `<strong>Place</strong>: <code>${
                            game.currentPlaceKey || "(none)"
                        }</code> &nbsp; ` +
                        `<strong>Flags</strong>: <code>${
                            [...game.flags].join(", ") || "(none)"
                        }</code>`,
                })
            )
        );

        sceneBox.innerHTML = "";

        if (!started) {
            sceneBox.append(el("div", { class: "meta", text: "Click \"Start game\" to begin." }));
            return;
        }

        if (!scene) {
            sceneBox.append(el("div", { text: "No scene resolved." }));
            return;
        }

        sceneBox.append(el("div", { html: `<div class="meta"><code>${scene.id}</code></div>` }));
        sceneBox.append(el("p", { text: scene.text }));

        const choices = el("div", { class: "choices" });
        for (const c of scene.choices || []) {
            const btn = el("button", { type: "button" }, el("span", { text: c.text }));
            btn.addEventListener("click", () => {
                game.sceneManager.choose(c.id);
                render();
            });
            choices.append(btn);
        }

        sceneBox.append(choices);
    }

    byId("lang").addEventListener("change", (e) => {
        setLanguage(e.target.value);
        render();
    });

    byId("start").addEventListener("click", () => {
        ensureStarted();
        render();
    });

    byId("go").addEventListener("click", () => {
        const force = byId("forceScene")?.value?.trim() || "";
        ensureStarted({ forceSceneId: force || null });
        render();
    });

    setLanguage("en");
    // Keep the game idle until the user presses "Start game".
    const startedEl = byId("started");
    if (startedEl) startedEl.textContent = "(not started)";
    render();
}

// ---------- Boot ----------
window.addEventListener("DOMContentLoaded", () => {
    init();
});
