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

- Store at `<home>/repos/<key>.accepted.json`: an object keyed by id, each with `reason`, `acceptedAt` and the finding's `where` and `rule` at the time, for a reader of the file.
- Unknown ids are accepted as given, since a reviewer may accept a finding from a report on another branch.

## Risks / Trade-offs

- The file grows with ids whose code is gone. A later `tangle accepted --prune` could drop ids not seen for a while; left out for now.

## Open questions

- Should accepted findings also be kept in an external list of review decisions, or only in tangle's file?
- Should `tangle unaccept <id>` exist from the start?
- A size finding outside any function has an id that no code change alters, so accepting it hides it for good. Should its id hash the file's module-level text, or should such findings not be acceptable?
