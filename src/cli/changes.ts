import { parseDiff } from '../change/diff.ts';
import { WORKING_TREE } from '../change/types.ts';
import type { ChangeList } from '../change/types.ts';
import { git, mergeBase, untrackedFiles } from './git.ts';

/**
 * The change against `base`: committed work since the merge base, plus staged, unstaged and
 * untracked work unless `committedOnly`. With `headRef`, the change is that commit's, whatever is
 * checked out.
 */
export function changeListFromGit(root: string, base: string, committedOnly: boolean, headRef?: string): ChangeList {
  const committed = committedOnly || headRef !== undefined;
  const head = git(root, ['rev-parse', '--verify', `${headRef ?? 'HEAD'}^{commit}`]).trim();
  const mb = mergeBase(root, base, head);
  const args = ['diff', '-U0', '-M', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', mb];
  const files = parseDiff(git(root, ['-c', 'core.quotePath=false', ...(committed ? [...args, head] : args)]));
  if (!committed) {
    const known = new Set(files.map((f) => f.path));
    for (const p of untrackedFiles(root)) if (!known.has(p)) files.push({ path: p, status: 'added', ranges: 'whole' });
  }
  return { repo: root, base, head: committed ? head : WORKING_TREE, files };
}

/** Set when `head` is already in `base`, so the change is empty: usually a merged commit checked without `--base <sha>^`. */
export function alreadyInBase(root: string, list: ChangeList): string | undefined {
  if (list.head === WORKING_TREE || mergeBase(root, list.base, list.head) !== list.head) return undefined;
  return `${list.head.slice(0, 12)} is already in ${list.base}, so there is nothing to check; for a merged commit use --base <sha>^ --head <sha>`;
}
