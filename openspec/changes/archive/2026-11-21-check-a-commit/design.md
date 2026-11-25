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

- `--base <sha>^` names the first parent. A squash commit has only one, so the check is exact; on a merge commit it covers everything the merge brought in. The README says so.

## Resolved questions

- A head the base already contains gives an empty change, which looks like a clean result. tangle warns and suggests the `<sha>^` form instead of refusing.
- `--head` stays an explicit flag. Callers that know a change is merged, such as a review of a squash commit, pass `--base <sha>^ --head <sha>` themselves.
