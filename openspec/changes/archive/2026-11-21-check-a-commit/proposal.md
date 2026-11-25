# Proposal

## Why

A change that is already merged, for example as a squash commit, cannot be checked: `diff` reads the checkout's own diff and `files` has no notion of a commit. A review of merged work has to skip tangle today.

## What Changes

- New `--head <commit>` option for `diff` and `changes`: the change is the diff from `merge-base(base, head)` to that commit, and files are read from the commit, whatever is checked out.
- A squash commit is checked with `--base <sha>^ --head <sha>`.
- `--head` cannot be combined with `--committed` or `--changes`.
- The change list format does not change: `head` already accepts a commit.

## Capabilities

### New Capabilities

### Modified Capabilities

- `change-list`: a change list can be built for any commit, not only the checkout.
- `cli`: `diff` and `changes` accept `--head`.

## Impact

CLI argument handling and the git diff step. weakspot-ts is not affected, since the list format stays the same.
