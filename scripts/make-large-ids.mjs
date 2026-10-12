/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Writes an IDS 1.0 file with many specifications, for timing the check of a large file.
// Usage: node scripts/make-large-ids.mjs <count> <output file>
import fs from 'node:fs';
const count = Number(process.argv[2] ?? 2000);
const out = process.argv[3];
if (!out) throw new Error('usage: make-large-ids.mjs <count> <output file>');
const NS = 'http://standards.buildingsmart.org/IDS';
const classes = ['IFCWALL', 'IFCDOOR', 'IFCWINDOW', 'IFCSLAB', 'IFCBEAM', 'IFCCOLUMN', 'IFCROOF', 'IFCSTAIR'];
let body = '';
for (let i = 1; i <= count; i++) {
  const cls = classes[i % classes.length];
  body += `    <specification name="Specification ${i}" ifcVersion="IFC4">
      <applicability minOccurs="1" maxOccurs="unbounded">
        <entity><name><simpleValue>${cls}</simpleValue></name></entity>
      </applicability>
      <requirements>
        <attribute><name><simpleValue>Name</simpleValue></name><value><xs:restriction base="xs:string"><xs:pattern value="[A-Z]{2}-[0-9]+"/></xs:restriction></value></attribute>
        <property dataType="IFCLABEL"><propertySet><simpleValue>Pset_${cls.slice(3, 4)}${cls.slice(4).toLowerCase()}Common</simpleValue></propertySet><baseName><simpleValue>Status</simpleValue></baseName></property>
      </requirements>
    </specification>
`;
}
fs.writeFileSync(out, `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="${NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NS} ${NS}/1.0/ids.xsd">
  <info><title>${count} specifications</title></info>
  <specifications>
${body}  </specifications>
</ids>
`);
