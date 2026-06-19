// Tags QA tool.
//
// Tags are an Entur front-end concept stored in StopPlace keyList as
// TAG-{n}-{field}. They are "post-it notes" flagging something to follow up.
// There is no per-tag quality score (impossible to compute); the tool tracks
// RESOLUTION PROGRESS: how many open tags remain, how old they are (older = worse),
// and by which tag name. "Now" is the file's PublicationTimestamp.
// See docs/METHOD-tags.md.

import { CONFIG, THEME } from '../config.js';
import { escHtml, fmtDate, confColor, debounce } from '../util.js';

const RULES = {
  // Age (days) at which an open tag is treated as maximally severe (colour-wise).
  ageFullDays: 1095,   // ~3 years
};
const PALETTE = ['#6f42c1', '#0d6efd', '#fd7e14', '#20c997', '#e83e8c', '#17a2b8', '#fab005', '#495057'];

function ageText(days) {
  if (days < 1) return 'today';
  if (days < 60) return `${days}d`;
  if (days < 730) return `${Math.floor(days / 30.44)}mnd`;
  return `${(days / 365.25).toFixed(1)}y`;
}

export default {
  id: 'tags',
  label: 'Tags',

  mount(ctx) {
    this.ctx = ctx;
    this.nameF = new Set();
    this.sort = 'oldest';
    this.activeId = null;
    this._regionKey = null;
    this.markers = new Map();

    const now = ctx.model.publishedAt ? Date.parse(ctx.model.publishedAt) : Date.now();
    this.now = Number.isFinite(now) ? now : Date.now();

    // Build per-stop tag items + a colour per distinct tag name.
    const names = new Set();
    this.items = [];
    for (const s of ctx.model.stops.values()) {
      if (!s.tags.length) continue;
      const tags = s.tags.map(t => {
        const open = !t.removed;
        const ageDays = t.created ? Math.floor((this.now - t.created) / 86400000) : null;
        names.add(t.name);
        return { ...t, open, ageDays };
      });
      const openTags = tags.filter(t => t.open);
      const oldestOpen = openTags.reduce((min, t) => (t.created && (min === null || t.created < min) ? t.created : min), null);
      const severity = oldestOpen ? Math.min(1, Math.floor((this.now - oldestOpen) / 86400000) / RULES.ageFullDays) : 0;
      this.items.push({
        stop: s, tags, openTags, oldestOpen, severity,
        names: new Set(openTags.map(t => t.name)),
        search: [s.name, s.id, ...tags.map(t => t.name + ' ' + t.comment)].join(' ').toLowerCase(),
      });
    }
    this.nameColor = {};
    [...names].sort().forEach((n, i) => { this.nameColor[n] = PALETTE[i % PALETTE.length]; });

    ctx.pane.innerHTML =
      `<div class="pane-top">
        <div class="pane-title"><span>Stops with open tags</span><span class="pane-count" id="tg-count">—</span></div>
        <div id="tg-stats" class="tg-stats"></div>
        <div class="sum-label">By tag</div><div class="sum-row" id="tg-names"></div>
        <input id="tg-search" type="text" placeholder="Filter by name, ID or comment…" autocomplete="off"/>
        <label class="ctl">Sort
          <select id="tg-sort">
            <option value="oldest">Oldest open first</option>
            <option value="newest">Newest open first</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
      <div class="pane-list" id="tg-list"></div>`;

    ctx.pane.querySelector('#tg-search').addEventListener('input', debounce(() => this.render(), 150));
    ctx.pane.querySelector('#tg-sort').addEventListener('change', e => { this.sort = e.target.value; this.renderList(); });
    ctx.pane.querySelector('#tg-names').addEventListener('click', e => {
      const pill = e.target.closest('.sum-pill'); if (!pill) return;
      const v = pill.dataset.val;
      if (this.nameF.has(v)) this.nameF.delete(v); else this.nameF.add(v);
      this.render();
    });
  },

  // Stops with at least one OPEN tag, within the current region.
  inRegion() { return this.items.filter(it => it.openTags.length && this.ctx.region.matches(it.stop)); },

  visible() {
    const q = this.ctx.pane.querySelector('#tg-search').value.toLowerCase();
    return this.inRegion().filter(it => {
      if (q && !it.search.includes(q)) return false;
      if (this.nameF.size && ![...it.names].some(n => this.nameF.has(n))) return false;
      return true;
    });
  },

  render() {
    this.renderStats();
    this.renderList();
    this.renderMarkers();
    const key = JSON.stringify(this.ctx.region.get());
    if (key !== this._regionKey) {
      this._regionKey = key;
      const pts = this.visible().map(it => it.stop.coord).filter(Boolean);
      if (pts.length) this.ctx.map.fit(pts);
    }
  },

  renderStats() {
    const region = this.inRegion();
    let openTags = 0, resolved = 0, oldest = null;
    const nameCount = {};
    for (const it of region) {
      openTags += it.openTags.length;
      for (const t of it.tags) {
        if (t.open) { nameCount[t.name] = (nameCount[t.name] || 0) + 1; if (t.created && (oldest === null || t.created < oldest)) oldest = t.created; }
        else resolved++;
      }
    }
    const oldestDays = oldest ? Math.floor((this.now - oldest) / 86400000) : 0;
    this.ctx.pane.querySelector('#tg-stats').innerHTML =
      `<div class="stat-grid compact">
        <div class="stat-card"><div class="stat-num">${region.length.toLocaleString()}</div><div class="stat-lbl">stops, open tags</div></div>
        <div class="stat-card"><div class="stat-num">${openTags.toLocaleString()}</div><div class="stat-lbl">open tags</div></div>
        <div class="stat-card"><div class="stat-num">${ageText(oldestDays)}</div><div class="stat-lbl">oldest open</div></div>
        <div class="stat-card"><div class="stat-num">${resolved.toLocaleString()}</div><div class="stat-lbl">resolved tags</div></div>
      </div>`;
    const pills = Object.keys(nameCount).sort().map(n =>
      `<span class="sum-pill${this.nameF.has(n) ? ' active' : ''}" data-val="${escHtml(n)}">`
      + `<span class="sum-swatch" style="background:${this.nameColor[n]}"></span>${escHtml(n)} ${nameCount[n].toLocaleString()}</span>`).join('');
    this.ctx.pane.querySelector('#tg-names').innerHTML = pills || '<span class="muted">none</span>';
  },

  sorted(items) {
    const a = items.slice();
    if (this.sort === 'name') a.sort((x, y) => x.stop.name.localeCompare(y.stop.name, 'no'));
    else if (this.sort === 'newest') a.sort((x, y) => (y.oldestOpen || 0) - (x.oldestOpen || 0));
    else a.sort((x, y) => (x.oldestOpen || Infinity) - (y.oldestOpen || Infinity)); // oldest first
    return a;
  },

  tagLineHtml(t) {
    const age = t.ageDays != null ? `<span class="tg-age">${ageText(t.ageDays)}</span>` : '';
    const date = t.created ? `<span class="si-lang">${fmtDate(t.created)}</span>` : '';
    const status = t.open ? '' : `<span class="tg-resolved">resolved ${t.removed ? fmtDate(t.removed) : ''}</span>`;
    return `<div class="tg-line">`
      + `<span class="tg-name" style="background:${this.nameColor[t.name] || '#888'}">${escHtml(t.name)}</span>`
      + age + date + status
      + (t.comment ? `<div class="tg-comment">${escHtml(t.comment)}</div>` : '')
      + `</div>`;
  },

  renderList() {
    const vis = this.sorted(this.visible());
    this.ctx.pane.querySelector('#tg-count').textContent = `${vis.length.toLocaleString()} / ${this.inRegion().length.toLocaleString()}`;
    const list = this.ctx.pane.querySelector('#tg-list');
    list.innerHTML = '';
    const CAP = 400;
    vis.slice(0, CAP).forEach(it => {
      const div = document.createElement('div');
      div.className = 'stop-item' + (it.stop.id === this.activeId ? ' active' : '');
      div.dataset.id = it.stop.id;
      const href = CONFIG.nsrStopUrl.replace('{id}', it.stop.id);
      let safe = '#'; try { if (new URL(href).protocol === 'https:') safe = href; } catch (_) {}
      // open tags first, oldest first
      const tags = it.tags.slice().sort((a, b) => (Number(b.open) - Number(a.open)) || ((a.created || 0) - (b.created || 0)));
      div.innerHTML =
        `<div class="si-name"><span class="tg-dot" style="background:${confColor(it.severity)}"></span>${escHtml(it.stop.name)}`
        + `<a class="si-nsr-link" href="${escHtml(safe)}" target="_blank" rel="noopener">${escHtml(CONFIG.nsrLinkLabel)}</a></div>`
        + `<div class="si-id">${escHtml(it.stop.id)}</div>`
        + tags.map(t => this.tagLineHtml(t)).join('');
      div.querySelector('.si-nsr-link').addEventListener('click', e => e.stopPropagation());
      div.addEventListener('click', () => this.select(it, false));
      list.appendChild(div);
    });
    if (vis.length > CAP) {
      const m = document.createElement('div'); m.className = 'list-more';
      m.textContent = `Showing first ${CAP} of ${vis.length.toLocaleString()} — narrow the filter.`;
      list.appendChild(m);
    }
  },

  icon(it, active) {
    const r = active ? 11 : 8, sw = active ? 2.5 : 1.5, size = r * 2 + sw * 2 + 4, c = size / 2;
    return L.divIcon({
      className: '', iconSize: [size, size], iconAnchor: [c, c], zIndexOffset: active ? 1000 : 0,
      html: `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${c}" cy="${c}" r="${r}" fill="${confColor(it.severity)}" stroke="${active ? '#1a1a2e' : 'rgba(0,0,0,0.35)'}" stroke-width="${sw}"/></svg>`,
    });
  },

  popupHtml(it) {
    return `<div class="lp"><div class="lp-title">${escHtml(it.stop.name)}</div><div class="lp-id">${escHtml(it.stop.id)}</div>`
      + it.tags.slice().sort((a, b) => Number(b.open) - Number(a.open)).map(t => this.tagLineHtml(t)).join('') + `</div>`;
  },

  renderMarkers() {
    const layer = this.ctx.layer;
    layer.eachLayer(l => l.off()); layer.clearLayers(); this.markers.clear();
    for (const it of this.visible()) {
      if (!it.stop.coord) continue;
      const m = L.marker(it.stop.coord, { icon: this.icon(it, it.stop.id === this.activeId) })
        .addTo(layer)
        .bindTooltip(it.stop.name, { direction: 'top', offset: [0, -8] })
        .bindPopup(this.popupHtml(it));
      m.on('click', () => this.select(it, true));
      this.markers.set(it.stop.id, m);
    }
  },

  select(it, fromMap) {
    const prev = this.activeId;
    this.activeId = it.stop.id;
    if (prev && this.markers.has(prev)) { const p = this.items.find(x => x.stop.id === prev); if (p) this.markers.get(prev).setIcon(this.icon(p, false)); }
    const m = this.markers.get(it.stop.id);
    if (m) { m.setIcon(this.icon(it, true)); m.setZIndexOffset(1000); }
    this.ctx.pane.querySelectorAll('.stop-item.active').forEach(el => el.classList.remove('active'));
    const row = this.ctx.pane.querySelector(`.stop-item[data-id="${CSS.escape(it.stop.id)}"]`);
    if (row) { row.classList.add('active'); row.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    if (it.stop.coord) { if (!fromMap) this.ctx.map.map.setView(it.stop.coord, Math.max(this.ctx.map.map.getZoom(), 13), { animate: true }); if (m) m.openPopup(); }
  },
};
