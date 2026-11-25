# accepted-findings Specification

## Purpose

Accepted findings let a person or reviewer accept a finding once, with a reason, and keep it out of later reports until the code behind it changes.

## Requirements

### Requirement: Accept findings by id

`tangle accept <id>... --reason <text>` SHALL record each id with the reason and the time in `<home>/repos/<key>.accepted.json`, outside the repo, with the same `<home>` and `<key>` as the settings. Accepting an id again SHALL replace its reason. Ids that are not `tg-` followed by ten hex digits, a missing or blank reason, and options that pick a change or a report folder SHALL stop the command with exit code 2.

#### Scenario: Accept one finding

- **WHEN** `tangle accept tg-1a2b3c4d5e --reason "long but flat switch"` runs in a repo
- **THEN** the id and reason are stored for that repo and the repo has no new files

#### Scenario: No reason

- **WHEN** `tangle accept tg-1a2b3c4d5e` runs without `--reason`
- **THEN** tangle exits with code 2

#### Scenario: Accepted twice

- **WHEN** an accepted id is accepted again with another reason
- **THEN** the file holds the id once, with the new reason

### Requirement: Accepted entries name their finding

When one of the 20 newest reports under `<home>/runs/<key>/` has an id being accepted, its rule and place SHALL be stored with it, for a reader of the file.

#### Scenario: Accepting from the last report

- **WHEN** an id from the last run's report is accepted
- **THEN** its entry holds that finding's rule and `where`

### Requirement: Unaccept findings by id

`tangle unaccept <id>...` SHALL drop the ids from the repo's accepted findings. When any of them is not accepted, it SHALL name those ids, change nothing and exit with code 2.

#### Scenario: Unaccept a finding

- **WHEN** an accepted finding is unaccepted
- **THEN** the next run reports it under findings again

#### Scenario: Unknown id

- **WHEN** `tangle unaccept` names one accepted id and one that is not
- **THEN** tangle names the unknown id, keeps both entries as they were and exits with code 2

### Requirement: The accepted file is validated

A run or command that reads an accepted file that is not a JSON object keyed by finding ids, each with a non-empty `reason` and an `acceptedAt`, SHALL stop with exit code 2 and a message naming the file and id.

#### Scenario: Hand-edited file without a reason

- **WHEN** an entry in the accepted file has no reason
- **THEN** tangle names the file and the id and exits with code 2

### Requirement: Accepted findings leave the findings list

A run SHALL move every finding whose id was accepted into an `accepted` list in `report.json`, with its reason and the time it was accepted, show it in an "Accepted" section of `report.md`, and leave it out of the finding counts in the summary.

#### Scenario: Accepted finding on the next run

- **WHEN** a finding was accepted and the next run finds it again with the same id
- **THEN** it appears under accepted, not under findings, and the summary counts it only as accepted

### Requirement: Changed code brings a finding back

Acceptance SHALL hold only for the exact id, so a finding whose id changed with its code SHALL be reported again.

#### Scenario: Function edited after accepting

- **WHEN** the accepted function's code changes and it is still over the limit
- **THEN** the finding is reported under findings with a new id
