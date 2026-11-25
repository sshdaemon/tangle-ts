# Tasks

## 1. Rules

- [x] 1.1 Check sonarjs for a selector-parameter rule; S2301 needs type information oxlint does not give, so write the rules in tangle
- [x] 1.2 Find the three shapes from the TypeScript syntax tree and return them as diagnostics
- [x] 1.3 Test: flagged and not-flagged fixtures, including the execute-around methods, an accumulator and an event handler

## 2. Report

- [x] 2.1 Report shape hits on changed lines as low `design` findings, skipped for spec files unless `specs` is `all`
- [x] 2.2 Test: one finding on the changed method only, with a `tg-` id, and none in a spec file by default
- [x] 2.3 Document the rules in the README

## 3. Checks

- [x] 3.1 npm run lint, npm run spec -- validate --all --strict, npm run typecheck, npm test, and tangle on its own diff
