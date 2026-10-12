/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// scripts/check-headers.mjs covers every file git knows by its extension, so a new top-level folder cannot escape it;
// what it skips is a short list of data (fonts, schemas, fixtures), named in the script.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error the script is plain JavaScript, with no declaration file
import { NOTICE, authoredFiles } from '../scripts/check-headers.mjs';

const script = path.resolve('scripts/check-headers.mjs');
const scratch = path.resolve('.scratch');
let root = '';
const put = (file: string, text: string) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text); };
const notice = `/* ${(NOTICE as string[]).join('\n * ')} */\n`;
const run = () => spawnSync('node', [path.join(root, 'scripts/check-headers.mjs')], { encoding: 'utf8' });

beforeAll(() => {
  fs.mkdirSync(scratch, { recursive: true });
  root = fs.mkdtempSync(path.join(scratch, 'headers-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  put('scripts/check-headers.mjs', fs.readFileSync(script, 'utf8'));
  put('src/a.ts', `${notice}export const a = 1;\n`);
});
afterAll(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); });

describe('the header check covers every source file of the repository', () => {
  it('passes while every file carries the notice', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
  });

  it('exits 1 for a file with no notice in a folder that did not exist before, and names it', () => {
    put('newfolder/deep/tool.mjs', 'export const x = 1;\n');
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('newfolder/deep/tool.mjs');
  });

  it('a top-level file of any of the extensions is covered, and data is not', () => {
    put('newfolder/deep/tool.mjs', `${notice}export const x = 1;\n`);
    put('tooling.config.ts', 'export default {};\n');
    put('site/page.html', '<!doctype html>\n<p>x</p>\n');
    put('src/fonts/binary.js', 'not ours\n');
    put('tests/fixtures/data.ts', 'data\n');
    put('packages/check/schemas/x.js', 'data\n');
    put('notes.md', '# not code\n');
    expect((authoredFiles as (r: string) => string[])(root)).toEqual(['newfolder/deep/tool.mjs', 'scripts/check-headers.mjs', 'site/page.html', 'src/a.ts', 'tooling.config.ts']);
    expect(run().status).toBe(1);
  });
});
