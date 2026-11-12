## Purpose

Accepted findings let a person or reviewer accept a finding once, with a reason, and keep it out of later reports until the code behind it changes.

## ADDED Requirements

### Requirement: Accept findings by id

`tangle accept <id>... --reason <text>` SHALL record each id with the reason and the date for the repo, outside the repo, and SHALL refuse ids that do not start with `tg-` or a missing reason with exit code 2.

#### Scenario: Accept one finding

- **WHEN** `tangle accept tg-1a2b3c --reason "long but flat switch"` runs in a repo
- **THEN** the id and reason are stored for that repo and the repo has no new files

#### Scenario: No reason

- **WHEN** `tangle accept tg-1a2b3c` runs without `--reason`
- **THEN** tangle exits with code 2

### Requirement: Accepted findings leave the findings list

A run SHALL move every finding whose id was accepted into an `accepted` list in `report.json` with its reason, show it in its own section of `report.md`, and leave it out of the summary counts.

#### Scenario: Accepted finding on the next run

- **WHEN** a finding was accepted and the next run finds it again with the same id
- **THEN** it appears under accepted, not under findings, and the summary does not count it

### Requirement: Changed code brings a finding back

Acceptance SHALL hold only for the exact id, so a finding whose id changed with its code SHALL be reported again.

#### Scenario: Function edited after accepting

- **WHEN** the accepted function's code changes and it is still over the limit
- **THEN** the finding is reported as new
