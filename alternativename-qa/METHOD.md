# Method & Purpose

## Purpose

This tool supports **quality assurance of AlternativeName data** on stop places in the Entur National Stop Register (NSR).

A `StopPlace` has one primary `Name`. It may additionally carry any number of `AlternativeName` entries — each classified by a `NameType` (alias, translation, label, …) and written in a particular language. Alternative names are used for aliases the public might search by, translations into other languages, and display labels.

There is **no single correct shape** for this data, so unlike the GOSP QA tool there are no approve/disapprove rules. The purpose is **visibility**: give a data manager a fast geographic and statistical overview of *where* alternative names exist, *how many*, of *what type*, and in *which languages*.

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

## Visualisation decisions

### Segmented pie pins

A stop can carry several NameTypes simultaneously, and all combinations are possible. Collapsing that to one colour would lose information, so each pin is an SVG disc split into equal arcs — one arc per distinct NameType present, ordered deterministically by a fixed `TYPE_ORDER`. A single-type stop is a plain filled circle; two types split it in half; three types into thirds. The same disc is reused as a small inline dot in the sidebar list.

### Colour vs. text

- **Type** is encoded by **colour** (alias = blue, translation = orange, label = teal), since it is the primary visual differentiator and has few values.
- **Language** is **not** colour-coded — there are too many languages for distinct colours to be readable. Instead the language tag is always printed next to each name and counted in the summary cards.

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
