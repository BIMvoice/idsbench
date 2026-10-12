/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { checkDocument } from '../../core/ids/check';
import type { IdsDocument } from '../../core/ids/model';
import { describeSpecification } from '../../core/ids/words';
import { writeIds } from '../../core/ids/write';

export const DRAFT_KEY = 'idsbench.write.draft';
export interface Draft {
  doc: IdsDocument;
  fileName: string | null;
  savedXml: string;
  /**
   * The opened file the changes were made to, so that after a reload the parts that were not changed are still
   * written as the file has them. `specUids` are the ids the page gave the file's specifications, in file order.
   */
  source?: { text: string; specUids: string[]; bom: boolean };
  /** The name of the model that was loaded. The model itself is not kept: it has to be chosen again. */
  model?: string | null;
}

/** True when everything the page does with a document on every render works on this one: it is a document, not just JSON. */
function usable(d: Draft): boolean {
  if (!d || typeof d !== 'object' || !d.doc || !d.doc.info || typeof d.doc.info.title !== 'string') return false;
  if (!Array.isArray(d.doc.specifications) || typeof d.savedXml !== 'string') return false;
  if (d.fileName !== null && typeof d.fileName !== 'string') return false;
  for (const s of d.doc.specifications) {
    if (!s || typeof s.uid !== 'string' || typeof s.name !== 'string' || !Array.isArray(s.ifcVersion) || !Array.isArray(s.applicability) || !Array.isArray(s.requirements)) return false;
    if (typeof s.minOccurs !== 'string' || typeof s.maxOccurs !== 'string') return false;
    for (const f of [...s.applicability, ...s.requirements]) if (!f || typeof f.uid !== 'string' || typeof f.kind !== 'string') return false;
  }
  try {
    writeIds(d.doc);
    checkDocument(d.doc);
    d.doc.specifications.forEach((s) => describeSpecification(s));
  } catch { return false; }
  if (d.source !== undefined && (typeof d.source?.text !== 'string' || !Array.isArray(d.source.specUids))) return false;
  return true;
}

/**
 * The draft lives in sessionStorage only: it goes when the tab closes and is never sent anywhere. What is stored may
 * come from an older build of the page or be damaged; it is used only when it is a whole document, and otherwise the
 * caller is told there was one that could not be read (`unreadable`), so the loss is said and not silent.
 */
export function loadDraft(): { draft: Draft | null; unreadable: boolean } {
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(DRAFT_KEY); } catch { /* storage may be blocked; the page works without it */ }
  if (!raw) return { draft: null, unreadable: false };
  try {
    const d = JSON.parse(raw) as Draft;
    if (usable(d)) return { draft: d, unreadable: false };
  } catch { /* not JSON */ }
  // Reading changes nothing: the page removes what is stored when it next stores (or clears) the draft.
  return { draft: null, unreadable: true };
}

/**
 * Stores the draft, or removes it. Returns false when it could not be stored (the browser's limit for one tab is a few
 * megabytes): an older draft is then removed, never left behind to be restored as if it were the latest.
 */
export function saveDraft(d: Draft | null): boolean {
  try {
    if (!d) { sessionStorage.removeItem(DRAFT_KEY); return true; }
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); return true; } catch { /* too large with the opened text: try without it */ }
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, source: undefined })); return true; } catch { /* still too large */ }
    sessionStorage.removeItem(DRAFT_KEY);
    return false;
  } catch { return false; }
}

export function saveFile(parts: BlobPart[], name: string, type: string) {
  const url = URL.createObjectURL(new Blob(parts, { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
