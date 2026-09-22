/* Guided walkthrough: what each part of the Atlas does.
 *
 * Runs once for a first-time reader and can be replayed from the Tour button. Each step
 * spotlights a real element (a hole cut in a dimming overlay, so the thing being explained is
 * the live interface, not a picture of it) and puts a card beside it.
 *
 * Keyboard: → or Enter for the next step, ← for the previous, Esc to leave. Focus is trapped in
 * the card, so the walkthrough is usable without a mouse, and the reader can leave at any step.
 */
const KEY = "wildtrace.tour.v1";

const STEPS = [
  { el: null, title: "Welcome to WildTrace",
    body: "One map of illegal wildlife trade: seizures, arrests and convictions of animals and plants, worldwide. This takes about a minute, and you can leave at any point." },
  { el: "#globe", place: "center", title: "The Atlas",
    body: "Every case sits where its report says it happened. Colour is the kind of event, paler dots rest on a single report, a ring means the place is approximate, and the glow shows where reporting is dense. Numbered discs are clusters: click to open them." },
  { el: "#pulse", place: "right", title: "Pulse: what is in view",
    body: "A live summary of whatever the map is showing. Every row is also a filter, so clicking a species or a country narrows the map to it. The evidence chips do the same by how well a case is evidenced." },
  { el: "#trivia", place: "right", title: "Why this matters",
    body: "Figures on the scale of the trade, each from a named report you can open, and a few counted from WildTrace's own cases. Use Next fact to move through them, or collapse the box." },
  { el: "#tl", place: "top", title: "The timeline",
    body: "Cases per week across the whole record. Drag across it to pick a period, and the map and Pulse follow. The play button glides through cases in time order." },
  { el: "#omni", place: "bottom", title: "One search box",
    body: "Cases, species, countries and observatories in the same box. Press / from anywhere to jump into it." },
  { el: '[data-sheet="table"]', place: "bottom", title: "Every case as a table",
    body: "Sortable, filterable and keyboard-friendly, with a CSV download. Cases with no mappable place are listed here too, marked as not mapped, rather than quietly dropped." },
  { el: '[data-sheet="investigate"]', place: "bottom", title: "Investigate: the link chart",
    body: "Cases, species, places and agencies as a network you can isolate, expand and trace shortest paths through. Your data stays yours: import a CSV or spreadsheet and it is charted in your browser, never uploaded." },
  { el: '[data-sheet="about"]', place: "bottom", title: "How far to trust a case",
    body: "Validated, official, corroborated or single report. About explains what each means, how much of the map is missing, and how to cite the data. Every case panel has a Report a correction link." },
];

const $ = (s) => document.querySelector(s);
let idx = 0, root = null, onKey = null, lastFocus = null;

const seen = () => { try { return localStorage.getItem(KEY) === "done"; } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(KEY, "done"); } catch { /* private window */ } };

function position(card, hole, place) {
  const pad = 14, w = card.offsetWidth, h = card.offsetHeight;
  let left, top;
  if (!hole || place === "center") {
    left = (innerWidth - w) / 2; top = (innerHeight - h) / 2;
  } else if (place === "right") {
    left = hole.right + pad; top = Math.min(hole.top, innerHeight - h - pad);
  } else if (place === "top") {
    left = Math.min(Math.max(pad, hole.left), innerWidth - w - pad); top = hole.top - h - pad;
  } else {
    left = Math.min(Math.max(pad, hole.left), innerWidth - w - pad); top = hole.bottom + pad;
  }
  card.style.left = `${Math.max(pad, Math.min(left, innerWidth - w - pad))}px`;
  card.style.top = `${Math.max(pad, Math.min(top, innerHeight - h - pad))}px`;
}

function render() {
  const s = STEPS[idx];
  const el = s.el && $(s.el);
  // offsetParent is null for every position:fixed element (Pulse, the dock, the top bar), so
  // visibility is decided from the box itself.
  const r = el && el.getBoundingClientRect();
  const box = r && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" ? r : null;
  const cut = root.querySelector(".tour-cut");
  if (box) {
    cut.hidden = false;
    Object.assign(cut.style, { left: `${box.left - 6}px`, top: `${box.top - 6}px`,
      width: `${box.width + 12}px`, height: `${box.height + 12}px` });
  } else {
    cut.hidden = true;
  }
  const card = root.querySelector(".tour-card");
  card.innerHTML = `
    <div class="tour-step mono">Step ${idx + 1} of ${STEPS.length}</div>
    <h2>${s.title}</h2>
    <p>${s.body}</p>
    <div class="tour-nav">
      <button class="btn tour-skip">${idx === STEPS.length - 1 ? "Close" : "Skip tour"}</button>
      <span style="flex:1"></span>
      ${idx ? '<button class="btn tour-prev">Back</button>' : ""}
      <button class="btn primary tour-next">${idx === STEPS.length - 1 ? "Start exploring" : "Next"}</button>
    </div>`;
  card.classList.remove("bloom"); void card.offsetWidth; card.classList.add("bloom");
  position(card, box, s.place);
  card.querySelector(".tour-next").addEventListener("click", () => step(1));
  card.querySelector(".tour-prev")?.addEventListener("click", () => step(-1));
  card.querySelector(".tour-skip").addEventListener("click", end);
  card.querySelector(".tour-next").focus();
}

function step(d) {
  const next = idx + d;
  if (next >= STEPS.length) return end();
  idx = Math.max(0, next);
  render();
}

export function endTour() { end(); }

function end() {
  markSeen();
  removeEventListener("keydown", onKey, true);
  removeEventListener("resize", render);
  root?.classList.add("out");
  const r = root; root = null;
  setTimeout(() => r?.remove(), 220);
  lastFocus?.focus?.();
  document.body.classList.remove("touring");
}

/** Start the walkthrough. `auto` only runs it for a reader who has not seen it. */
export function startTour({ auto = false } = {}) {
  if (root || (auto && seen()) || innerWidth < 860) return;   // the tour points at a desktop layout
  lastFocus = document.activeElement;
  idx = 0;
  root = document.createElement("div");
  root.className = "tour";
  root.innerHTML = `<div class="tour-veil"></div><div class="tour-cut" hidden></div><div class="tour-card glass" role="dialog" aria-modal="true" aria-label="Guided tour"></div>`;
  document.body.append(root);
  document.body.classList.add("touring");
  root.querySelector(".tour-veil").addEventListener("click", end);
  onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); end(); }
    else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    else if (e.key === "Tab") { e.preventDefault(); }   // keep focus in the card
  };
  addEventListener("keydown", onKey, true);
  addEventListener("resize", render);
  render();
}
