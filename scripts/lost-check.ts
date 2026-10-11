// Over every IDS file the forms can open: change the name of each specification to a different value (an edit that
// changes no meaning), write it back the way Download does, and count what that leaves out of the file. Then prove that
// nothing else was left out: the XML of the specification as it was, minus the items listed, must be the XML of the
// specification as written, node by node (attributes sorted, white space between elements ignored; the name, which was
// changed on purpose, is not compared).
// Usage: npx vite-node scripts/lost-check.ts <dir> [<dir> ...]
import fs from 'node:fs';
import path from 'node:path';
import { contentKey, keepSource, writeKept } from '../src/core/ids/keep';
import { partOf, rootStartTag, wrap } from '../src/core/ids/lost';
import { readIdsText } from '../src/core/ids/read';
import { specificationText } from '../src/core/ids/write';
import { nodeEnv } from '../tests/helpers/dom';

const dirs = process.argv.slice(2);
if (dirs.length === 0) throw new Error('usage: lost-check.ts <dir> [<dir> ...]');
const log = console.log;
console.warn = console.error = console.info = console.log = () => {};

const files: string[] = [];
const walk = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(ids|xml)$/.test(f.name)) files.push(p); } };
dirs.forEach(walk);
files.sort();

const nodes = (n: Node) => Array.from(n.childNodes);
/** The residual of an element as a string: what is left when the listed facts are not looked at. */
// The editor writes the schema's default values where a file leaves them out (the attribute minOccurs="1" of an
// applicability, cardinality="required" of a facet; the reader reads an applicability without occurs attributes, which
// ids.xsd 1.0 requires, as 1 and 1). That adds, it does not leave out; both texts are compared without them.
const isDefault = (el: Element, a: Attr) => (el.localName === 'applicability' && (a.name === 'minOccurs' || a.name === 'maxOccurs') && a.value === '1') || (a.name === 'cardinality' && a.value === 'required');
function canon(el: Element, p: string, skip: Set<string>, blank: Set<string>): string {
  if (skip.has(`el|${p}`)) return '';
  const attrs = Array.from(el.attributes).filter((a) => !(a.name === 'xmlns' || a.name.startsWith('xmlns:')) && !isDefault(el, a))
    .map((a) => ({ k: `at|${p}|{${a.namespaceURI ?? ''}}${a.localName}`, n: `{${a.namespaceURI ?? ''}}${a.localName}`, v: a.value }))
    .filter((a) => !skip.has(a.k)).sort((x, y) => (x.n < y.n ? -1 : 1))
    .map((a) => `${a.n}=${blank.has(a.k) || (p.endsWith('specification[0]') && a.n === '{}name') ? '' : JSON.stringify(a.v)}`);
  const seen = new Map<string, number>();
  let comments = 0, instructions = 0;
  const hasEl = nodes(el).some((n) => n.nodeType === 1);
  const parts: string[] = [];
  for (const n of nodes(el)) {
    if (n.nodeType === 8) { const k = `co|${p}|${comments++}`; if (!skip.has(k)) parts.push(`<!--${n.nodeValue}-->`); }
    else if (n.nodeType === 7) { const k = `pi|${p}|${instructions++}`; if (!skip.has(k)) parts.push(`<?${n.nodeName}?>`); }
    else if (n.nodeType === 1) {
      const e = n as Element;
      const key = `{${e.namespaceURI ?? ''}}${e.localName}`;
      const i = seen.get(key) ?? 0;
      seen.set(key, i + 1);
      parts.push(canon(e, `${p}/${key}[${i}]`, skip, blank));
    } else if (!hasEl && (n.nodeType === 3 || n.nodeType === 4) && ((n.nodeValue ?? '').trim() !== '' || el.localName === 'simpleValue')) {
      if (!skip.has(`tx|${p}`)) parts.push(blank.has(`tx|${p}`) ? '' : JSON.stringify((n.nodeValue ?? '').replace(/\r\n?/g, '\n')));
    }
  }
  return `<{${el.namespaceURI ?? ''}}${el.localName} ${attrs.join(' ')}>${parts.join('')}</>`;
}

let nFiles = 0, nSpecs = 0, losing = 0, mismatches = 0, noKeep = 0, notOpened = 0;
const byKind = new Map<string, number>(), byPhrase = new Map<string, number>(), filesWithLoss = new Set<string>();
const bad: string[] = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  let doc;
  try { doc = readIdsText(text, nodeEnv); } catch { notOpened++; continue; }
  const k = keepSource(text, doc, nodeEnv);
  if (!k) { noKeep++; continue; }
  nFiles++;
  const root = rootStartTag(k.before)!;
  doc.specifications.forEach((spec, i) => {
    nSpecs++;
    const edited = { ...doc, specifications: doc.specifications.map((s, j) => (j === i ? { ...s, name: `${s.name} (renamed)` } : s)) };
    const w = writeKept(k, edited, nodeEnv);
    const mine = w.lost.filter((l) => l.part === i + 1);
    const items = mine.flatMap((l) => l.items);
    if (items.length) { losing++; filesWithLoss.add(file); }
    for (const it of items) { byKind.set(it.kind, (byKind.get(it.kind) ?? 0) + 1); byPhrase.set(it.phrase.replace(/\d+/g, 'N'), (byPhrase.get(it.phrase.replace(/\d+/g, 'N')) ?? 0) + 1); }
    // The oracle.
    const from = k.specs[i];
    const rewritten = specificationText(edited.specifications[i], k.style).replace(/\n/g, k.newline);
    const old = partOf(nodeEnv.parse(wrap(root, from.body)));
    const now = partOf(nodeEnv.parse(wrap(root, rewritten)));
    const skip = new Set(items.filter((x) => x.kind !== 'rewritten').flatMap((x) => x.keys));
    const blank = new Set(items.filter((x) => x.kind === 'rewritten').flatMap((x) => x.keys));
    const p0 = `/{${old.namespaceURI ?? ''}}${old.localName}[0]`;
    // The rewritten text is read in the same namespaces: the paths are the same.
    const a = canon(old, p0, skip, blank), b = canon(now, p0, new Set(), blank);
    if (a !== b) { mismatches++; if (bad.length < 5) bad.push(`${path.basename(file)} specification ${i + 1}:\n  old minus listed: ${a.slice(0, 300)}\n  written:          ${b.slice(0, 300)}`); }
  });
}
log(`files: ${files.length}; opened in the forms and cut for writing back: ${nFiles}; not opened in the forms: ${notOpened}; not cut: ${noKeep}`);
log(`specifications, each renamed to a different value and written again: ${nSpecs}`);
log(`specifications that lose something: ${losing} in ${filesWithLoss.size} files`);
for (const [kind, n] of [...byKind].sort()) log(`  ${kind}: ${n}`);
for (const [phrase, n] of [...byPhrase].sort((x, y) => y[1] - x[1])) log(`  ${n} x ${phrase}`);
log(`specifications where something is left out that is not listed: ${mismatches}`);
for (const b of bad) log(b);
process.exit(mismatches ? 1 : 0);
