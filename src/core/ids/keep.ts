/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Writing an opened file back without touching what was not changed.
//
// The opened text is cut into the part before <info>, the <info> element, each <specification> element with the text
// in front of it (white space and comments), and the rest. A document is then written by putting those pieces together
// again: a specification that still holds what the file said is written as the file's own characters, and only one
// that was changed, added or moved is written anew or placed elsewhere. A file that was not changed therefore comes
// out character for character as it went in, and a change stays inside the specification (or the info section) it
// was made in.
//
// The cut is made on the text and then proved against the XML reader before it is used (see keepSource): if the proof
// fails, there is no Kept, and the caller writes the whole document with writeIds as before.
import { IDS_NS, type IdsDocument, type Info, type Specification } from './model';
import { browserEnv, readIdsText, type XmlEnv } from './read';
import { lostBetween, lostBetweenDocuments, rootStartTag, wrap, type LostItem } from './lost';
import { infoText, specificationText, writeIds, type Style } from './write';

const XS_NS = 'http://www.w3.org/2001/XMLSchema';

export interface KeptSpec {
  uid: string;
  /** The text between the end of the element before it and its own "<": white space, and any comment written above it. */
  lead: string;
  /** The element as the file has it. */
  body: string;
  /** What the element says, as the reader understood it (see contentKey). */
  key: string;
  /** A name for it in messages. */
  name: string;
}

export interface Kept {
  text: string;
  before: string;
  info: string;
  infoKey: string;
  between: string;
  specs: KeptSpec[];
  tail: string;
  style: Style;
  newline: string;
}

const keys = new WeakMap<Specification, string>();
/** Everything a specification says, without the ids the page gives it. Two specifications with the same key are written the same. */
export function contentKey(s: Specification): string {
  let k = keys.get(s);
  if (k === undefined) { k = JSON.stringify(s, (name, v) => (name === 'uid' || name === 'rewrite' || name === 'made' || name === 'autoName' || name === 'autoDataType' || name === 'exact' ? undefined : v)); keys.set(s, k); }
  return k;
}
const infoKeyOf = (i: Info) => JSON.stringify([i.title, i.copyright, i.version, i.description, i.author, i.date, i.purpose, i.milestone]);
/** True when two documents say the same, whatever ids the page gave their parts. */
export function sameContent(a: IdsDocument, b: IdsDocument): boolean {
  return infoKeyOf(a.info) === infoKeyOf(b.info) && a.specifications.length === b.specifications.length
    && a.specifications.every((s, i) => contentKey(s) === contentKey(b.specifications[i]));
}

// A comment, a CDATA section, a processing instruction, a document type declaration, or a tag (quotes may hold ">").
const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE|<(\/?)((?:[A-Za-z_][\w.-]*:)?)([A-Za-z_][\w.-]*)((?:"[^"]*"|'[^']*'|[^<>"'])*)>/g;

interface Cut { before: string; info: string; between: string; specs: { lead: string; body: string }[]; tail: string; rootAttrs: string; rootPrefix: string }

/** The pieces of the text, found on the text alone. Null when the text does not have the plain shape this relies on. */
function cut(text: string): Cut | null {
  const stack: string[] = [];
  let rootAttrs = '', rootPrefix = '';
  let info: [number, number] | null = null, infoStart = -1;
  let specsOpenEnd = -1, specStart = -1, last = -1;
  const specs: [number, number][] = [];
  for (const m of text.matchAll(TOKEN)) {
    if (m[0] === '<!DOCTYPE') return null;
    if (m[3] === undefined) continue;
    const closing = m[1] === '/', name = m[3], selfClosed = !closing && /\/\s*$/.test(m[4]);
    const depth = stack.length;
    if (!closing) {
      if (depth === 0) { if (name !== 'ids' || rootAttrs) return null; rootAttrs = m[4] || ' '; rootPrefix = m[2]; }
      if (depth === 1 && name === 'info') { if (info || specsOpenEnd !== -1) return null; infoStart = m.index; if (selfClosed) info = [infoStart, m.index + m[0].length]; }
      if (depth === 1 && name === 'specifications') { if (specsOpenEnd !== -1 || selfClosed) return null; specsOpenEnd = m.index + m[0].length; last = specsOpenEnd; }
      if (depth === 2 && stack[1] === 'specifications') {
        if (name !== 'specification') return null;
        specStart = m.index;
        if (selfClosed) { specs.push([specStart, m.index + m[0].length]); last = m.index + m[0].length; }
      }
      if (!selfClosed) stack.push(name);
    } else {
      if (stack.pop() !== name) return null;
      const d = stack.length;
      if (d === 1 && name === 'info') info = [infoStart, m.index + m[0].length];
      if (d === 2 && stack[1] === 'specifications') { specs.push([specStart, m.index + m[0].length]); last = m.index + m[0].length; }
    }
  }
  if (stack.length !== 0 || !info || specsOpenEnd === -1 || info[1] > specsOpenEnd) return null;
  const out: Cut = { before: text.slice(0, info[0]), info: text.slice(info[0], info[1]), between: text.slice(info[1], specsOpenEnd), specs: [], tail: text.slice(last), rootAttrs, rootPrefix };
  let at = specsOpenEnd;
  for (const [from, to] of specs) { out.specs.push({ lead: text.slice(at, from), body: text.slice(from, to) }); at = to; }
  return out;
}

/** The namespaces the root element binds: prefix (with its colon; '' for the default namespace) to namespace. */
function bindings(rootAttrs: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of rootAttrs.matchAll(/(?:^|\s)xmlns(?::([A-Za-z_][\w.-]*))?\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out.set(m[1] === undefined ? '' : `${m[1]}:`, m[2] ?? m[3]);
  return out;
}

/** The prefixes and the layout a part written into this text has to use. Null when the root element is not in the IDS namespace by its own declaration. */
function styleOf(c: Cut, text: string): { style: Style; newline: string } | null {
  const bound = bindings(c.rootAttrs);
  // IDS elements are written with the prefix the root element itself carries.
  if (bound.get(c.rootPrefix) !== IDS_NS) return null;
  const xs = [...bound].find(([prefix, ns]) => ns === XS_NS && prefix !== '')?.[0];
  // One step of indentation: what stands before <info> on its line, when that is all spaces or all tabs.
  const indent = /(?:^|\n)([ \t]*)$/.exec(c.before)?.[1] ?? '';
  const unit = /^ +$/.test(indent) || /^\t+$/.test(indent) ? indent : '  ';
  return { style: xs === undefined ? { unit, ids: c.rootPrefix, xs: 'xs:', declareXs: true } : { unit, ids: c.rootPrefix, xs }, newline: /\r\n/.test(text) ? '\r\n' : '\n' };
}

const lines = (s: string, newline: string) => (newline === '\n' ? s : s.replace(/\n/g, newline));

/** A document put together from the pieces: `specs` gives, per specification, the file's own text or a model to write. */
function assemble(k: Omit<Kept, 'text'>, info: Info, specs: { lead: string; body: string | Specification }[], infoAnew = false): string {
  const infoPart = !infoAnew && infoKeyOf(info) === k.infoKey ? k.info : lines(infoText(info, k.style), k.newline);
  return k.before + infoPart + k.between
    + specs.map((s) => s.lead + (typeof s.body === 'string' ? s.body : lines(specificationText(s.body, k.style), k.newline))).join('')
    + k.tail;
}

/**
 * Cuts an opened text so it can be written back unchanged. `doc` is what the reader made of that text. Returns null
 * when the text cannot be cut safely; the caller then writes whole documents.
 *
 * The proof: a second document is put together from the same pieces with the specifications in reverse order, every
 * other one written anew from the model and the info section written anew, and is read back. Only if the reader finds
 * exactly the expected document are the pieces trusted. This catches a cut in the wrong place and a prefix or a
 * namespace this file binds differently, on this very file, before anything is written from them.
 */
export function keepSource(text: string, doc: IdsDocument, env?: XmlEnv): Kept | null {
  try {
    const c = cut(text);
    if (!c || c.specs.length !== doc.specifications.length) return null;
    const st = styleOf(c, text);
    if (!st) return null;
    const k: Kept = {
      text, before: c.before, info: c.info, infoKey: infoKeyOf(doc.info), between: c.between, tail: c.tail,
      specs: c.specs.map((s, i) => ({ uid: doc.specifications[i].uid, lead: s.lead, body: s.body, key: contentKey(doc.specifications[i]), name: doc.specifications[i].name })),
      style: st.style, newline: st.newline,
    };
    if (assemble(k, doc.info, k.specs) !== text) return null;
    const order = doc.specifications.map((_, i) => i).reverse();
    const trial = assemble(k, doc.info, order.map((i) => ({ lead: k.specs[i].lead, body: i % 2 === 0 ? doc.specifications[i] : k.specs[i].body })), true);
    const back = readIdsText(trial, env);
    const expected: IdsDocument = { info: doc.info, specifications: order.map((i) => doc.specifications[i]) };
    return sameContent(back, expected) ? k : null;
  } catch {
    return null;
  }
}

export interface Written {
  text: string;
  /** Specifications of the opened file that were written anew, and whose own text held comments or instructions that are therefore not in `text`. */
  commentsLost: string[];
  /** True when the info section was written anew and its own text held comments. */
  infoCommentsLost: boolean;
  /** True when nothing of the opened text was kept: the whole document was written in idsbench's own layout. */
  whole: boolean;
  /** For each part written anew: what its rewrite leaves out of the opened file (comments included). Parts that lose nothing are not listed. */
  lost: LostPart[];
}

const HAS_COMMENT = /<!--|<\?/;

/** A part of the file that is written again, and what that leaves out of it. */
export interface LostPart {
  /** 'info' for the About this IDS section, else the specification's place in the file (from 1). */
  part: 'info' | number;
  name: string;
  items: LostItem[];
}

const lostOfSpec = new WeakMap<KeptSpec, LostItem[]>();
/** What writing this specification again leaves out: its XML as the file has it against the XML written for the same content. */
function specLoss(k: Kept, from: KeptSpec, env: XmlEnv): LostItem[] {
  let items = lostOfSpec.get(from);
  if (!items) {
    const root = rootStartTag(k.before);
    const original = { ...JSON.parse(from.key), uid: from.uid } as Specification;
    items = root ? lostBetween(wrap(root, from.body), wrap(root, lines(specificationText(original, k.style), k.newline)), env) : [];
    lostOfSpec.set(from, items);
  }
  return items;
}
const lostOfInfo = new WeakMap<Kept, LostItem[]>();
function infoLoss(k: Kept, env: XmlEnv): LostItem[] {
  let items = lostOfInfo.get(k);
  if (!items) {
    const root = rootStartTag(k.before);
    const [title, copyright, version, description, author, date, purpose, milestone] = JSON.parse(k.infoKey) as string[];
    const original: Info = { title, copyright, version, description, author, date, purpose, milestone };
    items = root ? lostBetween(wrap(root, k.info), wrap(root, lines(infoText(original, k.style), k.newline)), env) : [];
    lostOfInfo.set(k, items);
  }
  return items;
}

/** The document as text: the opened file's own characters wherever the document still says what the file said. */
export function writeKept(k: Kept, doc: IdsDocument, xml?: XmlEnv): Written {
  // Without an XML reader (Node, when none is given) what is left out cannot be worked out, and is not claimed to be nothing: `lost` is then empty and the comments are still found.
  const env = xml ?? (typeof DOMParser !== 'undefined' ? browserEnv : null);
  if (doc.rewrite === 'all') return { text: writeIds(doc), commentsLost: [], infoCommentsLost: false, whole: true, lost: [] };
  const byUid = new Map(k.specs.map((s) => [s.uid, s]));
  const plainLead = k.specs.find((s) => s.lead.trim() === '')?.lead ?? `${k.newline}${k.style.unit.repeat(2)}`;
  const commentsLost: string[] = [];
  const lost: LostPart[] = [];
  const parts = doc.specifications.map((s, i) => {
    const from = byUid.get(s.uid);
    if (!from) return { lead: plainLead, body: s };
    if (from.key === contentKey(s) && !s.rewrite) return { lead: from.lead, body: from.body };
    if (HAS_COMMENT.test(from.body)) commentsLost.push(s.name || from.name);
    const items = env ? specLoss(k, from, env) : [];
    if (items.length) lost.push({ part: i + 1, name: s.name || from.name, items });
    return { lead: from.lead, body: s };
  });
  const infoChanged = doc.rewrite === 'info' || infoKeyOf(doc.info) !== k.infoKey;
  const infoItems = infoChanged && env ? infoLoss(k, env) : [];
  if (infoItems.length) lost.unshift({ part: 'info', name: 'About this IDS', items: infoItems });
  return { text: assemble(k, doc.info, parts, infoChanged), commentsLost, infoCommentsLost: infoChanged && HAS_COMMENT.test(k.info), whole: false, lost };
}

/** What writing the whole opened text again (writeIds) leaves out of it, comments before the root element included. */
export function wholeLoss(text: string, doc: IdsDocument, env: XmlEnv = browserEnv): LostItem[] {
  return lostBetweenDocuments(text, writeIds(doc), env);
}

/** What a whole rewrite of an opened text (writeIds) leaves out that a reader of the file would miss: its comments. */
export function rewriteLosesComments(text: string): boolean {
  return /<!--/.test(text) || /<\?(?!xml\s)/.test(text);
}
