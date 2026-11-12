# change-list Specification

## Purpose

The change list says which files and lines a check covers. It is a JSON file that tangle writes from git and that both tangle and weakspot-ts read, so the two tools look at the same lines.

## Requirements

### Requirement: Change list format

A change list SHALL be a JSON object with `repo` (absolute path), `base` (a git ref), `head` (a commit or `"working-tree"`) and `files`. Each file SHALL have a repo-relative `path`, a `status` of `added`, `modified` or `renamed`, an `oldPath` when renamed, and `ranges`: inclusive `[start, end]` line pairs, or `"whole"`.

#### Scenario: Valid list is read

- **WHEN** `tangle diff --changes list.json` reads a list with one modified file and ranges `[[12, 40]]`
- **THEN** it checks lines 12 to 40 of that file

#### Scenario: Invalid list is refused

- **WHEN** a file entry has an absolute path, a path with `..`, an unknown status, a renamed file without `oldPath`, or a range that is not two positive line numbers in order
- **THEN** tangle names the entry and the problem, and exits with code 2

### Requirement: Head names where files come from

When `head` is a commit, files SHALL be read from that commit through git. When `head` is `"working-tree"`, files SHALL be read from disk, including uncommitted work, and the merge base SHALL be taken from HEAD. When the run compares, the before version of a file is read at the merge base of `base` and `head`.

#### Scenario: Committed list ignores the disk

- **WHEN** a list has a commit as `head` and the file on disk has uncommitted edits
- **THEN** tangle checks the file as it is in that commit

#### Scenario: Working-tree list reads the disk

- **WHEN** a list has `"working-tree"` as `head`
- **THEN** tangle checks the files as they are on disk

### Requirement: Change list from git

`tangle changes` SHALL write the change list of the checkout against the base: committed, staged, unstaged and untracked work, or committed work only with `--committed`. It SHALL leave out deleted files, binary files and modified files whose change only removes lines, mark new files `"whole"`, keep renames with their old path even when they add no lines, and decode git's quoted paths.

#### Scenario: Uncommitted and untracked work is included

- **WHEN** the checkout has an edited tracked file and a new untracked file
- **THEN** the list has the edited lines of the first and the second as `added` with `"whole"`

#### Scenario: Committed only

- **WHEN** `tangle changes --committed` runs
- **THEN** `head` is the commit at HEAD and uncommitted work is left out

#### Scenario: Paths with spaces or accents

- **WHEN** a changed path has a space or a non-ASCII character
- **THEN** the list holds the path as written on disk

### Requirement: Ranges are merged

Ranges in a file SHALL be sorted, and ranges that overlap or touch SHALL be joined.

#### Scenario: Touching ranges

- **WHEN** a file has ranges `[5, 9]`, `[1, 3]` and `[4, 4]`
- **THEN** its ranges become `[1, 9]`
