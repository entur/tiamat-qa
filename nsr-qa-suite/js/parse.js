// Single-pass streaming parser for the Tiamat NeTEx export.
//
// One scan over the ~400 MB file extracts everything every tool needs:
//   - topographicPlaces  -> region hierarchy (municipality -> county -> country)
//   - groupsOfStopPlaces -> GOSP tool
//   - stopPlaces         -> shared stop index (name, coord, refs, validity,
//                           alternativeNames, tags)
//
// The file is read in chunks (boundary-safe UTF-8) and the running buffer is
// scanned for the three block types, each routed to its own parser. Peak memory
// is the model plus one in-flight block.
//
// TopographicPlace blocks carry huge <Polygon> geometry, so their few needed
// fields are pulled by regex rather than DOM-parsing the whole block. StopPlace
// and GroupOfStopPlaces blocks are DOM-parsed (no large geometry).

import { CONFIG } from './config.js';
import { directChild, tagText, decodeEntities } from './util.js';

const PARSER = new DOMParser();

// Which per-tool extractions to perform this run. Set by parseNetex/parseString
// from the enabled-tools config so disabled tools cost nothing.
let OPTS = { alts: true, tags: true, gosp: true };

// Block types, by opening tag. [\s>] after the name avoids matching *Ref / plural
// wrapper elements (<StopPlaceRef>, <stopPlaces>, <ParentTopographicPlaceRef>).
const BLOCKS = [
  { open: /<StopPlace[\s>]/,         close: '</StopPlace>',         handle: parseStop },
  { open: /<GroupOfStopPlaces[\s>]/, close: '</GroupOfStopPlaces>', handle: parseGosp },
  { open: /<TopographicPlace[\s>]/,  close: '</TopographicPlace>',  handle: parseTopo },
];

function newModel() {
  return {
    publishedAt: null,        // PublicationTimestamp string
    topo:  new Map(),         // ref -> { ref, name, type, parentRef, countryRef }
    stops: new Map(),         // id  -> stop object (see parseStop)
    gosps: [],                // [{ id, name, purpose, centroid, memberRefs }]
  };
}

// Stream + parse a File. onProgress(fraction, model) is called per chunk.
// opts: { alts, tags, gosp } — skip extractions for disabled tools.
export async function parseNetex(file, onProgress, opts) {
  OPTS = { alts: true, tags: true, gosp: true, ...(opts || {}) };
  const model = newModel();
  const decoder = new TextDecoder('utf-8');
  let offset = 0, buffer = '', gotTs = false;

  while (offset < file.size) {
    const end = Math.min(offset + CONFIG.chunkSize, file.size);
    const ab = await file.slice(offset, end).arrayBuffer();
    offset = end;
    buffer += decoder.decode(ab, { stream: true });
    if (!gotTs) {
      const m = /<PublicationTimestamp>([^<]+)/.exec(buffer);
      if (m) { model.publishedAt = m[1]; gotTs = true; }
    }
    buffer = drain(buffer, model, false);
    if (onProgress) onProgress(offset / file.size, model);
    await new Promise(r => setTimeout(r));   // yield so the UI repaints
  }
  buffer += decoder.decode();
  drain(buffer, model, true);
  return model;
}

// Parse a complete in-memory string (used for tests).
export function parseString(text, opts) {
  OPTS = { alts: true, tags: true, gosp: true, ...(opts || {}) };
  const model = newModel();
  const m = /<PublicationTimestamp>([^<]+)/.exec(text);
  if (m) model.publishedAt = m[1];
  drain(text, model, true);
  return model;
}

// Find the block opener that occurs earliest in the buffer.
function earliestOpen(buffer) {
  let best = null;
  for (const b of BLOCKS) {
    const m = b.open.exec(buffer);
    if (m && (best === null || m.index < best.idx)) best = { idx: m.index, b };
  }
  return best;
}

// Pull every complete block out of the buffer; return the unprocessed remainder
// (or '' when final). Keeps only a short tail when no opener is in view so the
// buffer can't grow unbounded between sections.
function drain(buffer, model, final) {
  while (true) {
    const hit = earliestOpen(buffer);
    if (!hit) return final ? '' : buffer.slice(Math.max(0, buffer.length - 24));
    const start = hit.idx;
    const closeIdx = buffer.indexOf(hit.b.close, start);
    if (closeIdx === -1) return final ? '' : buffer.slice(start);
    const end = closeIdx + hit.b.close.length;
    try { hit.b.handle(buffer.slice(start, end), model); } catch (_) { /* skip malformed block */ }
    buffer = buffer.slice(end);
  }
}

// TopographicPlace: regex-only (avoid DOM-parsing the polygon geometry).
function parseTopo(block, model) {
  const id = (/\sid="([^"]+)"/.exec(block) || [])[1];
  if (!id) return;
  const type = ((/<TopographicPlaceType>([^<]+)/.exec(block) || [])[1] || '').trim();
  const name = decodeEntities((/<Descriptor>\s*<Name[^>]*>([^<]+)/.exec(block) || [])[1] || '').trim();
  const parentRef = (/<ParentTopographicPlaceRef ref="([^"]+)"/.exec(block) || [])[1] || null;
  const countryRef = (/<CountryRef ref="([^"]+)"/.exec(block) || [])[1] || null;
  model.topo.set(id, { ref: id, name, type, parentRef, countryRef });
}

function coordOf(parent) {
  const cen = directChild(parent, 'Centroid');
  if (!cen) return null;
  const lat = parseFloat(tagText(cen, 'Latitude'));
  const lon = parseFloat(tagText(cen, 'Longitude'));
  return (Number.isFinite(lat) && Number.isFinite(lon)) ? [lat, lon] : null;
}

function parseGosp(block, model) {
  if (!OPTS.gosp) return;   // GOSP tool disabled — skip
  const doc = PARSER.parseFromString(block, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return;
  const g = doc.documentElement;
  if (!g || g.tagName !== 'GroupOfStopPlaces') return;
  const id = g.getAttribute('id');
  if (!id) return;
  const nameEl = directChild(g, 'Name');
  const memberRefs = [];
  const mem = directChild(g, 'members');
  if (mem) for (const r of mem.children) {
    if (r.tagName === 'StopPlaceRef') { const ref = r.getAttribute('ref'); if (ref) memberRefs.push(ref); }
  }
  model.gosps.push({
    id,
    name: nameEl ? nameEl.textContent.trim() : id,
    purpose: directChild(g, 'PurposeOfGroupingRef')?.getAttribute('ref') || null,
    centroid: coordOf(g),
    memberRefs,
  });
}

function parseStop(block, model) {
  const doc = PARSER.parseFromString(block, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return;
  const sp = doc.documentElement;
  if (!sp || sp.tagName !== 'StopPlace') return;
  const id = sp.getAttribute('id');
  if (!id) return;

  const nameEl = directChild(sp, 'Name');
  const name = nameEl ? nameEl.textContent.trim() : id;
  const lang = nameEl ? (nameEl.getAttribute('lang') || '') : '';
  const topoRef = directChild(sp, 'TopographicPlaceRef')?.getAttribute('ref') || null;
  const parentRef = directChild(sp, 'ParentSiteRef')?.getAttribute('ref') || null;

  // keyList: IS_PARENT_STOP_PLACE flag (always — cheap, used by GOSP) + the
  // TAG-{n}-{field} groups (only when the tags tool is enabled).
  let isParent = false;
  const tagsByIdx = {};
  const kl = directChild(sp, 'keyList');
  if (kl) for (const kv of kl.children) {
    if (kv.tagName !== 'KeyValue') continue;
    const k = (tagText(kv, 'Key') || '');
    if (k === 'IS_PARENT_STOP_PLACE') { isParent = ((kv.getElementsByTagName('Value')[0]?.textContent) ?? '').trim() === 'true'; continue; }
    if (!OPTS.tags) continue;
    const m = /^TAG-(\d+)-(\w+)$/.exec(k);
    if (m) { (tagsByIdx[m[1]] ||= {})[m[2]] = (kv.getElementsByTagName('Value')[0]?.textContent) ?? ''; }
  }

  // validity (tolerant to element-name casing); only used by GOSP validation.
  const toDateRaw = tagText(sp, 'ToDate') || tagText(sp, 'toDate') || null;
  const expired = !!(toDateRaw && new Date(toDateRaw) < new Date());

  // alternativeNames (direct container -> AlternativeName children); only when enabled.
  const alts = [];
  const ac = OPTS.alts ? directChild(sp, 'alternativeNames') : null;
  if (ac) for (const an of ac.children) {
    if (an.tagName !== 'AlternativeName') continue;
    const nm = an.getElementsByTagName('Name')[0];
    const raw = nm ? (nm.textContent ?? '') : '';
    alts.push({
      type: (tagText(an, 'NameType') || 'other').trim(),
      name: raw.trim(),
      raw,
      lang: nm ? (nm.getAttribute('lang') || '') : '',
    });
  }

  const tags = Object.values(tagsByIdx).map(t => ({
    name: (t.name || '').trim(),
    comment: (t.comment || '').trim(),
    created: t.created ? Number(t.created) : null,
    removed: t.removed ? Number(t.removed) : null,
    idReference: t.idReference || '',
  })).filter(t => t.name || t.comment);

  model.stops.set(id, { id, name, lang, coord: coordOf(sp), topoRef, parentRef, isParent, toDateRaw, expired, alts, tags });
}
