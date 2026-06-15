# GOSP QA Viewer

A lightweight, browser-based quality assurance tool for **GroupOfStopPlaces (GOSP)** data in the [Entur National Stop Register (NSR)](https://stoppested.entur.org).

No build step, no server, no dependencies to install. Open the HTML file in any modern browser.

---

## Quick start

1. Clone or download this repository.
2. Open `gosp-qa.html` in a browser (Chrome, Firefox, Edge — any modern engine).
3. Click **Load GOSPs**.
4. The sidebar populates with all GOSPs; the map shows their centroids as coloured pins.
5. Member stop places are fetched automatically in the background, one GOSP at a time. Sidebar badges update as they arrive.
6. Click any GOSP in the sidebar (or its pin on the map) to zoom in and see its member stops with validation colouring and connecting lines.

---

## Features

| Feature | Details |
|---|---|
| GOSP list | All GOSPs from NSR, filterable by name or ID |
| Map overview | Every GOSP centroid shown as a coloured pin from the moment data loads |
| PurposeOfGrouping colours | Each distinct PoG gets its own colour (up to 4) so groupings are visually distinct at a glance |
| Member stop detail | Click a GOSP → member stops appear on the map with dashed lines back to the GOSP centroid |
| Validation colouring | Green = approved, Red = disapproved (see [Validation rules](#validation-rules)) |
| Stop place popup | Click any stop marker for name, NSR ID, type label, and reason if disapproved |
| Errors-only filter | Toggle to hide GOSPs where all members are approved |
| PoG filter | Dropdown to show only GOSPs matching a specific PurposeOfGrouping; populated automatically after load |
| NSR deep link | Every GOSP in the sidebar has an **NSR ↗** button that opens it in the NSR editor |
| Progressive loading | Stops are fetched GOSP by GOSP so the UI is usable immediately |
| Read-only | No write operations — safe to use against production |

---

## Validation rules

A member stop place is marked **approved** (green) if **both** of the following are true:

- It is **not expired** — `validBetween.toDate` is absent or in the future.
- It is either a **multimodal parent** (`IS_PARENT_STOP_PLACE = true`) **or** a **monomodal standalone** (no `parentSiteRef`).

A member stop place is marked **disapproved** (red) if **either** of the following is true:

| Reason | Explanation |
|---|---|
| **Monomodal child** | The stop has a `parentSiteRef` and is not itself a parent. It belongs inside a multimodal stop, not directly in a GOSP. |
| **Expired** | `validBetween.toDate` is set to a date in the past. |

---

## Configuration

Everything you need to adapt the tool is in two objects at the top of the `<script>` block.

### `CONFIG` — URLs and API identity

```js
const CONFIG = {
  apiBase:    'https://api.entur.io/stop-places/v1/read',
  clientName: 'entur-ror-johan-gosp-viewer',
  nsrGospUrl:   'https://stoppested.entur.org/group/{id}',
  nsrLinkLabel: 'NSR ↗',
};
```

| Key | Purpose |
|---|---|
| `apiBase` | Base URL for the Entur NSR REST API. Change to point at a test environment. |
| `clientName` | Value sent in the `ET-Client-Name` request header (required by Entur). |
| `nsrGospUrl` | Deep-link template for the NSR editor. `{id}` is replaced with the GOSP id at runtime. |
| `nsrLinkLabel` | Text shown on the link button next to each GOSP in the sidebar. |

### `THEME` — colours

```js
const THEME = {
  primary:    '#6f42c1',  // GOSP map pins, sidebar accent
  error:      '#e63946',  // disapproved stops, header stripe, refresh button
  ok:         '#198754',  // approved stops
  accent:     '#0d6efd',  // NSR links, GOSP count

  headerBg:   '#1c1c2e',  // top bar background
  sidebarBg:  '#f5f5f7',  // sidebar background

  // Exactly 4 colours cycled across distinct PurposeOfGrouping values
  pogPalette: ['#6f42c1', '#0d6efd', '#fd7e14', '#20c997'],
};
```

Changing any value here updates both the map markers (JavaScript) and the CSS (via custom properties injected at startup) — no other edits required.

---

## API endpoints used

All requests are `GET` with the header `ET-Client-Name: <clientName>`. No authentication is required.

| Endpoint | Purpose |
|---|---|
| `GET /groups-of-stop-places?count=1000` | Fetch all GOSPs (name, centroid, members, PoG ref). The `count` parameter works around the server default of 20. |
| `GET /stop-places/{id}` | Fetch a single stop place (name, centroid, parentSiteRef, validBetween, keyList). |

---

## Project structure

```
gosp-qa.html   — the entire application (HTML + CSS + JS, single file)
README.md      — this file
METHOD.md      — background on the data model, design decisions, and known issues
```

---

## Contributing

Contributions are welcome. Since the project is intentionally a single HTML file, keep that constraint — no build tools, no npm, no frameworks.

Suggested areas for improvement:

- **Export** — download the validation results as CSV or GeoJSON.
- **Stop NSR links** — add an ↗ button on stop popup to open the stop in NSR.
- **Legend** — a small map legend showing what PoG each colour represents.
- **Keyboard navigation** — arrow keys to move between GOSPs in the sidebar.
- **Offline cache** — use `localStorage` to persist loaded stop data between sessions.

Please follow the existing code style: plain ES2020, no transpilation, comments on non-obvious logic only.

---

## License

MIT — see repository root for the full text.
