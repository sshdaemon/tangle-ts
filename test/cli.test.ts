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
  assert.match(tangle('diff', '--changes', 'x.json', '--base', 'main').err, /^--changes already names the base/);
  assert.match(tangle('diff', '--changes', 'missing.json').err, /--changes: .*missing\.json does not exist/);
  assert.match(tangle('files', '../elsewhere.ts').err, /is outside the repo/);
  assert.match(tangle('files', 'gone.ts').err, /^gone\.ts does not exist/);
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
