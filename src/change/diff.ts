import { LineRange } from './ranges.ts';
import type { ChangedFile, LineRange as Range } from './types.ts';

/**
 * Reads `git diff -U0 -M` output into changed files with the added or modified line ranges of the
 * new file. Deleted files, pure deletions and binary files are left out.
 */
export function parseDiff(text: string): ChangedFile[] {
  const out: ChangedFile[] = [];
  let cur: { path: string; oldPath: string; added: boolean; deleted: boolean; renamed: boolean; inHunks: boolean; ranges: Range[] } | undefined;
  const flush = () => {
    if (!cur || cur.deleted) return;
    if (cur.ranges.length === 0 && !cur.renamed && !cur.added) return;
    const status = cur.added ? 'added' : cur.renamed ? 'renamed' : 'modified';
    out.push({
      path: cur.path,
      status,
      ...(cur.renamed ? { oldPath: cur.oldPath } : {}),
      ranges: cur.added ? 'whole' : LineRange.merge(cur.ranges),
    });
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      flush();
      const [oldPath, newPath] = headerPaths(line.slice('diff --git '.length));
      cur = { path: newPath, oldPath, added: false, deleted: false, renamed: false, inHunks: false, ranges: [] };
      continue;
    }
    if (!cur) continue;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk) {
      cur.inHunks = true;
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      if (count > 0) cur.ranges.push(LineRange.of(start, start + count - 1));
      continue;
    }
    // Inside hunks, every line is content, even one that reads like a header.
    if (cur.inHunks) continue;
    if (line.startsWith('new file mode')) cur.added = true;
    else if (line.startsWith('deleted file mode')) cur.deleted = true;
    else if (line.startsWith('rename from ')) {
      cur.renamed = true;
      cur.oldPath = unquote(line.slice('rename from '.length));
    } else if (line.startsWith('rename to ')) cur.path = unquote(line.slice('rename to '.length));
    else if (line.startsWith('+++ ') && line !== '+++ /dev/null') cur.path = stripPrefix(unquote(line.slice('+++ '.length)), 'b/');
    else if (line.startsWith('Binary files ')) cur.deleted = true;
  }
  flush();
  return out;
}

/**
 * The a/ and b/ paths of a `diff --git` header. Either may be C-quoted. Unquoted paths may hold
 * spaces; then the header is split in the middle, which is exact for every header that is not a
 * rename, and renames are corrected by the `rename from`/`rename to` lines that follow.
 */
function headerPaths(rest: string): [string, string] {
  if (rest.startsWith('"')) {
    const end = closingQuote(rest, 0);
    const first = unquote(rest.slice(0, end + 1));
    return [stripPrefix(first, 'a/'), stripPrefix(unquote(rest.slice(end + 2)), 'b/')];
  }
  if (rest.endsWith('"')) {
    const start = rest.lastIndexOf(' "');
    return [stripPrefix(rest.slice(0, start), 'a/'), stripPrefix(unquote(rest.slice(start + 1)), 'b/')];
  }
  const half = (rest.length - 1) / 2;
  return [stripPrefix(rest.slice(0, half), 'a/'), stripPrefix(rest.slice(half + 1), 'b/')];
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
      bytes.push(parseInt(octal[0], 8));
      i += 3;
    } else {
      bytes.push(ESCAPES[next] ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return Buffer.from(bytes).toString('utf8');
}
