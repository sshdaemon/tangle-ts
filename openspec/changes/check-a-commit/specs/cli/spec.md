## ADDED Requirements

### Requirement: Head option limits

`--head` SHALL be accepted by `diff` and `changes` only, and SHALL NOT be combined with `--committed` or `--changes`. An unknown commit SHALL stop the run with exit code 1 and git's message.

#### Scenario: Head with committed

- **WHEN** `tangle diff --head HEAD --committed` runs
- **THEN** tangle says the two options conflict and exits with code 2

#### Scenario: Unknown commit

- **WHEN** `--head` names a commit that does not exist
- **THEN** tangle exits with code 1 and prints git's error
