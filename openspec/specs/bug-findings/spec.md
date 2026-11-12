# bug-findings Specification

## Purpose

Bug findings flag code that is almost always a mistake, such as `x === x`, a repeated condition, or branches that all do the same thing, wherever it lands on a changed line.

## Requirements

### Requirement: Every hit on a changed line

Each hit of a bug rule on a changed line SHALL be reported as a medium finding, whether or not the same code was there before. Hits outside the changed lines SHALL NOT be reported.

#### Scenario: Identical operands

- **WHEN** a changed line has `a.x === a.x`
- **THEN** the report has a `sonarjs/no-identical-expressions` finding for that line

#### Scenario: Hit on an unchanged line

- **WHEN** the same pattern sits on a line the change did not touch
- **THEN** it is not reported

### Requirement: Code outside functions

A hit outside any function SHALL name `<module>` as its function.

#### Scenario: Top-level expression

- **WHEN** a changed top-level statement has a gratuitous condition
- **THEN** the finding's function is `<module>`
