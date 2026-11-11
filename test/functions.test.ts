import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enclosing, functionsOf, lineStartsOf } from '../src/check/functions.ts';

const SRC = `export function top() {
  return [1].map((x) => x + 1);
}
export class Svc {
  handler = () => 1;
  run() {
    const inner = function () {
      return 2;
    };
    return inner();
  }
  get size() {
    return 1;
  }
}
export const Comp = () => <button onClick={() => 1}>x</button>;
`;

test('functionsOf names classes with a dot, nested functions with a slash', () => {
  assert.deepEqual(
    functionsOf('a.tsx', SRC).map((f) => [f.name, f.startLine, f.endLine]),
    [
      ['top', 1, 3],
      ['top/<map callback>', 2, 2],
      ['Svc.handler', 5, 5],
      ['Svc.run', 6, 11],
      ['Svc.run/inner', 7, 9],
      ['Svc.get size', 12, 14],
      ['Comp', 16, 16],
      ['Comp/<jsx handler>', 16, 16],
    ],
  );
});

test('functionsOf numbers repeated names', () => {
  const names = functionsOf('a.ts', 'a.map(() => 1); a.map(() => 2);').map((f) => f.name);
  assert.deepEqual(names, ['<map callback>', '<map callback>#2']);
});

test('enclosing picks the innermost function at a line and column', () => {
  const fns = functionsOf('a.tsx', SRC);
  const at = (line: number, column: number) => lineStartsOf(SRC)[line - 1]! + column - 1;
  assert.equal(enclosing(fns, at(8, 7))?.name, 'Svc.run/inner');
  assert.equal(enclosing(fns, at(10, 5))?.name, 'Svc.run');
  assert.equal(enclosing(fns, at(4, 1)), undefined);
});

test('functionsOf names test callbacks by their title', () => {
  const src = `describe('bookings', () => {\n  it('creates   one', () => {\n    const make = () => 1;\n  });\n});\n`;
  assert.deepEqual(
    functionsOf('a.spec.ts', src).map((f) => f.name),
    ['describe("bookings")', 'describe("bookings")/it("creates one")', 'describe("bookings")/it("creates one")/make'],
  );
});

test('functionsOf skips bodiless overloads, so an added overload does not rename the implementation', () => {
  const one = 'class S {\n  find(a: boolean): number;\n  find(a: any) { return 1; }\n}\nfunction g(a: string): void;\nfunction g(a: any) {}\n';
  const two = one.replace('find(a: boolean): number;', 'find(a: boolean): number;\n  find(a: string): number;');
  assert.deepEqual(functionsOf('a.ts', one).map((f) => f.name), ['S.find', 'g']);
  assert.deepEqual(functionsOf('a.ts', two).map((f) => f.name), ['S.find', 'g']);
});
