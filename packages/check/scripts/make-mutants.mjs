/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Builds extra, deterministic test files from the valid corpus files: one with a different ifcVersion and one with a
// single content mutation. Used to compare checkIds with the official tool on files neither was tuned on.
// usage: node scripts/make-mutants.mjs <out-dir>     (writes <out-dir>/NNN.ids and manifest.json)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(here, '..', 'test', 'fixtures', 'corpus');
const out = process.argv[2];
if (!out) { console.error('usage: make-mutants.mjs <out-dir>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const ref = JSON.parse(readFileSync(join(here, '..', 'test', 'fixtures', 'reference', 'reference.json'), 'utf8')).results;
const files = ref.filter((r) => r.verdict === 'valid' && r.schemaVersion === 'Ids1_0').map((r) => r.file).sort();

let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const VERSIONS = ['IFC2X3', 'IFC4', 'IFC4X3_ADD2', 'IFC2X3 IFC4', 'IFC4 IFC4X3_ADD2', 'IFC2X3 IFC4 IFC4X3_ADD2'];

const mutations = {
  'entity-name': (t) => t.replace(/(<(?:\w+:)?entity>\s*<(?:\w+:)?name>\s*<(?:\w+:)?simpleValue>)(IFC\w+)/, '$1$2X'),
  'attribute-name': (t) => t.replace(/(<(?:\w+:)?attribute[^>]*>\s*<(?:\w+:)?name>\s*<(?:\w+:)?simpleValue>)(\w+)/, '$1$2Zz'),
  'predefined-type': (t) => t.replace(/(<(?:\w+:)?predefinedType>\s*<(?:\w+:)?simpleValue>)([^<]+)/, '$1NOSUCHTYPE'),
  'datatype': (t) => t.replace(/dataType="(\w+)"/, 'dataType="$1X"'),
  'pset-reserved': (t) => t.replace(/(<(?:\w+:)?propertySet>\s*<(?:\w+:)?simpleValue>)([^<]+)/, '$1Pset_MyOwnSet'),
  'property-name': (t) => t.replace(/(<(?:\w+:)?baseName>\s*<(?:\w+:)?simpleValue>)([^<]+)/, '$1$2Qq'),
  'cardinality-optional': (t) => t.replace(/cardinality="required"/, 'cardinality="optional"'),
  'applicability-optional': (t) => t.replace(/(<(?:\w+:)?applicability[^>]*)minOccurs="1"/, '$1minOccurs="0"'),
  'regex-broken': (t) => t.replace(/(<(?:\w+:)?pattern value=")([^"]*)/, '$1[$2'),
};

const manifest = [];
let n = 0;
for (const f of files) {
  const text = readFileSync(join(corpus, f), 'utf8');
  const make = (kind, mutated) => {
    if (mutated === text) return;
    const name = String(++n).padStart(4, '0') + '.ids';
    writeFileSync(join(out, name), mutated);
    manifest.push({ file: name, source: f, mutation: kind });
  };
  const v = pick(VERSIONS);
  make('ifcVersion=' + v, text.replace(/ifcVersion="[^"]*"/g, `ifcVersion="${v}"`));
  const k = pick(Object.keys(mutations));
  make(k, mutations[k](text));
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`${manifest.length} mutants`);
