import { LineRange } from './ranges.ts';
import type { ChangedFile, LineRange as Range } from './types.ts';

/**
 * Reads `git diff -U0 -M` output into changed files with the added or modified line ranges of the
 * new file. Deleted files, pure deletions and binary files are left out.
 */
export function parseDiff(text: string): ChangedFile[] {
  const files: FileDiff[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const path = headerPath(line.slice('diff --git '.length));
      files.push({ path, oldPath: path, added: false, skip: false, renamed: false, inHunks: false, ranges: [] });
    } else if (files.length > 0) {
      readLine(files.at(-1)!, line);
    }
  }
  return files.flatMap((f) => changedFile(f) ?? []);
}

/** One file's section of the diff while it is read. `skip` marks deleted and binary files. */
interface FileDiff {
  path: string;
  oldPath: string;
  added: boolean;
  skip: boolean;
  renamed: boolean;
  inHunks: boolean;
  ranges: Range[];
}

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

function readLine(f: FileDiff, line: string): void {
  const hunk = HUNK.exec(line);
  if (hunk) {
    f.inHunks = true;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (count > 0) f.ranges.push(LineRange.of(start, start + count - 1));
    return;
  }
  // Inside hunks, every line is content, even one that reads like a header.
  if (!f.inHunks) readHeaderLine(f, line);
}

function readHeaderLine(f: FileDiff, line: string): void {
  if (line.startsWith('new file mode')) f.added = true;
  else if (line.startsWith('deleted file mode') || line.startsWith('Binary files ')) f.skip = true;
  else if (line.startsWith('rename from ')) {
    f.renamed = true;
    f.oldPath = unquote(line.slice('rename from '.length));
  } else if (line.startsWith('rename to ')) f.path = unquote(line.slice('rename to '.length));
  else if (line.startsWith('+++ ') && line !== '+++ /dev/null') f.path = stripPrefix(unquote(line.slice('+++ '.length)), 'b/');
}

function changedFile(f: FileDiff): ChangedFile | undefined {
  if (f.skip) return undefined;
  if (f.added) return { path: f.path, status: 'added', ranges: 'whole' };
  if (f.renamed) return { path: f.path, status: 'renamed', oldPath: f.oldPath, ranges: LineRange.merge(f.ranges) };
  if (f.ranges.length === 0) return undefined;
  return { path: f.path, status: 'modified', ranges: LineRange.merge(f.ranges) };
}

/**
 * The b/ path of a `diff --git` header. Only an empty added file relies on it; every other file is
 * named again by its `+++` or `rename to` line. Both sides are the same path then, so a quoted header
 * is two quoted tokens and an unquoted one splits in the middle, spaces and all.
 */
function headerPath(rest: string): string {
  if (rest.startsWith('"')) return stripPrefix(unquote(rest.slice(closingQuote(rest, 0) + 2)), 'b/');
  return stripPrefix(rest.slice((rest.length - 1) / 2 + 1), 'b/');
}

function closingQuote(s: string, open: number): number {
  for (let i = open + 1; i < s.length; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === '"') return i;
  }
  return s.length - 1;
}

function stripPrefix(p: string, prefix: string): string {
  return p.startsWith(prefix) ? p.slice(prefix.length) : p;
}

const ESCAPES: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };

/** Decodes git's C-style quoting: `"caf\303\251.ts"` → `café.ts`. Unquoted input is returned as is. */
export function unquote(p: string): string {
  if (!(p.length >= 2 && p.startsWith('"') && p.endsWith('"'))) return p;
  const bytes: number[] = [];
  const body = p.slice(1, -1);
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch !== '\\') {
      bytes.push(...Buffer.from(ch, 'utf8'));
      continue;
    }
    const next = body[i + 1] ?? '';
    const octal = /^[0-7]{3}/.exec(body.slice(i + 1));
    if (octal) {
      bytes.push(Number.parseInt(octal[0], 8));
      i += 3;
    } else {
      bytes.push(ESCAPES[next] ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return Buffer.from(bytes).toString('utf8');
}
