/* Microsoft Clarity: how the Atlas is actually used.
 *
 * Clarity records interactions (clicks, scrolling, movement) and replays sessions, and it sets
 * cookies. That is a real trade-off for a site about wildlife crime, so it is kept honest here:
 *
 *   * the project id lives in index.html as data-clarity on <body>, so a fork can drop it out
 *     and get no tracking at all, without editing any code;
 *   * the search box and the whole Investigate panel carry data-clarity-mask, so a query someone
 *     typed, and any file they imported, never reach a replay;
 *   * it loads after the map, and never blocks it;
 *   * About says plainly that it runs, with a link to Microsoft's privacy statement.
 *
 * What it must never carry: anything a reader imported into Investigate. That data stays in their
 * browser, and the panel that renders it is masked, so a replay shows the shape of the panel and
 * not its contents.
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
    // Consent, stated explicitly: analytics storage yes, advertising storage never. ("set" is for
    // custom tags, not masking — masking is the dashboard's Strict setting plus the
    // data-clarity-mask attributes in index.html.)
    window.clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });
  } catch { /* an ad blocker, or no network: the site works exactly the same */ }
}
