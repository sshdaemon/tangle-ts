import type { ChangedFile, TriageDecision } from './types.ts';

/** Paths that hold no logic worth checking. Regexes on the repo-relative path. */
export const DEFAULT_SKIP: readonly string[] = [String.raw`\.d\.ts$`, '(^|/)migrations/', '(^|/)__generated__/', String.raw`\.stories\.tsx?$`];

export const SPEC_PATTERN = /\.(spec|test|e2e-spec)\.tsx?$/;

/** `bugRules`: specs get only the bug rules; `skip`: specs are dropped; `all`: specs get every rule. */
export type SpecMode = 'bugRules' | 'skip' | 'all';

export function triage(files: readonly ChangedFile[], skip: readonly string[], specs: SpecMode): TriageDecision[] {
  const patterns = skip.map((s) => new RegExp(s));
  return files.map((file) => {
    if (!/\.(ts|tsx|mts|cts)$/.test(file.path)) return { file, kept: false, sizeRules: false, reason: 'not a TypeScript file' };
    const hit = patterns.find((p) => p.test(file.path));
    if (hit) return { file, kept: false, sizeRules: false, reason: `matches skip pattern ${hit.source}` };
    if (SPEC_PATTERN.test(file.path)) {
      if (specs === 'skip') return { file, kept: false, sizeRules: false, reason: 'spec file (specs: skip)' };
      return { file, kept: true, sizeRules: specs === 'all', reason: '' };
    }
    return { file, kept: true, sizeRules: true, reason: '' };
  });
}
