import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { ConfigError, DEFAULTS, validate } from '../src/cli/config.ts';
import { repoKey } from '../src/cli/git.ts';

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
    g(main, 'remote', 'set-url', 'origin', 'https://github.com/org/web/');
    assert.equal(repoKey(main), 'web');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
