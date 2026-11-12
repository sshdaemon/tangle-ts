import { parseDiff } from '../change/diff.ts';
import { WORKING_TREE } from '../change/types.ts';
import type { ChangeList } from '../change/types.ts';
import { git, mergeBase, untrackedFiles } from './git.ts';

/**
 * The change of a checkout against `base`: committed work since the merge base, plus staged,
 * unstaged and untracked work unless `committedOnly`.
 */
export function changeListFromGit(root: string, base: string, committedOnly: boolean): ChangeList {
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  const mb = mergeBase(root, base, head);
  const args = ['diff', '-U0', '-M', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', mb];
  const files = parseDiff(git(root, ['-c', 'core.quotePath=false', ...(committedOnly ? [...args, head] : args)]));
  if (!committedOnly) {
    const known = new Set(files.map((f) => f.path));
    for (const p of untrackedFiles(root)) if (!known.has(p)) files.push({ path: p, status: 'added', ranges: 'whole' });
  }
  return { repo: root, base, head: committedOnly ? head : WORKING_TREE, files };
}
