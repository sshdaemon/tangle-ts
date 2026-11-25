import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { shapeDiagnostics } from '../src/check/shapes.ts';

const fixture = (name: string) => {
  const file = path.join(import.meta.dirname, 'fixtures', 'shapes', name);
  return { file, text: readFileSync(file, 'utf8') };
};

const hits = (file: string, text: string) => shapeDiagnostics(file, text).map((d) => `${d.line} ${d.rule}`);

test('every marked line of the flagged fixture is reported, and nothing else', () => {
  const { file, text } = fixture('flagged.ts');
  const marked = text.split('\n').flatMap((line, i) => {
    const m = /\/\/ hit: (\S+)/.exec(line);
    return m ? [`${i + 1} ${m[1]}`] : [];
  });
  assert.ok(marked.length >= 8);
  assert.deepEqual(hits(file, text).toSorted(), marked.toSorted());
});

test('the not-flagged fixture, with the execute-around methods, has no findings', () => {
  const { file, text } = fixture('not-flagged.ts');
  assert.deepEqual(hits(file, text), []);
});

test('a flag that is only tested is reported; one that is stored or passed on is not', () => {
  const src = (body: string) => `export class S {\n  run(id: string, flag: boolean) {\n    ${body}\n  }\n}\n`;
  assert.deepEqual(hits('a.ts', src('if (flag) return id;')), ['2 tangle/selector-parameter']);
  assert.deepEqual(hits('a.ts', src('return flag ? id : null;')), ['2 tangle/selector-parameter']);
  assert.deepEqual(hits('a.ts', src('return this.setActive(flag);')), []);
  assert.deepEqual(hits('a.ts', src('if (flag) this.x = flag;')), []);
});

test('an optional callback in an options bag is reported; a lone or required callback is not', () => {
  const sig = (param: string) => `export class S {\n  run(${param}) {}\n}\n`;
  assert.deepEqual(hits('a.ts', sig('opts: { onProgress?: () => Promise<unknown>; label: string }')), ['2 tangle/callback-in-options']);
  assert.deepEqual(hits('a.ts', sig('opts: { onProgress?: (() => void) | undefined; label: string }')), ['2 tangle/callback-in-options']);
  assert.deepEqual(hits('a.ts', sig('opts: { run: () => Promise<unknown>; label: string }')), []);
  assert.deepEqual(hits('a.ts', sig('opts: { onDone?: () => void }')), []);
  assert.deepEqual(hits('a.ts', sig('write: () => Promise<void>')), []);
});

test('a let set inside a callback of an awaited call is reported once per variable and call', () => {
  const fn = (body: string) => `export async function f(x: () => Promise<boolean>) {\n  let r = false;\n${body}\n  return r;\n}\n`;
  assert.deepEqual(hits('a.ts', fn('  await run(async () => {\n    r = await x();\n    r = true;\n  });')), ['4 tangle/result-out-of-closure']);
  assert.deepEqual(hits('a.ts', fn('  run(async () => {\n    r = await x();\n  });')), []);
  assert.deepEqual(hits('a.ts', fn('  await run(async () => {\n    r ||= await x();\n  });')), []);
  assert.deepEqual(hits('a.ts', fn('  r = await run(x);')), []);
  assert.deepEqual(hits('a.ts', fn('  await run(async (r) => {\n    r = await x();\n  });')), []);
});
