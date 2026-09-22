// Small, dependency-free SVG charts with a hover layer.
// Marks: thin bars, 4px rounded data-ends anchored to the baseline, 2px gaps,
// recessive grid, selective direct labels, text in ink tokens (never series colour).

const tip = () => document.getElementById("tip");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmt = (n) => (n == null ? "–" : Number(n).toLocaleString("en-IN"));

export function showTip(html, ev) {
  const t = tip();
  t.innerHTML = html;
  t.classList.add("on");
  const x = Math.min(ev.clientX + 14, innerWidth - t.offsetWidth - 8);
  const y = Math.min(ev.clientY + 14, innerHeight - t.offsetHeight - 8);
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}
export const hideTip = () => tip().classList.remove("on");

function bindHits(svg) {
  svg.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("pointermove", (e) => showTip(el.dataset.tip, e));
    el.addEventListener("pointerleave", hideTip);
  });
}

/** Horizontal bars: one series, one colour. rows: [{label, value, note?}] */
export function hbars(el, rows, { color = "var(--j)", max = 10, onClick } = {}) {
  rows = rows.slice(0, max);
  if (!rows.length) { el.innerHTML = `<div class="empty">No data yet</div>`; return; }
  const W = 420, rowH = 30, labelW = 150, H = rows.length * rowH;
  const top = Math.max(...rows.map((r) => r.value)) || 1;
  const bw = W - labelW - 44;
  el.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">
    ${rows.map((r, i) => {
      const w = Math.max(3, (r.value / top) * bw), y = i * rowH;
      return `<g class="g" data-i="${i}" data-tip="${esc(`<b>${esc(r.label)}</b><br>${fmt(r.value)} ${esc(r.note || "")}`)}">
        <text class="lbl" x="0" y="${y + 19}">${esc(r.label.length > 22 ? r.label.slice(0, 21) + "…" : r.label)}</text>
        <path class="mark" fill="${color}" d="M${labelW},${y + 8} h${w - 4} a4,4 0 0 1 4,4 v6 a4,4 0 0 1 -4,4 h-${w - 4} z"/>
        <text class="val" x="${labelW + w + 6}" y="${y + 19}">${fmt(r.value)}</text>
        <rect class="hit" x="0" y="${y}" width="${W}" height="${rowH}"/>
      </g>`;
    }).join("")}
  </svg>`;
  bindHits(el);
  if (onClick) el.querySelectorAll(".g").forEach((g) => g.addEventListener("click", () => onClick(rows[+g.dataset.i])));
}

/** Vertical column chart over time. rows: [{label:'2026-07', value}] */
export function columns(el, rows, { color = "var(--j)", height = 170 } = {}) {
  if (!rows.length) { el.innerHTML = `<div class="empty">No dated events yet</div>`; return; }
  const W = 640, H = height, padB = 24, padT = 16, gap = 2;
  const top = Math.max(...rows.map((r) => r.value)) || 1;
  const bw = Math.max(4, (W - gap * rows.length) / rows.length);
  const ticks = [0, Math.ceil(top / 2), top];
  const labelEvery = Math.ceil(rows.length / 8);
  el.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Events over time">
    ${ticks.map((t) => { const y = H - padB - (t / top) * (H - padB - padT);
      return `<line class="grid-line" x1="0" x2="${W}" y1="${y}" y2="${y}"/><text x="${W}" y="${y - 4}" text-anchor="end">${fmt(t)}</text>`; }).join("")}
    ${rows.map((r, i) => {
      const h = Math.max(r.value ? 3 : 0, (r.value / top) * (H - padB - padT)), x = i * (bw + gap), y = H - padB - h;
      const r4 = Math.min(4, bw / 2, h);
      return `<g class="g" data-tip="${esc(`<b>${esc(r.label)}</b><br>${fmt(r.value)} cases`)}">
        ${h ? `<path class="mark" fill="${color}" d="M${x},${H - padB} v-${h - r4} a${r4},${r4} 0 0 1 ${r4},-${r4} h${bw - 2 * r4} a${r4},${r4} 0 0 1 ${r4},${r4} v${h - r4} z"/>` : ""}
        ${i % labelEvery === 0 ? `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(r.label)}</text>` : ""}
        <rect class="hit" x="${x}" y="${padT}" width="${bw + gap}" height="${H - padT}"/>
      </g>`;
    }).join("")}
  </svg>`;
  bindHits(el);
}

/** Stacked 100% bar for two parts (e.g. R vs IR). */
export function split(el, a, b, { la = "A", lb = "B", ca = "var(--s1)", cb = "#c9cfd8" } = {}) {
  const tot = a + b || 1, pa = (a / tot) * 100;
  el.innerHTML = `<div style="display:flex;gap:2px;height:10px;border-radius:5px;overflow:hidden" role="img" aria-label="${esc(la)} ${a}, ${esc(lb)} ${b}">
      <span style="width:${pa}%;background:${ca}"></span><span style="flex:1;background:${cb}"></span></div>
    <div class="small muted" style="display:flex;justify-content:space-between;margin-top:6px">
      <span>${esc(la)} <b style="color:var(--ink)">${fmt(a)}</b></span><span>${esc(lb)} <b style="color:var(--ink)">${fmt(b)}</b></span></div>`;
}

export { esc };
