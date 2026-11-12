import { execFileSync } from 'node:child_process';
import path from 'node:path';

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitError';
  }
}

export function git(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr?.trim();
    throw new GitError(`git ${args.join(' ')} failed in ${cwd}${stderr ? `: ${stderr}` : ''}`);
  }
}

export function repoRoot(dir: string): string {
  return git(dir, ['rev-parse', '--show-toplevel']).trim();
}

/**
 * Names the repo for settings lookup: the origin remote's name, so worktrees share the main
 * checkout's settings; the main checkout's folder name when there is no remote.
 */
export function repoKey(root: string): string {
  try {
    const url = git(root, ['remote', 'get-url', 'origin']).trim();
    const name = url.replace(/\/+$/, '').split(/[/:]/).pop()?.replace(/\.git$/, '');
    if (name) return name;
  } catch {
    // no origin remote
  }
  const common = path.resolve(root, git(root, ['rev-parse', '--git-common-dir']).trim());
  return path.basename(path.basename(common) === '.git' ? path.dirname(common) : common);
}

export function mergeBase(root: string, base: string, head: string): string {
  return git(root, ['merge-base', base, head]).trim();
}

/** The file's content at a commit, or undefined when it does not exist there. */
export function showFile(root: string, commit: string, file: string): string | undefined {
  try {
    return execFileSync('git', ['show', `${commit}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return undefined;
  }
}

export function untrackedFiles(root: string): string[] {
  return git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
}
