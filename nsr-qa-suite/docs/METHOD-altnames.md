# Method — AlternativeNames validator

`js/tools/altnames.js`

## Purpose

A `StopPlace` has one primary `Name` and may carry any number of `AlternativeName` entries, each with a `NameType` (alias / translation / label / …) and a language. This tool helps clean the data by flagging aliases that are **useless** (the geocoder already finds the stop without them) or **unhelpful** (they point somewhere unrelated), plus deterministic data-hygiene flags.

It does **not** auto-delete: it scores and ranks so a human reviews worst-first.

## Scope: aliases only

Only `alias` names are scored. A `translation` is *meant* to differ from the name and a `label` is a display string, so the useless/unhelpful logic would be noise for them — they appear unrated. The MALFORMED and COLLISION flags still apply to every type.

## Issue confidence

`Issue confidence = noisyOr(useless, unhelpful)` — any single strong reason drives it high; two moderate ones compound (never diluted like an average).

### USELESS — would the geocoder already find the stop without this alias?

Grounded in the geocoder Entur runs, **komoot/photon 1.2.0**: it fuzzy-matches each query word with Elasticsearch/OpenSearch `fuzziness "AUTO"` (0 edits ≤2 chars, 1 for 3–5, 2 for ≥6) **and `prefixLength 2`** (the first two characters must match exactly). An exact name match outranks fuzzy (reranker scores exact 1.0, fuzzy ~0.7), and an alias identical to the name is dropped at import.

So per alias word, it is "reachable" from a name word when their first two characters match **and** their edit distance is within the AUTO budget. An alias whose every word is reachable (or differs only by generic transit words like `rutebilstasjon`) duplicates what fuzzing the name already covers → useless. Exact duplicate = 1.0.

The `prefixLength 2` gate is decisive: most Norwegian **dialect variants change an early character** (`Røllång`/`Rudlang`, `Nørre`/`Nordre`), so the fuzzy match can't reach them — the alias is the only spelling that finds the stop, and is correctly scored **low** useless. Reachability is computed **without** folding `ø/å/æ` (matching Photon's reranker, which doesn't fold), erring toward keeping dialect aliases.

### UNHELPFUL — does the alias point somewhere unrelated?

Driven by how little the alias shares with the name across three signals: consonant skeleton, longest common substring, and word overlap. `Nymoen`/`Sollia handel` scores high; a shared-stem expansion like `Forskningsparken`/`Forsvarets forskningsinstitutt` lands in the review middle.

## Flags (deterministic, not folded into the score)

- **MALFORMED** — leading/trailing or double spaces, control/invisible characters, empty, numeric-only. Checked on the *raw, untrimmed* alias.
- **COLLISION** — the alias equals another stop's name or alias **in the same municipality**, making search there ambiguous. The municipality name index is built from the loaded model at mount.

## Tuning for a different geocoder

The geocoder-specific knobs are the `RULES` block in the module:

| Knob | Meaning |
|---|---|
| `fuzzyPrefixLength` | Leading chars that must match exactly (Photon: 2). |
| `fuzzyAutoEdits(len)` | Edit budget per word by length (mirrors `AUTO`). |
| `genericWords` | Transit-infrastructure words treated as noise — kept narrow (real categories like `skole` are excluded). |
| `highConfidence` | Threshold for the "high issue confidence" filter card. |

## UI

- Map (Type / Issue toggle): **Type** = segmented pie pin (one arc per NameType); **Issue** = solid disc graded green→yellow→red by confidence, flagged stops ringed dark.
- List/popup: per alias a diverging glyph (**down = useless, up = unhelpful**) + combined %, with a tooltip explaining each axis; flags as badges.
- Filter cards: by issue (high / malformed / collision), by type, by language. Sort by confidence / flagged-first / name.

## Limitations

Thresholds are first-pass estimates from reading the geocoder source, not yet calibrated against bulk review. Detailed geocoder scoring beyond fuzziness is not modelled — `genericWords` is the seam for it.
