// Omnibox: one search for everything. Press "/" anywhere to focus it.
// Results are grouped (cases, species, countries, observatories) and keyboard-navigable.
import { esc } from "./charts.js";
import { S, ccName, go, spLabel } from "./store.js";
import * as ic from "./icons.js";

const norm = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function mountSearch(root, input, list) {
  let items = [], sel = 0;
  const index = () => [
    ...Object.entries(S.data.species).map(([id, g]) => ({ kind: "species", id, t: g.label, s: `${g.taxa.slice(0, 2).join(", ")} · CITES ${g.cites || "–"}`,
      hay: norm([g.label, ...g.taxa, ...Object.values(g.terms).flat()].join(" ")), c: "var(--species)", ic: "SP", html: ic.sp(id) })),
    ...Object.entries(S.data.countries).filter(([cc]) => S.data.cases.some((c) => c.place?.country === cc))
      .map(([cc, v]) => ({ kind: "country", id: cc, t: v.name, s: `${S.data.cases.filter((c) => c.place?.country === cc).length} cases`, hay: norm(v.name + " " + cc), c: "var(--place)", ic: cc, logo: ic.flag(cc) })),
    ...(S.data.obs.observatories || []).map((o) => ({ kind: "obs", id: o.id, t: o.name.split(" (")[0], s: `${o.entity} · ${o.hq?.city || "global"}`,
      hay: norm([o.name, o.entity, o.focus, o.features].join(" ")), c: "var(--network)", ic: "OB", logo: ic.org(o.id, o.name) })),
    ...S.data.cases.map((c) => ({ kind: "case", id: c.id, t: c.summary, s: `${c.date || "undated"} · ${c.agencies.slice(0, 2).join(", ")}`,
      hay: norm([c.summary, ...c.places, ...c.agencies, ...c.species.map(spLabel), c.place ? ccName(c.place.country) : ""].join(" ")), c: "var(--cases)", ic: "CA", html: ic.kind(c.kind) })),
  ];
  let IDX = null;
  const draw = () => {
    const q = norm(input.value).trim();
    if (!q) { root.classList.remove("open"); return; }
    IDX ||= index();
    const words = q.split(/\s+/);
    items = IDX.filter((x) => words.every((w) => x.hay.includes(w) || norm(x.t).includes(w)))
      .sort((a, b) => (norm(b.t).startsWith(q) - norm(a.t).startsWith(q))).slice(0, 40);
    const groups = { species: "Species", country: "Countries", obs: "Observatories", case: "Cases" };
    let i = 0;
    list.innerHTML = Object.entries(groups).map(([k, label]) => {
      const g = items.filter((x) => x.kind === k).slice(0, k === "case" ? 12 : 6);
      if (!g.length) return "";
      return `<div class="omni-group">${label}</div>` + g.map((x) => `<button class="hit" role="option" data-i="${items.indexOf(x)}" aria-selected="${i++ === sel}" style="--c:${x.c}">
        ${x.logo ? `<span class="ic logo-ic">${x.logo}</span>` : `<span class="ic">${x.html || esc(x.ic)}</span>`}<span style="min-width:0"><div class="t">${esc(x.t)}</div><div class="s">${esc(x.s)}</div></span><span class="k">↵</span></button>`).join("");
    }).join("") || `<p class="muted" style="padding:10px 12px;margin:0">No match. Try a species (pangolin), a place (Lagos) or an agency (DRI).</p>`;
    root.classList.add("open");
    list.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => pick(items[+b.dataset.i])));
  };
  const pick = (x) => { if (!x) return; go({ kind: x.kind, id: x.id }); input.value = ""; root.classList.remove("open"); input.blur(); };
  input.addEventListener("input", () => { sel = 0; draw(); });
  input.addEventListener("keydown", (e) => {
    const opts = [...list.querySelectorAll("[data-i]")];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % Math.max(1, opts.length);
      opts.forEach((o, j) => o.setAttribute("aria-selected", String(j === sel))); opts[sel]?.scrollIntoView({ block: "nearest" }); }
    if (e.key === "Enter") pick(items[+opts[sel]?.dataset.i]);
    if (e.key === "Escape") { input.value = ""; root.classList.remove("open"); input.blur(); }
  });
  addEventListener("keydown", (e) => {
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement?.tagName)) { e.preventDefault(); input.focus(); }
  });
  addEventListener("pointerdown", (e) => { if (!root.contains(e.target)) root.classList.remove("open"); });
  return { reindex: () => (IDX = null) };
}
