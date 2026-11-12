import type { Report } from './types.ts';

export function renderMarkdown(r: Report): string {
  const lines: string[] = [`# tangle report`, ``, `Repo: ${r.repo}  `, `Run: ${r.createdAt}  `, `Command: \`${r.command}\`  `];
  lines.push(r.base ? `Compared with: ${r.base.ref} (${r.base.commit.slice(0, 12)})` : `Compared with: nothing (every hit in range is reported)`, ``);
  lines.push(`Checked ${r.checked.length} file(s) in ${(r.durationMs / 1000).toFixed(1)}s.`, ``);
  if (r.warnings.length > 0) lines.push(`## Warnings`, ``, ...r.warnings.map((w) => `- ${w}`), ``);
  if (r.dropped.length > 0) lines.push(`## Skipped`, ``, ...r.dropped.map((d) => `- ${d.path}: ${d.reason}`), ``);
  lines.push(`## Findings (${r.findings.length})`, ``);
  if (r.findings.length === 0) lines.push(`None.`);
  const byFile = new Map<string, Report['findings'][number][]>();
  for (const f of r.findings) {
    const file = f.where.replace(/:\d+:\d+$/, '');
    byFile.set(file, [...(byFile.get(file) ?? []), f]);
  }
  for (const [file, list] of byFile) {
    lines.push(`### ${file}`, ``);
    for (const f of list) lines.push(`- ${f.where.slice(file.length + 1)} [${f.severity}] ${f.claim} (\`${f.rule}\`, ${f.id})`);
    lines.push(``);
  }
  return lines.join('\n');
}
