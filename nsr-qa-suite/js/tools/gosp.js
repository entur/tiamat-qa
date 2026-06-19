// GroupOfStopPlaces QA tool.
//
// Members are resolved against the loaded file's stop index (no API). A member
// is disapproved if it is expired, or is a monomodal child (has a parentSiteRef
// and is not itself a parent) — it should be reached via its parent, not listed
// directly in a group. See docs/METHOD-gosp.md.

import { CONFIG, THEME } from '../config.js';
import { escHtml, debounce } from '../util.js';

const POG_PALETTE = ['#6f42c1', '#0d6efd', '#fd7e14', '#20c997'];

function validate(stop) {
  const reasons = [];
  if (!stop) return { ok: false, reasons: ['Member not found in file'] };
  if (stop.expired) reasons.push(`Expired ${(stop.toDateRaw || '').slice(0, 10)}`);
  if (!stop.isParent && stop.parentRef) reasons.push('Monomodal child');
  return { ok: reasons.length === 0, reasons };
}

export default {
  id: 'gosp',
  label: 'GroupOfStopPlaces',

  mount(ctx) {
    this.ctx = ctx;
    this.errorsOnly = false;
    this.pogF = new Set();
    this.activeId = null;
    this._regionKey = null;
    this.markers = new Map();
    this.gospLayer = L.layerGroup();
    this.detailLayer = L.layerGroup();
    ctx.layer.addLayer(this.gospLayer);
    ctx.layer.addLayer(this.detailLayer);

    // Resolve members + validate once.
    this.items = ctx.model.gosps.map(g => {
      const members = g.memberRefs.map(r => ctx.model.stops.get(r) || null);
      const loaded = members.filter(Boolean);
      let ok = 0, bad = 0;
      for (const s of loaded) { if (validate(s).ok) ok++; else bad++; }
      bad += members.length - loaded.length;   // unresolved members count as problems
      return {
        gosp: g, members, ok, bad,
        search: [g.name, g.id].join(' ').toLowerCase(),
      };
    });

    // PoG colour map.
    const pogs = [...new Set(ctx.model.gosps.map(g => g.purpose || '—'))].sort();
    this.pogColor = {};
    pogs.forEach((p, i) => { this.pogColor[p] = POG_PALETTE[i % POG_PALETTE.length]; });

    ctx.pane.innerHTML =
      `<div class="pane-top">
        <div class="pane-title"><span>Groups of stop places</span><span class="pane-count" id="gs-count">—</span></div>
        <div class="sum-label">By purpose of grouping</div><div class="sum-row" id="gs-pog"></div>
        <input id="gs-search" type="text" placeholder="Filter by name or ID…" autocomplete="off"/>
        <button id="gs-errors" class="filter-toggle">⚠ Only groups with problems</button>
      </div>
      <div class="pane-list" id="gs-list"></div>`;

    ctx.pane.querySelector('#gs-search').addEventListener('input', debounce(() => this.render(), 150));
    ctx.pane.querySelector('#gs-errors').addEventListener('click', e => {
      this.errorsOnly = !this.errorsOnly;
      e.target.classList.toggle('active', this.errorsOnly);
      this.render();
    });
    ctx.pane.querySelector('#gs-pog').addEventListener('click', e => {
      const pill = e.target.closest('.sum-pill'); if (!pill) return;
      const v = pill.dataset.val;
      if (this.pogF.has(v)) this.pogF.delete(v); else this.pogF.add(v);
      this.render();
    });
  },

  matchesRegion(it) {
    if (!this.ctx.region.active()) return true;
    return it.members.some(s => s && this.ctx.region.matches(s));
  },

  inRegion() { return this.items.filter(it => this.matchesRegion(it)); },

  visible() {
    const q = this.ctx.pane.querySelector('#gs-search').value.toLowerCase();
    return this.inRegion().filter(it => {
      if (q && !it.search.includes(q)) return false;
      if (this.pogF.size && !this.pogF.has(it.gosp.purpose || '—')) return false;
      if (this.errorsOnly && it.bad === 0) return false;
      return true;
    });
  },

  render() {
    this.renderPog();
    this.renderList();
    this.renderGospPins();
    const key = JSON.stringify(this.ctx.region.get());
    if (key !== this._regionKey) {
      this._regionKey = key;
      this.detailLayer.clearLayers(); this.activeId = null;
      const pts = this.visible().map(it => it.gosp.centroid).filter(Boolean);
      if (pts.length) this.ctx.map.fit(pts);
    }
  },

  renderPog() {
    const region = this.inRegion();
    const count = {};
    for (const it of region) { const p = it.gosp.purpose || '—'; count[p] = (count[p] || 0) + 1; }
    this.ctx.pane.querySelector('#gs-pog').innerHTML = Object.keys(count).sort().map(p =>
      `<span class="sum-pill${this.pogF.has(p) ? ' active' : ''}" data-val="${escHtml(p)}">`
      + `<span class="sum-swatch" style="background:${this.pogColor[p]}"></span>${escHtml(p)} ${count[p].toLocaleString()}</span>`).join('');
  },

  renderList() {
    const vis = this.visible().sort((a, b) => b.bad - a.bad || a.gosp.name.localeCompare(b.gosp.name, 'no'));
    this.ctx.pane.querySelector('#gs-count').textContent = `${vis.length.toLocaleString()} / ${this.inRegion().length.toLocaleString()}`;
    const list = this.ctx.pane.querySelector('#gs-list');
    list.innerHTML = '';
    const CAP = 400;
    vis.slice(0, CAP).forEach(it => {
      const g = it.gosp;
      const div = document.createElement('div');
      div.className = 'stop-item' + (g.id === this.activeId ? ' active' : '');
      div.dataset.id = g.id;
      const href = CONFIG.nsrGroupUrl.replace('{id}', g.id);
      let safe = '#'; try { if (new URL(href).protocol === 'https:') safe = href; } catch (_) {}
      const missing = it.members.length - it.members.filter(Boolean).length;
      div.innerHTML =
        `<div class="si-name"><span class="gi-pog-dot" style="background:${this.pogColor[g.purpose || '—']}"></span>${escHtml(g.name)}`
        + `<a class="si-nsr-link" href="${escHtml(safe)}" target="_blank" rel="noopener">${escHtml(CONFIG.nsrLinkLabel)}</a></div>`
        + `<div class="si-id">${escHtml(g.id)}</div>`
        + `<div class="gi-purpose">${escHtml(g.purpose || '—')}</div>`
        + `<div class="gi-stats">`
        + `<span class="badge b-total">${it.members.length} stops</span>`
        + (it.ok ? `<span class="badge b-ok">✓ ${it.ok}</span>` : '')
        + (it.bad ? `<span class="badge b-bad">✗ ${it.bad}</span>` : '')
        + (missing ? `<span class="badge b-warn">? ${missing}</span>` : '')
        + `</div>`;
      div.querySelector('.si-nsr-link').addEventListener('click', e => e.stopPropagation());
      div.addEventListener('click', () => this.select(it));
      list.appendChild(div);
    });
    if (vis.length > CAP) {
      const m = document.createElement('div'); m.className = 'list-more';
      m.textContent = `Showing first ${CAP} of ${vis.length.toLocaleString()} — narrow the filter.`;
      list.appendChild(m);
    }
  },

  gospIcon(it, active) {
    const color = this.pogColor[it.gosp.purpose || '—'];
    const s = active ? 22 : 16, c = s / 2 + 2, size = s + 4;
    const bg = active ? color : color + 'cc';
    const border = active ? '3px solid #fff' : '2px solid rgba(255,255,255,0.85)';
    return L.divIcon({
      className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2], zIndexOffset: active ? 1000 : 0,
      html: `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${bg};border:${border};box-shadow:0 1px 4px rgba(0,0,0,0.4);margin:2px"></div>`,
    });
  },

  renderGospPins() {
    this.gospLayer.eachLayer(l => l.off()); this.gospLayer.clearLayers(); this.markers.clear();
    for (const it of this.visible()) {
      if (!it.gosp.centroid) continue;
      const m = L.marker(it.gosp.centroid, { icon: this.gospIcon(it, it.gosp.id === this.activeId) })
        .addTo(this.gospLayer)
        .bindTooltip(it.gosp.name, { direction: 'top', offset: [0, -6] });
      m.on('click', () => this.select(it));
      this.markers.set(it.gosp.id, m);
    }
  },

  select(it) {
    const g = it.gosp;
    const prev = this.activeId; this.activeId = g.id;
    if (prev && this.markers.has(prev)) { const p = this.items.find(x => x.gosp.id === prev); if (p) this.markers.get(prev).setIcon(this.gospIcon(p, false)); }
    if (this.markers.has(g.id)) this.markers.get(g.id).setIcon(this.gospIcon(it, true));

    this.ctx.pane.querySelectorAll('.stop-item.active').forEach(el => el.classList.remove('active'));
    const row = this.ctx.pane.querySelector(`.stop-item[data-id="${CSS.escape(g.id)}"]`);
    if (row) { row.classList.add('active'); row.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }

    // Detail: member markers (green/red) + dashed lines to the centroid.
    this.detailLayer.clearLayers();
    const bounds = g.centroid ? [g.centroid] : [];
    it.members.forEach((s, i) => {
      if (!s || !s.coord) return;
      bounds.push(s.coord);
      const v = validate(s);
      const color = v.ok ? THEME.ok : THEME.danger;
      if (g.centroid) L.polyline([g.centroid, s.coord], { color, weight: 2.5, opacity: 0.55, dashArray: '7 5' }).addTo(this.detailLayer);
      L.marker(s.coord, {
        icon: L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7], html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid rgba(0,0,0,0.4)"></div>` }),
      }).addTo(this.detailLayer)
        .bindPopup(`<div class="lp"><div class="lp-title">${escHtml(s.name)}</div><div class="lp-id">${escHtml(s.id)}</div>`
          + (v.ok ? `<div class="lp-ok">✓ Approved member</div>` : `<div class="lp-bad">✗ ${v.reasons.map(escHtml).join(', ')}</div>`) + `</div>`);
    });
    if (bounds.length > 1) this.ctx.map.map.fitBounds(bounds, { padding: [55, 55], maxZoom: 14 });
    else if (bounds.length === 1) this.ctx.map.map.setView(bounds[0], 13);
  },
};
