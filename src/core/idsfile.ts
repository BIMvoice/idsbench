import { AppError } from './errors';

export const IDS_NAMESPACE = 'http://standards.buildingsmart.org/IDS';
const SWAPPED = 'Put the IDS file in the IDS box and the model in the IFC box.';

const ROOT = /<(?:([A-Za-z_][\w.-]*):)?ids(?=[\s>/])([^>]*)>/;

/** The IDS version named by the schema location, for example "0.9.6" or "1.0". Null when it names none. */
export function declaredIdsVersion(schemaLocation: string | undefined): string | null {
  if (!schemaLocation) return null;
  const dir = /\/IDS\/(\d+(?:\.\d+)+)\/ids\.xsd/i.exec(schemaLocation);
  if (dir) return dir[1];
  const file = /ids_(\d)(\d)(\d)?\.xsd/i.exec(schemaLocation);
  if (file) return [file[1], file[2], file[3]].filter(Boolean).join('.');
  return null;
}

/**
 * Checks on the text of the file, before any XML parsing. The draft-version
 * check has to come first: the library rejects some drafts for a missing part
 * and reads others as if they were IDS 1.0.
 */
export function precheckIdsText(text: string): void {
  const t = text.replace(/^﻿/, '').trimStart();
  if (t === '') {
    throw new AppError('ids-empty', 'The IDS file is empty. Export or save it again and choose the new file.');
  }
  if (t.startsWith('ISO-10303-21')) {
    throw new AppError('ids-is-ifc', `This is an IFC model, not an IDS file. ${SWAPPED}`);
  }
  const version = declaredIdsVersion(ROOT.exec(t)?.[2]);
  if (version !== null && version !== '1.0') {
    throw new AppError('ids-old-version', `This IDS file is written for IDS ${version}, an earlier draft of the standard. idsbench checks IDS 1.0 files only, and reading a draft as 1.0 could give a wrong result. Save the file as IDS 1.0 in the tool that made it.`);
  }
}

/** The namespace the root <ids> element is in, or null when it declares none. */
function rootNamespace(text: string): string | null {
  const root = ROOT.exec(text);
  if (!root) return null;
  const attr = root[1] ? `xmlns:${root[1]}` : 'xmlns';
  const m = new RegExp(`(?:^|\\s)${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(root[2]);
  return m ? (m[1] ?? m[2]) : null;
}

/**
 * Checks on a file the library has already read as XML with an <ids> root.
 * The library accepts any namespace and a file with no specifications; each
 * would otherwise run and give a result that means nothing.
 */
export function checkIdsDocument(text: string, doc: { specifications: unknown[] }): void {
  if (rootNamespace(text) !== IDS_NAMESPACE) {
    throw new AppError('ids-namespace', 'This file does not identify itself as a buildingSMART IDS file, so it was not used. Check that you chose the right file, or export it again as IDS 1.0.');
  }
  if (doc.specifications.length === 0) {
    throw new AppError('ids-no-specifications', 'The IDS file contains no specifications, so there is nothing to check. Add at least one specification to it.');
  }
}
