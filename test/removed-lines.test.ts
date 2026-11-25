import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { parseDiff } from '../src/change/diff.ts';
import { ChangeListError, parseChangeList, serializeChangeList } from '../src/change/change-list.ts';
import { triage } from '../src/change/triage.ts';
import { changeListFromGit } from '../src/cli/changes.ts';

test('a file whose change only deletes lines is listed with no ranges and removedLines, and checks nothing', () => {
  const repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tangle-removed-')));
  try {
    const g = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
    g('init', '-q', '-b', 'main');
    writeFileSync(path.join(repo, 'a.test.ts'), "import { a } from './a';\n\ntest('a', () => {});\ntest('b', () => {});\n");
    writeFileSync(path.join(repo, 'b.ts'), 'export const b = 1;\n');
    g('add', '-A');
    g('commit', '-qm', 'base');
    g('checkout', '-qb', 'feature');
    writeFileSync(path.join(repo, 'a.test.ts'), "import { a } from './a';\n\ntest('a', () => {});\n");
    writeFileSync(path.join(repo, 'b.ts'), 'export const b = 2;\n');
    g('commit', '-qam', 'drop a test');
    const list = changeListFromGit(repo, 'main', true);
    assert.deepEqual(list.files, [
      { path: 'a.test.ts', status: 'modified', ranges: [], removedLines: true },
      { path: 'b.ts', status: 'modified', ranges: [{ start: 1, end: 1 }], removedLines: true },
    ]);
    assert.deepEqual(
      triage(list.files, [], 'bugRules').map((d) => [d.file.path, d.kept, d.reason]),
      [
        ['a.test.ts', false, 'no added or changed lines'],
        ['b.ts', true, ''],
      ],
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('a hunk header without an old count removes one line; a zero count removes none', () => {
  const diff = (header: string) => ['diff --git a/x.ts b/x.ts', '--- a/x.ts', '+++ b/x.ts', header, '+y', ''].join('\n');
  assert.equal(parseDiff(diff('@@ -3 +3 @@'))[0]!.removedLines, true);
  assert.equal(parseDiff(diff('@@ -3,0 +4 @@'))[0]!.removedLines, false);
  assert.equal(parseDiff(diff('@@ -3,2 +3,0 @@'))[0]!.removedLines, true);
});

test('removedLines round-trips through the JSON form, is optional for older lists, and must be a boolean', () => {
  const list = {
    repo: '/r',
    base: 'main',
    head: 'working-tree',
    files: [
      { path: 'a.ts', status: 'modified' as const, ranges: [], removedLines: true },
      { path: 'b.ts', status: 'renamed' as const, oldPath: 'c.ts', ranges: [], removedLines: false },
      { path: 'd.ts', status: 'added' as const, ranges: 'whole' as const },
    ],
  };
  assert.deepEqual(parseChangeList(JSON.parse(serializeChangeList(list)), 'x'), list);
  assert.throws(() => parseChangeList({ ...list, files: [{ path: 'a.ts', status: 'modified', ranges: [], removedLines: 'yes' }] }, 'f'), (err: unknown) => err instanceof ChangeListError && /files\[0\]\.removedLines must be true or false/.test(err.message));
});
