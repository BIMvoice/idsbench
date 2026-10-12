/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Prints what the Check engine says about one IDS file, as JSON, so the browser check can compare the page with it.
// Usage: npx vite-node scripts/engine-findings.ts <file.ids>
import fs from 'node:fs';
import { checkIds } from '@idsbench/check';

const file = process.argv[2];
if (!file) throw new Error('usage: engine-findings.ts <file.ids>');
const r = await checkIds(fs.readFileSync(file, 'utf8'));
process.stdout.write(`\n@@${JSON.stringify(r)}\n`);
