import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChangeListError, parseChangeList, serializeChangeList } from '../src/change/change-list.ts';
import { parseDiff, unquote } from '../src/change/diff.ts';
import { LineRange, parseFileArg } from '../src/change/ranges.ts';
import { triage } from '../src/change/triage.ts';

const DIFF = `diff --git a/src/a.ts b/src/a.ts
index 1..2 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -3,0 +4,2 @@ export function a() {
+  x();
+  y();
@@ -10 +12 @@
-old
+new
@@ -20,3 +22,0 @@
-gone
-gone
-gone
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0..3
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+a
+b
+c
diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
--- a/src/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-a
-b
diff --git a/src/before.ts b/src/after.ts
similarity index 90%
rename from src/before.ts
rename to src/after.ts
--- a/src/before.ts
+++ b/src/after.ts
@@ -5 +5 @@
-a
+b
diff --git a/src/moved.ts b/src/moved-too.ts
similarity index 100%
rename from src/moved.ts
rename to src/moved-too.ts
diff --git a/src/only-deletes.ts b/src/only-deletes.ts
--- a/src/only-deletes.ts
+++ b/src/only-deletes.ts
@@ -4,2 +3,0 @@
-a
-b
diff --git a/img.png b/img.png
Binary files a/img.png and b/img.png differ
`;

test('parseDiff keeps added and modified lines of the new file, drops deletions and binaries', () => {
  assert.deepEqual(parseDiff(DIFF), [
    { path: 'src/a.ts', status: 'modified', ranges: [{ start: 4, end: 5 }, { start: 12, end: 12 }] },
    { path: 'src/new.ts', status: 'added', ranges: 'whole' },
    { path: 'src/after.ts', status: 'renamed', oldPath: 'src/before.ts', ranges: [{ start: 5, end: 5 }] },
    { path: 'src/moved-too.ts', status: 'renamed', oldPath: 'src/moved.ts', ranges: [] },
  ]);
});

test('a change list round-trips through its JSON form', () => {
  const list = {
    repo: '/r',
    base: 'origin/develop',
    head: 'abc',
    files: [
      { path: 'a.ts', status: 'modified' as const, ranges: [LineRange.of(1, 2)] },
      { path: 'b.ts', status: 'renamed' as const, oldPath: 'c.ts', ranges: 'whole' as const },
    ],
  };
  assert.deepEqual(parseChangeList(JSON.parse(serializeChangeList(list)), 'x'), list);
});

test('parseChangeList names what is wrong', () => {
  const ok = { repo: '/r', base: 'b', head: 'h' };
  assert.throws(() => parseChangeList({ ...ok, files: [{ path: '../x.ts', status: 'modified', ranges: 'whole' }] }, 'f'), /files\[0\]\.path/);
  assert.throws(() => parseChangeList({ ...ok, files: [{ path: 'x.ts', status: 'renamed', ranges: 'whole' }] }, 'f'), /oldPath/);
  assert.throws(() => parseChangeList({ ...ok, files: [{ path: 'x.ts', status: 'modified', ranges: [[5, 2]] }] }, 'f'), ChangeListError);
  assert.throws(() => parseChangeList({ repo: '/r', files: [] }, 'f'), /base/);
});

test('triage drops non-TS and skipped paths, and limits specs to the bug rules by default', () => {
  const f = (path: string) => ({ path, status: 'modified' as const, ranges: 'whole' as const });
  const out = triage([f('a.ts'), f('a.spec.ts'), f('x.json'), f('src/migrations/1.ts')], ['(^|/)migrations/'], 'bugRules');
  assert.deepEqual(
    out.map((d) => [d.file.path, d.kept, d.sizeRules]),
    [
      ['a.ts', true, true],
      ['a.spec.ts', true, false],
      ['x.json', false, false],
      ['src/migrations/1.ts', false, false],
    ],
  );
  assert.equal(triage([f('a.spec.ts')], [], 'skip')[0]!.kept, false);
});

test('parseFileArg reads path, path:line and path:start-end', () => {
  assert.deepEqual(parseFileArg('src/a.ts'), { path: 'src/a.ts', ranges: 'whole' });
  assert.deepEqual(parseFileArg('src/a.ts:7'), { path: 'src/a.ts', ranges: [{ start: 7, end: 7 }] });
  assert.deepEqual(parseFileArg('src/a.ts:12-40'), { path: 'src/a.ts', ranges: [{ start: 12, end: 40 }] });
});

test('parseDiff reads C-quoted paths and keeps a quoted file from leaking into the previous one', () => {
  const diff = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1 +1 @@',
    '-x',
    '+++ not a header',
    'diff --git "a/src/caf\\303\\251.ts" "b/src/caf\\303\\251.ts"',
    'deleted file mode 100644',
    '--- "a/src/caf\\303\\251.ts"',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-x',
    'diff --git a/src/my file.ts b/src/my file.ts',
    'new file mode 100644',
    'diff --git "a/src/q\\"uote.ts" "b/src/q\\"uote.ts"',
    '--- "a/src/q\\"uote.ts"',
    '+++ "b/src/q\\"uote.ts"',
    '@@ -2,0 +3 @@',
    '+y',
    '',
  ].join('\n');
  assert.deepEqual(parseDiff(diff), [
    { path: 'src/a.ts', status: 'modified', ranges: [{ start: 1, end: 1 }] },
    { path: 'src/my file.ts', status: 'added', ranges: 'whole' },
    { path: 'src/q"uote.ts', status: 'modified', ranges: [{ start: 3, end: 3 }] },
  ]);
  assert.equal(unquote('"caf\\303\\251\\t.ts"'), 'café\t.ts');
});
