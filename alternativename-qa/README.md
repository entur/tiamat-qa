# AlternativeNames QA Viewer

A lightweight, browser-based quality assurance tool for **AlternativeName** data on stop places in the [Entur National Stop Register (NSR)](https://stoppested.entur.org).

It loads a national **NeTEx** export entirely in the browser, finds every `StopPlace` that carries one or more `AlternativeName` elements, and visualises **where** they are, **how many** there are, **what type** each is (alias / translation / label), and **which languages** they cover. It also scores each alias for likely data-quality problems — an **Issue confidence** rating plus sharp **flags** — to help triage which aliases are worth removing.

No build step, no server, no backend. The data file never leaves your machine.

> **Validation is tuned for the [Entur geocoder](https://github.com/entur/geocoder/).** The Issue-confidence scoring mirrors how that geocoder (komoot/photon 1.2.0) fuzzy-matches search input. If you use a different geocoder, the thresholds in the `RULES` block will need adjusting — see [Validation and the geocoder](#validation-and-the-geocoder).

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
| Issue confidence | Each **alias** is scored 0–100 % for likely data-quality problems (translations/labels are not scored); the list sorts worst-first |
| Map: Type / Issue toggle | The map shows either the NameType pie pins **or** a graded green→yellow→red issue-severity gradient — switch with the toggle top-right |
| Issue flags | Sharp boolean flags per name: **malformed** (whitespace/invisible/empty) and **collision** (duplicates another stop's name in the same municipality) |
| Sort & issue filters | Sort by issue confidence / flagged-first / name; "By issue" filter cards isolate high-confidence, malformed or collision aliases |
| Per-alias rating glyph | A diverging bar — **down = useless, up = unhelpful** (independent) — plus the combined %, shown in the list and popup with an explanatory tooltip |
| Detail breakdown | Per stop: every NameType, with all its names, language tags, and (for aliases) the rating glyph and flags |
| NSR deep link | Each stop has an **NSR ↗** button to open it in the stop place editor |
| Read-only | Loads a static export; never writes anything |

---

## What it shows

The first job is **visibility**:

- **Where** alternative names exist (geographic distribution on the map).
- **How many** stops have them (the `N / M` count and the summary cards).
- **What type** they are. NeTEx allows `alias`, `translation`, `copy`, `label`, `other`; in practice this dataset contains **alias**, **translation** and **label**. Each gets its own colour, and a stop with several types shows a segmented pin.
- **Which languages** each name is written in. Languages are not colour-coded but are always printed next to each name and counted in the summary.

The second job is **triage** — surfacing aliases worth removing. There is no single "correct" shape for alternative-name data, so the tool does not auto-delete; it scores and flags so a human can review worst-first. See below.

---

## Validation and the geocoder

**Only `alias` names are scored.** A `translation` is *meant* to differ from the name and a `label` is a display string, so the useless/unhelpful logic does not apply to them — they appear in the list unrated. (The deterministic **flags** below are still checked for every NameType.)

The point of an alias is to help someone **find** a stop. So an alias is judged by what it does for the search engine that consumes it — the [Entur geocoder](https://github.com/entur/geocoder/), which runs **komoot/photon 1.2.0**. Two independent measures combine into the **Issue confidence** rating (0–100 %), shown as a diverging glyph (**down = useless, up = unhelpful**), and two sharp **flags** sit alongside it. On the map, the **Type / Issue** toggle switches the pins between NameType colours and a green→yellow→red severity gradient.

**Issue confidence** = `noisy-OR(useless, unhelpful)` — any one strong reason drives it high; two moderate ones compound.

- **USELESS** — *the geocoder would already find this stop from its official name, so the alias adds nothing.* Photon fuzzy-matches each query word with Elasticsearch/OpenSearch `fuzziness "AUTO"` (0 edits for ≤2-char words, 1 for 3–5, 2 for ≥6) **and `prefixLength 2`** (the first two characters must match exactly). An alias whose every word is reachable from the name under that rule — or differs only by generic transit words (`rutebilstasjon`, `kai`, …) — is redundant. An exact duplicate scores 100 % and is in fact *dropped at import*, so it never even reaches the index.
  - The `prefixLength 2` rule is why **dialect variants are usually NOT useless**: `Røllång`/`Rudlang` and `Nørre`/`Nordre` differ at the second character, so the fuzzy match can't reach them — the alias is the only spelling that finds the stop.
- **UNHELPFUL** (aliases only — translations and labels are *meant* to differ) — *the alias points somewhere unrelated, so a user searching it gets the wrong stop.* Based on how little the alias shares with the name (consonant frame, longest common substring, word overlap). `Nymoen`/`Sollia handel` scores high; a shared-stem expansion like `Forskningsparken`/`Forsvarets forskningsinstitutt` scores lower and lands in the review middle.

**Flags** (deterministic, shown as badges, not folded into the score):

- **MALFORMED** — leading/trailing or double spaces, control or invisible characters, empty, or numeric-only. Checked against the *raw, untrimmed* alias.
- **COLLISION** — the alias matches another stop's name or alias **in the same municipality** (`TopographicPlaceRef`), making search within that municipality ambiguous.

### Tuning for a different geocoder

Everything geocoder-specific lives in the `RULES` block at the top of the `<script>`:

| Knob | Meaning |
|---|---|
| `fuzzyPrefixLength` | Leading characters that must match exactly (Photon: `2`). |
| `fuzzyAutoEdits(len)` | Edit budget per word by length — mirrors `fuzziness "AUTO"`. |
| `genericWords` | Transit-infrastructure words the geocoder treats as noise. The calibration seam for detailed geocoder rules — kept deliberately narrow (real place categories like `skole` are **not** included). |
| `highConfidence` | Rating at/above which a stop counts as "high issue confidence". |

If your geocoder folds diacritics before matching, doesn't lock a prefix, or uses a different edit budget, adjust these. One deliberate conservatism: reachability is computed **without** folding `ø/å/æ` (matching Photon's reranker, which doesn't fold), so the tool errs toward *keeping* dialect aliases rather than wrongly flagging them.

> Thresholds are first-pass estimates from reading the geocoder source, not yet calibrated against bulk review. Expect to tune them.

---

## Configuration

Everything you need to adapt the tool is in three objects at the top of the `<script>` block: `CONFIG` (URLs/plumbing), `RULES` (geocoder-specific validation knobs — see [Validation and the geocoder](#validation-and-the-geocoder)), and `THEME` (colours).

### `CONFIG` — URLs and tuning

```js
const CONFIG = {
  exportUrl:    'https://storage.googleapis.com/marduk-production/tiamat/Current_latest.zip',
  nsrStopUrl:   'https://stoppested.entur.org/{id}',
  nsrLinkLabel: 'NSR ↗',
  chunkSize:    4 * 1024 * 1024,
  ratingLabel:  'Issue confidence',
};
```

| Key | Purpose |
|---|---|
| `exportUrl` | Target of the **Get latest export** button. Point at a different environment's NeTEx archive if needed. |
| `nsrStopUrl` | Deep-link template for a single stop place in the NSR editor. `{id}` is replaced with the stop id at runtime. **Verify this path against the live editor.** |
| `nsrLinkLabel` | Text shown on the link button next to each stop in the sidebar. |
| `chunkSize` | Streaming read chunk size in bytes. Smaller = smoother progress bar; larger = marginally faster overall. |
| `ratingLabel` | Display name for the issue-confidence rating throughout the UI. |

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
