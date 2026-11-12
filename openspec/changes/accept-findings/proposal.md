# Proposal

## Why

A finding someone has looked at and accepted comes back on every run. Today the reviewer has to match it by its `tg-` id against notes kept elsewhere, and the report's counts never go down.

## What Changes

- New `tangle accept <id>... --reason <text>` records accepted findings for the repo, next to its settings and outside the repo.
- A later run moves findings with an accepted id out of the findings into an accepted list, with the reason, and leaves them out of the summary counts.
- An accepted finding comes back by itself when the code its id is built from changes: the function for a size finding, the flagged lines for a bug finding.
- The change list format does not change.

## Capabilities

### New Capabilities

- `accepted-findings`: recording accepted findings and keeping them out of later reports.

### Modified Capabilities

## Impact

New command, a new file per repo under the settings home, and a new `accepted` list in `report.json` and a section in `report.md`. Readers of `report.json` that count findings see fewer of them.
