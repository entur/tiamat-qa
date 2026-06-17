# Method & Purpose

## Purpose

This tool supports **quality assurance of AlternativeName data** on stop places in the Entur National Stop Register (NSR).

A `StopPlace` has one primary `Name`. It may additionally carry any number of `AlternativeName` entries — each classified by a `NameType` (alias, translation, label, …) and written in a particular language. Alternative names are used for aliases the public might search by, translations into other languages, and display labels.

There is **no single correct shape** for this data, so unlike the GOSP QA tool there are no hard approve/disapprove rules. The tool has two jobs:

1. **Visibility** — a fast geographic and statistical overview of *where* alternative names exist, *how many*, of *what type*, and in *which languages*.
2. **Triage** — a per-alias **Issue confidence** score plus deterministic **flags** that surface the aliases most likely worth removing, so a reviewer works worst-first. The tool never deletes anything; it ranks and explains. The scoring is grounded in how the **Entur geocoder** actually matches search input (see [Validation](#validation-issue-confidence)).

---

## Data model

```
PublicationDelivery
└── dataObjects
    └── SiteFrame
        └── stopPlaces
            └── StopPlace                         NSR:StopPlace:NNN
                ├── Name              lang="…"     ← the primary name
                ├── Centroid
                │   └── Location → Longitude / Latitude
                └── alternativeNames
                    └── AlternativeName  (×N)
                        ├── NameType              alias | translation | label | copy | other
                        └── Name      lang="…"    ← the alternative name
```

The tool reads **only** the StopPlace's own `Name`, `Centroid`, and direct-child `alternativeNames`. Quays are ignored — they inherit naming from the StopPlace and carry no alternative names of their own.

### NameType values

NeTEx defines five (`alias`, `translation`, `copy`, `label`, `other`). The Norwegian dataset contains **alias**, **translation** and **label** in practice; `copy` and `other` are handled defensively with fallback colours so an unexpected value never breaks rendering.

---

## Why an in-browser streaming scan

The national NeTEx export is a single XML file of roughly **400 MB**. Loading it whole into a `DOMParser` would consume gigabytes of memory and likely crash the tab. A backend service could pre-process it, but the design goal is a **zero-install, zero-risk, single-file** tool — the data must stay on the user's machine.

The solution is a streaming scan:

1. **Chunked read.** The file is read in `CONFIG.chunkSize` (4 MB) slices via `Blob.slice().arrayBuffer()`, tracking a byte offset for precise progress.

2. **Boundary-safe decoding.** Each slice is decoded with a single `TextDecoder('utf-8')` using `{ stream: true }`. The decoder holds back any incomplete multi-byte sequence at the end of a slice and prepends it to the next — so Norwegian characters (`æ ø å`) that straddle a chunk boundary are never corrupted.

3. **Block extraction.** A running text buffer is scanned for `<StopPlace> … </StopPlace>` blocks. StopPlaces are not nested in NeTEx (parent/child stops are separate elements), so the first `</StopPlace>` after an opening tag always closes it. The opening-tag regex `/<StopPlace[\s>]/` deliberately excludes `<StopPlaceRef` and the lowercase `<stopPlaces>` collection wrapper.

4. **Buffer hygiene.** After each complete block is processed it is sliced off the buffer. When no opening tag is present, only a short tail is retained (in case a tag was split across a chunk), so the buffer can never grow unbounded through the file's non-StopPlace regions.

5. **Fast rejection.** Each block is substring-tested with `indexOf('<alternativeNames')` before any parsing. The large majority of stops have no alternative names and are discarded in a single string scan — this is the key optimisation that keeps the scan fast.

6. **Targeted parsing.** Only blocks that pass the test are handed to `DOMParser`. Fields are read via direct-child traversal to avoid pulling values from nested elements.

Peak memory is therefore one StopPlace block plus the filtered result list — typically a few MB regardless of input size.

### Cooperative yielding

Between chunks the loop `await`s a zero-delay timeout, returning control to the browser so the progress bar repaints and the tab stays responsive throughout the multi-second scan.

---

## Validation: issue confidence

An alias exists to help someone **find** a stop, so it is judged by what it does for the search engine that consumes it — the [Entur geocoder](https://github.com/entur/geocoder/), which runs **komoot/photon 1.2.0**. Reading that source pinned down two behaviours the scoring depends on:

- **Fuzzy matching** (`opensearch/SearchQueryBuilder.java`): each query word is matched with Elasticsearch/OpenSearch `fuzziness "AUTO"` (0 edits for ≤2 chars, 1 for 3–5, 2 for ≥6) and **`prefixLength 2`** — the first two characters of a word must match exactly.
- **Exact preferred over fuzzy** (`searcher/QueryReranker.java`): an exact normalized name match scores `1.0`, prefix matches `0.8–0.9`, fuzzy word matches `~0.7`. There is also a non-fuzzy first pass before the lenient fuzzy fallback.

And from the import converter (`entur/nominatim-converter`, `src/source/stopplace/convert.rs`): every AlternativeName is written to the searchable `alt_name` field, but **an alias identical to the primary name is dropped at import** — never indexed at all.

### Scope: aliases only

The rating is computed for **`alias`** names only. `translation` and `label` names are *expected* to differ from the primary name (a translation that resembled the name would be the useless one, by different rules), so applying the useless/unhelpful logic to them would be noise — they are shown unrated. The MALFORMED and COLLISION flags, being objective data-hygiene checks, still apply to every NameType.

### The rating

**Issue confidence** = `noisy-OR(useless, unhelpful)`. Noisy-OR (`1 − ∏(1 − cᵢ)`) is used instead of an average so any single strong reason drives the total high while two moderate reasons still compound.

**USELESS** — *would the geocoder already find this stop from its official name, making the alias redundant?* For each alias word, it is "reachable" from a name word when their first `fuzzyPrefixLength` characters match **and** their edit distance is within the `AUTO` budget for the word length. An alias whose every word is reachable (or is a pure generic transit word like `rutebilstasjon`) duplicates what fuzzing the name already covers. Exact duplicates score `1.0` — and are in fact never indexed.

The `prefixLength 2` gate is decisive and slightly counter-intuitive: most Norwegian **dialect variants change an early character** (`Røllång`/`Rudlang`, `Nørre`/`Nordre`), so the fuzzy match cannot reach them and the alias is the *only* spelling that finds the stop — correctly scored **low** useless. A naive "edit distance anywhere" rule would wrongly flag these as redundant.

**UNHELPFUL** (aliases only — translations and labels are *meant* to differ) — *does the alias point somewhere unrelated, so searching it returns the wrong stop?* Driven by how little the alias shares with the name across three signals (consonant skeleton, longest common substring, word overlap). `Nymoen`/`Sollia handel` scores high; a shared-stem expansion like `Forskningsparken`/`Forsvarets forskningsinstitutt` scores in the review middle.

### The flags

Deterministic booleans, shown as badges and **not** folded into the numeric score:

- **MALFORMED** — whitespace/double-space/control/invisible/empty/numeric-only, tested against the *raw, untrimmed* alias (so trailing-space bugs survive to be seen).
- **COLLISION** — the alias equals another stop's name or alias **within the same municipality** (`TopographicPlaceRef`). A municipality-keyed index of every stop's names is built cheaply during the scan (regex extraction, no DOM) and consulted in a post-pass, then discarded.

### Geocoder coupling and conservatism

All geocoder-specific parameters live in the `RULES` block (`fuzzyPrefixLength`, `fuzzyAutoEdits`, `genericWords`, `highConfidence`), so the tool can be retargeted by editing one object. Two deliberate choices bias toward **not** deleting good data:

- Reachability is computed **without** folding `ø/å/æ` — matching Photon's reranker (which does not fold) and erring toward keeping dialect aliases rather than wrongly calling them useless.
- `genericWords` is kept narrow (transit infrastructure only); real place categories such as `skole` are excluded, since they can be the actual destination.

Thresholds are first-pass estimates from reading the source, not yet calibrated against bulk human review.

---

## Visualisation decisions

### Segmented pie pins

A stop can carry several NameTypes simultaneously, and all combinations are possible. Collapsing that to one colour would lose information, so each pin is an SVG disc split into equal arcs — one arc per distinct NameType present, ordered deterministically by a fixed `TYPE_ORDER`. A single-type stop is a plain filled circle; two types split it in half; three types into thirds. The same disc is reused as a small inline dot in the sidebar list.

### Colour vs. text

- **Type** is encoded by **colour** (alias = blue, translation = orange, label = teal), since it is the primary visual differentiator and has few values.
- **Language** is **not** colour-coded — there are too many languages for distinct colours to be readable. Instead the language tag is always printed next to each name and counted in the summary cards.

### Map: two views, not one overloaded pin

An earlier version drew an issue-coloured ring around each type pie. It clashed with the type colours and was hard to read, so type and issue are now **separate views** behind a toggle:

- **Type** view — the segmented pie (NameTypes), neutral ring.
- **Issue rating** view — a solid disc graded green→yellow→red by the stop's worst alias confidence; flagged stops get a dark ring so they remain visible even at low confidence.

Keeping them separate means neither signal muddies the other, and the user picks the lens they need.

### Per-alias rating glyph

In the list and popup each alias carries a small **diverging bar**: a bar growing **up** for *unhelpful* (warm colours) and **down** for *useless* (cool colours), from a shared baseline. The two axes move independently, so a glyph that is tall-up/short-down reads instantly as "unrelated, not redundant" and vice-versa. The combined % sits beside it, and a tooltip spells out each axis and why it triggered. A `<details>` disclosure in the sidebar explains the scheme. Translations and labels show no glyph (they are unrated).

### Summary cards as filters

The per-type and per-language counts at the top of the sidebar double as filter toggles. Clicking a card adds or removes its value from the active set:

- Within a category the semantics are **OR** (e.g. `alias` + `translation` → stops with either).
- Across categories they are **AND** (e.g. `translation` + `nor` → stops that have a translation *and* a Norwegian alternative name).

This consolidates "show me the numbers" and "let me filter by them" into a single control, removing the need for separate dropdowns.

### Sidebar row cap

The list renders at most 500 rows for DOM responsiveness; the map still plots every matching stop. A footer notes when results are truncated and prompts the user to narrow the filter.

---

## Known limitations

- **Manual unzip.** The download button fetches a `.zip`; the user must extract the `.xml` and load it. In-browser unzipping was deliberately avoided to keep the dependency surface (and risk) minimal.
- **Plain markers.** Every matching stop is a separate Leaflet marker. For datasets with many thousands of pins this could be optimised with clustering; it is fine for the current volume.
- **Static counts.** The summary counts reflect the full dataset, not the currently active filter — they remain a stable overview while also acting as filter controls.
- **StopPlace level only.** Quay-level data is intentionally out of scope.
- **NSR deep-link path.** `CONFIG.nsrStopUrl` should be verified against the live editor; the stop-place URL pattern may differ from the GOSP pattern.
- **Validation is geocoder-specific and uncalibrated.** The Issue-confidence model mirrors komoot/photon 1.2.0 (the Entur geocoder); a different engine needs different `RULES`. Thresholds have not yet been tuned against bulk review, and the detailed geocoder scoring rules (beyond fuzziness) are not yet modelled — `genericWords` is the seam for them.
