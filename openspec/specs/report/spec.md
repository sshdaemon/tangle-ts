# report Specification

## Purpose

Each run leaves a report a person can read and a program can parse, with every finding, the files that were skipped and anything that could not be checked.

## Requirements

### Requirement: Two report files

A run SHALL write `report.json` and `report.md` to its output folder. The JSON SHALL hold `tool`, `version`, `createdAt`, `repo`, `command`, `base` (ref and commit, or null when not compared), `checked`, `dropped` (path and reason of each skipped file), `warnings`, `durationMs` and `findings`.

#### Scenario: Run with findings

- **WHEN** a run finds ten findings
- **THEN** `report.md` has a "Findings (10)" section and `report.json` lists the same ten

### Requirement: Finding fields

Each finding SHALL carry an id, severity (`low` or `medium`), category, `where` (`path:line:column` of the first hit), a plain-language claim, evidence, rule and function, plus score or count for size findings.

#### Scenario: Size finding evidence

- **WHEN** a function crosses the cognitive complexity limit of 15
- **THEN** its evidence names the limit as "15 allowed"

### Requirement: Files that do not parse

A file whose current version does not parse SHALL be left unchecked with a warning. A file listed in the change but missing from disk or from the head commit SHALL get a warning too.

#### Scenario: Broken file

- **WHEN** a changed file has a syntax error
- **THEN** the report has a warning that it did not parse and no findings for it
