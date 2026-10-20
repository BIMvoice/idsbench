/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Every finding carries the path of its element ("ids/specifications/specification[812]/applicability/entity"). The
// path was made by counting, for each element on the way up, the siblings of the same name: a file of 20,000
// specifications with a problem in each counted 20,000 siblings 20,000 times, and the page froze for half a minute.
// Here the paths of such a file are made in well under a second, and are the very paths the old way gave on every
// element of every file of the corpus.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Reporter } from '../src/report.ts';
import { interpret } from '../src/xsd.ts';
import { parseTree, pathOf, walk, type XNode } from '../src/xml.ts';
import { NS } from './helpers.ts';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(here, 'fixtures', 'corpus');

/** The path as it was made before: the same-named siblings counted for each element on the way up. */
function countedPath(n: XNode): string {
  const parts: string[] = [];
  for (let cur: XNode | undefined = n; cur; cur = cur.parent) {
    const same = cur.parent ? cur.parent.children.filter((c) => c.name === cur!.name).length : 1;
    parts.unshift(same > 1 ? `${cur.name}[${cur.index}]` : cur.name);
  }
  return parts.join('/');
}

const N = 20_000;
/** One specification a line, each with an element the schema does not allow (so each gives a finding). */
function manySpecs(oneLine = false): string {
  const specs: string[] = [];
  for (let i = 1; i <= N; i++) {
    specs.push(`<specification name="S${i}" ifcVersion="IFC4"><applicability><entity><name><simpleValue>IFCWALLX</simpleValue></name></entity></applicability><bogus/></specification>`);
  }
  const sep = oneLine ? '' : '\n';
  return `<ids xmlns="${NS}"><info><title>t</title></info><specifications>${sep}${specs.join(sep)}${sep}</specifications></ids>`;
}

describe('the path of each finding', () => {
  it('is the path the old way gave, for every element of every file of the corpus', () => {
    let nodes = 0, files = 0;
    for (const file of readdirSync(corpus, { recursive: true, encoding: 'utf8' }).filter((f) => /\.(ids|xml)$/.test(f))) {
      const { root } = parseTree(readFileSync(join(corpus, file), 'utf8'));
      if (!root) continue;
      files++;
      walk(root, (n) => { nodes++; expect(pathOf(n), file).toBe(countedPath(n)); });
    }
    expect(files).toBeGreaterThan(300);
    expect(nodes).toBeGreaterThan(10_000);
  });

  it(`is made for ${N} findings of the rules in well under a second`, () => {
    const { root } = parseTree(manySpecs());
    const entities: XNode[] = [];
    walk(root!, (n) => { if (n.name === 'entity') entities.push(n); });
    expect(entities).toHaveLength(N);
    const r = new Reporter();
    const t = performance.now();
    for (const e of entities) r.error(e, 'entity-unknown-class', 'x');
    const ms = performance.now() - t;
    expect(r.findings[N - 1].path).toBe(`ids/specifications/specification[${N}]/applicability/entity`);
    expect(ms).toBeLessThan(2000);
  });

  for (const oneLine of [false, true]) {
    it(`is made for ${N} findings of the schema check in well under a second${oneLine ? ', with the whole file on one line' : ''}`, () => {
      const xml = manySpecs(oneLine);
      const { root } = parseTree(xml);
      const bogus: XNode[] = [];
      walk(root!, (n) => { if (n.name === 'bogus') bogus.push(n); });
      // What libxml2 prints for each: the line, and the element it did not expect.
      const raw = bogus.map((b) => `document.xml:${b.line}: Schemas validity error : Element '{${NS}}bogus': This element is not expected.`).join('\n');
      const t = performance.now();
      const out = interpret(raw, root);
      const ms = performance.now() - t;
      expect(out.findings).toHaveLength(N);
      if (!oneLine) expect(out.findings[N - 1].path).toBe(`ids/specifications/specification[${N}]/bogus`);
      expect(ms).toBeLessThan(2000);
    });
  }
});
