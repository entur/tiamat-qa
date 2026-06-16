# AlternativeNames QA Viewer

A lightweight, browser-based quality assurance tool for **AlternativeName** data on stop places in the [Entur National Stop Register (NSR)](https://stoppested.entur.org).

It loads a national **NeTEx** export entirely in the browser, finds every `StopPlace` that carries one or more `AlternativeName` elements, and visualises **where** they are, **how many** there are, **what type** each is (alias / translation / label), and **which languages** they cover.

No build step, no server, no backend. The data file never leaves your machine.

---

## Quick start

1. Click **Get latest export ↧** to download the current national NeTEx archive (a `.zip`).
2. Unzip it — inside is a single large `.xml` file (~400 MB).
3. Open `index.html` in a modern browser (Chrome, Firefox, Edge).
4. Click **Load NeTEx file…** and pick the unzipped `.xml`.
5. A progress card shows the scan running. When it finishes, the sidebar lists every stop with alternative names and the map shows them as coloured pins.
6. Click a stop in the list (or a pin on the map) to focus it and see its full breakdown.

> The file is read and parsed locally in your browser. Nothing is uploaded.

---

## Features

| Feature | Details |
|---|---|
| In-browser NeTEx scan | Streams the ~400 MB XML in chunks; only stops with alternative names are kept |
| Processing indicator | Live progress bar with percentage and running found-count while scanning |
| Map overview | One pin per stop with alternative names, placed at the StopPlace centroid |
| Segmented type pins | Each pin is split into coloured arcs — one per NameType present — so combinations (e.g. alias **+** translation) are visible at a glance |
| Summary cards | Per-type and per-language stop counts shown as cards at the top of the sidebar |
| Click-to-filter | The summary cards double as filters — click to toggle (OR within a category, AND across type/language) |
| Text search | Filters on the primary name, the NSR id, **and** every alternative name |
| Detail breakdown | Per stop: every NameType, with all its names and language tags |
| NSR deep link | Each stop has an **NSR ↗** button to open it in the stop place editor |
| Read-only | Loads a static export; never writes anything |

---

## What it shows (no pass/fail)

Unlike the GOSP QA tool, this viewer does **not** apply approve/disapprove rules. Alternative-name data has no single "correct" shape — the goal is **visibility**:

- **Where** alternative names exist (geographic distribution on the map).
- **How many** stops have them (the `N / M` count and the summary cards).
- **What type** they are. NeTEx allows `alias`, `translation`, `copy`, `label`, `other`; in practice this dataset contains **alias**, **translation** and **label**. Each gets its own colour, and a stop with several types shows a segmented pin.
- **Which languages** each name is written in. Languages are not colour-coded but are always printed next to each name and counted in the summary.

---

## Configuration

Everything you need to adapt the tool is in two objects at the top of the `<script>` block.

### `CONFIG` — URLs and tuning

```js
const CONFIG = {
  exportUrl:    'https://storage.googleapis.com/marduk-production/tiamat/Current_latest.zip',
  nsrStopUrl:   'https://stoppested.entur.org/{id}',
  nsrLinkLabel: 'NSR ↗',
  chunkSize:    4 * 1024 * 1024,
};
```

| Key | Purpose |
|---|---|
| `exportUrl` | Target of the **Get latest export** button. Point at a different environment's NeTEx archive if needed. |
| `nsrStopUrl` | Deep-link template for a single stop place in the NSR editor. `{id}` is replaced with the stop id at runtime. **Verify this path against the live editor.** |
| `nsrLinkLabel` | Text shown on the link button next to each stop in the sidebar. |
| `chunkSize` | Streaming read chunk size in bytes. Smaller = smoother progress bar; larger = marginally faster overall. |

### `THEME` — colours

```js
const THEME = {
  primary:      '#6f42c1',  // chrome accent, active highlight
  accent:       '#0d6efd',  // links
  headerBg:     '#1c1c2e',
  sidebarBg:    '#f5f5f7',
  // ... derived shades (primaryDark, accentMuted, border, etc.)
  typeColors: {
    alias:       '#0d6efd',  // blue
    translation: '#fd7e14',  // orange
    label:       '#20c997',  // teal
    copy:        '#6f42c1',  // purple (fallback)
    other:       '#adb5bd',  // grey   (fallback)
  },
};
```

`typeColors` drives both the map pins and the sidebar/popup type tags. Changing a value here updates everything via CSS custom properties injected at startup.

---

## How the big file is handled

The national export is far too large to load into a DOM in one go. The tool instead:

1. Reads the file in `chunkSize` slices using the `File` / `Blob` API.
2. Decodes each slice with a streaming `TextDecoder` (`{stream: true}`), which correctly handles multi-byte UTF-8 characters (`æ ø å`) split across a chunk boundary.
3. Scans the running buffer for `<StopPlace> … </StopPlace>` blocks.
4. Cheaply substring-tests each block for `<alternativeNames`; the ~95 % of stops without one are discarded immediately.
5. Parses only the matching minority with `DOMParser`, extracting the StopPlace name, centroid, and each `AlternativeName` (type, name, language).

Peak memory stays tiny — only one block plus the filtered result list is ever held.

See [METHOD.md](METHOD.md) for the full rationale and data model.

---

## Project structure

```
index.html   — the entire application (HTML + CSS + JS, single file)
README.md    — this file
METHOD.md    — data model, streaming design, and known limitations
```

---

## Contributing

Contributions are welcome. Keep the single-file constraint — no build tools, no npm, no frameworks.

Suggested areas for improvement:

- **Marker clustering** — for datasets with many thousands of pins.
- **Export** — download the findings as CSV or GeoJSON.
- **In-browser unzip** — accept the `.zip` directly instead of requiring manual extraction.
- **Stat drill-down** — make the summary counts reflect the currently filtered set.

Please follow the existing code style: plain ES2020, no transpilation, comments on non-obvious logic only.

---

## License

MIT — see repository root for the full text.
