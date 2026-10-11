import type { IdsDocument } from '../../core/ids/model';

export const DRAFT_KEY = 'idsbench.write.draft';
export interface Draft { doc: IdsDocument; fileName: string | null; savedXml: string }

/** The draft lives in sessionStorage only: it goes when the tab closes and is never sent anywhere. */
export function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d || !d.doc || !Array.isArray(d.doc.specifications) || typeof d.savedXml !== 'string') return null;
    return d;
  } catch { return null; }
}
export function saveDraft(d: Draft | null) {
  try { if (d) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); else sessionStorage.removeItem(DRAFT_KEY); } catch { /* storage may be blocked; the page works without it */ }
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
