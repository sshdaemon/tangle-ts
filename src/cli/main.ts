import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ChangeListError, parseChangeList, serializeChangeList } from '../change/change-list.ts';
import { parseFileArg } from '../change/ranges.ts';
import { WORKING_TREE, type ChangeList } from '../change/types.ts';
import { OxlintError } from '../check/oxlint.ts';
import type { Report } from '../report/types.ts';
import { changeListFromGit } from './changes.ts';
import { check } from './check.ts';
import { ConfigError, loadConfig, tangleHome } from './config.ts';
import { GitError, repoKey, repoRoot } from './git.ts';

const USAGE = `tangle <command> [options]

Commands
  diff                          check the checkout's change against the base (committed, staged,
                                unstaged and untracked work); with --changes, the files in that list
  files <path[:start-end]>...   check the given files or line ranges; compared with --base when given
  changes                       print the change list for the checkout (the JSON --changes reads)

Options
  --repo <dir>        repo root (default: the repo around the cwd)
  --base <ref>        ref to compare with (default from config, origin/develop)
  --changes <file>    a change list file, instead of reading the diff (diff only)
  --committed         leave out uncommitted and untracked work (diff and changes)
  --out <path>        report dir (default ~/.tangle/runs/<repo>/<time>); for changes, a file to write
  --quiet             only print the final summary
`;

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export async function main(argv: string[]): Promise<number> {
  try {
    return await run(argv);
  } catch (err) {
    if (err instanceof UsageError || err instanceof ConfigError || err instanceof ChangeListError) {
      process.stderr.write(`${err.message}\n`);
      return 2;
    }
    if (err instanceof GitError || err instanceof OxlintError) {
      process.stderr.write(`${err.message}\n`);
      return 1;
    }
    if (err instanceof Error && err.message === 'interrupted') {
      process.stderr.write('interrupted\n');
      return 130;
    }
    throw err;
  }
}

interface Options {
  readonly repo?: string | undefined;
  readonly base?: string | undefined;
  readonly changes?: string | undefined;
  readonly committed?: boolean | undefined;
  readonly out?: string | undefined;
  readonly quiet?: boolean | undefined;
  readonly help?: boolean | undefined;
}

async function run(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      repo: { type: 'string' },
      base: { type: 'string' },
      changes: { type: 'string' },
      committed: { type: 'boolean' },
      out: { type: 'string' },
      quiet: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [command, ...rest] = positionals;
  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (!command) {
    process.stderr.write(USAGE);
    return 2;
  }
  checkUsage(command, rest, values);

  const fromList = values.changes ? readList(path.resolve(values.changes)) : undefined;
  const root = fromList?.repo ?? repoRoot(path.resolve(searchStart(command, rest, values)));
  const key = repoKey(root);
  const { config, source } = loadConfig(key);
  const base = values.base ?? config.base;
  if (command === 'changes') {
    writeChanges(changeListFromGit(root, base, values.committed ?? false), values.out);
    return 0;
  }
  const { list, compare } = fromList ? { list: fromList, compare: true } : listFor(command, rest, root, base, values);
  const log = values.quiet ? () => {} : (line: string) => process.stderr.write(`${line}\n`);
  log(`repo: ${root} (key ${key}, config: ${source})`);
  const out = values.out ? path.resolve(values.out) : path.join(tangleHome(), 'runs', key, new Date().toISOString().replace(/[:.]/g, '-'));
  const report = await withSignals((signal) =>
    check({ list, repoKey: key, config, compare, out, command: `tangle ${argv.join(' ')}`, version: packageVersion(), log, signal }),
  );
  process.stdout.write(`${summary(report)}\nreport: ${path.join(out, 'report.md')}\n`);
  return 0;
}

function checkUsage(command: string, rest: readonly string[], values: Options): void {
  if (!['diff', 'files', 'changes'].includes(command)) throw new UsageError(`unknown command ${command}\n${USAGE}`);
  if (command !== 'files' && rest.length > 0) throw new UsageError(`${command} takes no paths`);
  if (command === 'files' && rest.length === 0) throw new UsageError('files: give at least one path');
  if (values.changes && command !== 'diff') throw new UsageError('--changes works with diff only');
  if (values.changes && (values.base || values.committed)) throw new UsageError('--changes already names the base; drop --base and --committed');
}

/** Where to look for the repo: `--repo`, else the first file's folder for `files`, else the cwd. */
function searchStart(command: string, rest: readonly string[], values: Options): string {
  if (values.repo) return values.repo;
  if (command !== 'files') return '.';
  const first = path.resolve(parseFileArg(rest[0]!).path);
  return existsSync(first) ? path.dirname(first) : '.';
}

function writeChanges(list: ChangeList, out: string | undefined): void {
  const text = serializeChangeList(list);
  if (out) writeFileSync(path.resolve(out), text);
  else process.stdout.write(text);
}

/** The change for `diff` (from git) or `files` (the arguments; compared only when `--base` is given). */
function listFor(command: string, rest: readonly string[], root: string, base: string, values: Options): { list: ChangeList; compare: boolean } {
  if (command === 'diff') return { list: changeListFromGit(root, base, values.committed ?? false), compare: true };
  return { list: { repo: root, base, head: WORKING_TREE, files: rest.map((arg) => fileArg(root, arg)) }, compare: values.base !== undefined };
}

async function withSignals<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const interrupt = new AbortController();
  const onSignal = () => interrupt.abort();
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    return await work(interrupt.signal);
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}

function summary(report: Report): string {
  const medium = report.findings.filter((f) => f.severity === 'medium').length;
  const warn = report.warnings.length > 0 ? `, ${report.warnings.length} warning(s)` : '';
  return `${report.checked.length} file(s) checked, ${report.findings.length} finding(s) (${medium} medium)${warn}, ${(report.durationMs / 1000).toFixed(1)}s`;
}

function readList(file: string): ChangeList {
  if (!existsSync(file)) throw new UsageError(`--changes: ${file} does not exist`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new ChangeListError(`${file}: not valid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  const list = parseChangeList(raw, file);
  if (!path.isAbsolute(list.repo) || !existsSync(list.repo)) throw new ChangeListError(`${file}: repo ${list.repo} is not an existing absolute path`);
  return { ...list, repo: repoRoot(list.repo) };
}

/** A `files` argument, relative to the cwd, as a modified file of the repo. */
function fileArg(root: string, arg: string): ChangeList['files'][number] {
  const { path: p, ranges } = parseFileArg(arg);
  const abs = path.resolve(p);
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new UsageError(`${p} is outside the repo ${root}`);
  if (!existsSync(abs)) throw new UsageError(`${p} does not exist`);
  return { path: rel.split(path.sep).join('/'), status: 'modified', ranges };
}

function packageVersion(): string {
  const pkg = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
  return (JSON.parse(readFileSync(pkg, 'utf8')) as { version: string }).version;
}
