# Method & Purpose

## Purpose

This tool exists to support **data quality assurance on GroupOfStopPlaces (GOSP)** in the Entur National Stop Register (NSR).

A GOSP is a named grouping of stop places used to express that several physically or functionally related stops belong together — for example, all stops serving a city, a transport hub, or a specific journey pattern. The `PurposeOfGrouping` attribute classifies what kind of grouping it is.

The primary use case is to **detect structurally incorrect members** — stops that should not be listed as direct members of a GOSP — and to give data managers a quick visual overview of what each GOSP covers geographically.

---

## Data model

```
GroupOfStopPlaces (GOSP)
├── id                          NSR:GroupOfStopPlaces:NNN
├── name
├── purposeOfGroupingRef        NSR:PurposeOfGrouping:N
├── centroid                    lat/lng
└── members[]
    └── StopPlaceRef            NSR:StopPlace:NNN
            │
            ▼ fetched individually
        StopPlace
        ├── id
        ├── name
        ├── centroid
        ├── parentSiteRef       present if this stop is a child of a multimodal stop
        ├── validBetween.toDate expiry date (if set)
        └── keyList
            └── IS_PARENT_STOP_PLACE   "true" | "false"
```

### Stop place types relevant to validation

| Type | parentSiteRef | IS_PARENT_STOP_PLACE | Expected in GOSP? |
|---|---|---|---|
| Multimodal parent | absent | true | ✓ Yes |
| Monomodal standalone | absent | false | ✓ Yes |
| Monomodal child | present | false | ✗ No — should be reached via the parent |
| Expired (any type) | any | any | ✗ No |

---

## Validation logic

```
isExpired  = validBetween.toDate exists AND toDate < today
isChild    = parentSiteRef is present AND IS_PARENT_STOP_PLACE ≠ "true"

approved   = NOT isExpired AND NOT isChild
disapproved = isExpired OR isChild
```

When both conditions are true (expired child), expiry is shown as the primary reason.

---

## API design decisions

### Single-file application

The tool is a single `.html` file with no external dependencies beyond two CDN-hosted libraries (Leaflet CSS + JS) and the Entur API. This makes it trivial to share, open, and modify — no Node.js, no build step, no server required.

### REST, not GraphQL

The Entur stop-places API exposes both a REST interface and a GraphQL interface. The REST interface was chosen because:
- It requires no query authoring.
- The GOSP list and individual stop endpoints return well-structured JSON that is straightforward to parse.
- It matches what Entur's own tooling uses internally.

### Paginated GOSP list

The `GET /groups-of-stop-places` endpoint defaults to returning 20 results. The tool requests `?count=1000` to retrieve all GOSPs in a single request. If Entur adds more GOSPs in future, increasing this number is the only change needed.

### Stop places fetched individually

There is no batch endpoint for stop places. Each `NSR:StopPlace:NNN` requires its own `GET /stop-places/{id}` request. The tool fetches all members of one GOSP in parallel, then moves to the next GOSP with a 150 ms pause — this gives:

- **Progressive rendering** — each GOSP's badges update as soon as its stops are loaded, so the UI is useful well before all data arrives.
- **Backpressure** — the pause between GOSP batches avoids hammering the API with hundreds of simultaneous requests.
- **Deduplication** — a `stopCache` Map means any stop that appears as a member of multiple GOSPs is only fetched once.

### Two map layers

```
gospLayer   — always visible after load; one pin per GOSP centroid
detailLayer — cleared and redrawn whenever a GOSP is selected;
              shows member stop markers and dashed connecting lines
```

Keeping them separate allows the GOSP overview to remain stable on the map while the detail changes with each selection.

### Colour strategy

Four accent colours cover all semantic roles:

| Role | Default |
|---|---|
| `primary` | GOSP pins, sidebar active state |
| `error` | Disapproved stops, UI danger elements |
| `ok` | Approved stops |
| `accent` | Links, secondary counts |

PurposeOfGrouping differentiation uses a separate `pogPalette` of four colours that cycle across distinct PoG values. These are intentionally distinct from `ok` (green) and `error` (red) to avoid ambiguity with validation status.

All colours are defined in the `THEME` object and injected as CSS custom properties at startup, so changing any colour requires editing exactly one line.

---

## Known limitations

- **No batch stop endpoint.** Fetching stops one-by-one is slow for large GOSPs. If Entur exposes a multi-ID endpoint in future, this would significantly speed up initial load.
- **No write capability.** The tool is deliberately read-only. Corrections must be made in NSR directly.
- **CORS.** The stop-places API must be opened via an HTTP server (or a browser that doesn't block `null` origins) — opening `gosp-qa.html` as a `file://` URL may cause the individual stop requests to be blocked by CORS policy in some browsers.
- **No pagination beyond `?count=1000`.** If the GOSP count exceeds 1000, the tool will silently miss the remainder.
