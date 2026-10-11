// What leaves the page: the CSV for the people who model, the report, and the draft that survives a reload.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decodeXml, NOT_UTF8, readForCheck } from '../src/core/checkview';
import { csvCell, failuresCsvParts, plainText } from '../src/core/csv';
import { pageReportParts, sha256Of } from '../src/core/report';
import type { FailingElement, RunResult, SpecRow } from '../src/core/types';
import { DRAFT_KEY, loadDraft, saveDraft, type Draft } from '../src/ui/page/draft';
import { doc, spec } from './helpers/ids';

describe('a spreadsheet must not read a name from a model as a formula', () => {
  it('puts an apostrophe before a cell that starts with =, +, -, @, a tab or a carriage return', () => {
    expect(plainText('=HYPERLINK("http://x","y")')).toBe('\'=HYPERLINK("http://x","y")');
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+2.50 Level')).toBe("'+2.50 Level");
    expect(csvCell('-wall, old')).toBe('"\'-wall, old"');
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\tx')).toBe("'\tx");
    expect(csvCell('\r=1')).toBe('"\'\r=1"');
  });
  it('leaves plain numbers and ordinary names as they are', () => {
    for (const v of ['-12.5', '+3', '-0,5', 'Wall-01', 'a=b', 'name@site', '', '3OZ$2s0hD9VxUfbCs_Wj_c']) expect(plainText(v)).toBe(v);
  });
  it('quotes a semicolon, which some spreadsheets take for the separator', () => expect(csvCell('a;b')).toBe('"a;b"'));
  it('does so in every column of the downloaded list', () => {
    const el = (name: string | null, id: string | null): FailingElement => ({ ifcClass: 'IfcWall', name, globalId: id, reasons: ['=why'], toFix: ['+fix'], place: '@level' });
    const s: SpecRow = { name: '=cmd', requirement: '-req', state: 'fail', kind: 'required', applicable: 2, passed: 0, failed: 2, summary: '', note: null, schemaNote: null, failures: [el('=A1', '@id'), el(null, null)] };
    const r: RunResult = { idsFile: '+a.ids', ifcFile: '-m.ifc', schema: 'IFC4', entityCount: 2, specs: [s], counts: { specifications: 1, passed: 0, failed: 1, notChecked: 0, nothingToCheck: 0 }, headline: '', verdict: 'fail', allPassed: false, seconds: 0 };
    const lines = failuresCsvParts(r).join('').split('\r\n');
    expect(lines[1]).toBe("Element,'=cmd,'-req,'=why,'+fix,IfcWall,'=A1,'@id,'@level,'-m.ifc,'+a.ids");
    expect(lines[2]).toBe("Element,'=cmd,'-req,'=why,'+fix,IfcWall,,,'@level,'-m.ifc,'+a.ids");
  });
});

describe('the report says which bytes it is about', () => {
  const check = { kind: 'report' as const, headline: 'h', valid: true, errors: 0, warnings: 0, version: '1.0', findings: [] };
  it('holds the name, size and SHA-256 of the IDS text and of the model', async () => {
    const ids = new Blob(['<ids/>']), model = new Blob(['ISO-10303-21;']);
    const idsId = { name: 'a.ids', bytes: ids.size, sha256: await sha256Of(ids) };
    const modelId = { name: 'm.ifc', bytes: model.size, sha256: await sha256Of(model) };
    const j = JSON.parse(pageReportParts('a.ids', false, check, null, idsId, modelId).join(''));
    expect(j.ids).toEqual(idsId);
    expect(j.model).toEqual(modelId);
    expect([j.ids.bytes, j.model.bytes]).toEqual([6, 13]);
    expect(j.ids.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(j.model.sha256).not.toBe(j.ids.sha256);
  });
  it('gives two texts that differ by one letter different hashes, and the same text the same hash', async () => {
    const a = await sha256Of(new Blob(['<ids>a</ids>'])), b = await sha256Of(new Blob(['<ids>b</ids>']));
    expect(a).not.toBe(b);
    expect(await sha256Of(new Blob(['<ids>a</ids>']))).toBe(a);
    expect(await sha256Of(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('reading the bytes of an IDS file', () => {
  const xml = (decl: string) => `${decl}<ids><info><title>Béton armé</title></info></ids>`;
  const latin1 = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
  it('reads UTF-8 with and without a byte order mark, and says which', () => {
    const plain = new TextEncoder().encode(xml('<?xml version="1.0" encoding="UTF-8"?>'));
    expect(decodeXml(plain)).toMatchObject({ bom: false, utf8: true, text: xml('<?xml version="1.0" encoding="UTF-8"?>') });
    expect(decodeXml(Uint8Array.from([0xef, 0xbb, 0xbf, ...plain]))).toMatchObject({ bom: true, utf8: true, text: xml('<?xml version="1.0" encoding="UTF-8"?>') });
  });
  it('reads a file in the encoding its declaration names, so that no letter is replaced, and declares what it then holds as UTF-8', () => {
    const r = decodeXml(latin1(xml('<?xml version="1.0" encoding="ISO-8859-1"?>')));
    expect(r).toMatchObject({ utf8: false, encoding: 'ISO-8859-1', text: xml('<?xml version="1.0" encoding="UTF-8"?>') });
  });
  it('reads UTF-16 by its byte order mark', () => {
    const s = xml('<?xml version="1.0" encoding="UTF-16"?>');
    const bytes = new Uint8Array(2 + s.length * 2);
    bytes[0] = 0xff; bytes[1] = 0xfe;
    [...s].forEach((c, i) => { bytes[2 + i * 2] = c.charCodeAt(0) & 0xff; bytes[3 + i * 2] = c.charCodeAt(0) >> 8; });
    expect(decodeXml(bytes)).toMatchObject({ utf8: false, text: xml('<?xml version="1.0" encoding="UTF-8"?>') });
  });
  it('refuses bytes that are not valid UTF-8 in a file that says UTF-8, and never replaces a letter silently', async () => {
    const bytes = latin1(xml('<?xml version="1.0" encoding="UTF-8"?>'));
    expect(decodeXml(bytes)).toEqual({ sentence: NOT_UTF8 });
    expect(await readForCheck(new File([bytes], 'a.ids'))).toEqual({ sentence: NOT_UTF8 });
    expect(decodeXml(latin1(xml('<?xml version="1.0" encoding="klingon"?>')))).toMatchObject({ sentence: expect.stringMatching(/klingon/) });
  });
  it('still says "not XML" for a file that is not text at all', async () => {
    expect(await readForCheck(new File([Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0xff, 0xfe, 0x00])], 'x.ids'))).toMatchObject({ sentence: expect.stringMatching(/not XML/) });
  });
});

describe('the draft in the tab', () => {
  let store: Map<string, string>;
  let limit = Infinity;
  beforeEach(() => {
    store = new Map(); limit = Infinity;
    (globalThis as { sessionStorage?: unknown }).sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { if (v.length > limit) throw new Error('QuotaExceededError'); store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
  });
  afterEach(() => { delete (globalThis as { sessionStorage?: unknown }).sessionStorage; });
  const draft = (): Draft => ({ doc: doc(spec()), fileName: 'a.ids', savedXml: '<ids/>', source: { text: 'x'.repeat(5000), specUids: ['u1'], bom: false }, model: 'm.ifc' });

  it('comes back as it was stored', () => {
    const d = draft();
    expect(saveDraft(d)).toBe(true);
    expect(loadDraft()).toEqual({ draft: d, unreadable: false });
  });
  it('is nothing when nothing is stored', () => expect(loadDraft()).toEqual({ draft: null, unreadable: false }));
  it('that is damaged, cut off or of another shape is not used, and the page is told there was one', () => {
    const good = JSON.stringify(draft());
    const bad = [
      '{', 'null', '42', '"text"', '[]', good.slice(0, good.length / 2),
      JSON.stringify({ ...draft(), doc: { specifications: [] } }),
      JSON.stringify({ ...draft(), doc: { ...draft().doc, specifications: [{ name: 'old shape' }] } }),
      JSON.stringify({ ...draft(), doc: { ...draft().doc, specifications: [{ ...spec(), applicability: [{ kind: 'entity', uid: 'x' }] }] } }),
      JSON.stringify({ ...draft(), doc: { ...draft().doc, specifications: [{ ...spec(), requirements: 'none' }] } }),
      JSON.stringify({ ...draft(), savedXml: 7 }),
      JSON.stringify({ ...draft(), source: { text: 5 } }),
    ];
    for (const raw of bad) {
      store.set(DRAFT_KEY, raw);
      expect(loadDraft(), raw.slice(0, 60)).toEqual({ draft: null, unreadable: true });
    }
  });
  it('from a build that did not keep the opened file is still restored', () => {
    const { source: _s, model: _m, ...old } = draft();
    store.set(DRAFT_KEY, JSON.stringify(old));
    expect(loadDraft().draft).toEqual(old);
  });
  it('that is too large is stored without the opened text; one that is still too large is not stored, the older one is removed, and the caller is told', () => {
    const d = draft();
    limit = 3000;
    expect(saveDraft(d)).toBe(true);
    expect(JSON.parse(store.get(DRAFT_KEY)!).source).toBeUndefined();
    limit = 10;
    expect(saveDraft(d)).toBe(false);
    expect(store.has(DRAFT_KEY)).toBe(false);
  });
});
