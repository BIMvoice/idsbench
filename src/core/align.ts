// The result of a run lists its specifications in the order of the file that was run. The page shows each beside the
// specification of the document it belongs to, and it only does so after checking that the two lists are the same
// list: the same number of specifications, with the same names in the same order.
import type { Specification } from './ids/model';
import type { RunResult, SpecRow } from './types';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The result row of each specification, in document order; null when the result is not of these specifications. */
export function alignResults(specifications: Pick<Specification, 'name'>[], result: Pick<RunResult, 'specs'>): SpecRow[] | null {
  if (result.specs.length !== specifications.length) return null;
  for (let i = 0; i < specifications.length; i++) {
    const own = norm(specifications[i].name), theirs = norm(result.specs[i].name);
    // The run names a specification without a name "(unnamed specification)".
    if (own !== theirs && !(own === '' && theirs === '(unnamed specification)')) return null;
  }
  return result.specs;
}

export const NOT_ALIGNED = 'The result could not be matched to the specifications on this page, so no state is shown beside them. Run again; if it stays, the downloaded report holds the result as the engine gave it.';

export type DroppedKind = 'ids' | 'ifc' | 'folder';
/**
 * Of the things dropped or chosen at once, which IDS file and which model are taken, and a sentence about the rest:
 * the page holds one IDS file and one model, so a second of either is named as not taken, never dropped silently,
 * and a folder is named as a folder.
 */
export function chooseDropped<T extends { name: string }>(items: { file: T; kind: DroppedKind }[]): { ids: T | null; ifc: T | null; left: string | null } {
  const of = (k: DroppedKind) => items.filter((i) => i.kind === k).map((i) => i.file);
  const ids = of('ids'), ifc = of('ifc'), folders = of('folder');
  const parts: string[] = [];
  const names = (l: T[]) => l.map((f) => f.name).join(', ');
  if (folders.length) parts.push(`${names(folders)} ${folders.length === 1 ? 'is a folder' : 'are folders'}: drop the IDS file and the model themselves, not the folder they are in.`);
  if (ids.length > 1) parts.push(`${ids.length} IDS files arrived together. ${ids[0].name} was opened; ${names(ids.slice(1))} ${ids.length === 2 ? 'was' : 'were'} not. The page holds one IDS file at a time.`);
  if (ifc.length > 1) parts.push(`${ifc.length} models arrived together. ${ifc[0].name} was taken; ${names(ifc.slice(1))} ${ifc.length === 2 ? 'was' : 'were'} not. The page checks one model at a time.`);
  return { ids: ids[0] ?? null, ifc: ifc[0] ?? null, left: parts.length ? parts.join(' ') : null };
}
