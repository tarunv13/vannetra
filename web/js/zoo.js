// Zoonoses: where animal-borne outbreaks are reported, and which traded species carry
// relatives of human viruses. A separate lens on the same map, deliberately not causal:
// an outbreak near a seizure does not mean the trade caused it.
// Data: WHO Disease Outbreak News and VIRION (web/data/zoonoses.json).
import { esc, fmt } from "./charts.js";
import { S, ccName, emit, spLabel } from "./store.js";
import { roles } from "./flows.js";
import * as ic from "./icons.js";

export const PATHWAY = { wildlife: ["Wildlife contact", "#eb6834", "Ebola, Marburg, mpox, SARS, Nipah, Lassa"],
  birds: ["Birds", "#2a78d6", "avian influenza, West Nile"], livestock: ["Livestock", "#008300", "MERS, Rift Valley fever, anthrax"],
  vector: ["Insects and ticks", "#4a3aa7", "yellow fever, Oropouche"] };
// What the research says, found through a Consensus literature search (September 2026).
const RESEARCH = [
  ["Traded mammals are 1.5 times as likely to share pathogens with people as mammals that are not traded, and a species gains about one shared pathogen for every decade it spends in trade.",
    "Gippet et al. 2026, Science", "https://consensus.app/papers/details/43ec3e8833ed51e6860f0177b06a47a6/"],
  ["A quarter of the mammals in wildlife trade carry three quarters of known zoonotic viruses.", "Shivaprakash et al. 2021, Current Biology",
    "https://consensus.app/papers/details/f3ff99f57b2f5d9b83844141a1f34227/"],
  ["334 Sunda pangolins confiscated in Malaysia tested negative for coronaviruses; the SARS-CoV-2-related viruses found in pangolins in China more plausibly came from exposure inside the trade chain.",
    "Lee et al. 2020, EcoHealth", "https://consensus.app/papers/details/adce685863b151208d88dc348bd01876/"],
  ["Where outbreaks are recorded follows access to health care: reporting falls by a median of 32% for each extra hour of travel to a clinic.",
    "Gibb et al. 2024", "https://consensus.app/papers/details/b57410c3fd245d1a89434a966c4d9df3/"],
];

function reports() {
  const z = S.data.zoonoses, f = S.zoo;
  return (z?.who.reports || []).filter((r) => f.pathways.has(r.pathway) && (!f.disease || r.disease === f.disease));
}

export function geo() {
  const byC = {};
  reports().forEach((r) => r.countries.forEach((c) => ((byC[c] ||= {})[r.pathway] = (byC[c][r.pathway] || 0) + 1)));
  const tot = (v) => Object.values(v).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...Object.values(byC).map(tot));
  const pts = Object.entries(byC).filter(([c]) => S.data.countries[c]).map(([c, v]) => {
    const n = tot(v), dom = Object.keys(v).reduce((a, b) => (v[a] >= v[b] ? a : b));
    return { type: "Feature", properties: { cc: c, name: ccName(c), n, r: 4 + 26 * Math.sqrt(n / max), c: PATHWAY[dom][1],
      what: `${n} WHO outbreak report${n > 1 ? "s" : ""} · ${Object.entries(v).map(([k, x]) => `${PATHWAY[k][0].toLowerCase()} ${x}`).join(", ")}` },
      geometry: { type: "Point", coordinates: [S.data.countries[c].lon, S.data.countries[c].lat] } };
  });
  const cc = {};
  S.data.cases.forEach((c) => c.place?.country && (cc[c.place.country] = (cc[c.place.country] || 0) + 1));
  const cmax = Math.max(1, ...Object.values(cc));
  const rings = S.zoo.cases ? Object.entries(cc).filter(([c]) => S.data.countries[c]).map(([c, n]) => ({ type: "Feature",
    properties: { name: ccName(c), r: 4 + 14 * Math.sqrt(n / cmax), what: `${n} WildTrace trafficking case${n > 1 ? "s" : ""} (ring)` },
    geometry: { type: "Point", coordinates: [S.data.countries[c].lon, S.data.countries[c].lat] } })) : [];
  return { bubbles: { type: "FeatureCollection", features: pts }, rings: { type: "FeatureCollection", features: rings }, byC, cc };
}

export function renderControls(el) {
  const z = S.data.zoonoses, f = S.zoo;
  if (!z) { el.innerHTML = `<div class="skeleton" style="height:120px"></div><p class="muted">Loading outbreak data…</p>`; return; }
  const all = z.who.reports, pn = {}, dn = {};
  all.forEach((r) => (pn[r.pathway] = (pn[r.pathway] || 0) + 1));
  all.filter((r) => f.pathways.has(r.pathway)).forEach((r) => (dn[r.disease] = (dn[r.disease] || 0) + 1));
  const years = {}; reports().forEach((r) => { const y = +r.date.slice(0, 4); (years[y] ||= {})[r.pathway] = (years[y][r.pathway] || 0) + 1; });
  const ys = Object.keys(years).map(Number).sort(), ymax = Math.max(1, ...Object.values(years).map((v) => Object.values(v).reduce((a, b) => a + b, 0)));
  el.innerHTML = `
    <h1 class="headline" style="font-size:25px">Where animal-borne outbreaks and wildlife trade meet</h1>
    <div class="box" style="border-left:3px solid #c2366f;margin-top:0">${esc(z.note)} Use it to ask where to look closer.</div>
    <div class="sec"><h3>How it reaches people</h3></div>
    ${Object.entries(PATHWAY).map(([k, [l, c, ex]]) => `<label class="ck"><input type="checkbox" data-pw="${k}" ${f.pathways.has(k) ? "checked" : ""} style="accent-color:${c}">
      <span><b><span class="dotc" style="background:${c}"></span>${l} <span class="mono muted">${fmt(pn[k] || 0)}</span></b><small>${ex}</small></span></label>`).join("")}
    <div class="sec"><h3>Disease</h3>${f.disease ? `<button id="z-alld">All</button>` : ""}</div>
    <div class="chips">${Object.entries(dn).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([d, n]) => `<button class="chip" data-d="${esc(d)}" aria-pressed="${f.disease === d}"${f.disease === d ? ' style="background:var(--ink);color:#fff"' : ""}>${esc(d)} <span class="muted">${n}</span></button>`).join("")}</div>
    <div class="sec"><h3>Overlay</h3></div>
    <label class="ck"><input type="checkbox" id="z-cases" ${f.cases ? "checked" : ""}><span><b>WildTrace trafficking cases</b><small>dark rings, sized by cases per country</small></span></label>
    <div class="sec"><h3>WHO reports per year</h3></div>
    <div class="yrs">${ys.map((y) => `<i title="${y}: ${Object.entries(years[y]).map(([k, n]) => `${PATHWAY[k][0]} ${n}`).join(", ")}" style="height:${Math.max(2, (Object.values(years[y]).reduce((a, b) => a + b, 0) / ymax) * 44)}px;background:linear-gradient(0deg,${Object.entries(years[y]).map(([k, n], i, a) => `${PATHWAY[k][1]} ${(a.slice(0, i).reduce((s, [, x]) => s + x, 0) / Object.values(years[y]).reduce((p, q) => p + q, 0)) * 100}% ${(a.slice(0, i + 1).reduce((s, [, x]) => s + x, 0) / Object.values(years[y]).reduce((p, q) => p + q, 0)) * 100}%`).join(",")})"></i>`).join("")}</div>
    <div class="yrs-l"><span>${ys[0] || ""}</span><span>${ys[ys.length - 1] || ""}</span></div>
    <div class="row" style="margin-top:14px"><button class="btn" data-open="zoo">Species and viruses</button><button class="btn" data-open-t="reports">All ${fmt(reports().length)} reports</button></div>
    <p class="muted" style="font-size:11.5px;margin-top:14px">WHO Disease Outbreak News, ${fmt(all.length)} zoonotic reports since ${esc(all[all.length - 1]?.date.slice(0, 4) || "")}. Diseases are grouped by how they reach people; a report is placed in every country its title names.</p>`;
  el.querySelectorAll("[data-pw]").forEach((b) => b.addEventListener("change", () => { b.checked ? f.pathways.add(b.dataset.pw) : f.pathways.delete(b.dataset.pw); f.disease = ""; emit("zoo"); }));
  el.querySelectorAll("[data-d]").forEach((b) => b.addEventListener("click", () => { f.disease = f.disease === b.dataset.d ? "" : b.dataset.d; emit("zoo"); }));
  el.querySelector("#z-alld")?.addEventListener("click", () => { f.disease = ""; emit("zoo"); });
  el.querySelector("#z-cases").addEventListener("change", (e) => { f.cases = e.target.checked; emit("zoo"); });
  el.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => dispatchEvent(new CustomEvent("wildtrace:open", { detail: b.dataset.open }))));
  el.querySelector("[data-open-t]").addEventListener("click", () => dispatchEvent(new CustomEvent("wildtrace:open", { detail: "zoo:reports" })));
}

/** Right panel: countries where outbreak reports and trade evidence both appear. */
export function renderSide(el, g) {
  const R = roles();
  const both = Object.entries(g.byC).map(([c, v]) => [c, v.wildlife || 0, R[c]?.supply || 0, g.cc[c] || 0])
    .filter(([, w, s, k]) => w && (s || k)).sort((a, b) => b[1] - a[1]).slice(0, 12);
  el.innerHTML = `
    <div class="eyebrow" style="--c:#c2366f">Countries with both</div>
    <p class="story">Outbreak reports passed on by <b>wildlife contact</b>, next to seized shipments taken from the same country and WildTrace cases there.</p>
    <table class="both"><thead><tr><th scope="col">Country</th><th scope="col" class="num">Outbreaks</th><th scope="col" class="num">Seized from</th><th scope="col" class="num">Cases</th></tr></thead>
      <tbody>${both.map(([c, w, s, k]) => `<tr><td><button class="linkish" data-cc="${c}">${esc(ccName(c))}</button></td><td class="num">${w}</td><td class="num">${fmt(s)}</td><td class="num">${k}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">Switch on wildlife contact to compare.</td></tr>`}</tbody></table>
    <div class="sec"><h3>Map key</h3></div>
    <div class="legend-f">${Object.values(PATHWAY).map(([l, c]) => `<span class="lg"><i style="background:${c}"></i>${l}</span>`).join("")}<span class="lg"><i style="background:transparent;box-shadow:inset 0 0 0 2px #0f1a17"></i>WildTrace cases</span></div>
    <p class="muted" style="font-size:11.5px;margin:10px 0 0">Bubble size: WHO reports naming the country; colour: the pathway most of them follow. Countries with better health reporting appear more often.</p>
    <button class="btn" data-open="zoo" style="width:100%;margin-top:12px;background:#a3245e;color:#fff;border-color:transparent">Which traded species carry which viruses</button>`;
  el.querySelectorAll("[data-cc]").forEach((b) => b.addEventListener("click", () => dispatchEvent(new CustomEvent("wildtrace:go", { detail: { kind: "country", id: b.dataset.cc } }))));
  el.querySelector("[data-open]").addEventListener("click", () => dispatchEvent(new CustomEvent("wildtrace:open", { detail: "zoo" })));
}

// ------------------------------------------------------------------ sheet: species x viruses, and the report list
const ZR = ["#f9e3ec", "#eeb3ca", "#dc7aa2", "#c2366f", "#8a1d4c"];
const zc = (v) => (!v ? ["transparent", "var(--ink-3)"] : ((k) => [ZR[k], k >= 3 ? "#fff" : "var(--ink)"])(v === 1 ? 0 : v <= 3 ? 1 : v <= 9 ? 2 : v <= 29 ? 3 : 4));
const FAM = [["coronaviridae", "Corona"], ["paramyxoviridae", "Paramyxo"], ["orthomyxoviridae", "Influenza"], ["flaviviridae", "Flavi"], ["poxviridae", "Pox"],
  ["filoviridae", "Filo (Ebola)"], ["rhabdoviridae", "Rabies family"], ["retroviridae", "Retro"], ["picornaviridae", "Picorna"], ["hantaviridae", "Hanta"]];

export function mountZoo(root, tab = "species") {
  const z = S.data.zoonoses;
  if (!z) { root.innerHTML = `<p class="muted" style="padding:18px">Loading…</p>`; return; }
  if (tab === "reports") {
    const rs = reports();
    root.innerHTML = `<div class="filters"><span class="muted" style="font-size:12.5px">${fmt(rs.length)} WHO Disease Outbreak News reports with an animal reservoir, newest first. Filters from the Zoonoses panel apply.</span></div>
      <div style="padding:10px 16px 18px"><table aria-label="Zoonotic outbreak reports"><thead><tr><th>Date</th><th>Disease</th><th>Pathway</th><th>Countries</th><th>Report</th></tr></thead>
      <tbody>${rs.slice(0, 400).map((r) => `<tr><td class="num">${esc(r.date)}</td><td>${esc(r.disease)}</td><td><span class="dotc" style="background:${PATHWAY[r.pathway][1]}"></span>${PATHWAY[r.pathway][0]}</td>
        <td>${r.countries.map((c) => esc(ccName(c))).join(", ") || '<span class="muted">several or global</span>'}</td><td><a href="${esc(z.who.url + r.id)}" target="_blank" rel="noopener">WHO ↗</a></td></tr>`).join("")}</tbody></table>
      ${rs.length > 400 ? `<p class="muted">Showing the latest 400.</p>` : ""}</div>`;
    return;
  }
  const v = z.virion, cases = {};
  S.data.cases.forEach((c) => c.species.forEach((s) => (cases[s] = (cases[s] || 0) + 1)));
  const rows = Object.entries(v.groups).filter(([, g]) => g.viruses >= 3).sort((a, b) => b[1].relatives - a[1].relatives);
  root.innerHTML = `<div class="zoo-grid"><div style="overflow:auto;padding:14px 16px">
      <p style="margin:0 0 10px;font-size:13.5px;max-width:80ch">Viruses confirmed by sequencing or isolation in each traded species group. A <b>close relative</b> belongs to a virus genus that also infects people; <b>same as in people</b> is the very same virus species.</p>
      <table class="matrix zoo-t" aria-label="Viruses recorded in traded species groups"><thead><tr><th scope="col">Species group</th><th scope="col" class="num">Cases</th><th scope="col" class="num">Viruses found</th><th scope="col">Same as in people</th><th scope="col">Close relatives</th>
        ${FAM.map(([, l]) => `<th scope="col">${l}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(([g, x]) => `<tr><th scope="row"><button class="linkish" data-sp="${g}" style="display:inline-flex;gap:8px;align-items:center">${ic.sp(g)}${esc(spLabel(g))}</button></th><td class="num">${cases[g] || 0}</td><td class="num">${x.viruses}</td>
        ${[x.same, x.relatives, ...FAM.map(([k]) => x.families[k] || 0)].map((n) => { const [bg, fg] = zc(n); return `<td><span class="mc" style="background:${bg};color:${fg}">${n || "·"}</span></td>`; }).join("")}</tr>`).join("")}</tbody></table>
      <div class="row" style="margin-top:10px;gap:14px"><span class="muted" style="font-size:12px">Virus count</span>${ZR.map((c, i) => `<span class="lg"><i style="background:${c};border-radius:4px;width:20px"></i>${["1", "2–3", "4–9", "10–29", "30+"][i]}</span>`).join("")}</div>
    </div>
    <aside class="zoo-side">
      <h4>Read with care</h4>
      <p>Primates and wild boar top the list partly because they are studied far more. A low count can mean few studies, not few viruses.</p>
      <p>Carrying a virus is not the same as spreading it. Risk depends on contact: live markets, handling and transport.</p>
      <h4>What the research says</h4>
      ${RESEARCH.map(([t, who, url]) => `<p>${esc(t)} <a href="${url}" target="_blank" rel="noopener">${esc(who)} ↗</a></p>`).join("")}
      <h4>Sources</h4>
      <p class="muted">${esc(v.cite)} Data package ${esc(v.date || "")}, ${esc(v.licence)}: these counts are shared under the same licence. ${esc(z.who.source)}. Literature found with Consensus, September 2026.</p>
    </aside></div>`;
  root.querySelectorAll("[data-sp]").forEach((b) => b.addEventListener("click", () => dispatchEvent(new CustomEvent("wildtrace:go", { detail: { kind: "species", id: b.dataset.sp } }))));
}

/** Inspector block for a species group. */
export function speciesBlock(gid) {
  const x = S.data.zoonoses?.virion.groups[gid];
  if (!x) return "";
  const fams = Object.entries(x.families).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k.replace("viridae", "")} ${n}`).join(", ");
  return `<div class="eyebrow" style="margin:16px 0 6px;--c:#c2366f">Viruses</div>
    <p style="font-size:13px;margin:0 0 6px"><b>${x.viruses}</b> viruses confirmed in this group; <b>${x.same}</b> are the same species found in people and <b>${x.relatives}</b> are close relatives of human viruses${fams ? ` (${esc(fams)})` : ""}.</p>
    <p class="muted" style="font-size:11.5px;margin:0">VIRION, sequencing or isolation only. More studied species show more viruses. <button class="linkish" data-open-zoo="1">Compare species</button></p>`;
}
/** Inspector block for a country. */
export function countryBlock(cc) {
  const v = S.data.zoonoses?.who.by_country[cc];
  if (!v) return "";
  return `<div class="eyebrow" style="margin:16px 0 6px;--c:#c2366f">Animal-borne outbreaks</div>
    <p style="font-size:13px;margin:0 0 6px">${Object.entries(v).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span class="dotc" style="background:${PATHWAY[k][1]}"></span>${PATHWAY[k][0]} <b>${n}</b>`).join(" · ")}</p>
    <p class="muted" style="font-size:11.5px;margin:0">WHO Disease Outbreak News reports naming this country. A shared map, not a cause.</p>`;
}
