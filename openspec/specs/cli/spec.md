# cli Specification

## Purpose

The `tangle` command line runs checks on a checkout's diff, a change list or given files, and tells scripts through its exit code whether the run itself worked.

## Requirements

### Requirement: Commands

The CLI SHALL offer `diff` (the checkout against the base, or the files in `--changes`), `files <path[:start-end]>...` (given files or ranges, compared only with `--base`) and `changes` (print or write the change list).

#### Scenario: Files without a base

- **WHEN** `tangle files src/a.ts:10-40` runs without `--base`
- **THEN** every function or hit over a limit that overlaps lines 10 to 40 is reported without comparing

#### Scenario: Change list with base

- **WHEN** `--changes` is combined with `--base` or `--committed`
- **THEN** tangle says the list already names the base and exits with code 2

### Requirement: Exit codes

The exit code SHALL be 0 when the run finished, whatever it found; 2 for bad usage, settings or change list; 1 when git or oxlint fails; 130 when interrupted.

#### Scenario: Findings do not fail the run

- **WHEN** a run reports findings
- **THEN** it exits with code 0

#### Scenario: Unknown command

- **WHEN** `tangle bogus` runs
- **THEN** it prints the usage and exits with code 2

#### Scenario: Unknown option or bad range

- **WHEN** `tangle diff --bogus` or `tangle files a.ts:40-10` runs
- **THEN** it names the problem and exits with code 2

### Requirement: Output

A finished run SHALL print one summary line (files checked, findings, medium findings, warnings when there are any, time) and the path of `report.md` on stdout. Progress SHALL go to stderr and `--quiet` SHALL silence it. Without `--out`, reports SHALL go to a new folder under `<home>/runs/<repo>/`, where `<home>` is `TANGLE_HOME` or `~/.tangle`.

#### Scenario: Quiet run

- **WHEN** `tangle diff --quiet` runs
- **THEN** stderr is empty and stdout has the summary and report path

### Requirement: Nothing written into the checked repo

A run SHALL NOT create or change files inside the repo it checks, except where `--out` points.

#### Scenario: Clean checkout stays clean

- **WHEN** tangle checks a clean checkout without `--out`
- **THEN** `git status` shows no changes afterwards
