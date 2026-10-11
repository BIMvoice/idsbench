// What writing a part of an IDS file again leaves out.
//
// The editor holds what an IDS file says (src/core/ids/model.ts), not the file's characters. A part that is changed
// is written from the model, so anything in its XML that the model has no place for is not in the new text: comments,
// processing instructions, attributes and elements that ids.xsd does not have (or that the editor does not read), and
// elements of another namespace. This compares the XML of the part as it was with the XML the editor writes for the
// same content, node by node, and lists what is not in the second. It does not depend on what was changed: a part
// is compared with its own rewrite, so the list is the same whatever the person typed.
import type { XmlEnv } from './read';

export type LostKind = 'comment' | 'instruction' | 'attribute' | 'element' | 'text' | 'rewritten';

export interface LostItem {
  kind: LostKind;
  /** The item in plain words, as it reads in a list: "2 comments", "the attribute fixed on a list value". */
  phrase: string;
  /** How many of it there are. */
  count: number;
  /** The facts it is made of (see facts()), for the check that nothing else differs. */
  keys: string[];
}

const IDS = 'http://standards.buildingsmart.org/IDS';
const XS = 'http://www.w3.org/2001/XMLSchema';
const XMLNS = 'http://www.w3.org/2000/xmlns/';

/** What an element is called in a sentence. */
const THING: Record<string, string> = {
  enumeration: 'list value', pattern: 'pattern', length: 'length limit', minLength: 'length limit', maxLength: 'length limit',
  minInclusive: 'range limit', maxInclusive: 'range limit', minExclusive: 'range limit', maxExclusive: 'range limit',
  totalDigits: 'digit limit', fractionDigits: 'digit limit', restriction: 'restriction', simpleValue: 'simple value',
  specification: 'specification', info: 'About this IDS section', applicability: 'applicability section', requirements: 'requirements section',
  entity: 'entity facet', partOf: 'part-of facet', classification: 'classification facet', attribute: 'attribute facet',
  property: 'property facet', material: 'material facet', name: 'name', value: 'value', system: 'system', propertySet: 'property set',
  baseName: 'property name', predefinedType: 'predefined type', annotation: 'annotation', documentation: 'note',
};
const plural = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one.endsWith('y') ? `${one.slice(0, -1)}ies` : `${one}s`}`);
const thing = (local: string) => THING[local] ?? `"${local}" element`;
const a = (s: string) => (/^[aeiou]/i.test(s) ? `an ${s}` : `a ${s}`);

export /** Elements whose text is their content, so that white space in them is content too. */
const TEXTUAL = new Set(['simpleValue', 'title', 'copyright', 'version', 'description', 'author', 'date', 'purpose', 'milestone', 'documentation']);

interface Fact { value: string; /** For a message: the element it is about. */ local: string; qname: string; ns: string; attr?: string; parentLocal?: string }

const nodes = (e: Node): Node[] => Array.from(e.childNodes);
const isElement = (n: Node): n is Element => n.nodeType === 1;

/** Every comment, instruction, element, attribute and text of a fragment as a fact keyed by where it is. */
export function facts(root: Element): Map<string, Fact> {
  const out = new Map<string, Fact>();
  const walk = (el: Element, path: string, parent: Element | null) => {
    out.set(`el|${path}`, { value: '', local: el.localName, qname: el.nodeName, ns: el.namespaceURI ?? '', parentLocal: parent?.localName });
    for (const at of Array.from(el.attributes)) {
      if (at.namespaceURI === XMLNS || at.name === 'xmlns' || at.name.startsWith('xmlns:')) continue;
      out.set(`at|${path}|{${at.namespaceURI ?? ''}}${at.localName}`, { value: at.value, local: el.localName, qname: el.nodeName, ns: el.namespaceURI ?? '', attr: at.name });
    }
    const seen = new Map<string, number>();
    let comments = 0, instructions = 0;
    const childElements = nodes(el).some(isElement);
    for (const n of nodes(el)) {
      if (n.nodeType === 8) { out.set(`co|${path}|${comments++}`, { value: n.nodeValue ?? '', local: el.localName, qname: el.nodeName, ns: '' }); continue; }
      if (n.nodeType === 7) { out.set(`pi|${path}|${instructions++}`, { value: n.nodeName, local: el.localName, qname: el.nodeName, ns: '' }); continue; }
      if (!isElement(n)) continue;
      const key = `{${n.namespaceURI ?? ''}}${n.localName}`;
      const i = seen.get(key) ?? 0;
      seen.set(key, i + 1);
      walk(n, `${path}/${key}[${i}]`, el);
    }
    if (!childElements) {
      const text = nodes(el).filter((n) => n.nodeType === 3 || n.nodeType === 4).map((n) => n.nodeValue ?? '').join('').replace(/\r\n?/g, '\n');
      // White space alone inside an element that holds no text (an empty facet written on two lines) says nothing.
      if (text !== '' && (TEXTUAL.has(el.localName) || text.trim() !== '')) out.set(`tx|${path}`, { value: text, local: el.localName, qname: el.nodeName, ns: el.namespaceURI ?? '' });
    }
  };
  walk(root, `/{${root.namespaceURI ?? ''}}${root.localName}[0]`, null);
  return out;
}

/** The one element inside the wrapping root element (an XML reader without firstElementChild is allowed). */
export function partOf(doc: Document): Element {
  return nodes(doc.documentElement).find(isElement) ?? doc.documentElement;
}

/** A fragment (one element) inside the root element of its file, so that the prefixes and namespaces of the file apply to it. */
export function wrap(rootStart: string, fragment: string): string {
  const m = /^<((?:[\w.-]+:)?)([\w.-]+)/.exec(rootStart);
  return `${rootStart}${fragment}</${m ? m[1] + m[2] : 'ids'}>`;
}

/** The root element's start tag of an IDS text. */
export function rootStartTag(text: string): string | null {
  return /<(?:[\w.-]+:)?ids(?:"[^"]*"|'[^']*'|[^>"'])*>/.exec(text)?.[0] ?? null;
}

/**
 * What `before` has that `after` has not. Both are the XML of one part (an element and what is inside it), wrapped in
 * the same root element so that they are read in the same namespaces.
 */
export function lostBetween(before: string, after: string, env: XmlEnv): LostItem[] {
  return describe(facts(partOf(env.parse(before))), facts(partOf(env.parse(after))));
}

/** The path a fact key is about. */
const pathOf = (key: string) => key.split('|')[1];
/** True when the fact is about this element or something inside it. */
const within = (key: string, path: string) => { const p = pathOf(key); return p === path || p.startsWith(`${path}/`); };

function describe(b: Map<string, Fact>, aft: Map<string, Fact>): LostItem[] {
  const items: LostItem[] = [];
  const comments = [...b].filter(([k]) => k.startsWith('co|') && !aft.has(k));
  if (comments.length) items.push({ kind: 'comment', phrase: plural(comments.length, 'comment'), count: comments.length, keys: comments.map(([k]) => k) });
  const instr = [...b].filter(([k]) => k.startsWith('pi|') && !aft.has(k));
  if (instr.length) items.push({ kind: 'instruction', phrase: plural(instr.length, 'processing instruction'), count: instr.length, keys: instr.map(([k]) => k) });

  // Elements the new text does not have. An element inside one that is also gone is not listed again.
  const goneEls = [...b].filter(([k]) => k.startsWith('el|') && !aft.has(k)).map(([k, f]) => ({ k, f, path: k.slice(3) }));
  const top = goneEls.filter((x) => !goneEls.some((y) => y !== x && x.path.startsWith(`${y.path}/`)));
  const groups = new Map<string, typeof top>();
  for (const x of top) {
    const other = x.f.ns !== IDS && x.f.ns !== XS;
    const g = other ? `other|${x.f.ns}` : `known|${x.f.local}|${x.f.parentLocal ?? ''}`;
    groups.set(g, [...(groups.get(g) ?? []), x]);
  }
  for (const [g, list] of groups) {
    const keys = list.flatMap((x) => [...b.keys()].filter((k) => within(k, x.path)));
    if (g.startsWith('other|')) {
      const names = [...new Set(list.map((x) => x.f.qname))];
      items.push({ kind: 'element', phrase: list.length === 1 ? `an element from another namespace ("${names[0]}")` : `${list.length} elements from another namespace (${names.map((n) => `"${n}"`).join(', ')})`, count: list.length, keys });
    } else {
      const f = list[0].f;
      items.push({ kind: 'element', phrase: list.length === 1 ? `the ${thing(f.local)}${f.parentLocal ? ` inside the ${thing(f.parentLocal)}` : ''}` : `${list.length} ${thing(f.local)}s${f.parentLocal ? ` inside the ${thing(f.parentLocal)}` : ''}`, count: list.length, keys });
    }
  }
  const gone = (k: string) => goneEls.some((x) => within(k, x.path));

  // Attributes the new text does not have, grouped by attribute and by the kind of element that carried it.
  const attrs = new Map<string, { local: string; attr: string; keys: string[] }>();
  for (const [k, f] of b) {
    if (!k.startsWith('at|') || aft.has(k) || gone(k)) continue;
    const id = `${f.attr}|${f.local}`;
    const e = attrs.get(id) ?? { local: f.local, attr: f.attr ?? '', keys: [] };
    e.keys.push(k);
    attrs.set(id, e);
  }
  for (const e of attrs.values()) {
    const n = e.keys.length;
    items.push({ kind: 'attribute', phrase: n === 1 ? `the attribute ${e.attr} on ${a(thing(e.local))}` : `the attribute ${e.attr} on ${n} ${thing(e.local)}s`, count: n, keys: e.keys });
  }

  // Text the new text does not have, and values that are written differently.
  const texts = [...b].filter(([k]) => k.startsWith('tx|') && !aft.has(k) && !gone(k));
  if (texts.length) items.push({ kind: 'text', phrase: texts.length === 1 ? `the text of ${a(thing(texts[0][1].local))}` : `the text of ${texts.length} elements`, count: texts.length, keys: texts.map(([k]) => k) });
  const changed = [...b].filter(([k, f]) => (k.startsWith('at|') || k.startsWith('tx|')) && aft.has(k) && aft.get(k)!.value !== f.value);
  const byWhat = new Map<string, string[]>();
  for (const [k, f] of changed) {
    const what = k.startsWith('at|') ? `the ${f.attr} of ${a(thing(f.local))}` : `the text of ${a(thing(f.local))}`;
    byWhat.set(what, [...(byWhat.get(what) ?? []), k]);
  }
  for (const [what, keys] of byWhat) items.push({ kind: 'rewritten', phrase: `${what} (${keys.length === 1 ? 'is' : `${keys.length} are`} written in a different form, with the same meaning)`, count: keys.length, keys });
  return items;
}

/** What writing a whole document again leaves out (comments before the root element included): both texts are whole IDS files. */
export function lostBetweenDocuments(before: string, after: string, env: XmlEnv): LostItem[] {
  const factsOf = (text: string) => {
    const doc = env.parse(text.replace(/^\ufeff/, ''));
    const out = facts(doc.documentElement);
    let c = 0, i = 0;
    for (const n of nodes(doc as unknown as Node)) {
      if (n.nodeType === 8) out.set(`co|/outside|${c++}`, { value: n.nodeValue ?? '', local: '', qname: '', ns: '' });
      else if (n.nodeType === 7 && n.nodeName !== 'xml') out.set(`pi|/outside|${i++}`, { value: n.nodeName, local: '', qname: '', ns: '' });
    }
    return out;
  };
  return describe(factsOf(before), factsOf(after));
}

/** The items as one list in words: "2 comments, the attribute fixed on a list value". */
export function sayLost(items: LostItem[]): string {
  return items.map((i) => i.phrase).join(', ');
}

/** One part of the file that is written again, and the words for what that leaves out of it. */
export interface LeftOut { part: 'info' | 'file' | number; name: string; items: string[] }
export const leftOutSentence = (l: LeftOut): string =>
  `Writing ${l.part === 'info' ? '"About this IDS"' : l.part === 'file' ? 'this file' : `specification ${l.part}${l.name ? ` ("${l.name}")` : ''}`} again will leave out: ${l.items.join(', ')}.`;
