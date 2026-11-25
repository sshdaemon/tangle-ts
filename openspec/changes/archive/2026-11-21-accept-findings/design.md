# Design

## Context

Finding ids already ignore line numbers and change with the code they are built from (the function for size findings, the flagged lines for bug findings), so an id is a safe key for "this exact code was looked at". Settings live in `<home>/repos/<key>.json`; accepted findings belong next to them.

## Goals / Non-Goals

**Goals:**
- Accept once, stay quiet until the code changes.
- Keep the repo free of tangle files.

**Non-Goals:**
- Accepting a whole rule or a whole file. Settings cover that.
- Syncing accepted findings between machines.

## Decisions

- Store at `<home>/repos/<key>.accepted.json`: an object keyed by id, each with `reason` and `acceptedAt`. When one of the 20 newest reports under `<home>/runs/<key>/` has the id, its `rule` and `where` are stored too, for a reader of the file. Reports written with `--out` elsewhere are not searched.
- Unknown ids are accepted as given, since a reviewer may accept a finding from a report on another branch.
- Only tangle keeps the list. A review process that records its own rulings runs `tangle accept` alongside; tangle reads no other file.
- `tangle unaccept <id>...` ships too. It changes nothing when any id is not accepted, so a typo cannot leave a finding half undone.
- A module-level size finding's id hashes the whole file's text, so any edit to the file brings an accepted one back. Before, such ids used no text at all and an acceptance would have held for good.
- The file is written aside and renamed, so an interrupted write never leaves half a file.

## Risks / Trade-offs

- The file grows with ids whose code is gone. A later `tangle accepted --prune` could drop ids not seen for a while; left out for now.
