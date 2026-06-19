# Method — Recent changes validator

`// ── tools/recentchanges.js ──` (inlined in `index.html`)

## Purpose

Shows stop places that have been **modified within a configurable recent window** (last week / last month / last 90 days), relative to the file's `PublicationTimestamp`. Useful for auditing recent edits, spotting newly created stops, and reviewing what changed in a specific region.

## Edit date

Each stop's edit date (`editDate`) is:

1. `changed` — the `changed` XML attribute on `<StopPlace>`. This is the true last-modified timestamp in Tiamat and is preferred because it reflects actual data changes, including edits that do not advance `fromDate`.
2. If absent: `fromDate` — `<FromDate>` inside the stop's direct `<ValidBetween>` child.
3. If also absent: `created` — the `created` XML attribute.

Stops with no edit date at all are excluded from the tool.

## "now" reference point

"Now" is `model.publishedAt` (parsed from `<PublicationTimestamp>` in the NeTEx file), so the recency window is stable relative to the snapshot rather than the user's clock. If `publishedAt` is absent, `Date.now()` is used.

## Time windows

Three sliding windows are offered:

| Key | Label | Days |
|---|---|---|
| `week` | Last week | 7 |
| `month` | Last month | 30 |
| `q` | Last 90 days | 90 |

Switching the window is instant — items are not pre-filtered by window; `inRegion()` applies the cutoff at render time.

## NEW stop detection

A stop is flagged **NEW** when `version === 1` (the `version` attribute on `<StopPlace>`). Version 1 means the record was created, not edited. NEW stops receive a badge in the list and an exclamation mark overlay on their map icon.

## Age-graded icon size

Map icons are sized by age within the window: newer stops get larger pins, older stops get smaller ones. The formula is:

```
frac = min(1, ageDays / windowDays)   // 0 = brand new, 1 = at window edge
r    = round(11 - 6 * frac)           // radius: 11px (new) → 5px (old)
```

Active (selected) icons add +2 to radius.

**Z-order**: smaller (older) pins render **on top** of larger (newer) ones, achieved via `zIndexOffset = round((11 - r) * 200)`. This prevents large new-stop pins from obscuring older ones. The selected marker always sits on top via an additional +100 000 offset.

## VERSION_COMMENT display

If the stop has a `VERSION_COMMENT` key in its `keyList`, the value is shown in the list row and popup. This field is used by Tiamat editors to annotate what changed in a version.

## Transport mode colouring

Same as the Untouched tool — `transportMode` from the direct `<TransportMode>` child, mapped via `THEME.modeColors`.

## UI

- **Window selector**: button group (Last week / Last month / Last 90 days). Changing the window resets the map fit.
- **Stat cards**: changed stop count; new stop count; distinct modes; oldest age in window.
- **Mode pills**: per-mode counts, clickable filter.
- **"Only new stops" toggle**: narrows list to `version === 1` stops.
- **List**: mode-coloured dot; stop name with NEW badge if applicable; version number; edit date; age text; VERSION_COMMENT if present. CAP 400 rows.
- **Map**: age-graded, mode-coloured pins; NEW stops have a "!" overlay.

## Caveats and limitations

- `changed` can post-date `fromDate` when metadata-only edits (name, tags) are made without advancing the validity period. This is intentional — `changed` is the most accurate last-modified signal available in the export.
- The window edge is sharp: a stop edited 31 days ago does not appear in the "Last month" window. This matches the expected use case (auditing a recent batch).
- `version === 1` NEW detection is reliable for stops created after the 2017 import, but some import-era stops may also carry version 1 if they were never subsequently versioned. Cross-reference with the Untouched tab for import-era stops.
