# settings Specification

## Purpose

Per-repo settings tune the base, skip patterns, spec handling, limits and severity without adding a file to the checked repo, and worktrees of one repo share them.

## Requirements

### Requirement: Settings live outside the repo

Settings SHALL be read from `<home>/repos/<key>.json`, where `<home>` is `TANGLE_HOME` or `~/.tangle`, and `<key>` is the origin remote's repo name, or the main checkout's folder name when there is no origin. Without a file, defaults SHALL apply.

#### Scenario: Worktree shares settings

- **WHEN** tangle runs in a worktree of a checkout named `my-repo` with no remote
- **THEN** it reads `repos/my-repo.json`

#### Scenario: No settings file

- **WHEN** no settings file exists
- **THEN** the base is `origin/develop`, the limits are 15, 3 and 3, `specs` is `bugRules` and `raiseAt` is 10

### Requirement: Settings are validated

Settings SHALL accept only `base`, `skip`, `specs`, `thresholds`, `raiseAt` and `oxlint`. An unknown key, at the top level or in `thresholds`, a skip pattern that is not a valid regex, an unknown `specs` value or a limit that is not a non-negative integer SHALL stop the run with exit code 2 and a message naming the file and key.

#### Scenario: Unknown key

- **WHEN** the settings file has a key `colour`
- **THEN** tangle names the key and exits with code 2

#### Scenario: Typo in a limit

- **WHEN** `thresholds` has a key `cognitive`
- **THEN** tangle names `thresholds.cognitive` and exits with code 2
