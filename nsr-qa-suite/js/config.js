// Shared configuration and theme for the NSR QA suite.
// Tool-specific tuning (e.g. the AltName geocoder RULES) lives in each tool module.

export const CONFIG = {
  // Helper "Get latest export" link — opens the national NeTEx archive (.zip).
  exportUrl:    'https://storage.googleapis.com/marduk-production/tiamat/Current_latest.zip',
  // Streaming read chunk size (bytes). Smaller = smoother progress, larger = marginally faster.
  chunkSize:    4 * 1024 * 1024,
  // NSR editor deep links ({id} replaced at runtime). Verify against the live editor.
  nsrStopUrl:   'https://stoppested.entur.org/{id}',
  nsrGroupUrl:  'https://stoppested.entur.org/group/{id}',
  nsrLinkLabel: 'NSR',

  // Enable/disable QA tools per deployment. Disabling a tool removes its tab AND
  // skips the matching work in the single-pass parse (e.g. tags:false → tag
  // KeyValues are not collected). 'overview' adapts to whichever tools are on.
  // Example for a deployment without the tag validator: tags: false.
  tools: {
    overview: true,
    altnames: true,
    tags:     true,
    gosp:     true,
  },
};

export const THEME = {
  primary:      '#6f42c1',
  primaryDark:  '#59359a',
  primaryLight: '#b89be0',
  accent:       '#0d6efd',
  accentMuted:  '#0d6efd33',
  accentHover:  '#0d6efd18',
  headerBg:     '#1c1c2e',
  sidebarBg:    '#f5f5f7',
  disabledBg:   '#555',
  border:       '#d0d0d0',
  ok:           '#198754',
  warn:         '#fd7e14',
  danger:       '#e63946',
  // AltName NameType colours (used by the alternative-names tool).
  typeColors: {
    alias:       '#0d6efd',
    translation: '#fd7e14',
    label:       '#20c997',
    copy:        '#6f42c1',
    other:       '#adb5bd',
  },
};

// Push THEME values onto :root as CSS custom properties so CSS and JS stay in sync.
export function applyTheme(t = THEME) {
  const s = document.documentElement.style;
  const set = (k, v) => s.setProperty(k, v);
  set('--c-primary', t.primary);
  set('--c-primary-dark', t.primaryDark);
  set('--c-primary-light', t.primaryLight);
  set('--c-accent', t.accent);
  set('--c-accent-muted', t.accentMuted);
  set('--c-accent-hover', t.accentHover);
  set('--c-header-bg', t.headerBg);
  set('--c-sidebar-bg', t.sidebarBg);
  set('--c-disabled-bg', t.disabledBg);
  set('--c-border', t.border);
  set('--c-ok', t.ok);
  set('--c-warn', t.warn);
  set('--c-danger', t.danger);
}
