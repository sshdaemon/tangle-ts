## ADDED Requirements

### Requirement: Head option limits

`--head` SHALL be accepted by `diff` and `changes` only, and SHALL NOT be combined with `--committed` or `--changes`. An unknown commit SHALL stop the run with exit code 1 and git's message.

#### Scenario: Head with committed

- **WHEN** `tangle diff --head HEAD --committed` runs
- **THEN** tangle says the two options conflict and exits with code 2

#### Scenario: Commit already in the base

- **WHEN** the head commit, from `--head`, `--committed` or a change list, is one the base already contains, so the change is empty
- **THEN** tangle exits with code 0; `changes` warns on stderr (unless `--quiet`) that the commit is already in the base and suggests `--base <sha>^ --head <sha>`, and `diff` adds the same warning to the report and counts it in the summary

#### Scenario: Unknown commit

- **WHEN** `--head` names a commit that does not exist
- **THEN** tangle exits with code 1 and prints git's error
