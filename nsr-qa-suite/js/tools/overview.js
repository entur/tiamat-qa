// Overview / dashboard tab. Cross-tool counts for the current region, plus a
// drill-down table (counties -> municipalities) whose rows set the region filter.
import { escHtml } from '../util.js';
import { CONFIG } from '../config.js';

export default {
  id: 'overview',
  label: 'Overview',

  mount(ctx) {
    this.ctx = ctx;
    ctx.pane.innerHTML =
      `<div class="pane-top"><div class="pane-title">`
      + `<span>Overview</span><span class="pane-count" id="ov-region">All regions</span></div></div>`
      + `<div class="pane-list" id="ov-body"></div>`;
  },

  render() {
    const { model, regions, region, setRegion } = this.ctx;
    const sel = region.get();

    let nStops = 0, nAlt = 0, nTag = 0;
    for (const s of model.stops.values()) {
      if (!region.matches(s)) continue;
      nStops++;
      if (s.alts.length) nAlt++;
      if (s.tags.some(t => !t.removed)) nTag++;
    }
    let nGosp = 0;
    for (const g of model.gosps) {
      if (g.memberRefs.some(r => { const st = model.stops.get(r); return st && region.matches(st); })) nGosp++;
    }

    const county = sel.county ? regions.countyList.find(c => c.ref === sel.county) : null;
    const muni = county && sel.muni ? county.munis.find(m => m.ref === sel.muni) : null;
    this.ctx.pane.querySelector('#ov-region').textContent =
      muni ? muni.name : county ? county.name : 'All regions';

    const card = (n, l) =>
      `<div class="stat-card"><div class="stat-num">${n.toLocaleString()}</div><div class="stat-lbl">${escHtml(l)}</div></div>`;
    const t = CONFIG.tools || {};
    const cards = `<div class="stat-grid">${card(nStops, 'stops in region')}`
      + (t.gosp !== false ? card(nGosp, 'groups of stops') : '')
      + (t.altnames !== false ? card(nAlt, 'with alt-names') : '')
      + (t.tags !== false ? card(nTag, 'with open tags') : '')
      + `</div>`;

    let rows, head, kind;
    if (!county) { rows = regions.countyList; head = 'County'; kind = 'county'; }
    else { rows = county.munis; head = 'Municipality in ' + county.name; kind = 'muni'; }
    const table = !rows.length ? '' :
      `<table class="region-table"><thead><tr><th>${escHtml(head)}</th><th class="num">Stops</th></tr></thead><tbody>`
      + rows.map(r => `<tr class="click" data-kind="${kind}" data-ref="${escHtml(r.ref)}">`
        + `<td>${escHtml(r.name)}</td><td class="num">${r.count.toLocaleString()}</td></tr>`).join('')
      + `</tbody></table>`;

    const body = this.ctx.pane.querySelector('#ov-body');
    body.innerHTML = cards + table;
    body.querySelectorAll('tr.click').forEach(tr => tr.addEventListener('click', () => {
      if (tr.dataset.kind === 'county') setRegion(tr.dataset.ref, '');
      else setRegion(sel.county, tr.dataset.ref);
    }));
  },
};
