/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Dev-time only. xmllint reads schemas from files, and the official ids.xsd imports the W3C schemas by web
// address. This writes a copy of ids.xsd whose imports point at local files, so a check never goes online.
// Usage: node scripts/local-xsd.mjs <official ids.xsd> <dir holding xml.xsd and XMLSchema.xsd> <output ids.xsd>
// (In the directory, XMLSchema.xsd must import "xml.xsd" by that relative name.)
import fs from 'node:fs';
import path from 'node:path';

const [ids, dir, out] = process.argv.slice(2);
if (!ids || !dir || !out) throw new Error('usage: local-xsd.mjs <ids.xsd> <dir> <output>');
for (const f of ['xml.xsd', 'XMLSchema.xsd']) if (!fs.existsSync(path.join(dir, f))) throw new Error(`${f} not found in ${dir}`);
const text = fs.readFileSync(ids, 'utf8')
  .replace('schemaLocation="http://www.w3.org/2001/xml.xsd"', `schemaLocation="${path.resolve(dir, 'xml.xsd')}"`)
  .replace('schemaLocation="http://www.w3.org/2001/XMLSchema.xsd"', `schemaLocation="${path.resolve(dir, 'XMLSchema.xsd')}"`)
  .replace(/\s*<xs:import namespace="http:\/\/www\.w3\.org\/2001\/XMLSchema-instance"[^>]*\/>/, '');
fs.writeFileSync(out, text);
