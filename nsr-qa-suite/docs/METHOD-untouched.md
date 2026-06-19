# Method — Untouched validator

`// ── tools/untouched.js ──` (inlined in `index.html`)

## Purpose

Flags stop places whose **current-version date** falls in **June 2017** — the month of the pre-QA bulk import that seeded the National Stop Register. A stop still on its 2017 version has never been reviewed or edited since that initial load, making it a candidate for data-quality attention.

## Effective version date

Each stop's effective date is computed as:

1. `fromDate` — the `<FromDate>` element inside the stop's direct `<ValidBetween>` child (the start of the current version's validity period). This is the most reliable indicator of when the version became active.
2. If absent: `changed` — the `changed` XML attribute on `<StopPlace>` (last-modified timestamp).
3. If also absent: `created` — the `created` XML attribute.

The test is: `getUTCFullYear() === 2017 && getUTCMonth() === 5` (June, 0-indexed). UTC is used to avoid timezone drift pushing dates across the month boundary.

Stops with **no date at all** (all three sources null) are excluded from the tool.

## What it means in practice

The 2017 import assigned `created` and `fromDate` values uniformly around the launch date, so the majority of untouched stops will have `fromDate` in June 2017 and a `version` of 1 (initial import). Stops that were later edited will have a later `changed` or `fromDate`, which moves their effective date forward and removes them from this list.

## Transport mode colouring

Each stop is coloured by `transportMode` (read from the direct `<TransportMode>` child of `<StopPlace>`, to avoid picking up quay-level modes from descendants). Modes map to a fixed palette defined in `THEME.modeColors`. Stops whose mode is absent or not in the palette fall back to `other` (grey). Mode filter pills let you scope the list to one or more modes.

## UI

- **Stat cards**: visible untouched count; percentage of all stops in the region.
- **Mode pills**: counts per transport mode within the region; click to filter.
- **List**: stop name with mode-coloured dot, version number, effective date. Sort by name / oldest / newest effective date. NSR deep-link on each row. CAP 400 rows.
- **Map**: one pin per visible stop, filled with the mode colour.

## Caveats and limitations

- `created` is approximately uniform across the 2017 import batch — if only `created` is available (no `fromDate`, no `changed`), the stop will appear in this list even if it was lightly edited in ways that did not update `fromDate` or `changed`. In practice, Tiamat does update `changed` on edits, so this is rare.
- Stops lacking all three date fields are silently excluded. If `fromDate` parsing fails (malformed ISO string), `Date.parse` returns `NaN`, which is treated as null.
- The "untouched" signal is purely date-based; the tool makes no judgement about whether a given stop actually needs QA attention.
