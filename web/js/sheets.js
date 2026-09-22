// Network and Methods sheets. They slide up over the map; the map stays live above them.
import { esc, fmt } from "./charts.js";
import { S, go } from "./store.js";

const STATE = { active: ["good", "● Active"], prototype: ["warn", "◐ Prototype"], restricted: ["info", "◌ Restricted"], "bot-blocked": ["info", "◌ Browser only"],
  offline: ["bad", "✕ Offline"], unverified: ["warn", "? Unverified"] };
const CAT = { intelligence: "Intelligence", digital: "Online trade", legal: "Courts & law", trade: "Trade statistics", reference: "Reference data",
  tools: "Tools", crowd: "Public reporting", journalism: "Journalism", funding: "Funding" };

export function mountNetwork(root) {
  const obs = S.data.obs.observatories || [];
  let cat = "";
  const draw = () => {
    const list = obs.filter((o) => !cat || o.category === cat);
    root.innerHTML = `
      <div class="filters">
        <button class="chip" aria-pressed="${!cat}" data-cat="">All ${obs.length}</button>
        ${Object.keys(S.data.obs.categories || {}).map((k) => `<button class="chip" aria-pressed="${cat === k}" data-cat="${k}">${esc(CAT[k] || k)} <span class="muted">${obs.filter((o) => o.category === k).length}</span></button>`).join("")}
        <span style="flex:1"></span><span class="muted" style="font-size:12.5px">Every entry re-checked 22 Sep 2026 · corrections shown on each card</span>
      </div>
      <div class="dir">${list.map((o) => { const [c, l] = STATE[o.status.state] || ["info", o.status.state];
        return `<article class="obs" data-obs="${esc(o.id)}" tabindex="0" role="button" aria-label="${esc(o.name)}">
          <div class="row" style="justify-content:space-between;align-items:start"><h4>${esc(o.name.split(" (")[0])}</h4><span class="status ${c}">${l}</span></div>
          <div class="muted" style="font-size:12.5px">${esc(o.entity)}${o.hq ? ` · ${esc(o.hq.city)}` : ""}</div>
          <div>${esc(o.features)}</div>
          <div class="use"><b>In Pugmark:</b> ${esc(o.vannetra.how)}</div>
        </article>`; }).join("")}</div>
      <div class="prose" style="max-width:none">
        <h3>What the network taught this project</h3>
        <div class="dir" style="padding:0">${[
          ["Open code, closed operations", "Software, methods and aggregates are public. Names, informants and patrol data are not.", "SMART, NGO data sharing"],
          ["A machine ranks, a person decides", "Classifiers sort the flood; people confirm. Hence the review queue and relabel loop.", "ECO-SOLVE, WILDTRADE"],
          ["Follow the logistics", "Transport mode, airport and route say more than a species list.", "C4ADS, ROUTES"],
          ["Follow the case to court", "A seizure is where a case starts. Arrest, charge and conviction are the outcome.", "#WildEye, SHERLOC"],
          ["Bridge source and demand", "Local names map to species and species to end uses, so source and demand markets meet in one chart.", "PMC8579131, EIA, Operation Jaguar"],
          ["Verify before you trust", "Several AI-supplied links and claims were wrong; unverified codewords only flag items for review.", "building this registry"],
        ].map(([t, b, f]) => `<div class="obs" style="cursor:default"><h4>${t}</h4><div>${b}</div><div class="muted" style="font-size:12px">From ${f}</div></div>`).join("")}</div>
      </div>`;
    root.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => { cat = b.dataset.cat; draw(); }));
    root.querySelectorAll("[data-obs]").forEach((b) => {
      const open = () => go({ kind: "obs", id: b.dataset.obs });
      b.addEventListener("click", open);
      b.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open()));
    });
  };
  draw();
}

export function mountMethods(root, tab = "pipeline") {
  const m = S.data.report || {}, t = m.test || {}, meta = S.data.meta || {};
  const pct = (v) => (v == null ? "–" : `${(v * 100).toFixed(1)}%`);
  const sections = {
    pipeline: `<div class="prose">
      <h3 style="margin-top:0">How a news report becomes a case</h3>
      <p><b>Collect.</b> Open news from GDELT and Google News (23 editions, 8 languages), plus YouTube listings collected locally. This build screened ${fmt(meta.records_seen)} records.</p>
      <p><b>Screen.</b> A multilingual lexicon of 30 species groups (English, Hindi, Telugu, Portuguese, Spanish, French, Vietnamese, Thai, Indonesian, plus 2,376 codebook names in 66 languages) meets enforcement words in the same languages. Films, liquor brands and look-alike places are filtered out.</p>
      <p><b>Extract.</b> Species, place (46,000 places, Hindi and native-script names included), route, quantities, arrests (a count, never a name), agencies and transport, each traceable to a phrase.</p>
      <p><b>Merge.</b> Reports of one incident become one case, across languages and across the days a story runs.</p>
      <p><b>Link and publish.</b> Cases become a graph of species, places, agencies and outlets. A privacy gate blocks names, phones and handles before anything is published.</p></div>`,
    model: `<div class="prose">
      <h3 style="margin-top:0">The online-listing classifier</h3>
      <p>${esc(m.task || "")}. Trained on ${fmt(m.n)} WCS-OWT labelled items (${fmt(m.n_R)} trade / ${fmt(m.n_IR)} irrelevant). ${esc(m.protocol || "")}.</p>
      <table style="max-width:560px"><tbody>
        <tr><td>Trade listings kept (target ${pct(m.target_recall)})</td><td class="num"><b>${pct(t.recall_R)}</b></td></tr>
        <tr><td>Irrelevant listings rejected</td><td class="num"><b>${pct(t.recall_IR)}</b></td></tr>
        <tr><td>Precision on trade</td><td class="num">${pct(t.precision_R)}</td></tr>
        <tr><td>ROC-AUC</td><td class="num">${t.roc_auc ?? "–"}</td></tr></tbody></table>
      <p>Scored once on a test set split by seller channel, so a seller's videos never appear on both sides. The learning curve has flattened (${esc(m.saturation || "")}); contradictory labels, not the model, set the ceiling.</p></div>`,
    privacy: `<div class="prose">
      <h3 style="margin-top:0">What Pugmark will not publish</h3>
      <p><b>People.</b> Accused persons are presumed innocent. Case summaries are built from extracted facts, never copied headlines, and arrests are counts.</p>
      <p><b>Contacts.</b> Phone numbers, e-mails, messenger links and handles are removed; the build fails if any remain.</p>
      <p><b>Sellers.</b> Channel names are only used to keep one seller's listings on one side of the test split.</p>
      <p><b>You.</b> No analytics, cookies or accounts. Data you import into Investigate stays in your browser.</p>
      <p><b>Sources.</b> robots.txt is respected, which is why Google News links are not decoded; locations come from the reports themselves.</p></div>`,
    sources: `<div style="padding:16px"><table><thead><tr><th>Source</th><th>Access</th><th>Status</th><th>Notes</th></tr></thead><tbody>
      ${(S.data.sources || []).map((s) => `<tr><td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}</td><td>${esc(s.access)}</td>
        <td><span class="status ${s.enabled ? "good" : "info"}">${s.enabled ? "on" : "off"}</span></td><td class="muted" style="white-space:normal">${esc(s.notes || s.terms || "")}</td></tr>`).join("")}</tbody></table></div>`,
  };
  root.innerHTML = sections[tab] || sections.pipeline;
}
