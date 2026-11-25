## MODIFIED Requirements

### Requirement: Two report files

A run SHALL write `report.json` and `report.md` to its output folder. The JSON SHALL hold `tool`, `version`, `createdAt`, `repo`, `command`, `base` (ref and commit, or null when not compared), `checked`, `dropped` (path and reason of each skipped file), `warnings`, `durationMs`, `findings` and `accepted` (findings whose id was accepted, each with `reason` and `acceptedAt`).

#### Scenario: Run with findings

- **WHEN** a run finds ten findings
- **THEN** `report.md` has a "Findings (10)" section and `report.json` lists the same ten

#### Scenario: Run with accepted findings

- **WHEN** two of a run's findings were accepted
- **THEN** `report.md` has an "Accepted (2)" section with each reason and `report.json` lists them under `accepted`, not under `findings`
