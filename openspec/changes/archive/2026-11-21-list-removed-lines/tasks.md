# Tasks

## 1. Change list

- [x] 1.1 Record per file whether the diff removed any line, from the hunk headers' old counts
- [x] 1.2 Test: a missing old count removes one line, a zero count none
- [x] 1.3 List a modified file that only lost lines with no ranges, and write `removedLines` for every file
- [x] 1.4 Test: through git, a spec that only lost a test is listed with `ranges: []` and `removedLines: true`
- [x] 1.5 Read an optional boolean `removedLines` from a change list file
- [x] 1.6 Test: the field round-trips, older lists without it stay valid, a non-boolean is refused

## 2. Triage

- [x] 2.1 Skip a file with no added or changed lines
- [x] 2.2 Test: the deletion-only file is skipped with its reason, the other file is kept

## 3. Checks

- [x] 3.1 npm run lint, npm run spec -- validate --all --strict, npm run typecheck, npm test, and tangle on its own diff
