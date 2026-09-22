// Network view: the observatory registry (web/data/observatories.json) as a
// filterable directory, a stage map of where each observatory plugs into the
// pipeline, the principles VanNetra takes from them, and the codeword watchlist.
import { esc } from "./charts.js";
import { countUp, reduced } from "./motion.js";

const STATUS = {
  active: ["●", "Active"], prototype: ["◐", "Prototype"], restricted: ["◌", "Restricted"],
  "bot-blocked": ["◌", "Browser only"], offline: ["✕", "Offline"], unverified: ["?", "Unverified"],
};
const ROLE_LABEL = {
  ingest: "Automated feed", bulk: "Bulk dataset", lexicon: "Names & codewords", reference: "Reference",
  seed: "Case & network seeds", benchmark: "Benchmark", design: "Design pattern", report: "Report channel", governance: "Governance",
};
const STAGES = [["collect", "Collect"], ["screen", "Screen"], ["extract", "Extract"], ["link", "Link"], ["publish", "Publish"], ["design", "Design"], ["governance", "Governance"]];
const CAT_SHORT = { intelligence: "Intelligence", digital: "Online trade", legal: "Courts & law", trade: "Trade stats", reference: "Reference",
  tools: "Tools", crowd: "Public reporting", journalism: "Journalism", funding: "Funding" };
const PRINCIPLES = [
  ["Open code, closed operations", "Software, methods and aggregates are public. Patrol logs, informants and names are not. VanNetra publishes cases and counts, and keeps people and sellers local.", "From SMART and the NGO data-sharing model"],
  ["A machine ranks, a person decides", "Classifiers sort the flood and humans confirm. VanNetra's review queue and relabel loop work the same way.", "From ECO-SOLVE hubs and WILDTRADE"],
  ["Follow the logistics", "Transport mode, airport and route say more than a species list. Each case records mode and route.", "From C4ADS and ROUTES"],
  ["Follow the case to court", "A seizure is where a case starts. Arrest, charge and conviction are the outcome.", "From #WildEye, SHERLOC and Indian Kanoon"],
  ["Bridge source and demand", "Local names map to species, and species to end use, so a Telugu listing and a Vietnamese seizure can meet in one chart.", "From PMC8579131, EIA and Operation Jaguar"],
  ["Verify before you trust", "Several AI-supplied links and claims in this registry were wrong or overstated. Unverified codewords only flag items for review, and every correction is shown on its card.", "From building this registry"],
];

const statusPill = (st) =>
  `<span class="status ${esc(st.state)}" title="${esc(st.note || "")}">${STATUS[st.state]?.[0] || "·"} ${STATUS[st.state]?.[1] || esc(st.state)}</span>`;

export function viewNetwork(main, D, hero) {
  const reg = D.observatories || { observatories: [], categories: {} };
  const obs = reg.observatories;
  const n = (f) => obs.filter(f).length;
  const corrected = n((o) => /corrected|overstated|not 'all|did not resolve/i.test(o.status?.note || ""));
  const tiles = [
    ["Observatories & tools", obs.length, "in the registry", "var(--sources)"],
    ["Live and checked", n((o) => o.status.state === "active"), "responded as described", "var(--species)"],
    ["Feed the pipeline", n((o) => (o.vannetra.role || []).some((r) => ["ingest", "bulk", "lexicon"].includes(r))), "automated, bulk or lexicon", "var(--overview)"],
    ["Claims corrected", corrected, "wrong URLs or overstated scope", "var(--trade)"],
  ];
  main.innerHTML = `<div class="view">
    ${hero("The observatory network", "Nobody watches this trade alone.",
      "VanNetra sits inside a network of observatories, databases, codebooks and reporting apps. Each one is listed with what it does, whether it is live today, and how it feeds this project's pipeline, design and principles. Every entry was re-checked on 22 September 2026.")}
    <div class="grid g-4">${tiles.map(([t, v, d, c]) =>
      `<div class="stat glass" style="--c:${c}"><div class="k">${t}</div><div class="v" data-count="${v}">${v}</div><div class="d">${d}</div><div class="bar"></div></div>`).join("")}</div>

    <div class="glass card" style="margin-top:16px"><div class="card-head"><h2>Where each one plugs in</h2><span class="muted">pipeline stage → observatory · click to find its card</span></div>
      <div class="stage-map">${STAGES.map(([k, l]) => `<div class="stage-col"><h3>${l}</h3>${obs.filter((o) => (o.vannetra.stage || []).includes(k))
        .map((o) => `<div class="item" role="button" tabindex="0" data-go="${esc(o.id)}">${esc(o.name.split(" (")[0].split(" · ")[0])}</div>`).join("") || `<div class="small muted">–</div>`}</div>`).join("")}</div></div>

    <div class="glass card" style="margin-top:16px"><div class="card-head"><h2>What we learned from them</h2><span class="muted">project philosophy</span></div>
      <div class="principles">${PRINCIPLES.map(([t, b, f]) => `<div class="principle"><b>${t}</b>${b}<div class="from">${f}</div></div>`).join("")}</div></div>

    <div class="filters glass" style="margin-top:16px" role="group" aria-label="Filter observatories">
      <input type="search" id="n-q" placeholder="Search name, entity, region…" aria-label="Search observatories">
      <button class="chip-toggle" aria-pressed="true" data-cat="">All</button>
      ${Object.keys(reg.categories || {}).map((k) => `<button class="chip-toggle" aria-pressed="false" data-cat="${k}" title="${esc(reg.categories[k])}">${esc(CAT_SHORT[k] || k)}</button>`).join("")}
      <select id="n-role" aria-label="Role in VanNetra"><option value="">Any role</option>${Object.entries(ROLE_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
      <span class="small muted" id="n-n"></span>
    </div>
    <div class="grid g-3" id="obs"></div>

    <div class="glass card" style="margin-top:16px"><div class="card-head"><h2>Codeword watchlist</h2><span class="status unverified">? Unverified</span></div>
      <p class="small">Terms reported to disguise wildlife products. None has a public primary source yet. The full Coalition list is kept private so sellers cannot adapt. VanNetra uses these only to <b>flag an item for human review</b>, never to create a case.</p>
      <div class="table-wrap"><table><thead><tr><th>Term</th><th>Said to mean</th><th>Region</th><th>Note</th></tr></thead><tbody>
      ${(D.codewords || []).map((c) => `<tr><td class="mono">${esc(c.term)}</td><td>${esc(c.means)}</td><td class="small">${esc(c.region)}</td><td class="small muted">${esc(c.note || c.source || "no primary source yet")}</td></tr>`).join("")}
      </tbody></table></div></div>
  </div>`;

  let cat = "";
  const draw = () => {
    const q = main.querySelector("#n-q").value.toLowerCase(), role = main.querySelector("#n-role").value;
    const list = obs.filter((o) => (!cat || o.category === cat) && (!role || (o.vannetra.role || []).includes(role)) &&
      (!q || JSON.stringify([o.name, o.entity, o.focus, o.features, o.global_south]).toLowerCase().includes(q)));
    main.querySelector("#n-n").textContent = `${list.length} of ${obs.length}`;
    main.querySelector("#obs").innerHTML = list.map((o, i) => `<article class="obs-card glass" id="obs-${esc(o.id)}" style="--i:${Math.min(i, 12)}">
      <div class="head"><h2 style="font-size:16.5px">${esc(o.name)}</h2>${statusPill(o.status)}</div>
      <div class="small muted">${esc(o.entity)} · ${esc(o.focus)}</div>
      <div class="small">${esc(o.features)}</div>
      ${o.global_south ? `<div class="small"><b>Global South:</b> ${esc(o.global_south)}</div>` : ""}
      <div class="uses"><b>In VanNetra:</b> ${esc(o.vannetra.how)}</div>
      <div class="chips">${(o.vannetra.role || []).map((r) => `<span class="tag">${esc(ROLE_LABEL[r] || r)}</span>`).join("")}${(o.languages || []).length ? `<span class="tag">${esc(o.languages.join(" · "))}</span>` : ""}<span class="tag">${esc(o.access)}</span></div>
      ${o.status.note ? `<div class="note">Check note: ${esc(o.status.note)}</div>` : ""}
      <div class="small" style="display:flex;justify-content:space-between;gap:8px">${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : `<span class="muted">No verified link</span>`}<span class="muted">listed via ${esc((o.provenance || []).join(", "))}</span></div>
    </article>`).join("") || `<div class="empty">Nothing matches.</div>`;
  };
  main.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => {
    cat = b.dataset.cat;
    main.querySelectorAll("[data-cat]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    draw();
  }));
  main.querySelector("#n-q").addEventListener("input", draw);
  main.querySelector("#n-role").addEventListener("input", draw);
  const goTo = (id) => {
    cat = ""; main.querySelector("#n-q").value = ""; main.querySelector("#n-role").value = "";
    main.querySelectorAll("[data-cat]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.cat === "")));
    draw();
    const card = main.querySelector(`#obs-${CSS.escape(id)}`);
    if (!card) return;
    card.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
    card.classList.remove("bloom"); void card.offsetWidth; card.classList.add("bloom");
  };
  main.querySelectorAll("[data-go]").forEach((b) => {
    b.addEventListener("click", () => goTo(b.dataset.go));
    b.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), goTo(b.dataset.go)));
  });
  main.querySelectorAll("[data-count]").forEach((el) => countUp(el, +el.dataset.count));
  draw();
}
