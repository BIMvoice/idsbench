import type { RunResult } from './types';

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function reportFileName(ifcName: string): string {
  return `${ifcName.replace(/\.ifc$/i, '') || 'model'}-ids-report.json`;
}

/**
 * The report as JSON text, in pieces: one per specification, so a result with
 * very many failing elements is never built as one enormous string. Joined,
 * the pieces are one JSON document holding every failing element.
 */
export function reportParts(result: RunResult): string[] {
  const { specs, ...rest } = result;
  const head = JSON.stringify(rest, null, 2).replace(/\n\}$/, '');
  const parts = [`${head},\n  "specs": [`];
  specs.forEach((s, i) => parts.push(`${i ? ',' : ''}\n${JSON.stringify(s)}`));
  parts.push('\n  ]\n}\n');
  return parts;
}
