# NSR QA Suite

A browser-based quality-assurance suite for **Entur National Stop Register (NSR)** data, built on the national **NeTEx** export. One file load feeds several QA tools, each on its own tab, all sharing a map and a global geographic filter.

It supersedes the earlier single-purpose tools (`gosp-qa`, `alternativename-qa`) by consuming the **same source file** they would and running every check from one upload.

---

## What's in it

Global tools (top bar, apply to every tab):

- **Load NeTEx file** — pick the unzipped national export (`.xml`, ~400 MB). One load, parsed once.
- **Get latest export** — opens the current archive for download (unzip, then load).
- **Region filter** — county → municipality. Scopes every tab and the map to the area you're responsible for.
- **Map background** — selectable base tiles.

Tabs (each a self-contained validator — see its METHOD doc):

| Tab | Purpose | Method |
|---|---|---|
| **Overview** | Cross-tool counts for the current region; drill-down county→municipality table that drives the filter | — |
| **AlternativeNames** | Flags useless / unhelpful aliases and malformed/colliding names; issue-confidence rating | [docs/METHOD-altnames.md](docs/METHOD-altnames.md) |
| **Tags** | Follow-up on the front-end "tag" post-it notes: open vs resolved, oldest-first, by tag name | [docs/METHOD-tags.md](docs/METHOD-tags.md) |
| **GroupOfStopPlaces** | Validates group members (expired / monomodal-child), all resolved from the file | [docs/METHOD-gosp.md](docs/METHOD-gosp.md) |

Everything except the map tiles runs **offline** — just the tool files and the XML. No API, no backend, no upload of your data.

---

## Running it

Because it uses ES modules, it must be **served over HTTP** (modules and the strict CSP don't work from `file://`). Any static server works:

```
npx serve .            # from the repo root, then open the URL below
```

Open **`http://localhost:3456/nsr-qa-suite/`** — note the **trailing slash**. (Some dev servers, including `serve`, redirect `/index.html` to a slash-less path that breaks relative module paths; the directory URL with `/` is correct.)

Then: **Load NeTEx file…** → pick the unzipped `.xml` → a progress card runs the single-pass scan → the tabs populate.

---

## Configuration

All in `js/config.js`.

### `CONFIG.tools` — enable/disable validators per deployment

```js
tools: { overview: true, altnames: true, tags: true, gosp: true }
```

Set a tool to `false` to **remove its tab and skip its work in the parse** (e.g. a deployment with no tag validator: `tags: false` — tag KeyValues are then never collected). The Overview adapts to whichever tools are on.

### Other `CONFIG`

| Key | Purpose |
|---|---|
| `exportUrl` | Target of *Get latest export*. |
| `chunkSize` | Streaming read chunk size (bytes). |
| `nsrStopUrl` / `nsrGroupUrl` | NSR editor deep-link templates (`{id}` replaced at runtime). Verify against the live editor. |
| `nsrLinkLabel` | Link button text. |

### `THEME`

Colours as CSS custom properties (injected at startup) plus `typeColors` for AlternativeName types. Change once, applies everywhere.

---

## Architecture

```
index.html            shell: top bar, tab bar, sidebar, map, overlay (+ strict CSP, SRI Leaflet)
css/styles.css        all styling
js/
  config.js           CONFIG + THEME + applyTheme
  util.js             shared helpers (text normalisation, edit-distance/LCS/Jaccard, dates, DOM)
  parse.js            single-pass streaming NeTEx parser -> shared model
  region.js           topographic resolution + the county/municipality filter
  map.js              shared Leaflet map + background switching
  app.js              orchestrator: global bar, tabs, per-tool lifecycle
  tools/
    overview.js       dashboard tab
    altnames.js       AlternativeNames validator
    tags.js           Tags validator
    gosp.js           GroupOfStopPlaces validator
```

**One source file, parsed once.** `parse.js` streams the export in chunks (boundary-safe UTF-8) and routes `TopographicPlace`, `GroupOfStopPlaces` and `StopPlace` blocks into a shared model (`{ publishedAt, topo, stops, gosps }`). Topographic blocks are read by regex (they carry large polygon geometry); stops and groups are DOM-parsed. Disabled tools skip their extraction. Peak memory is the model plus one in-flight block.

**Shared model, per-tab views.** Each tool is a module with the contract `{ id, label, mount(ctx), render() }`. `ctx` gives it the model, the region filter, the shared map, its own map layer, and its sidebar pane. The app owns tab switching (show/hide pane, add/remove layer) and calls `render()` on activation and whenever the region filter changes.

**Geography.** IDs are opaque; region is resolved purely by following refs: a stop's `TopographicPlaceRef` → municipality → (`ParentTopographicPlaceRef`) county → country, with `TopographicPlaceType` naming the level.

---

## Adding a tool

1. Create `js/tools/yourtool.js` exporting `{ id, label, mount(ctx), render() }`.
2. Import it in `js/app.js` and add it to `ALL_TOOLS`.
3. Add `yourtool: true` to `CONFIG.tools` (and, if it needs a new extraction, a flag in `parse.js`).
4. Add a `docs/METHOD-yourtool.md`.

---

## Status

Prototype (v0.1). The three validators are ported/built and verified end-to-end; thresholds in the AlternativeNames and Tags tools are first-pass and not yet calibrated against bulk review. The standalone tools remain in the repo until the suite is confirmed at parity.

## License

MIT — see repository root.
