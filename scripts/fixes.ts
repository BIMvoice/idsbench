/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// For every IDS file the Check engine rejects, under the directories given: which findings get a one-press fix, what
// the fix does, and whether the engine accepts the file afterwards; and for the findings without one, where "Fix"
// leads. It does what the page does (the same candidates, the same proof by the engine on the text the page would
// write), without the page.
// Usage: npx vite-node scripts/fixes.ts <dir> [<dir> ...] [--rows out.json]
import fs from 'node:fs';
import path from 'node:path';
import { checkIds, type Finding } from '@idsbench/check';
import { loadSchema } from '@idsbench/check/ifc';
import { nodeEnv } from '../tests/helpers/dom';
import { contentKey, keepSource, writeKept } from '../src/core/ids/keep';
import type { IdsDocument } from '../src/core/ids/model';
import { readIdsText } from '../src/core/ids/read';
import { writeIds } from '../src/core/ids/write';
import { dataTypeFor } from '../src/core/picks';
import { outline, targetOf } from '../src/core/place';
import { candidateFixes, verifyFixes } from '../src/core/quickfix';

const args = process.argv.slice(2);
const rowsAt = args.indexOf('--rows');
const rowsFile = rowsAt === -1 ? null : args.splice(rowsAt, 2)[1];
if (args.length === 0) throw new Error('usage: fixes.ts <dir> [<dir> ...] [--rows out.json]');
const files: string[] = [];
const walk = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.ids')) files.push(p); } };
args.forEach(walk);
files.sort();

const original = { log: console.log, warn: console.warn, error: console.error };
const quiet = async <T>(fn: () => T | Promise<T>): Promise<T> => { console.log = console.warn = console.error = () => {}; try { return await fn(); } finally { Object.assign(console, original); } };
const ifc4 = await loadSchema('IFC4');

interface Row { file: string; code: string; message: string; target: string; fix: string | null; goneAfter: boolean | null; validAfter: boolean | null; errorsBefore: number; errorsAfter: number | null; partsChanged: number | null; outsideUnchanged: boolean | null }
const rows: Row[] = [];
let invalid = 0, notInForms = 0, notUtf8 = 0;
for (const file of files) {
  const bytes = fs.readFileSync(file);
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { notUtf8++; continue; }
  const first = await quiet(() => checkIds(text));
  if (first.valid) continue;
  invalid++;
  let doc: IdsDocument;
  try { doc = await quiet(() => readIdsText(text, nodeEnv)); } catch { notInForms++; for (const f of first.findings) rows.push({ file, code: f.code, message: f.message, target: 'not opened in the forms', fix: null, goneAfter: null, validAfter: null, errorsBefore: first.findings.filter((x) => x.severity === 'error').length, errorsAfter: null, partsChanged: null, outsideUnchanged: null }); continue; }
  const kept = await quiet(() => keepSource(text, doc, nodeEnv));
  const textOf = (d: IdsDocument) => (kept ? writeKept(kept, d).text : writeIds(d));
  const errors = first.findings.filter((f) => f.severity === 'error').length;
  const lines = outline(text);
  for (const f of first.findings) {
    const target = targetOf(f, doc, lines);
    const candidates = candidateFixes(f, doc, target, (set, name) => dataTypeFor(ifc4, set, name), { specification: (s) => !!kept && !s.rewrite, info: !!kept, file: !!kept });
    const check = async (d: IdsDocument): Promise<Finding[]> => (await quiet(() => checkIds(textOf(d)))).findings;
    const ok = await verifyFixes(f, candidates, doc, errors, check);
    const where = target.kind === 'field' ? `field ${target.key.slice(target.key.indexOf('.') + 1)}` : target.kind;
    if (ok.length === 0) { rows.push({ file, code: f.code, message: f.message, target: where, fix: null, goneAfter: null, validAfter: null, errorsBefore: errors, errorsAfter: null, partsChanged: null, outsideUnchanged: null }); continue; }
    for (const fix of ok) {
      const after = fix.apply(doc);
      const out = textOf(after);
      const again = await quiet(() => checkIds(out));
      // What changed in the document, counted in parts (specifications and the info section), and whether the text outside them is the file's own.
      const changedSpecs = after.specifications.filter((s, i) => !doc.specifications[i] || contentKey(s) !== contentKey(doc.specifications[i]) || s.rewrite).length;
      const partsChanged = changedSpecs + (JSON.stringify(after.info) !== JSON.stringify(doc.info) || after.rewrite === 'info' ? 1 : 0);
      let outside: boolean | null = null;
      if (kept && after.rewrite !== 'all') {
        const i = after.specifications.findIndex((s, j) => contentKey(s) !== contentKey(doc.specifications[j]) || s.rewrite);
        outside = i === -1 ? true : out.startsWith(kept.before + (after.rewrite === 'info' ? '' : kept.info + kept.between + kept.specs.slice(0, i).map((s) => s.lead + s.body).join(''))) && out.endsWith(kept.specs.slice(i + 1).map((s) => s.lead + s.body).join('') + kept.tail);
      }
      rows.push({
        file, code: f.code, message: f.message, target: where, fix: fix.label.replace(/Change it to .*/, 'Change it to <the name the engine gives>').replace(/Remove the \d+ "Must have" items?/, 'Remove the N "Must have" items').replace(/Add the data type .*/, 'Add the data type <of the standard property>'),
        goneAfter: !again.findings.some((x) => x.code === f.code && x.path === f.path), validAfter: again.valid,
        errorsBefore: errors, errorsAfter: again.findings.filter((x) => x.severity === 'error').length, partsChanged, outsideUnchanged: outside,
      });
    }
  }
}
if (rowsFile) fs.writeFileSync(rowsFile, JSON.stringify(rows, null, 1));

const by = new Map<string, Row[]>();
for (const r of rows) by.set(r.code, [...(by.get(r.code) ?? []), r]);
console.log(`files: ${files.length}; rejected by the engine: ${invalid}; of those not opened in the forms: ${notInForms}; not UTF-8 text: ${notUtf8}`);
console.log(['finding code', 'files', 'findings', 'fix offered (findings)', 'finding gone after', 'file valid after', 'more than one part changed', 'text outside the part changed', 'no fix: Fix leads to'].join(' | '));
for (const [code, list] of [...by].sort()) {
  const fixed = list.filter((r) => r.fix);
  const labels = new Map<string, number>();
  for (const r of fixed) labels.set(r.fix!, (labels.get(r.fix!) ?? 0) + 1);
  const none = new Map<string, number>();
  for (const r of list.filter((x) => !x.fix)) none.set(r.target, (none.get(r.target) ?? 0) + 1);
  console.log([
    code, new Set(list.map((r) => r.file)).size, new Set(list.map((r) => `${r.file}|${r.message}|${r.target}`)).size,
    [...labels].map(([l, n]) => `${l} (${n})`).join('; ') || '-',
    fixed.length ? `${fixed.filter((r) => r.goneAfter).length}/${fixed.length}` : '-',
    fixed.length ? `${fixed.filter((r) => r.validAfter).length}/${fixed.length}` : '-',
    fixed.filter((r) => (r.partsChanged ?? 0) > 1).length,
    fixed.filter((r) => r.outsideUnchanged === false).length,
    [...none].map(([t, n]) => `${t} (${n})`).join('; ') || '-',
  ].join(' | '));
}
const offered = rows.filter((r) => r.fix);
console.log(`findings: ${rows.length}; fixes offered: ${offered.length}; finding gone after the fix: ${offered.filter((r) => r.goneAfter).length}; whole file valid after one fix: ${offered.filter((r) => r.validAfter).length}`);
