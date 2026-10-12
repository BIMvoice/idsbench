/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { describe, it, expect } from 'vitest';
import { checkIds, type CheckResult } from '../src/index.ts';
import { ids, spec, entity, sv, prop, attribute, restriction, applicability, requirements } from './helpers.ts';

const has = (r: CheckResult, code: string) => r.findings.some((f) => f.code === code && f.severity === 'error');

interface Case {
  code: string;
  /** minimal document that must raise the code */
  bad: string;
  /** near-identical document that must be valid */
  good: string;
}

const wall = entity();
const cases: Case[] = [
  {
    code: 'entity-unknown-class',
    bad: ids(spec(entity('IFCWALLL'))),
    good: ids(spec(entity('IFCWALL'))),
  },
  {
    code: 'entity-unknown-predefined-type',
    // IfcWall has USERDEFINED (which accepts anything); the alignment cant segment does not
    bad: ids(spec(entity('IFCALIGNMENTCANTSEGMENT', 'NOSUCHTYPE')), { ifc: 'IFC4X3_ADD2' }),
    good: ids(spec(entity('IFCALIGNMENTCANTSEGMENT', 'CONSTANTCANT')), { ifc: 'IFC4X3_ADD2' }),
  },
  {
    code: 'attribute-unknown',
    bad: ids(spec(wall, attribute({ name: 'NoSuchAttribute' }))),
    good: ids(spec(wall, attribute({ name: 'Name' }))),
  },
  {
    code: 'attribute-value-type-mismatch',
    bad: ids(spec(wall, attribute({ name: 'Name', value: restriction('xs:integer', '<xs:enumeration value="1"/>') }))),
    good: ids(spec(wall, attribute({ name: 'Name', value: restriction('xs:string', '<xs:enumeration value="A"/>') }))),
  },
  {
    code: 'property-reserved-prefix',
    bad: ids(spec(wall, prop({ set: 'Pset_MyOwn', name: 'X' }))),
    good: ids(spec(wall, prop({ set: 'My_Own', name: 'X' }))),
  },
  {
    code: 'property-unknown-in-standard-set',
    bad: ids(spec(wall, prop({ set: 'Pset_WallCommon', name: 'NoSuchProperty' }))),
    good: ids(spec(wall, prop({ set: 'Pset_WallCommon', name: 'FireRating' }))),
  },
  {
    code: 'property-value-not-allowed',
    bad: ids(spec(wall, prop({ set: 'Pset_WallCommon', name: 'Status', dataType: 'IFCLABEL', value: sv('BOGUS') }))),
    good: ids(spec(wall, prop({ set: 'Pset_WallCommon', name: 'Status', dataType: 'IFCLABEL', value: sv('NEW') }))),
  },
  {
    code: 'property-datatype-invalid',
    bad: ids(spec(wall, prop({ set: 'Pset_WallCommon', name: 'FireRating', dataType: 'IFCNOTATYPE' }))),
    good: ids(spec(wall, prop({ set: 'Pset_WallCommon', name: 'FireRating', dataType: 'IFCLABEL' }))),
  },
  {
    code: 'value-needs-datatype',
    bad: ids(spec(wall, prop({ set: 'Pset_WallCommon', name: 'FireRating', value: sv('EI60') }))),
    good: ids(spec(wall, prop({ set: 'Pset_WallCommon', name: 'FireRating', dataType: 'IFCLABEL', value: sv('EI60') }))),
  },
  {
    code: 'property-value-type-mismatch',
    bad: ids(spec(wall, prop({ set: 'Pset_WallCommon', name: 'ThermalTransmittance', dataType: 'IFCTHERMALTRANSMITTANCEMEASURE', value: restriction('xs:string', '<xs:enumeration value="1"/>') }))),
    good: ids(spec(wall, prop({ set: 'Pset_WallCommon', name: 'ThermalTransmittance', dataType: 'IFCTHERMALTRANSMITTANCEMEASURE', value: restriction('xs:double', '<xs:enumeration value="1"/>') }))),
  },
  {
    code: 'value-invalid-for-type',
    bad: ids(spec(wall, prop({ set: 'Pset_WallCommon', name: 'ThermalTransmittance', dataType: 'IFCTHERMALTRANSMITTANCEMEASURE', value: sv('abc') }))),
    good: ids(spec(wall, prop({ set: 'Pset_WallCommon', name: 'ThermalTransmittance', dataType: 'IFCTHERMALTRANSMITTANCEMEASURE', value: sv('0.25') }))),
  },
  {
    code: 'cardinality-needs-value',
    bad: ids(spec(wall, attribute({ name: 'Name', cardinality: 'optional' }))),
    good: ids(spec(wall, attribute({ name: 'Name', cardinality: 'optional', value: sv('A') }))),
  },
  {
    code: 'cardinality-conflicts-datatype',
    bad: ids(spec(wall, prop({ cardinality: 'prohibited', dataType: 'IFCLABEL' }))),
    good: ids(spec(wall, prop({ cardinality: 'prohibited' }))),
  },
  {
    code: 'classification-system-empty',
    bad: ids(spec(wall, '<classification><system>' + sv('') + '</system></classification>')),
    good: ids(spec(wall, '<classification><system>' + sv('Uniclass 2015') + '</system></classification>')),
  },
  {
    code: 'requirements-not-allowed',
    bad: ids(applicability(wall, 'minOccurs="0" maxOccurs="0"') + requirements(attribute())),
    good: ids(applicability(wall, 'minOccurs="0" maxOccurs="0"')),
  },
  {
    code: 'requirements-needed',
    bad: ids(applicability(wall, 'minOccurs="0" maxOccurs="unbounded"')),
    good: ids(applicability(wall, 'minOccurs="0" maxOccurs="unbounded"') + requirements(attribute())),
  },
  {
    code: 'cardinality-invalid',
    bad: ids(applicability(wall, 'minOccurs="2" maxOccurs="unbounded"')),
    good: ids(applicability(wall, 'minOccurs="1" maxOccurs="unbounded"')),
  },
  {
    code: 'applicability-requirements-incompatible',
    bad: ids(spec(entity('IFCWALL'), attribute({ name: 'LongName' }))),
    good: ids(spec(entity('IFCWALL'), attribute({ name: 'Name' }))),
  },
  {
    code: 'partof-entity-incompatible',
    bad: ids(spec(wall, '<partOf relation="IFCRELASSIGNSTOGROUP"><entity><name>' + sv('IFCWALL') + '</name></entity></partOf>')),
    good: ids(spec(wall, '<partOf relation="IFCRELASSIGNSTOGROUP"><entity><name>' + sv('IFCSYSTEM') + '</name></entity></partOf>')),
  },
  {
    code: 'conditions-impossible',
    bad: ids(spec(entity('IFCWALL') + attribute({ name: 'LongName' }))),
    good: ids(spec(entity('IFCWALL') + attribute({ name: 'Name' }))),
  },
  {
    code: 'restriction-empty',
    bad: ids(spec(wall, attribute({ name: 'Name', value: restriction('xs:string', '') }))),
    good: ids(spec(wall, attribute({ name: 'Name', value: restriction('xs:string', '<xs:enumeration value="A"/>') }))),
  },
  {
    code: 'restriction-base-invalid',
    bad: ids(spec(wall, attribute({ name: 'Name', value: restriction('xs:token', '<xs:enumeration value="A"/>') }))),
    good: ids(spec(wall, attribute({ name: 'Name', value: restriction('xs:string', '<xs:enumeration value="A"/>') }))),
  },
  {
    code: 'restriction-facet-invalid',
    bad: ids(spec(wall, attribute({ name: 'Name', value: restriction('xs:boolean', '<xs:enumeration value="true"/>') }))),
    good: ids(spec(wall, attribute({ name: 'Name', value: restriction('xs:string', '<xs:enumeration value="true"/>') }))),
  },
  {
    code: 'pattern-invalid',
    bad: ids(spec(wall, attribute({ name: 'Name', value: restriction('xs:string', '<xs:pattern value="[A-"/>') }))),
    good: ids(spec(wall, attribute({ name: 'Name', value: restriction('xs:string', '<xs:pattern value="[A-Z]+"/>') }))),
  },
  {
    code: 'ifc-version-invalid',
    bad: ids(spec(wall), { ifc: 'IFC4 IFC9' }),
    good: ids(spec(wall), { ifc: 'IFC4 IFC4X3_ADD2' }),
  },
  {
    code: 'value-missing',
    bad: ids(spec('<entity><name/></entity>')),
    good: ids(spec(wall)),
  },
  {
    code: 'applicability-empty',
    bad: ids('<applicability minOccurs="1" maxOccurs="unbounded"></applicability>'),
    good: ids(spec(wall)),
  },
];

describe('rules beyond the schema: one failing and one passing document each', () => {
  for (const c of cases) {
    it(c.code, async () => {
      const bad = await checkIds(c.bad);
      expect(has(bad, c.code), JSON.stringify(bad.findings, null, 1)).toBe(true);
      expect(bad.valid).toBe(false);
      const good = await checkIds(c.good);
      expect(good.findings.filter((f) => f.severity === 'error'), JSON.stringify(good.findings, null, 1)).toEqual([]);
      expect(good.valid).toBe(true);
    });
  }
});

describe('document level', () => {
  it('accepts a minimal valid IDS 1.0 file', async () => {
    const r = await checkIds(ids(spec(wall, attribute())));
    expect(r).toMatchObject({ valid: true, idsVersion: '1.0', findings: [] });
  });
  it('xml-not-well-formed with line and column', async () => {
    const r = await checkIds('<ids xmlns="http://standards.buildingsmart.org/IDS">\n<info>');
    expect(r.valid).toBe(false);
    expect(r.findings[0]).toMatchObject({ code: 'xml-not-well-formed', severity: 'error' });
    expect(r.findings[0].line).toBeGreaterThan(0);
  });
  it('not-an-ids-file', async () => {
    const r = await checkIds('<html/>');
    expect(has(r, 'not-an-ids-file')).toBe(true);
  });
  it('ids-version-unsupported when the schema location is missing', async () => {
    const r = await checkIds('<ids xmlns="http://standards.buildingsmart.org/IDS"/>');
    expect(r.valid).toBe(false);
    expect(r.findings).toEqual([expect.objectContaining({ code: 'ids-version-unsupported', severity: 'error', line: 1, path: 'ids' })]);
    expect(r.findings[0].message).toContain('no xsi:schemaLocation');
    expect(r.idsVersion).toBeUndefined();
  });
  it('ids-version-unsupported when the schema location names no version', async () => {
    const r = await checkIds(ids(spec(wall)).replace('/1.0/ids.xsd', '/latest/ids.xsd'));
    expect(r.findings).toEqual([expect.objectContaining({ code: 'ids-version-unsupported', severity: 'error' })]);
    expect(r.findings[0].message).toContain('is not the IDS 1.0 location');
  });
  it.each([
    ['0.9.7', 'This file is IDS 0.9.7. idsbench works with IDS 1.0 only. Update the file to version 1.0 and check it again.'],
    ['0.9.6', 'This file is IDS 0.9.6. idsbench works with IDS 1.0 only. Update the file to version 1.0 and check it again.'],
    ['1.1', 'This file is IDS 1.1. idsbench works with IDS 1.0 only. Save the file as IDS 1.0 and check it again.'],
    ['2.0', 'This file is IDS 2.0. idsbench works with IDS 1.0 only. Save the file as IDS 1.0 and check it again.'],
  ])('a file that declares IDS %s is refused by name, as the only finding, on the <ids> line', async (version, message) => {
    const r = await checkIds(ids(spec(wall), { version }));
    expect(r.valid).toBe(false);
    expect(r.idsVersion).toBe(version);
    expect(r.findings).toEqual([{ severity: 'error', code: 'ids-version-unsupported', message, line: 2, column: 1, path: 'ids' }]);
  });
  it('a refused version is refused even when the rest of the file is also wrong', async () => {
    const r = await checkIds(ids(spec(entity('IFCWALLL')), { version: '0.9.7' }));
    expect(r.findings.map((f) => f.code)).toEqual(['ids-version-unsupported']);
  });
  it('tolerates a byte-order mark', async () => {
    expect((await checkIds('﻿' + ids(spec(wall)))).valid).toBe(true);
  });
  it.each([
    ['xsd-unexpected-element', ids('<requirements>' + attribute() + '</requirements>')],
    ['xsd-missing-element', ids('')],
    ['xsd-unexpected-attribute', ids(applicability(wall).replace('<applicability ', '<applicability bogus="1" '))],
    ['xsd-invalid-value', ids(applicability(wall, 'minOccurs="x" maxOccurs="unbounded"'))],
    ['xsd-missing-attribute', ids(spec(wall)).replace(' name="Spec"', '')],
  ])('schema layer reports %s with a position', async (code, xml) => {
    const r = await checkIds(xml);
    const f = r.findings.find((x) => x.code === code);
    expect(f, JSON.stringify(r.findings)).toBeDefined();
    expect(f!.line).toBeGreaterThan(0);
    expect(r.valid).toBe(false);
  });
});
