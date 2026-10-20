/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The validator's running out of memory was recognised by the words anywhere in what it printed, and what it prints
// quotes the file: a value, and after a parser error a line of the file. An invalid file with ifcVersion="OOM", a
// cardinality "out of memory", or a title "Room out of memory test & more" (a bare &) got no verdict, only "the browser
// ran out of memory", every time it was checked again. Here each gets its own verdict, and libxml2's and the
// runtime's own words still mean that the validator ran out of memory.
import { describe, expect, it } from 'vitest';
import { checkIds } from '../src/index.ts';
import { failedForWantOfMemory, libxml2OutOfMemory } from '../src/xsd.ts';
import { attribute, entity, ids, spec, sv } from './helpers.ts';

const codes = async (xml: string) => (await checkIds(xml)).findings.map((f) => f.code);

describe('a file that quotes the words for running out of memory gets its verdict', () => {
  it('ifcVersion="OOM": its value is not allowed', async () => {
    expect(await codes(ids(spec(entity()), { ifc: 'OOM' }))).toContain('xsd-invalid-value');
  });
  it('cardinality="out of memory": its value is not allowed', async () => {
    expect(await codes(ids(spec(entity(), attribute({ cardinality: 'out of memory' }))))).toContain('xsd-invalid-value');
  });
  it('a title "Room out of memory test & more": a bare & is not well-formed', async () => {
    const xml = ids(spec(entity())).replace('<title>Test</title>', '<title>Room out of memory test & more</title>');
    expect(await codes(xml)).toEqual(['xml-not-well-formed']);
  });
  it('a valid file whose title says it is valid', async () => {
    const xml = ids(spec(entity(), attribute({ name: 'Name', value: sv('out of memory') }))).replace('<title>Test</title>', '<title>OOM: out of memory, allocation failed</title>');
    expect(await checkIds(xml)).toMatchObject({ valid: true, findings: [] });
  });
});

describe('the validator\'s own words for running out of memory', () => {
  it('libxml2\'s error line, with or without its place, and not a line of the file it quotes', () => {
    expect(libxml2OutOfMemory('document.xml:54464: error: libxml2: out of memory\n    <specification name="S18153">\n    ^\n')).toBe(true);
    expect(libxml2OutOfMemory('libxml2: out of memory\n')).toBe(true);
    expect(libxml2OutOfMemory('document.xml:3: parser error : xmlParseEntityRef: no name\nlibxml2: out of memory\n^\n')).toBe(false);
    expect(libxml2OutOfMemory("document.xml:5: Schemas validity error : Element 'x', attribute 'y': 'libxml2: out of memory' is not a valid value.\n")).toBe(false);
  });
  it('exit code 9, the runtime\'s errors, and nothing that only quotes the file', () => {
    expect(failedForWantOfMemory({ code: 9, message: 'document.xml:1: error:   <title>t</title>\n  ^\n' })).toBe(true);
    expect(failedForWantOfMemory({ message: 'Uncaught RangeError: WebAssembly.Memory(): could not allocate memory' })).toBe(true);
    expect(failedForWantOfMemory({ message: 'RangeError: Out of memory: Cannot allocate Wasm memory for new instance' })).toBe(true);
    expect(failedForWantOfMemory({ message: 'Uncaught RuntimeError: Aborted(OOM). Build with -sASSERTIONS for more info.' })).toBe(true);
    expect(failedForWantOfMemory({ code: 1, message: "document.xml:5: error : value 'OOM' out of memory\n" })).toBe(false);
    expect(failedForWantOfMemory({ message: 'something internal' })).toBe(false);
  });
});
