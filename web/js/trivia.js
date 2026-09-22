/* Trivia box: why this trade is worth watching.
 *
 * One card at a time, each carrying a figure from a major report with its source, or a fact
 * counted from WildTrace's own cases and labelled as such. The box collapses to a pill, and
 * remembers both that choice and where the reader had got to.
 *
 * The illustrations are drawn here rather than shipped as images: each one is a diagram of the
 * figure it sits beside (a filling bar, a shrinking series, a spreading web), so the picture
 * carries the same information as the sentence instead of decorating it.
 */
import { S } from "./store.js";

const KEY = "wildtrace.trivia.v1";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// --- illustrations -------------------------------------------------------------------------
// Flat, two-colour, and never a cartoon animal: each is the shape of the number.
const ART = {
  // a web of species, most of it caught
  web: `<svg viewBox="0 0 120 68" fill="none" aria-hidden="true">
    ${Array.from({ length: 5 }, (_, r) => Array.from({ length: 9 }, (_, c) => {
      const x = 12 + c * 12, y = 10 + r * 12, on = (r * 9 + c) % 5 !== 0;
      return `<circle cx="${x}" cy="${y}" r="${on ? 3.4 : 2.6}" fill="${on ? "var(--cases)" : "var(--ink-3)"}" opacity="${on ? 0.85 : 0.28}"/>`;
    }).join("")).join("")}
  </svg>`,
  // three bars, the shares they describe
  bars: `<svg viewBox="0 0 120 68" fill="none" aria-hidden="true">
    <rect x="12" y="14" width="84" height="10" rx="5" fill="var(--cases)" opacity=".9"/>
    <rect x="12" y="30" width="80" height="10" rx="5" fill="var(--trade)" opacity=".85"/>
    <rect x="12" y="46" width="43" height="10" rx="5" fill="var(--species)" opacity=".8"/>
    <line x1="12" y1="8" x2="12" y2="62" stroke="var(--ink-3)" stroke-width="1.5" opacity=".35"/>
  </svg>`,
  // stacked timber
  timber: `<svg viewBox="0 0 120 68" fill="none" aria-hidden="true">
    ${[0, 1, 2].map((i) => `<rect x="${22 + i * 8}" y="${44 - i * 14}" width="76" height="12" rx="6" fill="var(--species)" opacity="${0.85 - i * 0.18}"/>
      <circle cx="${28 + i * 8}" cy="${50 - i * 14}" r="4" fill="var(--ground)" opacity=".85"/>`).join("")}
  </svg>`,
  // overlapping scales
  scales: `<svg viewBox="0 0 120 68" fill="none" aria-hidden="true">
    ${Array.from({ length: 14 }, (_, i) => {
      const x = 20 + (i % 5) * 18 + (Math.floor(i / 5) % 2) * 9, y = 16 + Math.floor(i / 5) * 16;
      return `<path d="M${x} ${y} q9 0 9 9 q0 9 -9 9 q-9 0 -9 -9 q0 -9 9 -9z" fill="var(--trade)" opacity="${0.25 + (i % 5) * 0.14}"/>`;
    }).join("")}
  </svg>`,
  // a count that falls
  horn: `<svg viewBox="0 0 120 68" fill="none" aria-hidden="true">
    ${[52, 44, 36, 30, 25].map((h, i) => `<rect x="${14 + i * 21}" y="${60 - h}" width="13" height="${h}" rx="4" fill="var(--cases)" opacity="${0.9 - i * 0.13}"/>`).join("")}
    <path d="M18 14 L102 30" stroke="var(--ink-3)" stroke-width="2" stroke-dasharray="4 4" opacity=".5"/>
  </svg>`,
  // a route out
  eel: `<svg viewBox="0 0 120 68" fill="none" aria-hidden="true">
    <path d="M10 44 C34 18, 58 60, 84 28" stroke="var(--place)" stroke-width="3" stroke-linecap="round" fill="none" opacity=".85"/>
    <circle cx="10" cy="44" r="5" fill="var(--place)"/>
    <path d="M96 22 l12 6 -12 6z" fill="var(--trade)"/>
    ${[0, 1, 2].map((i) => `<circle cx="${34 + i * 24}" cy="${38 - i * 4}" r="2.6" fill="var(--place)" opacity=".5"/>`).join("")}
  </svg>`,
  // a listing shield
  shield: `<svg viewBox="0 0 120 68" fill="none" aria-hidden="true">
    <path d="M60 8 L86 18 v16 c0 14 -11 22 -26 26 c-15 -4 -26 -12 -26 -26 V18z" fill="var(--species)" opacity=".16" stroke="var(--species)" stroke-width="2"/>
    <path d="M49 36 l8 8 16 -17" stroke="var(--species)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`,
  // two decades, flat
  clock: `<svg viewBox="0 0 120 68" fill="none" aria-hidden="true">
    <path d="M14 46 C34 44, 44 30, 60 34 C76 38, 88 26, 106 30" stroke="var(--cases)" stroke-width="3" fill="none" stroke-linecap="round"/>
    <line x1="14" y1="58" x2="106" y2="58" stroke="var(--ink-3)" stroke-width="1.5" opacity=".35"/>
    ${[14, 37, 60, 83, 106].map((x) => `<line x1="${x}" y1="58" x2="${x}" y2="62" stroke="var(--ink-3)" stroke-width="1.5" opacity=".35"/>`).join("")}
  </svg>`,
};

let cards = [], i = 0, box = null;

const state = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
};
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private window */ } };

function draw() {
  const c = cards[i];
  if (!c) return;
  const body = box.querySelector(".tv-body");
  body.innerHTML = `
    <div class="tv-art">${ART[c.art] || ART.web}</div>
    <h3>${esc(c.fact)}</h3>
    <p>${esc(c.detail)}</p>
    ${c.kind === "ours"
      ? `<p class="tv-src"><span class="tv-tag">From WildTrace's own cases</span> ${esc(c.caveat)}</p>`
      : `<p class="tv-src">${esc(c.source.name)}, ${esc(c.source.year)} · <a href="${esc(c.source.url)}" target="_blank" rel="noopener noreferrer">Read the source ↗</a></p>`}`;
  body.querySelector(".tv-art").classList.add("bloom");
  box.querySelector(".tv-count").textContent = `${i + 1} / ${cards.length}`;
  save({ ...state(), i });
}

function step(d) {
  i = (i + d + cards.length) % cards.length;
  draw();
}

export async function mountTrivia(root) {
  if (!cards.length) {
    try {
      cards = await (await fetch("data/trivia.json", { cache: "no-cache" })).json();
    } catch { return; }
  }
  if (!cards.length) return;
  const st = state();
  // Start where the reader left off, or on a different card each visit.
  i = Number.isInteger(st.i) ? (st.i + 1) % cards.length : Math.floor(Math.random() * cards.length);
  root.innerHTML = `
    <section class="trivia glass" id="trivia" aria-label="Why this matters">
      <header class="tv-head">
        <button class="tv-toggle" aria-expanded="true" aria-controls="tv-body">
          <span class="tv-dot"></span><b>Why this matters</b>
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>
        </button>
      </header>
      <div class="tv-body" id="tv-body"></div>
      <footer class="tv-foot">
        <button class="btn tv-prev" aria-label="Previous fact">←</button>
        <span class="tv-count mono"></span>
        <button class="btn tv-next">Next fact →</button>
      </footer>
    </section>`;
  box = root.querySelector("#trivia");
  draw();
  box.querySelector(".tv-next").addEventListener("click", () => step(1));
  box.querySelector(".tv-prev").addEventListener("click", () => step(-1));
  const toggle = box.querySelector(".tv-toggle");
  const setOpen = (open) => {
    box.classList.toggle("folded", !open);
    toggle.setAttribute("aria-expanded", String(open));
    save({ ...state(), folded: !open });
  };
  toggle.addEventListener("click", () => setOpen(box.classList.contains("folded")));
  if (st.folded) setOpen(false);
  // Arrow keys move through the cards once the box has focus.
  box.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { step(1); e.preventDefault(); }
    if (e.key === "ArrowLeft") { step(-1); e.preventDefault(); }
  });
  return box;
}

/** Used by the tour, so the box is open while it is being explained. */
export const openTrivia = () => box && box.classList.remove("folded");
