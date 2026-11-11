/** Inclusive line range in one file, written `file.ts:12-40`. */
export interface LineRange {
  readonly start: number;
  readonly end: number;
}

export type FileStatus = 'added' | 'modified' | 'renamed';

/** A file in the change. `ranges` are lines of the new file, or `'whole'`. */
export interface ChangedFile {
  /** Repo-relative, forward slashes. */
  readonly path: string;
  readonly status: FileStatus;
  /** The path at `base`, for a renamed file. */
  readonly oldPath?: string;
  readonly ranges: readonly LineRange[] | 'whole';
}

/** `head` value meaning the files as they are on disk, uncommitted work included. */
export const WORKING_TREE = 'working-tree';

/** The change list file shared with weakspot-ts: the same JSON shape, read by both tools. */
export interface ChangeList {
  /** Absolute path of the repo root. */
  readonly repo: string;
  /** The ref the change is compared against. The before version of a file is read at merge-base(base, head). */
  readonly base: string;
  /** Where the files and ranges come from: a commit, or `working-tree` (merge base then taken from HEAD). */
  readonly head: string;
  readonly files: readonly ChangedFile[];
}

export interface TriageDecision {
  readonly file: ChangedFile;
  readonly kept: boolean;
  /** False for files where only the bug rules apply (specs, by default). */
  readonly sizeRules: boolean;
  /** Why the file was dropped; empty when kept. */
  readonly reason: string;
}
