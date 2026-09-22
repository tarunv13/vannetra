// Motion helpers (see css/motion.css). Every helper is a no-op or instant under
// prefers-reduced-motion, and falls back gracefully where an API is missing.

export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Run a DOM swap as a View Transition when the browser supports it. */
export function transition(swap) {
  if (!document.startViewTransition || reduced() || document.hidden) { swap(); return Promise.resolve(); }
  const vt = document.startViewTransition(swap);
  // A skipped transition rejects all three promises; the DOM swap still happens.
  vt.ready.catch(() => {}); vt.updateCallbackDone.catch(() => {});
  return vt.finished.catch(() => {});
}

/** One white plate that travels between tabs and morphs to each label's width. */
export function tabThumb(tabs) {
  let thumb = tabs.querySelector(".tab-thumb");
  if (!thumb) { thumb = document.createElement("span"); thumb.className = "tab-thumb"; thumb.setAttribute("aria-hidden", "true"); tabs.prepend(thumb); }
  const place = () => {
    const cur = tabs.querySelector('[aria-current="page"]');
    if (!cur) { thumb.dataset.ready = "false"; return; }
    thumb.style.setProperty("--thumb-w", `${cur.offsetWidth}px`);
    thumb.style.setProperty("--thumb-x", `${cur.offsetLeft}px`);
    requestAnimationFrame(() => (thumb.dataset.ready = "true"));
    if (tabs.scrollWidth > tabs.clientWidth) cur.scrollIntoView({ block: "nearest", inline: "center", behavior: reduced() ? "auto" : "smooth" });
  };
  addEventListener("resize", place);
  return place;
}

/** Give each child an index so .stagger can cascade them in reading order. */
export function stagger(root, selector = ".glass") {
  root.querySelectorAll(selector).forEach((el, i) => el.style.setProperty("--i", Math.min(i, 14)));
}

/** Count a number up to its value, easing out; formats with the given function. */
export function countUp(el, value, format = (v) => Math.round(v).toLocaleString("en-IN"), ms = 900) {
  if (value == null || isNaN(value)) return;
  if (reduced()) { el.textContent = format(value); return; }
  const t0 = performance.now(), ease = (t) => 1 - Math.pow(1 - t, 4);
  const tick = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    el.textContent = format(value * ease(t));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
