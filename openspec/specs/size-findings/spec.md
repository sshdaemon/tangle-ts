# size-findings Specification

## Purpose

Size findings point at functions a change made harder to follow, measured by cognitive complexity, nesting, conditional operators in one expression and nested ternaries, and leave alone functions the change only passed through.

## Requirements

### Requirement: Report only what got worse

A function that overlaps a changed line SHALL get a size finding for a rule only when it is new and over the limit, crossed the limit, or got worse while over it. Functions SHALL be matched between versions by name.

#### Scenario: Function made more complex

- **WHEN** a changed function had cognitive complexity 10 and now has 30, with the limit at 15
- **THEN** it gets a finding with score before 10 and after 30

#### Scenario: Old complexity left alone

- **WHEN** a changed function was already at 30 and is still at 30
- **THEN** it gets no finding

### Requirement: Scores and counts

Cognitive complexity and expression complexity findings SHALL carry the function's highest score before and after. Nesting and nested-ternary findings SHALL carry the number of places over the limit before and after. `before` SHALL be null for new code.

#### Scenario: New function

- **WHEN** a new function has cognitive complexity 20
- **THEN** its finding has score before null and after 20

### Requirement: Severity rises with the score

A scored finding SHALL be medium when its score rose by at least `raiseAt` (default 10), counting new or uncompared code from zero, and low otherwise. Count findings SHALL be low.

#### Scenario: Large rise

- **WHEN** a function's cognitive complexity goes from 10 to 30
- **THEN** the finding is medium

#### Scenario: Small rise

- **WHEN** a function's cognitive complexity goes from 14 to 17
- **THEN** the finding is low

### Requirement: Uncompared code

When there is no before version to compare with (`files` without `--base`, or a before version that does not parse), every function over a limit in range SHALL be reported, and the claim SHALL say it was not compared.

#### Scenario: Before version does not parse

- **WHEN** a file did not parse at the merge base and its function is over the limit now
- **THEN** the finding's claim says "(not compared)" and the report has a warning naming the file

### Requirement: Function names

Findings SHALL name the enclosing function: `Class.method` for members, `outer/inner` for nested functions, `describe("x")/it("y")` for test callbacks, and `<name callback>` for other unnamed callbacks, numbered `#2` and up when repeated in one scope. Overload signatures without a body SHALL be ignored.

#### Scenario: Nested function in a method

- **WHEN** a function `inner` sits inside method `run` of class `Svc`
- **THEN** it is named `Svc.run/inner`
