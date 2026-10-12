/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Reads every IDS 1.0 file under a directory into the editor's model, writes it back, and checks the result:
//   1. it is valid against the official schema (xmllint, local files only),
//   2. @ifc-lite/ids parses it to the same result as the original (whitespace normalised),
//   3. for pass-/fail- pairs, the app's own runValidation gives the same verdict for the rewritten IDS as for the original.
// Files that declare another IDS version are counted apart; invalid-* files are not read at all.
// Usage: npx vite-node scripts/roundtrip.ts <dir with .ids files> <ids.xsd with local imports> <output dir> [rows.json]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { parseIDS } from '@ifc-lite/ids';
import { nodeEnv } from '../tests/helpers/dom';
import { readIdsText } from '../src/core/ids/read';
import { writeIds } from '../src/core/ids/write';
import { readIds, runValidation } from '../src/core/validate';

const [root, xsd, outDir, rowsFile] = process.argv.slice(2);
if (!root || !xsd || !outDir) throw new Error('usage: roundtrip.ts <dir> <ids.xsd> <output dir> [rows.json]');
const parse = nodeEnv.parse;

const original = { log: console.log, warn: console.warn, error: console.error, info: console.info };
const mute = () => { console.log = console.warn = console.error = console.info = () => {}; };
const unmute = () => { Object.assign(console, original); };

const files: string[] = [];
const walk = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); f.isDirectory() ? walk(p) : f.name.endsWith('.ids') && files.push(p); } };
walk(root);
files.sort();

const xmllint = (file: string) => {
  const r = spawnSync('/usr/bin/xmllint', ['--noout', '--nonet', '--schema', xsd, file], { encoding: 'utf8', env: { ...process.env, XML_CATALOG_FILES: '/dev/null' } });
  return { ok: r.status === 0, message: (r.stderr || '').split('\n').filter((l) => !/validates$/.test(l)).slice(0, 2).join(' ').trim() };
};
const norm = (x: unknown): unknown => {
  if (typeof x === 'string') return x.replace(/\s+/g, ' ').trim();
  if (Array.isArray(x)) return x.map(norm);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).filter(([k, v]) => k !== 'schemaLocation' && v !== undefined).map(([k, v]) => [k, norm(v)]));
  return x;
};
const diffAt = (a: unknown, b: unknown, p = ''): string => {
  if (isDeepStrictEqual(a, b)) return '';
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = diffAt((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${p}.${k}`);
      if (d) return d;
    }
  }
  return `${p}: ${JSON.stringify(a)?.slice(0, 80)} vs ${JSON.stringify(b)?.slice(0, 80)}`;
};
// A second, stricter equality that does not depend on what parseIDS keeps (it drops uri, comments inside
// restrictions and the description of the requirements): the two XML trees, prefixes ignored, whitespace
// between elements ignored, schema defaults written out on both sides.
const canon = (el: Element, inReq = false): unknown => {
  const attrs: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) {
    if (a.name === 'xmlns' || a.name.startsWith('xmlns:') || a.name.startsWith('xsi:')) continue;
    attrs[a.localName ?? a.name] = a.value;
  }
  if (el.localName === 'applicability') { attrs.minOccurs ??= '1'; attrs.maxOccurs ??= '1'; }
  if (inReq && ['attribute', 'classification', 'property', 'material', 'partOf'].includes(el.localName)) attrs.cardinality ??= 'required';
  const children = Array.from(el.childNodes).filter((n) => n.nodeType === 1) as Element[];
  // Text only counts where it is the content: a value, a comment, a metadata field; not indentation in an empty element.
  const text = children.length === 0 && (el.localName === 'simpleValue' || (el.textContent ?? '').trim() !== '') ? (el.textContent ?? '') : '';
  return [el.localName, attrs, text, children.map((c) => canon(c, inReq || el.localName === 'requirements'))];
};
const xmlTree = (t: string) => canon(parse(t.replace(/^\uFEFF/, '')).documentElement);
const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const sig = (r: Awaited<ReturnType<typeof runValidation>>) => JSON.stringify({ v: r.verdict, s: r.specs.map((s) => [s.state, s.applicable, s.passed, s.failed]) });

interface Row { file: string; folder: string; status: string; originalValid: boolean; schemaValid?: boolean; parseEqual?: boolean; xmlEqual?: boolean; verdictEqual?: boolean | null; reason: string[] }
const rows: Row[] = [];
let invalidSkipped = 0, notV1 = 0, schemaLocDiffer = 0;
for (const f of files) {
  const rel = path.relative(root, f);
  const base = path.basename(f, '.ids');
  if (base.startsWith('invalid-')) { invalidSkipped++; continue; }
  const text = fs.readFileSync(f, 'utf8');
  const row: Row = { file: rel, folder: path.dirname(rel), status: 'read', originalValid: xmllint(f).ok, reason: [] };
  let model;
  try { model = readIdsText(text, nodeEnv); } catch (e) {
    const err = e as { kind?: string; message: string };
    if (err.kind === 'ids-old-version') { notV1++; continue; }
    row.status = 'unreadable'; row.reason.push('read: ' + err.message); rows.push(row); continue;
  }
  const out = writeIds(model);
  const dest = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out);
  const x = xmllint(dest);
  row.schemaValid = x.ok;
  if (!x.ok) row.reason.push('schema: ' + x.message);
  mute();
  let a: unknown, b: unknown;
  try { a = parseIDS(text); b = parseIDS(out); } finally { unmute(); }
  if ((a as { schemaLocation?: string }).schemaLocation !== (b as { schemaLocation?: string }).schemaLocation) schemaLocDiffer++;
  const d = diffAt(norm(a), norm(b));
  row.parseEqual = d === '';
  if (d) row.reason.push('parse: ' + d);
  const xt = diffAt(xmlTree(text), xmlTree(out));
  row.xmlEqual = xt === '';
  if (xt) row.reason.push('xml: ' + xt);
  const ifc = f.replace(/\.ids$/, '.ifc');
  row.verdictEqual = null;
  if (/^(pass|fail)-/.test(base) && fs.existsSync(ifc)) {
    const bytes = fs.readFileSync(ifc);
    mute();
    try {
      const run = (t: string) => runValidation({ ids: readIds(t), idsName: 'a.ids', ifcBytes: ab(bytes).slice(0), ifcName: 'm.ifc' }).then(sig, (e: { kind?: string }) => 'error:' + (e.kind ?? 'x'));
      const [o, n] = [await run(text), await run(out)];
      row.verdictEqual = o === n;
      if (o !== n) row.reason.push(`verdict: ${o} vs ${n}`);
    } finally { unmute(); }
  }
  rows.push(row);
}
const read = rows.filter((r) => r.status === 'read');
const folders = new Map<string, Row[]>();
for (const r of rows) folders.set(r.folder, [...(folders.get(r.folder) ?? []), r]);
const pad = (s: string, n: number) => s.padEnd(n);
console.log(`${pad('folder', 28)} read  schema-valid  parse-equal  xml-equal  verdict-equal/pairs`);
for (const [k, rs] of [...folders].sort()) {
  const pairs = rs.filter((r) => r.verdictEqual !== null && r.verdictEqual !== undefined);
  console.log(`${pad(k, 28)} ${String(rs.filter((r) => r.status === 'read').length).padStart(4)}  ${String(rs.filter((r) => r.schemaValid).length).padStart(12)}  ${String(rs.filter((r) => r.parseEqual).length).padStart(11)}  ${String(rs.filter((r) => r.xmlEqual).length).padStart(9)}  ${pairs.filter((r) => r.verdictEqual).length}/${pairs.length}`);
}
const pairs = read.filter((r) => r.verdictEqual !== null && r.verdictEqual !== undefined);
console.log(`TOTAL files found: ${files.length}; skipped invalid-*: ${invalidSkipped}; skipped, not IDS 1.0: ${notV1}; unreadable: ${rows.length - read.length}`);
console.log(`TOTAL read: ${read.length}; schema-valid after rewrite: ${read.filter((r) => r.schemaValid).length}; parse-equal: ${read.filter((r) => r.parseEqual).length}; xml-equal (stricter): ${read.filter((r) => r.xmlEqual).length}; verdict-equal: ${pairs.filter((r) => r.verdictEqual).length} of ${pairs.length} pairs`);
console.log(`originals that were not schema-valid: ${read.filter((r) => !r.originalValid).length}; rewritten files whose schemaLocation text differs from the original: ${schemaLocDiffer}`);
const bad = rows.filter((r) => r.status !== 'read' || !r.schemaValid || !r.parseEqual || !r.xmlEqual || r.verdictEqual === false);
console.log(`FAILURES: ${bad.length}`);
for (const r of bad) console.log(`  ${r.file} | ${r.reason.join(' | ')}`);
if (rowsFile) fs.writeFileSync(rowsFile, JSON.stringify(rows, null, 1));
process.exit(bad.length ? 1 : 0);
