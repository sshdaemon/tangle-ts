# finding-ids Specification

## Purpose

Finding ids let a reviewer accept a finding once and recognise it again on the next run, even after unrelated edits move it to other lines.

## Requirements

### Requirement: Ids ignore line numbers

A finding id SHALL start with `tg-` and SHALL be derived from the repo, file, rule and function name, not from line numbers. A size finding's id SHALL also use its function's text, and a bug finding's id the text of the flagged lines, each with whitespace collapsed.

#### Scenario: Code moves down

- **WHEN** lines are added above an unchanged function that has a finding
- **THEN** the next run gives that finding the same id

#### Scenario: Function text changes

- **WHEN** the code of a function with a size finding changes
- **THEN** its size finding gets a new id

#### Scenario: Flagged line changes

- **WHEN** the flagged line of a bug finding changes
- **THEN** the bug finding gets a new id, while edits to other lines of the function keep it

### Requirement: Repeated bug hits are told apart

Bug findings with the same rule, function and text SHALL get ids that differ by their order in the function.

#### Scenario: Two identical hits

- **WHEN** one function has `a.x === a.x` twice
- **THEN** the two findings have different ids
