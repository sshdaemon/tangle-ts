import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_SKIP } from '../change/triage.ts';
import type { SpecMode } from '../change/triage.ts';
import type { Thresholds } from '../check/rules.ts';

export interface ToolConfig {
  readonly base: string;
  readonly skip: readonly string[];
  readonly specs: SpecMode;
  readonly thresholds: Thresholds;
  readonly raiseAt: number;
  /** An oxlint binary to use instead of the pinned one. */
  readonly oxlint?: string;
}

export const DEFAULTS: ToolConfig = {
  base: 'origin/develop',
  skip: DEFAULT_SKIP,
  specs: 'bugRules',
  thresholds: { cognitiveComplexity: 15, nesting: 3, expressionOperators: 3 },
  raiseAt: 10,
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function tangleHome(): string {
  return process.env['TANGLE_HOME'] ?? path.join(os.homedir(), '.tangle');
}

/** Tool defaults merged with `~/.tangle/repos/<repo key>.json` when it exists. */
export function loadConfig(key: string): { config: ToolConfig; source: string } {
  const file = path.join(tangleHome(), 'repos', `${key}.json`);
  if (!existsSync(file)) return { config: DEFAULTS, source: 'defaults' };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new ConfigError(`${file}: not valid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  return { config: validate(raw, file), source: file };
}

export function validate(raw: unknown, source: string): ToolConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ConfigError(`${source}: expected a JSON object`);
  const user = raw as Record<string, unknown>;
  const known = new Set(['base', 'skip', 'specs', 'thresholds', 'raiseAt', 'oxlint']);
  const unknown = Object.keys(user).filter((k) => !known.has(k));
  if (unknown.length > 0) throw new ConfigError(`${source}: unknown key(s) ${unknown.join(', ')}`);
  const skip = stringList(user['skip'], 'skip', source) ?? DEFAULTS.skip;
  for (const s of skip) {
    try {
      RegExp(s);
    } catch (err) {
      throw new ConfigError(`${source}: skip pattern ${JSON.stringify(s)} is not a valid regex (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  const specs = user['specs'] ?? DEFAULTS.specs;
  if (specs !== 'bugRules' && specs !== 'skip' && specs !== 'all') throw new ConfigError(`${source}: specs must be bugRules, skip or all`);
  const t = user['thresholds'];
  if (t !== undefined && (!t || typeof t !== 'object' || Array.isArray(t))) throw new ConfigError(`${source}: thresholds must be an object`);
  const tu = (t ?? {}) as Record<string, unknown>;
  const base = user['base'] ?? DEFAULTS.base;
  if (typeof base !== 'string' || base === '') throw new ConfigError(`${source}: base must be a non-empty string`);
  const oxlint = user['oxlint'];
  if (oxlint !== undefined && (typeof oxlint !== 'string' || oxlint === '')) throw new ConfigError(`${source}: oxlint must be a path`);
  return {
    base,
    skip,
    specs,
    thresholds: {
      cognitiveComplexity: nonNegativeInt(tu['cognitiveComplexity'], 'thresholds.cognitiveComplexity', source) ?? DEFAULTS.thresholds.cognitiveComplexity,
      nesting: nonNegativeInt(tu['nesting'], 'thresholds.nesting', source) ?? DEFAULTS.thresholds.nesting,
      expressionOperators: nonNegativeInt(tu['expressionOperators'], 'thresholds.expressionOperators', source) ?? DEFAULTS.thresholds.expressionOperators,
    },
    raiseAt: nonNegativeInt(user['raiseAt'], 'raiseAt', source) ?? DEFAULTS.raiseAt,
    ...(oxlint ? { oxlint: path.resolve(oxlint as string) } : {}),
  };
}

function nonNegativeInt(value: unknown, name: string, source: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new ConfigError(`${source}: ${name} must be a non-negative integer, got ${JSON.stringify(value)}`);
  return value;
}

function stringList(value: unknown, name: string, source: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) throw new ConfigError(`${source}: ${name} must be an array of strings`);
  return value as string[];
}
