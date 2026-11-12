import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { type Rule, type Thresholds } from './rules.ts';

const require = createRequire(import.meta.url);

/** One oxlint diagnostic, lines and columns 1-based. `endLine` is the last line the flagged span covers. */
export interface Diagnostic {
  /** Absolute path. */
  readonly file: string;
  readonly rule: string;
  readonly line: number;
  /** In UTF-16 code units, like `pos`. */
  readonly column: number;
  /** UTF-16 index of the span start in the file text. */
  readonly pos: number;
  readonly endLine: number;
  readonly message: string;
}

export class OxlintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OxlintError';
  }
}

export function sonarjsPluginPath(): string {
  return require.resolve('eslint-plugin-sonarjs');
}

export function defaultOxlintBin(): string {
  return path.join(path.dirname(require.resolve('oxlint/package.json')), 'bin', 'oxlint');
}

/** An oxlint config with every built-in rule off and only the given rules on. */
export function oxlintConfig(rules: readonly Rule[], thresholds: Thresholds): object {
  const entries = rules.map((r) => [r.id, r.options ? ['warn', r.options(thresholds)] : 'warn']);
  return {
    plugins: [],
    categories: { correctness: 'off', suspicious: 'off', pedantic: 'off', style: 'off', perf: 'off', restriction: 'off', nursery: 'off' },
    jsPlugins: [sonarjsPluginPath()],
    rules: Object.fromEntries(entries),
  };
}

export interface RawDiagnostic {
  code?: string;
  message?: string;
  filename?: string;
  labels?: { span?: { offset?: number; length?: number; line?: number; column?: number } }[];
}

export interface LintResult {
  readonly diagnostics: Diagnostic[];
  /** Absolute paths oxlint could not parse; their diagnostics are incomplete. */
  readonly unparsed: string[];
}

/** Runs oxlint on absolute file paths and reads its JSON report. An empty file list runs nothing. */
export async function runOxlint(bin: string, configPath: string, cwd: string, files: readonly string[], signal?: AbortSignal): Promise<LintResult> {
  if (files.length === 0) return { diagnostics: [], unparsed: [] };
  const { code, stdout, stderr } = await exec(bin, ['-c', configPath, '-f', 'json', '--no-ignore', ...files], cwd, signal);
  let parsed: { diagnostics?: RawDiagnostic[] };
  try {
    parsed = JSON.parse(stdout.slice(stdout.indexOf('{')));
  } catch {
    throw new OxlintError(`oxlint exited ${code} without a JSON report: ${(stderr || stdout).trim().slice(0, 500)}`);
  }
  return readReport(parsed.diagnostics ?? [], cwd);
}

/** oxlint's JSON diagnostics as positions in the files' text; file names are relative to `cwd`. */
export function readReport(raw: readonly RawDiagnostic[], cwd: string): LintResult {
  const sources = new Map<string, Buffer>();
  const unparsed = new Set<string>();
  const diagnostics = raw.flatMap((d): Diagnostic[] => {
    if (!d.filename) return [];
    const file = path.resolve(cwd, d.filename);
    // Parse errors carry no rule code.
    if (!d.code) {
      unparsed.add(file);
      return [];
    }
    const span = d.labels?.[0]?.span;
    if (!span?.line || span.offset === undefined) return [];
    let src = sources.get(file);
    if (!src) {
      src = readFileSync(file);
      sources.set(file, src);
    }
    // oxlint offsets and columns count UTF-8 bytes; the TS parser counts UTF-16 units.
    const pos = utf16Index(src, span.offset);
    const lineStartByte = src.lastIndexOf(0x0a, span.offset - 1) + 1;
    return [
      {
        file,
        rule: ruleId(d.code),
        line: span.line,
        column: pos - utf16Index(src, lineStartByte) + 1,
        pos,
        endLine: lineAtByte(src, span.offset + Math.max(0, (span.length ?? 1) - 1), span.line),
        message: d.message ?? '',
      },
    ];
  });
  return { diagnostics, unparsed: [...unparsed] };
}

function utf16Index(src: Buffer, byteOffset: number): number {
  return src.subarray(0, Math.min(byteOffset, src.length)).toString('utf8').length;
}

/** `sonarjs(no-collapsible-if)` → `sonarjs/no-collapsible-if`; `eslint(complexity)` → `complexity`. */
export function ruleId(code: string): string {
  const m = /^([\w-]+)\(([^)]+)\)$/.exec(code);
  if (!m) return code;
  return m[1] === 'eslint' ? m[2]! : `${m[1]}/${m[2]}`;
}

/** oxlint span offsets count UTF-8 bytes; lines are 1-based. Never earlier than `atLeast`. */
function lineAtByte(src: Buffer, offset: number, atLeast: number): number {
  let line = 1;
  const end = Math.min(offset, src.length);
  for (let i = 0; i < end; i++) if (src[i] === 0x0a) line++;
  return Math.max(line, atLeast);
}

function exec(bin: string, args: string[], cwd: string, signal?: AbortSignal): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    // Decode as a stream so a multi-byte character split across chunks stays whole.
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (s: string) => (stdout += s));
    child.stderr.on('data', (s: string) => (stderr += s));
    child.on('error', (err) => reject(err.name === 'AbortError' ? new Error('interrupted') : new OxlintError(`could not run ${bin}: ${err.message}`)));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
