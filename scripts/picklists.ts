// Everything the pick-lists offer, fed to the Check engine: for each IFC version and each combination of versions a
// specification can tick, every class, every predefined type, every attribute name, and the property sets and
// properties (with the data type the form fills in) offered for a class. Counts what the engine rejects, and why.
// The lists are the ones the form uses (src/core/picks.ts, and the version the form reads its lists from).
// Usage: npx vite-node scripts/picklists.ts [--all-properties] [--as-before] [--rows out.json]
//   --all-properties  every attribute of every class and every property of every set offered for it (slow), not the first few
//   --as-before       the lists as they were made from the first ticked version alone, to measure the difference
import fs from 'node:fs';
import { checkIds } from '@idsbench/check';
import { loadSchema, type IfcVersion, type SchemaData } from '@idsbench/check/ifc';
import { IFC_VERSIONS, newFacet, newSpecification, simple, type Facet, type IdsDocument, type Specification } from '../src/core/ids/model';
import { writeIds } from '../src/core/ids/write';
import { listsFor, listsOfFirstVersion, type Lists } from '../src/core/picks';

const args = process.argv.slice(2);
const allProps = args.includes('--all-properties');
const rowsAt = args.indexOf('--rows');
const rowsFile = rowsAt === -1 ? null : args[rowsAt + 1];

const schemas = new Map<IfcVersion, SchemaData>();
for (const v of IFC_VERSIONS) schemas.set(v, await loadSchema(v));

const entity = (cls: string, type?: string): Facet => ({ ...newFacet('entity', 'applicability'), name: simple(cls), predefinedType: type ? simple(type) : null } as Facet);
const make = (versions: string[], cls: string, type: string | undefined, requirements: Facet[]): Specification =>
  ({ ...newSpecification(), minOccurs: '1', name: 's', ifcVersion: versions, applicability: [entity(cls, type)], requirements });

interface Case { kind: string; versions: string[]; what: string; spec: Specification }
interface Rejected { kind: string; versions: string; what: string; codes: string[]; message: string }

/** Runs the cases through the engine, many specifications to a file, and returns those the engine reports an error on. */
async function rejected(cases: Case[]): Promise<Rejected[]> {
  const out: Rejected[] = [];
  const SIZE = 150;
  for (let at = 0; at < cases.length; at += SIZE) {
    const batch = cases.slice(at, at + SIZE);
    const doc: IdsDocument = { info: { title: 't', copyright: '', version: '', description: '', author: '', date: '', purpose: '', milestone: '' }, specifications: batch.map((c) => c.spec) };
    const r = await checkIds(writeIds(doc));
    const by = new Map<number, typeof r.findings>();
    for (const f of r.findings) {
      if (f.severity !== 'error') continue;
      const m = /^ids\/specifications(?:\[1\])?\/specification(?:\[(\d+)\])?/.exec(f.path ?? '');
      if (!m) throw new Error(`a finding without a specification: ${f.code} ${f.message}`);
      const i = m[1] ? Number(m[1]) - 1 : 0;
      by.set(i, [...(by.get(i) ?? []), f]);
    }
    for (const [i, fs_] of by) out.push({ kind: batch[i].kind, versions: batch[i].versions.join(' '), what: batch[i].what, codes: [...new Set(fs_.map((f) => f.code))], message: fs_[0].message });
  }
  return out;
}

const combos: string[][] = [['IFC2X3'], ['IFC4'], ['IFC4X3_ADD2'], ['IFC2X3', 'IFC4'], ['IFC4', 'IFC4X3_ADD2'], ['IFC2X3', 'IFC4X3_ADD2'], ['IFC2X3', 'IFC4', 'IFC4X3_ADD2']];
const all: Rejected[] = [];
console.log(['versions ticked', 'kind', 'offered', 'rejected by the engine', 'why (codes)'].join(' | '));
for (const versions of combos) {
  const lists: Lists = args.includes('--as-before') ? listsOfFirstVersion(schemas.get(versions[0] as IfcVersion)!) : listsFor(versions.map((v) => schemas.get(v as IfcVersion)!));
  const cases: Record<string, Case[]> = { class: [], 'predefined type': [], attribute: [], 'property set + property': [], 'data type': [] };
  for (const c of lists.classes) cases.class.push({ kind: 'class', versions, what: c.value, spec: make(versions, c.value, undefined, []) });
  for (const c of lists.classes) for (const t of lists.predefinedTypes(c.value)) cases['predefined type'].push({ kind: 'predefined type', versions, what: `${c.value} ${t.value}`, spec: make(versions, c.value, t.value, []) });
  // Attribute names are offered for the class the specification applies to.
  for (const c of lists.classes) {
    const names = lists.attributes(c.value);
    const sample = allProps ? names : names.slice(0, 4);
    for (const n of sample) cases.attribute.push({ kind: 'attribute', versions, what: `${c.value} ${n.value}`, spec: make(versions, c.value, undefined, [{ ...newFacet('attribute', 'requirements'), name: simple(n.value) } as Facet]) });
  }
  // Property sets offered for a class, and the properties offered for each, with the data type the form fills in.
  for (const c of lists.classes) {
    const sets = lists.propertySets(c.value);
    for (const set of allProps ? sets : sets.slice(0, 3)) {
      const props = lists.properties(set.value);
      for (const p of allProps ? props : props.slice(0, 3)) {
        const dataType = lists.dataTypeFor(set.value, p.value);
        cases['property set + property'].push({ kind: 'property set + property', versions, what: `${c.value} ${set.value}.${p.value} ${dataType ?? '(no data type)'}`, spec: make(versions, c.value, undefined, [{ ...newFacet('property', 'requirements'), propertySet: simple(set.value), baseName: simple(p.value), dataType } as Facet]) });
      }
    }
  }
  for (const d of lists.dataTypes) cases['data type'].push({ kind: 'data type', versions, what: d.value, spec: make(versions, 'IFCWALL', undefined, [{ ...newFacet('property', 'requirements'), propertySet: simple('My_Set'), baseName: simple('Mine'), dataType: d.value } as Facet]) });
  for (const [kind, list] of Object.entries(cases)) {
    const bad = await rejected(list);
    for (const b of bad) all.push(b);
    const why = new Map<string, number>();
    for (const b of bad) for (const code of b.codes) why.set(code, (why.get(code) ?? 0) + 1);
    console.log([versions.join(' + '), kind, list.length, bad.length, [...why].map(([c, n]) => `${c} (${n})`).join('; ') || '-'].join(' | '));
  }
}
console.log(`rejected in all: ${all.length}`);
for (const b of all.slice(0, 12)) console.log(`  e.g. [${b.versions}] ${b.kind}: ${b.what}: ${b.message}`);
if (rowsFile) fs.writeFileSync(rowsFile, JSON.stringify(all, null, 1));
