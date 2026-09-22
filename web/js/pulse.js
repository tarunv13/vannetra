// Pulse: the always-on summary of what is on the map. Every bar is also a filter,
// so reading and exploring are the same gesture.
import { esc, fmt } from "./charts.js";
import { KIND, KIND_COLOR, KIND_LABEL } from "./globe.js";
import { S, ccName, clearFilters, emit, filtered, go, spLabel, toggle } from "./store.js";

function bars(entries, facet, color, max = 8) {
  const top = Math.max(1, ...entries.map((e) => e[1]));
  return entries.slice(0, max).map(([k, n, label]) => `<button class="bar" data-f="${facet}" data-v="${esc(k)}" aria-pressed="${S.filters[facet].has(k)}"
      style="--c:${color};--w:${Math.max(4, (n / top) * 100)}%"><i class="fill"></i><span>${esc(label)}</span><b class="n">${fmt(n)}</b></button>`).join("");
}

export function renderPulse(el) {
  const cs = filtered();
  const countries = new Set(cs.map((c) => c.place?.country).filter(Boolean));
  const sp = {}, cc = {}, kinds = {};
  filtered("species").forEach((c) => c.species.forEach((s) => (sp[s] = (sp[s] || 0) + 1)));
  filtered("countries").forEach((c) => c.place && (cc[c.place.country] = (cc[c.place.country] || 0) + 1));
  filtered("kinds").forEach((c) => (kinds[KIND(c.kind)] = (kinds[KIND(c.kind)] || 0) + 1));
  const f = S.filters, any = f.kinds.size || f.species.size || f.countries.size || f.range;
  const reports = cs.reduce((n, c) => n + c.n_sources, 0);
  const latest = [...cs].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 12);
  const m = S.data.meta || {};
  el.innerHTML = `
    <h1 class="headline">${fmt(cs.length)} cases across ${countries.size} ${countries.size === 1 ? "country" : "countries"}</h1>
    <p class="lede">${any ? "Filtered view. Click a chip to remove it." : `Seizures, arrests and convictions from ${fmt(reports)} open reports in ${Object.keys(m.by_source || {}).length || "several"} sources, ${esc(m.window?.[0] || "")} to ${esc(m.window?.[1] || "")}. Nobody accused is ever named.`}</p>
    <div class="active-filters">${[
      ...[...f.kinds].map((k) => `<button class="chip k" style="--kc:${KIND_COLOR[k]}" data-f="kinds" data-v="${k}">${KIND_LABEL[k]} <span class="x">✕</span></button>`),
      ...[...f.species].map((s) => `<button class="chip" data-f="species" data-v="${s}">${esc(spLabel(s))} <span class="x">✕</span></button>`),
      ...[...f.countries].map((c) => `<button class="chip" data-f="countries" data-v="${c}">${esc(ccName(c))} <span class="x">✕</span></button>`),
      f.range ? `<button class="chip" data-clear-range>${esc(f.range[0])} → ${esc(f.range[1])} <span class="x">✕</span></button>` : "",
      any ? `<button class="chip" data-clear-all style="background:transparent">Clear all</button>` : "",
    ].join("")}</div>
    <div class="tiles">
      <div class="tile"><div class="v">${fmt(reports)}</div><div class="k">reports merged into cases</div></div>
      <div class="tile"><div class="v">${Object.keys(sp).length}</div><div class="k">species groups</div></div>
    </div>
    <div class="chips" style="margin-bottom:6px">${Object.entries(KIND_LABEL).map(([k, l]) => `<button class="chip k" style="--kc:${KIND_COLOR[k]}${f.kinds.has(k) ? ";background:#fff;box-shadow:inset 0 0 0 1.5px " + KIND_COLOR[k] : ""}" data-f="kinds" data-v="${k}" aria-pressed="${f.kinds.has(k)}">${l} <span class="muted">${kinds[k] || 0}</span></button>`).join("")}</div>
    <div class="sec"><h3>Species</h3></div>
    <div class="bars">${bars(Object.entries(sp).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, n, spLabel(k)]), "species", "var(--species)")}</div>
    <div class="sec"><h3>Countries</h3></div>
    <div class="bars">${bars(Object.entries(cc).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, n, ccName(k)]), "countries", "var(--place)")}</div>
    <div class="sec"><h3>Latest</h3></div>
    <div class="feed">${latest.map((c) => `<button class="item" data-case="${c.id}" style="--kc:${KIND_COLOR[KIND(c.kind)]}"><i class="k"></i><span><div class="t">${esc(c.summary)}</div>
      <div class="s">${esc(c.date || "undated")} · ${c.n_sources} report${c.n_sources > 1 ? "s" : ""}</div></span></button>`).join("") || `<p class="muted">Nothing matches these filters.</p>`}</div>`;
  el.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => toggle(b.dataset.f, b.dataset.v)));
  el.querySelector("[data-clear-all]")?.addEventListener("click", clearFilters);
  el.querySelector("[data-clear-range]")?.addEventListener("click", () => { S.filters.range = null; emit("filters"); });
  el.querySelectorAll("[data-case]").forEach((b) => b.addEventListener("click", () => go({ kind: "case", id: b.dataset.case })));
}
