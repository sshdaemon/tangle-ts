import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { ConfigError, DEFAULTS, loadConfig, tangleHome, validate } from '../src/cli/config.ts';
import { GitError, repoKey, repoRoot } from '../src/cli/git.ts';

test('validate merges partial thresholds over the defaults', () => {
  const c = validate({ thresholds: { nesting: 4 }, specs: 'all' }, 'f');
  assert.deepEqual(c.thresholds, { ...DEFAULTS.thresholds, nesting: 4 });
  assert.equal(c.specs, 'all');
  assert.equal(c.base, DEFAULTS.base);
});

test('validate rejects unknown keys, bad regexes and bad numbers', () => {
  assert.throws(() => validate({ thresold: {} }, 'f'), /unknown key\(s\) thresold/);
  assert.throws(() => validate({ skip: ['('] }, 'f'), /not a valid regex/);
  assert.throws(() => validate({ thresholds: { nesting: -1 } }, 'f'), /thresholds.nesting/);
  assert.throws(() => validate({ raiseAt: 1.5 }, 'f'), /raiseAt/);
  assert.throws(() => validate({ specs: 'some' }, 'f'), ConfigError);
  assert.throws(() => validate([], 'f'), /JSON object/);
});

test('repoKey uses the origin remote name, else the main checkout folder, shared by worktrees', () => {
  const tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tangle-key-')));
  try {
    const main = path.join(tmp, 'my-repo');
    const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' });
    execFileSync('mkdir', [main]);
    g(main, 'init', '-q', '-b', 'main');
    g(main, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'x');
    g(main, 'worktree', 'add', '-q', path.join(tmp, 'my-repo-feature'));
    assert.equal(repoKey(main), 'my-repo');
    assert.equal(repoKey(path.join(tmp, 'my-repo-feature')), 'my-repo');
    g(main, 'remote', 'add', 'origin', 'git@github.com:org/service-api.git');
    assert.equal(repoKey(path.join(tmp, 'my-repo-feature')), 'service-api');
    g(main, 'remote', 'set-url', 'origin', 'https://github.com/org/web//');
    assert.equal(repoKey(main), 'web');
    g(main, 'remote', 'set-url', 'origin', 'git@github.com:org/my.gitops.git');
    assert.equal(repoKey(main), 'my.gitops');
    // A worktree of a bare repo without a remote is named after the bare repo's folder.
    g(tmp, 'clone', '-q', '--bare', main, path.join(tmp, 'bare.git'));
    g(path.join(tmp, 'bare.git'), 'remote', 'remove', 'origin');
    g(path.join(tmp, 'bare.git'), 'worktree', 'add', '-q', path.join(tmp, 'bare-wt'));
    assert.equal(repoKey(path.join(tmp, 'bare-wt')), 'bare.git');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('validate rejects each malformed field with its own message', () => {
  const cases: [unknown, RegExp][] = [
    [null, /f: expected a JSON object/],
    ['x', /f: expected a JSON object/],
    [{ skip: 'x' }, /f: skip must be an array of strings/],
    [{ skip: ['a', 1] }, /f: skip must be an array of strings/],
    [{ thresholds: [] }, /f: thresholds must be an object/],
    [{ thresholds: null }, /f: thresholds must be an object/],
    [{ thresholds: 3 }, /f: thresholds must be an object/],
    [{ base: '' }, /f: base must be a non-empty string/],
    [{ base: 5 }, /f: base must be a non-empty string/],
    [{ oxlint: '' }, /f: oxlint must be a path/],
    [{ oxlint: 5 }, /f: oxlint must be a path/],
    [{ thresholds: { cognitiveComplexity: '15' } }, /thresholds.cognitiveComplexity must be a non-negative integer, got "15"/],
    [{ thresholds: { expressionOperators: -1 } }, /thresholds.expressionOperators/],
  ];
  for (const [raw, message] of cases) assert.throws(() => validate(raw, 'f'), message, JSON.stringify(raw));
});

test('validate keeps zero values and resolves the oxlint path', () => {
  const c = validate({ thresholds: { nesting: 0 }, raiseAt: 0, oxlint: 'bin/oxlint', skip: [], base: 'origin/main' }, 'f');
  assert.equal(c.thresholds.nesting, 0);
  assert.equal(c.raiseAt, 0);
  assert.equal(c.oxlint, path.resolve('bin/oxlint'));
  assert.deepEqual(c.skip, []);
  assert.equal(c.base, 'origin/main');
  assert.equal(validate({ raiseAt: 5 }, 'f').raiseAt, 5);
  assert.equal(validate({ specs: 'skip' }, 'f').specs, 'skip');
  assert.equal(validate({ specs: 'bugRules' }, 'f').specs, 'bugRules');
  assert.equal('oxlint' in validate({}, 'f'), false);
});

test('loadConfig reads ~/.tangle/repos/<key>.json under TANGLE_HOME', () => {
  const home = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tangle-home-')));
  const before = process.env['TANGLE_HOME'];
  process.env['TANGLE_HOME'] = home;
  try {
    assert.equal(tangleHome(), home);
    assert.deepEqual(loadConfig('none'), { config: DEFAULTS, source: 'defaults' });
    mkdirSync(path.join(home, 'repos'));
    writeFileSync(path.join(home, 'repos', 'svc.json'), JSON.stringify({ raiseAt: 3 }));
    const loaded = loadConfig('svc');
    assert.equal(loaded.source, path.join(home, 'repos', 'svc.json'));
    assert.equal(loaded.config.raiseAt, 3);
    writeFileSync(path.join(home, 'repos', 'bad.json'), '{');
    assert.throws(() => loadConfig('bad'), /bad\.json: not valid JSON/);
  } finally {
    if (before === undefined) delete process.env['TANGLE_HOME'];
    else process.env['TANGLE_HOME'] = before;
    rmSync(home, { recursive: true, force: true });
  }
  assert.equal(tangleHome(), before ?? path.join(os.homedir(), '.tangle'));
});

test('repoRoot finds the top of the checkout and names the failure outside one', () => {
  const tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tangle-root-')));
  try {
    execFileSync('git', ['init', '-q', tmp]);
    mkdirSync(path.join(tmp, 'a', 'b'), { recursive: true });
    assert.equal(repoRoot(path.join(tmp, 'a', 'b')), tmp);
    const outside = path.join(tmp, 'a');
    assert.throws(() => repoRoot(path.join(tmp, 'missing')), (err: unknown) => err instanceof GitError && /failed in .*missing$/.test(err.message));
    rmSync(path.join(tmp, '.git'), { recursive: true, force: true });
    assert.throws(() => repoRoot(outside), (err: unknown) => err instanceof GitError && /rev-parse --show-toplevel failed in .*: fatal: not a git repository/.test(err.message) && !err.message.endsWith('\n'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
