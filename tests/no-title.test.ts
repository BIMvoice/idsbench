/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The title of an IDS file. The official schema needs the <title> element but not a text in it (xs:string), and the
// Check engine (the rules of the buildingSMART audit tool) does not ask for one either. So the form suggests a title
// and never blocks for want of one: a file written without a title is valid for Check and for the official schema.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkText } from '../src/core/checkview';
import { checkDocument } from '../src/core/ids/check';
import { writeIds } from '../src/core/ids/write';
import { doc, spec } from './helpers/ids';

const untitled = () => { const d = doc(spec()); return { ...d, info: { ...d.info, title: '' } }; };
const schemas = resolve(__dirname, '../packages/check/schemas');
/** The official ids.xsd (packages/check/schemas/ids-1.0.xsd is byte-identical to it) with its imports pointed at the local copies, as scripts/local-xsd.mjs does. */
const localXsd = () => {
  const dir = mkdtempSync(join(tmpdir(), 'idsbench-xsd-'));
  const text = readFileSync(join(schemas, 'ids-1.0.xsd'), 'utf8')
    .replace('schemaLocation="http://www.w3.org/2001/xml.xsd"', `schemaLocation="${join(schemas, 'xml.xsd')}"`)
    .replace('schemaLocation="http://www.w3.org/2001/XMLSchema.xsd"', `schemaLocation="${join(schemas, 'XMLSchema.xsd')}"`)
    .replace(/\s*<xs:import namespace="http:\/\/www\.w3\.org\/2001\/XMLSchema-instance"[^>]*\/>/, '');
  writeFileSync(join(dir, 'ids.xsd'), text);
  return { dir, xsd: join(dir, 'ids.xsd') };
};
const hasXmllint = spawnSync('xmllint', ['--version']).status === 0;

describe('an IDS file with no title', () => {
  it('is not blocked by the form: the title is suggested, not required', () => {
    const issues = checkDocument(untitled()).filter((i) => i.key === 'info.title');
    expect(issues.map((i) => i.level)).toEqual(['advice']);
    expect(issues[0].message).toBe('A title is not required, but it helps people tell this IDS from others. Give it one if you can.');
    expect(checkDocument(untitled()).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('a blank document still needs a specification, and only that', () => {
    expect(checkDocument({ ...untitled(), specifications: [] }).filter((i) => i.level === 'error').map((i) => i.key)).toEqual(['specs']);
  });
  it('is written with an empty <title>, which the schema needs as an element', () => {
    expect(writeIds(untitled())).toContain('<title></title>');
  });
  it('as written by the form, passes Check', async () => {
    const view = await checkText(writeIds(untitled()));
    expect(view).toMatchObject({ kind: 'report', valid: true, errors: 0, warnings: 0 });
  });
  it.skipIf(!hasXmllint)('as written by the form, is valid against the official schema (xmllint, no network)', () => {
    const { dir, xsd } = localXsd();
    const file = join(dir, 'untitled.ids');
    writeFileSync(file, writeIds(untitled()));
    const r = spawnSync('xmllint', ['--noout', '--nonet', '--schema', xsd, file], { encoding: 'utf8', env: { ...process.env, XML_CATALOG_FILES: '/dev/null' } });
    expect(r.stderr.trim()).toBe(`${file} validates`);
    expect(r.status).toBe(0);
    // The same schema refuses a file with no <title> element at all: the empty element is what makes it valid.
    writeFileSync(file, writeIds(untitled()).replace(/\s*<title><\/title>/, ''));
    expect(spawnSync('xmllint', ['--noout', '--nonet', '--schema', xsd, file], { encoding: 'utf8', env: { ...process.env, XML_CATALOG_FILES: '/dev/null' } }).status).not.toBe(0);
  });
});
