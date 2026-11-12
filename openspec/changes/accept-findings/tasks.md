# Tasks

## 1. Store

- [ ] 1.1 Read and write `<home>/repos/<key>.accepted.json`, validating ids and reasons
- [ ] 1.2 Test: accepting writes the file outside the repo; bad ids and a missing reason exit with code 2

## 2. Command

- [ ] 2.1 Add `tangle accept <id>... --reason <text>` to the CLI and usage text
- [ ] 2.2 Test: accepting twice keeps the latest reason

## 3. Report

- [ ] 3.1 Move accepted findings to an `accepted` list in `report.json` and a section in `report.md`, and leave them out of the summary
- [ ] 3.2 Test: an accepted finding is listed as accepted on the next run, and comes back after its function changes
- [ ] 3.3 Document accepting findings in the README

## 4. Checks

- [ ] 4.1 npm run lint, npm run spec -- validate --all --strict, npm run typecheck, npm test, and tangle on its own diff
