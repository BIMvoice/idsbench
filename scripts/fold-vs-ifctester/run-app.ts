// Writes the IDS files of the comparison with IfcTester (one per model of make-models.py, in the same directory) and the
// answers of the page and of the unguarded library (app.json). See compare.py.
import { readFileSync, writeFileSync } from 'node:fs';
import { createDataAccessor } from '@ifc-lite/ids/bridge';
import { IfcParser } from '@ifc-lite/parser';
import { createTranslationService, validateIDS } from '@ifc-lite/ids';
import { idsText } from '../../tests/helpers/small-model';
import { readIds, runValidation } from '../../src/core/validate';

const dir = process.argv[2];
const classes: Record<string, string[]> = JSON.parse(readFileSync(`${dir}/classes.json`, 'utf8'));
const PAR: Record<string, string> = { IFCBEAMSTANDARDCASE: 'IFCBEAM', IFCCOLUMNSTANDARDCASE: 'IFCCOLUMN', IFCDOORSTANDARDCASE: 'IFCDOOR', IFCMEMBERSTANDARDCASE: 'IFCMEMBER', IFCOPENINGSTANDARDCASE: 'IFCOPENINGELEMENT', IFCPLATESTANDARDCASE: 'IFCPLATE', IFCSLABSTANDARDCASE: 'IFCSLAB', IFCWINDOWSTANDARDCASE: 'IFCWINDOW', IFCDISTRIBUTIONCONTROLELEMENT: 'IFCDISTRIBUTIONELEMENT', IFCDISTRIBUTIONFLOWELEMENT: 'IFCDISTRIBUTIONELEMENT' };
const names = (v: string[]) => (v.length === 1 ? `<simpleValue>${v[0]}</simpleValue>` : `<xs:restriction base="xs:string">${v.map((x) => `<xs:enumeration value="${x}"/>`).join('')}</xs:restriction>`);
const pat = (p: string) => `<xs:restriction base="xs:string"><xs:pattern value="${p}"/></xs:restriction>`;
const entity = (n: string, extra = '') => `<entity><name>${n}</name>${extra}</entity>`;
const attr = (n: string, v: string) => `<attribute><name><simpleValue>${n}</simpleValue></name><value>${v}</value></attribute>`;
const sv = (v: string) => `<simpleValue>${v}</simpleValue>`;
const OCC = { required: 'minOccurs="1" maxOccurs="unbounded"', optional: 'minOccurs="0" maxOccurs="unbounded"', prohibited: 'minOccurs="0" maxOccurs="0"' };
interface S { id: string; app: string; req: (x: string) => string; occ: keyof typeof OCC }

function specsFor(model: string): { id: string; xml: string }[] {
  const have = classes[model];
  const subs = Object.keys(PAR).filter((s) => have.includes(s));
  const out: S[] = [];
  const reqs: Record<string, (first: string) => string> = {
    never: () => `<requirements>${attr('Name', sv('never-this'))}</requirements>`,
    named: (f) => `<requirements>${attr('Name', sv(f))}</requirements>`,
    desc: () => `<requirements>${attr('Description', pat('desc-.*'))}</requirements>`,
    predef: () => `<requirements>${attr('PredefinedType', sv('NOTDEFINED'))}</requirements>`,
  };
  const add = (id: string, app: string, first: string, occs: (keyof typeof OCC)[] = ['required'], rk = Object.keys(reqs)) => {
    for (const o of occs) for (const k of rk) out.push({ id: `${id}|${o}|${k}`, app, req: () => reqs[k](first), occ: o });
  };
  const ALL: (keyof typeof OCC)[] = ['required', 'optional', 'prohibited'];
  for (const sub of subs) {
    const par = PAR[sub];
    add(`${sub} alone`, entity(names([sub])), sub, ALL);
    add(`${par} alone`, entity(names([par])), par, ALL);
    add(`${sub}+${par}`, entity(names([sub, par])), sub, ALL);
    add(`${sub}+WALL`, entity(names([sub, 'IFCWALL'])), sub);
    add(`${par}+WALL`, entity(names([par, 'IFCWALL'])), par);
    add(`${sub} with Name`, entity(names([sub])) + attr('Name', sv(sub)), sub);
    add(`${par} with Name`, entity(names([par])) + attr('Name', sv(par)), par);
    add(`${sub} pattern exact`, entity(pat(sub)), sub);
    add(`${par} pattern exact`, entity(pat(par)), par);
    add(`${sub} pattern wide`, entity(pat(par + '.*')), sub);
    add(`${par} pattern union`, entity(pat(`(${sub}|${par})`)), par);
    add(`${sub} predef`, entity(names([sub]), '<predefinedType><simpleValue>NOTDEFINED</simpleValue></predefinedType>'), sub);
    add(`${par} predef`, entity(names([par]), '<predefinedType><simpleValue>NOTDEFINED</simpleValue></predefinedType>'), par);
    add(`${par} lowercase`, entity(sv(par.toLowerCase())), par);
    out.push({ id: `${sub} entity requirement ${par}|required|req`, app: entity(names(['IFCWALL'])), req: () => `<requirements>${entity(names([par]))}</requirements>`, occ: 'required' });
    out.push({ id: `${sub} entity requirement ${sub}|required|req`, app: entity(names(['IFCWALL', sub, par])), req: () => `<requirements>${entity(names([sub]))}</requirements>`, occ: 'required' });
    out.push({ id: `${par} partOf|required|req`, app: entity(names(['IFCWALL'])), req: () => `<requirements><partOf relation="IFCRELAGGREGATES">${entity(names([par]))}</partOf></requirements>`, occ: 'required' });
    out.push({ id: `${sub} partOf applic|required|req`, app: entity(names([sub])) + `<partOf relation="IFCRELAGGREGATES">${entity(names(['IFCWALL']))}</partOf>`, req: () => reqs.never(sub), occ: 'required' });
  }
  add('WALL alone', entity(names(['IFCWALL'])), 'IFCWALL', ALL);
  add('no entity', attr('Name', pat('.*')), 'IFCWALL', ['required'], ['never', 'desc', 'predef']);
  add('no entity Name plain', attr('Name', pat('plain-.*')), 'IFCWALL', ['required', 'prohibited'], ['never', 'desc']);
  add('SENSOR', entity(sv('IFCSENSOR')), 'IFCSENSOR');
  add('ACTUATOR+CTRL', entity(names(['IFCACTUATOR', 'IFCDISTRIBUTIONCONTROLELEMENT'])), 'IFCACTUATOR');
  add('unrelated DOOR', entity(names(['IFCDOOR'])), 'IFCDOOR', ALL);
  add('unrelated DISTRIBUTIONELEMENT', entity(names(['IFCDISTRIBUTIONELEMENT'])), 'IFCDISTRIBUTIONELEMENT', ALL);
  return out.map((s) => ({ id: s.id, xml: `<specification name="${s.id}" ifcVersion="IFC4"><applicability ${OCC[s.occ]}>${s.app}</applicability>${s.req('')}</specification>` }));
}

const silent = { log: console.log, warn: console.warn, error: console.error, info: console.info };
const rows: any[] = [];
for (const model of Object.keys(classes)) {
  const specs = specsFor(model);
  const xml = idsText(...specs.map((s) => s.xml));
  writeFileSync(`${dir}/${model}.ids`, xml);
  const bytes = readFileSync(`${dir}/${model}.ifc`);
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  console.log = console.warn = console.error = console.info = () => {};
  const app = await runValidation({ ids: readIds(xml), idsName: 'a.ids', ifcBytes: ab, ifcName: 'm.ifc' });
  // The plain library, as 3.2.0 answers it with no guard.
  const store: any = await new IfcParser().parseColumnar(ab, {});
  const doc = readIds(xml);
  const lib: any[] = [];
  for (const [i, s] of doc.specifications.entries()) {
    try {
      const rep = await validateIDS({ ...doc, specifications: [s] }, createDataAccessor(store), { modelId: 'm', schemaVersion: store.schemaVersion, entityCount: store.entityCount }, { translator: createTranslationService('en'), includePassingEntities: true });
      const r: any = rep.specificationResults[0];
      lib.push({ status: r.status, applicable: r.entityResults.map((e: any) => e.modelId ? e.expressId : e.expressId), failedIds: r.entityResults.filter((e: any) => !e.passed).map((e: any) => e.expressId), ids: r.entityResults.map((e: any) => ({ id: e.expressId, passed: e.passed })) });
    } catch (e) { lib.push({ error: String(e) }); }
  }
  console.log = silent.log; console.warn = silent.warn; console.error = silent.error; console.info = silent.info;
  const acc = createDataAccessor(store); const nameOf = (id: number) => acc.getEntityName(id) ?? null;
  specs.forEach((s, i) => {
    const row = app.specs[i];
    const l = lib[i];
    rows.push({
      model, id: s.id, withheld: row.withheld ?? null, state: row.state, applicable: row.applicable,
      failed: row.failures.map((f) => f.name).sort(), appClasses: row.failures.map((f) => f.ifcClass).sort(),
      lib: l.error ? { error: l.error } : { status: l.status, applicable: l.ids.map((e: any) => nameOf(e.id)).sort(), failed: l.ids.filter((e: any) => !e.passed).map((e: any) => nameOf(e.id)).sort() },
    });
  });
}
writeFileSync(`${dir}/app.json`, JSON.stringify(rows));
console.log('rows', rows.length, 'withheld', rows.filter((r) => r.withheld).length);
