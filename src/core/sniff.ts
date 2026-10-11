// Which of the two inputs a file is, from what it holds, so that it does not matter where it was dropped.
export type FileKind = 'ids' | 'ifc';

/**
 * `head` is the start of the file as text. An IFC model in STEP form and an XML file whose root is <ids> are
 * recognised by content. Anything else goes where the person put it (`hint`), or by its extension.
 */
export function kindOfFile(name: string, head: string, hint?: FileKind): FileKind {
  const t = head.replace(/^﻿/, '').replace(/^ï»¿/, '').trimStart();
  if (t.startsWith('ISO-10303-21')) return 'ifc';
  if (/^(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<(?:[A-Za-z_][\w.-]*:)?ids[\s>]/.test(t)) return 'ids';
  if (hint) return hint;
  return /\.(ifc|ifczip|ifcxml|zip)$/i.test(name) ? 'ifc' : 'ids';
}
