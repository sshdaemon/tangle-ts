import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, test } from 'vitest';
import { alreadyInBase, changeListFromGit } from '../src/cli/changes.ts';
import { check } from '../src/cli/check.ts';
import { DEFAULTS } from '../src/cli/config.ts';

/** Nested branches: cognitive complexity 1 + 2 + 3 + 4 per block. */
const tangled = (name: string, blocks: number) => {
  const body = Array.from({ length: blocks }, () => '  if (a) { if (b) { if (c) { if (d) { n++; } } } }').join('\n');
  return `export function ${name}(a: number, b: number, c: number, d: number) {\n  let n = 0;\n${body}\n  return n;\n}\n`;
};

const BASE = {
  'src/old-tangle.ts': `${tangled('oldTangle', 3)}export const touch = 1;\n`,
  'src/grows.ts': tangled('grows', 1),
  'src/bugs.ts': `export function same(x: number) {\n  return x === x;\n}\nexport function keep(y: number) {\n  return y;\n}\n`,
  'src/renamed-before.ts': tangled('moved', 1),
  'src/skip.d.ts': 'export declare const x: number;\n',
  'src/was-broken.ts': 'export function x( {\n',
};

let repo: string;
let out: string;

function sh(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

beforeAll(() => {
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
  // Fixed on the branch; its before version does not parse.
  writeFileSync(path.join(repo, 'src/was-broken.ts'), tangled('wasBroken', 2));
  sh(repo, ['add', '-A']);
  sh(repo, ['commit', '-qm', 'feature']);
  // Untracked work counts too.
  writeFileSync(path.join(repo, 'src/fresh.ts'), tangled('fresh', 3));
  // New code between the limit and limit + raiseAt: medium only because it rises from zero.
  writeFileSync(path.join(repo, 'src/fresh2.ts'), tangled('fresh2', 2));
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

test('diff reports only what the change made worse, plus bugs on changed lines', async () => {
  const list = changeListFromGit(repo, 'main', false);
  const report = await check({ list, repoKey: 'fixture', config: DEFAULTS, compare: true, out, command: 'test', version: '0', log: () => {} });
  const got = report.findings.map((f) => `${f.where.split(':')[0]} ${f.rule.replace('sonarjs/', '')} ${f.function} ${f.severity}`).toSorted();
  assert.deepEqual(got, [
    'src/bugs.ts no-all-duplicated-branches keep medium',
    'src/bugs.ts no-identical-expressions keep medium',
    'src/fresh.ts cognitive-complexity fresh medium',
    'src/fresh.ts nested-control-flow fresh low',
    'src/fresh2.ts cognitive-complexity fresh2 medium',
    'src/fresh2.ts nested-control-flow fresh2 low',
    'src/grows.ts cognitive-complexity grows medium',
    'src/grows.ts nested-control-flow grows low',
    'src/was-broken.ts cognitive-complexity wasBroken medium',
    'src/was-broken.ts nested-control-flow wasBroken low',
  ]);
  const grows = report.findings.find((f) => f.rule === 'sonarjs/cognitive-complexity' && f.function === 'grows')!;
  assert.deepEqual(grows.score, { before: 10, after: 30 });
  assert.match(grows.evidence, /15 allowed/);
  assert.deepEqual(report.dropped, [{ path: 'src/skip.d.ts', reason: String.raw`matches skip pattern \.d\.[mc]?ts$` }]);
  assert.deepEqual(report.warnings, [`src/was-broken.ts did not parse at ${report.base!.commit.slice(0, 12)}; reported without comparing`]);
  assert.match(report.findings.find((f) => f.function === 'wasBroken' && f.rule === 'sonarjs/cognitive-complexity')!.claim, /\(not compared\)/);
  assert.ok(readFileSync(path.join(out, 'report.md'), 'utf8').includes('## Findings (10)'));
});

test('files without a base reports every hit in range', async () => {
  const list = { repo, base: 'main', head: 'working-tree', files: [{ path: 'src/old-tangle.ts', status: 'modified' as const, ranges: 'whole' as const }] };
  const report = await check({ list, repoKey: 'fixture', config: DEFAULTS, compare: false, out, command: 'test', version: '0', log: () => {} });
  assert.deepEqual(report.findings.map((f) => f.rule).toSorted(), ['sonarjs/cognitive-complexity', 'sonarjs/nested-control-flow']);
  assert.equal(report.base, null);
});

test('finding ids stay the same when lines move', async () => {
  const list = changeListFromGit(repo, 'main', false);
  const run = () => check({ list, repoKey: 'fixture', config: DEFAULTS, compare: true, out, command: 'test', version: '0', log: () => {} });
  const first = (await run()).findings.map((f) => f.id).toSorted();
  writeFileSync(path.join(repo, 'src/grows.ts'), `// moved down\n\n${tangled('grows', 3)}`);
  const second = (await run()).findings.map((f) => f.id).toSorted();
  assert.deepEqual(second, first);
});

test('files mode: non-ASCII lines, unparsable files, repeated hits and uncompared claims', async () => {
  writeFileSync(
    path.join(repo, 'src/accents.ts'),
    `export const s = '${'é'.repeat(31)}'; export const f = (a: unknown, b: unknown) => a ? (b ? 1 : 2) : 3;\n` +
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

test('module-level hits and uncompared expressions are reported only inside the given range', async () => {
  writeFileSync(
    path.join(repo, 'src/module.ts'),
    'export const pick = Math.random() > 0.5 ? (Math.random() > 0.5 ? 1 : 2) : 3;\n\nexport const many = (a: boolean, b: boolean, c: boolean, d: boolean, e: boolean) => (a && b) || (c && d) || e;\n\n\nexport const pick2 = Math.random() > 0.5 ? (Math.random() > 0.5 ? 1 : 2) : 3;\n',
  );
  const run = (ranges: [number, number][]) =>
    check({
      list: { repo, base: 'main', head: 'working-tree', files: [{ path: 'src/module.ts', status: 'modified' as const, ranges: ranges.map(([start, end]) => ({ start, end })) }] },
      repoKey: 'fixture', config: DEFAULTS, compare: false, out, command: 'test', version: '0', log: () => {},
    });
  const first = await run([[1, 1]]);
  assert.deepEqual(first.findings.map((f) => [f.function, f.rule, f.where]), [['<module>', 'sonarjs/no-nested-conditional', 'src/module.ts:1:44']]);
  assert.match(first.findings[0]!.claim, /^Module-level code: nested ternary in 2 place\(s\) \(not compared\)\.$/);
  // Module-level hits span from the first to the last of them, so a line between them touches the group.
  assert.deepEqual((await run([[4, 4]])).findings.map((f) => f.function), ['<module>']);
  const third = await run([[3, 3]]);
  assert.deepEqual(third.findings.map((f) => f.claim), [
    'Module-level code: nested ternary in 2 place(s) (not compared).',
    '`many` has an expression with 4 conditional operators (limit 3) (not compared).',
  ]);
  assert.deepEqual((await run([[2, 2]])).findings.map((f) => f.function), ['<module>']);
  assert.deepEqual((await run([[7, 7]])).findings, []);
});

test('a commit-mode list warns about files missing from the commit, and no temp folder is left behind', async () => {
  // A private temp root, so parallel test files cannot add folders of their own.
  const tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tangle-tmproot-')));
  const previous = process.env['TMPDIR'];
  process.env['TMPDIR'] = tmp;
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const files = [
    { path: 'src/grows.ts', status: 'modified' as const, ranges: 'whole' as const },
    { path: 'src/not-there.ts', status: 'added' as const, ranges: 'whole' as const },
  ];
  try {
    const report = await check({ list: { repo, base: 'main', head, files }, repoKey: 'fixture', config: DEFAULTS, compare: true, out, command: 'test', version: '0', log: () => {} });
    assert.deepEqual(report.warnings, [`src/not-there.ts is in the change list but not in ${head.slice(0, 12)}`]);
    assert.deepEqual(report.checked, ['src/grows.ts']);
    assert.deepEqual(readdirSync(tmp), []);
  } finally {
    if (previous === undefined) delete process.env['TMPDIR'];
    else process.env['TMPDIR'] = previous;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('spec files get the bug rules only', async () => {
  writeFileSync(path.join(repo, 'src/x.spec.ts'), 'export const v = Math.random() > 0.5 ? (Math.random() > 0.5 ? 1 : 2) : 3;\nexport const w = (o: { id: number }) => o.id === o.id;\n');
  const files = [{ path: 'src/x.spec.ts', status: 'modified' as const, ranges: 'whole' as const }];
  const report = await check({ list: { repo, base: 'main', head: 'working-tree', files }, repoKey: 'fixture', config: DEFAULTS, compare: false, out, command: 'test', version: '0', log: () => {} });
  assert.deepEqual(report.findings.map((f) => f.rule), ['sonarjs/no-identical-expressions']);
});

test('a scored finding that rose by less than raiseAt is low', async () => {
  const list = changeListFromGit(repo, 'main', false);
  const report = await check({ list, repoKey: 'fixture', config: { ...DEFAULTS, raiseAt: 30 }, compare: true, out, command: 'test', version: '0', log: () => {} });
  const grows = report.findings.find((f) => f.rule === 'sonarjs/cognitive-complexity' && f.function === 'grows')!;
  assert.deepEqual([grows.score, grows.severity], [{ before: 10, after: 30 }, 'low']);
});

test('size ids follow the function text, bug ids the flagged line', async () => {
  const source = (body: string, flagged: string) =>
    tangled('big', 2).replace('let n = 0;', `${body}\n  const o = { x: n };\n  ${flagged}`);
  const ids = async (text: string) => {
    writeFileSync(path.join(repo, 'src/ids.ts'), text);
    const list = { repo, base: 'main', head: 'working-tree', files: [{ path: 'src/ids.ts', status: 'modified' as const, ranges: 'whole' as const }] };
    const report = await check({ list, repoKey: 'fixture', config: DEFAULTS, compare: false, out, command: 'test', version: '0', log: () => {} });
    const id = (rule: string) => report.findings.find((f) => f.rule === rule)!.id;
    return { size: id('sonarjs/cognitive-complexity'), bug: id('sonarjs/no-identical-expressions') };
  };
  const first = await ids(source('let n = 0;', 'const same = o.x === o.x;'));
  const otherLine = await ids(source('let n = 1;', 'const same = o.x === o.x;'));
  const flaggedLine = await ids(source('let n = 1;', 'const twin = o.x === o.x;'));
  assert.notEqual(otherLine.size, first.size);
  assert.equal(otherLine.bug, first.bug);
  assert.notEqual(flaggedLine.bug, otherLine.bug);
});

test('a head commit the base already contains is warned about, only when comparing', async () => {
  const sha = sh(repo, ['rev-parse', 'feature']).trim();
  const inBase = { repo, base: 'feature', head: sha, files: [] };
  const expected = `${sha.slice(0, 12)} is already in feature, so there is nothing to check; for a merged commit use --base <sha>^ --head <sha>`;
  assert.equal(alreadyInBase(repo, inBase), expected);
  assert.equal(alreadyInBase(repo, { ...inBase, base: 'main' }), undefined);
  assert.equal(alreadyInBase(repo, { ...inBase, head: 'working-tree' }), undefined);
  const run = (list: typeof inBase, compare: boolean) =>
    check({ list, repoKey: 'fixture', config: DEFAULTS, compare, out, command: 'test', version: '0', log: () => {} });
  assert.deepEqual((await run(inBase, true)).warnings, [expected]);
  assert.deepEqual((await run(inBase, false)).warnings, []);
  assert.deepEqual((await run({ ...inBase, base: 'main' }, true)).warnings, []);
});

test('a committed or given-commit change list leaves out uncommitted and untracked work', () => {
  const sha = sh(repo, ['rev-parse', 'feature']).trim();
  const paths = (list: { files: readonly { path: string }[] }) => list.files.map((f) => f.path);
  assert.ok(paths(changeListFromGit(repo, 'main', false)).includes('src/fresh.ts'));
  assert.ok(!paths(changeListFromGit(repo, 'main', true)).includes('src/fresh.ts'));
  const given = changeListFromGit(repo, 'main', false, sha);
  assert.deepEqual([given.head, paths(given).includes('src/fresh.ts')], [sha, false]);
});


test('an accepted finding is listed as accepted until its function changes', async () => {
  const run = async (text: string, accepted: Map<string, { reason: string; acceptedAt: string }>) => {
    writeFileSync(path.join(repo, 'src/accepted.ts'), text);
    const list = { repo, base: 'main', head: 'working-tree', files: [{ path: 'src/accepted.ts', status: 'modified' as const, ranges: 'whole' as const }] };
    return check({ list, repoKey: 'fixture', config: DEFAULTS, accepted, compare: false, out, command: 'test', version: '0', log: () => {} });
  };
  const first = await run(tangled('big', 2), new Map());
  const ids = first.findings.map((f) => f.id);
  assert.deepEqual([ids.length, first.accepted], [2, []]);
  const accepted = new Map(ids.map((id) => [id, { reason: 'flat enough', acceptedAt: '2026-11-21T00:00:00.000Z' }]));
  const again = await run(`// moved down\n${tangled('big', 2)}`, accepted);
  assert.deepEqual(again.findings, []);
  assert.deepEqual(again.accepted.map((f) => [f.id, f.reason, f.acceptedAt, f.where.split(':')[1]]), ids.map((id, i) => [id, 'flat enough', '2026-11-21T00:00:00.000Z', String(Number(first.findings[i]!.where.split(':')[1]) + 1)]));
  const report = JSON.parse(readFileSync(path.join(out, 'report.json'), 'utf8'));
  assert.deepEqual([report.findings, report.accepted.map((f: { id: string }) => f.id)], [[], ids]);
  const edited = await run(tangled('big', 2).replace('let n = 0;', 'let n = 1;'), accepted);
  assert.deepEqual([edited.findings.length, edited.accepted], [2, []]);
  assert.ok(edited.findings.every((f) => !ids.includes(f.id)));
});

test('a module-level size id follows the whole file', async () => {
  const text = 'export const pick = Math.random() > 0.5 ? (Math.random() > 0.5 ? 1 : 2) : 3;\nexport const f = (a: number) => a;\n';
  const id = async (t: string) => {
    writeFileSync(path.join(repo, 'src/module-id.ts'), t);
    const list = { repo, base: 'main', head: 'working-tree', files: [{ path: 'src/module-id.ts', status: 'modified' as const, ranges: 'whole' as const }] };
    const report = await check({ list, repoKey: 'fixture', config: DEFAULTS, compare: false, out, command: 'test', version: '0', log: () => {} });
    return report.findings.find((f) => f.function === '<module>')!.id;
  };
  const first = await id(text);
  assert.equal(await id(text.replace('\n', '\n\n')), first);
  assert.notEqual(await id(text.replace('=> a', '=> a + 1')), first);
});

test('shape findings are low design findings on changed lines, and spec files skip them by default', async () => {
  const text = 'export class S {\n  old(id: string, a: boolean) {\n    return a ? id : null;\n  }\n  run(id: string, b: boolean) {\n    return b ? id : null;\n  }\n}\n';
  const check1 = (file: string, specs: 'bugRules' | 'all') => {
    writeFileSync(path.join(repo, file), text);
    const list = { repo, base: 'main', head: 'working-tree', files: [{ path: file, status: 'modified' as const, ranges: [{ start: 5, end: 5 }] }] };
    return check({ list, repoKey: 'fixture', config: { ...DEFAULTS, specs }, compare: false, out, command: 'test', version: '0', log: () => {} });
  };
  const report = await check1('src/shape.ts', 'bugRules');
  assert.deepEqual(
    report.findings.map((f) => [f.rule, f.function, f.severity, f.category, f.where]),
    [['tangle/selector-parameter', 'S.run', 'low', 'design', 'src/shape.ts:5:19']],
  );
  assert.match(report.findings[0]!.id, /^tg-[0-9a-f]{10}$/);
  assert.match(report.findings[0]!.claim, /Boolean parameter that only picks a branch in `S.run`/);
  assert.deepEqual((await check1('src/shape.spec.ts', 'bugRules')).findings, []);
  assert.equal((await check1('src/shape.spec.ts', 'all')).findings.length, 1);
});

test('a callback added to a same-file options interface is reported though the method line is unchanged', async () => {
  const text = 'interface O {\n  label: string;\n  onDone?: () => void;\n}\nexport class S {\n  run(o: O) {\n    return o.label;\n  }\n}\n';
  const at = async (start: number) => {
    writeFileSync(path.join(repo, 'src/options.ts'), text);
    const list = { repo, base: 'main', head: 'working-tree', files: [{ path: 'src/options.ts', status: 'modified' as const, ranges: [{ start, end: start }] }] };
    const report = await check({ list, repoKey: 'fixture', config: DEFAULTS, compare: false, out, command: 'test', version: '0', log: () => {} });
    return report.findings.map((f) => [f.rule, f.where, f.id]);
  };
  const viaMember = await at(3);
  assert.deepEqual(viaMember.map(([rule, where]) => [rule, where]), [['tangle/callback-in-options', 'src/options.ts:6:10']]);
  assert.deepEqual(await at(6), viaMember);
  assert.deepEqual(await at(2), []);
});

test('a body that starts branching on a flag, or an await added before a call, counts as changing the shape', async () => {
  const at = async (text: string, line: number) => {
    writeFileSync(path.join(repo, 'src/reshaped.ts'), text);
    const list = { repo, base: 'main', head: 'working-tree', files: [{ path: 'src/reshaped.ts', status: 'modified' as const, ranges: [{ start: line, end: line }] }] };
    const report = await check({ list, repoKey: 'fixture', config: DEFAULTS, compare: false, out, command: 'test', version: '0', log: () => {} });
    return report.findings.map((f) => `${f.rule} ${f.where}`);
  };
  const selector = 'export class S {\n  run(id: string, active: boolean) {\n    return active ? id : null;\n  }\n}\n';
  assert.deepEqual(await at(selector, 3), ['tangle/selector-parameter src/reshaped.ts:2:19']);
  const closure = 'export async function f(upload: () => Promise<boolean>) {\n  let uploaded = false;\n  await withRetry(async () => {\n    uploaded = await upload();\n  });\n  return uploaded;\n}\ndeclare function withRetry(run: () => Promise<void>): Promise<void>;\n';
  const hit = ['tangle/result-out-of-closure src/reshaped.ts:4:5'];
  assert.deepEqual([await at(closure, 2), await at(closure, 3), await at(closure, 6)], [hit, hit, []]);
});
