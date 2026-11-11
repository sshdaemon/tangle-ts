import { LineRange } from './ranges.ts';
import type { ChangedFile, ChangeList } from './types.ts';

export class ChangeListError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChangeListError';
  }
}

/** Validates a parsed change list file. Ranges are written as `[start, end]` pairs or `"whole"`. */
export function parseChangeList(raw: unknown, source: string): ChangeList {
  const fail = (what: string): never => {
    throw new ChangeListError(`${source}: ${what}`);
  };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('expected a JSON object');
  const o = raw as Record<string, unknown>;
  for (const key of ['repo', 'base', 'head'] as const) {
    if (typeof o[key] !== 'string' || o[key] === '') fail(`${key} must be a non-empty string`);
  }
  if (!Array.isArray(o['files'])) fail('files must be an array');
  const files = (o['files'] as unknown[]).map((f, i): ChangedFile => {
    if (!f || typeof f !== 'object') fail(`files[${i}] must be an object`);
    const e = f as Record<string, unknown>;
    if (typeof e['path'] !== 'string' || e['path'] === '' || e['path'].startsWith('/') || e['path'].split('/').includes('..')) {
      fail(`files[${i}].path must be a repo-relative path`);
    }
    const status = e['status'];
    if (status !== 'added' && status !== 'modified' && status !== 'renamed') fail(`files[${i}].status must be added, modified or renamed`);
    if (status === 'renamed' && typeof e['oldPath'] !== 'string') fail(`files[${i}].oldPath is required for a renamed file`);
    const ranges = e['ranges'];
    let parsed: ChangedFile['ranges'];
    if (ranges === 'whole') parsed = 'whole';
    else if (Array.isArray(ranges)) {
      parsed = LineRange.merge(
        ranges.map((r, j) => {
          if (!Array.isArray(r) || r.length !== 2) fail(`files[${i}].ranges[${j}] must be [start, end]`);
          try {
            return LineRange.of(r[0], r[1]);
          } catch {
            return fail(`files[${i}].ranges[${j}] is not a valid line range`);
          }
        }),
      );
    } else return fail(`files[${i}].ranges must be an array of [start, end] or "whole"`);
    return {
      path: e['path'] as string,
      status: status as ChangedFile['status'],
      ...(status === 'renamed' ? { oldPath: e['oldPath'] as string } : {}),
      ranges: parsed,
    };
  });
  return { repo: o['repo'] as string, base: o['base'] as string, head: o['head'] as string, files };
}

export function serializeChangeList(list: ChangeList): string {
  return `${JSON.stringify(
    {
      ...list,
      files: list.files.map((f) => ({ ...f, ranges: f.ranges === 'whole' ? 'whole' : f.ranges.map((r) => [r.start, r.end]) })),
    },
    null,
    2,
  )}\n`;
}
