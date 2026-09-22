// The living map. MapLibre GL 5 on a light OpenFreeMap basemap, globe projection,
// no API keys and no tracking. Every other surface of WildTrace floats over this.
import { esc } from "./charts.js";

const STYLE = "https://tiles.openfreemap.org/styles/positron";
export const KIND = (k) => (k === "seizure" ? "seizure" : k === "arrest" || k === "conviction" ? "arrest" : "other");
export const KIND_COLOR = { seizure: "#2a78d6", arrest: "#eb6834", other: "#1baf7a" };
export const KIND_LABEL = { seizure: "Seizure", arrest: "Arrest · conviction", other: "Rescue · report" };
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const EMPTY = { type: "FeatureCollection", features: [] };

/** Great-circle arc between two [lon, lat] points (slerp), for routes that read as flights. */
export function arc(a, b, n = 64) {
  const r = Math.PI / 180, toV = ([lo, la]) => [Math.cos(la * r) * Math.cos(lo * r), Math.cos(la * r) * Math.sin(lo * r), Math.sin(la * r)];
  const A = toV(a), B = toV(b), d = Math.acos(Math.min(1, Math.max(-1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])));
  if (d < 1e-6) return [a, b];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s1 = Math.sin((1 - t) * d) / Math.sin(d), s2 = Math.sin(t * d) / Math.sin(d);
    const x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
    out.push([Math.atan2(y, x) / r, Math.atan2(z, Math.hypot(x, y)) / r]);
  }
  for (let i = 1; i < out.length; i++) { // keep longitudes continuous across the antimeridian
    while (out[i][0] - out[i - 1][0] > 180) out[i][0] -= 360;
    while (out[i][0] - out[i - 1][0] < -180) out[i][0] += 360;
  }
  return out;
}

export function createGlobe(el, { onPick, onReady } = {}) {
  if (!window.maplibregl) { el.innerHTML = `<p style="padding:120px 24px">The map library did not load. Check your connection and reload.</p>`; return null; }
  const small = innerWidth < 860;
  const map = new maplibregl.Map({
    container: el, center: [30, 12], zoom: small ? 0.9 : 1.75, minZoom: 0.4,
    attributionControl: { compact: true }, maxPitch: 60,
  });
  map.on("error", (e) => console.warn("[wildtrace map]", e?.error?.message || e));
  // Globe and sky are part of the style from the first frame (MapLibre's documented pattern).
  map.setStyle(STYLE, {
    transformStyle: (_prev, next) => ({
      ...next,
      // Lighter sea and land than stock Positron: evidence marks carry the colour, the base map recedes.
      layers: next.layers.map((l) => {
        if (l.type === "background") return { ...l, paint: { ...l.paint, "background-color": "#f7f8f5" } };
        if (l.id === "water") return { ...l, paint: { ...l.paint, "fill-color": "#d3e2ea" } };
        if (l.type === "symbol" && l.layout?.["text-field"]) {
          // One language on the map (English, else Latin script, else local): no stacked bilingual labels.
          const out = { ...l, layout: { ...l.layout, "text-field": ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]] } };
          if (/village|hamlet|suburb|neighbourhood|poi|place_other|isolated/.test(l.id)) out.minzoom = Math.max(l.minzoom || 0, 9);
          else if (/town/.test(l.id)) out.minzoom = Math.max(l.minzoom || 0, 5.5);
          if (/country/.test(l.id)) out.paint = { ...(l.paint || {}), "text-color": "#3c4a45" };
          return out;
        }
        return l;
      }),
      projection: { type: "globe" },
      // A pale atmosphere on a mist ground: the globe floats in light, never in black space.
      sky: { "sky-color": "#dfe9f2", "horizon-color": "#f4f7f6", "fog-color": "#edf1ef",
        "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.8, "fog-ground-blend": 0.5,
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 4, 0.4, 7, 0] },
    }),
  });

  const popup = new maplibregl.Popup({ closeButton: false, offset: 12, maxWidth: "280px" });
  map.on("load", () => {
    // Centre the globe in the space the panels leave free.
    map.jumpTo({ center: [30, 12], zoom: small ? 0.9 : 1.75, padding: api.padding() });
    // ---- routes (under points)
    map.addSource("routes", { type: "geojson", data: EMPTY, lineMetrics: true });
    map.addLayer({ id: "routes", type: "line", source: "routes", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-width": ["interpolate", ["linear"], ["get", "n"], 1, 2, 8, 5],
        "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "rgba(194,122,6,0.15)", 1, "rgba(194,122,6,0.95)"] } });
    // ---- observatories
    map.addSource("obs", { type: "geojson", data: EMPTY });
    map.addLayer({ id: "obs", type: "circle", source: "obs", layout: { visibility: "none" },
      paint: { "circle-radius": 6.5, "circle-color": "#ffffff", "circle-stroke-color": "#0e8f88", "circle-stroke-width": 3 } });
    // ---- the analyst's own data (local only)
    map.addSource("mine", { type: "geojson", data: EMPTY });
    map.addLayer({ id: "mine", type: "circle", source: "mine",
      paint: { "circle-radius": 6, "circle-color": "#6550c8", "circle-stroke-color": "#fff", "circle-stroke-width": 2, "circle-opacity": 0.9 } });
    // ---- density glow at world scale (unclustered copy of the cases)
    map.addSource("heat", { type: "geojson", data: EMPTY });
    map.addLayer({ id: "heat", type: "heatmap", source: "heat", maxzoom: 6,
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "n_sources"], 1, 0.55, 10, 1],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.9, 5, 2],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 18, 3, 34, 6, 44],
        "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.75, 3.5, 0.45, 5.5, 0],
        "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"],
          0, "rgba(214,69,61,0)", 0.2, "rgba(236,150,110,0.35)", 0.5, "rgba(226,96,72,0.55)", 0.8, "rgba(214,69,61,0.75)", 1, "rgba(168,39,31,0.85)"],
      } });
    // ---- cases, clustered
    map.addSource("cases", { type: "geojson", data: EMPTY, cluster: true, clusterMaxZoom: 6, clusterRadius: 42 });
    map.addLayer({ id: "clusters", type: "circle", source: "cases", filter: ["has", "point_count"],
      paint: { "circle-color": "rgba(255,255,255,0.92)", "circle-stroke-color": "rgba(15,26,23,0.55)", "circle-stroke-width": 1.2,
        // Discs shrink on a small, zoomed-out globe (phones) so neighbouring clusters don't cover each other.
        "circle-radius": ["interpolate", ["linear"], ["zoom"],
          0.6, ["step", ["get", "point_count"], 9, 5, 11, 20, 14, 60, 17],
          1.8, ["step", ["get", "point_count"], 13, 5, 17, 20, 22, 60, 28]] } });
    map.addLayer({ id: "cluster-n", type: "symbol", source: "cases", filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": ["interpolate", ["linear"], ["zoom"], 0.6, 10, 1.8, 12], "text-font": ["Noto Sans Bold"], "text-allow-overlap": true },
      paint: { "text-color": "#0f1a17" } });
    const kindColor = ["match", ["get", "kg"], "seizure", KIND_COLOR.seizure, "arrest", KIND_COLOR.arrest, KIND_COLOR.other];
    const approx = ["any", ["==", ["get", "basis"], "outlet"], ["==", ["get", "level"], "country"]];
    map.addLayer({ id: "halo", type: "circle", source: "cases", filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], ""]],
      paint: { "circle-radius": 18, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#0f1a17", "circle-stroke-width": 2, "circle-stroke-opacity": 0.6 } });
    map.addLayer({ id: "points", type: "circle", source: "cases", filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "n_sources"], 1, 6, 5, 9, 20, 13],
        "circle-color": kindColor,
        // Evidence strength: single reports are paler; approximate places are hollow rings.
        "circle-opacity": ["case", approx, 0.12, ["==", ["get", "ver"], "single"], 0.55, 0.95],
        "circle-stroke-color": ["case", approx, kindColor, "#ffffff"],
        "circle-stroke-width": ["case", approx, 2.5, ["in", ["get", "ver"], ["literal", ["official", "validated"]]], 3, 2],
      } });

    const hover = (layer, html) => {
      map.on("mouseenter", layer, (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features[0];
        popup.setLngLat(f.geometry.type === "Point" ? f.geometry.coordinates : e.lngLat).setHTML(html(f.properties)).addTo(map);
      });
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; popup.remove(); });
    };
    const VER = { validated: "Validated", official: "Official source", corroborated: "Corroborated", single: "Single report" };
    hover("points", (p) => `<div class="muted" style="font-size:12px">${esc(p.date || "undated")} · ${esc(KIND_LABEL[p.kg])} · ${esc(VER[p.ver] || "")}</div><b>${esc(p.summary)}</b><div class="muted" style="font-size:12px">${p.n_sources} report(s)${p.basis === "outlet" ? " · place inferred from publisher" : p.level === "country" ? " · country-level location" : ""}</div>`);
    hover("obs", (p) => `<div class="muted" style="font-size:12px">Observatory · ${esc(p.city)}</div><b>${esc(p.name)}</b>`);
    hover("mine", (p) => `<div class="muted" style="font-size:12px">Your data (local)</div><b>${esc(p.label)}</b>`);
    hover("routes", (p) => `<b>${esc(p.label)}</b><div class="muted" style="font-size:12px">${p.n} case(s) · route as reported</div>`);
    map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
    map.on("click", "clusters", async (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
      const z = await map.getSource("cases").getClusterExpansionZoom(f.properties.cluster_id);
      map.easeTo({ center: f.geometry.coordinates, zoom: z + 0.3, duration: reduced() ? 0 : 700 });
    });
    map.on("click", "points", (e) => onPick?.({ kind: "case", id: e.features[0].properties.id }));
    map.on("click", "obs", (e) => onPick?.({ kind: "obs", id: e.features[0].properties.id }));
    map.on("click", "mine", (e) => onPick?.({ kind: "entity", id: e.features[0].properties.id }));
    ["mousedown", "touchstart", "wheel", "dragstart"].forEach((ev) => map.on(ev, () => api.spin(false)));
    map.on("moveend", () => spinning && spinStep());
    onReady?.();
    setTimeout(() => api.spin(true), 1200);
  });

  // Idle rotation: a slow drift that stops for good once the reader touches the map.
  let spinning = false;
  const spinStep = () => {
    if (!spinning || map.getZoom() > 3 || document.body.classList.contains("inspecting")) return;
    const c = map.getCenter(); c.lng -= 6;
    map.easeTo({ center: c, duration: 4000, easing: (t) => t });
  };
  // Selected-case pulse: the halo breathes so the eye finds the case after a flight.
  let pulseRaf = 0;
  const pulse = (t) => {
    if (!map.getLayer("halo")) return;
    const k = (Math.sin(t / 380) + 1) / 2;
    map.setPaintProperty("halo", "circle-radius", 15 + k * 9);
    map.setPaintProperty("halo", "circle-stroke-opacity", 0.75 - k * 0.5);
    pulseRaf = requestAnimationFrame(pulse);
  };

  const api = {
    map,
    set(source, fc) { const s = map.getSource(source); if (s) s.setData(fc); },
    visible(layer, on) {
      const ids = layer === "cases" ? ["clusters", "cluster-n", "points", "halo", "heat"] : [layer];
      ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none"));
    },
    highlight(id) {
      if (!map.getLayer("halo")) return;
      map.setFilter("halo", ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], id || ""]]);
      cancelAnimationFrame(pulseRaf);
      if (id && !reduced()) pulseRaf = requestAnimationFrame(pulse);
    },
    spin(on) { spinning = on && !reduced(); if (spinning) spinStep(); },
    get spinning() { return spinning; },
    fly(center, zoom = 6) {
      const o = { center, zoom: Math.max(zoom, 1.2) };
      reduced() ? map.jumpTo(o) : map.flyTo({ ...o, speed: 0.9, curve: 1.5, essential: false, padding: api.padding() });
    },
    fit(bounds) {
      if (!bounds) return;
      map.fitBounds(bounds, { padding: api.padding(60), maxZoom: 6, duration: reduced() ? 0 : 1400 });
    },
    world() { const o = { center: [30, 12], zoom: small ? 0.9 : 1.75, pitch: 0, bearing: 0, padding: api.padding() };
      reduced() ? map.jumpTo(o) : map.flyTo({ ...o, speed: 0.8 }); },
    toggleProjection() {
      const globe = map.getProjection()?.type === "globe";
      map.setProjection({ type: globe ? "mercator" : "globe" });
      return !globe;
    },
    // Keep flights centred in the part of the map that panels do not cover.
    padding(extra = 0) {
      if (innerWidth < 860) return { top: 140 + extra, bottom: innerHeight * 0.45, left: 20, right: 20 };
      const insp = document.body.classList.contains("inspecting") ? 450 : 20;
      const pulse = document.getElementById("pulse")?.classList.contains("folded") ? 70 : 390;
      return { top: 90 + extra, bottom: 140 + extra, left: pulse + extra, right: insp + extra };
    },
  };
  return api;
}
