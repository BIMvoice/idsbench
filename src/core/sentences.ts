/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Each specification of an IDS file in words, for the CSV a coordinator sends to the people who model: the column
// "Requirement" says what was asked, in the same sentence the page shows beside the specification.
import type { IfcVersion, SchemaData } from '@idsbench/check/ifc';
import { IFC_VERSIONS } from './ids/model';
import { readIdsText, browserEnv, type XmlEnv } from './ids/read';
import { describeSpecification } from './ids/words';
import { familyOf } from './subtypes';

/** The specifications of an IDS text in words, in file order; null when the text does not open in the forms (the column is then left empty). */
export async function sentencesFor(idsXml: string, env: XmlEnv = browserEnv): Promise<string[] | null> {
  let doc;
  try { doc = readIdsText(idsXml, env); } catch { return null; }
  try {
    // The tables are fetched only when there is a specification to put in words: the first paint of the page loads none.
    const { loadSchema } = await import('@idsbench/check/ifc');
    const tables = new Map<IfcVersion, SchemaData>();
    const versionsOf = (listed: string[]): IfcVersion[] => { const known = IFC_VERSIONS.filter((v) => listed.includes(v)); return known.length ? [...known] : ['IFC4']; };
    for (const v of new Set(doc.specifications.flatMap((s) => versionsOf(s.ifcVersion)))) tables.set(v, await loadSchema(v));
    return doc.specifications.map((s) => {
      const mine = versionsOf(s.ifcVersion).map((v) => tables.get(v)!);
      return describeSpecification(s, { className: (u) => mine.map((t) => t.classes.get(u)?.name).find(Boolean), family: familyOf(s, mine) }).text;
    });
  } catch (e) {
    console.error('specification sentences skipped', e);
    return null;
  }
}
