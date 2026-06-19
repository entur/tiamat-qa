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
| **Untouched** | Stops whose effective version date is June 2017 (the pre-QA import month) — never reviewed since launch | [docs/METHOD-untouched.md](docs/METHOD-untouched.md) |
| **Recent changes** | Stops modified within a configurable window (week/month/90 days); age-graded pins, NEW detection, VERSION_COMMENT | [docs/METHOD-recentchanges.md](docs/METHOD-recentchanges.md) |

Everything except the map tiles runs **offline** — just the tool files and the XML. No API, no backend, no upload of your data.

---

## Running it

`index.html` is a **single self-contained file** — all CSS and JavaScript are inlined. Open it directly:

- **`file://`** — just double-click `index.html` in your file manager, or open it via `File → Open` in the browser.
- **Any static host** — e.g. GitHub Pages, `npx serve`, nginx. No trailing-slash or module-path requirements.

Then: **Load NeTEx file…** → pick the unzipped `.xml` → a progress card runs the single-pass scan → the tabs populate.

---

## Configuration

All in the `// ── config.js ──` section of `index.html`.

### `CONFIG.tools` — enable/disable validators per deployment

```js
tools: {
  overview:      true,
  altnames:      true,
  tags:          true,
  gosp:          true,
  untouched:     true,
  recentchanges: true,
}
```

Set a tool to `false` to **remove its tab and skip its work in the parse** (e.g. a deployment with no tag validator: `tags: false` — tag KeyValues are then never collected). The Overview adapts to whichever tools are on. Setting both `untouched` and `recentchanges` to `false` also skips parsing of `version`, `created`, `changed`, `fromDate`, `transportMode`, and `versionComment`.

### Other `CONFIG`

| Key | Purpose |
|---|---|
| `exportUrl` | Target of *Get latest export*. |
| `chunkSize` | Streaming read chunk size (bytes). |
| `nsrStopUrl` / `nsrGroupUrl` | NSR editor deep-link templates (`{id}` replaced at runtime). Verify against the live editor. |
| `nsrLinkLabel` | Link button text. |

### `THEME`

Colours as CSS custom properties (injected at startup) plus `typeColors` for AlternativeName types and `modeColors` for transport modes. Change once, applies everywhere.

---

## Architecture

Everything lives in a **single file**: `index.html`. CSS is in a `<style>` block; all JavaScript is one inline IIFE with comment-delimited sections in dependency order:

```
// ── config.js ──       CONFIG + THEME (modeColors, typeColors) + applyTheme
// ── util.js ──         shared helpers (text normalisation, edit-distance/LCS/Jaccard, dates, DOM)
// ── parse.js ──        single-pass streaming NeTEx parser → shared model
// ── region.js ──       topographic resolution + the county/municipality filter
// ── map.js ──          shared Leaflet map + background switching
// ── shared mode helpers ──  modeOf / modeColor / orderModes
// ── tools/overview.js ──    dashboard tab
// ── tools/altnames.js ──    AlternativeNames validator
// ── tools/tags.js ──        Tags validator
// ── tools/gosp.js ──        GroupOfStopPlaces validator
// ── tools/untouched.js ──   Untouched (2017 import) validator
// ── tools/recentchanges.js ── Recent changes validator
// ── app.js ──          orchestrator: global bar, tabs, per-tool lifecycle
```

**One source file, parsed once.** The parser streams the export in chunks (boundary-safe UTF-8) and routes `TopographicPlace`, `GroupOfStopPlaces` and `StopPlace` blocks into a shared model (`{ publishedAt, topo, stops, gosps }`). Topographic blocks are read by regex; stops and groups are DOM-parsed. Disabled tools skip their extraction. Peak memory is the model plus one in-flight block.

**Shared model, per-tab views.** Each tool is an object with the contract `{ id, label, mount(ctx), render() }`. `ctx` gives it the model, the region filter, the shared map, its own map layer, and its sidebar pane. The app owns tab switching (show/hide pane, add/remove layer) and calls `render()` on activation and whenever the region filter changes.

**Geography.** IDs are opaque; region is resolved purely by following refs: a stop's `TopographicPlaceRef` → municipality → (`ParentTopographicPlaceRef`) county → country, with `TopographicPlaceType` naming the level.

---

## Adding a tool

1. Add a `// ── tools/yourtool.js ──` section to `index.html` before `// ── app.js ──`, declaring `const yourtool = { id, label, mount(ctx), render() }`.
2. Add `yourtool` to `ALL_TOOLS` in `app.js`.
3. Add `yourtool: true` to `CONFIG.tools` (and, if it needs a new extraction, a flag in the `OPTS` block of `parse.js`).
4. Add a `docs/METHOD-yourtool.md`.

---

## Status

Prototype (v0.1). The three validators are ported/built and verified end-to-end; thresholds in the AlternativeNames and Tags tools are first-pass and not yet calibrated against bulk review. The standalone tools remain in the repo until the suite is confirmed at parity.

## License

MIT — see repository root.
