// Geographic resolution + the global region filter (county -> municipality).
//
// IDs are opaque: we resolve purely by following refs. Each stop's TopographicPlaceRef
// points at a municipality; climbing ParentTopographicPlaceRef reaches the county
// (and country). TopographicPlaceType labels the level.

export function resolveRegions(model) {
  // Annotate each stop with { muni, county } (or null) by climbing the topo refs.
  for (const s of model.stops.values()) {
    let muni = null, county = null, cur = s.topoRef ? model.topo.get(s.topoRef) : null, guard = 0;
    while (cur && guard++ < 6) {
      if (!muni && cur.type === 'municipality') muni = cur;
      if (!county && cur.type === 'county') county = cur;
      cur = cur.parentRef ? model.topo.get(cur.parentRef) : null;
    }
    s.muni = muni ? { ref: muni.ref, name: muni.name } : null;
    s.county = county ? { ref: county.ref, name: county.name } : null;
  }

  // Build the county -> municipalities hierarchy from the stops actually present,
  // so the filter only offers regions that contain data.
  const counties = new Map();
  let unknown = 0;
  for (const s of model.stops.values()) {
    if (!s.county) { unknown++; continue; }
    let c = counties.get(s.county.ref);
    if (!c) { c = { ref: s.county.ref, name: s.county.name, count: 0, munis: new Map() }; counties.set(c.ref, c); }
    c.count++;
    if (s.muni) {
      let m = c.munis.get(s.muni.ref);
      if (!m) { m = { ref: s.muni.ref, name: s.muni.name, count: 0 }; c.munis.set(m.ref, m); }
      m.count++;
    }
  }
  const byName = (a, b) => a.name.localeCompare(b.name, 'no');
  const countyList = [...counties.values()]
    .map(c => ({ ref: c.ref, name: c.name, count: c.count, munis: [...c.munis.values()].sort(byName) }))
    .sort(byName);

  return { countyList, unknown };
}

// Holds the current selection and answers matches(stop). Single-select county +
// dependent single-select municipality covers the "I own region X" use case.
export function createRegionFilter() {
  let county = '', muni = '';
  return {
    set(c, m) { county = c; muni = m; },
    get() { return { county, muni }; },
    active() { return !!(county || muni); },
    matches(stop) {
      if (muni) return !!stop.muni && stop.muni.ref === muni;
      if (county) return !!stop.county && stop.county.ref === county;
      return true;
    },
  };
}
