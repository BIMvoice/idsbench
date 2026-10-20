/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// A schema validator that ran out of memory (or failed on its own) said nothing about the file. It was reported as a
// fault in the file: "Not valid", Download off, Run refused because the file "has 1 problem". Here it gives no verdict:
// the page says the file could not be checked and why, and offers "Check again"; Run is refused with the same sentence.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fail = vi.hoisted(() => ({ code: 9, message: 'document.xml:408537: error: libxml2: out of memory\n      <requirements>\n      ^\n' }));
vi.mock('xmllint-wasm', async (original) => {
  const real = await original<typeof import('xmllint-wasm')>();
  return {
    ...real,
    // What xmllint-wasm does for an exit code other than 0, 3 or 4: an Error with the exit code and xmllint's stderr.
    validateXML: () => Promise.reject(Object.assign(new Error(fail.message), { code: fail.code })),
  };
});

const { CHECK_BROKE_DOWN, CHECK_OUT_OF_MEMORY, CheckIncomplete, checkText } = await import('../src/core/checkview');
const { prepareIds } = await import('../src/core/prepare');
const { TitleBlock } = await import('../src/ui/page/TitleBlock');
const { idsText, specXml } = await import('./helpers/small-model');

const xml = idsText(specXml('Walls', 'IFCWALL'));
afterEach(() => { fail.code = 9; fail.message = 'document.xml:1: error: libxml2: out of memory'; });

describe('a check whose schema validator ran out of memory', () => {
  it('gives no verdict: it says the file could not be checked and why, not that the file is not valid', async () => {
    const e = await checkText(xml).then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(CheckIncomplete);
    expect((e as Error).message).toBe(CHECK_OUT_OF_MEMORY);
    expect((e as InstanceType<typeof CheckIncomplete>).kind).toBe('check-incomplete');
  });
  it('even when libxml2 had no memory left to say so (only its exit code does)', async () => {
    fail.message = 'document.xml:205183: error: name><value><xs:restriction base="xs:string">\n   ^\n';
    expect((await checkText(xml).then(() => null, (x: unknown) => x) as Error).message).toBe(CHECK_OUT_OF_MEMORY);
  });
  it('a validator that failed for another reason gives no verdict either, and says so in its own words', async () => {
    fail.code = 1;
    fail.message = 'something internal';
    expect((await checkText(xml).then(() => null, (x: unknown) => x) as Error).message).toBe(CHECK_BROKE_DOWN);
  });
  it('the run is refused with the same sentence, not as a file with a problem', async () => {
    const e = await prepareIds(xml).then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(CheckIncomplete);
    expect((e as Error).message).toBe(CHECK_OUT_OF_MEMORY);
  });
  it('the page shows the sentence and "Check again", and no verdict', () => {
    const page = { report: null, check: { text: xml, failed: CHECK_OUT_OF_MEMORY }, run: null, model: null, name: 'a.ids', dirty: false, blank: false, doc: null, lines: null, checkAgain: () => {} };
    const html = renderToStaticMarkup(createElement(TitleBlock, { page: page as never, shown: true }));
    expect(html).toContain(CHECK_OUT_OF_MEMORY);
    expect(html).toMatch(/<button[^>]*>Check again<\/button>/);
    expect(html).not.toContain('Not valid');
  });
});
