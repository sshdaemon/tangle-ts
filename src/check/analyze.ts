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

type Compared = 'new' | 'changed' | 'uncompared';

/** One rule's hits in one function, set against the same function's hits at the base. */
interface SizeGroup {
  readonly rule: Rule;
  readonly limit: number | undefined;
  readonly fn: FunctionSpan | undefined;
  /** Head hits over the limit. */
  readonly hits: readonly Hit[];
  readonly headMax: number;
  /** Base hits over the limit. */
  readonly beforeCount: number;
  /** Highest base score, over the limit or not. */
  readonly baseMax: number;
  readonly how: Compared;
}

/** Size rules: one finding per function and rule, only when the function touches the change and got worse. */
function sizeFindings(input: FileInput, opts: AnalyzeOptions): Finding[] {
  const base = input.base ? hitsOf(input.base, 'size') : new Map<string, Hit[]>();
  const baseNames = new Set(input.base?.functions.map((f) => f.name) ?? []);
  const out: Finding[] = [];
  for (const [k, all] of hitsOf(input.head, 'size')) {
    const group = sizeGroup(input, all, base.get(k) ?? [], baseNames, opts);
    if (group && isWorse(group)) out.push(sizeFinding(input, group, opts));
  }
  return out;
}

function sizeGroup(input: FileInput, all: readonly Hit[], before: readonly Hit[], baseNames: ReadonlySet<string>, opts: AnalyzeOptions): SizeGroup | undefined {
  const rule = ruleById(all[0]!.d.rule)!;
  const limit = rule.limit?.(opts.thresholds);
  const over = (h: Hit) => limit === undefined || (h.score ?? 0) > limit;
  const hits = all.filter(over);
  if (hits.length === 0) return undefined;
  const fn = hits[0]!.fn;
  if (!LineRange.touches(input.file.ranges, linesOf(fn, hits))) return undefined;
  return {
    rule,
    limit,
    fn,
    hits,
    headMax: maxScore(hits),
    beforeCount: before.filter(over).length,
    baseMax: maxScore(before),
    how: compared(input, fn, baseNames),
  };
}

function linesOf(fn: FunctionSpan | undefined, hits: readonly Hit[]): { start: number; end: number } {
  if (fn) return { start: fn.startLine, end: fn.endLine };
  return { start: Math.min(...hits.map((h) => h.d.line)), end: Math.max(...hits.map((h) => h.d.endLine)) };
}

function maxScore(hits: readonly Hit[]): number {
  return Math.max(0, ...hits.map((h) => h.score ?? 0));
}

/** New: an added file, or a function the base did not have. */
function compared(input: FileInput, fn: FunctionSpan | undefined, baseNames: ReadonlySet<string>): Compared {
  if (!input.compared) return 'uncompared';
  if (input.base === undefined || (fn !== undefined && !baseNames.has(fn.name))) return 'new';
  return 'changed';
}

function isWorse(g: SizeGroup): boolean {
  if (g.how !== 'changed') return true;
  return g.hits.length > g.beforeCount || (g.rule.score !== undefined && g.headMax > g.baseMax);
}

function sizeFinding(input: FileInput, g: SizeGroup, opts: AnalyzeOptions): Finding {
  const name = g.fn?.name ?? MODULE;
  const first = g.hits[0]!.d;
  // New or uncompared code rises from zero.
  const rise = g.headMax - (g.how === 'changed' ? g.baseMax : 0);
  // `before` is null for new code and left out when nothing was compared.
  const prior = (n: number) => (g.how === 'uncompared' ? {} : { before: g.how === 'new' ? null : n });
  return {
    id: idOf(opts.repoKey, input.file.path, g.rule.id, name, g.fn?.hash ?? ''),
    severity: g.rule.score && rise >= opts.raiseAt ? 'medium' : 'low',
    category: g.rule.category,
    rule: g.rule.id,
    function: name,
    where: `${input.file.path}:${first.line}:${first.column}`,
    claim: sizeClaim(g, name),
    evidence: evidenceOf(first.message, g.limit),
    ...(g.rule.score ? { score: { ...prior(g.baseMax), after: g.headMax } } : { count: { ...prior(g.beforeCount), after: g.hits.length } }),
  };
}

/** Scored rules run with a zero limit; show the configured one instead. */
function evidenceOf(message: string, limit: number | undefined): string {
  if (limit === undefined) return message;
  return message.replace(/\b0 allowed\b/, `${limit} allowed`).replace(/maximum allowed 0\b/, `maximum allowed ${limit}`);
}

function sizeClaim(g: SizeGroup, name: string): string {
  const fn = name === MODULE ? 'Module-level code' : `\`${name}\``;
  if (g.rule.id === 'sonarjs/cognitive-complexity') return `${fn} has cognitive complexity ${g.headMax} (limit ${g.limit})${wasText(g, `, was ${g.baseMax}`)}.`;
  if (g.rule.id === 'sonarjs/expression-complexity') {
    return `${fn} has an expression with ${g.headMax} conditional operators (limit ${g.limit})${wasText(g, `, most before ${g.baseMax}`)}.`;
  }
  return `${fn}: ${g.rule.what} in ${g.hits.length} place(s)${wasText(g, `, was ${g.beforeCount}`)}.`;
}

function wasText(g: SizeGroup, changed: string): string {
  if (g.how === 'new') return ' (new code)';
  if (g.how === 'uncompared') return ' (not compared)';
  return changed;
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
