## MODIFIED Requirements

### Requirement: Spec files get the bug rules only by default

Spec and test files (`.spec`, `.test` or `.e2e-spec` before the extension) SHALL get only the bug rules by default, so neither size nor shape findings. The `specs` setting SHALL allow `skip` (drop them) and `all` (every rule).

#### Scenario: Default

- **WHEN** a changed `a.spec.ts` has a deeply nested function and an `x === x`
- **THEN** only the `x === x` is reported

#### Scenario: Specs set to all

- **WHEN** `specs` is `all`
- **THEN** the size rules apply to spec files too

#### Scenario: Shape rules in a spec file

- **WHEN** a changed `a.spec.ts` has a public method that only branches on a boolean parameter
- **THEN** it is reported only when `specs` is `all`
