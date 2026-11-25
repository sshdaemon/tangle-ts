## ADDED Requirements

### Requirement: Files without added lines are skipped

A file in the change with no added or changed lines SHALL be skipped with the reason "no added or changed lines", since there is nothing in it to check.

#### Scenario: Spec that only lost a test

- **WHEN** the change list has a file with `"ranges": []`
- **THEN** the report lists it as skipped, "no added or changed lines"
