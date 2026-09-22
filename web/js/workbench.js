// VanNetra Workbench: an open, in-browser link-analysis chart in the spirit of
// i2 Analyst's Notebook. Entities + typed links, expand/isolate, shortest path,
// centrality, communities, time slider, CSV/JSON import and GraphML/CSV/PNG export.
//
// Privacy: public data comes from web/data/graph.json (no persons). Anything the
// analyst imports or draws stays in this browser (localStorage) and is never sent
// anywhere. There is no server.

import { esc, fmt } from "./charts.js";

export const TYPES = {
  Case:      { color: "#e34948", shape: "round-rectangle", label: "Cases" },
  Species:   { color: "#008300", shape: "ellipse", label: "Species" },
  Location:  { color: "#2a78d6", shape: "diamond", label: "Locations" },
  Agency:    { color: "#4a3aa7", shape: "hexagon", label: "Agencies" },
  Commodity: { color: "#eb6834", shape: "star", label: "Commodities" },
  Mode:      { color: "#eda100", shape: "triangle", label: "Transport modes" },
  Outlet:    { color: "#7a8494", shape: "rectangle", label: "News outlets" },
  Person:    { color: "#e87ba4", shape: "ellipse", label: "Persons (local only)" },
  Phone:     { color: "#1baf7a", shape: "round-tag", label: "Phones (local only)" },
  Account:   { color: "#1baf7a", shape: "vee", label: "Online accounts (local only)" },
  Vehicle:   { color: "#1baf7a", shape: "barrel", label: "Vehicles (local only)" },
  Other:     { color: "#9aa3b2", shape: "ellipse", label: "Other" },
};
const LOCAL_KEY = "vannetra.workbench.local.v1";
const store = {
  load() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{"elements":[]}'); } catch { return { elements: [] }; } },
  save(d) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(d)); } catch { /* storage blocked: session only */ } },
};

function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  const h = head.map((x) => x.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] || "").trim()])));
}
const slug = (t, l) => `${t}:${l}`.toLowerCase().replace(/\s+/g, "_");
const download = (name, blob) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };

export function mountWorkbench(root, graph, { openCase } = {}) {
  if (!window.cytoscape) { root.innerHTML = `<div class="empty">Graph library failed to load.</div>`; return; }
  const local = store.load();
  const publicEls = graph.elements || [];
  const all = [...publicEls, ...local.elements.map((e) => ({ ...e, data: { ...e.data, local: true } }))];
  const counts = {};
  all.filter((e) => e.group === "nodes").forEach((e) => (counts[e.data.type] = (counts[e.data.type] || 0) + 1));
  const dates = all.map((e) => e.data.date || e.data.first).filter(Boolean).sort();
  const months = [...new Set(dates.map((d) => d.slice(0, 7)))];

  root.innerHTML = `
  <div class="wb">
    <section class="wb-panel glass" aria-label="Chart controls">
      <h3>Find</h3>
      <input type="search" id="wb-q" placeholder="Entity name…" style="width:100%;margin:8px 0 14px" aria-label="Search entities">
      <h3 style="margin-bottom:6px">Entity types</h3>
      <div id="wb-types">${Object.entries(TYPES).filter(([t]) => counts[t]).map(([t, v]) => `
        <label class="type-toggle"><input type="checkbox" value="${t}" ${t === "Outlet" && all.length > 900 ? "" : "checked"}>
          <span class="sw" style="background:${v.color}"></span>${v.label}<span class="n">${fmt(counts[t])}</span></label>`).join("")}</div>
      <h3 style="margin:16px 0 6px">Layout</h3>
      <div class="seg" id="wb-layout" role="group" aria-label="Layout">
        <button aria-pressed="true" data-l="cose">Force</button><button data-l="concentric">Centrality</button><button data-l="breadthfirst">Tree</button><button data-l="circle">Circle</button>
      </div>
      <h3 style="margin:16px 0 6px">Size & colour</h3>
      <div class="seg" id="wb-size" role="group" aria-label="Node size"><button aria-pressed="true" data-s="degree">Degree</button><button data-s="betweenness">Brokerage</button><button data-s="none">Equal</button></div>
      <label class="type-toggle" style="margin-top:8px"><input type="checkbox" id="wb-comm"> Colour by community</label>
      <h3 style="margin:16px 0 6px">Your data <span class="muted small">(stays in this browser)</span></h3>
      <div class="chips">
        <label class="btn" style="cursor:pointer">Import CSV<input type="file" id="wb-csv" accept=".csv" hidden></label>
        <label class="btn" style="cursor:pointer">Import JSON<input type="file" id="wb-json" accept=".json" hidden></label>
        <button class="btn" id="wb-clear">Clear local</button>
      </div>
      <form id="wb-addform" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px">
        <select id="wb-addtype" aria-label="Entity type">${Object.keys(TYPES).map((t) => `<option ${t === "Person" ? "selected" : ""}>${t}</option>`).join("")}</select>
        <input type="text" id="wb-addlabel" placeholder="Label" aria-label="Entity label" required>
        <input type="text" id="wb-linktype" placeholder="Link type, e.g. called" aria-label="Link type" value="associated_with">
        <button class="btn" type="submit">Add entity</button>
      </form>
      <p class="small muted" style="margin-top:8px">CSV, one row per link: <span class="mono">source,source_type,target,target_type,link_type,date</span>. Same layout as an i2 ANB import specification.</p>
      <div class="privacy-note" style="margin-top:10px">Public chart holds no person data. Persons, phones and accounts you add are kept in <b>localStorage on this device</b> and are never uploaded.</div>
    </section>

    <section class="wb-canvas glass" aria-label="Link chart">
      <div class="wb-toolbar glass" role="toolbar" aria-label="Chart tools">
        <button class="btn" id="t-fit" title="Fit chart to view">Fit</button>
        <button class="btn" id="t-expand" title="Show neighbours of selection">Expand</button>
        <button class="btn" id="t-isolate" title="Show only selection and its links">Isolate</button>
        <button class="btn" id="t-hide" title="Hide selection">Hide</button>
        <button class="btn" id="t-path" title="Shortest path between two selected entities">Path</button>
        <button class="btn" id="t-link" title="Link two selected entities">Link</button>
        <button class="btn" id="t-reset" title="Reset view">Reset</button>
        <span style="flex:1"></span>
        <button class="btn" id="x-png">PNG</button><button class="btn" id="x-graphml">GraphML</button><button class="btn" id="x-csv">CSV</button><button class="btn" id="x-json">JSON</button>
      </div>
      <div id="cy" aria-label="Interactive network chart. Use the inspector panel for a text view of the selection."></div>
      ${months.length > 1 ? `<div class="wb-timeline glass"><div class="small" style="display:flex;justify-content:space-between"><span>Time filter: up to <b id="wb-tlabel">${months.at(-1)}</b></span><span class="muted">${months[0]} → ${months.at(-1)}</span></div>
        <input type="range" id="wb-time" min="0" max="${months.length - 1}" value="${months.length - 1}" aria-label="Show entities up to month"></div>` : ""}
    </section>

    <section class="wb-panel glass" aria-label="Inspector" id="wb-inspect">
      <h3>Inspector</h3>
      <p class="small muted" style="margin-top:8px">Select an entity. Shift-click to select several. Pick two, then <b>Path</b> to trace how they connect.</p>
      <div id="wb-stats" class="small muted"></div>
    </section>
  </div>`;

  const sizeBy = { key: "degree" };
  const cy = cytoscape({
    container: root.querySelector("#cy"),
    elements: all,
    wheelSensitivity: 0.25,
    minZoom: 0.08, maxZoom: 3,
    style: [
      { selector: "node", style: {
        "background-color": (n) => (TYPES[n.data("type")] || TYPES.Other).color,
        shape: (n) => (TYPES[n.data("type")] || TYPES.Other).shape,
        width: (n) => nodeSize(n), height: (n) => nodeSize(n),
        label: (n) => { const l = n.data("label") || ""; return n.data("type") === "Case" ? "" : l.length > 26 ? l.slice(0, 25) + "…" : l; },
        "font-size": 10, "font-family": "-apple-system, Segoe UI, Inter, sans-serif", color: "#3b4555",
        "text-valign": "bottom", "text-margin-y": 4, "text-outline-color": "#fff", "text-outline-width": 2,
        "border-width": 2, "border-color": "#fff", "min-zoomed-font-size": 7 } },
      { selector: "node[?local]", style: { "border-color": "#e87ba4", "border-style": "dashed", "border-width": 2.5 } },
      { selector: "node:selected", style: { "border-color": "#4a3aa7", "border-width": 4, label: "data(label)", "z-index": 20 } },
      { selector: "edge", style: {
        width: (e) => Math.min(1 + Math.log2(1 + (e.data("weight") || 1)), 6), "line-color": "rgba(59,69,85,.28)",
        "curve-style": "bezier", "target-arrow-shape": (e) => (e.data("type") === "trafficked_to" ? "triangle" : "none"),
        "target-arrow-color": "rgba(138,75,0,.8)" } },
      { selector: "edge[type = 'trafficked_to']", style: { "line-color": "rgba(138,75,0,.7)", width: 3 } },
      { selector: "edge:selected", style: { "line-color": "#4a3aa7", label: "data(type)", "font-size": 9, "text-rotation": "autorotate", "text-background-color": "#fff", "text-background-opacity": 1 } },
      { selector: ".faded", style: { opacity: 0.12 } },
      { selector: "edge.path", style: { "line-color": "#6d5ce0", width: 5, "z-index": 30 } },
      { selector: "node.path", style: { "border-color": "#6d5ce0", "border-width": 4, label: "data(label)", "z-index": 30 } },
      { selector: ".hidden", style: { display: "none" } },
    ],
    layout: { name: "preset" },
  });
  function nodeSize(n) {
    if (sizeBy.key === "none") return 22;
    // Public nodes carry precomputed metrics; local ones fall back to live degree.
    const v = n.data(sizeBy.key) ?? (sizeBy.key === "degree" ? n.degree(false) : 0);
    return sizeBy.key === "degree" ? 14 + Math.min(46, Math.sqrt(v) * 6) : 14 + Math.min(46, Math.sqrt(v) * 160);
  }
  const run = (name) => cy.elements(":visible").layout({
    name, animate: all.length < 1500, animationDuration: 500, fit: true, padding: 60,
    ...(name === "cose" ? { nodeRepulsion: 9000, idealEdgeLength: 70, numIter: 900, randomize: true } : {}),
    ...(name === "concentric" ? { concentric: (n) => n.data("degree") || 0, levelWidth: () => 3, minNodeSpacing: 14 } : {}),
    ...(name === "breadthfirst" ? { directed: false, spacingFactor: 1.1 } : {}),
  }).run();

  // ----- filters
  const typeBoxes = () => [...root.querySelectorAll("#wb-types input")];
  const timeEl = root.querySelector("#wb-time");
  function applyFilters() {
    const on = new Set(typeBoxes().filter((b) => b.checked).map((b) => b.value));
    const upto = timeEl ? months[+timeEl.value] : null;
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        const d = n.data("date");
        const hide = !on.has(n.data("type")) || (upto && d && d.slice(0, 7) > upto) || n.hasClass("user-hidden");
        n.toggleClass("hidden", !!hide);
      });
      cy.edges().forEach((e) => {
        const f = e.data("first");
        e.toggleClass("hidden", e.source().hasClass("hidden") || e.target().hasClass("hidden") || !!(upto && f && f.slice(0, 7) > upto));
      });
    });
    const st = root.querySelector("#wb-stats");
    if (st) st.textContent = `${fmt(cy.nodes(":visible").length)} entities · ${fmt(cy.edges(":visible").length)} links visible`;
  }
  typeBoxes().forEach((b) => b.addEventListener("change", applyFilters));
  timeEl?.addEventListener("input", () => { root.querySelector("#wb-tlabel").textContent = months[+timeEl.value]; applyFilters(); });
  applyFilters();
  run(all.length > 2500 ? "concentric" : "cose");

  // ----- search
  root.querySelector("#wb-q").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    cy.elements().removeClass("faded");
    if (!q) return;
    const hit = cy.nodes(":visible").filter((n) => (n.data("label") || "").toLowerCase().includes(q));
    cy.elements(":visible").not(hit.closedNeighborhood()).addClass("faded");
    if (hit.length) cy.animate({ fit: { eles: hit.closedNeighborhood(), padding: 80 } }, { duration: 400 });
  });

  // ----- segmented controls
  const seg = (sel, fn) => root.querySelectorAll(`${sel} button`).forEach((b) => b.addEventListener("click", () => {
    root.querySelectorAll(`${sel} button`).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); fn(b);
  }));
  seg("#wb-layout", (b) => run(b.dataset.l));
  seg("#wb-size", (b) => { sizeBy.key = b.dataset.s; cy.style().update(); });
  root.querySelector("#wb-comm").addEventListener("change", (e) => {
    const pal = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
    cy.nodes().forEach((n) => {
      const c = n.data("community");
      n.style("background-color", e.target.checked ? (c >= 0 && c < 8 ? pal[c] : "#9aa3b2") : (TYPES[n.data("type")] || TYPES.Other).color);
    });
  });

  // ----- inspector
  const insp = root.querySelector("#wb-inspect");
  function inspect(n) {
    const d = n.data(), t = TYPES[d.type] || TYPES.Other;
    const nb = {};
    n.neighborhood("node").forEach((m) => (nb[m.data("type")] ||= []).push(m));
    const skip = new Set(["id", "label", "type", "community", "local"]);
    insp.innerHTML = `<h3 style="display:flex;gap:8px;align-items:center"><span class="sw" style="width:12px;height:12px;border-radius:4px;background:${t.color}"></span>${esc(d.type)}</h3>
      <p style="font-weight:600;margin:8px 0 12px">${esc(d.label)}</p>
      <div class="kv">${Object.entries(d).filter(([k, v]) => !skip.has(k) && v !== "" && v != null).map(([k, v]) => `<div>${esc(k)}</div><div>${esc(typeof v === "number" ? (Number.isInteger(v) ? fmt(v) : v.toFixed(4)) : v)}</div>`).join("")}</div>
      ${d.type === "Case" && openCase && !d.local ? `<button class="btn primary" style="margin-top:12px" id="wb-open">Open case report</button>` : ""}
      <div class="section-title">Connected (${n.neighborhood("node").length})</div>
      ${Object.entries(nb).map(([k, arr]) => `<div class="small muted" style="margin:8px 0 4px">${esc((TYPES[k] || TYPES.Other).label)}</div>
        ${arr.slice(0, 30).map((m) => `<button class="row-item" style="grid-template-columns:1fr;padding:6px 8px" data-go="${esc(m.id())}"><span class="title small">${esc(m.data("label"))}</span></button>`).join("")}`).join("")}`;
    insp.querySelector("#wb-open")?.addEventListener("click", () => openCase(d.id.split(":")[1]));
    insp.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => {
      const m = cy.getElementById(b.dataset.go); cy.$(":selected").unselect(); m.select(); cy.animate({ center: { eles: m }, zoom: Math.max(cy.zoom(), 1) }, { duration: 300 });
    }));
  }
  cy.on("select", "node", (e) => inspect(e.target));
  cy.on("tap", (e) => { if (e.target === cy) cy.elements().removeClass("faded path"); });

  // ----- tools
  const sel = () => cy.$("node:selected");
  const on = (id, fn) => root.querySelector(id).addEventListener("click", fn);
  on("#t-fit", () => cy.animate({ fit: { eles: cy.elements(":visible"), padding: 50 } }, { duration: 350 }));
  on("#t-expand", () => { const s = sel(); s.neighborhood().removeClass("hidden user-hidden faded"); s.neighborhood("node").select(); });
  on("#t-isolate", () => { const keep = sel().closedNeighborhood(); cy.elements().not(keep).addClass("faded"); cy.animate({ fit: { eles: keep, padding: 80 } }, { duration: 350 }); });
  on("#t-hide", () => { sel().addClass("user-hidden"); applyFilters(); });
  on("#t-reset", () => { cy.elements().removeClass("faded path user-hidden"); applyFilters(); cy.animate({ fit: { eles: cy.elements(":visible"), padding: 50 } }); });
  on("#t-path", () => {
    const s = sel();
    if (s.length !== 2) { insp.querySelector("h3").insertAdjacentHTML("afterend", `<p class="small" style="color:var(--cases-ink)">Select exactly two entities (shift-click).</p>`); return; }
    const r = cy.elements(":visible").aStar({ root: s[0], goal: s[1], weight: () => 1 });
    cy.elements().removeClass("path").addClass("faded");
    if (r.found) { r.path.removeClass("faded").addClass("path"); cy.animate({ fit: { eles: r.path, padding: 90 } }, { duration: 400 }); }
    insp.innerHTML = `<h3>Path</h3><p class="small" style="margin-top:8px">${r.found ? `${(r.path.length - 1) / 2} hop(s): ` + r.path.nodes().map((n) => `<b>${esc(n.data("label"))}</b>`).join(" → ") : "No connection among visible entities."}</p>`;
  });

  // ----- local data (never leaves the browser)
  function persist(newEls) {
    local.elements.push(...newEls); store.save(local);
    cy.add(newEls.map((e) => ({ ...e, data: { ...e.data, local: true } })).filter((e) => !cy.getElementById(e.data.id).length));
    applyFilters();
  }
  on("#t-link", () => {
    const s = sel();
    if (s.length !== 2) { insp.querySelector("h3").insertAdjacentHTML("afterend", `<p class="small" style="color:var(--cases-ink)">Select exactly two entities to link. The link type comes from the form on the left.</p>`); return; }
    const type = root.querySelector("#wb-linktype").value.trim() || "associated_with";
    persist([{ group: "edges", data: { id: `l${Date.now()}`, source: s[0].id(), target: s[1].id(), type, weight: 1, first: new Date().toISOString().slice(0, 10) } }]);
  });
  root.querySelector("#wb-addform").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const t = root.querySelector("#wb-addtype").value, label = root.querySelector("#wb-addlabel").value.trim();
    if (!label) return;
    root.querySelector("#wb-addlabel").value = "";
    persist([{ group: "nodes", data: { id: slug(t, label), type: t, label } }]);
    const ext = cy.extent();
    cy.getElementById(slug(t, label)).position({ x: (ext.x1 + ext.x2) / 2, y: (ext.y1 + ext.y2) / 2 }).select();
  });
  on("#wb-clear", (e) => {
    const b = e.currentTarget;
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Click again to clear"; setTimeout(() => { b.dataset.armed = ""; b.textContent = "Clear local"; }, 3000); return; }
    cy.remove("[?local]"); local.elements = []; store.save(local); applyFilters(); b.dataset.armed = ""; b.textContent = "Clear local";
  });
  root.querySelector("#wb-csv").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rows = parseCSV(await f.text()); const els = []; const seen = new Set();
    for (const r of rows) {
      const st = TYPES[r.source_type] ? r.source_type : "Other", tt = TYPES[r.target_type] ? r.target_type : "Other";
      for (const [t, l] of [[st, r.source], [tt, r.target]]) {
        const id = slug(t, l);
        if (l && !seen.has(id) && !cy.getElementById(id).length) { els.push({ group: "nodes", data: { id, type: t, label: l, date: r.date || undefined } }); seen.add(id); }
      }
      if (r.source && r.target) els.push({ group: "edges", data: { id: `l${Date.now()}${els.length}`, source: slug(st, r.source), target: slug(tt, r.target), type: r.link_type || "linked", weight: +r.weight || 1, first: r.date || "" } });
    }
    persist(els); run("cose");
  });
  root.querySelector("#wb-json").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const j = JSON.parse(await f.text()); persist(j.elements || j); run("cose"); } catch { insp.innerHTML = `<h3>Import failed</h3><p class="small">That file is not VanNetra or Cytoscape JSON.</p>`; }
  });

  // ----- export
  on("#x-png", () => download("vannetra-chart.png", dataURLtoBlob(cy.png({ full: true, scale: 2, bg: "#ffffff" }))));
  on("#x-json", () => download("vannetra-chart.json", new Blob([JSON.stringify({ elements: cy.elements(":visible").jsons() })], { type: "application/json" })));
  on("#x-csv", () => {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const lines = ["source,source_type,target,target_type,link_type,weight,date"];
    cy.edges(":visible").forEach((e) => lines.push([e.source().data("label"), e.source().data("type"), e.target().data("label"), e.target().data("type"), e.data("type"), e.data("weight"), e.data("first")].map(q).join(",")));
    download("vannetra-links.csv", new Blob([lines.join("\n")], { type: "text/csv" }));
  });
  on("#x-graphml", () => {
    const x = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
    const nodes = cy.nodes(":visible").map((n) => `<node id="${x(n.id())}"><data key="label">${x(n.data("label"))}</data><data key="type">${x(n.data("type"))}</data></node>`).join("");
    const edges = cy.edges(":visible").map((e) => `<edge source="${x(e.source().id())}" target="${x(e.target().id())}"><data key="etype">${x(e.data("type"))}</data><data key="weight">${e.data("weight") || 1}</data></edge>`).join("");
    download("vannetra-chart.graphml", new Blob([`<?xml version="1.0" encoding="UTF-8"?><graphml xmlns="http://graphml.graphdrawing.org/xmlns"><key id="label" for="node" attr.name="label" attr.type="string"/><key id="type" for="node" attr.name="type" attr.type="string"/><key id="etype" for="edge" attr.name="type" attr.type="string"/><key id="weight" for="edge" attr.name="weight" attr.type="int"/><graph edgedefault="directed">${nodes}${edges}</graph></graphml>`], { type: "application/xml" }));
  });
  function dataURLtoBlob(u) { const [h, b] = u.split(","); const bin = atob(b); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: h.split(":")[1].split(";")[0] }); }

  return cy;
}
