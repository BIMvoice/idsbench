/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Regenerates src/ifc-data/*.generated.ts from the IFC tables in buildingSMART/IDS-Audit-tool (MIT):
//   ids-lib/IfcSchema/SchemaInfo.{Schemas,Attributes,Properties,ObjectTypes,ObjectTypes.manual,MeasureNames,ClassAndAttributeNames}.g.cs
// usage: node scripts/build-ifc-data.mjs <path-to-IDS-Audit-tool-clone>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The notice every source file of the repository carries (scripts/check-headers.mjs checks that it is at the top).
const NOTICE = '/* This Source Code Form is subject to the terms of the Mozilla Public\n * License, v. 2.0. If a copy of the MPL was not distributed with this\n * file, You can obtain one at https://mozilla.org/MPL/2.0/. */\n';
const repo = process.argv[2];
if (!repo) { console.error('usage: build-ifc-data.mjs <IDS-Audit-tool clone>'); process.exit(2); }
const dir = join(repo, 'ids-lib', 'IfcSchema');
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ifc-data');
mkdirSync(outDir, { recursive: true });
const read = (f) => readFileSync(join(dir, f), 'utf8').replace(/^﻿/, '');

// ---- tiny argument tokenizer for the generated C# -------------------------------------------------------
function skipWs(s, i) { while (i < s.length && /\s/.test(s[i])) i++; return i; }
function readString(s, i) {
  let out = ''; i++;
  while (s[i] !== '"') { if (s[i] === '\\') { const n = s[i + 1]; out += n === 'n' ? '\n' : n; i += 2; } else out += s[i++]; }
  return [out, i + 1];
}
function readArg(s, i) {
  i = skipWs(s, i);
  if (s[i] === '"') return readString(s, i);
  const m = /^(?:new\s*(?:string)?\s*\[\s*\]\s*)?([\[{])/.exec(s.slice(i, i + 40));
  if (m) {
    i += m[0].length;
    const close = m[1] === '[' ? ']' : '}';
    const list = [];
    for (;;) {
      i = skipWs(s, i);
      if (s[i] === close) return [list, i + 1];
      if (s[i] === ',') { i++; continue; }
      if (s[i] !== '"') throw new Error('bad list at ' + s.slice(i, i + 60));
      const [v, j] = readString(s, i); list.push(v); i = j;
    }
  }
  const id = /^[A-Za-z_][\w.]*/.exec(s.slice(i, i + 80));
  if (id) return [id[0], i + id[0].length];
  throw new Error('bad arg at ' + s.slice(i, i + 60));
}
function readArgs(s, i, max) { // i just after "("
  const args = [];
  while (args.length < max) {
    const [v, j] = readArg(s, i); args.push(v); i = skipWs(s, j);
    if (s[i] === ',') i++; else break;
  }
  return args;
}
function calls(text, prefix, max) {
  const out = []; let from = 0;
  for (;;) {
    const k = text.indexOf(prefix, from); if (k < 0) return out;
    try { out.push(readArgs(text, k + prefix.length, max)); } catch (e) { throw new Error(prefix + ': ' + e.message); }
    from = k + prefix.length;
  }
}
function sections(text, markers) { // markers in file order -> text slices
  const idx = markers.map((m) => { const k = text.indexOf(m); if (k < 0) throw new Error('marker ' + m); return k; });
  return idx.map((k, n) => text.slice(k, n + 1 < idx.length ? idx[n + 1] : text.length));
}

const V = ['IFC2X3', 'IFC4', 'IFC4X3_ADD2'];
const schemas = read('SchemaInfo.Schemas.g.cs');
const classSecs = sections(schemas, ['GetClassesIFC2x3()', 'GetClassesIFC4()', 'GetClassesIFC4x3()']);
const attrSecs = sections(read('SchemaInfo.Attributes.g.cs'), ['GetAttributesIFC2x3(', 'GetAttributesIFC4(', 'GetAttributesIFC4x3(']);
const propSecs = sections(read('SchemaInfo.Properties.g.cs'), ['GetPropertiesIFC2x3()', 'GetPropertiesIFC4()', 'GetPropertiesIFC4x3()']);
const objTypes = read('SchemaInfo.ObjectTypes.g.cs');
const relSecs = [
  read('SchemaInfo.ObjectTypes.manual.cs'),
  ...sections(objTypes, ['GetRelationTypesIFC4(', 'GetRelationTypesIFC4x3(']),
];

function classesOf(sec) {
  const out = [];
  let from = 0;
  for (;;) {
    const k = sec.indexOf('new ClassInfo(', from); if (k < 0) break;
    const a = readArgs(sec, k + 'new ClassInfo('.length, 5);
    if (Array.isArray(a[2])) out.push([a[0], '', 'E', a[2]]); // enumeration: (name, namespace, values)
    else out.push([a[0], a[1], a[2].replace('ClassType.', '')[0], Array.isArray(a[3]) ? a[3] : []]);
    from = k + 10;
  }
  return out;
}
function psetsOf(sec) {
  const out = [];
  const parts = sec.split('yield return new PropertySetInfo(').slice(1);
  for (const p of parts) {
    const name = readString(p, p.indexOf('"'))[0];
    const props = [];
    for (const [kind, ctor] of [['e', 'new EnumerationPropertyType('], ['s', 'new SingleValuePropertyType('], ['l', 'new ListValuePropertyType('], ['t', 'new TableValuePropertyType(']]) {
      let from = 0;
      for (;;) {
        const k = p.indexOf(ctor, from); if (k < 0) break;
        const a = readArgs(p, k + ctor.length, 3);
        props.push([k, a[0], kind, kind === 'e' ? a[1] : kind === 't' ? [a[1], a[2]] : a[1]]);
        from = k + ctor.length;
      }
    }
    props.sort((x, y) => x[0] - y[0]);
    // applicable classes: the last "new [] { ... }" list that follows the property block
    const tail = p.slice(p.lastIndexOf('new [] {') >= 0 ? p.lastIndexOf('new [] {') : p.length);
    const appl = tail.startsWith('new [] {') ? readArg(tail, 0)[0] : [];
    out.push([name, appl, props.map((x) => x.slice(1))]);
  }
  return out;
}

const attrAll = read('SchemaInfo.ClassAndAttributeNames.g.cs');
const bits = (l) => (l.includes('Ifc2x3') ? 1 : 0) | (l.includes('Ifc4') ? 2 : 0) | (l.includes('Ifc4x3') ? 4 : 0);
const allAttributes = calls(attrAll, 'new IfcAttributeInformation(', 2).map(([n, v]) => [n, bits(v)]);
const dataTypes = [];
for (const line of read('SchemaInfo.MeasureNames.g.cs').split('\n')) {
  const k = line.indexOf('new IfcDataTypeInformation(');
  if (k < 0) continue;
  const rest = line.slice(k + 'new IfcDataTypeInformation('.length);
  const [name, i1] = readArg(rest, 0);
  const j = skipWs(rest, i1) + 1;
  const [vers, i2] = readArg(rest, j);
  const j2 = skipWs(rest, i2) + 1;
  const tail = rest.slice(j2).trimStart();
  let backing = null;
  if (tail.startsWith('"')) backing = readString(tail, 0)[0];
  else {
    // new IfcMeasureInformation(...) { BackingType = "xs:double" } or a trailing backing-type string: take the last xs: literal
    const m = tail.match(/"(xs:[A-Za-z]+)"/g);
    backing = m ? m[m.length - 1].slice(1, -1) : null;
  }
  dataTypes.push([name, bits(vers), backing]);
}

// partOf relations (identical rows for each version, apart from the 2x3 spatial structure class)
const partOf = {};
{
  const t = read('SchemaInfo.PartOfRelations.g.cs');
  const ver = { 'IfcSchemaVersions.Ifc2x3': 'IFC2X3', 'IfcSchemaVersions.Ifc4)': 'IFC4', 'IfcSchemaVersions.Ifc4x3)': 'IFC4X3_ADD2' };
  const blocks = t.split('if (Version == ').slice(1);
  const names = ['IFC2X3', 'IFC4', 'IFC4X3_ADD2'];
  blocks.forEach((b, n) => { partOf[names[n]] = calls(b, 'new PartOfRelationInformation(', 3); });
  void ver;
}

for (let n = 0; n < 3; n++) {
  const relTypes = calls(relSecs[n], 'schema.AddRelationType(', 2).length ? [] : [];
  const rt = [];
  for (const m of relSecs[n].matchAll(/AddRelationType\(([^)]*)\)/g)) {
    const a = readArgs(m[1], 0, 20); rt.push([a[0], a.slice(1)]);
  }
  const attrs = calls(attrSecs[n], 'destinationSchema.AddAttribute(', 5).map((a) => {
    const [name, , , allClasses, valueTypes] = a;
    return [name, Array.isArray(valueTypes) ? valueTypes : null, Array.isArray(allClasses) ? allClasses : []];
  });
  const data = { classes: classesOf(classSecs[n]), attributes: attrs, psets: psetsOf(propSecs[n]), relTypes: rt, partOf: partOf[V[n]] };
  void relTypes;
  const file = `schema-${V[n].toLowerCase()}.generated.ts`;
  writeFileSync(join(outDir, file), `${NOTICE}// GENERATED by scripts/build-ifc-data.mjs from buildingSMART/IDS-Audit-tool (MIT). Do not edit.\nimport type { RawSchema } from '../ifc.ts';\nconst d: RawSchema = ${JSON.stringify(data)};\nexport default d;\n`);
  console.log(file, 'classes', data.classes.length, 'attrs', attrs.length, 'psets', data.psets.length, 'relTypes', rt.length, 'partOf', data.partOf.length);
}
writeFileSync(join(outDir, 'common.generated.ts'), `${NOTICE}// GENERATED by scripts/build-ifc-data.mjs from buildingSMART/IDS-Audit-tool (MIT). Do not edit.\n/** [name, versionBits (1=IFC2X3, 2=IFC4, 4=IFC4X3)] for every attribute name known to any version. */\nexport const ALL_ATTRIBUTES: [string, number][] = ${JSON.stringify(allAttributes)};\n/** [UPPERCASE name, versionBits, backing XSD type or null] */\nexport const DATA_TYPES: [string, number, string | null][] = ${JSON.stringify(dataTypes)};\n`);
console.log('common: allAttributes', allAttributes.length, 'dataTypes', dataTypes.length, 'withBacking', dataTypes.filter((d) => d[2]).length);
