// VanNetra front end. Static, no build step: hash router + views over web/data/*.json.
import { columns, esc, fmt, hbars, split } from "./charts.js";
import { caseMap, flyToCase, glide, KIND_COLOR, KIND_GROUP, KIND_LABEL, routeMap, setCases } from "./map.js";
import { countUp, reduced, stagger, tabThumb, transition } from "./motion.js";
import { viewNetwork as renderNetwork } from "./network.js";
import { mountWorkbench } from "./workbench.js";

const main = document.getElementById("main");
const D = {};
const FILES = ["meta", "stats", "cases", "species", "sources", "model_report", "trade_signals", "observatories", "codewords"];

async function load() {
  await Promise.all(FILES.map(async (f) => {
    try { D[f] = await (await fetch(`data/${f}.json`, { cache: "no-cache" })).json(); } catch { D[f] = null; }
  }));
  try { D.geo = await (await fetch("data/cases.geojson")).json(); } catch { D.geo = { type: "FeatureCollection", features: [] }; }
  D.cases ||= []; D.species ||= {}; D.stats ||= { kpi: {} };
  D.byId = Object.fromEntries(D.cases.map((c) => [c.id, c]));
  const m = D.meta;
  document.getElementById("build-meta").textContent = m ? `Build ${m.built} · ${fmt(m.records_seen)} records screened · window ${m.window?.[0] || "?"} to ${m.window?.[1] || "?"}` : "";
}
const spLabel = (id) => D.species[id]?.label || id;
const kindPill = (k) => `<span class="pill k-${KIND_GROUP(k)}"><span class="dot"></span>${esc(KIND_LABEL[KIND_GROUP(k)])}</span>`;
const inr = (v) => (v == null ? "–" : v >= 1e7 ? `₹${(v / 1e7).toFixed(1)} crore` : v >= 1e5 ? `₹${(v / 1e5).toFixed(1)} lakh` : `₹${fmt(v)}`);
const hero = (eyebrow, title, lede) => `<div class="hero"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="lede">${lede}</p></div>`;
const caseRow = (c) => `<button class="row-item" data-case="${c.id}">
  <span class="date">${esc(c.date || "undated")}</span>
  <span><div class="title">${esc(c.summary)}</div><div class="sub">${esc([c.agencies.slice(0, 2).join(", "), `${c.n_sources} source${c.n_sources > 1 ? "s" : ""}`].filter(Boolean).join(" · "))}</div></span>
  ${kindPill(c.kind)}</button>`;
const bindCases = (el) => el.querySelectorAll("[data-case]").forEach((b) => b.addEventListener("click", () => openCase(b.dataset.case)));

// ------------------------------------------------------------------ Overview
function viewOverview() {
  const k = D.stats.kpi || {};
  main.innerHTML = `<div class="view">
    ${hero("Observatory · India & Southeast Asia", "Where wildlife is seized, and what it tells us about the trade.",
      "Enforcement events extracted from open news and official releases, mapped and linked. Every case links back to its public sources. No accused person is ever named here.")}
    <div class="grid g-4">
      ${[["Cases", k.cases, "clustered from " + fmt(k.sources) + " reports", "var(--cases)"],
         ["Species groups", k.species_groups, "of " + Object.keys(D.species).length + " tracked", "var(--species)"],
         ["Countries", k.countries, "where cases were located", "var(--overview)"],
         ["CITES Appendix I", k.appendix_I_cases, "cases involving App. I groups", "var(--trade)"]]
        .map(([t, v, d, c]) => `<div class="stat glass" style="--c:${c}"><div class="k">${t}</div><div class="v" data-count="${v ?? ""}">${fmt(v)}</div><div class="d">${d}</div><div class="bar"></div></div>`).join("")}
    </div>
    <div class="grid g-main" style="margin-top:16px">
      <div class="glass map-wrap" style="position:relative" id="map-host"><div id="map" class="map" role="region" aria-label="Map of cases"></div>
        <button class="btn primary" id="glide" style="position:absolute;top:20px;left:20px;z-index:3" ${D.geo.features.length ? "" : "disabled"}>▶ Glide through cases</button>
        <div class="map-legend glass">${Object.entries(KIND_LABEL).map(([g, l]) => `<div class="row"><span class="sw" style="background:${KIND_COLOR[g]}"></span>${l}</div>`).join("")}
          <div class="row muted"><span class="sw" style="background:rgba(28,92,171,.16);box-shadow:0 0 0 1.5px #1c5cab"></span>Cluster (click to zoom)</div></div></div>
      <div class="glass card"><div class="card-head"><h2>Latest cases</h2><a href="#/cases" class="small">All cases →</a></div><div class="list" id="latest"></div></div>
    </div>
    <div class="grid g-2" style="margin-top:16px">
      <div class="glass card"><div class="card-head"><h2>Cases per month</h2><span class="muted">by first report date</span></div><div id="c-month"></div></div>
      <div class="glass card"><div class="card-head"><h2>Species groups</h2><span class="muted">cases involving each</span></div><div id="c-species"></div></div>
      <div class="glass card"><div class="card-head"><h2>Where</h2><span class="muted">state / country</span></div><div id="c-region"></div></div>
      <div class="glass card"><div class="card-head"><h2>Who acted</h2><span class="muted">agencies named in reports</span></div><div id="c-agency"></div></div>
    </div></div>`;
  const latest = main.querySelector("#latest");
  latest.innerHTML = D.cases.slice(0, 9).map(caseRow).join("") || `<div class="empty">No cases yet. Run <span class="mono">vannetra run</span>.</div>`;
  bindCases(latest);
  const map = caseMap(main.querySelector("#map"), D.geo, { onSelect: openCase });
  const gbtn = main.querySelector("#glide");
  gbtn.addEventListener("click", () => {
    // Oldest to newest: the tour tells the period's story in order.
    const stops = [...D.geo.features].sort((a, b) => (a.properties.date || "").localeCompare(b.properties.date || "")).slice(-15);
    gbtn.hidden = true;
    glide(map, stops, main.querySelector("#map-host"), { onOpen: openCase, onEnd: () => (gbtn.hidden = false) });
  });
  main.querySelectorAll("[data-count]").forEach((el) => el.dataset.count !== "" && countUp(el, +el.dataset.count));
  const s = D.stats;
  columns(main.querySelector("#c-month"), Object.entries(s.by_month || {}).map(([label, value]) => ({ label, value })), { color: "var(--overview)" });
  hbars(main.querySelector("#c-species"), Object.entries(s.by_species || {}).map(([k, v]) => ({ label: spLabel(k), value: v, key: k, note: "cases" })),
    { color: "var(--species)", onClick: (r) => go(`#/cases?species=${r.key}`) });
  hbars(main.querySelector("#c-region"), Object.entries(s.by_region || {}).map(([k, v]) => ({ label: k, value: v, note: "cases" })), { color: "var(--overview)" });
  hbars(main.querySelector("#c-agency"), Object.entries(s.by_agency || {}).map(([k, v]) => ({ label: k, value: v, note: "cases" })), { color: "var(--work)" });
}

// --------------------------------------------------------------------- Cases
function viewCases(params) {
  const opts = (arr) => arr.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("");
  const species = Object.keys(D.stats.by_species || {});
  const countries = [...new Set(D.cases.map((c) => c.place?.country).filter(Boolean))].sort();
  const years = [...new Set(D.cases.map((c) => (c.date || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  main.innerHTML = `<div class="view">
    ${hero("Enforcement cases", "Seizures, arrests and convictions, one record per incident.",
      "Several news reports about the same incident are merged into one case. Confidence rises with independent sources, a named place and a stated quantity.")}
    <div class="filters glass" role="search">
      <input type="search" id="f-q" placeholder="Search place, species, agency…" aria-label="Search cases">
      <select id="f-sp" aria-label="Species"><option value="">All species</option>${opts(species.map((s) => [s, spLabel(s)]))}</select>
      <select id="f-kind" aria-label="Kind"><option value="">All kinds</option>${opts(Object.entries(KIND_LABEL))}</select>
      <select id="f-c" aria-label="Country"><option value="">All countries</option>${opts(countries.map((c) => [c, c]))}</select>
      <select id="f-y" aria-label="Year"><option value="">All years</option>${opts(years.map((y) => [y, y]))}</select>
      <span style="flex:1"></span>
      <span class="small muted" id="f-n"></span>
      <button class="btn" id="f-csv">Export CSV</button>
    </div>
    <div class="grid g-main">
      <div class="glass card"><div class="list" id="case-list"></div></div>
      <div class="glass map-wrap" style="position:sticky;top:90px;align-self:start"><div id="map" class="map" style="height:560px"></div></div>
    </div></div>`;
  if (params.get("species")) main.querySelector("#f-sp").value = params.get("species");
  const map = caseMap(main.querySelector("#map"), D.geo, { onSelect: openCase, zoom: 3.1 });
  let shown = [];
  const apply = () => {
    const q = main.querySelector("#f-q").value.toLowerCase(), sp = main.querySelector("#f-sp").value,
      kd = main.querySelector("#f-kind").value, co = main.querySelector("#f-c").value, yr = main.querySelector("#f-y").value;
    shown = D.cases.filter((c) => (!sp || c.species.includes(sp)) && (!kd || KIND_GROUP(c.kind) === kd) && (!co || c.place?.country === co) &&
      (!yr || (c.date || "").startsWith(yr)) && (!q || JSON.stringify([c.summary, c.places, c.agencies, c.species.map(spLabel)]).toLowerCase().includes(q)));
    const el = main.querySelector("#case-list");
    el.innerHTML = shown.slice(0, 300).map(caseRow).join("") || `<div class="empty">No cases match these filters.</div>`;
    el.querySelectorAll("[data-case]").forEach((b) => b.addEventListener("click", () => {
      const f = D.geo.features.find((x) => x.properties.id === b.dataset.case);
      if (f) flyToCase(map, f);
      setTimeout(() => openCase(b.dataset.case), f && !reduced() ? 450 : 0);
    }));
    main.querySelector("#f-n").textContent = `${fmt(shown.length)} of ${fmt(D.cases.length)} cases`;
    const ids = new Set(shown.map((c) => c.id));
    const upd = () => setCases(map, { ...D.geo, features: D.geo.features.filter((f) => ids.has(f.properties.id)) });
    map?.loaded() ? upd() : map?.once("load", () => setTimeout(upd, 50));
  };
  main.querySelectorAll(".filters input, .filters select").forEach((e) => e.addEventListener("input", apply));
  main.querySelector("#f-csv").addEventListener("click", () => {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const rows = [["id", "date", "kind", "summary", "species", "place", "country", "lat", "lon", "agencies", "quantity", "unit", "value_inr", "people_arrested", "n_sources", "confidence", "source_urls"]];
    shown.forEach((c) => rows.push([c.id, c.date, c.kind, c.summary, c.species.join(";"), c.place?.name, c.place?.country, c.place?.lat, c.place?.lon, c.agencies.join(";"),
      c.quantity?.value, c.quantity?.unit, c.value_inr, c.people_arrested, c.n_sources, c.confidence, c.sources.map((s) => s.url).join(" ")]));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" })); a.download = "vannetra-cases.csv"; a.click();
  });
  apply();
}

// ------------------------------------------------------------- Case report
function openCase(id) {
  const c = D.byId[id]; if (!c) return;
  const dr = document.getElementById("drawer"), scrim = document.getElementById("scrim");
  document.body.dataset.journey = "cases";
  const sp = c.species.map((s) => `<a class="pill" href="#/species" style="--c:var(--species)"><span class="dot"></span>${esc(spLabel(s))} <span class="cites ${String(D.species[s]?.cites || "").startsWith("I/") || D.species[s]?.cites === "I" ? "I" : ""}">CITES ${esc(D.species[s]?.cites || "–")}</span></a>`).join("");
  dr.innerHTML = `<button class="btn ghost close" aria-label="Close case report">✕</button>
    <div class="eyebrow">Case report · ${esc(c.id)}</div>
    <h2 style="font-size:24px;margin:10px 0 8px;letter-spacing:-.025em">${esc(c.summary)}</h2>
    <div class="chips">${kindPill(c.kind)}${sp}</div>
    <dl class="facts">
      <dt>First reported</dt><dd>${esc(c.date || "unknown")}</dd>
      <dt>Location</dt><dd>${c.place ? `${esc(c.place.name)}${c.place.admin1 && c.place.admin1 !== c.place.name ? ", " + esc(c.place.admin1) : ""} (${esc(c.place.country)})` : "not stated"}</dd>
      ${c.route?.length === 2 ? `<dt>Route</dt><dd>${esc(c.route[0])} → ${esc(c.route[1])}</dd>` : ""}
      <dt>Quantities</dt><dd>${(c.quantities || (c.quantity ? [c.quantity] : [])).map((q) => `${fmt(q.value)} ${esc(q.unit)}`).join(" · ") || "not stated"}</dd>
      <dt>Reported value</dt><dd>${inr(c.value_inr)}</dd>
      <dt>People arrested</dt><dd>${c.people_arrested ?? "not stated"} <span class="muted small">(count only, never names)</span></dd>
      <dt>Agencies</dt><dd>${esc(c.agencies.join(", ") || "not stated")}</dd>
      <dt>Transport</dt><dd>${esc(c.modes.join(", ") || "not stated")}</dd>
      <dt>Places mentioned</dt><dd>${esc(c.places.join(", ") || "–")}</dd>
      <dt>Confidence</dt><dd>${Math.round(c.confidence * 100)}% <span class="muted small">(sources, place and quantity present)</span></dd>
    </dl>
    <div class="section-title">Sources (${c.n_sources})</div>
    <div class="list">${c.sources.map((s) => `<a class="row-item" style="grid-template-columns:92px 1fr" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer nofollow"><span class="date">${esc(s.date || "")}</span><span class="title small">${esc(s.outlet || new URL(s.url).hostname)} ↗</span></a>`).join("")}</div>
    <div class="section-title">Investigate</div>
    <div class="chips"><a class="btn primary" href="#/workbench?focus=case:${esc(c.id)}">Open in workbench</a><a class="btn" href="#/cases?species=${esc(c.species[0] || "")}">Similar cases</a></div>
    <p class="small muted" style="margin-top:18px">Facts are extracted automatically from the linked public reports and can be wrong. Check the sources before citing. Report an error by opening an issue on the project repository.</p>`;
  dr.classList.add("on"); scrim.classList.add("on");
  const close = () => { dr.classList.remove("on"); scrim.classList.remove("on"); document.body.dataset.journey = current(); };
  dr.querySelector(".close").addEventListener("click", close); scrim.onclick = close;
  dr.querySelectorAll("a[href^='#']").forEach((a) => a.addEventListener("click", close));
  document.addEventListener("keydown", function esc_(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc_); } });
  dr.querySelector(".close").focus();
}

// ------------------------------------------------------------------- Species
const LANG = { en: "English", hi: "Hindi", hi_latn: "Hindi (Latin)", te: "Telugu", te_latn: "Telugu (Latin)", vi: "Vietnamese", id_ms: "Indonesian/Malay", th: "Thai" };
function viewSpecies() {
  const bySp = D.stats.by_species || {}, ts = D.trade_signals?.by_group || {};
  const groups = Object.entries(D.species).sort((a, b) => (bySp[b[0]] || 0) - (bySp[a[0]] || 0) || a[1].label.localeCompare(b[1].label));
  main.innerHTML = `<div class="view">
    ${hero("Species", "What is traded, and the words sellers use to sell it.",
      "Each group lists its CITES Appendix, the products seized, and the trade terms the pipeline searches for in 8 languages and scripts. Many come from WCS India's online-trade keyword sets.")}
    <div class="grid g-3">${groups.map(([id, g]) => `
      <article class="sp-card glass">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:10px"><h2 style="font-size:18px">${esc(g.label)}</h2><span class="cites ${g.cites === "I" || String(g.cites).startsWith("I/") ? "I" : ""}">CITES ${esc(g.cites || "not listed")}</span></div>
        <div class="small muted"><i>${esc(g.taxa.join(", "))}</i></div>
        <div class="small">Products: ${esc(g.products.join(", "))}</div>
        ${g.uses?.length ? `<div class="small">Intended uses in seizure records: ${esc(g.uses.join(", "))} <span class="muted">(PMC8579131)</span></div>` : ""}
        <div style="display:flex;gap:16px" class="small"><span><b style="font-size:20px">${fmt(bySp[id] || 0)}</b> cases</span>${ts[id] ? `<span><b style="font-size:20px">${fmt(ts[id].R)}</b> online listings flagged (WCS-OWT)</span>` : ""}</div>
        <div class="terms">${Object.entries(g.terms).filter(([lang]) => !lang.startsWith("pmc_")).flatMap(([lang, ts]) => ts.slice(0, 4).map((t) => `<span class="term" title="${esc(LANG[lang] || lang)}"><span class="lang">${esc(lang.replace("_latn", "·lat").replace("id_ms", "id/ms"))}</span>${esc(t)}</span>`)).join("")}</div>
        ${bySp[id] ? `<a class="small" href="#/cases?species=${id}">See ${fmt(bySp[id])} cases →</a>` : ""}
      </article>`).join("")}</div>
    <p class="small muted" style="margin-top:14px">CITES appendices are group-level labels (CoP19, 2022). Check the listing of a specific taxon or population on Species+ before citing it.</p></div>`;
}

// --------------------------------------------------------------------- Trade
function viewTrade() {
  const s = D.stats, gaz = {};
  D.cases.forEach((c) => { if (c.place) gaz[c.place.name] = c.place; });
  const routes = (s.routes || []).map((r) => ({ ...r, from: gaz[r.from] || null, to: gaz[r.to] || null, fn: r.from, tn: r.to }));
  const ts = D.trade_signals || {};
  main.innerHTML = `<div class="view">
    ${hero("Trade links · demand & supply", "How wildlife moves: routes, transport and online supply.",
      "Routes come from phrases like “bound for” and “from X to Y” in enforcement reports. Supply signals come from WCS-OWT's labelled online listings. Legal-trade flows appear once the CITES Trade Database is loaded.")}
    <div class="grid g-main">
      <div class="glass map-wrap"><div id="rmap" class="map"></div></div>
      <div class="glass card"><div class="card-head"><h2>Reported routes</h2><span class="muted">origin → destination</span></div>
        <div class="table-wrap"><table><thead><tr><th>From</th><th>To</th><th class="num">Cases</th></tr></thead><tbody>
        ${(s.routes || []).slice(0, 25).map((r) => `<tr><td>${esc(r.from)}</td><td>${esc(r.to)}</td><td class="num">${r.n}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">No routes extracted yet.</td></tr>`}
        </tbody></table></div></div>
    </div>
    <div class="grid g-3" style="margin-top:16px">
      <div class="glass card"><div class="card-head"><h2>Transport modes</h2></div><div id="c-mode"></div></div>
      <div class="glass card span-2"><div class="card-head"><h2>Online supply signals</h2><span class="muted">WCS-OWT labelled YouTube listings, n=${fmt(ts.n)}</span></div>
        <p class="small muted">Share of listings human coders marked as wildlife-trade (R) vs irrelevant (IR), per species group. Listings flagged R carried a phone number <b>${Math.round((ts.phone_in_R || 0) * 100)}%</b> of the time, against <b>${Math.round((ts.phone_in_IR || 0) * 100)}%</b> for IR. That gap is a sale signal the classifier uses. The numbers themselves are never stored or shown.</p>
        <div id="c-supply" class="grid g-2" style="gap:12px 24px;margin-top:12px"></div></div>
    </div>
    <div class="glass card" style="margin-top:16px"><div class="card-head"><h2>Live online listings</h2><span class="muted">${fmt(ts.live?.n || 0)} collected this build · YouTube metadata</span></div>
      <p class="small muted">Listings found by searching WCS-OWT seller phrases, then scored by the relevance classifier (threshold ${ts.live?.threshold != null ? ts.live.threshold.toFixed(2) : "–"}, tuned to keep 98% of trade listings). Only counts are published. Titles and channels stay on the analyst's machine. ${ts.live?.codeword_flags ? `${ts.live.codeword_flags} listing(s) hit the unverified codeword watchlist and are queued for human review.` : ""}</p>
      <div id="c-live"></div></div>
    <div class="glass card" style="margin-top:16px"><div class="card-head"><h2>Legal trade baseline (CITES)</h2><span class="muted" id="cites-state"></span></div><div id="cites"></div></div>
    </div>`;
  routeMap(main.querySelector("#rmap"), routes.filter((r) => r.from && r.to));
  hbars(main.querySelector("#c-mode"), Object.entries(s.by_mode || {}).map(([k, v]) => ({ label: k[0].toUpperCase() + k.slice(1), value: v, note: "cases" })), { color: "var(--trade)" });
  const sup = main.querySelector("#c-supply");
  Object.entries(ts.by_group || {}).filter(([k]) => k !== "unknown").sort((a, b) => b[1].R - a[1].R).slice(0, 8).forEach(([k, v]) => {
    const d = document.createElement("div"); sup.append(d);
    d.innerHTML = `<div class="small" style="font-weight:600;margin-bottom:6px">${esc(v.label)}</div><div></div>`;
    split(d.lastElementChild, v.R, v.IR, { la: "Trade (R)", lb: "Irrelevant (IR)", ca: "var(--trade)" });
  });
  hbars(main.querySelector("#c-live"), Object.entries(ts.live?.by_group || {}).filter(([k]) => k !== "unknown")
    .map(([k, v]) => ({ label: spLabel(k), value: v.flagged, note: `flagged as trade · ${v.not_flagged} not flagged` })).sort((a, b) => b.value - a.value), { color: "var(--trade)", max: 12 });
  fetch("data/cites_flows.json").then((r) => (r.ok ? r.json() : Promise.reject())).then((cf) => {
    const agg = {};
    cf.rows.forEach((r) => { const k = `${r.exporter} → ${r.importer}`; agg[k] = (agg[k] || 0) + r.shipments; });
    main.querySelector("#cites-state").textContent = `${fmt(cf.rows.length)} aggregated flows`;
    hbars(main.querySelector("#cites"), Object.entries(agg).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, note: "shipment records" })), { color: "var(--trade)", max: 15 });
  }).catch(() => {
    main.querySelector("#cites").innerHTML = `<div class="callout">Not loaded yet. Download the full CITES Trade Database from <a href="https://trade.cites.org/" target="_blank" rel="noopener">trade.cites.org</a>, unzip it, and run <span class="mono">vannetra cites &lt;folder&gt;</span>. Flows with source code <b>I</b> are confiscated or seized specimens.</div>`;
  });
}

// ---------------------------------------------------------------- Workbench
let cyInst = null;
async function viewWorkbench(params) {
  main.innerHTML = `<div class="view">${hero("Workbench · link analysis", "Chart the network behind the cases.",
    "An open alternative to i2 Analyst's Notebook: entities and typed links, centrality, communities, shortest paths, a time filter, and your own local data, all running in your browser.")}<div id="wb"></div></div>`;
  let graph = { elements: [] };
  try { graph = await (await fetch("data/graph.json")).json(); } catch { /* empty */ }
  cyInst = mountWorkbench(main.querySelector("#wb"), graph, { openCase });
  const f = params.get("focus");
  if (f && cyInst) setTimeout(() => {
    const n = cyInst.getElementById(f);
    if (n.length) { n.select(); const keep = n.closedNeighborhood().closedNeighborhood(); cyInst.elements().not(keep).addClass("faded"); cyInst.animate({ fit: { eles: keep, padding: 80 } }, { duration: 500 }); }
  }, 1200);
}

// ------------------------------------------------------------------ Methods
function viewSources() {
  const m = D.model_report || {}, t = m.test || {};
  const pct = (v) => (v == null ? "–" : `${(v * 100).toFixed(1)}%`);
  const accessLabel = { api: "API", rss: "Feed", bulk: "Bulk file", manual: "Manual", request: "On request", private: "Private" };
  main.innerHTML = `<div class="view">
    ${hero("Methods & sources", "Open data in, open code, and every number checkable.",
      "What the pipeline reads, how it decides what counts, how well it does, and what it will not publish.")}
    <div class="glass card"><div class="card-head"><h2>Pipeline</h2><span class="muted">python -m vannetra.cli run</span></div>
      <div class="flow">
        <div class="step"><b>Collect</b>GDELT, official feeds, opt-in Google News, YouTube via yt-dlp / Agent Reach</div>
        <div class="step"><b>Screen</b>Species lexicon (8 languages) × enforcement cues; listing classifier scores trade signals</div>
        <div class="step"><b>Extract</b>Species, place, route, quantity, value, agency, mode, arrest count, each with evidence text</div>
        <div class="step"><b>Merge</b>Reports of one incident become one case (species, region, ±4 days, title overlap)</div>
        <div class="step"><b>Link</b>Entity–link graph, degree, brokerage, communities; GraphML/CSV for i2, Gephi, Maltego</div>
        <div class="step"><b>Publish</b>Privacy gate blocks names, phones, handles and channels, then static JSON</div>
      </div></div>
    <div class="grid g-2" style="margin-top:16px">
      <div class="glass card"><div class="card-head"><h2>Relevance classifier</h2><span class="muted">${esc(m.best || "not trained")}</span></div>
        <p class="small">${esc(m.task || "")}. Trained on ${fmt(m.n)} WCS-OWT labelled items (${fmt(m.n_R)} R / ${fmt(m.n_IR)} IR). ${esc(m.protocol || "")}.</p>
        <div class="grid g-2" style="gap:10px;margin:12px 0">
          ${[["R recall (target " + pct(m.target_recall) + ")", t.recall_R], ["IR correctly rejected", t.recall_IR], ["Precision on R", t.precision_R], ["ROC-AUC", t.roc_auc]]
            .map(([k, v]) => `<div class="stat" style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.7);border:1px solid var(--line)"><div class="k">${k}</div><div class="v" style="font-size:26px">${k === "ROC-AUC" ? (v ?? "–") : pct(v)}</div></div>`).join("")}
        </div>
        <div class="callout small"><b>Reading this honestly:</b> the model keeps ≈${pct(t.recall_R)} of real trade listings on the locked test set, the "above 98% positives" target. At that setting it rejects ${pct(t.recall_IR)} of irrelevant ones. The 2022 notebook reported 43% on a random split with no seller grouping. The learning curve has flattened (${esc(m.saturation || "")}). The next gain comes from fixing contradictory labels in the review queue, not from more volume.</div>
        <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Candidate (cross-validated)</th><th class="num">R recall</th><th class="num">IR rejected</th><th class="num">PR-AUC</th></tr></thead><tbody>
          ${Object.entries(m.cv || {}).map(([k, v]) => `<tr><td>${esc(k)}${k === m.best ? " ✓" : ""}</td><td class="num">${pct(v.recall_R)}</td><td class="num">${pct(v.recall_IR)}</td><td class="num">${v.pr_auc}</td></tr>`).join("")}
        </tbody></table></div></div>
      <div class="glass card"><div class="card-head"><h2>Privacy & ethics</h2></div>
        <ul class="small" style="padding-left:18px;margin:0;display:grid;gap:8px">
          <li><b>No names of accused persons.</b> Cases are summarised from extracted facts, not headlines. People are counted, never named. They are presumed innocent, and India's DPDP Act 2023 applies.</li>
          <li><b>No contact details.</b> Phone numbers, e-mails, WhatsApp/Telegram links and handles are removed, and the publish step fails if any slip through.</li>
          <li><b>No seller identities.</b> YouTube channel names are used only to keep a seller's videos on one side of the train/test split. They are never a feature and never shown.</li>
          <li><b>No tracking.</b> No analytics, cookies or accounts. Workbench data you add stays in your browser.</li>
          <li><b>Sources respected.</b> robots.txt honoured, rate limits kept, feeds with personal-use terms are opt-in, and only derived facts are published, with links back.</li>
        </ul></div>
    </div>
    <div class="glass card" style="margin-top:16px"><div class="card-head"><h2>Source registry</h2><span class="muted">pipeline/vannetra/resources/sources.yaml</span></div>
      <div class="table-wrap"><table><thead><tr><th>Source</th><th>Access</th><th>Role</th><th>Status</th><th>Notes</th></tr></thead><tbody>
      ${(D.sources || []).map((s) => `<tr><td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}</td><td>${esc(accessLabel[s.access] || s.access)}</td><td class="small">${esc((s.role || []).join(", "))}</td>
        <td><span class="pill" style="--c:${s.enabled ? "var(--species)" : "#9aa3b2"}"><span class="dot"></span>${s.enabled ? "on" : "off"}</span></td><td class="small muted">${esc(s.notes || s.terms || "")}</td></tr>`).join("")}
      </tbody></table></div></div></div>`;
}

// -------------------------------------------------------------------- router
const viewNetwork = () => renderNetwork(main, D, hero);
const ROUTES = { overview: viewOverview, cases: viewCases, species: viewSpecies, trade: viewTrade, workbench: viewWorkbench, network: viewNetwork, sources: viewSources };
let placeThumb = () => {};
const current = () => (location.hash.replace(/^#\//, "").split("?")[0] || "overview");
const go = (h) => (location.hash = h);
function route() {
  const name = ROUTES[current()] ? current() : "overview";
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const labels = { overview: "Overview", cases: "Cases", species: "Species", trade: "Trade", workbench: "Workbench", network: "Network", sources: "Methods" };
  transition(() => {
    document.body.dataset.journey = name;
    document.querySelectorAll(".tab").forEach((t) => (t.dataset.j === name ? t.setAttribute("aria-current", "page") : t.removeAttribute("aria-current")));
    placeThumb();
    cyInst?.destroy?.(); cyInst = null;
    ROUTES[name](params);
    const v = main.querySelector(".view");
    if (v) { v.classList.add("stagger"); stagger(v, ":scope > *, :scope > .grid > .glass, :scope .grid > .sp-card, :scope .grid > .obs-card"); }
    scrollTo({ top: 0, behavior: "instant" });
    document.title = `${labels[name]} · VanNetra`;
  });
}
addEventListener("hashchange", route);
placeThumb = tabThumb(document.querySelector(".tabs"));
load().then(route);
