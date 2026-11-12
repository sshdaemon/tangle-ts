# file-triage Specification

## Purpose

Triage decides which changed files are worth checking and which rules apply to each, so reports skip files that hold no logic and keep size limits off test code by default.

## Requirements

### Requirement: Only TypeScript files are checked

Files SHALL be checked only when their path ends in `.ts`, `.tsx`, `.mts` or `.cts`. Other files SHALL be listed as skipped with the reason.

#### Scenario: JSON file in the change

- **WHEN** the change includes `x.json`
- **THEN** the report lists it as skipped, "not a TypeScript file"

### Requirement: Skip patterns

Files whose repo-relative path matches a skip pattern SHALL be skipped. The default patterns cover declaration files (`.d.ts`, `.d.mts`, `.d.cts`), migrations, generated code and stories.

#### Scenario: Declaration file

- **WHEN** the change includes `src/skip.d.ts` and the default patterns apply
- **THEN** the report lists it as skipped, naming the pattern it matched

### Requirement: Spec files get the bug rules only by default

Spec and test files (`.spec`, `.test` or `.e2e-spec` before the extension) SHALL get only the bug rules by default. The `specs` setting SHALL allow `skip` (drop them) and `all` (every rule).

#### Scenario: Default

- **WHEN** a changed `a.spec.ts` has a deeply nested function and an `x === x`
- **THEN** only the `x === x` is reported

#### Scenario: Specs set to all

- **WHEN** `specs` is `all`
- **THEN** the size rules apply to spec files too
