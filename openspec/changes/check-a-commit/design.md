# Design

## Context

The change list already supports a commit as `head`, and the check step already reads files from a commit through git when `head` is not `"working-tree"`. Only building the list for an arbitrary commit is missing.

## Goals / Non-Goals

**Goals:**
- Check a merged or squash commit without checking it out.

**Non-Goals:**
- Checking a range of several commits other than through `--base`.
- Finding the squash commit of a pull request automatically.

## Decisions

- Diff with `git diff -U0 -M <merge-base> <commit>` instead of the working tree, and skip the untracked-files step.
- Resolve the commit once with `git rev-parse --verify <commit>^{commit}` and write the full SHA to `head`, so a moving ref cannot change the list mid-run.

## Risks / Trade-offs

- `--base <sha>^` on a merge commit compares with the first parent only. That is what a squash merge needs, and it is stated in the README.

## Open questions

- Should callers pass `--head` automatically for merged work, or keep it an explicit flag?
