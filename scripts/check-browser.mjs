// Runs the three browser scripts against the built site (run `npm run build` first): writing and editing an IDS file;
// checking it, running a model against it and fixing it in place; and what the saved file is, what happens when
// things change under a run, what survives a reload, odd input and the keyboard journeys. All on the one page. Headless Chromium with
// every non-local request blocked. scripts/ASSERTIONS.md lists what is asserted.
// Usage: npm run check:browser -- <clone of buildingSMART/IDS> [a large IFC model]      (set CHROMIUM_PATH to use an already installed browser)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [clone, largeModel] = process.argv.slice(2);
if (!clone) throw new Error('usage: npm run check:browser -- <clone of buildingSMART/IDS> [a large IFC model]');
const xsd = path.resolve('.scratch/ids-local.xsd');
fs.mkdirSync(path.dirname(xsd), { recursive: true });
const run = (args) => spawnSync(process.execPath, args, { stdio: 'inherit' }).status ?? 1;
// The official schema imports the W3C schemas by web address; this copy points at the local files that ship with the Check package.
let status = run(['scripts/local-xsd.mjs', path.join(clone, 'Schema', 'ids.xsd'), 'packages/check/schemas', xsd]);
if (status === 0) status = run(['scripts/write-check.mjs', clone, xsd]) || status;
const cases = path.join(clone, 'Documentation', 'ImplementersDocumentation', 'TestCases');
if (status === 0) status = run(['scripts/browser-check.mjs', cases]) || status;
if (status === 0) status = run(['scripts/review-check.mjs', clone, ...(largeModel ? [largeModel] : [])]) || status;
process.exit(status);
