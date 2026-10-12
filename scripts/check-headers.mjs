/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Lists the source files of this repository that lack the MPL-2.0 notice (Exhibit A of the licence) and exits 1 if there
// are any. Which files carry it: what the project authors (src, scripts, tests, design, packages/check/{src,scripts,test,demo},
// the HTML pages and the configuration files in TypeScript), in the comment syntax of each; not what it bundles or
// generates by hand-written copy (fonts, the IFC and IDS schemas, the test fixtures), not JSON, lock files or Markdown.
// A file written by a script carries it because the script writes it (see packages/check/scripts).
// Usage: node scripts/check-headers.mjs            list the files that lack it
//        node scripts/check-headers.mjs --write    put it at the top of each of them (after a #! line or a doctype)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NOTICE = [
  'This Source Code Form is subject to the terms of the Mozilla Public',
  'License, v. 2.0. If a copy of the MPL was not distributed with this',
  'file, You can obtain one at https://mozilla.org/MPL/2.0/.',
];

const SCRIPT = new Set(['.ts', '.tsx', '.mjs', '.js', '.css']);
const INCLUDE = [
  /^src\//, /^scripts\//, /^tests\//, /^design\//, /^packages\/check\/(src|scripts|test|demo)\//,
  /^[^/]+\.(ts|html)$/, /^packages\/check\/[^/]+\.ts$/,
];
const EXCLUDE = [/^src\/fonts\//, /^tests\/fixtures\//, /^packages\/check\/test\/fixtures\//, /^packages\/check\/schemas\//, /(^|\/)node_modules\//];
const EXTENSIONS = new Set([...SCRIPT, '.html', '.py']);

/** The comment that holds the notice, in the syntax of a file's kind. */
export function noticeFor(file) {
  const ext = path.extname(file);
  if (ext === '.html') return `<!-- ${NOTICE.join('\n     ')} -->\n`;
  if (ext === '.py') return NOTICE.map((l) => `# ${l}`).join('\n') + '\n';
  return `/* ${NOTICE.join('\n * ')} */\n`;
}

/** True when the notice stands at the top of the text: after a #! line, a byte order mark or a doctype, and nothing but blank lines before it. */
export function hasNotice(text, file) {
  let body = text.replace(/^﻿/, '');
  if (body.startsWith('#!')) body = body.slice(body.indexOf('\n') + 1);
  if (path.extname(file) === '.html') body = body.replace(/^\s*<!doctype[^>]*>\s*/i, '');
  body = body.replace(/^\s+/, '');
  return body.startsWith(noticeFor(file).trimEnd());
}

/** The text with the notice put in at the top (after a #! line, a byte order mark or a doctype). */
export function withNotice(text, file) {
  const bom = text.startsWith('﻿') ? '﻿' : '';
  let body = bom ? text.slice(1) : text;
  let head = '';
  if (body.startsWith('#!')) { const i = body.indexOf('\n') + 1; head = body.slice(0, i); body = body.slice(i); }
  if (path.extname(file) === '.html') {
    const m = body.match(/^\s*<!doctype[^>]*>[ \t]*\r?\n?/i);
    if (m) { head += m[0]; body = body.slice(m[0].length); }
  }
  return `${bom}${head}${noticeFor(file)}${body}`;
}

export function authoredFiles(root) {
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\0').filter(Boolean);
  return listed
    .filter((f) => EXTENSIONS.has(path.extname(f)) && INCLUDE.some((r) => r.test(f)) && !EXCLUDE.some((r) => r.test(f)) && fs.existsSync(path.join(root, f)))
    .sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = authoredFiles(root);
  const missing = files.filter((f) => !hasNotice(fs.readFileSync(path.join(root, f), 'utf8'), f));
  if (process.argv.includes('--write')) {
    for (const f of missing) fs.writeFileSync(path.join(root, f), withNotice(fs.readFileSync(path.join(root, f), 'utf8'), f));
    console.log(`MPL-2.0 notice written to ${missing.length} of ${files.length} files`);
  } else if (missing.length) {
    console.error(`${missing.length} of ${files.length} source files lack the MPL-2.0 notice (node scripts/check-headers.mjs --write adds it):`);
    for (const f of missing) console.error(`  ${f}`);
    process.exit(1);
  } else {
    console.log(`all ${files.length} source files carry the MPL-2.0 notice`);
  }
}
