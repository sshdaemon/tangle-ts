# Tasks

## 1. Store

- [x] 1.1 Read and write `<home>/repos/<key>.accepted.json`, validating ids and reasons
- [x] 1.2 Test: accepting writes the file outside the repo; bad ids, a missing reason and a broken file exit with code 2

## 2. Commands

- [x] 2.1 Add `tangle accept <id>... --reason <text>` and `tangle unaccept <id>...` to the CLI and usage text
- [x] 2.2 Test: accepting twice keeps the latest reason; unaccepting an id that is not accepted changes nothing

## 3. Report

- [x] 3.1 Move accepted findings to an `accepted` list in `report.json` and a section in `report.md`, and leave them out of the summary counts
- [x] 3.2 Test: an accepted finding is listed as accepted on the next run, and comes back after its function changes
- [x] 3.3 Hash the whole file into module-level size ids, with a test
- [x] 3.4 Document accepting findings in the README

## 4. Checks

- [x] 4.1 npm run lint, npm run spec -- validate --all --strict, npm run typecheck, npm test, and tangle on its own diff
