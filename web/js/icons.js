// Icons and logos, all self-hosted.
// Species: PhyloPic silhouettes (CC0 / public domain / CC BY; credits in About), web/icons/species.
// Products and case kinds: Tabler Icons (MIT), web/icons/ui. Outlets and organisations: their own
// site icons, fetched once at build time into web/logos (identification only, no endorsement).
// Every icon is a CSS mask, so it takes the colour of the text around it.
import { esc } from "./charts.js";
import { S } from "./store.js";

// A url() inside a CSS variable resolves against the stylesheet, not the page: pass an absolute URL.
const abs = (u) => new URL(u, document.baseURI).href;
const mask = (url, cls = "ico", label = "") =>
  `<span class="${cls}" style="--m:url('${abs(url)}')"${label ? ` role="img" aria-label="${esc(label)}"` : ' aria-hidden="true"'}></span>`;

export const ui = (name, label = "") => mask(`icons/ui/${name}.svg`, "ico", label);

/** Silhouette for a species group; plants without one get a leaf, animals a paw. */
export function sp(gid, label = "") {
  if (S.data.speciesIcons?.[gid]) return mask(`icons/species/${gid}.svg`, "ico sp", label);
  return ui(S.data.species?.[gid]?.kingdom === "plant" ? "leaf" : "paw", label);
}

const KIND = { seizure: ["package", "Seizure"], arrest: ["lock", "Arrest"], conviction: ["gavel", "Conviction"],
  rescue: ["heart-handshake", "Rescue"], report: ["news", "Report"] };
export const kind = (k) => ui((KIND[k] || KIND.seizure)[0], (KIND[k] || [0, k])[1]);

// CITES "Term" (what was traded) -> an icon for the product.
const TERMS = [
  [/ivory|tusk|horn|tooth|teeth|bone|skull|carving|trophy|claw/i, "bone"],
  [/skin|leather|hide|fur|shoe|handbag|belt|watchstrap|garment/i, "shirt"],
  [/scale/i, "diamond"],
  [/meat|musk|gall|bile/i, "meat"],
  [/timber|log|sawn|wood|chips|veneer|carvings? \(wood\)/i, "wood"],
  [/extract|derivative|medicin|powder|oil|pill|capsule|bark/i, "pill"],
  [/feather|plume/i, "feather"],
  [/egg|caviar/i, "egg"],
  [/fin|fish|shark|meat \(fish\)/i, "fish"],
  [/coral|shell|sea|reef/i, "ripple"],
  [/specimen|scientific|sample|dna|blood|tissue/i, "microscope"],
  [/flower|leaves|leaf|root|seed|bulb|plant/i, "plant-2"],
  [/live/i, "paw"],
];
export const term = (t, plant = false) => ui(t && /^live$/i.test(t) && plant ? "plant-2" : (TERMS.find(([re]) => re.test(t || ""))?.[1] || "package"), t);

/** An outlet's logo, or its initial on a neutral disc when the site offers no icon. */
export function outlet(name) {
  const d = S.data.outlets?.outlets?.[name];
  if (d) return `<img class="logo" src="logos/${esc(d)}.png" alt="" loading="lazy" width="16" height="16">`;
  return `<span class="logo letter" aria-hidden="true">${esc((name || "?").replace(/^(the|www\.)\s*/i, "").charAt(0).toUpperCase())}</span>`;
}
export function org(id, name = "") {
  const d = S.data.outlets?.observatories?.[id];
  return d ? `<img class="logo lg" src="logos/${esc(d)}.png" alt="" loading="lazy" width="24" height="24">`
    : `<span class="logo lg letter" aria-hidden="true">${esc((name || "?").charAt(0).toUpperCase())}</span>`;
}
