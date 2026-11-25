# Proposal

## Why

weakspot-ts reads the same change list and counts a changed spec as a reason to check the code it imports. A spec whose only change deletes a test is left out of the list today, because tangle drops modified files that only lost lines, so weakspot never sees a test that was removed. A renamed file with no ranges is also ambiguous: weakspot cannot tell a pure move from a move that lost lines.

## What Changes

- Each file in the change list carries `removedLines`: whether the diff removed any line of it.
- A modified file whose change only removes lines is listed with `"ranges": []` and `"removedLines": true`, instead of being left out.
- tangle skips a listed file with no ranges for its own checks, with the reason "no added or changed lines".
- The change list format changes, so weakspot-ts reads `removedLines` in the same sitting. Lists without the field stay valid.

## Capabilities

### New Capabilities

### Modified Capabilities

- `change-list`: files carry `removedLines`; files that only lost lines are listed.
- `file-triage`: a file with no added or changed lines is skipped.

## Impact

The git diff step, the change list reader and writer, and triage. weakspot-ts reads the new field in its consumer-hooks change.
