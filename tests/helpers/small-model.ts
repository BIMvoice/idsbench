/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Small IFC models and IDS files written as text, and the run the page makes, for tests that need a result.
import { readIds, runValidation } from '../../src/core/validate';

export const NS = 'http://standards.buildingsmart.org/IDS';
export const line = (i: number, cls: string, name: string, extra = '$,$,$,$,$,$') => `#${i}=${cls}('${String(i).padStart(22, '0')}',$,'${name}',${extra});\n`;
export const ifcText = (body: string, schema = 'IFC4') => `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\nFILE_NAME('','2022-10-07T13:48:44',(),(),'x','x','');\nFILE_SCHEMA(('${schema}'));\nENDSEC;\nDATA;\n${body}ENDSEC;\nEND-ISO-10303-21;\n`;
export const nameIs = (v: string) => `<requirements><attribute><name><simpleValue>Name</simpleValue></name><value><simpleValue>${v}</simpleValue></value></attribute></requirements>`;
export const specXml = (name: string, cls: string, occurs = 'minOccurs="1" maxOccurs="unbounded"', requirements = '', version = 'IFC4') =>
  `<specification name="${name}" ifcVersion="${version}"><applicability ${occurs}><entity><name><simpleValue>${cls}</simpleValue></name></entity></applicability>${requirements}</specification>`;
export const idsText = (...specs: string[]) => `<?xml version="1.0"?><ids xmlns="${NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NS} http://standards.buildingsmart.org/IDS/1.0/ids.xsd"><info><title>t</title></info><specifications>${specs.join('')}</specifications></ids>`;
export const runText = (idsXml: string, model: string, extra: { rangeIds?: number; spill?: boolean; sentences?: string[] | null; collect?: boolean; compareLimit?: number } = {}) => {
  const u = new TextEncoder().encode(model);
  return runValidation({ ids: readIds(idsXml), idsName: 'a.ids', ifcBytes: u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer, ifcName: 'm.ifc', ...extra });
};
