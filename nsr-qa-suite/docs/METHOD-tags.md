# Method — Tags validator

`js/tools/tags.js`

## Purpose

"Tags" are an Entur **front-end** concept (not NeTEx) used as post-it notes on a stop place to flag something problematic in its data — e.g. `adm_navn` ("name may not follow the handbook or has typos"), `adm_koordinat`, etc. They are stored in the StopPlace `keyList` as `KeyValue` pairs:

```
TAG-{n}-idReference   the stop the tag is on
TAG-{n}-name          the tag category (adm_navn, adm_koordinat, …)
TAG-{n}-comment       free-text note (optional)
TAG-{n}-created       epoch milliseconds
TAG-{n}-removed       epoch milliseconds (present once the tag is resolved)
```

A stop may have several tags (`TAG-0`, `TAG-1`, …). The export retains resolved (removed) tags, so both open and resolved are visible. There is **no author field** in the export.

## What it evaluates — and what it deliberately doesn't

The **quality/severity of an individual tag is impossible to compute** (it's a human note about an arbitrary issue). So this tool does not score correctness. Instead it tracks **resolution progress**:

- **Open** (`removed` absent) vs **resolved** (`removed` present).
- **Age** of open tags — older is worse, because it has gone unresolved longer. Age uses the file's `PublicationTimestamp` as "now", so it reflects the snapshot, not the clock.
- **By tag name** — how many open tags of each category remain.

The list shows stops with at least one open tag, **oldest-first** by default (the natural follow-up queue). Each stop's map pin and list dot are coloured green→red by the age of its oldest open tag (`RULES.ageFullDays`, ~3 years, is the "fully severe" point — colour only, not a judgement).

## UI

- Stat cards: stops with open tags, total open tags, oldest open age, resolved tags (all within the current region).
- Filter cards: by tag name (coloured per category).
- List: per stop, each tag as a coloured name chip + age + date, comment, and resolved date if closed. Sort oldest / newest / name.
- Map: a pin per open-tag stop, age-graded; popup lists the stop's tags.

## Notes / limitations

- Whether the production export retains removed tags long-term should be confirmed; resolution stats depend on it.
- `RULES.ageFullDays` only affects colour scaling, not ranking (ranking is by actual age).
