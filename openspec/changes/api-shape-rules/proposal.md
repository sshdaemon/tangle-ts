# Proposal

## Why

A method can take a boolean that only picks which branch runs, an optional callback mixed into an options bag, or hand a result back through an outer `let` that a callback assigns. Each makes the method harder to call and to change, and review does not always notice them. The sonarjs selector-parameter rule (S2301) needs type information, which oxlint's JavaScript plugins do not provide, and it skips destructured options, so tangle finds these shapes itself.

## What Changes

- Three new rules, run by tangle from the file's syntax rather than by oxlint: `tangle/selector-parameter`, `tangle/callback-in-options` and `tangle/result-out-of-closure`.
- Their hits are reported as `low` findings in a new `design` category, wherever they land on a changed line, with `tg-` ids built like bug finding ids.
- Spec files get no shape findings by default, as with size findings.
- The change list format does not change.

## Capabilities

### New Capabilities

- `shape-findings`: the three API-shape rules and how their hits are reported.

### Modified Capabilities

- `report`: findings can have the category `design`.
- `file-triage`: spec files get the bug rules only, so no shape rules either, unless `specs` is `all`.

## Impact

`report.json` readers see a third category value and new rule names. Existing findings and their ids do not change.
