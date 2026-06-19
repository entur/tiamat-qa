// AlternativeNames QA tool.
//
// Evaluates ALIAS names only (translations/labels are meant to differ) for two
// independent issues that combine into an "issue confidence" rating, plus two
// deterministic flags. Grounded in the Entur geocoder (komoot/photon 1.2.0):
// fuzziness "AUTO" + prefixLength 2. See docs/METHOD-altnames.md.

import { CONFIG, THEME } from '../config.js';
import { escHtml, norm, normLite, levenshtein, lcsLen, jaccard, consonants, noisyOr, confColor, debounce } from '../util.js';

const RULES = {
  fuzzyPrefixLength: 2,
  fuzzyAutoEdits: (len) => (len <= 2 ? 0 : len <= 5 ? 1 : 2),
  genericWords: new Set([
    'stasjon', 'rutebilstasjon', 'busstasjon', 'bussterminal', 'terminal',
    'holdeplass', 'hpl', 'kai', 'ferjekai', 'fergekai', 'brygge', 'kaia',
    'perrong', 'plattform', 'spor',
  ]),
  highConfidence: 0.6,
};
const TYPE_ORDER = ['alias', 'translation', 'label', 'copy', 'other'];
const typeColor = (t) => THEME.typeColors[t] ?? THEME.typeColors.other;
const orderTypes = (types) => [...types].sort((a, b) => {
  const ia = TYPE_ORDER.indexOf(a), ib = TYPE_ORDER.indexOf(b);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
});

// ── Scoring ───────────────────────────────────────────────────────────────────
function tokenReachable(aliasTok, nameTok) {
  if (aliasTok === nameTok) return true;
  const p = RULES.fuzzyPrefixLength;
  if (aliasTok.slice(0, p) !== nameTok.slice(0, p)) return false;
  return levenshtein(aliasTok, nameTok) <= RULES.fuzzyAutoEdits(aliasTok.length);
}
function scoreUseless(name, alt) {
  const nName = normLite(name), nAlt = normLite(alt);
  if (!nAlt) return 0;
  if (nAlt === nName) return 1;
  const nameToks = nName.split(' ').filter(Boolean);
  const aliasToks = nAlt.split(' ').filter(Boolean);
  if (!aliasToks.length || !nameToks.length) return 0;
  let reachable = 0;
  for (const at of aliasToks) {
    if (RULES.genericWords.has(at) || nameToks.some(nt => tokenReachable(at, nt))) reachable++;
  }
  return reachable / aliasToks.length;
}
function scoreUnhelpful(name, alt) {
  const nName = norm(name), nAlt = norm(alt);
  if (!nName || !nAlt) return 0;
  const cs = 1 - levenshtein(consonants(name), consonants(alt)) / Math.max(consonants(name).length, consonants(alt).length || 1);
  const lcs = lcsLen(nName, nAlt) / Math.min(nName.length, nAlt.length);
  const jac = jaccard(nName.split(' ').filter(Boolean), nAlt.split(' ').filter(Boolean));
  return Math.max(0, 1 - Math.max(cs, lcs, jac));
}
function malformedFlags(raw) {
  const s = raw == null ? '' : raw;
  if (s.trim() === '') return ['empty'];
  const flags = [];
  if (s !== s.trim()) flags.push('leading/trailing space');
  if (/\s{2,}/.test(s)) flags.push('double space');
  let ctrl = false, invis = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32) ctrl = true;
    else if (c === 0x00A0 || c === 0xFEFF || (c >= 0x200B && c <= 0x200F)) invis = true;
  }
  if (ctrl) flags.push('control char');
  if (invis) flags.push('invisible char');
  if (/^\d+$/.test(s.trim())) flags.push('numeric only');
  return flags;
}

// ── Pins (segmented type pie / issue severity disc) ───────────────────────────
function polar(cx, cy, r, a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
function pieSlice(cx, cy, r, a0, a1, color) {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  const large = (a1 - a0) > Math.PI ? 1 : 0;
  return `<path d="M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" fill="${color}"/>`;
}
function pieSvg(types, r, strokeW, stroke) {
  const size = r * 2 + strokeW * 2 + 2, c = size / 2;
  let inner;
  if (types.length === 1) inner = `<circle cx="${c}" cy="${c}" r="${r}" fill="${typeColor(types[0])}"/>`;
  else {
    const step = (2 * Math.PI) / types.length; let a = -Math.PI / 2; inner = '';
    for (const t of types) { inner += pieSlice(c, c, r, a, a + step, typeColor(t)); a += step; }
  }
  return { size, svg: `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${inner}<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${strokeW}"/></svg>` };
}
function pieDot(types) { return `<span class="si-dot">${pieSvg(types, 7, 1, 'rgba(0,0,0,0.35)').svg}</span>`; }
function makeIcon(svg, size, active) {
  return L.divIcon({ className: '', html: svg, iconSize: [size, size], iconAnchor: [size / 2, size / 2], zIndexOffset: active ? 1000 : 0 });
}
function stopIcon(item, active, mode) {
  const r = active ? 11 : 8, sw = active ? 2.5 : 1.5;
  if (mode === 'issue') {
    const size = r * 2 + sw * 2 + 4, c = size / 2;
    const fill = item.confidence > 0 ? confColor(item.confidence) : '#c2c6cc';
    const stroke = item.flagged ? '#1a1a2e' : 'rgba(0,0,0,0.3)';
    return makeIcon(`<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${c}" cy="${c}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${item.flagged ? sw + 1 : sw}"/></svg>`, size, active);
  }
  const { size, svg } = pieSvg(item.types, r, sw, active ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)');
  return makeIcon(svg, size, active);
}

// ── Rating glyph (down = useless, up = unhelpful) ─────────────────────────────
const warmColor = (v) => v < 0.04 ? '#c7c9ce' : `hsl(${Math.round(48 - 48 * Math.min(1, v))}, 85%, 52%)`;
const coolColor = (v) => v < 0.04 ? '#c7c9ce' : `hsl(${Math.round(205 + 70 * Math.min(1, v))}, 60%, 52%)`;
function ratingGlyph(ev) {
  const W = 16, H = 26, MID = 13, MAX = 11, x = 5, bw = 6;
  const up = Math.round(ev.unhelpful * MAX), dn = Math.round(ev.useless * MAX);
  return `<svg class="rg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">`
    + `<line x1="2" y1="${MID}" x2="${W - 2}" y2="${MID}" stroke="#dcdde1" stroke-width="1"/>`
    + (up ? `<rect x="${x}" y="${MID - up}" width="${bw}" height="${up}" rx="1" fill="${warmColor(ev.unhelpful)}"/>` : '')
    + (dn ? `<rect x="${x}" y="${MID + 1}" width="${bw}" height="${dn}" rx="1" fill="${coolColor(ev.useless)}"/>` : '')
    + `</svg>`;
}
function ratingTitle(ev) {
  const u = Math.round(ev.useless * 100), h = Math.round(ev.unhelpful * 100), t = Math.round(ev.confidence * 100);
  const uTxt = u >= 99 ? 'identical to the stop name (dropped at import)' : u > 0 ? 'largely reachable from the stop name by the geocoder fuzzy match' : 'not reachable from the name - adds a distinct spelling';
  const hTxt = h >= 60 ? 'shares little with the stop name; may return the wrong stop' : h > 0 ? 'somewhat different from the stop name' : 'closely related to the stop name';
  return `Issue confidence ${t}%\n  down  useless ${u}% - ${uTxt}\n  up    unhelpful ${h}% - ${hTxt}`;
}

function groupByType(alts) {
  const by = {};
  for (const a of alts) (by[a.type] ||= []).push(a);
  return orderTypes(Object.keys(by)).map(t => ({ type: t, names: by[t] }));
}
function flagsHtml(ev) {
  let h = '';
  for (const m of ev.malformed) h += `<span class="alt-flag mal" title="MALFORMED">${escHtml(m)}</span>`;
  if (ev.collision.length) {
    const list = ev.collision.slice(0, 4).map(e => escHtml(e.raw)).join(', ');
    h += `<span class="alt-flag col" title="Same-municipality name collision: ${list}">collision x${ev.collision.length}</span>`;
  }
  return h;
}
function breakdownHtml(item) {
  return groupByType(item.alts).map(({ type, names }) => {
    const lines = names.map(a => {
      const ev = a.eval, lang = a.lang ? `<span class="si-lang">(${escHtml(a.lang)})</span>` : '';
      const rating = a.type === 'alias'
        ? `<span class="alt-rating" title="${escHtml(ratingTitle(ev))}">${ratingGlyph(ev)}<span class="alt-pct">${Math.round(ev.confidence * 100)}%</span></span>`
        : '';
      return `<div class="alt-line">${rating}<span class="si-alt-name">${escHtml(a.name)}</span>${lang}${flagsHtml(ev)}</div>`;
    }).join('');
    return `<div class="si-alt"><span class="si-type-tag" style="background:${typeColor(type)}">${escHtml(type)}</span><div class="alt-lines">${lines}</div></div>`;
  }).join('');
}

export default {
  id: 'altnames',
  label: 'AlternativeNames',

  mount(ctx) {
    this.ctx = ctx;
    this.typeF = new Set(); this.langF = new Set(); this.issueF = new Set();
    this.sort = 'confidence'; this.mapMode = 'type'; this.activeId = null; this._regionKey = null;
    this.markers = new Map();

    // Municipality name index for collision detection (names + aliases of every stop).
    const idx = new Map();
    const add = (muniRef, name, id, raw) => {
      if (!muniRef) return; const n = norm(name); if (!n) return;
      let b = idx.get(muniRef); if (!b) idx.set(muniRef, b = new Map());
      let arr = b.get(n); if (!arr) b.set(n, arr = []); arr.push({ id, raw });
    };
    for (const s of ctx.model.stops.values()) {
      const mr = s.muni?.ref;
      add(mr, s.name, s.id, s.name);
      for (const a of s.alts) add(mr, a.name, s.id, a.name);
    }

    // Evaluate every stop that has alternative names.
    this.items = [];
    for (const s of ctx.model.stops.values()) {
      if (!s.alts.length) continue;
      let maxConf = 0, flagged = false;
      const bucket = idx.get(s.muni?.ref);
      const alts = s.alts.map(a => {
        const isAlias = a.type === 'alias';
        const useless = isAlias ? scoreUseless(s.name, a.name) : 0;
        const unhelpful = isAlias ? scoreUnhelpful(s.name, a.name) : 0;
        const confidence = noisyOr([useless, unhelpful]);
        const malformed = malformedFlags(a.raw);
        const collision = [];
        const arr = bucket ? bucket.get(norm(a.name)) : null;
        if (arr) { const seen = new Set(); for (const e of arr) if (e.id !== s.id && !seen.has(e.id)) { seen.add(e.id); collision.push(e); } }
        if (confidence > maxConf) maxConf = confidence;
        if (malformed.length || collision.length) flagged = true;
        return { ...a, eval: { useless, unhelpful, confidence, malformed, collision } };
      });
      const types = orderTypes(new Set(alts.map(a => a.type)));
      const langs = [...new Set(alts.map(a => a.lang).filter(Boolean))].sort();
      this.items.push({
        stop: s, alts, types, langs, confidence: maxConf, flagged,
        search: [s.name, s.id, ...alts.map(a => a.name)].join(' ').toLowerCase(),
      });
    }

    ctx.pane.innerHTML =
      `<div class="pane-top">
        <div class="pane-title"><span>Stops with alternative names</span><span class="pane-count" id="an-count">—</span></div>
        <div id="an-summary"></div>
        <input id="an-search" type="text" placeholder="Filter by name, ID or alt-name…" autocomplete="off"/>
        <div class="pane-controls">
          <label class="ctl">Sort
            <select id="an-sort">
              <option value="confidence">Issue confidence</option>
              <option value="flagged">Flagged first</option>
              <option value="name">Name</option>
            </select>
          </label>
          <div class="map-mode" id="an-mapmode">
            <button data-mode="type" class="active">Type</button>
            <button data-mode="issue">Issue</button>
          </div>
        </div>
      </div>
      <div class="pane-list" id="an-list"></div>`;

    ctx.pane.querySelector('#an-search').addEventListener('input', debounce(() => this.render(), 150));
    ctx.pane.querySelector('#an-sort').addEventListener('change', e => { this.sort = e.target.value; this.renderList(); });
    ctx.pane.querySelector('#an-summary').addEventListener('click', e => this.onCard(e));
    ctx.pane.querySelector('#an-mapmode').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.dataset.mode === this.mapMode) return;
      this.mapMode = b.dataset.mode;
      ctx.pane.querySelectorAll('#an-mapmode button').forEach(x => x.classList.toggle('active', x.dataset.mode === this.mapMode));
      this.renderMarkers();
    });
  },

  onCard(e) {
    const pill = e.target.closest('.sum-pill'); if (!pill) return;
    const set = pill.dataset.cat === 'type' ? this.typeF : pill.dataset.cat === 'lang' ? this.langF : this.issueF;
    const v = pill.dataset.val;
    if (set.has(v)) set.delete(v); else set.add(v);
    this.render();
  },

  inRegion() { return this.items.filter(it => this.ctx.region.matches(it.stop)); }

  ,visible() {
    const q = this.ctx.pane.querySelector('#an-search').value.toLowerCase();
    return this.inRegion().filter(it => {
      if (q && !it.search.includes(q)) return false;
      if (this.typeF.size && !it.types.some(t => this.typeF.has(t))) return false;
      if (this.langF.size && !it.langs.some(l => this.langF.has(l))) return false;
      if (this.issueF.size) {
        const ok = [...this.issueF].some(f =>
          (f === 'high' && it.confidence >= RULES.highConfidence) ||
          (f === 'malformed' && it.alts.some(a => a.eval.malformed.length)) ||
          (f === 'collision' && it.alts.some(a => a.eval.collision.length)));
        if (!ok) return false;
      }
      return true;
    });
  },

  render() {
    this.renderSummary();
    this.renderList();
    this.renderMarkers();
    const key = JSON.stringify(this.ctx.region.get());
    if (key !== this._regionKey) {
      this._regionKey = key;
      const pts = this.visible().map(it => it.stop.coord).filter(Boolean);
      if (pts.length) this.ctx.map.fit(pts);
    }
  },

  renderSummary() {
    const region = this.inRegion();
    const typeCount = {}, langCount = {};
    let nHigh = 0, nMal = 0, nCol = 0;
    for (const it of region) {
      for (const t of it.types) typeCount[t] = (typeCount[t] || 0) + 1;
      for (const l of it.langs) langCount[l] = (langCount[l] || 0) + 1;
      if (it.confidence >= RULES.highConfidence) nHigh++;
      if (it.alts.some(a => a.eval.malformed.length)) nMal++;
      if (it.alts.some(a => a.eval.collision.length)) nCol++;
    }
    const pill = (cat, val, label, swatch, count, active) =>
      `<span class="sum-pill${active ? ' active' : ''}" data-cat="${cat}" data-val="${escHtml(val)}">`
      + (swatch ? `<span class="sum-swatch" style="background:${swatch}"></span>` : '')
      + `${escHtml(label)} ${count.toLocaleString()}</span>`;
    const issue = pill('issue', 'high', 'high confidence', confColor(0.8), nHigh, this.issueF.has('high'))
      + pill('issue', 'malformed', 'malformed', THEME.warn, nMal, this.issueF.has('malformed'))
      + pill('issue', 'collision', 'collision', THEME.danger, nCol, this.issueF.has('collision'));
    const types = orderTypes(Object.keys(typeCount)).map(t => pill('type', t, t, typeColor(t), typeCount[t], this.typeF.has(t))).join('');
    const langs = Object.keys(langCount).sort().map(l => pill('lang', l, l || '-', null, langCount[l], this.langF.has(l))).join('');
    this.ctx.pane.querySelector('#an-summary').innerHTML =
      `<div class="sum-label">By issue</div><div class="sum-row">${issue}</div>`
      + `<div class="sum-label">By type</div><div class="sum-row">${types}</div>`
      + `<div class="sum-label">By language</div><div class="sum-row">${langs}</div>`;
  },

  sorted(items) {
    const a = items.slice();
    if (this.sort === 'name') a.sort((x, y) => x.stop.name.localeCompare(y.stop.name, 'no'));
    else if (this.sort === 'flagged') a.sort((x, y) => (Number(y.flagged) - Number(x.flagged)) || (y.confidence - x.confidence));
    else a.sort((x, y) => y.confidence - x.confidence);
    return a;
  },

  renderList() {
    const vis = this.sorted(this.visible());
    this.ctx.pane.querySelector('#an-count').textContent = `${vis.length.toLocaleString()} / ${this.inRegion().length.toLocaleString()}`;
    const list = this.ctx.pane.querySelector('#an-list');
    list.innerHTML = '';
    const CAP = 400;
    vis.slice(0, CAP).forEach(it => {
      const div = document.createElement('div');
      div.className = 'stop-item' + (it.stop.id === this.activeId ? ' active' : '');
      div.dataset.id = it.stop.id;
      const href = CONFIG.nsrStopUrl.replace('{id}', it.stop.id);
      let safe = '#'; try { if (new URL(href).protocol === 'https:') safe = href; } catch (_) {}
      div.innerHTML =
        `<div class="si-name">${pieDot(it.types)}${escHtml(it.stop.name)}`
        + `<a class="si-nsr-link" href="${escHtml(safe)}" target="_blank" rel="noopener">${escHtml(CONFIG.nsrLinkLabel)}</a></div>`
        + `<div class="si-id">${escHtml(it.stop.id)}</div>${breakdownHtml(it)}`;
      div.querySelector('.si-nsr-link').addEventListener('click', e => e.stopPropagation());
      div.addEventListener('click', () => this.select(it, false));
      list.appendChild(div);
    });
    if (vis.length > CAP) {
      const m = document.createElement('div');
      m.className = 'list-more';
      m.textContent = `Showing first ${CAP} of ${vis.length.toLocaleString()} — narrow the filter.`;
      list.appendChild(m);
    }
  },

  renderMarkers() {
    const layer = this.ctx.layer;
    layer.eachLayer(l => l.off()); layer.clearLayers(); this.markers.clear();
    for (const it of this.visible()) {
      if (!it.stop.coord) continue;
      const m = L.marker(it.stop.coord, { icon: stopIcon(it, it.stop.id === this.activeId, this.mapMode) })
        .addTo(layer)
        .bindTooltip(it.stop.name, { direction: 'top', offset: [0, -8] })
        .bindPopup(`<div class="lp"><div class="lp-title">${escHtml(it.stop.name)}</div><div class="lp-id">${escHtml(it.stop.id)}</div>${breakdownHtml(it)}</div>`);
      m.on('click', () => this.select(it, true));
      this.markers.set(it.stop.id, m);
    }
  },

  select(it, fromMap) {
    const prev = this.activeId;
    this.activeId = it.stop.id;
    if (prev && this.markers.has(prev)) { const p = this.items.find(x => x.stop.id === prev); if (p) this.markers.get(prev).setIcon(stopIcon(p, false, this.mapMode)); }
    const m = this.markers.get(it.stop.id);
    if (m) { m.setIcon(stopIcon(it, true, this.mapMode)); m.setZIndexOffset(1000); }
    this.ctx.pane.querySelectorAll('.stop-item.active').forEach(el => el.classList.remove('active'));
    const row = this.ctx.pane.querySelector(`.stop-item[data-id="${CSS.escape(it.stop.id)}"]`);
    if (row) { row.classList.add('active'); row.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    if (it.stop.coord) { if (!fromMap) this.ctx.map.map.setView(it.stop.coord, Math.max(this.ctx.map.map.getZoom(), 13), { animate: true }); if (m) m.openPopup(); }
  },
};
