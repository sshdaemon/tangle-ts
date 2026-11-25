import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'vitest';
import { accept, acceptedFile, loadAccepted, partition, unaccept } from '../src/cli/accepted.ts';
import { ConfigError } from '../src/cli/config.ts';
import type { Finding } from '../src/report/types.ts';

let home: string;
const saved = process.env['TANGLE_HOME'];
const NOW = new Date('2026-11-21T10:00:00.000Z');
const A = 'tg-0123456789';
const B = 'tg-abcdef0123';

const finding = (id: string, where = 'src/a.ts:3:1'): Finding => ({ id, severity: 'low', category: 'complexity', where, claim: 'c', evidence: 'e', rule: 'sonarjs/nested-control-flow', function: 'f' });
const stored = () => JSON.parse(readFileSync(acceptedFile('repo'), 'utf8'));
const writeReport = (run: string, body: object | string) => {
  const dir = path.join(home, 'runs', 'repo', run);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'report.json'), typeof body === 'string' ? body : JSON.stringify(body));
};

beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), 'tangle-accepted-'));
  process.env['TANGLE_HOME'] = home;
});

afterEach(() => {
  if (saved === undefined) delete process.env['TANGLE_HOME'];
  else process.env['TANGLE_HOME'] = saved;
  rmSync(home, { recursive: true, force: true });
});

test('accepting stores each id under the settings home, newest reason winning', () => {
  assert.equal(acceptedFile('repo'), path.join(home, 'repos', 'repo.accepted.json'));
  assert.deepEqual(loadAccepted('repo'), new Map());
  accept('repo', [B, A], 'first', NOW);
  accept('repo', [A], 'second', new Date('2026-11-22T00:00:00.000Z'));
  assert.deepEqual(stored(), { [A]: { reason: 'second', acceptedAt: '2026-11-22T00:00:00.000Z' }, [B]: { reason: 'first', acceptedAt: NOW.toISOString() } });
  assert.deepEqual(Object.keys(stored()), [A, B]);
  assert.deepEqual(readdirSync(path.join(home, 'repos')), ['repo.accepted.json']);
  assert.equal(loadAccepted('repo').get(B)?.reason, 'first');
});

test('the rule and place come from the newest recent report that has the id', () => {
  writeReport('2026-11-20T09-00-00-000Z', { findings: [finding(A, 'old.ts:1:1')] });
  writeReport('2026-11-21T09-00-00-000Z', { findings: [], accepted: [{ ...finding(A, 'new.ts:2:2'), reason: 'r', acceptedAt: 't' }] });
  writeReport('2026-11-21T09-30-00-000Z', '{ not json');
  writeReport('2026-11-21T09-40-00-000Z', { findings: 'nope' });
  accept('repo', [A, B], 'why', NOW);
  assert.deepEqual(stored()[A], { reason: 'why', acceptedAt: NOW.toISOString(), rule: 'sonarjs/nested-control-flow', where: 'new.ts:2:2' });
  assert.deepEqual(stored()[B], { reason: 'why', acceptedAt: NOW.toISOString() });
  assert.deepEqual(loadAccepted('repo').get(A), stored()[A]);
  rmSync(path.join(home, 'runs'), { recursive: true });
  accept('repo', [A, B], 'later', NOW);
  assert.deepEqual([stored()[A].where, stored()[A].rule, stored()[A].reason], ['new.ts:2:2', 'sonarjs/nested-control-flow', 'later']);
  assert.deepEqual(Object.keys(stored()[B]), ['reason', 'acceptedAt']);
});

test('only the twenty newest reports are searched', () => {
  writeReport('2026-01-01T00-00-00-000Z', { findings: [finding(A)] });
  for (let i = 10; i < 30; i++) writeReport(`2026-02-${i}T00-00-00-000Z`, { findings: [] });
  accept('repo', [A], 'why', NOW);
  assert.equal(stored()[A].where, undefined);
});

test('a broken accepted file stops with a message naming it', () => {
  const bad = (text: string, message: RegExp) => {
    mkdirSync(path.join(home, 'repos'), { recursive: true });
    writeFileSync(acceptedFile('repo'), text);
    assert.throws(() => loadAccepted('repo'), (e: unknown) => e instanceof ConfigError && message.test(e.message) && e.message.startsWith(acceptedFile('repo')));
  };
  bad('{', /: not valid JSON \(/);
  bad('[]', /: expected a JSON object keyed by finding id$/);
  bad('null', /: expected a JSON object/);
  bad('5', /: expected a JSON object/);
  bad('true', /: expected a JSON object/);
  bad(JSON.stringify({ 'tg-zz': { reason: 'r', acceptedAt: 't' } }), /: tg-zz is not a finding id$/);
  bad(JSON.stringify({ [A]: 'r' }), new RegExp(`: ${A} must be an object$`));
  bad(JSON.stringify({ [A]: [] }), /must be an object$/);
  bad(JSON.stringify({ [A]: { acceptedAt: 't' } }), /needs a reason$/);
  bad(JSON.stringify({ [A]: { reason: '  ', acceptedAt: 't' } }), /needs a reason$/);
  bad(JSON.stringify({ [A]: { reason: 'r' } }), /needs acceptedAt$/);
  bad(JSON.stringify({ [A]: { reason: 'r', acceptedAt: 't', rule: 1 } }), /: rule must be a string$/);
  bad(JSON.stringify({ [A]: { reason: 'r', acceptedAt: 't', where: 1 } }), /: where must be a string$/);
});

test('unaccepting drops the ids, or changes nothing when one was not accepted', () => {
  accept('repo', [A, B], 'why', NOW);
  assert.deepEqual(unaccept('repo', [A, 'tg-ffffffffff']), ['tg-ffffffffff']);
  assert.deepEqual(Object.keys(stored()), [A, B]);
  assert.deepEqual(unaccept('repo', [A]), []);
  assert.deepEqual(Object.keys(stored()), [B]);
  assert.deepEqual(readdirSync(path.join(home, 'repos')), ['repo.accepted.json']);
});

test('partition moves accepted findings out, keeping their order and reason', () => {
  const accepted = new Map([[B, { reason: 'why', acceptedAt: 't' }]]);
  const result = partition([finding(A), finding(B), finding('tg-1111111111')], accepted);
  assert.deepEqual(result.findings.map((f) => f.id), [A, 'tg-1111111111']);
  assert.deepEqual(result.accepted, [{ ...finding(B), reason: 'why', acceptedAt: 't' }]);
});
