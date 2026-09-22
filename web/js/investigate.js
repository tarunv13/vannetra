// Investigate: an open, in-browser alternative to i2 Analyst's Notebook.
//   Chart      typed entities and links, expand / isolate / shortest path, centrality,
//              communities, layouts, exports (PNG, GraphML, CSV, JSON). Linked to the map.
//   Your data  import CSV / Excel / JSON, map columns to entities and links (like an
//              i2 import specification), preview, and add to the chart and the globe.
// Privacy: imported data lives in this browser's localStorage and is never uploaded.
import { esc, fmt } from "./charts.js";
import { S, go } from "./store.js";

export const TYPES = {
  Case: { color: "#d6453d", shape: "round-rectangle", label: "Cases" },
  Species: { color: "#218a5b", shape: "ellipse", label: "Species" },
  Location: { color: "#2563eb", shape: "diamond", label: "Locations" },
  Agency: { color: "#4a3aa7", shape: "hexagon", label: "Agencies" },
  Commodity: { color: "#eb6834", shape: "star", label: "Commodities" },
  Mode: { color: "#c27a06", shape: "triangle", label: "Transport" },
  Outlet: { color: "#7a8494", shape: "rectangle", label: "News outlets" },
  Person: { color: "#e87ba4", shape: "ellipse", label: "Persons" },
  Organisation: { color: "#8b5cf6", shape: "round-hexagon", label: "Organisations" },
  Phone: { color: "#1baf7a", shape: "round-tag", label: "Phones" },
  Account: { color: "#0e8f88", shape: "vee", label: "Online accounts" },
  Vehicle: { color: "#5f6d68", shape: "barrel", label: "Vehicles" },
  Shipment: { color: "#a16207", shape: "rhomboid", label: "Shipments" },
  Other: { color: "#9aa3b2", shape: "ellipse", label: "Other" },
};
const KEY = "wildtrace.local.v1";
const store = {
  load() {
    // Earlier builds stored under the project's previous names; carry that data over.
    try { return JSON.parse(localStorage.getItem(KEY) || localStorage.getItem("pugmark.local.v1") || localStorage.getItem("vannetra.workbench.local.v1") || '{"elements":[]}'); }
    catch { return { elements: [] }; }
  },
  save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage blocked: session only */ } },
};
const slug = (t, l) => `${t}:${l}`.toLowerCase().replace(/\s+/g, "_");
const typeOf = (t) => { const k = Object.keys(TYPES).find((x) => x.toLowerCase() === String(t || "").trim().toLowerCase()); return k || "Other"; };

export const local = store.load();
/** Local entities that carry coordinates, as GeoJSON for the globe. */
export function localPoints() {
  return { type: "FeatureCollection", features: local.elements.filter((e) => e.group === "nodes" && isFinite(+e.data.lat) && isFinite(+e.data.lon) && e.data.lat !== "")
    .map((e) => ({ type: "Feature", properties: { id: e.data.id, label: e.data.label, type: e.data.type }, geometry: { type: "Point", coordinates: [+e.data.lon, +e.data.lat] } })) };
}
export const localEntity = (id) => local.elements.find((e) => e.group === "nodes" && e.data.id === id)?.data;

// ------------------------------------------------------------------ chart
let cy = null;
export function mountChart(root, { onLocalChange, focus } = {}) {
  if (!window.cytoscape) { root.innerHTML = `<p class="prose">The graph library did not load.</p>`; return; }
  const all = [...(S.data.graph.elements || []), ...local.elements.map((e) => ({ ...e, data: { ...e.data, local: true } }))];
  const counts = {};
  all.filter((e) => e.group === "nodes").forEach((e) => (counts[e.data.type] = (counts[e.data.type] || 0) + 1));
  root.innerHTML = `<div class="wb">
    <div class="wb-side">
      <input type="search" id="wb-q" placeholder="Find an entity…" aria-label="Find an entity" style="width:100%;margin-bottom:12px">
      ${Object.entries(TYPES).filter(([t]) => counts[t]).map(([t, v]) => `<label class="type-row"><input type="checkbox" value="${t}" ${t === "Outlet" ? "" : "checked"}>
        <span class="sw" style="background:${v.color}"></span>${v.label}<span class="n">${fmt(counts[t])}</span></label>`).join("")}
      <div class="sec"><h3>Layout</h3></div>
      <select id="wb-layout" style="width:100%"><option value="cose">Force-directed</option><option value="concentric">By centrality</option><option value="breadthfirst">Hierarchy</option><option value="circle">Circle</option></select>
      <div class="sec"><h3>Size by</h3></div>
      <select id="wb-size" style="width:100%"><option value="degree">Connections (degree)</option><option value="betweenness">Brokerage (betweenness)</option><option value="none">Equal</option></select>
      <label class="type-row" style="margin-top:8px"><input type="checkbox" id="wb-comm"> Colour by community</label>
      <label class="type-row"><input type="checkbox" id="wb-core"> Busiest entities only</label>
      <div class="note" style="margin-top:12px">Public chart: cases, species, places, agencies, outlets. It holds no people. Entities you import stay in this browser.</div>
    </div>
    <div class="wb-canvas"><div class="wb-tools">
      <button class="btn" id="t-fit">Fit</button><button class="btn" id="t-expand">Expand</button><button class="btn" id="t-isolate">Isolate</button>
      <button class="btn" id="t-hide">Hide</button><button class="btn" id="t-path">Shortest path</button><button class="btn" id="t-reset">Reset</button>
      <span style="flex:1"></span>
      <button class="btn" id="x-png">PNG</button><button class="btn" id="x-graphml">GraphML</button><button class="btn" id="x-csv">CSV</button><button class="btn" id="x-json">JSON</button>
    </div><div id="cy" aria-label="Link chart. The inspector on the right lists the selection as text."></div></div>
    <div class="wb-side" id="wb-insp"><div class="sec" style="margin-top:0"><h3>Selection</h3></div>
      <p class="muted" style="font-size:12.5px">Click an entity. Shift-click to add more. Pick two, then Shortest path to see how they connect.</p><p class="muted mono" id="wb-stats"></p></div>
  </div>`;
  const sizeKey = { v: "degree" };
  const size = (n) => { if (sizeKey.v === "none") return 22; const v = n.data(sizeKey.v) ?? (sizeKey.v === "degree" ? n.degree(false) : 0);
    return sizeKey.v === "degree" ? 14 + Math.min(44, Math.sqrt(v) * 6) : 14 + Math.min(44, Math.sqrt(v) * 150); };
  cy?.destroy();
  cy = cytoscape({
    container: root.querySelector("#cy"), elements: all, minZoom: 0.06, maxZoom: 3,
    style: [
      { selector: "node", style: { "background-color": (n) => (TYPES[n.data("type")] || TYPES.Other).color, shape: (n) => (TYPES[n.data("type")] || TYPES.Other).shape,
        width: size, height: size, label: (n) => (n.data("type") === "Case" ? "" : (n.data("label") || "").slice(0, 26)),
        "font-size": 10, "font-family": "Geist, system-ui, sans-serif", color: "#3c4a45", "text-valign": "bottom", "text-margin-y": 4,
        "text-outline-color": "#fff", "text-outline-width": 2, "border-width": 2, "border-color": "#fff", "min-zoomed-font-size": 7 } },
      { selector: "node[?local]", style: { "border-color": "#6550c8", "border-style": "dashed", "border-width": 2.5 } },
      { selector: "node:selected", style: { "border-color": "#0f1a17", "border-width": 4, label: "data(label)", "z-index": 20 } },
      { selector: "edge", style: { width: (e) => Math.min(1 + Math.log2(1 + (e.data("weight") || 1)), 6), "line-color": "rgba(60,74,69,.26)", "curve-style": "bezier",
        "target-arrow-shape": (e) => (e.data("type") === "trafficked_to" ? "triangle" : "none"), "target-arrow-color": "rgba(194,122,6,.9)" } },
      { selector: "edge[type = 'trafficked_to']", style: { "line-color": "rgba(194,122,6,.75)", width: 3 } },
      { selector: "edge:selected", style: { "line-color": "#0f1a17", label: "data(type)", "font-size": 9, "text-rotation": "autorotate", "text-background-color": "#fff", "text-background-opacity": 1 } },
      { selector: ".faded", style: { opacity: 0.1 } },
      { selector: "edge.path", style: { "line-color": "#6550c8", width: 5, "z-index": 30 } },
      { selector: "node.path", style: { "border-color": "#6550c8", "border-width": 4, label: "data(label)", "z-index": 30 } },
      { selector: ".hidden", style: { display: "none" } },
    ],
    layout: { name: "preset" },
  });
  const run = (name) => cy.elements(":visible").layout({ name, animate: all.length < 1500, animationDuration: 500, fit: true, padding: 50,
    ...(name === "cose" ? { nodeRepulsion: 9000, idealEdgeLength: 70, numIter: 900, randomize: true } : {}),
    ...(name === "concentric" ? { concentric: (n) => n.data("degree") || n.degree(false), levelWidth: () => 3, minNodeSpacing: 14 } : {}) }).run();
  const boxes = () => [...root.querySelectorAll(".wb-side input[type=checkbox][value]")];
  // A whole-network chart of thousands of entities reads as a hairball. Open on the
  // best-connected core instead, and let the chart be opened out from there.
  const CORE = 220;
  const core = new Set(cy.nodes().sort((a, b) => (b.data("degree") || b.degree(false)) - (a.data("degree") || a.degree(false)))
    .slice(0, CORE).map((n) => n.id()));
  const coreBox = root.querySelector("#wb-core");
  coreBox.checked = !focus && cy.nodes().length > CORE * 1.5;
  const apply = () => {
    const on = new Set(boxes().filter((b) => b.checked).map((b) => b.value));
    cy.batch(() => {
      cy.nodes().forEach((n) => n.toggleClass("hidden", !on.has(n.data("type")) || n.hasClass("user-hidden")
        || (coreBox.checked && !core.has(n.id()) && !n.data("local"))));
      cy.edges().forEach((e) => e.toggleClass("hidden", e.source().hasClass("hidden") || e.target().hasClass("hidden")));
    });
    if (coreBox.checked) {  // in the core view, an entity with nothing left to connect to is noise
      cy.batch(() => cy.nodes(":visible").forEach((n) => { if (!n.connectedEdges(":visible").length) n.addClass("hidden"); }));
    }
    const vis = cy.nodes(":visible").length;
    root.querySelector("#wb-stats").textContent = coreBox.checked
      ? `${fmt(vis)} of ${fmt(cy.nodes().length)} entities · ${fmt(cy.edges(":visible").length)} links · untick "Busiest entities only" for the whole network`
      : `${fmt(vis)} entities · ${fmt(cy.edges(":visible").length)} links`;
  };
  boxes().forEach((b) => b.addEventListener("change", apply));
  coreBox.addEventListener("change", () => { apply(); run(root.querySelector("#wb-layout").value); });
  apply(); run(cy.nodes(":visible").length > 900 ? "concentric" : "cose");
  root.querySelector("#wb-layout").addEventListener("input", (e) => run(e.target.value));
  root.querySelector("#wb-size").addEventListener("input", (e) => { sizeKey.v = e.target.value; cy.style().update(); });
  root.querySelector("#wb-comm").addEventListener("change", (e) => {
    const pal = ["#2a78d6", "#eb6834", "#1baf7a", "#c27a06", "#e87ba4", "#008300", "#4a3aa7", "#d6453d"];
    cy.nodes().forEach((n) => { const c = n.data("community"); n.style("background-color", e.target.checked ? (c >= 0 && c < 8 ? pal[c] : "#9aa3b2") : (TYPES[n.data("type")] || TYPES.Other).color); });
  });
  root.querySelector("#wb-q").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    cy.elements().removeClass("faded");
    if (!q) return;
    const hit = cy.nodes(":visible").filter((n) => (n.data("label") || "").toLowerCase().includes(q));
    cy.elements(":visible").not(hit.closedNeighborhood()).addClass("faded");
    if (hit.length) cy.animate({ fit: { eles: hit.closedNeighborhood(), padding: 80 } }, { duration: 400 });
  });
  // selection ↔ inspector ↔ map
  const insp = root.querySelector("#wb-insp");
  cy.on("select", "node", (e) => {
    const n = e.target, d = n.data(), t = TYPES[d.type] || TYPES.Other;
    const nb = {};
    n.neighborhood("node").forEach((m) => (nb[m.data("type")] ||= []).push(m));
    insp.innerHTML = `<div class="sec" style="margin-top:0"><h3 style="color:${t.color}">${esc(d.type)}</h3></div><p style="font-weight:600;margin:0 0 8px">${esc(d.label)}</p>
      <div class="kv">${Object.entries(d).filter(([k, v]) => !["id", "label", "type", "community", "local"].includes(k) && v !== "" && v != null)
        .map(([k, v]) => `<div>${esc(k)}</div><div>${esc(typeof v === "number" && !Number.isInteger(v) ? v.toFixed(4) : v)}</div>`).join("")}</div>
      ${d.type === "Case" && !d.local ? `<button class="btn primary" style="margin-top:10px" data-case="${esc(d.id.split(":")[1])}">Open case on the map</button>` : ""}
      ${d.local ? `<button class="btn" style="margin-top:10px" data-entity="${esc(d.id)}">Open in the inspector</button>` : ""}
      ${Object.entries(nb).map(([k, arr]) => `<div class="sec"><h3>${esc((TYPES[k] || TYPES.Other).label)} · ${arr.length}</h3></div>
        ${arr.slice(0, 25).map((m) => `<button class="link-row" data-node="${esc(m.id())}">${esc(m.data("label"))}</button>`).join("")}`).join("")}`;
    insp.querySelector("[data-case]")?.addEventListener("click", (ev) => go({ kind: "case", id: ev.currentTarget.dataset.case }));
    insp.querySelector("[data-entity]")?.addEventListener("click", (ev) => go({ kind: "entity", id: ev.currentTarget.dataset.entity }));
    insp.querySelectorAll("[data-node]").forEach((b) => b.addEventListener("click", () => {
      const m = cy.getElementById(b.dataset.node); cy.$(":selected").unselect(); m.select(); cy.animate({ center: { eles: m } }, { duration: 300 });
    }));
    if (d.type === "Species") go({ kind: "species", id: d.id.split(":")[1] });
  });
  cy.on("tap", (e) => { if (e.target === cy) cy.elements().removeClass("faded path"); });
  const sel = () => cy.$("node:selected");
  const on = (id, fn) => root.querySelector(id).addEventListener("click", fn);
  on("#t-fit", () => cy.animate({ fit: { eles: cy.elements(":visible"), padding: 50 } }, { duration: 350 }));
  on("#t-expand", () => { const s = sel(); s.neighborhood().removeClass("hidden user-hidden faded"); s.neighborhood("node").select(); });
  on("#t-isolate", () => { const keep = sel().closedNeighborhood(); cy.elements().not(keep).addClass("faded"); cy.animate({ fit: { eles: keep, padding: 80 } }, { duration: 350 }); });
  on("#t-hide", () => { sel().addClass("user-hidden"); apply(); });
  on("#t-reset", () => { cy.elements().removeClass("faded path user-hidden"); apply(); cy.animate({ fit: { eles: cy.elements(":visible"), padding: 50 } }); });
  on("#t-path", () => {
    const s = sel();
    if (s.length !== 2) { insp.insertAdjacentHTML("afterbegin", `<p style="color:var(--cases-ink);font-size:12.5px">Select exactly two entities (shift-click).</p>`); return; }
    const r = cy.elements(":visible").aStar({ root: s[0], goal: s[1], weight: () => 1 });
    cy.elements().removeClass("path").addClass("faded");
    if (r.found) { r.path.removeClass("faded").addClass("path"); cy.animate({ fit: { eles: r.path, padding: 90 } }, { duration: 400 }); }
    insp.innerHTML = `<div class="sec" style="margin-top:0"><h3>Shortest path</h3></div><p style="font-size:13px">${r.found ? `${(r.path.length - 1) / 2} hop(s): ` + r.path.nodes().map((n) => `<b>${esc(n.data("label"))}</b>`).join(" → ") : "These two are not connected among the visible entities."}</p>`;
  });
  const dl = (name, blob) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  on("#x-png", () => { const u = cy.png({ full: true, scale: 2, bg: "#ffffff" }); fetch(u).then((r) => r.blob()).then((b) => dl("wildtrace-chart.png", b)); });
  on("#x-json", () => dl("wildtrace-chart.json", new Blob([JSON.stringify({ elements: cy.elements(":visible").jsons() })], { type: "application/json" })));
  on("#x-csv", () => { const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const lines = ["source,source_type,target,target_type,link_type,weight,date"];
    cy.edges(":visible").forEach((e) => lines.push([e.source().data("label"), e.source().data("type"), e.target().data("label"), e.target().data("type"), e.data("type"), e.data("weight"), e.data("first")].map(q).join(",")));
    dl("wildtrace-links.csv", new Blob([lines.join("\n")], { type: "text/csv" })); });
  on("#x-graphml", () => { const x = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
    const nodes = cy.nodes(":visible").map((n) => `<node id="${x(n.id())}"><data key="label">${x(n.data("label"))}</data><data key="type">${x(n.data("type"))}</data></node>`).join("");
    const edges = cy.edges(":visible").map((e) => `<edge source="${x(e.source().id())}" target="${x(e.target().id())}"><data key="etype">${x(e.data("type"))}</data><data key="weight">${e.data("weight") || 1}</data></edge>`).join("");
    dl("wildtrace-chart.graphml", new Blob([`<?xml version="1.0" encoding="UTF-8"?><graphml xmlns="http://graphml.graphdrawing.org/xmlns"><key id="label" for="node" attr.name="label" attr.type="string"/><key id="type" for="node" attr.name="type" attr.type="string"/><key id="etype" for="edge" attr.name="type" attr.type="string"/><key id="weight" for="edge" attr.name="weight" attr.type="int"/><graph edgedefault="directed">${nodes}${edges}</graph></graphml>`], { type: "application/xml" })); });
  if (focus) setTimeout(() => {
    const n = cy.getElementById(focus);
    if (n.length) { n.select(); const keep = n.closedNeighborhood().closedNeighborhood(); cy.elements().not(keep).addClass("faded"); cy.animate({ fit: { eles: keep, padding: 80 } }, { duration: 500 }); }
  }, 900);
  return cy;
}

// ------------------------------------------------------------------ your data (importer)
const SAMPLE = [
  ["source", "source_type", "target", "target_type", "link_type", "date", "source_lat", "source_lon"],
  ["Trader A (fictional)", "Person", "Phone 01 (fictional)", "Phone", "uses", "2026-06-02", "6.52", "3.38"],
  ["Trader A (fictional)", "Person", "Shipment S-1 (fictional)", "Shipment", "sends", "2026-06-04", "6.52", "3.38"],
  ["Shipment S-1 (fictional)", "Shipment", "Pangolin", "Species", "contains", "2026-06-04", "", ""],
  ["Shipment S-1 (fictional)", "Shipment", "Courier B (fictional)", "Person", "carried_by", "2026-06-05", "", ""],
  ["Courier B (fictional)", "Person", "Phone 02 (fictional)", "Phone", "uses", "2026-06-05", "", ""],
  ["Phone 01 (fictional)", "Phone", "Phone 02 (fictional)", "Phone", "called", "2026-06-05", "", ""],
  ["Courier B (fictional)", "Person", "Buyer C (fictional)", "Person", "delivers_to", "2026-06-09", "21.03", "105.85"],
  ["Buyer C (fictional)", "Person", "Front Co. D (fictional)", "Organisation", "director_of", "2026-01-15", "21.03", "105.85"],
];

function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  const delim = (text.split("\n")[0].match(/;/g) || []).length > (text.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}

export function mountImport(root, { onLocalChange } = {}) {
  let rows = null, name = "";
  const draw = () => {
    const head = rows?.[0] || [];
    const opt = (sel, allowNone = true) => `${allowNone ? `<option value="">(none)</option>` : ""}${head.map((h, i) => `<option value="${i}" ${sel(h) ? "selected" : ""}>${esc(h)}</option>`).join("")}`;
    const guess = (...ks) => (h) => ks.some((k) => String(h).toLowerCase().replace(/[^a-z]/g, "") === k);
    const typeSel = (id, g) => `<select id="${id}">${opt(g)}</select><select id="${id}-fixed">${Object.keys(TYPES).map((t) => `<option ${t === "Person" ? "selected" : ""}>${t}</option>`).join("")}</select>`;
    root.innerHTML = `<div class="imp">
      <div>
        <h3 style="font:650 17px/1.2 var(--display);margin:0 0 6px">Chart your own data</h3>
        <p class="muted" style="margin:0 0 12px;font-size:13px">Load a spreadsheet of links (one row per relationship) or entities. Map its columns, and WildTrace adds them to the link chart and, if rows carry coordinates, to the globe. Nothing leaves this browser.</p>
        <label class="drop" id="drop" tabindex="0"><input type="file" id="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.json" hidden>
          <b>${rows ? esc(name) : "Drop a CSV, Excel or JSON file"}</b><div class="muted" style="font-size:12.5px;margin-top:4px">${rows ? `${rows.length - 1} rows · ${head.length} columns` : "or click to choose one"}</div></label>
        <div class="row" style="margin-top:10px"><button class="btn" id="sample">Load fictional sample</button>
          <button class="btn" id="clear-local">Clear my local data</button><span class="muted" style="font-size:12px">${local.elements.filter((e) => e.group === "nodes").length} of your entities stored locally</span></div>
        ${rows ? `<div class="preview" style="margin-top:12px"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
          <tbody>${rows.slice(1, 9).map((r) => `<tr>${head.map((_, i) => `<td>${esc(r[i] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}
      </div>
      <div>${rows ? `
        <h3 style="font:650 15px/1.2 var(--display);margin:0 0 10px">Map columns</h3>
        <div class="map-grid">
          <span>Each row is</span><select id="mode"><option value="links">a link between two entities</option><option value="entities">one entity</option></select>
          <span>Source / entity</span><select id="c-src">${opt(guess("source", "from", "label", "name", "entity"), false)}</select>
          <span>Source type</span><span class="row">${typeSel("c-stype", guess("sourcetype", "type", "entitytype"))}</span>
          <span class="lk">Target</span><select class="lk" id="c-tgt">${opt(guess("target", "to"))}</select>
          <span class="lk">Target type</span><span class="row lk">${typeSel("c-ttype", guess("targettype"))}</span>
          <span class="lk">Link type</span><span class="row lk"><select id="c-ltype">${opt(guess("linktype", "relationship", "relation", "link"))}</select><input type="text" id="c-ltype-fixed" value="linked" aria-label="Default link type" style="width:110px"></span>
          <span>Date</span><select id="c-date">${opt(guess("date", "when", "time"))}</select>
          <span>Latitude</span><select id="c-lat">${opt(guess("lat", "latitude", "sourcelat", "y"))}</select>
          <span>Longitude</span><select id="c-lon">${opt(guess("lon", "lng", "longitude", "sourcelon", "x"))}</select>
        </div>
        <p class="muted" style="font-size:12px">Type columns override the fixed type when they hold a known type (Person, Phone, Account, Vehicle, Organisation, Shipment, Location, Species…). Other columns are kept as attributes.</p>
        <div class="row" style="margin-top:12px"><button class="btn violet" id="add">Add to chart and map</button><span class="muted" id="imp-msg" style="font-size:12.5px"></span></div>`
        : `<div class="prose" style="padding:0"><h3 style="margin-top:0">What you can do here</h3>
          <p>Rebuild a network from a case file or a public investigation. People, phones, accounts, vehicles, companies and shipments sit next to the public cases, species and places.</p>
          <p>Then use the chart tools: shortest path between two suspects, who brokers between groups (betweenness), and communities. Export to GraphML for Gephi, or CSV in the same layout i2 Analyst's Notebook imports.</p>
          <p class="muted">WildTrace's public data never contains people. Yours stays on this device.</p></div>`}
      </div></div>`;
    const drop = root.querySelector("#drop"), file = root.querySelector("#file");
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); read(e.dataTransfer.files[0]); });
    file.addEventListener("change", () => read(file.files[0]));
    root.querySelector("#sample").addEventListener("click", () => { rows = SAMPLE; name = "Fictional sample: a courier network (invented names)"; draw(); });
    root.querySelector("#clear-local").addEventListener("click", (e) => {
      const b = e.currentTarget;
      if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Click again to clear"; setTimeout(() => { b.dataset.armed = ""; b.textContent = "Clear my local data"; }, 3000); return; }
      local.elements = []; store.save(local); onLocalChange?.(); draw();
    });
    if (!rows) return;
    const mode = root.querySelector("#mode");
    const syncMode = () => root.querySelectorAll(".lk").forEach((x) => (x.style.display = mode.value === "links" ? "" : "none"));
    if (!head.some((h) => /target|^to$/i.test(h))) mode.value = "entities";
    mode.addEventListener("input", syncMode); syncMode();
    root.querySelector("#add").addEventListener("click", () => {
      const v = (id) => root.querySelector(id)?.value;
      const col = (r, id) => (v(id) === "" || v(id) == null ? "" : String(r[+v(id)] ?? "").trim());
      const els = [], have = new Set(local.elements.map((e) => e.data.id));
      const node = (label, type, extra = {}) => {
        if (!label) return null;
        const id = slug(type, label);
        if (!have.has(id)) { els.push({ group: "nodes", data: { id, label, type, ...extra } }); have.add(id); }
        return id;
      };
      const used = new Set(["#c-src", "#c-tgt", "#c-stype", "#c-ttype", "#c-ltype", "#c-date", "#c-lat", "#c-lon"].map((i) => v(i)).filter((x) => x !== "" && x != null).map(Number));
      rows.slice(1).forEach((r, i) => {
        const attrs = Object.fromEntries(head.map((h, j) => [h, r[j]]).filter(([, x], j) => !used.has(j) && x !== "" && x != null));
        const st = col(r, "#c-stype") ? typeOf(col(r, "#c-stype")) : v("#c-stype-fixed");
        const geo = { lat: col(r, "#c-lat"), lon: col(r, "#c-lon"), date: col(r, "#c-date") };
        const a = node(col(r, "#c-src"), st, mode.value === "entities" ? { ...geo, ...attrs } : geo);
        if (mode.value !== "links") return;
        const tt = col(r, "#c-ttype") ? typeOf(col(r, "#c-ttype")) : v("#c-ttype-fixed");
        const b = node(col(r, "#c-tgt"), tt);
        if (a && b) els.push({ group: "edges", data: { id: `l${Date.now()}_${i}`, source: a, target: b, type: col(r, "#c-ltype") || v("#c-ltype-fixed") || "linked",
          weight: 1, first: col(r, "#c-date"), ...attrs } });
      });
      local.elements.push(...els); store.save(local);
      const msg = `Added ${els.filter((e) => e.group === "nodes").length} entities and ${els.filter((e) => e.group === "edges").length} links. Stored in this browser only; open Link chart to explore them.`;
      onLocalChange?.();
      draw();
      root.querySelector("#imp-msg").textContent = msg;
    });
  };
  const read = async (f) => {
    if (!f) return;
    name = f.name;
    try {
      if (/\.xlsx?$/i.test(f.name)) {
        if (!window.XLSX) throw new Error("The Excel reader is still loading; try again in a moment.");
        const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
      } else if (/\.json$/i.test(f.name)) {
        const j = JSON.parse(await f.text());
        if (j.elements) { local.elements.push(...j.elements); store.save(local); onLocalChange?.(); rows = null; draw(); return; }
        const arr = Array.isArray(j) ? j : j.rows || [];
        const keys = [...new Set(arr.flatMap((o) => Object.keys(o)))];
        rows = [keys, ...arr.map((o) => keys.map((k) => o[k] ?? ""))];
      } else rows = parseCSV(await f.text());
    } catch (e) { rows = null; root.querySelector("#drop b").textContent = `Could not read ${f.name}: ${e.message}`; return; }
    draw();
  };
  draw();
}
