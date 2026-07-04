import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Values some nodes append to model lists that aren't actual files.
const EXTRA_VALUES = new Set(["", "none", "None", "NONE", "Baked VAE", "taesd"]);

// Fallbacks for combos we can't identify by matching file lists
// (e.g. when the corresponding models folder is empty).
const NAME_HINTS = {
    ckpt_name: "checkpoints",
    lora_name: "loras",
    vae_name: "vae",
    clip_name: "text_encoders",
    clip_name1: "text_encoders",
    clip_name2: "text_encoders",
    clip_name3: "text_encoders",
    clip_name4: "text_encoders",
    unet_name: "diffusion_models",
    control_net_name: "controlnet",
    style_model_name: "style_models",
    gligen_name: "gligen",
    photomaker_model_name: "photomaker",
};

/* ------------------------------------------------------------------ */
/* Model folder index                                                  */
/* ------------------------------------------------------------------ */

let indexPromise = null;

function getModelIndex() {
    if (!indexPromise) {
        indexPromise = (async () => {
            const folders = {};
            const res = await api.fetchApi("/models");
            const names = await res.json();
            await Promise.all(
                names.map(async (name) => {
                    try {
                        const r = await api.fetchApi(`/models/${encodeURIComponent(name)}`);
                        folders[name] = new Set(await r.json());
                    } catch {
                        folders[name] = new Set();
                    }
                })
            );
            return folders;
        })().catch((e) => {
            indexPromise = null;
            throw e;
        });
    }
    return indexPromise;
}

/* ------------------------------------------------------------------ */
/* Combo widget -> model folder matching                               */
/* ------------------------------------------------------------------ */

function widgetValues(node, widget) {
    let v = widget.options?.values;
    if (typeof v === "function") {
        try {
            v = v(widget, node);
        } catch {
            return null;
        }
    }
    return Array.isArray(v) ? v : null;
}

function matchFolder(node, widget, folders) {
    const values = widgetValues(node, widget) || [];
    const meaningful = values.filter((x) => typeof x === "string" && !EXTRA_VALUES.has(x));

    if (meaningful.length) {
        let candidates = Object.entries(folders).filter(([, files]) =>
            meaningful.every((m) => files.has(m))
        );
        if (!candidates.length) return null;
        if (candidates.length > 1) {
            const hint = NAME_HINTS[widget.name];
            const hinted = candidates.find(([n]) => n === hint);
            if (hinted) return hinted[0];
            candidates.sort(
                (a, b) =>
                    Math.abs(a[1].size - meaningful.length) - Math.abs(b[1].size - meaningful.length)
            );
        }
        return candidates[0][0];
    }

    // Empty combo: fall back to well-known input names.
    const hint = NAME_HINTS[widget.name];
    return hint && folders[hint] ? hint : null;
}

/* ------------------------------------------------------------------ */
/* UI helpers                                                          */
/* ------------------------------------------------------------------ */

function toast(severity, summary, detail) {
    try {
        app.extensionManager.toast.add({ severity, summary, detail, life: 6000 });
    } catch {
        console[severity === "error" ? "error" : "log"](`[ModelBrowser] ${summary}: ${detail ?? ""}`);
    }
}

function formatSize(bytes) {
    if (!Number.isFinite(bytes)) return "";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
    }
    return `${bytes.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/* ------------------------------------------------------------------ */
/* File picker dialog                                                  */
/* ------------------------------------------------------------------ */

function openBrowserDialog(folderName, onPick) {
    const lastKey = `ModelBrowser.lastPath.${folderName}`;

    const overlay = document.createElement("div");
    overlay.style.cssText =
        "position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.5);" +
        "display:flex;align-items:center;justify-content:center;";

    const panel = document.createElement("div");
    panel.style.cssText =
        "width:min(640px,90vw);height:min(560px,85vh);display:flex;flex-direction:column;" +
        "background:var(--comfy-menu-bg,#202020);color:var(--fg-color,#ddd);" +
        "border:1px solid var(--border-color,#4e4e4e);border-radius:8px;" +
        "box-shadow:0 8px 30px rgba(0,0,0,0.6);font-family:sans-serif;font-size:14px;";
    overlay.appendChild(panel);

    panel.innerHTML = `
        <div data-mb="header" style="padding:10px 14px;font-weight:bold;cursor:move;user-select:none;
                                     border-bottom:1px solid var(--border-color,#4e4e4e);">
            Select a <span style="color:var(--p-primary-color,#7aa2f7)">${folderName}</span> model
        </div>
        <div style="display:flex;gap:6px;padding:8px 14px;">
            <button data-mb="up" title="Parent folder" style="min-width:34px;">⬆</button>
            <input data-mb="path" type="text" spellcheck="false" placeholder="Type a path and press Enter"
                   style="flex:1;background:var(--comfy-input-bg,#151515);color:inherit;
                          border:1px solid var(--border-color,#4e4e4e);border-radius:4px;padding:4px 8px;"/>
            <input data-mb="filter" type="text" spellcheck="false" placeholder="🔍 filter"
                   style="width:140px;background:var(--comfy-input-bg,#151515);color:inherit;
                          border:1px solid var(--border-color,#4e4e4e);border-radius:4px;padding:4px 8px;"/>
        </div>
        <div data-mb="list" style="flex:1;overflow-y:auto;margin:0 14px;border:1px solid var(--border-color,#4e4e4e);
                                   border-radius:4px;background:var(--comfy-input-bg,#151515);"></div>
        <div data-mb="status" style="padding:4px 14px;min-height:20px;font-size:12px;opacity:0.75;"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;padding:0 14px 12px;">
            <button data-mb="cancel">Cancel</button>
            <button data-mb="select" disabled>Select</button>
        </div>`;

    for (const b of panel.querySelectorAll("button")) {
        b.style.cssText +=
            "background:var(--comfy-input-bg,#333);color:inherit;border:1px solid var(--border-color,#4e4e4e);" +
            "border-radius:4px;padding:4px 14px;cursor:pointer;";
    }

    const els = {};
    for (const el of panel.querySelectorAll("[data-mb]")) els[el.dataset.mb] = el;

    let currentParent = null;
    let selectedPath = null;
    let lastData = null;

    // Drag the panel around by its title bar.
    let dragX = 0, dragY = 0;
    els.header.onmousedown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const startX = e.clientX - dragX, startY = e.clientY - dragY;
        const onMove = (ev) => {
            dragX = ev.clientX - startX;
            dragY = ev.clientY - startY;
            panel.style.transform = `translate(${dragX}px,${dragY}px)`;
        };
        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    };

    const close = () => {
        document.removeEventListener("keydown", onKey, true);
        overlay.remove();
    };
    const confirm = () => {
        if (!selectedPath) return;
        const chosen = selectedPath;
        close();
        onPick(chosen);
    };
    const onKey = (e) => {
        if (e.key === "Escape") {
            e.stopPropagation();
            if (document.activeElement === els.filter && els.filter.value) {
                els.filter.value = "";
                render();
            } else {
                close();
            }
        } else if (e.key === "Enter" && document.activeElement === els.path) {
            e.stopPropagation();
            load(els.path.value.trim());
        }
    };

    const setSelected = (row, path) => {
        for (const r of els.list.children) r.style.background = "";
        row.style.background = "var(--p-highlight-background,#264f78)";
        selectedPath = path;
        els.select.disabled = false;
    };

    const row = (icon, label, extra) => {
        const div = document.createElement("div");
        div.style.cssText =
            "display:flex;gap:8px;align-items:center;padding:3px 10px;cursor:pointer;user-select:none;white-space:nowrap;";
        div.onmouseenter = () => {
            if (div.dataset.path !== selectedPath) div.style.background = "rgba(255,255,255,0.06)";
        };
        div.onmouseleave = () => {
            if (div.dataset.path !== selectedPath) div.style.background = "";
        };
        div.innerHTML = `<span>${icon}</span><span style="overflow:hidden;text-overflow:ellipsis;flex:1;"></span>` +
            (extra ? `<span style="opacity:0.6;font-size:12px;">${extra}</span>` : "");
        div.children[1].textContent = label;
        return div;
    };

    function render() {
        els.list.replaceChildren();
        if (!lastData) return;
        const q = els.filter.value.trim().toLowerCase();
        let visibleSelected = false;
        for (const d of lastData.dirs) {
            const r = row("📁", d.name);
            r.dataset.path = d.path;
            r.onclick = () => load(d.path);
            els.list.appendChild(r);
        }
        let shown = 0;
        for (const f of lastData.files) {
            if (q && !f.name.toLowerCase().includes(q)) continue;
            shown++;
            const r = row("🧩", f.name, formatSize(f.size));
            r.dataset.path = f.path;
            r.onclick = () => setSelected(r, f.path);
            r.ondblclick = () => {
                setSelected(r, f.path);
                confirm();
            };
            if (f.path === selectedPath) {
                r.style.background = "var(--p-highlight-background,#264f78)";
                visibleSelected = true;
            }
            els.list.appendChild(r);
        }
        if (selectedPath && !visibleSelected) {
            selectedPath = null;
            els.select.disabled = true;
        }
        els.status.textContent = q
            ? `${lastData.dirs.length} folders, ${shown} of ${lastData.files.length} model files match`
            : `${lastData.dirs.length} folders, ${lastData.files.length} model files`;
    }

    async function load(path) {
        els.status.textContent = "Loading…";
        selectedPath = null;
        els.select.disabled = true;
        try {
            const res = await api.fetchApi(
                `/modelbrowser/browse?folder_name=${encodeURIComponent(folderName)}&path=${encodeURIComponent(path ?? "")}`
            );
            const data = await res.json();
            if (!res.ok) {
                els.status.textContent = data.error || res.statusText;
                return;
            }
            currentParent = data.parent;
            els.path.value = data.path;
            if (data.path) localStorage.setItem(lastKey, data.path);
            els.up.disabled = data.parent === null;
            lastData = data;
            render();
        } catch (e) {
            els.status.textContent = String(e);
        }
    }

    els.up.onclick = () => load(currentParent ?? "");
    els.cancel.onclick = close;
    els.select.onclick = confirm;
    els.filter.oninput = render;
    // mousedown (not click): releasing a title-bar drag over the backdrop
    // would otherwise fire a click on the overlay and close the dialog.
    overlay.onmousedown = (e) => {
        if (e.target === overlay) close();
    };
    document.addEventListener("keydown", onKey, true);

    document.body.appendChild(overlay);
    load(localStorage.getItem(lastKey) || "");
}

/* ------------------------------------------------------------------ */
/* Picking a file                                                      */
/* ------------------------------------------------------------------ */

async function applyPick(node, widget, folderName, filePath) {
    let data;
    try {
        const res = await api.fetchApi("/modelbrowser/pick", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folder_name: folderName, path: filePath }),
        });
        data = await res.json();
        if (!res.ok) {
            toast("error", "Model Browser", data.error || res.statusText);
            return;
        }
    } catch (e) {
        toast("error", "Model Browser", String(e));
        return;
    }

    const values = widget.options?.values;
    if (Array.isArray(values) && !values.includes(data.name)) values.push(data.name);
    widget.value = data.name;
    try {
        widget.callback?.(data.name, app.canvas, node);
    } catch {}
    node.graph?.setDirtyCanvas(true, true);

    if (data.collision) {
        toast(
            "warn",
            "Name collision",
            `Another "${data.name}" already exists in your ${folderName} folder and takes priority. ` +
                `Rename the file you browsed to and pick it again.`
        );
    } else {
        toast("success", `${widget.name} set`, data.name);
    }
}

/* ------------------------------------------------------------------ */
/* Button injection                                                    */
/* ------------------------------------------------------------------ */

async function addBrowseButtons(node) {
    const folders = await getModelIndex();
    if (!node.widgets || node.__mbProcessed) return;
    node.__mbProcessed = true;

    let added = false;
    for (const widget of [...node.widgets]) {
        if (widget.type !== "combo" || widget.__mbButton) continue;
        const folderName = matchFolder(node, widget, folders);
        if (!folderName) continue;
        widget.__mbButton = true;

        // Buttons are appended at the END of the widget list on purpose:
        // stale trailing entries in widgets_values are ignored by litegraph,
        // so workflows saved with this extension still load cleanly without it.
        const btn = node.addWidget("button", `📂 browse ${widget.name}`, null, () => {
            openBrowserDialog(folderName, (filePath) => applyPick(node, widget, folderName, filePath));
        });
        btn.serialize = false;
        btn.options = Object.assign(btn.options || {}, { serialize: false });
        added = true;
    }

    if (added) {
        const computed = node.computeSize();
        node.setSize([Math.max(node.size[0], computed[0]), Math.max(node.size[1], computed[1])]);
        node.setDirtyCanvas?.(true, true);
    }
}

app.registerExtension({
    name: "ModelBrowser",
    nodeCreated(node) {
        addBrowseButtons(node).catch((e) => console.error("[ModelBrowser]", e));
    },
});
