# Tasks

## 1. Change list for a commit

- [ ] 1.1 Build the change list from the merge base to a resolved commit, without untracked files
- [ ] 1.2 Test: a squash commit's list matches the lines it changed, on a checkout of another branch with uncommitted work

## 2. CLI

- [ ] 2.1 Add `--head` to `diff` and `changes`, refusing `--committed` and `--changes` with it
- [ ] 2.2 Test: conflicting options exit with code 2; an unknown commit exits with code 1
- [ ] 2.3 Document `--head` and the squash-commit form in the README and usage text

## 3. Checks

- [ ] 3.1 npm run lint, npm run spec -- validate --all --strict, npm run typecheck, npm test, and tangle on its own diff
