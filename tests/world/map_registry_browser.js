function init() {
    if (!LOCATION_REGISTRY || !PLACE_REGISTRY || !STREET_REGISTRY) {
        console.error(
            "Missing registries on window. Did you set debug=true and import src/data/data.js?"
        );
        return;
    }

    // ---------------- DOM helpers ----------------
    const byId = (id) => document.getElementById(id);
    const el = (tag, attrs = {}, ...kids) => {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (k === "class") n.className = v;
            else if (k === "html") n.innerHTML = v;
            else if (k === "text") n.textContent = v;
            else if (k.startsWith("on") && typeof v === "function")
                n.addEventListener(k.slice(2), v);
            else n.setAttribute(k, v);
        }
        for (const c of kids) n.append(c);
        return n;
    };

    const escapeHtml = (s) =>
        String(s)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    const badges = (tags = []) => {
        const wrap = el("div", { class: "badges" });
        for (const t of tags) wrap.append(el("span", { class: "badge", text: String(t) }));
        return wrap;
    };

    // -------- recursive expand pretty renderer (details trees) --------
    function prettyNode(v, depth = 0, keyName = "") {
        if (v == null) return el("span", { class: "small", text: "—" });

        if (typeof v === "string") return el("span", { text: v });
        if (typeof v === "number" || typeof v === "boolean") return el("code", { text: String(v) });

        if (typeof v === "function") {
            return el("pre", { html: escapeHtml(v.toString()) });
        }

        if (Array.isArray(v)) {
            if (v.length === 0) return el("span", { class: "small", text: "[]" });
            // tags-like arrays
            if (v.every((x) => typeof x === "string")) return badges(v);

            const d = el("details", depth < 1 ? { open: "open" } : {});
            const summary = el("summary", {
                text: `${keyName ? keyName + ": " : ""}[${v.length}]`,
            });
            d.append(summary);
            const inner = el("div", { class: "small" });
            for (let i = 0; i < v.length; i++) {
                inner.append(el("div", {}, prettyNode(v[i], depth + 1, `[${i}]`)));
            }
            d.append(inner);
            return d;
        }

        if (typeof v === "object") {
            const keys = Object.keys(v);
            if (keys.length === 0) return el("span", { class: "small", text: "{}" });

            const d = el("details", depth < 1 ? { open: "open" } : {});
            const label = keyName ? `${keyName}: ` : "";
            d.append(el("summary", { text: `${label}{${keys.length} keys}` }));
            const inner = el("div");
            for (const k of keys) {
                inner.append(
                    el(
                        "div",
                        { style: "margin:6px 0;" },
                        el("div", { class: "small", text: k }),
                        prettyNode(v[k], depth + 1, "")
                    )
                );
            }
            d.append(inner);
            return d;
        }

        return el("span", { text: String(v) });
    }

    // table helper with recursive cells
    function kvTable(obj, { order } = {}) {
        const rows = [];
        const keys = order?.length ? order : Object.keys(obj);
        for (const k of keys) {
            if (!(k in obj)) continue;
            rows.push([k, obj[k]]);
        }
        if (order?.length) {
            for (const k of Object.keys(obj)) {
                if (order.includes(k)) continue;
                rows.push([k, obj[k]]);
            }
        }

        const t = el("table");
        const tbody = el("tbody");
        for (const [k, v] of rows) {
            tbody.append(
                el(
                    "tr",
                    {},
                    el("th", { text: String(k) }),
                    el("td", {}, prettyNode(v, 0, String(k)))
                )
            );
        }
        t.append(tbody);
        return t;
    }

    // --------------- Tabs ---------------
    const tabBtns = Array.from(document.querySelectorAll(".tabbtn"));
    function setTab(name) {
        tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
        ["locations", "places", "streets"].forEach((t) => {
            byId(`tab-${t}`).classList.toggle("active", t === name);
        });
    }
    tabBtns.forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

    // --------------- Opening hours helpers ---------------
    function inferOpeningHoursForRegistryPlace(placeDef) {
        const key = placeDef.key || placeDef.id;
        if (key && DEFAULT_OPENING_HOURS_BY_KEY && DEFAULT_OPENING_HOURS_BY_KEY[key]) {
            return DEFAULT_OPENING_HOURS_BY_KEY[key];
        }

        const cats = placeDef?.props?.category || [];
        const primary = Array.isArray(cats) ? cats[0] : cats;
        if (
            primary &&
            DEFAULT_OPENING_HOURS_BY_CATEGORY &&
            DEFAULT_OPENING_HOURS_BY_CATEGORY[primary]
        ) {
            return DEFAULT_OPENING_HOURS_BY_CATEGORY[primary];
        }
        return DEFAULT_OPENING_HOURS;
    }

    function formatHours(schedule) {
        const lines = [];
        lines.push("Hours:");
        for (const dayKey of DAY_KEYS) {
            const slots = (schedule && schedule[dayKey]) || [];
            if (!slots.length) {
                lines.push(`${dayKey}: closed`);
            } else {
                // show first slot if multiple? show all, space-separated:
                const slotText = slots.map((s) => `${s.from}–${s.to}`).join(" ");
                lines.push(`${dayKey}: ${slotText}`);
            }
        }
        return lines.join("\n");
    }

    // Modal (kept)
    const modal = byId("hours-modal");
    const modalTitle = byId("hours-title");
    const modalBody = byId("hours-body");
    const closeBtn = byId("hours-close");

    function renderScheduleTable(schedule) {
        const t = el("table");
        const tbody = el("tbody");
        for (const dayKey of DAY_KEYS) {
            const slots = (schedule && schedule[dayKey]) || [];
            const slotText = slots.length
                ? slots
                      .map((s) => `<code>${escapeHtml(s.from)}–${escapeHtml(s.to)}</code>`)
                      .join(" ")
                : "<span class='small'>closed</span>";
            tbody.append(el("tr", {}, el("th", { text: dayKey }), el("td", { html: slotText })));
        }
        t.append(tbody);
        return t;
    }

    function openHoursModal(placeDef) {
        const schedule = inferOpeningHoursForRegistryPlace(placeDef);
        const title = placeDef.label || placeDef.key || placeDef.id || "Opening hours";
        modalTitle.textContent = `Opening hours – ${title}`;
        modalBody.innerHTML = "";
        modalBody.append(
            el("div", {
                class: "small",
                html: "Inferred from <code>DEFAULT_OPENING_HOURS_BY_KEY</code> / <code>...BY_CATEGORY</code> / <code>DEFAULT_OPENING_HOURS</code>.",
            })
        );
        modalBody.append(renderScheduleTable(schedule));
        modal.classList.add("open");
    }

    function closeModal() {
        modal.classList.remove("open");
    }
    closeBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
    });
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeModal();
    });

    // --------------- Generic tag UI (hover highlight + checkbox selection + sort) ---------------
    function buildTagModel(tagsUniverse, items, itemTagsFn) {
        const universeSet = new Set(tagsUniverse || []);
        const counts = new Map();
        const unknown = new Set();

        for (const tag of tagsUniverse || []) counts.set(tag, 0);

        for (const it of items) {
            const tgs = (itemTagsFn(it) || []).filter(Boolean);
            for (const t of tgs) {
                if (!counts.has(t)) counts.set(t, 0);
                counts.set(t, (counts.get(t) || 0) + 1);
                if (!universeSet.has(t)) unknown.add(t);
            }
        }

        const allTags = Array.from(counts.keys());
        allTags.sort((a, b) => {
            const da = (counts.get(a) || 0) - (counts.get(b) || 0);
            if (da !== 0) return da > 0 ? -1 : 1;
            return String(a).localeCompare(String(b));
        });

        return { counts, allTags, unknown };
    }

    function renderTagFilter({
        hostEl,
        itemsContainer,
        statusEl,
        items,
        itemToNode,
        itemTagsFn,
        tagsUniverse,
        unknownTooltip,
    }) {
        const { counts, allTags, unknown } = buildTagModel(tagsUniverse, items, itemTagsFn);
        const checked = new Set(allTags); // all checked by default

        // hostEl will contain controls + taglist
        hostEl.innerHTML = "";
        const controls = el("div", { class: "tagControls" });
        const btnAll = el("button", {
            text: "Select all",
            onclick: () => {
                checked.clear();
                for (const t of allTags) checked.add(t);
                for (const cb of hostEl.querySelectorAll("input[type=checkbox]")) cb.checked = true;
                applySelection();
            },
        });
        const btnNone = el("button", {
            text: "Deselect all",
            onclick: () => {
                checked.clear();
                for (const cb of hostEl.querySelectorAll("input[type=checkbox]"))
                    cb.checked = false;
                applySelection();
            },
        });
        controls.append(btnAll, btnNone);

        const tagList = el("div", { class: "taglist" });
        hostEl.append(controls, tagList);

        // render items
        itemsContainer.innerHTML = "";
        const nodes = items.map((it) => {
            const n = itemToNode(it);
            const tgs = (itemTagsFn(it) || []).filter(Boolean);
            n.dataset.tags = tgs.join("|");
            itemsContainer.append(n);
            return n;
        });

        const hasAnyCheckedTag = (tagStr) => {
            if (!tagStr) return false;
            const parts = tagStr.split("|").filter(Boolean);
            for (const p of parts) if (checked.has(p)) return true;
            return false;
        };

        // sort selected to top (stable)
        const sortBySelection = () => {
            const selected = [];
            const dimmed = [];
            for (const n of nodes) {
                if (n.classList.contains("dim")) dimmed.push(n);
                else selected.push(n);
            }
            const frag = document.createDocumentFragment();
            for (const n of selected) frag.append(n);
            for (const n of dimmed) frag.append(n);
            itemsContainer.append(frag);
        };

        const applySelection = () => {
            let selectedCount = 0;
            for (const n of nodes) {
                const isSel = hasAnyCheckedTag(n.dataset.tags);
                n.classList.toggle("dim", !isSel);
                if (isSel) selectedCount++;
            }
            sortBySelection();
            statusEl.textContent = `selected ${selectedCount}/${nodes.length}`;
        };

        const clearHover = () => {
            for (const n of nodes) n.classList.remove("hover-match");
        };

        const applyHover = (tag) => {
            clearHover();
            for (const n of nodes) {
                const parts = (n.dataset.tags || "").split("|");
                if (parts.includes(tag)) n.classList.add("hover-match");
            }
        };

        // render tag list
        for (const tag of allTags) {
            const id = `tag_${Math.random().toString(16).slice(2)}_${String(tag)}`;
            const input = el("input", {
                type: "checkbox",
                id,
                checked: true,
                onchange: () => {
                    if (input.checked) checked.add(tag);
                    else checked.delete(tag);
                    applySelection();
                },
            });

            const labelBits = [el("span", { text: String(tag) })];

            if (unknown.has(tag)) {
                labelBits.push(
                    el("span", {
                        class: "warn",
                        text: "⚠",
                        title:
                            unknownTooltip ||
                            "Discovered in registry data but not present in the TAGS enum. Consider adding it to PLACE_TAGS / LOCATION_TAGS.",
                    })
                );
            }

            const row = el(
                "label",
                {
                    class: "tagitem",
                    for: id,
                    onmouseenter: () => applyHover(tag),
                    onmouseleave: () => clearHover(),
                },
                input,
                ...labelBits,
                el("span", { class: "count", text: String(counts.get(tag) || 0) })
            );

            tagList.append(row);
        }

        applySelection();
    }

    // --------------- LOCATIONS TAB ---------------
    const locTagsUniverse = Object.values(LOCATION_TAGS || {});
    renderTagFilter({
        hostEl: byId("loc-taglist"),
        itemsContainer: byId("loc-items"),
        statusEl: byId("loc-status"),
        items: LOCATION_REGISTRY,
        itemTagsFn: (loc) => loc.tags || [],
        tagsUniverse: locTagsUniverse,
        unknownTooltip:
            "Tag exists on a Location in LOCATION_REGISTRY but is missing from LOCATION_TAGS.",
        itemToNode: (loc) => {
            const title = loc.label || loc.key;
            const header = el(
                "div",
                { class: "title" },
                el("b", { text: title }),
                el("span", { class: "key", text: loc.key })
            );

            const body = kvTable(loc, { order: ["key", "label", "tags", "weight", "min", "max"] });
            return el("div", { class: "item" }, header, body);
        },
    });

    // --------------- PLACES TAB ---------------
    const placeTagsUniverse = Object.values(PLACE_TAGS || {});
    renderTagFilter({
        hostEl: byId("place-taglist"),
        itemsContainer: byId("place-items"),
        statusEl: byId("place-status"),
        items: PLACE_REGISTRY,
        itemTagsFn: (p) =>
            p.props && Array.isArray(p.props.category) ? p.props.category.filter(Boolean) : [],
        tagsUniverse: placeTagsUniverse,
        unknownTooltip:
            "Category exists on a Place in PLACE_REGISTRY but is missing from PLACE_TAGS.",
        itemToNode: (p) => {
            const title = p.label || p.key || p.id;
            const keyText = p.key || p.id || "(no-key)";

            const headerLeft = el(
                "div",
                {},
                el("b", { text: title }),
                el("div", { class: "small", text: keyText })
            );
            const hoursBtn = el("button", {
                text: "Opening hours",
                onclick: () => openHoursModal(p),
            });
            const header = el("div", { class: "title" }, headerLeft, hoursBtn);

            const body = kvTable(
                {
                    ...p,
                    nameFn: p.nameFn,
                    props: p.props,
                },
                {
                    order: [
                        "id",
                        "key",
                        "label",
                        "props",
                        "allowedTags",
                        "weight",
                        "minCount",
                        "maxCount",
                        "minDistance",
                        "nameFn",
                    ],
                }
            );

            const schedule = inferOpeningHoursForRegistryPlace(p);
            const hoursBlock = el(
                "div",
                { class: "hoursBlock" },
                el("div", { class: "hoursLabel", text: "Hours:" }),
                el("div", {
                    class: "hoursLines",
                    text: formatHours(schedule).replace(/^Hours:\n/, ""),
                })
            );

            return el("div", { class: "item" }, header, body, hoursBlock);
        },
    });

    // --------------- STREETS TAB ---------------
    // streets use LOCATION_TAGS (your registry does)
    renderTagFilter({
        hostEl: byId("street-taglist"),
        itemsContainer: byId("street-items"),
        statusEl: byId("street-status"),
        items: STREET_REGISTRY,
        itemTagsFn: (s) => s.tags || [],
        tagsUniverse: locTagsUniverse,
        unknownTooltip:
            "Tag exists on a Street in STREET_REGISTRY but is missing from LOCATION_TAGS.",
        itemToNode: (s) => {
            const header = el(
                "div",
                { class: "title" },
                el("b", { text: s.name || s.key }),
                el("span", { class: "key", text: s.key })
            );
            const body = kvTable(s, { order: ["key", "name", "tags"] });
            return el("div", { class: "item" }, header, body);
        },
    });
}

document.addEventListener("DOMContentLoaded", init);
