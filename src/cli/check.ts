import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { triage } from '../change/triage.ts';
import { WORKING_TREE, type ChangeList } from '../change/types.ts';
import { analyze, type FileInput, type FileVersion } from '../check/analyze.ts';
import { functionsOf, lineStartsOf } from '../check/functions.ts';
import { defaultOxlintBin, oxlintConfig, runOxlint, type Diagnostic } from '../check/oxlint.ts';
import { RULES } from '../check/rules.ts';
import { renderMarkdown } from '../report/render.ts';
import type { Report } from '../report/types.ts';
import type { ToolConfig } from './config.ts';
import { git, mergeBase, showFile } from './git.ts';

export interface CheckInput {
  readonly list: ChangeList;
  readonly repoKey: string;
  readonly config: ToolConfig;
  /** Compare with the file at merge-base(base, head); false reports every hit in range. */
  readonly compare: boolean;
  readonly out: string;
  readonly command: string;
  readonly version: string;
  readonly log: (line: string) => void;
  readonly signal?: AbortSignal;
}

/**
 * Lints the change's files at the list's head (the files on disk for `working-tree`, otherwise that
 * commit's content) and their before versions, then writes the report.
 */
export async function check(input: CheckInput): Promise<Report> {
  const started = Date.now();
  const { list, config, log } = input;
  const root = list.repo;
  const warnings: string[] = [];
  const decisions = triage(list.files, config.skip, config.specs);
  const dropped = decisions.filter((d) => !d.kept).map((d) => ({ path: d.file.path, reason: d.reason }));
  const onDisk = list.head === WORKING_TREE;
  const headCommit = onDisk ? undefined : git(root, ['rev-parse', '--verify', `${list.head}^{commit}`]).trim();
  const base: Report['base'] = input.compare ? { ref: list.base, commit: mergeBase(root, list.base, headCommit ?? 'HEAD') } : null;

  // Real path, so the file names oxlint reports match the ones we pass.
  const tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tangle-')));
  try {
    const configPath = path.join(tmp, 'oxlint.json');
    writeFileSync(configPath, JSON.stringify(oxlintConfig(RULES, config.thresholds)));
    const headRoot = onDisk ? root : path.join(tmp, 'head');
    const kept = decisions.filter((d) => {
      if (!d.kept) return false;
      if (onDisk) {
        if (existsSync(path.join(root, d.file.path))) return true;
        warnings.push(`${d.file.path} is in the change list but not in the working tree`);
        return false;
      }
      const text = showFile(root, headCommit!, d.file.path);
      if (text === undefined) {
        warnings.push(`${d.file.path} is in the change list but not in ${headCommit!.slice(0, 12)}`);
        return false;
      }
      writeTo(path.join(headRoot, d.file.path), text);
      return true;
    });
    const baseDir = path.join(tmp, 'base');
    const baseFiles = new Map<string, string>();
    if (base) {
      for (const d of kept) {
        if (d.file.status === 'added') continue;
        const from = d.file.oldPath ?? d.file.path;
        const text = showFile(root, base.commit, from);
        if (text === undefined) continue;
        const abs = path.join(baseDir, d.file.path);
        writeTo(abs, text);
        baseFiles.set(d.file.path, abs);
      }
    }
    const bin = config.oxlint ?? defaultOxlintBin();
    const headPaths = kept.map((d) => path.join(headRoot, d.file.path));
    log(`linting ${headPaths.length} file(s) and ${baseFiles.size} before version(s)`);
    const [headLint, baseLint] = await Promise.all([
      runOxlint(bin, configPath, headRoot, headPaths, input.signal),
      runOxlint(bin, configPath, baseDir, [...baseFiles.values()], input.signal),
    ]);
    const byFile = (diags: Diagnostic[]) => {
      const m = new Map<string, Diagnostic[]>();
      for (const d of diags) m.set(d.file, [...(m.get(d.file) ?? []), d]);
      return m;
    };
    const headBy = byFile(headLint.diagnostics);
    const baseBy = byFile(baseLint.diagnostics);
    const headUnparsed = new Set(headLint.unparsed);
    const baseUnparsed = new Set(baseLint.unparsed);
    const inputs: FileInput[] = kept.flatMap((d): FileInput[] => {
      const abs = path.join(headRoot, d.file.path);
      if (headUnparsed.has(abs)) {
        warnings.push(`${d.file.path} did not parse; not checked`);
        return [];
      }
      const baseAbs = baseFiles.get(d.file.path);
      const baseBroken = baseAbs !== undefined && baseUnparsed.has(baseAbs);
      if (baseBroken) warnings.push(`${d.file.path} did not parse at ${base!.commit.slice(0, 12)}; reported without comparing`);
      return [
        {
          file: d.file,
          sizeRules: d.sizeRules,
          compared: base !== null && !baseBroken,
          head: version(abs, headBy.get(abs) ?? []),
          ...(baseAbs && !baseBroken ? { base: version(baseAbs, baseBy.get(baseAbs) ?? []) } : {}),
        },
      ];
    });
    const findings = analyze(inputs, { thresholds: config.thresholds, raiseAt: config.raiseAt, repoKey: input.repoKey });
    const report: Report = {
      tool: 'tangle-ts',
      version: input.version,
      createdAt: new Date().toISOString(),
      repo: root,
      command: input.command,
      base,
      checked: inputs.map((i) => i.file.path),
      dropped,
      warnings,
      durationMs: Date.now() - started,
      findings,
    };
    mkdirSync(input.out, { recursive: true });
    writeFileSync(path.join(input.out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(path.join(input.out, 'report.md'), renderMarkdown(report));
    return report;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function writeTo(abs: string, text: string): void {
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, text);
}

function version(abs: string, diagnostics: Diagnostic[]): FileVersion {
  const text = readFileSync(abs, 'utf8');
  return { text, lineStarts: lineStartsOf(text), functions: functionsOf(abs, text), diagnostics };
}
