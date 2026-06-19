# Method — GroupOfStopPlaces validator

`js/tools/gosp.js`

## Purpose

A `GroupOfStopPlaces` (GOSP) groups related stop places under a shared name and `PurposeOfGrouping`. This tool checks that a group's **members are appropriate**, and gives a geographic overview of each group.

Unlike the original standalone (which fetched each member from the API), members are now resolved against the **stop index parsed from the same file** — so it is instant and fully offline.

## Data

From the file's `groupsOfStopPlaces`: each `GroupOfStopPlaces` has a `Name`, optional `PurposeOfGroupingRef`, a `Centroid`, and `members` (a list of `StopPlaceRef`). Each ref is looked up in the shared stop index.

## Validation

A member is **disapproved** if either:

| Reason | Meaning |
|---|---|
| **Expired** | The stop's `ValidBetween` end date is in the past. |
| **Monomodal child** | The stop has a `parentSiteRef` and is not itself a parent (`IS_PARENT_STOP_PLACE` ≠ true). It belongs inside its multimodal parent and should be reached via the parent, not listed directly in a group. |

A member that can't be resolved in the file is also counted as a problem (`?`).

A member is **approved** otherwise — i.e. a multimodal parent, or a standalone monomodal stop that is still valid.

## Region

A group matches the active region filter if **any** of its members is in the selected county/municipality (groups can span municipalities).

## UI

- Filter cards: by PurposeOfGrouping (coloured). Toggle: only groups with problems. Search by name/ID.
- List: per group, a PoG dot, name, NSR group link, and badges (total / ✓ approved / ✗ disapproved / ? unresolved). Sorted worst-first.
- Map: one pin per group at its centroid, coloured by PurposeOfGrouping. Selecting a group draws its member stops (green = approved, red = disapproved) with dashed lines back to the centroid, and fits the view to them.

## Notes

- Validity element-name casing (`ValidBetween`/`ToDate`) is read tolerantly during parse; verify expiry handling against the real file if expired members are expected.
