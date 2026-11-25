import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AcceptedFinding, Finding } from '../report/types.ts';
import { ConfigError, tangleHome } from './config.ts';

/** One accepted finding; `rule` and `where` come from the newest report that had the id, for a reader of the file. */
export interface AcceptedEntry {
  readonly reason: string;
  readonly acceptedAt: string;
  readonly rule?: string;
  readonly where?: string;
}

export type Accepted = ReadonlyMap<string, AcceptedEntry>;

export const ID_PATTERN = /^tg-[0-9a-f]{10}$/;

/** Reports searched for an id's rule and place, newest first. */
const REPORTS_SEARCHED = 20;

export function acceptedFile(key: string): string {
  return path.join(tangleHome(), 'repos', `${key}.accepted.json`);
}

/** The repo's accepted findings; empty when it has none. */
export function loadAccepted(key: string): Accepted {
  const file = acceptedFile(key);
  if (!existsSync(file)) return new Map();
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new ConfigError(`${file}: not valid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ConfigError(`${file}: expected a JSON object keyed by finding id`);
  const out = new Map<string, AcceptedEntry>();
  for (const [id, entry] of Object.entries(raw)) {
    if (!ID_PATTERN.test(id)) throw new ConfigError(`${file}: ${id} is not a finding id`);
    out.set(id, entryOf(entry, `${file}: ${id}`));
  }
  return out;
}

function entryOf(raw: unknown, where: string): AcceptedEntry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ConfigError(`${where} must be an object`);
  const e = raw as Record<string, unknown>;
  if (typeof e['reason'] !== 'string' || e['reason'].trim() === '') throw new ConfigError(`${where} needs a reason`);
  if (typeof e['acceptedAt'] !== 'string') throw new ConfigError(`${where} needs acceptedAt`);
  for (const k of ['rule', 'where'] as const) {
    if (e[k] !== undefined && typeof e[k] !== 'string') throw new ConfigError(`${where}: ${k} must be a string`);
  }
  return e as unknown as AcceptedEntry;
}

/** Records the ids with the reason, replacing an earlier reason for the same id. */
export function accept(key: string, ids: readonly string[], reason: string, now: Date): void {
  const all = new Map(loadAccepted(key));
  const seen = lastSeen(key, new Set(ids));
  for (const id of ids) {
    // Without a recent report, keep the label an earlier acceptance stored.
    const label = seen.get(id) ?? all.get(id);
    all.set(id, { reason, acceptedAt: now.toISOString(), ...(label?.rule === undefined ? {} : { rule: label.rule, where: label.where }) });
  }
  save(key, all);
}

/** Drops the ids; returns the ones that were not accepted, and then changes nothing. */
export function unaccept(key: string, ids: readonly string[]): string[] {
  const all = new Map(loadAccepted(key));
  const missing = ids.filter((id) => !all.has(id));
  if (missing.length > 0) return missing;
  for (const id of ids) all.delete(id);
  save(key, all);
  return [];
}

function save(key: string, all: Accepted): void {
  const file = acceptedFile(key);
  mkdirSync(path.dirname(file), { recursive: true });
  const sorted = Object.fromEntries([...all].toSorted(([a], [b]) => a.localeCompare(b)));
  // Written aside and renamed, so an interrupted write never leaves half a file.
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(sorted, null, 2)}\n`);
  renameSync(tmp, file);
}

/** The newest finding with each id among the repo's recent reports under `<home>/runs/<key>`. */
function lastSeen(key: string, ids: ReadonlySet<string>): Map<string, Finding> {
  const out = new Map<string, Finding>();
  const runs = path.join(tangleHome(), 'runs', key);
  if (!existsSync(runs)) return out;
  // Run folders are named by their start time, so names sort by age.
  const newest = readdirSync(runs).toSorted().toReversed().slice(0, REPORTS_SEARCHED);
  for (const run of newest) {
    for (const f of reportFindings(path.join(runs, run, 'report.json'))) {
      if (ids.has(f.id) && !out.has(f.id)) out.set(f.id, f);
    }
    if (out.size === ids.size) break;
  }
  return out;
}

function reportFindings(file: string): Finding[] {
  try {
    const report = JSON.parse(readFileSync(file, 'utf8')) as { findings?: unknown; accepted?: unknown };
    return [report.findings, report.accepted].filter((list) => Array.isArray(list)).flat() as Finding[];
  } catch {
    return [];
  }
}

/** Splits findings into the ones still reported and the accepted ones, each with its reason. */
export function partition(findings: readonly Finding[], accepted: Accepted): { findings: Finding[]; accepted: AcceptedFinding[] } {
  const kept: Finding[] = [];
  const moved: AcceptedFinding[] = [];
  for (const f of findings) {
    const entry = accepted.get(f.id);
    if (entry) moved.push({ ...f, reason: entry.reason, acceptedAt: entry.acceptedAt });
    else kept.push(f);
  }
  return { findings: kept, accepted: moved };
}

