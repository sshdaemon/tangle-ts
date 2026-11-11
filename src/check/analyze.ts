import { createHash } from 'node:crypto';
import { LineRange } from '../change/ranges.ts';
import type { ChangedFile } from '../change/types.ts';
import type { Finding } from '../report/types.ts';
import { enclosing, hashText, MODULE, type FunctionSpan } from './functions.ts';
import type { Diagnostic } from './oxlint.ts';
import { ruleById, type Rule, type Thresholds } from './rules.ts';

/** One version of a file, linted and parsed. */
export interface FileVersion {
  readonly text: string;
  readonly lineStarts: readonly number[];
  readonly functions: readonly FunctionSpan[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface FileInput {
  readonly file: ChangedFile;
  readonly sizeRules: boolean;
  readonly head: FileVersion;
  /** False when nothing was compared (`files` without a base, or a before version that did not parse). */
  readonly compared: boolean;
  /** The file at the merge base; absent for an added file or when not compared. */
  readonly base?: FileVersion;
}

export interface AnalyzeOptions {
  readonly thresholds: Thresholds;
  /** A size finding becomes medium when its score rose by at least this much. */
  readonly raiseAt: number;
  /** Repo key, part of every finding key so ids differ between repos. */
  readonly repoKey: string;
}

interface Hit {
  readonly d: Diagnostic;
  readonly fn: FunctionSpan | undefined;
  readonly score: number | undefined;
}

export function analyze(inputs: readonly FileInput[], opts: AnalyzeOptions): Finding[] {
  return inputs.flatMap((input) => [...(input.sizeRules ? sizeFindings(input, opts) : []), ...bugFindings(input, opts)]);
}

function hitsOf(v: FileVersion, kind: Rule['kind']): Map<string, Hit[]> {
  const groups = new Map<string, Hit[]>();
  for (const d of v.diagnostics) {
    const rule = ruleById(d.rule);
    if (rule?.kind !== kind) continue;
    const fn = enclosing(v.functions, d.pos);
    const k = `${d.rule}\u0000${fn?.name ?? MODULE}`;
    groups.set(k, [...(groups.get(k) ?? []), { d, fn, score: rule.score?.(d.message) }]);
  }
  return groups;
}

/** Size rules: one finding per function and rule, only when the function touches the change and got worse. */
function sizeFindings(input: FileInput, opts: AnalyzeOptions): Finding[] {
  const head = hitsOf(input.head, 'size');
  const base = input.base ? hitsOf(input.base, 'size') : new Map<string, Hit[]>();
  const baseNames = new Set(input.base?.functions.map((f) => f.name) ?? []);
  const out: Finding[] = [];
  for (const [k, all] of head) {
    const rule = ruleById(all[0]!.d.rule)!;
    const limit = rule.limit?.(opts.thresholds);
    const over = (h: Hit) => limit === undefined || (h.score ?? 0) > limit;
    const hits = all.filter(over);
    if (hits.length === 0) continue;
    const fn = hits[0]!.fn;
    const lines = fn ? { start: fn.startLine, end: fn.endLine } : { start: Math.min(...hits.map((h) => h.d.line)), end: Math.max(...hits.map((h) => h.d.endLine)) };
    if (!LineRange.touches(input.file.ranges, lines)) continue;
    const before = base.get(k) ?? [];
    const beforeOver = before.filter(over);
    const headMax = Math.max(0, ...hits.map((h) => h.score ?? 0));
    const baseMax = Math.max(0, ...before.map((h) => h.score ?? 0));
    const isNew = fn !== undefined && input.base !== undefined && !baseNames.has(fn.name);
    const added = input.compared && (input.base === undefined || isNew);
    const worse = !input.compared || added || hits.length > beforeOver.length || (rule.score !== undefined && headMax > baseMax);
    if (!worse) continue;
    const name = fn?.name ?? MODULE;
    // New or uncompared code rises from zero.
    const rise = rule.score ? headMax - (added || !input.compared ? 0 : baseMax) : 0;
    // `before` is null for new code and left out when nothing was compared.
    const priorOf = (n: number) => (!input.compared ? {} : { before: added ? null : n });
    const first = hits[0]!.d;
    out.push({
      id: idOf(opts.repoKey, input.file.path, rule.id, name, fn?.hash ?? ''),
      severity: rule.score && rise >= opts.raiseAt ? 'medium' : 'low',
      category: rule.category,
      rule: rule.id,
      function: name,
      where: `${input.file.path}:${first.line}:${first.column}`,
      claim: sizeClaim(rule, name, hits, beforeOver.length, headMax, baseMax, limit, input.compared ? (added ? 'new' : 'changed') : 'uncompared'),
      // Scored rules run with a zero limit; show the configured one instead.
      evidence: limit === undefined ? first.message : first.message.replace(/\b0 allowed\b/, `${limit} allowed`).replace(/maximum allowed 0\b/, `maximum allowed ${limit}`),
      ...(rule.score ? { score: { ...priorOf(baseMax), after: headMax } } : { count: { ...priorOf(beforeOver.length), after: hits.length } }),
    });
  }
  return out;
}

type Compared = 'new' | 'changed' | 'uncompared';

function sizeClaim(rule: Rule, name: string, hits: readonly Hit[], beforeCount: number, headMax: number, baseMax: number, limit: number | undefined, how: Compared): string {
  const fn = name === MODULE ? 'Module-level code' : `\`${name}\``;
  const was = how === 'new' ? ' (new code)' : how === 'uncompared' ? ' (not compared)' : rule.score ? `, was ${baseMax}` : `, was ${beforeCount}`;
  if (rule.id === 'sonarjs/cognitive-complexity') return `${fn} has cognitive complexity ${headMax} (limit ${limit})${was}.`;
  if (rule.id === 'sonarjs/expression-complexity') return `${fn} has an expression with ${headMax} conditional operators (limit ${limit})${how === 'changed' ? `, most before ${baseMax}` : was}.`;
  return `${fn}: ${rule.what} in ${hits.length} place(s)${was}.`;
}

/** Bug rules: every hit on a changed line. */
function bugFindings(input: FileInput, opts: AnalyzeOptions): Finding[] {
  const out: Finding[] = [];
  // Hits with the same rule, function and text are told apart by their order.
  const seen = new Map<string, number>();
  for (const hits of hitsOf(input.head, 'bug').values()) {
    for (const { d, fn } of [...hits].sort((a, b) => a.d.pos - b.d.pos)) {
      const rule = ruleById(d.rule)!;
      const name = fn?.name ?? MODULE;
      const snippet = input.head.text.slice(input.head.lineStarts[d.line - 1] ?? 0, input.head.lineStarts[d.endLine] ?? input.head.text.length);
      const textHash = hashText(snippet);
      const k = `${rule.id}\u0000${name}\u0000${textHash}`;
      const n = (seen.get(k) ?? 0) + 1;
      seen.set(k, n);
      if (!LineRange.touches(input.file.ranges, { start: d.line, end: d.endLine })) continue;
      out.push({
        id: idOf(opts.repoKey, input.file.path, rule.id, name, n === 1 ? textHash : `${textHash}#${n}`),
        severity: 'medium',
        category: rule.category,
        rule: rule.id,
        function: name,
        where: `${input.file.path}:${d.line}:${d.column}`,
        claim: `${rule.what[0]!.toUpperCase()}${rule.what.slice(1)}${name === MODULE ? '' : ` in \`${name}\``}.`,
        evidence: d.message,
      });
    }
  }
  return out;
}

/** Stable across edits elsewhere in the file: no line numbers, only names and text hashes. */
function idOf(repoKey: string, file: string, rule: string, fn: string, textHash: string): string {
  return `tg-${createHash('sha256').update([repoKey, file, rule, fn, textHash].join('\u0000')).digest('hex').slice(0, 10)}`;
}
