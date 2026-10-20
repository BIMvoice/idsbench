/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The engine's sentences in the user's terms, keyed by the finding's code, with the engine's own sentence kept.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkIds } from '@idsbench/check';
import { codeCoverage, ENGINE_CODES, KEPT_AS_THE_ENGINE_SAYS, plainFinding } from '../src/core/plain';

const here = path.dirname(new URL(import.meta.url).pathname);
const checkSrc = path.join(here, '..', 'packages', 'check', 'src');
const corpus = path.join(here, '..', 'packages', 'check', 'test', 'fixtures', 'corpus');
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.ids') ? [path.join(d, e.name)] : []));
const f = (code: string, message: string) => ({ code, message });

describe('every code the engine can emit', () => {
  it('ENGINE_CODES is the set of codes in the engine\'s source', () => {
    const src = fs.readdirSync(checkSrc).filter((n) => n.endsWith('.ts') && !/generated/.test(n)).map((n) => fs.readFileSync(path.join(checkSrc, n), 'utf8')).join('\n');
    const found = new Set<string>();
    for (const m of src.matchAll(/(?:\.error|\.warning|\.perSchema|problemCode)\([^'()]*(?:\([^()]*\)[^'()]*)*,\s*(?:\w+,\s*)?'([a-z]+(?:-[a-z]+)+)'/g)) found.add(m[1]);
    for (const m of src.matchAll(/code:\s*'([a-z]+(?:-[a-z]+)+)'/g)) found.add(m[1]);
    for (const m of src.matchAll(/'(restriction-facet-not-for-text|restriction-base-invalid)'/g)) found.add(m[1]);
    expect([...found].sort()).toEqual([...ENGINE_CODES].sort());
  });

  it('all but one have a sentence in plain words, and the one that has none keeps the engine\'s', () => {
    const c = codeCoverage();
    expect(c).toEqual({ total: 41, translated: 40, fallback: ['xsd-other'] });
    for (const code of KEPT_AS_THE_ENGINE_SAYS) {
      const p = plainFinding(f(code, 'The schema check reported: x'));
      expect(p).toEqual({ plain: 'The schema check reported: x', technical: 'The schema check reported: x', translated: false });
    }
  });

  it('every finding the engine gives on the 700+ files of the corpora is translated (not shown in its XML words)', async () => {
    let total = 0;
    const left: string[] = [];
    const codes = new Set<string>();
    for (const file of walk(corpus)) {
      for (const x of (await checkIds(fs.readFileSync(file, 'utf8'))).findings) {
        total++; codes.add(x.code);
        const p = plainFinding(x);
        if (!p.translated) left.push(`${x.code}: ${x.message}`);
        expect(p.technical).toBe(x.message);
      }
    }
    expect(left).toEqual([]);
    expect(total).toBeGreaterThan(150);
    expect(codes.size).toBeGreaterThanOrEqual(30);
    for (const c of codes) expect(ENGINE_CODES).toContain(c);
  }, 120_000);

  it('the three codes the corpus never produces are translated from the engine\'s wording in its source', () => {
    expect(plainFinding(f('value-empty', 'The partOf facet needs an entity saying what the element is part of; none was found.')).translated).toBe(true);
    expect(plainFinding(f('xsd-missing-attribute', "<specification> needs the attribute 'name'; add it.")).plain).toBe('A specification must have its name. Add it.');
    expect(plainFinding(f('xsd-unexpected-text', 'The element <applicability> contains text, but it may only contain other elements.')).translated).toBe(true);
  });
});

describe('the sentences asked for', () => {
  it('xs:integer: a whole number, such as 42, not 42.0', () => {
    expect(plainFinding(f('value-invalid-for-type', "The value '42.0' is not a valid xs:integer value, which is what IFCINTEGER needs.")).plain).toBe('The value 42.0 must be a whole number, such as 42, not 42.0, because IFCINTEGER needs that.');
    expect(plainFinding(f('xsd-invalid-value', "The attribute 'minOccurs' on <applicability> is '1.0', which is not a valid integer value.")).plain).toBe('The minOccurs of the "Applies to" part (1.0) must be a whole number, such as 1, not 1.0.');
  });
  it('the incomplete <specifications> element: add at least one specification', () => {
    expect(plainFinding(f('xsd-missing-element', 'The element <specifications> is incomplete; it needs <specification>.')).plain).toBe('Add at least one specification.');
  });
  it('minOccurs larger than maxOccurs', () => {
    expect(plainFinding(f('cardinality-invalid', 'The applicability occurrence is invalid: minOccurs 1 is larger than maxOccurs 0. Use minOccurs="1" maxOccurs="unbounded" (required), minOccurs="0" maxOccurs="unbounded" (optional) or minOccurs="0" maxOccurs="0" (prohibited).')).plain)
      .toBe("This specification is marked both 'must exist' and 'must not exist'. Choose one.");
  });
  it('requirements on a prohibited specification', () => {
    expect(plainFinding(f('requirements-not-allowed', 'A specification whose applicability is prohibited (maxOccurs="0") cannot have requirements; remove them or change the applicability.')).plain)
      .toBe('A specification that says elements must not exist cannot also list what they must have. Remove the "Must have" items, or choose another option.');
  });
  it('keeps the engine\'s sentence, exactly, beside the plain one', () => {
    const m = 'The element <specifications> is incomplete; it needs <specification>.';
    expect(plainFinding(f('xsd-missing-element', m))).toEqual({ plain: 'Add at least one specification.', technical: m, translated: true });
  });
});

// A plain sentence is read in place of the engine's: when it points to another part of the form, or to another repair,
// than the engine's does, the person fixes the wrong thing. Each of these is a finding of a real published file or of
// the official corpus.
describe('a plain sentence never sends the person to another place or another repair than the engine does', () => {
  const plain = (code: string, message: string) => plainFinding({ code, message });
  it('conditions that cannot be met together: under "Applies to" when the engine says the applicability, under "Must have" when it says the requirements', () => {
    expect(plain('conditions-impossible', 'The conditions in this applicability can never be met together for IFC2X3: no IFC class satisfies all of them.').plain)
      .toBe('No IFC class fits all the conditions under "Applies to" in IFC2X3, so this specification can never match anything.');
    const req = plain('conditions-impossible', 'The conditions in this requirements can never be met together for IFC4X3: no IFC class satisfies all of them.');
    expect(req.translated).toBe(true);
    expect(req.plain).toMatch(/"Must have"/);
    expect(req.plain).not.toMatch(/"Applies to"/);
  });
  it('an attribute written in other letters is to be spelt right, not removed (datatype for dataType: 23,089 findings in the published files surveyed)', () => {
    expect(plain('xsd-unexpected-attribute', "The attribute 'datatype' is not allowed on <property>; remove it.").plain)
      .toBe('datatype is not a name IDS knows on a property: it is written dataType. Names are case-sensitive, so correct the spelling.');
    expect(plain('xsd-unexpected-attribute', "The attribute 'minOccurs' is not allowed on <specification>; remove it.").plain)
      .toBe('minOccurs does not belong on a specification: in IDS 1.0 it is written on the "Applies to" part (<applicability>). Move it there.');
    expect(plain('xsd-unexpected-attribute', "The attribute 'minOccurs' is not allowed on <material>; remove it.").plain).toMatch(/says cardinality="required", "optional" or "prohibited" instead\. Replace it\.$/);
    expect(plain('xsd-unexpected-attribute', "The attribute 'invalidAttribute' is not allowed on <entity>; remove it.").plain).toBe('invalidAttribute does not belong on a type of element. Remove it.');
  });
  it('a property name the engine has a suggestion for is a spelling to correct, not a reason for a property set of one\'s own', () => {
    const typo = plain('property-unknown-in-standard-set', "The property name in 'Qto_RailingBaseQuantities' 'Lenght' is not valid in IFC4. The only accepted value is 'Length'. Did you mean 'Length'?").plain;
    expect(typo).toBe("Qto_RailingBaseQuantities has no property called Lenght in IFC4. The only standard one is 'Length'. Did you mean Length?");
    const own = plain('property-unknown-in-standard-set', "The property name in 'Pset_ElementAssemblyCommon' 'IsExternal' is not valid in IFC4X3. Accepted values are 'Status', 'Reference'.").plain;
    expect(own).toBe("Pset_ElementAssemblyCommon has no property called IsExternal in IFC4X3. Standard ones are 'Status', 'Reference'. Use a custom property set for your own properties.");
  });
  it('one class that is not known reads as one class; a file with no schema location, an author that is not an email address and a data type in small letters each have a sentence', () => {
    expect(plain('entity-unknown-class', "No enumeration option of the entity name (IfcDoor) is valid in IFC4. Check the spelling; the names are case-sensitive. Did you mean 'IFCDOOR'?").plain).toBe('IfcDoor is not an IFC class in IFC4. Did you mean IFCDOOR?');
    expect(plain('entity-unknown-class', 'No enumeration option of the entity name (IFCWAL, IFCDOR) is valid in IFC4. Check the spelling; the names are case-sensitive.').plain).toBe('None of IFCWAL, IFCDOR is an IFC class in IFC4.');
    expect(plain('ids-version-unsupported', 'The <ids> element has no xsi:schemaLocation, so the IDS version is unknown; add xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd".').translated).toBe(true);
    expect(plain('xsd-invalid-value', "<author> is 'André Vonthron', which does not match the required form [^@]+@[^\\.]+\\..+.").plain).toBe('The author must be an email address, such as name@company.com. It is "André Vonthron".');
    expect(plain('xsd-invalid-value', "The attribute 'dataType' on <property> is 'IfcDoor', which does not match the required form [A-Z]+.").plain).toBe('The dataType of a property (IfcDoor) is not written in the form the standard asks for: capital letters only, like IFCLABEL.');
    expect(plain('value-missing', 'The attribute facet needs a name given as a simple value or a restriction; none was found.').plain).toBe('An attribute needs a name, as a value or as a rule. None is given.');
  });
  it('says no more than the engine about why a file cannot be read as XML', () => {
    expect(plain('xml-not-well-formed', 'The file is not well-formed XML: Error constructing the DOM: NamespaceError: prefix is non-null and namespace is null.').plain).not.toMatch(/damaged|cut off/);
  });
});
