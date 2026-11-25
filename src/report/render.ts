import type { Finding, Report } from './types.ts';

export function renderMarkdown(r: Report): string {
  const lines: string[] = [`# tangle report`, ``, `Repo: ${r.repo}  `, `Run: ${r.createdAt}  `, `Command: \`${r.command}\`  `];
  lines.push(r.base ? `Compared with: ${r.base.ref} (${r.base.commit.slice(0, 12)})` : `Compared with: nothing (every hit in range is reported)`, ``);
  lines.push(`Checked ${r.checked.length} file(s) in ${(r.durationMs / 1000).toFixed(1)}s.`, ``);
  if (r.warnings.length > 0) lines.push(`## Warnings`, ``, ...r.warnings.map((w) => `- ${w}`), ``);
  if (r.dropped.length > 0) lines.push(`## Skipped`, ``, ...r.dropped.map((d) => `- ${d.path}: ${d.reason}`), ``);
  lines.push(`## Findings (${r.findings.length})`, ``);
  if (r.findings.length === 0) lines.push(`None.`, ``);
  for (const [file, list] of byFile(r.findings)) {
    lines.push(`### ${file}`, ``);
    for (const f of list) lines.push(`- ${f.where.slice(file.length + 1)} [${f.severity}] ${f.claim} (\`${f.rule}\`, ${f.id})`);
    lines.push(``);
  }
  if (r.accepted.length > 0) {
    lines.push(`## Accepted (${r.accepted.length})`, ``);
    for (const f of r.accepted) lines.push(`- ${f.where} ${f.claim} (\`${f.rule}\`, ${f.id}): ${f.reason}`);
    lines.push(``);
  }
  return lines.join('\n');
}

function byFile<T extends Finding>(findings: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const f of findings) {
    const file = f.where.replace(/:\d+:\d+$/, '');
    out.set(file, [...(out.get(file) ?? []), f]);
  }
  return out;
}
