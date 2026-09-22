// Timeline dock: cases per week, with a brush to choose a period and a play
// button that glides the map through the filtered cases in time order.
import { esc } from "./charts.js";
import { S, emit, filtered } from "./store.js";

const DAY = 864e5;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const weekStart = (d) => { const t = new Date(d + "T00:00:00Z").getTime(); const w = new Date(t).getUTCDay(); return t - ((w + 6) % 7) * DAY; };

export function renderTimeline(el) {
  const dated = S.data.cases.filter((c) => c.date);
  if (!dated.length) { el.innerHTML = `<p class="muted" style="margin:0">No dated cases yet.</p>`; return; }
  const t0 = weekStart(dated.reduce((m, c) => (c.date < m ? c.date : m), "9999")), t1 = weekStart(dated.reduce((m, c) => (c.date > m ? c.date : m), "0000")) + 7 * DAY;
  const weeks = Math.max(1, Math.round((t1 - t0) / (7 * DAY)));
  const all = new Array(weeks).fill(0), inFilter = new Array(weeks).fill(0);
  dated.forEach((c) => all[Math.min(weeks - 1, Math.floor((weekStart(c.date) - t0) / (7 * DAY)))]++);
  filtered("range").forEach((c) => c.date && inFilter[Math.min(weeks - 1, Math.floor((weekStart(c.date) - t0) / (7 * DAY)))]++);
  const W = 1000, H = 84, pad = 16, max = Math.max(...all, 1), bw = W / weeks;
  const x = (t) => ((t - t0) / (t1 - t0)) * W;
  const r = S.filters.range;
  const months = [];
  for (let d = new Date(t0); d.getTime() <= t1; d.setUTCMonth(d.getUTCMonth() + 1, 1)) months.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H + pad}" preserveAspectRatio="none" role="img" aria-label="Cases per week">
    ${all.map((n, i) => { const h = (n / max) * (H - 18), hi = (inFilter[i] / max) * (H - 18);
      return `<rect x="${i * bw + 1}" y="${H - h}" width="${Math.max(1, bw - 2)}" height="${h}" rx="2" class="col"></rect>
        <rect x="${i * bw + 1}" y="${H - hi}" width="${Math.max(1, bw - 2)}" height="${hi}" rx="2" class="col in"><title>${iso(t0 + i * 7 * DAY)}: ${n} case(s)</title></rect>`; }).join("")}
    ${months.filter((m) => m.getTime() >= t0).map((m) => `<text class="axis" x="${x(m.getTime()) + 3}" y="${H + 13}">${m.toLocaleString("en", { month: "short", timeZone: "UTC" })}</text>
      <line x1="${x(m.getTime())}" x2="${x(m.getTime())}" y1="${H - 4}" y2="${H + 4}" stroke="rgba(15,26,23,.25)"></line>`).join("")}
    ${r ? `<rect class="brush" x="${x(new Date(r[0]).getTime())}" y="0" width="${Math.max(3, x(new Date(r[1]).getTime() + DAY) - x(new Date(r[0]).getTime()))}" height="${H}" rx="6"></rect>` : ""}
  </svg>`;
  // drag to select a period
  const svg = el.querySelector("svg");
  const toT = (ev) => { const b = svg.getBoundingClientRect(); return t0 + Math.min(1, Math.max(0, (ev.clientX - b.left) / b.width)) * (t1 - t0); };
  let start = null, ghost = null;
  svg.addEventListener("pointerdown", (ev) => { start = toT(ev); svg.setPointerCapture(ev.pointerId);
    ghost = document.createElementNS("http://www.w3.org/2000/svg", "rect"); ghost.setAttribute("class", "brush"); ghost.setAttribute("y", 0); ghost.setAttribute("height", H); svg.append(ghost); });
  svg.addEventListener("pointermove", (ev) => { if (start == null) return; const t = toT(ev);
    ghost.setAttribute("x", x(Math.min(start, t))); ghost.setAttribute("width", Math.abs(x(t) - x(start))); });
  svg.addEventListener("pointerup", (ev) => { if (start == null) return; const t = toT(ev);
    const a = Math.min(start, t), b = Math.max(start, t); start = null;
    S.filters.range = b - a < DAY * 2 ? null : [iso(a), iso(b)];
    emit("filters"); });
  const lab = document.getElementById("range-label"), sub = document.getElementById("range-sub"), reset = document.getElementById("range-reset");
  lab.textContent = r ? `${r[0]} → ${r[1]}` : "All time";
  sub.textContent = `${filtered().length} cases in view`;
  reset.hidden = !r;
}
