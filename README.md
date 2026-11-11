# tangle-ts

Complexity and logic-smell checks on the lines a change touched, for TypeScript projects. It reports a function only when the change made it harder to follow, and flags code that is almost always a mistake (`x === x`, a condition repeated in an `else if`, branches that all do the same thing) wherever it lands on a changed line.

A local tool for reviewing changes with a person or an agent. Nothing is installed into or written inside the project: oxlint and `eslint-plugin-sonarjs` are pinned in this repo, and reports go to `~/.tangle/`.

## What it does

1. Takes a change: the checkout's diff against a base, a change list file, or explicit files and line ranges.
2. Drops files that hold no logic (declarations, migrations, generated code, stories) by configurable patterns. Specs get the bug rules only.
3. Lints the files as they are now and as they were at the merge base, with an oxlint config that turns on only the rules below.
4. Maps every hit to its enclosing function (`Class.method`, `outer/inner`, `describe("x")/it("y")`).
5. Reports a size finding when a function that overlaps the change is new, crossed a limit, or got worse; reports a bug finding when it hits a changed line.
6. Writes `report.md` and `report.json`.

## Rules

Size (one finding per function, only when worse than before):

- `sonarjs/cognitive-complexity`: how hard a function is to read; nesting costs more than flat branches. Limit 15.
- `sonarjs/nested-control-flow`: `if`/`for`/`while`/`switch`/`try` nested more than 3 deep.
- `sonarjs/expression-complexity`: a boolean expression with more than 3 conditional operators.
- `sonarjs/no-nested-conditional`: a ternary inside a ternary.

Bug (every hit on a changed line): `no-identical-expressions`, `no-identical-conditions`, `no-all-duplicated-branches`, `no-duplicated-branches`, `no-gratuitous-expressions`, `no-inverted-boolean-check`, `no-identical-functions`, `no-invariant-returns`, `no-redundant-assignments`, `no-unused-collection`.

## Use

```bash
npm install
node bin/tangle.js diff                         # this checkout against the base, including uncommitted work
node bin/tangle.js diff --base origin/main --committed
node bin/tangle.js changes --out changes.json   # write the change list
node bin/tangle.js diff --changes changes.json  # check exactly the files and lines in a list
node bin/tangle.js files src/a.ts:10-40 src/b.ts [--base origin/develop]
```

Options: `--repo`, `--base`, `--changes`, `--committed`, `--out`, `--quiet`. `node bin/tangle.js --help` lists them. `files` without `--base` reports every hit in range instead of comparing.

Needs Node 22.18 or later (the CLI runs the TypeScript sources directly) and `git`.

## Change list

The `--changes` file is shared with weakspot-ts: the same JSON, read by both tools, so they look at the same lines.

```json
{
  "repo": "/abs/path/to/repo",
  "base": "origin/develop",
  "head": "working-tree",
  "files": [
    { "path": "src/x.service.ts", "status": "modified", "ranges": [[12, 40], [88, 91]] },
    { "path": "src/y.ts", "status": "renamed", "oldPath": "src/old-y.ts", "ranges": "whole" }
  ]
}
```

`head` says where files and ranges come from: a commit (files are read from that commit through git), or `"working-tree"` (files on disk, uncommitted work included; the merge base is taken from HEAD). `tangle changes` writes `"working-tree"`, or the commit with `--committed`. `ranges` are inclusive lines of those files, or `"whole"`. The before version is read at `merge-base(base, head)`.

## Configure

Per-project settings live outside the project, in `~/.tangle/repos/<repo>.json`, where `<repo>` is the origin remote's name (so worktrees share the main checkout's settings), or the main checkout's folder name without a remote. See [config/example.json](config/example.json). Keys: `base`, `skip` (regexes on the repo-relative path), `specs` (`bugRules`, `skip` or `all`), `thresholds`, `raiseAt` (a size finding is medium when its score rose by at least this much, otherwise low; new code rises from zero), `oxlint` (a different oxlint binary).

## Reading a report

- Size findings carry `score` (cognitive and expression complexity: highest before and after) or `count` (places over the limit before and after). `before` is null for new code.
- Finding ids hash the repo, file, rule, function name and the function's text, not line numbers, so a finding keeps its id when code moves.
- Complexity that moves between functions reads as new: logic pulled out of a callback into its method shows the method going from 0 to the callback's old score.

## Limits

- sonarjs rules that need type information do not run under oxlint, and neither do rules built on ESLint's code path analysis (`no-dead-store`). They are left out.
- Functions are matched between versions by name; a rename makes the function look new.
- Unnamed callbacks are numbered in order (`<map callback>`, `<map callback>#2`). Adding one before others shifts the numbers, so an edited callback can be compared with a different one from the base.
- A file that does not parse is skipped with a warning; when only its before version does not parse, it is reported without comparing.

## Develop

```bash
npm run typecheck
npm test
```
