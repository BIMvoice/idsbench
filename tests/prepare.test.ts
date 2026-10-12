/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { checkText, excerpt } from '../src/core/checkview';
import { prepareIds, IdsInvalid } from '../src/core/prepare';

const NS = 'http://standards.buildingsmart.org/IDS';
const doc = (version: string, cls = 'IFCWALL', eol = '\n') =>
  ['<?xml version="1.0" encoding="UTF-8"?>',
    `<ids xmlns="${NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NS} ${NS}/${version}/ids.xsd">`,
    '  <info><title>t</title></info>',
    '  <specifications>',
    '    <specification name="s" ifcVersion="IFC4">',
    '      <applicability minOccurs="1" maxOccurs="unbounded">',
    `        <entity><name><simpleValue>${cls}</simpleValue></name></entity>`,
    '      </applicability>',
    '    </specification>',
    '  </specifications>',
    '</ids>', ''].join(eol);

const outcome = async (xml: string) => {
  try { return { ok: true as const, ...(await prepareIds(xml)) }; } catch (e) { return { ok: false as const, error: e as IdsInvalid & { kind: string } }; }
};

describe('Run opens an IDS file only when the Check engine accepts it', () => {
  it('a valid IDS 1.0 file is opened, with no warnings', async () => {
    const o = await outcome(doc('1.0'));
    expect(o).toMatchObject({ ok: true, warnings: 0 });
  });
  it('an invalid file is refused with the number of problems and the sentence the page shows', async () => {
    const o = await outcome(doc('1.0', 'IFCWALLL'));
    expect(o.ok).toBe(false);
    if (!o.ok) {
      expect(o.error.kind).toBe('ids-invalid');
      expect(o.error.problems).toBe(1);
      expect(o.error.message).toBe('This IDS file has 1 problem, so the result could not be trusted.');
    }
  });
  it('the engine, not Run, decides on versions: 0.9.7, 0.9.6 and 1.1 are refused, a file with none too', async () => {
    for (const v of ['0.9.7', '0.9.6', '1.1']) {
      const o = await outcome(doc(v));
      expect(o.ok, v).toBe(false);
      if (!o.ok) expect(o.error.kind).toBe('ids-invalid');
    }
    const none = await outcome(doc('1.0').replace(/ xsi:schemaLocation="[^"]*"/, ''));
    expect(none.ok).toBe(false);
  });
  it('the same file gives the same problems in Check and in the Run gate', async () => {
    const xml = doc('1.0', 'IFCWALLL');
    const view = await checkText(xml);
    const o = await outcome(xml);
    expect(view.kind === 'report' && view.errors).toBe(!o.ok ? o.error.problems : -1);
  });
  it('a file that is not XML or not an IDS gets one sentence, not a count', async () => {
    for (const [xml, re] of [['this is not xml', /is not XML/], ['<html/>', /not an IDS file/]] as const) {
      const o = await outcome(xml);
      expect(o.ok).toBe(false);
      if (!o.ok) {
        expect(o.error.kind).toBe('ids-unusable');
        expect(o.error.message).toMatch(re);
      }
    }
  });
  it('an empty file and an IFC model keep Run\'s own wording', async () => {
    const e = await outcome('');
    const i = await outcome('ISO-10303-21;\nHEADER;');
    expect(!e.ok && e.error.kind).toBe('ids-empty');
    expect(!i.ok && i.error.kind).toBe('ids-is-ifc');
  });
});

describe('the line the engine reports is the line the excerpt shows', () => {
  it.each([['LF', '\n'], ['CRLF', '\r\n'], ['CR', '\r']])('%s line breaks', async (_n, eol) => {
    const xml = doc('1.0', 'IFCWALLL', eol);
    const view = await checkText(xml);
    expect(view.kind).toBe('report');
    if (view.kind !== 'report') return;
    const finding = view.findings[0];
    expect(finding.code).toBe('entity-unknown-class');
    const lines = excerpt(xml, finding.line!, finding.column)!;
    expect(lines.find((l) => l.startsWith('>'))).toContain('IFCWALLL');
  });
});

const corpus = path.resolve('packages/check/test/fixtures/corpus/ids-repo/TestCases');
describe.skipIf(!fs.existsSync(corpus))('an official invalid-* file', () => {
  it('has a position, and the excerpt shows the offending element', async () => {
    const name = fs.readdirSync(path.join(corpus, 'entity')).filter((n) => n.startsWith('invalid-') && n.endsWith('.ids')).sort()[0];
    const xml = fs.readFileSync(path.join(corpus, 'entity', name), 'utf8');
    const view = await checkText(xml);
    expect(view.kind === 'report' && !view.valid).toBe(true);
    if (view.kind === 'report') {
      const f = view.findings[0];
      expect(f.line).toBeGreaterThan(0);
      expect(excerpt(xml, f.line!, f.column)!.some((l) => l.startsWith('>'))).toBe(true);
    }
  });
});
