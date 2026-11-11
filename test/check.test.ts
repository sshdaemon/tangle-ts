import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { changeListFromGit } from '../src/cli/changes.ts';
import { check } from '../src/cli/check.ts';
import { DEFAULTS } from '../src/cli/config.ts';

/** Nested branches: cognitive complexity 1 + 2 + 3 + 4 per block. */
const tangled = (name: string, blocks: number) => {
  const body = Array.from({ length: blocks }, () => '  if (a) { if (b) { if (c) { if (d) { n++; } } } }').join('\n');
  return `export function ${name}(a: boolean, b: boolean, c: boolean, d: boolean) {\n  let n = 0;\n${body}\n  return n;\n}\n`;
};

const BASE = {
  'src/old-tangle.ts': `${tangled('oldTangle', 3)}export const touch = 1;\n`,
  'src/grows.ts': tangled('grows', 1),
  'src/bugs.ts': `export function same(x: number) {\n  return x === x;\n}\nexport function keep(y: number) {\n  return y;\n}\n`,
  'src/renamed-before.ts': tangled('moved', 1),
  'src/skip.d.ts': 'export declare const x: number;\n',
};

let repo: string;
let out: string;

function sh(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

before(() => {
  repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tangle-test-')));
  out = path.join(repo, '.out');
  sh(repo, ['init', '-q', '-b', 'main']);
  sh(repo, ['config', 'user.email', 't@example.com']);
  sh(repo, ['config', 'user.name', 't']);
  for (const [p, text] of Object.entries(BASE)) {
    execFileSync('mkdir', ['-p', path.dirname(path.join(repo, p))]);
    writeFileSync(path.join(repo, p), text);
  }
  writeFileSync(path.join(repo, '.gitignore'), '.out/\n');
  sh(repo, ['add', '-A']);
  sh(repo, ['commit', '-qm', 'base']);
  sh(repo, ['checkout', '-qb', 'feature']);
  // Edits a line inside an already-complex function without making it worse.
  writeFileSync(path.join(repo, 'src/old-tangle.ts'), BASE['src/old-tangle.ts'].replace('let n = 0;', 'let n = 1;'));
  // Makes a function cross the limit.
  writeFileSync(path.join(repo, 'src/grows.ts'), tangled('grows', 3));
  // Adds a bug on a changed line; the old one on line 2 stays untouched.
  writeFileSync(path.join(repo, 'src/bugs.ts'), BASE['src/bugs.ts'].replace('return y;', 'return y > 0 && y > 0 ? y : y;'));
  sh(repo, ['mv', 'src/renamed-before.ts', 'src/renamed-after.ts']);
  writeFileSync(path.join(repo, 'src/renamed-after.ts'), tangled('moved', 1).replace('let n = 0;', 'let n = 2;'));
  writeFileSync(path.join(repo, 'src/skip.d.ts'), 'export declare const x: string;\n');
  sh(repo, ['add', '-A']);
  sh(repo, ['commit', '-qm', 'feature']);
  // Untracked work counts too.
  writeFileSync(path.join(repo, 'src/fresh.ts'), tangled('fresh', 3));
  // New code between the limit and limit + raiseAt: medium only because it rises from zero.
  writeFileSync(path.join(repo, 'src/fresh2.ts'), tangled('fresh2', 2));
});

after(() => rmSync(repo, { recursive: true, force: true }));

test('diff reports only what the change made worse, plus bugs on changed lines', async () => {
  const list = changeListFromGit(repo, 'main', false);
  const report = await check({ list, repoKey: 'fixture', config: DEFAULTS, compare: true, out, command: 'test', version: '0', log: () => {} });
  const got = report.findings.map((f) => `${f.where.split(':')[0]} ${f.rule.replace('sonarjs/', '')} ${f.function} ${f.severity}`).sort();
  assert.deepEqual(got, [
    'src/bugs.ts no-all-duplicated-branches keep medium',
    'src/bugs.ts no-identical-expressions keep medium',
    'src/fresh.ts cognitive-complexity fresh medium',
    'src/fresh.ts nested-control-flow fresh low',
    'src/fresh2.ts cognitive-complexity fresh2 medium',
    'src/fresh2.ts nested-control-flow fresh2 low',
    'src/grows.ts cognitive-complexity grows medium',
    'src/grows.ts nested-control-flow grows low',
  ]);
  const grows = report.findings.find((f) => f.rule === 'sonarjs/cognitive-complexity' && f.function === 'grows')!;
  assert.deepEqual(grows.score, { before: 10, after: 30 });
  assert.match(grows.evidence, /15 allowed/);
  assert.deepEqual(report.dropped, [{ path: 'src/skip.d.ts', reason: 'matches skip pattern \\.d\\.ts$' }]);
  assert.ok(readFileSync(path.join(out, 'report.md'), 'utf8').includes('## Findings (8)'));
});

test('files without a base reports every hit in range', async () => {
  const list = { repo, base: 'main', head: 'working-tree', files: [{ path: 'src/old-tangle.ts', status: 'modified' as const, ranges: 'whole' as const }] };
  const report = await check({ list, repoKey: 'fixture', config: DEFAULTS, compare: false, out, command: 'test', version: '0', log: () => {} });
  assert.deepEqual(report.findings.map((f) => f.rule).sort(), ['sonarjs/cognitive-complexity', 'sonarjs/nested-control-flow']);
  assert.equal(report.base, null);
});

test('finding ids stay the same when lines move', async () => {
  const list = changeListFromGit(repo, 'main', false);
  const run = () => check({ list, repoKey: 'fixture', config: DEFAULTS, compare: true, out, command: 'test', version: '0', log: () => {} });
  const first = (await run()).findings.map((f) => f.id).sort();
  writeFileSync(path.join(repo, 'src/grows.ts'), `// moved down\n\n${tangled('grows', 3)}`);
  const second = (await run()).findings.map((f) => f.id).sort();
  assert.deepEqual(second, first);
});

test('files mode: non-ASCII lines, unparsable files, repeated hits and uncompared claims', async () => {
  writeFileSync(
    path.join(repo, 'src/accents.ts'),
    `export const s = '${'é'.repeat(31)}'; export const f = (a: boolean, b: boolean) => a ? (b ? 1 : 2) : 3;\n` +
      `export function twice(a: { x: number }, b: { y: number }) {\n  return a.x === a.x && b.y === b.y;\n}\n`,
  );
  writeFileSync(path.join(repo, 'src/broken.ts'), 'export function x( {\n  return x === x;\n');
  const file = (p: string) => ({ path: p, status: 'modified' as const, ranges: 'whole' as const });
  const list = { repo, base: 'main', head: 'working-tree', files: [file('src/accents.ts'), file('src/broken.ts'), file('src/grows.ts')] };
  const report = await check({ list, repoKey: 'fixture', config: DEFAULTS, compare: false, out, command: 'test', version: '0', log: () => {} });

  const nested = report.findings.find((f) => f.rule === 'sonarjs/no-nested-conditional')!;
  assert.equal(nested.function, 'f');
  assert.equal(nested.where, 'src/accents.ts:1:103');

  const twice = report.findings.filter((f) => f.rule === 'sonarjs/no-identical-expressions' && f.function === 'twice');
  assert.equal(twice.length, 2);
  assert.notEqual(twice[0]!.id, twice[1]!.id);

  assert.deepEqual(report.warnings, ['src/broken.ts did not parse; not checked']);
  assert.ok(!report.checked.includes('src/broken.ts'));

  const grows = report.findings.find((f) => f.rule === 'sonarjs/cognitive-complexity' && f.function === 'grows')!;
  assert.match(grows.claim, /\(not compared\)/);
  const fresh2 = (
    await check({ list: { ...list, files: [file('src/fresh2.ts')] }, repoKey: 'fixture', config: DEFAULTS, compare: false, out, command: 'test', version: '0', log: () => {} })
  ).findings.find((f) => f.rule === 'sonarjs/cognitive-complexity')!;
  assert.deepEqual([fresh2.score, fresh2.severity], [{ after: 20 }, 'medium']);
  assert.deepEqual(grows.score, { after: 30 });
});

test('a committed-only change reads files from the commit, not from disk', async () => {
  // Uncommitted lines at the top of grows.ts must not shift or hide the committed findings.
  writeFileSync(path.join(repo, 'src/grows.ts'), `${'// pad\n'.repeat(20)}${tangled('grows', 3)}`);
  const list = changeListFromGit(repo, 'main', true);
  assert.notEqual(list.head, 'working-tree');
  const report = await check({ list, repoKey: 'fixture', config: DEFAULTS, compare: true, out, command: 'test', version: '0', log: () => {} });
  const grows = report.findings.find((f) => f.rule === 'sonarjs/cognitive-complexity' && f.function === 'grows')!;
  assert.equal(grows.where, 'src/grows.ts:1:17');
  assert.ok(!report.checked.includes('src/fresh.ts'));
  assert.equal(changeListFromGit(repo, 'main', false).head, 'working-tree');
});
