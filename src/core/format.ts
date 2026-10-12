/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
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
 * The report as JSON text, in pieces: one run of pieces per specification, so a result with very many failing
 * elements is never built as one enormous string. Joined, the pieces are one JSON document holding every failing
 * element: from memory, or, for a result made in the worker, from the blobs it put them in. What the page lists
 * (`groups`, `notListed`) is a view of the elements and is not part of the report.
 */
export function reportParts(result: RunResult): BlobPart[] {
  const { specs, spilled, ...rest } = result;
  const head = JSON.stringify(rest, null, 2).replace(/\n\}$/, '');
  const parts: BlobPart[] = [`${head},\n  "specs": [`];
  specs.forEach((s, i) => {
    const { failures, groups: _groups, notListed: _notListed, ...others } = s;
    const own = spilled?.[i];
    const start = `${i ? ',' : ''}\n${JSON.stringify(others).slice(0, -1)},"failures":[`;
    if (own) parts.push(start, ...own.failures, ']}');
    else parts.push(`${start}${failures.map((f) => JSON.stringify(f)).join(',')}]}`);
  });
  parts.push('\n  ]\n}\n');
  return parts;
}
