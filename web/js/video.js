// The 2-minute video guide: a real recording of the Atlas answering three research questions
// (scripts/make_guide.py). Opened from the Tour menu, the welcome card and About. Captions are burned
// into the picture and also offered as a text track for screen readers.
let root = null, lastFocus = null;

export function openGuide() {
  if (root) return;
  lastFocus = document.activeElement;
  root = document.createElement("div");
  root.className = "guide";
  root.innerHTML = `
    <div class="guide-veil"></div>
    <div class="guide-card glass" role="dialog" aria-modal="true" aria-label="WildTrace in 2 minutes: video guide">
      <div class="guide-head"><b>WildTrace in 2 minutes</b><span class="muted">Three research questions, answered on the live Atlas</span>
        <button class="icon-btn" aria-label="Close the video"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <video controls playsinline preload="metadata" poster="media/guide.jpg">
        <source src="media/guide.mp4" type="video/mp4">
        <track kind="captions" src="media/guide.vtt" srclang="en" label="English">
        Your browser cannot play this video. <a href="media/guide.mp4" download>Download it (MP4, 4 MB)</a>.
      </video>
      <p class="muted guide-foot">1 min 51 s · no sound, captions on screen · <a href="media/guide.mp4" download>download MP4</a></p>
    </div>`;
  document.body.append(root);
  const close = () => { root?.remove(); root = null; removeEventListener("keydown", onKey, true); lastFocus?.focus?.(); };
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
  addEventListener("keydown", onKey, true);
  root.querySelector(".guide-veil").addEventListener("click", close);
  root.querySelector(".guide-head button").addEventListener("click", close);
  const v = root.querySelector("video");
  v.focus();
  v.play?.().catch(() => { /* the reader presses play */ });
}
