import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, test } from 'vitest';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'tangle.js');
let repo: string;
let home: string;

const tangle = (...args: string[]) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: repo, encoding: 'utf8', env: { ...process.env, TANGLE_HOME: home } });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

beforeAll(() => {
  repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tangle-cli-')));
  home = path.join(repo, '.home');
  const g = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  g('init', '-q', '-b', 'main');
  writeFileSync(path.join(repo, '.gitignore'), '.home/\nout/\n');
  writeFileSync(path.join(repo, 'a.ts'), 'export const a = 1;\n');
  g('add', '-A');
  g('commit', '-qm', 'base');
  g('checkout', '-qb', 'feature');
  writeFileSync(path.join(repo, 'a.ts'), 'export const a = (x: { id: number }) => x.id === x.id;\n');
  g('commit', '-qam', 'change');
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

test('usage errors exit 2 with a message', () => {
  assert.equal(tangle('--help').code, 0);
  assert.match(tangle('--help').out, /^tangle <command> \[options\]/);
  assert.equal(tangle().code, 2);
  assert.deepEqual([tangle('nope').code, /unknown command nope/.test(tangle('nope').err)], [2, true]);
  assert.match(tangle('diff', 'a.ts').err, /^diff takes no paths/);
  assert.match(tangle('files').err, /^files: give at least one path/);
  assert.match(tangle('files', '--changes', 'x.json', 'a.ts').err, /^--changes works with diff only/);
  assert.match(tangle('diff', '--changes', 'x.json', '--base', 'main').err, /^--changes already names the base and head/);
  assert.match(tangle('diff', '--changes', 'missing.json').err, /--changes: .*missing\.json does not exist/);
  assert.match(tangle('files', '../elsewhere.ts').err, /is outside the repo/);
  assert.match(tangle('files', 'gone.ts').err, /^gone\.ts does not exist/);
  assert.deepEqual([tangle('diff', '--bogus').code, /Unknown option '--bogus'/.test(tangle('diff', '--bogus').err)], [2, true]);
  assert.deepEqual([tangle('diff', '--base').code, /--base/.test(tangle('diff', '--base').err)], [2, true]);
  assert.deepEqual([tangle('diff', '--head', 'HEAD', '--committed').code, /--head and --committed conflict/.test(tangle('diff', '--head', 'HEAD', '--committed').err)], [2, true]);
  assert.match(tangle('files', 'a.ts', '--head', 'HEAD').err, /^--head works with diff and changes only/);
  assert.match(tangle('diff', '--changes', 'x.json', '--head', 'HEAD').err, /^--changes already names the base and head/);
  assert.deepEqual([tangle('files', 'a.ts:40-10').code, tangle('files', 'a.ts:40-10').err], [2, 'a.ts:40-10: invalid line range 40-10\n']);
});

test('changes prints or writes the list; diff and files check it', () => {
  const printed = JSON.parse(tangle('changes', '--base', 'main', '--committed').out);
  assert.equal(printed.base, 'main');
  assert.deepEqual(printed.files, [{ path: 'a.ts', status: 'modified', ranges: [[1, 1]] }]);
  assert.equal(tangle('changes', '--base', 'main', '--out', 'list.json').code, 0);
  assert.equal(JSON.parse(readFileSync(path.join(repo, 'list.json'), 'utf8')).head, 'working-tree');

  const diff = tangle('diff', '--changes', 'list.json', '--out', 'out/d');
  assert.equal(diff.code, 0);
  assert.match(diff.out, /^1 file\(s\) checked, 1 finding\(s\) \(1 medium\), \d+\.\ds\nreport: .*out\/d\/report\.md\n$/);
  assert.match(diff.err, /^repo: .* \(key tangle-cli-\w+, config: defaults\)/);
  assert.equal(tangle('diff', '--base', 'main', '--quiet', '--out', 'out/q').err, '');

  const files = JSON.parse((tangle('files', 'a.ts:1', '--out', 'out/f'), readFileSync(path.join(repo, 'out/f/report.json'), 'utf8')));
  assert.equal(files.base, null);
  assert.equal(files.command, 'tangle files a.ts:1 --out out/f');
  const withBase = JSON.parse((tangle('files', 'a.ts', '--base', 'main', '--out', 'out/b'), readFileSync(path.join(repo, 'out/b/report.json'), 'utf8')));
  assert.equal(withBase.base.ref, 'main');

  writeFileSync(path.join(repo, 'bad.json'), '{"repo": "/r"');
  assert.match(tangle('diff', '--changes', 'bad.json').err, /bad\.json: not valid JSON/);
  writeFileSync(path.join(repo, 'rel.json'), JSON.stringify({ repo: 'rel', base: 'main', head: 'working-tree', files: [] }));
  assert.match(tangle('diff', '--changes', 'rel.json').err, /repo rel is not an existing absolute path/);
});

test('a run without --out leaves the checked repo as it was', () => {
  const outside = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tangle-home-')));
  const status = () => execFileSync('git', ['status', '--porcelain', '--ignored'], { cwd: repo, encoding: 'utf8' });
  try {
    const before = status();
    const r = spawnSync(process.execPath, [BIN, 'diff', '--base', 'main', '--quiet'], { cwd: repo, encoding: 'utf8', env: { ...process.env, TANGLE_HOME: outside } });
    assert.equal(r.status, 0);
    assert.equal(status(), before);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test('--head checks a commit whatever is checked out', () => {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  const sha = git('rev-parse', 'feature');
  const asSquash = ['--base', `${sha}^`, '--head', sha];
  git('checkout', '-q', 'main');
  // The disk has no bug in a.ts and an untracked file with one: only the commit's a.ts may be checked.
  writeFileSync(path.join(repo, 'a.ts'), 'export const a = 2;\n');
  writeFileSync(path.join(repo, 'stray.ts'), 'export const s = (z: { id: number }) => z.id === z.id;\n');
  try {
    const list = JSON.parse(tangle('changes', ...asSquash).out);
    assert.deepEqual([list.base, list.head, list.files], [`${sha}^`, sha, [{ path: 'a.ts', status: 'modified', ranges: [[1, 1]] }]]);
    assert.equal(tangle('diff', ...asSquash, '--quiet', '--out', 'out/h').code, 0);
    const report = JSON.parse(readFileSync(path.join(repo, 'out/h/report.json'), 'utf8'));
    assert.deepEqual(report.checked, ['a.ts']);
    assert.deepEqual(report.findings.map((f: { rule: string; where: string }) => [f.rule, f.where]), [['sonarjs/no-identical-expressions', 'a.ts:1:41']]);
    assert.equal(report.base.commit, git('rev-parse', `${sha}^`));
  } finally {
    rmSync(path.join(repo, 'stray.ts'), { force: true });
    git('checkout', '-q', '--', 'a.ts');
    git('checkout', '-q', 'feature');
  }
  const merged = tangle('changes', '--base', 'feature', '--head', sha);
  assert.deepEqual([merged.code, JSON.parse(merged.out).files], [0, []]);
  assert.equal(merged.err, `warning: ${sha.slice(0, 12)} is already in feature, so there is nothing to check; for a merged commit use --base <sha>^ --head <sha>\n`);
  assert.equal(tangle('changes', '--base', 'feature', '--head', sha, '--quiet').err, '');
  assert.equal(tangle('changes', '--base', 'main', '--head', sha).err, '');
  tangle('diff', '--base', 'feature', '--head', sha, '--quiet', '--out', 'out/e');
  assert.deepEqual(JSON.parse(readFileSync(path.join(repo, 'out/e/report.json'), 'utf8')).warnings, [merged.err.slice('warning: '.length, -1)]);
  const missing = tangle('changes', '--head', 'no-such-commit');
  assert.deepEqual([missing.code, /Needed a single revision/.test(missing.err)], [1, true]);
});

