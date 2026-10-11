// A model is checked one range of entities at a time. What a specification says of the model as a whole (it needs at
// least one match, it allows none, it is optional) and what a requirement finds on other entities (a storey, a group, a
// classification, a material, a type) must not depend on where the ranges are cut. Every case here is run whole and cut,
// and the expected answer is written out, so that two runs that are wrong in the same way do not pass.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cutRanges } from '../src/core/validate';
import { failuresCsvParts, parseCsv, ROW_KINDS } from '../src/core/csv';
import { idsText, ifcText, nameIs, runText, specXml } from './helpers/small-model';

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

const G = (n: number) => String(n).padStart(22, '0');
const el = (i: number, cls: string, name = 'x') => `#${i}=${cls}('${G(i)}',$,'${name}',$,$,$,$,$,$);\n`;
const REQ = 'minOccurs="1" maxOccurs="unbounded"', OPT = 'minOccurs="0" maxOccurs="unbounded"', NO = 'minOccurs="0" maxOccurs="0"';
const strip = <T extends { seconds: number }>(r: T) => ({ ...r, seconds: 0 });
/** The failing elements as a set, whatever order the ranges put them in. */
const failing = (r: Awaited<ReturnType<typeof runText>>) => r.specs.map((s) => s.failures.map((f) => f.globalId).sort());
const summary = (r: Awaited<ReturnType<typeof runText>>) => r.specs.map((s) => [s.state, s.applicable, s.passed, s.failed]);

describe('where the ranges are cut', () => {
  it('each range holds at most the given number of entities, and together they hold every id once', () => {
    const ids = [5, 1, 9, 3, 7, 2, 8, 4, 6, 10];
    const ranges = cutRanges(ids, 3);
    expect(ranges).toEqual([[0, 4], [4, 7], [7, 10], [10, Infinity]]);
    for (const id of ids) expect(ranges.filter(([lo, hi]) => id >= lo && id < hi)).toHaveLength(1);
    expect(cutRanges(ids, 10)).toEqual([[0, Infinity]]);
    expect(cutRanges(ids, 1)).toHaveLength(10);
    expect(cutRanges([], 5)).toEqual([[0, Infinity]]);
  });
  it('ids far apart do not make more ranges: a range is a number of entities, not a width of ids', () => {
    const ids = Array.from({ length: 30 }, (_, i) => (i + 1) * 1_000_000);
    expect(cutRanges(ids, 10)).toHaveLength(3);
  });
  it('an id listed twice is in one range', () => {
    const ranges = cutRanges([1, 2, 2, 2, 2, 3], 2);
    for (const id of [1, 2, 3]) expect(ranges.filter(([lo, hi]) => id >= lo && id < hi)).toHaveLength(1);
  });
  it('a model whose ids are a million apart is checked in as many passes as it has ranges of entities, not of ids', async () => {
    // 30 walls with ids 1,000,000 apart, in ranges of 10: three ranges. Ranges of 10 ids would be three million.
    const body = Array.from({ length: 30 }, (_, i) => el((i + 1) * 1_000_000, 'IFCWALL', i % 2 ? 'Waldo' : 'Wilma')).join('');
    let ticks = 0;
    const u = new TextEncoder().encode(ifcText(body));
    const { readIds, runValidation } = await import('../src/core/validate');
    const r = await runValidation({ ids: readIds(idsText(specXml('names', 'IFCWALL', REQ, nameIs('Waldo')))), idsName: 'a.ids', ifcBytes: u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer, ifcName: 'm.ifc', rangeIds: 10, onTick: () => { ticks++; } });
    expect([r.specs[0].applicable, r.specs[0].failed]).toEqual([30, 15]);
    // The library reports a handful of times per pass.
    expect(ticks).toBeLessThan(200);
  }, 20_000);
});

describe('a specification that speaks of the model as a whole, with its only match anywhere in the ranges', () => {
  const specs = idsText(
    specXml('needs a door', 'IFCDOOR', REQ),
    specXml('no door allowed', 'IFCDOOR', NO),
    specXml('doors, if any, are named D', 'IFCDOOR', OPT, nameIs('D')),
    specXml('needs a window', 'IFCWINDOW', REQ),
    specXml('no window allowed', 'IFCWINDOW', NO),
    specXml('windows, if any, are named W', 'IFCWINDOW', OPT, nameIs('W')),
  );
  // 20 walls, ids 1..20, and a door in the place of one of them. Ranges of 5 entities: [1..5], [6..10], [11..15], [16..20].
  const withDoorsAt = (...at: number[]) => ifcText(Array.from({ length: 20 }, (_, i) => el(i + 1, at.includes(i + 1) ? 'IFCDOOR' : 'IFCWALL', at.includes(i + 1) ? 'door' : 'wall')).join(''));
  const cases: [string, number[]][] = [
    ['the first id of the model', [1]], ['the last id of a range', [5]], ['the first id of a range', [6]], ['the last id of the model', [20]],
    ['one in each of two ranges', [5, 6]], ['one in the first range and one in the last', [1, 20]], ['one in every range', [3, 8, 13, 18]],
  ];
  for (const [where, at] of cases) {
    it(`the door at ${where}`, async () => {
      const n = at.length;
      const expected = [['pass', n, n, 0], ['fail', n, 0, n], ['fail', n, 0, n], ['fail', 0, 0, 0], ['pass', 0, 0, 0], ['nothing', 0, 0, 0]];
      const whole = await runText(specs, withDoorsAt(...at));
      expect(summary(whole)).toEqual(expected);
      for (const size of [1, 2, 5, 7, 19]) {
        const cut = await runText(specs, withDoorsAt(...at), { rangeIds: size });
        expect(summary(cut)).toEqual(expected);
        expect(failing(cut)).toEqual(failing(whole));
        expect(cut.specs.map((s) => [s.note, s.wholeFailure, s.summary])).toEqual(whole.specs.map((s) => [s.note, s.wholeFailure, s.summary]));
        expect(cut.verdict).toBe('fail');
      }
    });
  }
  it('no door at all: required fails as a whole, prohibited passes, optional has nothing to check, in one range or twenty', async () => {
    for (const size of [undefined, 1, 5]) {
      const r = await runText(specs, withDoorsAt(), { rangeIds: size });
      expect(r.specs.slice(0, 3).map((s) => [s.state, s.applicable, !!s.wholeFailure])).toEqual([['fail', 0, true], ['pass', 0, false], ['nothing', 0, false]]);
    }
  });
  it('ids that are far apart and not in the order of the file give the same answer', async () => {
    const ids = [900_000, 7, 50_000, 12, 3_000_000, 1, 640, 77_777, 2, 400];
    const body = (door: number) => ids.map((id) => el(id, id === door ? 'IFCDOOR' : 'IFCWALL', 'e')).join('');
    for (const door of [1, 3_000_000, 640]) {
      const whole = await runText(specs, ifcText(body(door)));
      for (const size of [1, 3, 9]) {
        const cut = await runText(specs, ifcText(body(door)), { rangeIds: size });
        expect(summary(cut)).toEqual([['pass', 1, 1, 0], ['fail', 1, 0, 1], ['fail', 1, 0, 1], ['fail', 0, 0, 0], ['pass', 0, 0, 0], ['nothing', 0, 0, 0]]);
        expect(failing(cut)).toEqual(failing(whole));
      }
    }
  });
  it('a model smaller than one range is one range: the result is the very same', async () => {
    const whole = await runText(specs, withDoorsAt(5, 6));
    expect(strip(await runText(specs, withDoorsAt(5, 6), { rangeIds: 20 }))).toEqual(strip(whole));
    expect(strip(await runText(specs, withDoorsAt(5, 6), { rangeIds: 1000 }))).toEqual(strip(whole));
  });
  it('the rows of the CSV for specifications that fail as a whole are the same however the model is cut, and are never counted as elements', async () => {
    const rowsOf = async (size?: number) => parseCsv(await new Blob(failuresCsvParts(await runText(specs, withDoorsAt(5, 6), { rangeIds: size, spill: true }))).text()).slice(1);
    const whole = await rowsOf();
    expect(whole.filter((r) => r[0] === ROW_KINDS.specification).map((r) => r[1])).toEqual(['needs a window']);
    expect(whole.filter((r) => r[0] === ROW_KINDS.element)).toHaveLength(4);
    for (const size of [1, 5]) expect(await rowsOf(size)).toEqual(whole);
  });
});

describe('a requirement that looks at other entities, which lie in other ranges than the element', () => {
  // Walls at ids 1..12. What they are related to, and the relationships themselves, start at id 1000: with ranges of
  // 2 or 5 entities every wall is ranges away from its storey, its slab, its beam, its group, its classification, its material and its type.
  const walls = Array.from({ length: 12 }, (_, i) => el(i + 1, 'IFCWALL', `W${i + 1}`)).join('');
  const refs = (ids: number[]) => `(${ids.map((i) => `#${i}`).join(',')})`;
  const half = [1, 2, 3, 4, 5, 6], other = [7, 8, 9, 10, 11, 12];
  const related =
    `#1000=IFCBUILDING('${G(1000)}',$,'B',$,$,$,$,$,$,$,$,$);\n` +
    `#1001=IFCBUILDINGSTOREY('${G(1001)}',$,'S',$,$,$,$,$,$,$);\n` +
    `#1002=IFCRELAGGREGATES('${G(1002)}',$,$,$,#1000,(#1001));\n` +
    `#1003=IFCRELCONTAINEDINSPATIALSTRUCTURE('${G(1003)}',$,$,$,${refs(half)},#1001);\n` +
    `#1010=IFCGROUP('${G(1010)}',$,'G',$,$);\n` +
    `#1011=IFCRELASSIGNSTOGROUP('${G(1011)}',$,$,$,${refs(half)},$,#1010);\n` +
    `#1020=IFCCLASSIFICATION('src',$,$,'Uniclass 2015',$,$,$);\n` +
    `#1021=IFCCLASSIFICATIONREFERENCE($,'Ss_25_10',$,#1020,$,$);\n` +
    `#1022=IFCRELASSOCIATESCLASSIFICATION('${G(1022)}',$,$,$,${refs(half)},#1021);\n` +
    `#1030=IFCMATERIAL('Concrete',$,$);\n` +
    `#1031=IFCRELASSOCIATESMATERIAL('${G(1031)}',$,$,$,${refs(half)},#1030);\n` +
    `#1040=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('2HR'),$);\n` +
    `#1041=IFCPROPERTYSET('${G(1041)}',$,'Pset_WallCommon',$,(#1040));\n` +
    `#1042=IFCWALLTYPE('${G(1042)}',$,'T',$,$,(#1041),$,$,$,.STANDARD.);\n` +
    `#1043=IFCRELDEFINESBYTYPE('${G(1043)}',$,$,$,${refs(half)},#1042);\n` +
    `#1050=IFCPROPERTYSINGLEVALUE('Reference',$,IFCIDENTIFIER('R1'),$);\n` +
    `#1051=IFCPROPERTYSET('${G(1051)}',$,'Pset_WallCommon',$,(#1050));\n` +
    `#1052=IFCRELDEFINESBYPROPERTIES('${G(1052)}',$,$,$,${refs(half)},#1051);\n` +
    `#1060=IFCSLAB('${G(1060)}',$,'Deck',$,$,$,$,$,$);\n` +
    `#1061=IFCRELAGGREGATES('${G(1061)}',$,$,$,#1060,${refs(half)});\n` +
    `#1070=IFCBEAM('${G(1070)}',$,'Host',$,$,$,$,$,$);\n` +
    `#1071=IFCRELNESTS('${G(1071)}',$,$,$,#1070,${refs(half)});\n`;
  const requirement = (xml: string) => `<requirements>${xml}</requirements>`;
  const partOf = (relation: string, cls: string) => requirement(`<partOf relation="${relation}"><entity><name><simpleValue>${cls}</simpleValue></name></entity></partOf>`);
  const property = (name: string) => requirement(`<property><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>${name}</simpleValue></baseName></property>`);
  const specs: [string, string][] = [
    ['contained in a storey', partOf('IFCRELCONTAINEDINSPATIALSTRUCTURE', 'IFCBUILDINGSTOREY')],
    ['nested in a beam', partOf('IFCRELNESTS', 'IFCBEAM')],
    ['part of a slab by aggregation', partOf('IFCRELAGGREGATES', 'IFCSLAB')],
    ['in a group', partOf('IFCRELASSIGNSTOGROUP', 'IFCGROUP')],
    ['classified in Uniclass 2015', requirement('<classification><system><simpleValue>Uniclass 2015</simpleValue></system></classification>')],
    ['has the material Concrete', requirement('<material><value><simpleValue>Concrete</simpleValue></value></material>')],
    ['has FireRating, which only its type has', property('FireRating')],
    ['has Reference, from a property set of its own', property('Reference')],
  ];
  const model = ifcText(walls + related);
  const reversed = ifcText(related + walls);

  for (const [name, req] of specs) {
    it(`${name}: found for the six walls that have it and missed for the six that do not, however far away it is`, async () => {
      const ids = idsText(specXml(name, 'IFCWALL', REQ, req));
      for (const text of [model, reversed]) {
        const whole = await runText(ids, text);
        expect([whole.specs[0].state, whole.specs[0].applicable, whole.specs[0].passed, whole.specs[0].failed]).toEqual(['fail', 12, 6, 6]);
        expect(failing(whole)[0]).toEqual(other.map(G).sort());
        for (const size of [1, 2, 5, 13]) {
          const cut = await runText(ids, text, { rangeIds: size });
          expect([cut.specs[0].state, cut.specs[0].applicable, cut.specs[0].passed, cut.specs[0].failed]).toEqual(['fail', 12, 6, 6]);
          expect(failing(cut)).toEqual(failing(whole));
          expect(cut.specs[0].failures.map((f) => f.reasons).sort()).toEqual(whole.specs[0].failures.map((f) => f.reasons).sort());
        }
      }
    });
  }
  it('an applicability that looks at other entities (walls that are in a group) picks the same six in every cut', async () => {
    const ids = idsText(`<specification name="grouped walls" ifcVersion="IFC4"><applicability ${REQ}><entity><name><simpleValue>IFCWALL</simpleValue></name></entity><partOf relation="IFCRELASSIGNSTOGROUP"><entity><name><simpleValue>IFCGROUP</simpleValue></name></entity></partOf></applicability>${nameIs('W1')}</specification>`);
    for (const size of [undefined, 1, 2, 5, 13]) {
      const r = await runText(ids, model, { rangeIds: size });
      expect([r.specs[0].applicable, r.specs[0].passed, r.specs[0].failed]).toEqual([6, 1, 5]);
      expect(failing(r)[0]).toEqual([2, 3, 4, 5, 6].map(G));
    }
  });
});
