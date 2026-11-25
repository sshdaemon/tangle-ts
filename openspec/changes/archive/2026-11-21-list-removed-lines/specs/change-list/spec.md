## MODIFIED Requirements

### Requirement: Change list format

A change list SHALL be a JSON object with `repo` (absolute path), `base` (a git ref), `head` (a commit or `"working-tree"`) and `files`. Each file SHALL have a repo-relative `path`, a `status` of `added`, `modified` or `renamed`, an `oldPath` when renamed, `ranges`: inclusive `[start, end]` line pairs, or `"whole"`, and `removedLines`: whether the diff removed any line of the file. `removedLines` is optional when reading, so older lists stay valid.

#### Scenario: Valid list is read

- **WHEN** `tangle diff --changes list.json` reads a list with one modified file and ranges `[[12, 40]]`
- **THEN** it checks lines 12 to 40 of that file

#### Scenario: Invalid list is refused

- **WHEN** a file entry has an absolute path, a path with `..`, an unknown status, a renamed file without `oldPath`, or a range that is not two positive line numbers in order
- **THEN** tangle names the entry and the problem, and exits with code 2

#### Scenario: removedLines is read

- **WHEN** a list entry has `"removedLines": true` or `false`, or no such field
- **THEN** the list is read as valid, and a non-boolean `removedLines` is refused with exit code 2

### Requirement: Change list from git

`tangle changes` SHALL write the change list of the checkout against the base: committed, staged, unstaged and untracked work, or committed work only with `--committed`. It SHALL leave out deleted files and binary files, list a modified file whose change only removes lines with `"ranges": []` and `"removedLines": true`, mark new files `"whole"`, keep renames with their old path even when they add no lines, and decode git's quoted paths.

#### Scenario: Uncommitted and untracked work is included

- **WHEN** the checkout has an edited tracked file and a new untracked file
- **THEN** the list has the edited lines of the first and the second as `added` with `"whole"`

#### Scenario: Committed only

- **WHEN** `tangle changes --committed` runs
- **THEN** `head` is the commit at HEAD and uncommitted work is left out

#### Scenario: Paths with spaces or accents

- **WHEN** a changed path has a space or a non-ASCII character
- **THEN** the list holds the path as written on disk

#### Scenario: A file that only lost lines

- **WHEN** the change deletes a test from a spec file and adds no lines to it
- **THEN** the list has that file with `"ranges": []` and `"removedLines": true`
