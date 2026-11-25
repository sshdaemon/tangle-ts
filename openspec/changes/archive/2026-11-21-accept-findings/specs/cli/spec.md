## MODIFIED Requirements

### Requirement: Commands

The CLI SHALL offer `diff` (the checkout against the base, or the files in `--changes`), `files <path[:start-end]>...` (given files or ranges, compared only with `--base`), `changes` (print or write the change list), and `accept <id>... --reason <text>` and `unaccept <id>...` (keep findings out of later reports, or bring them back).

#### Scenario: Files without a base

- **WHEN** `tangle files src/a.ts:10-40` runs without `--base`
- **THEN** every function or hit over a limit that overlaps lines 10 to 40 is reported without comparing

#### Scenario: Change list with base

- **WHEN** `--changes` is combined with `--base` or `--committed`
- **THEN** tangle says the list already names the base and exits with code 2

### Requirement: Output

A finished run SHALL print one summary line (files checked, findings, medium findings, accepted findings and warnings when there are any, time) and the path of `report.md` on stdout. Progress SHALL go to stderr and `--quiet` SHALL silence it. Without `--out`, reports SHALL go to a new folder under `<home>/runs/<repo>/`, where `<home>` is `TANGLE_HOME` or `~/.tangle`.

#### Scenario: Quiet run

- **WHEN** `tangle diff --quiet` runs
- **THEN** stderr is empty and stdout has the summary and report path
