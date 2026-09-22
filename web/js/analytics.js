/* Microsoft Clarity: how the Atlas is actually used.
 *
 * Clarity records interactions (clicks, scrolling, movement) and replays sessions, and it sets
 * cookies. That is a real trade-off for a site about wildlife crime, so it is kept honest here:
 *
 *   * the project id lives in index.html as data-clarity on <body>, so a fork can drop it out
 *     and get no tracking at all, without editing any code;
 *   * masking is on: Clarity is told to mask text, so what a reader typed in the search box is
 *     not shipped off in the replay;
 *   * it loads after the map, and never blocks it;
 *   * About says plainly that it runs, with a link to Microsoft's privacy statement.
 *
 * What it must never carry: anything a reader imported into Investigate, which stays in their
 * browser. That data lives in local storage and is never written into the DOM as text a replay
 * could reconstruct beyond the labels already on the chart.
 */
export function startAnalytics() {
  const id = document.body.dataset.clarity;
  if (!id || id === "REPLACE_ME") return;              // no id: no tracking, by design
  if (navigator.globalPrivacyControl) return;          // honour an explicit "do not sell/share" signal
  try {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, "clarity", "script", id);
    // Mask text by default: a replay should show the shape of a visit, not what was typed.
    window.clarity("consent");
    window.clarity("set", "masking", "strict");
  } catch { /* an ad blocker, or no network: the site works exactly the same */ }
}
