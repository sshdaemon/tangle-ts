import assert from 'node:assert/strict';
import { test } from 'vitest';
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
    String.raw`diff --git "a/src/caf\303\251.ts" "b/src/caf\303\251.ts"`,
    'deleted file mode 100644',
    String.raw`--- "a/src/caf\303\251.ts"`,
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-x',
    'diff --git a/src/my file.ts b/src/my file.ts',
    'new file mode 100644',
    String.raw`diff --git "a/src/q\"uote.ts" "b/src/q\"uote.ts"`,
    String.raw`--- "a/src/q\"uote.ts"`,
    String.raw`+++ "b/src/q\"uote.ts"`,
    '@@ -2,0 +3 @@',
    '+y',
    '',
  ].join('\n');
  assert.deepEqual(parseDiff(diff), [
    { path: 'src/a.ts', status: 'modified', ranges: [{ start: 1, end: 1 }] },
    { path: 'src/my file.ts', status: 'added', ranges: 'whole' },
    { path: 'src/q"uote.ts', status: 'modified', ranges: [{ start: 3, end: 3 }] },
  ]);
  assert.equal(unquote(String.raw`"caf\303\251\t.ts"`), 'café\t.ts');
});

test('parseDiff names an empty added file from its header, quoted or with spaces', () => {
  const header = (h: string) => parseDiff(`diff --git ${h}\nnew file mode 100644\nindex 0000000..e69de29\n`);
  assert.deepEqual(header('a/src/my file.ts b/src/my file.ts'), [{ path: 'src/my file.ts', status: 'added', ranges: 'whole' }]);
  assert.deepEqual(header(String.raw`"a/src/caf\303\251.ts" "b/src/caf\303\251.ts"`), [{ path: 'src/café.ts', status: 'added', ranges: 'whole' }]);
  assert.deepEqual(header(String.raw`"a/src/q\"x.ts" "b/src/q\"x.ts"`), [{ path: 'src/q"x.ts', status: 'added', ranges: 'whole' }]);
});

test('unquote leaves unquoted text alone and decodes every escape', () => {
  assert.equal(unquote('plain.ts'), 'plain.ts');
  assert.equal(unquote('"'), '"');
  assert.equal(unquote(String.raw`"a\"b\\c\n"`), 'a"b\\c\n');
  assert.equal(unquote(String.raw`"\1234"`), 'S4');
});

test('LineRange.merge sorts, then joins touching and overlapping ranges', () => {
  assert.deepEqual(LineRange.merge([LineRange.of(10, 12), LineRange.of(1, 3), LineRange.of(4, 5), LineRange.of(11, 20)]), [
    { start: 1, end: 5 },
    { start: 10, end: 20 },
  ]);
  assert.deepEqual(LineRange.merge([LineRange.of(1, 9), LineRange.of(2, 3)]), [{ start: 1, end: 9 }]);
  assert.deepEqual(LineRange.merge([LineRange.of(1, 2), LineRange.of(4, 5)]), [{ start: 1, end: 2 }, { start: 4, end: 5 }]);
  assert.throws(() => LineRange.of(5, 2));
  assert.throws(() => LineRange.of(0, 2));
});

test('parseFileArg takes the range from the end only', () => {
  assert.deepEqual(parseFileArg('a:b.ts:3-4'), { path: 'a:b.ts', ranges: [{ start: 3, end: 4 }] });
  assert.deepEqual(parseFileArg('x.ts:12foo'), { path: 'x.ts:12foo', ranges: 'whole' });
  assert.deepEqual(parseFileArg(':12'), { path: ':12', ranges: 'whole' });
});

test('parseChangeList rejects each malformed field with its own message', () => {
  const ok = { repo: '/r', base: 'b', head: 'h' };
  const file = { path: 'x.ts', status: 'modified', ranges: 'whole' };
  const cases: [unknown, RegExp][] = [
    [null, /f: expected a JSON object/],
    [[], /f: expected a JSON object/],
    ['x', /f: expected a JSON object/],
    [{ base: 'b', head: 'h', files: [] }, /f: repo must be a non-empty string/],
    [{ ...ok, head: '', files: [] }, /f: head must be a non-empty string/],
    [ok, /f: files must be an array/],
    [{ ...ok, files: [null] }, /files\[0\] must be an object/],
    [{ ...ok, files: ['x.ts'] }, /files\[0\] must be an object/],
    [{ ...ok, files: [{ ...file, path: 5 }] }, /files\[0\]\.path must be a repo-relative path/],
    [{ ...ok, files: [{ ...file, path: '' }] }, /files\[0\]\.path/],
    [{ ...ok, files: [{ ...file, path: '/abs.ts' }] }, /files\[0\]\.path/],
    [{ ...ok, files: [file, { ...file, path: 'a/../../x.ts' }] }, /files\[1\]\.path/],
    [{ ...ok, files: [{ ...file, status: 'deleted' }] }, /files\[0\]\.status must be added, modified or renamed/],
    [{ ...ok, files: [{ ...file, status: 'renamed' }] }, /files\[0\]\.oldPath is required/],
    [{ ...ok, files: [{ ...file, ranges: [[1, 2], 3] }] }, /files\[0\]\.ranges\[1\] must be \[start, end\]/],
    [{ ...ok, files: [{ ...file, ranges: [[1, 2, 3]] }] }, /files\[0\]\.ranges\[0\] must be \[start, end\]/],
    [{ ...ok, files: [{ ...file, ranges: [[5, 2]] }] }, /files\[0\]\.ranges\[0\] is not a valid line range/],
    [{ ...ok, files: [{ ...file, ranges: 'all' }] }, /files\[0\]\.ranges must be an array/],
  ];
  for (const [raw, message] of cases) assert.throws(() => parseChangeList(raw, 'f'), message, JSON.stringify(raw));
  for (const status of ['added', 'modified'] as const) {
    assert.deepEqual(parseChangeList({ ...ok, files: [{ ...file, status, oldPath: 'y.ts', ranges: [[3, 4], [1, 2]] }] }, 'f').files, [
      { path: 'x.ts', status, ranges: [{ start: 1, end: 4 }] },
    ]);
  }
});

test('parseDiff handles empty output, a preamble and a new binary file', () => {
  assert.deepEqual(parseDiff(''), []);
  assert.deepEqual(parseDiff('warning: something\n'), []);
  assert.deepEqual(parseDiff('diff --git a/img.png b/img.png\nnew file mode 100644\nBinary files /dev/null and b/img.png differ\n'), []);
});

test('unquote only decodes a fully quoted string, and only three-digit octal escapes', () => {
  assert.equal(unquote('"abc'), '"abc');
  assert.equal(unquote('abc"'), 'abc"');
  assert.equal(unquote(String.raw`"\x123"`), 'x123');
});

test('triage gives specs every rule with specs: all', () => {
  const spec = { path: 'a.spec.ts', status: 'modified' as const, ranges: 'whole' as const };
  assert.deepEqual(triage([spec], [], 'all').map((d) => [d.kept, d.sizeRules]), [[true, true]]);
});
