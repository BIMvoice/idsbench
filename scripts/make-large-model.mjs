/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Writes an IFC4 model of many walls (streamed, so any size) for measuring how a run scales, and the IDS file to run it against.
// Usage: node scripts/make-large-model.mjs <walls> <out.ifc> <pass|fail|filler> [<out.ids> [<name of the walls in pass mode, Waldo>]]
//   pass:   every wall is named "Waldo"  (the IDS wants Name = Waldo)
//   fail:   every wall has a name of its own ("Wall 17")
//   filler: three walls, all passing, and the rest of the file is other building elements (nothing applies to them)
import fs from 'node:fs';
const [n, out, mode = 'fail', idsOut] = [Number(process.argv[2]), process.argv[3], process.argv[4], process.argv[5]];
if (!n || !out) throw new Error('usage: make-large-model.mjs <walls> <out.ifc> <pass|fail|filler> [<out.ids>]');
const guid = (i) => String(i).padStart(22, '0');
const fd = fs.openSync(out, 'w');
fs.writeSync(fd, "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\nFILE_NAME('','2022-10-07T13:48:44',(),(),'x','x','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n");
let buf = [];
const flush = () => { fs.writeSync(fd, buf.join('')); buf = []; };
for (let i = 1; i <= n; i++) {
  const wall = mode === 'filler' ? i <= 3 : true;
  const cls = wall ? 'IFCWALL' : 'IFCBUILDINGELEMENTPROXY';
  const name = mode === 'fail' ? `Wall ${i}` : (process.argv[6] ?? 'Waldo');
  buf.push(`#${i}=${cls}('${guid(i)}',$,'${name}',$,$,$,$,$,${wall ? '$' : '$'});\n`);
  if (i % 20000 === 0) flush();
}
flush();
fs.writeSync(fd, 'ENDSEC;\nEND-ISO-10303-21;\n');
fs.closeSync(fd);
if (idsOut) fs.writeFileSync(idsOut, `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">
  <info><title>Walls are named Waldo</title></info>
  <specifications>
    <specification name="Walls are named Waldo" ifcVersion="IFC4">
      <applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>
      <requirements><attribute><name><simpleValue>Name</simpleValue></name><value><simpleValue>Waldo</simpleValue></value></attribute></requirements>
    </specification>
  </specifications>
</ids>
`);
