// NSR QA Suite — orchestrator.
//
// Wires the global tools (file load, region filter, map background), the tab bar,
// and the per-tool lifecycle. One file load -> single-pass parse -> shared model;
// each tab is a tool module that reads the model and the global region filter.
//
// Tool module contract (default export):
//   { id, label, mount(ctx), render() }
//   ctx = { model, regions, region, map, layer, pane, setRegion }
// The app owns show/hide of the pane and add/remove of the layer; it calls
// render() on activation and whenever the region filter changes.

import { CONFIG, applyTheme } from './config.js';
import { parseNetex } from './parse.js';
import { resolveRegions, createRegionFilter } from './region.js';
import { createMap } from './map.js';

import overview from './tools/overview.js';
import altnames from './tools/altnames.js';
import tags from './tools/tags.js';
import gosp from './tools/gosp.js';

// All known tools, filtered to those enabled in CONFIG.tools (default on).
const ALL_TOOLS = [overview, altnames, tags, gosp];
const TOOLS = ALL_TOOLS.filter(t => CONFIG.tools?.[t.id] !== false);

// Parse only what the enabled tools need.
const PARSE_OPTS = {
  alts: CONFIG.tools?.altnames !== false,
  tags: CONFIG.tools?.tags !== false,
  gosp: CONFIG.tools?.gosp !== false,
};

applyTheme();

const $ = (id) => document.getElementById(id);
const mapApi = createMap('map');
const filter = createRegionFilter();

let model = null;
let regions = null;
let active = null;   // active tool

// ── Global bar: map background, export link, file input ───────────────────────
const bgSel = $('map-bg');
mapApi.backgrounds.forEach(name => {
  const o = document.createElement('option');
  o.value = name; o.textContent = name;
  bgSel.appendChild(o);
});
bgSel.addEventListener('change', e => mapApi.setBackground(e.target.value));

$('btn-export').href = CONFIG.exportUrl;
$('btn-load').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', e => {
  const f = e.target.files?.[0];
  if (f) loadFile(f);
  e.target.value = '';
});

// ── Load + parse ──────────────────────────────────────────────────────────────
let loading = false;
async function loadFile(file) {
  if (loading) return;
  loading = true;
  showOverlay(true);
  $('btn-load').disabled = true;
  setStatus(`Reading ${file.name}…`);
  try {
    model = await parseNetex(file, (frac, m) => setProgress(frac, m.stops.size), PARSE_OPTS);
    regions = resolveRegions(model);
    initData(file.name);
  } catch (err) {
    console.error('Load error:', err);
    setStatus('Failed to read the file — see console for details.');
  } finally {
    loading = false;
    showOverlay(false);
    $('btn-load').disabled = false;
  }
}

// ── Build UI once data is loaded ──────────────────────────────────────────────
function initData(fileName) {
  $('empty-hint').classList.add('hidden');

  // Region dropdowns
  const countySel = $('region-county');
  const muniSel = $('region-muni');
  countySel.innerHTML = '<option value="">All counties</option>'
    + regions.countyList.map(c => `<option value="${attr(c.ref)}">${esc(c.name)} (${c.count})</option>`).join('');
  countySel.disabled = false;
  muniSel.disabled = false;
  filter.set('', '');
  syncMuniOptions('');

  countySel.onchange = () => { syncMuniOptions(countySel.value); applyRegion(countySel.value, ''); };
  muniSel.onchange = () => applyRegion(countySel.value, muniSel.value);

  // Tabs + tool panes (rebuilt fresh on each load)
  const tabs = $('tabs');
  const sidebar = $('sidebar');
  tabs.innerHTML = '';
  sidebar.innerHTML = '';
  active = null;
  for (const tool of TOOLS) {
    const pane = document.createElement('div');
    pane.className = 'tool-pane';
    pane.dataset.tool = tool.id;
    sidebar.appendChild(pane);

    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.textContent = tool.label;
    tab.dataset.tool = tool.id;
    tab.addEventListener('click', () => activate(tool));
    tabs.appendChild(tab);

    tool._ctx = {
      model, regions, region: filter, map: mapApi,
      layer: L.layerGroup(), pane, setRegion,
    };
    tool._tab = tab;
    tool.mount(tool._ctx);
  }

  const total = model.stops.size.toLocaleString();
  setStatus(`${fileName} — ${total} stops, ${model.gosps.length.toLocaleString()} groups, ${regions.countyList.length} counties`);
  activate(TOOLS[0]);
}

function syncMuniOptions(countyRef) {
  const muniSel = $('region-muni');
  const county = regions.countyList.find(c => c.ref === countyRef);
  const munis = county ? county.munis : [];
  muniSel.innerHTML = '<option value="">All municipalities</option>'
    + munis.map(m => `<option value="${attr(m.ref)}">${esc(m.name)} (${m.count})</option>`).join('');
  muniSel.disabled = !county;
}

function applyRegion(county, muni) {
  filter.set(county, muni);
  if (active) active.render();
}

// setRegion: called by tools (e.g. Overview drill-down) to drive the global filter.
function setRegion(county, muni) {
  $('region-county').value = county;
  syncMuniOptions(county);
  $('region-muni').value = muni;
  applyRegion(county, muni);
}

// ── Tab activation ────────────────────────────────────────────────────────────
function activate(tool) {
  if (active === tool) return;
  if (active) {
    active._tab.classList.remove('active');
    active._ctx.pane.classList.remove('active');
    mapApi.map.removeLayer(active._ctx.layer);
  }
  active = tool;
  tool._tab.classList.add('active');
  tool._ctx.pane.classList.add('active');
  tool._ctx.layer.addTo(mapApi.map);
  tool.render();
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function setStatus(msg) { $('status').textContent = msg; }
function showOverlay(show) { $('overlay').classList.toggle('show', show); }
function setProgress(frac, found) {
  const pct = Math.round(frac * 100);
  $('ov-fill').style.width = pct + '%';
  $('ov-stats').textContent = `${pct}% · ${found.toLocaleString()} stops`;
}
function esc(s) { return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function attr(s) { return esc(s).replace(/"/g, '&quot;'); }
