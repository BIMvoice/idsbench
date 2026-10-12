/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AppError } from './errors';

export const IDS_NAMESPACE = 'http://standards.buildingsmart.org/IDS';
const SWAPPED = 'Put the IDS file in the IDS box and the model in the IFC box.';

const ROOT = /<(?:([A-Za-z_][\w.-]*):)?ids(?=[\s>/])([^>]*)>/;

/**
 * Checks on the text of the file, before the Check engine: an empty file, and
 * an IFC model in the IDS box (Run's own wording says how to put them right).
 */
export function precheckIdsText(text: string): void {
  const t = text.replace(/^﻿/, '').trimStart();
  if (t === '') {
    throw new AppError('ids-empty', 'The IDS file is empty. Export or save it again and choose the new file.');
  }
  if (t.startsWith('ISO-10303-21')) {
    throw new AppError('ids-is-ifc', `This is an IFC model, not an IDS file. ${SWAPPED}`);
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
