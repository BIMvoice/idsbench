/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The validator's running out of memory was recognised by the words anywhere in what it printed, and what it prints
// quotes the file: a value, and after a parser error a line of the file. An invalid file with ifcVersion="OOM", a
// cardinality "out of memory", or a title "Room out of memory test & more" (a bare &) got no verdict, only "the browser
// ran out of memory", every time it was checked again. So did an <author> with libxml2's own line in it, since libxml2
// quotes a value with its line breaks. Here each gets its own verdict: what xmllint prints is never read for running out
// of memory, only its exit code 9 and the runtime's own errors.
import { describe, expect, it } from 'vitest';
import { checkIds } from '../src/index.ts';
import { memoryPages } from 'xmllint-wasm';
import { failedForWantOfMemory, validateAgainstXsd, ValidatorFailed } from '../src/xsd.ts';
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
  // libxml2 quotes an invalid value with its line breaks, so a line of the value stands alone in what it prints.
  it('an <author> with "libxml2: out of memory" on a line of its own: its value is not an email', async () => {
    const xml = ids(spec(entity())).replace('<title>Test</title>', '<title>Test</title><author>a\nlibxml2: out of memory\nb</author>');
    expect(await codes(xml)).toEqual(['xsd-invalid-value']);
  });
  it('an <author> with "document.xml:3: parser error : libxml2: out of memory" on a line of its own: its value is not an email', async () => {
    const xml = ids(spec(entity())).replace('<title>Test</title>', '<title>Test</title><author>a\ndocument.xml:3: parser error : libxml2: out of memory\nb</author>');
    expect(await codes(xml)).toEqual(['xsd-invalid-value']);
  });
  it('a valid file whose title says it is valid', async () => {
    const xml = ids(spec(entity(), attribute({ name: 'Name', value: sv('out of memory') }))).replace('<title>Test</title>', '<title>OOM: out of memory, allocation failed</title>');
    expect(await checkIds(xml)).toMatchObject({ valid: true, findings: [] });
  });
});

describe('the validator\'s own signals for running out of memory', () => {
  it('a real out of memory is exit code 9, and gives no verdict', async () => {
    // A file of 4 MB with a ceiling of 20 MiB: libxml2 runs out of memory, and xmllint ends with exit code 9.
    const xml = ids(Array.from({ length: 40_000 }, () => spec(entity())).join(''));
    const failed = await validateAgainstXsd(xml, undefined, { maxMemoryPages: 20 * memoryPages.MiB }).then(() => null, (e: unknown) => e);
    expect(failed).toBeInstanceOf(ValidatorFailed);
    expect((failed as ValidatorFailed).outOfMemory).toBe(true);
  });
  it('exit code 9, the runtime\'s errors, and nothing that only quotes the file', () => {
    expect(failedForWantOfMemory({ code: 9, message: 'document.xml:1: error:   <title>t</title>\n  ^\n' })).toBe(true);
    expect(failedForWantOfMemory({ message: 'Uncaught RangeError: WebAssembly.Memory(): could not allocate memory' })).toBe(true);
    expect(failedForWantOfMemory({ message: 'RangeError: Out of memory: Cannot allocate Wasm memory for new instance' })).toBe(true);
    expect(failedForWantOfMemory({ message: 'Uncaught RuntimeError: Aborted(OOM). Build with -sASSERTIONS for more info.' })).toBe(true);
    expect(failedForWantOfMemory({ code: 1, message: "document.xml:5: error : value 'OOM' out of memory\n" })).toBe(false);
    // Any exit code but 9 is xmllint's output, which quotes the file: its words are never read as running out of memory.
    expect(failedForWantOfMemory({ code: 1, message: 'document.xml:54464: error: libxml2: out of memory\n' })).toBe(false);
    expect(failedForWantOfMemory({ code: 1, message: 'libxml2: out of memory\n' })).toBe(false);
    expect(failedForWantOfMemory({ message: 'libxml2: out of memory\n' })).toBe(false);
    expect(failedForWantOfMemory({ message: 'something internal' })).toBe(false);
  });
});
