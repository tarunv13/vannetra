// WebGIS: MapLibre on a light OpenFreeMap basemap (no API key, no tracking).
// Cases are clustered; colour encodes the kind of case (3 classes: the first
// three validated slots) and every point also carries a text label in the popup.

import { esc } from "./charts.js";

export const KIND_GROUP = (k) => (k === "seizure" ? "seizure" : k === "arrest" || k === "conviction" ? "arrest" : "other");
export const KIND_COLOR = { seizure: "#2a78d6", arrest: "#eb6834", other: "#1baf7a" };
export const KIND_LABEL = { seizure: "Seizure", arrest: "Arrest / conviction", other: "Rescue / report" };
const STYLE = "https://tiles.openfreemap.org/styles/positron";

export function caseMap(el, geojson, { onSelect, center = [90, 18], zoom = 3.3 } = {}) {
  if (!window.maplibregl) { el.innerHTML = `<div class="empty">Map library failed to load (offline?).</div>`; return null; }
  const data = { ...geojson, features: geojson.features.map((f) => ({ ...f, properties: { ...f.properties, kg: KIND_GROUP(f.properties.kind) } })) };
  const map = new maplibregl.Map({ container: el, style: STYLE, center, zoom, attributionControl: { compact: true }, cooperativeGestures: false });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new maplibregl.FullscreenControl(), "top-right");

  map.on("load", () => {
    map.addSource("cases", { type: "geojson", data, cluster: true, clusterMaxZoom: 9, clusterRadius: 44 });
    map.addLayer({ id: "clusters", type: "circle", source: "cases", filter: ["has", "point_count"],
      paint: {
        "circle-color": "rgba(28,92,171,0.16)", "circle-stroke-color": "#1c5cab", "circle-stroke-width": 1.5,
        "circle-radius": ["step", ["get", "point_count"], 15, 10, 20, 50, 27, 200, 34],
      } });
    map.addLayer({ id: "cluster-count", type: "symbol", source: "cases", filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12, "text-font": ["Noto Sans Bold"] },
      paint: { "text-color": "#0f172a" } });
    map.addLayer({ id: "points", type: "circle", source: "cases", filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["match", ["get", "kg"], "seizure", KIND_COLOR.seizure, "arrest", KIND_COLOR.arrest, KIND_COLOR.other],
        "circle-radius": ["interpolate", ["linear"], ["get", "n_sources"], 1, 6, 5, 9, 12, 12],
        "circle-stroke-color": "#ffffff", "circle-stroke-width": 2, "circle-opacity": 0.92,
      } });

    map.on("click", "clusters", async (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
      const z = await map.getSource("cases").getClusterExpansionZoom(f.properties.cluster_id);
      map.easeTo({ center: f.geometry.coordinates, zoom: z });
    });
    const popup = new maplibregl.Popup({ closeButton: false, offset: 12 });
    map.on("mouseenter", "points", (e) => {
      map.getCanvas().style.cursor = "pointer";
      const p = e.features[0].properties;
      popup.setLngLat(e.features[0].geometry.coordinates)
        .setHTML(`<div class="small muted">${esc(p.date || "undated")} · ${esc(KIND_LABEL[p.kg])}</div><b>${esc(p.summary)}</b><div class="small muted">${p.n_sources} source(s) · click for case report</div>`)
        .addTo(map);
    });
    map.on("mouseleave", "points", () => { map.getCanvas().style.cursor = ""; popup.remove(); });
    map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
    map.on("click", "points", (e) => onSelect && onSelect(e.features[0].properties.id));
  });
  return map;
}

export function setCases(map, geojson) {
  const src = map?.getSource?.("cases");
  if (!src) return;
  src.setData({ ...geojson, features: geojson.features.map((f) => ({ ...f, properties: { ...f.properties, kg: KIND_GROUP(f.properties.kind) } })) });
}

/** Curved arcs between places (trade routes). routes: [{from:{lon,lat,name}, to:{...}, n}] */
export function routeMap(el, routes, { color = "#8a4b00" } = {}) {
  if (!window.maplibregl) return null;
  const map = new maplibregl.Map({ container: el, style: STYLE, center: [92, 18], zoom: 3.1, attributionControl: { compact: true } });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  const arc = (a, b) => {
    const [x1, y1] = a, [x2, y2] = b, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const dx = x2 - x1, dy = y2 - y1, k = 0.22;
    const cx = mx - dy * k, cy = my + dx * k;
    return Array.from({ length: 33 }, (_, i) => { const t = i / 32; return [(1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t * t * x2, (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t * t * y2]; });
  };
  const lines = { type: "FeatureCollection", features: routes.map((r) => ({ type: "Feature",
    properties: { n: r.n, label: `${r.from.name} → ${r.to.name}` },
    geometry: { type: "LineString", coordinates: arc([r.from.lon, r.from.lat], [r.to.lon, r.to.lat]) } })) };
  const nodes = {};
  routes.forEach((r) => { for (const p of [r.from, r.to]) nodes[p.name] = p; });
  const pts = { type: "FeatureCollection", features: Object.values(nodes).map((p) => ({ type: "Feature", properties: { name: p.name }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })) };
  map.on("load", () => {
    map.addSource("routes", { type: "geojson", data: lines });
    map.addLayer({ id: "routes", type: "line", source: "routes", layout: { "line-cap": "round" },
      paint: { "line-color": color, "line-opacity": 0.75, "line-width": ["interpolate", ["linear"], ["get", "n"], 1, 2, 10, 6] } });
    map.addSource("nodes", { type: "geojson", data: pts });
    map.addLayer({ id: "nodes", type: "circle", source: "nodes", paint: { "circle-radius": 5, "circle-color": "#fff", "circle-stroke-color": color, "circle-stroke-width": 2 } });
    map.addLayer({ id: "node-labels", type: "symbol", source: "nodes",
      layout: { "text-field": ["get", "name"], "text-size": 11.5, "text-offset": [0, 1.1], "text-anchor": "top", "text-font": ["Noto Sans Regular"] },
      paint: { "text-color": "#3b4555", "text-halo-color": "#fff", "text-halo-width": 1.4 } });
    const popup = new maplibregl.Popup({ closeButton: false });
    map.on("mousemove", "routes", (e) => { popup.setLngLat(e.lngLat).setHTML(`<b>${esc(e.features[0].properties.label)}</b><br>${e.features[0].properties.n} case(s)`).addTo(map); });
    map.on("mouseleave", "routes", () => popup.remove());
  });
  return map;
}

/**
 * Glide: a guided flight through cases, one stop at a time. A glass card names
 * each stop, and a draining hairline shows how long until the next. Pause,
 * previous, next and exit are always available. With reduced motion the map
 * jumps instead of flying and does not auto-advance.
 */
export function glide(map, stops, host, { dwell = 5200, onOpen, onEnd } = {}) {
  if (!map || !stops.length) return null;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const card = document.createElement("div");
  card.className = "tour glass";
  card.setAttribute("role", "region");
  card.setAttribute("aria-label", "Guided tour of cases");
  card.setAttribute("aria-live", "polite");
  host.append(card);
  let i = 0, timer = null, paused = reduce;

  const show = () => {
    const s = stops[i];
    const [lon, lat] = s.geometry.coordinates, p = s.properties;
    const opts = { center: [lon, lat], zoom: p.level === "country" ? 4.2 : p.level === "state" ? 5.6 : 7.4, pitch: 38, bearing: (i % 2 ? -12 : 12) };
    reduce ? map.jumpTo(opts) : map.flyTo({ ...opts, speed: 0.7, curve: 1.5, essential: false });
    card.innerHTML = `<div class="tour-step">
        <div class="meta"><span><span class="live-dot"></span>&nbsp; Stop ${i + 1} of ${stops.length} · ${esc(p.date || "undated")}</span><span>${esc(KIND_LABEL[KIND_GROUP(p.kind)])}</span></div>
        <div class="title">${esc(p.summary)}</div>
        <div class="controls">
          <button class="btn" data-a="prev" aria-label="Previous stop">‹</button>
          <button class="btn" data-a="pause">${paused ? "Play" : "Pause"}</button>
          <button class="btn" data-a="next" aria-label="Next stop">›</button>
          <button class="btn primary" data-a="open">Case report</button>
          <span style="flex:1"></span>
          <button class="btn ghost" data-a="exit" aria-label="Exit tour">✕</button>
        </div>
        <div class="hairline"><i style="animation-duration:${dwell}ms"></i></div></div>`;
    card.classList.toggle("paused", paused);
    card.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => act(b.dataset.a)));
    schedule();
  };
  const schedule = () => { clearTimeout(timer); if (!paused) timer = setTimeout(() => (i < stops.length - 1 ? (i++, show()) : stop()), dwell); };
  const stop = () => {
    clearTimeout(timer); card.remove();
    reduce ? map.jumpTo({ pitch: 0, bearing: 0 }) : map.easeTo({ pitch: 0, bearing: 0, zoom: 3.3, center: [90, 18], duration: 1200 });
    onEnd && onEnd();
  };
  const act = (a) => {
    if (a === "prev") { i = Math.max(0, i - 1); show(); }
    if (a === "next") { i = Math.min(stops.length - 1, i + 1); show(); }
    if (a === "pause") { paused = !paused; show(); }
    if (a === "open") { paused = true; show(); onOpen && onOpen(stops[i].properties.id); }
    if (a === "exit") stop();
  };
  const onKey = (e) => { if (e.key === "Escape" && card.isConnected) { stop(); removeEventListener("keydown", onKey); } };
  addEventListener("keydown", onKey);
  show();
  return { stop };
}

/** Glide the map to one case (used when a case is picked from a list). */
export function flyToCase(map, feature) {
  if (!map || !feature) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const o = { center: feature.geometry.coordinates, zoom: Math.max(map.getZoom(), 6.5) };
  reduce ? map.jumpTo(o) : map.flyTo({ ...o, speed: 0.9, curve: 1.4 });
}
