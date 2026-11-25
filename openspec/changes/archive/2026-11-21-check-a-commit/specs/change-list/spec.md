## ADDED Requirements

### Requirement: Change list of a given commit

With `--head <commit>`, `tangle changes` and `tangle diff` SHALL build the change list from the diff between `merge-base(base, commit)` and that commit, with `head` set to the commit, and SHALL read files from the commit instead of the disk.

#### Scenario: Squash commit

- **WHEN** `tangle diff --base <sha>^ --head <sha>` runs on a squash commit
- **THEN** it checks exactly the lines that commit added or changed

#### Scenario: Other branch checked out

- **WHEN** the checkout is on a different branch with uncommitted work
- **THEN** the result is the same as on a clean checkout of the commit
