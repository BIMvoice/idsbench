// End to end through the real libraries: the same two functions the page and
// the truth script call.
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { readIds, runValidation } from '../src/core/validate';

const NS = 'http://standards.buildingsmart.org/IDS';
const wall = (i: number, name = 'Waldo') => `#${i}=IFCWALL('${String(i).padStart(22, '0')}',$,'${name}',$,$,$,$,$,$);\n`;
const ifc = (schema = 'IFC4', body = wall(1) + wall(2)) =>
  `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\nFILE_NAME('','2022-10-07T13:48:44',(),(),'x','x','');\nFILE_SCHEMA(('${schema}'));\nENDSEC;\nDATA;\n${body}ENDSEC;\nEND-ISO-10303-21;\n`;
const nameIs = (v: string) => `<requirements><attribute><name><simpleValue>Name</simpleValue></name><value><simpleValue>${v}</simpleValue></value></attribute></requirements>`;
const spec = (o: { name?: string; min?: string; max?: string; cls?: string; req?: string; version?: string | null; applicability?: string }) =>
  `<specification name="${o.name ?? 's'}"${o.version === null ? '' : ` ifcVersion="${o.version ?? 'IFC4'}"`}>${
    o.applicability ?? `<applicability minOccurs="${o.min ?? '1'}" maxOccurs="${o.max ?? 'unbounded'}"><entity><name><simpleValue>${o.cls ?? 'IFCWALL'}</simpleValue></name></entity></applicability>`
  }${o.req ?? ''}</specification>`;
const ids = (...specs: string[]) => `<?xml version="1.0"?><ids xmlns="${NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>${specs.join('')}</specifications></ids>`;
const run = (idsXml: string, model = ifc()) => {
  const u = new TextEncoder().encode(model);
  return runValidation({ ids: readIds(idsXml), idsName: 'a.ids', ifcBytes: u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer, ifcName: 'm.ifc' });
};
const refusal = async (idsXml: string, model: string) => {
  try { await run(idsXml, model); return 'ran'; } catch (e) { return (e as { kind: string }).kind; }
};

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

describe('ifcVersion is metadata: a specification is checked whatever version it lists', () => {
  it('IFC2X3 specification, IFC4 model, requirement met: pass, with a note beside the specification', async () => {
    const r = await run(ids(spec({ version: 'IFC2X3', min: '0', req: nameIs('Waldo') })));
    expect(r.verdict).toBe('pass');
    expect(r.specs[0].state).toBe('pass');
    expect(r.specs[0].schemaNote).toMatch(/The model is IFC4, but this specification lists IFC2X3/);
  });
  it('IFC2X3 specification, IFC4 model, required class absent: fail on its own merits', async () => {
    const r = await run(ids(spec({ version: 'IFC2X3', cls: 'IFCDOOR' })));
    expect(r.verdict).toBe('fail');
    expect(r.specs[0].note).toMatch(/needs at least one matching element/);
  });
  it('no note when the version is listed, or when the specification lists none', async () => {
    expect((await run(ids(spec({ version: 'IFC2X3 IFC4' })))).specs[0].schemaNote).toBeNull();
    expect((await run(ids(spec({ version: null })), ifc('IFC2X3'))).specs[0].schemaNote).toBeNull();
  });
  it('an IFC4X3_ADD2 model is shown under its own name and matches IFC4X3_ADD2', async () => {
    const r = await run(ids(spec({ version: 'IFC4X3_ADD2' })), ifc('IFC4X3_ADD2'));
    expect(r.schema).toBe('IFC4X3_ADD2');
    expect(r.specs[0].schemaNote).toBeNull();
  });
});

describe('states, through the real library', () => {
  it('prohibited and found: fail, the found elements are listed, counts add up', async () => {
    const r = await run(ids(spec({ min: '0', max: '0' })));
    expect(r.specs[0]).toMatchObject({ state: 'fail', applicable: 2, passed: 0, failed: 2 });
    expect(r.specs[0].failures).toHaveLength(2);
    expect(r.allPassed).toBe(false);
  });
  it('prohibited and not found: pass, and the headline does not hedge', async () => {
    const r = await run(ids(spec({ min: '0', max: '0', cls: 'IFCDOOR' })));
    expect(r.specs[0].state).toBe('pass');
    expect(r.headline).toBe('The one specification passed.');
  });
  it('optional and not found: passes, and both the row and the headline say nothing was checked', async () => {
    const r = await run(ids(spec({ min: '0', cls: 'IFCDOOR', req: nameIs('x') })));
    expect(r.specs[0].state).toBe('nothing');
    expect(r.allPassed).toBe(true);
    expect(r.headline).toMatch(/matched nothing in this model/);
  });
  it('mixed: one pass, one fail, one unchecked', async () => {
    const r = await run(ids(spec({ name: 'ok', req: nameIs('Waldo') }), spec({ name: 'bad', req: nameIs('x') }), spec({ name: 'none', applicability: '<applicability minOccurs="0" maxOccurs="unbounded"/>', req: nameIs('Waldo') })));
    expect(r.specs.map((s) => s.state)).toEqual(['pass', 'fail', 'unchecked']);
    expect(r.counts).toEqual({ specifications: 3, passed: 1, failed: 1, notChecked: 1, nothingToCheck: 0 });
    expect(r.headline).toBe('1 of 3 specifications passed. 1 failed. 1 could not be checked.');
    for (const s of r.specs) expect(s.passed + s.failed).toBe(s.applicable);
  });
  it('a specification with no applicability is not applied to every record in the file', async () => {
    for (const a of ['', '<applicability minOccurs="0" maxOccurs="unbounded"/>']) {
      const r = await run(ids(spec({ applicability: a, req: nameIs('Waldo') })));
      expect(r.specs[0]).toMatchObject({ state: 'unchecked', applicable: 0 });
      expect(r.allPassed).toBe(false);
      expect(r.verdict).toBe('incomplete');
    }
  });
  it('a pattern the library refuses to run leaves the specification unchecked, not failed', async () => {
    const req = '<requirements><attribute><name><simpleValue>Name</simpleValue></name><value><xs:restriction base="xs:string"><xs:pattern value="(a+)+$"/></xs:restriction></value></attribute></requirements>';
    const r = await run(ids(spec({ req })));
    expect(r.specs[0].state).toBe('unchecked');
    expect(r.verdict).toBe('incomplete');
  });
  it('a prohibited requirement that is broken gives a readable reason', async () => {
    const req = '<requirements><attribute cardinality="prohibited"><name><simpleValue>Name</simpleValue></name></attribute></requirements>';
    const r = await run(ids(spec({ req })));
    expect(r.specs[0].state).toBe('fail');
    const reason = r.specs[0].failures[0].reasons.join(' ');
    expect(reason).toMatch(/Prohibited/);
    expect(reason).not.toMatch(/Unknown|no details|undefined|≠/);
  });
});

describe('models that must not reach a verdict', () => {
  const good = ids(spec({ min: '0', req: nameIs('Waldo') }));
  it('a model cut off after its first wall: before the fix this said "The one specification passed."', async () => {
    const whole = ifc();
    expect(await refusal(good, whole.slice(0, whole.indexOf('#2=')))).toBe('ifc-cut-off');
  });
  it('an IFC2X2 model is not checked as if it were IFC4', async () => expect(await refusal(good, ifc('IFC2X2_FINAL'))).toBe('ifc-schema'));
  it('a model with a header and no data', async () => expect(await refusal(good, ifc('IFC4', ''))).toBe('ifc-empty'));
  it('the IDS file in the IFC box', async () => expect(await refusal(good, good)).toBe('ifc-is-ids'));
});

describe('many failures', () => {
  it('5,000 failing walls: every one is in the result, in file order', async () => {
    const n = 5000;
    const r = await run(ids(spec({ req: nameIs('x') })), ifc('IFC4', Array.from({ length: n }, (_, i) => wall(i + 1)).join('')));
    expect(r.specs[0]).toMatchObject({ state: 'fail', applicable: n, passed: 0, failed: n });
    expect(r.specs[0].failures).toHaveLength(n);
    expect(new Set(r.specs[0].failures.map((f) => f.globalId)).size).toBe(n);
  });
});
