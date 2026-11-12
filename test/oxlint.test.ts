import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, test } from 'vitest';
import { OxlintError, readReport, ruleId, runOxlint } from '../src/check/oxlint.ts';
import { ruleById } from '../src/check/rules.ts';
import { renderMarkdown } from '../src/report/render.ts';
import type { Report } from '../src/report/types.ts';

let dir: string;

beforeAll(() => {
  dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tangle-ox-')));
  writeFileSync(path.join(dir, 'a.ts'), `// é\nconst x = 1 === 1;\n`);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

test('readReport maps byte offsets to text positions and keeps parse failures apart', () => {
  // "const x = 1 === 1;" starts after "// é\n", which is 6 bytes and 5 UTF-16 units.
  const hit = { code: 'sonarjs(no-identical-expressions)', message: 'm', filename: 'a.ts', labels: [{ span: { offset: 16, length: 7, line: 2, column: 11 } }] };
  const out = readReport(
    [hit, { filename: 'a.ts', message: 'parse error' }, { code: 'x(y)', message: 'no file' }, { code: 'x(y)', filename: 'a.ts', labels: [] }],
    dir,
  );
  assert.deepEqual(out.unparsed, [path.join(dir, 'a.ts')]);
  assert.deepEqual(out.diagnostics, [
    { file: path.join(dir, 'a.ts'), rule: 'sonarjs/no-identical-expressions', line: 2, column: 11, pos: 15, endLine: 2, message: 'm' },
  ]);
});

test('ruleId turns oxlint codes into rule names', () => {
  assert.equal(ruleId('sonarjs(no-collapsible-if)'), 'sonarjs/no-collapsible-if');
  assert.equal(ruleId('eslint(complexity)'), 'complexity');
  assert.equal(ruleId('plain'), 'plain');
});

test('scored rules read multi-digit scores', () => {
  assert.equal(ruleById('sonarjs/expression-complexity')!.score!('Reduce the number of conditional operators (12) used'), 12);
  assert.equal(ruleById('sonarjs/cognitive-complexity')!.score!('Cognitive Complexity from 41 to the 0 allowed'), 41);
  assert.equal(ruleById('sonarjs/cognitive-complexity')!.score!('nothing'), undefined);
});

test('runOxlint runs nothing for no files and names the failure of a bad binary', async () => {
  assert.deepEqual(await runOxlint('/nonexistent/oxlint', 'c.json', dir, []), { diagnostics: [], unparsed: [] });
  await assert.rejects(runOxlint('/nonexistent/oxlint', 'c.json', dir, ['a.ts']), (e: unknown) => e instanceof OxlintError && /could not run \/nonexistent\/oxlint/.test(e.message));
  const script = (name: string, body: string) => {
    const p = path.join(dir, name);
    writeFileSync(p, `#!/bin/sh\n${body}\n`);
    chmodSync(p, 0o755);
    return p;
  };
  await assert.rejects(runOxlint(script('err.sh', 'echo boom >&2; exit 3'), 'c.json', dir, ['a.ts']), /oxlint exited 3 without a JSON report: boom$/);
  await assert.rejects(runOxlint(script('out.sh', 'echo "  text  "'), 'c.json', dir, ['a.ts']), /oxlint exited 0 without a JSON report: text$/);
  await assert.rejects(runOxlint(script('slow.sh', 'sleep 5'), 'c.json', dir, ['a.ts'], AbortSignal.abort()), /^Error: interrupted$/);
  await assert.rejects(runOxlint(script('long.sh', `printf '%0600d' 0 >&2; exit 1`), 'c.json', dir, ['a.ts']), (e: unknown) => e instanceof OxlintError && e.message.endsWith(`: ${'0'.repeat(500)}`));
  assert.deepEqual(await runOxlint(script('empty.sh', "echo '{}'"), 'c.json', dir, ['a.ts']), { diagnostics: [], unparsed: [] });
});

test('renderMarkdown lists warnings, skipped files and findings by file', () => {
  const base: Report = { tool: 'tangle-ts', version: '0', createdAt: 't', repo: '/r', command: 'c', base: null, checked: [], dropped: [], warnings: [], durationMs: 0, findings: [] };
  assert.match(renderMarkdown(base), /## Findings \(0\)\n\nNone\./);
  assert.match(renderMarkdown(base), /Compared with: nothing/);
  const f = (where: string) => ({ id: 'tg-1', severity: 'low' as const, category: 'complexity' as const, where, claim: 'c', evidence: 'e', rule: 'r', function: 'f' });
  const md = renderMarkdown({
    ...base,
    base: { ref: 'origin/main', commit: '0123456789abcdef' },
    warnings: ['w1'],
    dropped: [{ path: 'x.json', reason: 'not ts' }],
    findings: [f('a.ts:1:2'), f('b.ts:3:4'), f('a.ts:5:6')],
  });
  assert.match(md, /Compared with: origin\/main \(0123456789ab\)/);
  assert.match(md, /## Warnings\n\n- w1\n/);
  assert.match(md, /## Skipped\n\n- x\.json: not ts\n/);
  assert.match(md, /### a\.ts\n\n- 1:2 \[low\] c \(`r`, tg-1\)\n- 5:6 \[low\] c/);
  assert.doesNotMatch(md, /None\./);
});
