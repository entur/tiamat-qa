// Shared Leaflet map for the suite. One instance, reused across tabs; tools add
// their own layer groups. Selectable background tiles.

const BACKGROUNDS = {
  'Positron (pale)': {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    opts: { subdomains: 'abcd', maxZoom: 19, attribution: 'OpenStreetMap, CARTO' },
  },
  'OpenStreetMap': {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    opts: { maxZoom: 19, attribution: 'OpenStreetMap contributors' },
  },
};

export function createMap(elId) {
  const map = L.map(elId, { preferCanvas: true }).setView([64.5, 16.5], 5);
  const layers = {};
  for (const [name, def] of Object.entries(BACKGROUNDS)) layers[name] = L.tileLayer(def.url, def.opts);
  let current = Object.keys(BACKGROUNDS)[0];
  layers[current].addTo(map);

  return {
    map,
    backgrounds: Object.keys(BACKGROUNDS),
    setBackground(name) {
      if (!layers[name] || name === current) return;
      map.removeLayer(layers[current]);
      layers[name].addTo(map);
      current = name;
    },
    fit(coords) {
      const pts = coords.filter(Boolean);
      if (pts.length === 1) map.setView(pts[0], 13);
      else if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40] });
    },
  };
}
