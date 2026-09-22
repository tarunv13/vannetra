// WildTrace: one map, everything else floats on it.
import { esc } from "./charts.js";
import { arc, createGlobe, KIND } from "./globe.js";
import { render as renderInspector, title } from "./inspector.js";
import { local, localEntity, localPoints, mountChart, mountImport } from "./investigate.js";
import { renderPulse } from "./pulse.js";
import { mountSearch } from "./search.js";
import { mountAbout, mountMethods, mountNetwork, mountTable } from "./sheets.js";
import { renderTimeline } from "./timeline.js";
import { S, back, closeTrail, emit, filtered, fromHash, fwd, go, load, loadGraph, on } from "./store.js";

const $ = (s) => document.querySelector(s);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const libs = {};
const lib = (src) => (libs[src] ||= new Promise((ok, fail) => { const e = document.createElement("script"); e.src = src; e.onload = ok; e.onerror = fail; document.head.append(e); }));
const toast = (msg) => { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 2600); };

// ------------------------------------------------------------------ map layers from state
let globe = null;
function caseGeo(cs) {
  return { type: "FeatureCollection", features: cs.filter((c) => c.place).map((c) => ({ type: "Feature",
    properties: { id: c.id, kind: c.kind, kg: KIND(c.kind), date: c.date, summary: c.summary, n_sources: c.n_sources, basis: c.place_basis || "text",
      level: c.place.type, ver: c.verification || "single" },
    geometry: { type: "Point", coordinates: [c.place.lon, c.place.lat] } })) };
}
function routeGeo(cs) {
  const agg = {};
  cs.forEach((c) => { if (c.route_coords?.[0] && c.route_coords?.[1]) { const k = c.route.join("→"); (agg[k] ||= { n: 0, c }).n++; } });
  return { type: "FeatureCollection", features: Object.entries(agg).map(([k, { n, c }]) => ({ type: "Feature",
    properties: { label: `${c.route[0]} → ${c.route[1]}`, n }, geometry: { type: "LineString", coordinates: arc(c.route_coords[0], c.route_coords[1]) } })) };
}
function obsGeo() {
  return { type: "FeatureCollection", features: (S.data.obs.observatories || []).filter((o) => o.hq).map((o) => ({ type: "Feature",
    properties: { id: o.id, name: o.name.split(" (")[0], city: o.hq.city }, geometry: { type: "Point", coordinates: [o.hq.lon, o.hq.lat] } })) };
}
function drawMap() {
  if (!globe?.map.getSource("cases")) return;
  const cs = filtered();
  const geo = caseGeo(cs);
  globe.set("cases", geo);
  globe.set("heat", geo);
  globe.set("routes", routeGeo(cs));
  globe.set("obs", obsGeo());
  globe.set("mine", localPoints());
  Object.entries(S.layers).forEach(([k, v]) => globe.visible(k === "cases" ? "cases" : k === "observatories" ? "obs" : k, v));
  $("#n-cases").textContent = cs.length;
  const nr = routeGeo(cs).features.length;
  $("#n-routes").textContent = nr;
  // A layer with nothing in it only advertises a gap: the Routes toggle appears once a report states a route.
  document.querySelector('[data-layer="routes"]').hidden = !S.data.cases.some((c) => c.route_coords);
  $("#n-obs").textContent = obsGeo().features.length;
  const mine = localPoints().features.length;
  $("#lens-mine").hidden = !local.elements.length;
  $("#n-mine").textContent = mine || local.elements.filter((e) => e.group === "nodes").length;
}

// ------------------------------------------------------------------ inspector + navigation
let autoFolded = false;
function drawInspector() {
  const item = S.trail[S.pos];
  const was = document.body.classList.contains("inspecting");
  document.body.classList.toggle("inspecting", !!item);
  $("#inspector").classList.toggle("on", !!item);
  // On narrower desktops, fold the summary while a record is open so the map keeps room.
  if (item && !was && innerWidth < 1600 && innerWidth >= 860 && !$("#pulse").classList.contains("folded")) { $("#pulse").classList.add("folded"); autoFolded = true; }
  if (!item && autoFolded) { $("#pulse").classList.remove("folded"); autoFolded = false; }
  if (!item) { globe?.highlight(null); return; }
  renderInspector(item, $("#insp-body"), { act, entity: localEntity });
  // Move keyboard and screen-reader focus to the record that just opened.
  const h = $("#insp-body .title");
  if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  $("#back").disabled = S.pos <= 0; $("#fwd").disabled = S.pos >= S.trail.length - 1;
  const start = Math.max(0, S.pos - 3);
  $("#crumbs").innerHTML = S.trail.slice(start, S.pos + 1).map((t, i) =>
    `${i ? "<span aria-hidden='true'>›</span>" : ""}<button data-i="${start + i}" aria-current="${start + i === S.pos}">${esc(title(t))}</button>`).join("");
  $("#crumbs").querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => { S.pos = +b.dataset.i; emit("nav"); }));
  // the map follows the reader
  if (item.kind === "case") {
    const c = S.data.byId[item.id];
    globe?.highlight(item.id);
    globe?.spin(false);
    if (c?.place) globe?.fly([c.place.lon, c.place.lat], c.place.type === "country" ? 3.2 : c.place.type === "state" ? 4.6 : 6.2);
    else toast("Not on the map: no report names a place for this case");
  } else {
    globe?.highlight(null);
    if (item.kind === "country") {
      const pts = S.data.cases.filter((c) => c.place?.country === item.id).map((c) => [c.place.lon, c.place.lat]);
      const cc = S.data.countries[item.id];
      if (pts.length > 1) globe?.fit(pts.reduce((b, p) => [[Math.min(b[0][0], p[0]), Math.min(b[0][1], p[1])], [Math.max(b[1][0], p[0]), Math.max(b[1][1], p[1])]], [pts[0], pts[0]]));
      else if (cc) globe?.fly([cc.lon, cc.lat], 4);
    }
    if (item.kind === "obs") {
      const o = S.data.obsById[item.id];
      if (o?.hq) { if (!S.layers.observatories) setLayer("observatories", true); globe?.fly([o.hq.lon, o.hq.lat], 5); }
    }
    if (item.kind === "species") {
      const pts = S.data.cases.filter((c) => c.species.includes(item.id) && c.place).map((c) => [c.place.lon, c.place.lat]);
      if (pts.length > 1) globe?.fit(pts.reduce((b, p) => [[Math.min(b[0][0], p[0]), Math.min(b[0][1], p[1])], [Math.max(b[1][0], p[0]), Math.max(b[1][1], p[1])]], [pts[0], pts[0]]));
    }
    if (item.kind === "entity") {
      const e = localEntity(item.id);
      if (e && e.lat !== "" && isFinite(+e.lat)) globe?.fly([+e.lon, +e.lat], 6);
    }
  }
}
function act(what, item) {
  if (what === "copy") { navigator.clipboard?.writeText(location.href).then(() => toast("Link copied"), () => toast(location.href)); }
  if (what === "chart") openSheet("investigate", "chart", `case:${item.id}`);
  if (what === "chart-entity") openSheet("investigate", "chart", item.id);
  if (what === "network") openSheet("network");
  if (what === "filter-species") { S.filters.species = new Set([item.id]); emit("filters"); toast("Map filtered to this species group"); }
  if (what === "filter-country") { S.filters.countries = new Set([item.id]); emit("filters"); toast("Map filtered to this country"); }
}

// ------------------------------------------------------------------ sheets
const SHEETS = {
  table: { title: "All cases", tabs: [] },
  about: { title: "About WildTrace", tabs: [] },
  investigate: { title: "Investigate", tabs: [["chart", "Link chart"], ["import", "Your data"]] },
  network: { title: "The observatory network", tabs: [] },
  methods: { title: "Methods", tabs: [["pipeline", "Pipeline"], ["model", "Classifier"], ["privacy", "Privacy"], ["sources", "Sources"]] },
};
let sheetOpen = null;
function openSheet(kind, tab, focus) {
  const def = SHEETS[kind];
  sheetOpen = kind;
  $("#sheet-title").textContent = def.title;
  const t = tab || def.tabs[0]?.[0];
  $("#sheet-tabs").innerHTML = def.tabs.map(([k, l]) => `<button role="tab" aria-selected="${k === t}" data-t="${k}">${l}</button>`).join("");
  $("#sheet-tabs").querySelectorAll("[data-t]").forEach((b) => b.addEventListener("click", () => openSheet(kind, b.dataset.t)));
  const body = $("#sheet-body");
  body.innerHTML = "";
  if (kind === "investigate") {
    body.innerHTML = `<div class="skeleton" style="margin:18px;height:60%"></div>`;
    // The graph engine (134 KB), the Excel reader (269 KB) and the chart data load only when needed.
    Promise.all([lib("https://cdn.jsdelivr.net/npm/cytoscape@3.34.3/dist/cytoscape.min.js"), loadGraph(),
      t === "import" ? lib("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js") : null]).then(() => {
      if (sheetOpen !== "investigate") return;
      body.innerHTML = "";
      if (t === "chart") mountChart(body, { focus });
      else mountImport(body, { onLocalChange: () => { drawMap(); toast("Your data is on the chart and the map"); } });
    });
  }
  if (kind === "table") mountTable(body);
  if (kind === "about") mountAbout(body);
  if (kind === "network") mountNetwork(body);
  if (kind === "methods") mountMethods(body, t);
  $("#sheet").classList.add("on");
  document.querySelectorAll("[data-sheet]").forEach((b) => b.setAttribute("aria-expanded", String(b.dataset.sheet === kind)));
}
function closeSheet() { $("#sheet").classList.remove("on"); sheetOpen = null; document.querySelectorAll("[data-sheet]").forEach((b) => b.setAttribute("aria-expanded", "false")); }

// ------------------------------------------------------------------ glide through time
let gliding = null;
function glide() {
  if (gliding) { clearTimeout(gliding); gliding = null; $("#play").innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`; return; }
  const stops = filtered().filter((c) => c.place && c.date).sort((a, b) => a.date.localeCompare(b.date));
  if (!stops.length) { toast("No dated, located cases in view"); return; }
  let i = 0;
  $("#play").innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>`;
  const step = () => {
    if (i >= stops.length) { gliding = null; $("#play").innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`; return; }
    go({ kind: "case", id: stops[i++].id }, { replace: i > 1 });
    gliding = setTimeout(step, reduced() ? 6000 : 4200);
  };
  step();
}

// ------------------------------------------------------------------ layers
function setLayer(k, v) {
  S.layers[k] = v;
  document.querySelector(`[data-layer="${k}"]`)?.setAttribute("aria-pressed", String(v));
  drawMap();
}

// ------------------------------------------------------------------ boot
async function boot() {
  await load();
  globe = createGlobe($("#globe"), {
    onPick: (item) => go(item),
    onReady: () => { drawMap(); drawInspector(); setTimeout(() => $("#boot").classList.add("done"), 250); },
  });
  // Never let a slow tile server trap the page behind the splash.
  setTimeout(() => $("#boot").classList.add("done"), 6000);
  mountSearch($("#omni"), $("#q"), $("#omni-results"));
  renderPulse($("#pulse-body")); renderTimeline($("#tl"));
  on((what) => {
    if (what === "filters") { renderPulse($("#pulse-body")); renderTimeline($("#tl")); drawMap(); }
    if (what === "nav") drawInspector();
  });
  document.querySelectorAll("[data-layer]").forEach((b) => b.addEventListener("click", () => setLayer(b.dataset.layer, b.getAttribute("aria-pressed") !== "true")));
  document.querySelectorAll("[data-sheet]").forEach((b) => b.addEventListener("click", () => (sheetOpen === b.dataset.sheet ? closeSheet() : openSheet(b.dataset.sheet))));
  $("#sheet-close").addEventListener("click", closeSheet);
  $("#back").addEventListener("click", back); $("#fwd").addEventListener("click", fwd); $("#close").addEventListener("click", closeTrail);
  $("#fold").addEventListener("click", () => { const f = $("#pulse").classList.toggle("folded"); $("#fold").setAttribute("aria-expanded", String(!f)); });
  $("#proj").addEventListener("click", () => toast(globe?.toggleProjection() ? "Globe" : "Flat map"));
  $("#world").addEventListener("click", () => globe?.world());
  $("#spin").addEventListener("click", () => { globe?.spin(!globe.spinning); $("#spin").setAttribute("aria-pressed", String(!!globe?.spinning)); });
  $("#legend-toggle").addEventListener("click", () => { const l = $(".legend"); l.hidden = !l.hidden; $("#legend-toggle").setAttribute("aria-pressed", String(!l.hidden)); });
  addEventListener("wildtrace:open", (e) => openSheet(e.detail));
  if (/^#(table|about|network|methods|investigate)$/.test(location.hash)) openSheet(location.hash.slice(1));
  $("#home").addEventListener("click", (e) => { e.preventDefault(); closeTrail(); closeSheet(); globe?.world(); });
  $("#play").addEventListener("click", glide);
  $("#range-reset").addEventListener("click", () => { S.filters.range = null; emit("filters"); });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (sheetOpen) closeSheet(); else if (S.trail.length) closeTrail(); }
    if (/input|textarea|select/i.test(document.activeElement?.tagName)) return;
    if (e.key === "[" || (e.altKey && e.key === "ArrowLeft")) back();
    if (e.key === "]" || (e.altKey && e.key === "ArrowRight")) fwd();
  });
  addEventListener("popstate", () => { const h = fromHash(); if (h) go(h, { replace: true }); else { S.trail = []; S.pos = -1; emit("nav"); } });
  const h = fromHash();
  if (h) go(h);
}
boot();
