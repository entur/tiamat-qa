// Shared utilities for the NSR QA suite. Pure helpers plus a couple of tiny
// DOM helpers used by the parser. No tool-specific logic here.

export function escHtml(s) {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function decodeEntities(s) {
  return (s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Strip Unicode combining marks (NFD range U+0300..U+036F) via char codes — keeps
// the source ASCII-safe (no invisible literals).
function stripCombining(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x0300 || c > 0x036F) out += s[i];
  }
  return out;
}

// Full normalisation: lowercase, fold Norwegian letters + accents, strip
// punctuation, collapse whitespace.
export function norm(s) {
  const folded = (s || '').toLowerCase()
    .replace(/ø/g, 'o').replace(/å/g, 'a').replace(/æ/g, 'ae')
    .normalize('NFD');
  return stripCombining(folded).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Light normalisation: lowercase + strip punctuation, but DO NOT fold diacritics
// (used by the geocoder-reachability scorer, which must keep o/a/ae distinct).
export function normLite(s) {
  return (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function tokenize(s) { return norm(s).split(' ').filter(Boolean); }
export function consonants(s) { return norm(s).replace(/\s/g, '').replace(/[aeiouy]/g, ''); }

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev; prev = cur; cur = tmp;
  }
  return prev[n];
}
export function editSim(a, b) {
  const ml = Math.max(a.length, b.length);
  return ml ? 1 - levenshtein(a, b) / ml : 1;
}
export function lcsLen(a, b) {
  if (!a.length || !b.length) return 0;
  let best = 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) { cur[j] = prev[j - 1] + 1; if (cur[j] > best) best = cur[j]; }
    }
    prev = cur;
  }
  return best;
}
export function jaccard(aTokens, bTokens) {
  const A = new Set(aTokens), B = new Set(bTokens);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
export function noisyOr(values) { return 1 - values.reduce((p, v) => p * (1 - v), 1); }

// Continuous green->yellow->red for a 0..1 severity (shared by tools + map).
export function confColor(c) {
  const hue = Math.round((1 - Math.max(0, Math.min(1, c))) * 120);
  return `hsl(${hue}, 65%, 44%)`;
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// Tiny DOM helpers for the parser.
export function directChild(el, tag) {
  for (const c of el.children) if (c.tagName === tag) return c;
  return null;
}
export function tagText(el, tag) {
  const n = el.getElementsByTagName(tag)[0];
  return n ? n.textContent : null;
}

// Date helpers (tags use epoch-ms).
export function fmtDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function daysBetween(laterMs, earlierMs) {
  return Math.floor((laterMs - earlierMs) / 86400000);
}
