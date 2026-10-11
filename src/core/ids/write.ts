import {
  APPLICABILITY_ORDER, IDS_NS, IDS_SCHEMA_URL,
  type EntityRef, type Facet, type IdsDocument, type Specification, type Value,
} from './model';

// XML 1.0 cannot carry most control characters in any form, not even escaped.
// eslint-disable-next-line no-control-regex
const ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeText(s: string): string {
  return s.replace(ILLEGAL, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
}
/** Attribute values: line breaks and tabs are written as character references or the reader would turn them into spaces. */
export function escapeAttr(s: string): string {
  return s.replace(ILLEGAL, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');
}

const attr = (name: string, v: string | null | undefined) => (v === null || v === undefined ? '' : ` ${name}="${escapeAttr(v)}"`);

/**
 * How the text is laid out: one step of indentation, and the prefixes the file uses for the IDS namespace (empty when
 * it is the default namespace) and for the XML Schema namespace. writeIds uses its own; a part written into an opened
 * file uses that file's (see keep.ts).
 */
export interface Style {
  unit: string; ids: string; xs: string;
  /** True when the file does not bind the XML Schema namespace on its root: a restriction then declares it itself. */
  declareXs?: boolean;
}
export const OWN_STYLE: Style = { unit: '  ', ids: '', xs: 'xs:' };
let style: Style = OWN_STYLE;
const pad = (n: number) => style.unit.repeat(n);

function value(tag: string, v: Value, d: number): string {
  const P = style.ids, X = style.xs;
  if (v.kind === 'simple') return `${pad(d)}<${P}${tag}><${P}simpleValue>${escapeText(v.value)}</${P}simpleValue></${P}${tag}>\n`;
  const base = (style.declareXs ? ` xmlns:${X.slice(0, -1)}="http://www.w3.org/2001/XMLSchema"` : '') + (v.base ? ` base="${escapeAttr(v.base.startsWith('xs:') ? X + v.base.slice(3) : v.base)}"` : '');
  const note = v.annotation ? `${pad(d + 2)}${v.annotation}\n` : '';
  const inner = note + v.facets.map((f) => (f.annotation
    ? `${pad(d + 2)}<${X}${f.name} value="${escapeAttr(f.value)}">${f.annotation}</${X}${f.name}>\n`
    : `${pad(d + 2)}<${X}${f.name} value="${escapeAttr(f.value)}"/>\n`)).join('');
  return `${pad(d)}<${P}${tag}>\n${pad(d + 1)}<${X}restriction${base}>\n${inner}${pad(d + 1)}</${X}restriction>\n${pad(d)}</${P}${tag}>\n`;
}
const opt = (tag: string, v: Value | null, d: number) => (v ? value(tag, v, d) : '');

function entityRef(tag: string, e: EntityRef, d: number, attrs = ''): string {
  return `${pad(d)}<${style.ids}${tag}${attrs}>\n${value('name', e.name, d + 1)}${opt('predefinedType', e.predefinedType, d + 1)}${pad(d)}</${style.ids}${tag}>\n`;
}

/**
 * One facet, in the child order ids.xsd requires. Attributes that only exist
 * on requirement facets (cardinality, uri, instructions) are left out of an
 * applicability, where the schema forbids them.
 */
function facet(f: Facet, where: 'applicability' | 'requirements', d: number): string {
  const r = where === 'requirements';
  const P = style.ids;
  const card = (c: string) => (r ? attr('cardinality', c) : '');
  const extra = (uri: string | null, instr: string | null) => (r ? attr('uri', uri) + attr('instructions', instr) : '');
  switch (f.kind) {
    case 'entity':
      return entityRef('entity', f, d, r ? attr('instructions', f.instructions) : '');
    case 'partOf': {
      const a = attr('relation', f.relation) + card(f.cardinality) + (r ? attr('instructions', f.instructions) : '');
      return `${pad(d)}<${P}partOf${a}>\n${entityRef('entity', f.entity, d + 1)}${pad(d)}</${P}partOf>\n`;
    }
    case 'classification': {
      const a = card(f.cardinality) + (r ? attr('uri', f.uri) + attr('instructions', f.instructions) : '');
      return `${pad(d)}<${P}classification${a}>\n${opt('value', f.value, d + 1)}${value('system', f.system, d + 1)}${pad(d)}</${P}classification>\n`;
    }
    case 'attribute': {
      const a = card(f.cardinality) + (r ? attr('instructions', f.instructions) : '');
      return `${pad(d)}<${P}attribute${a}>\n${value('name', f.name, d + 1)}${opt('value', f.value, d + 1)}${pad(d)}</${P}attribute>\n`;
    }
    case 'property': {
      const a = attr('dataType', f.dataType) + card(f.cardinality) + (r ? attr('uri', f.uri) + attr('instructions', f.instructions) : '');
      return `${pad(d)}<${P}property${a}>\n${value('propertySet', f.propertySet, d + 1)}${value('baseName', f.baseName, d + 1)}${opt('value', f.value, d + 1)}${pad(d)}</${P}property>\n`;
    }
    case 'material': {
      const a = card(f.cardinality) + extra(f.uri, f.instructions);
      return `${pad(d)}<${P}material${a}>\n${opt('value', f.value, d + 1)}${pad(d)}</${P}material>\n`;
    }
  }
}

function specification(s: Specification, d: number): string {
  const P = style.ids;
  const head = ` name="${escapeAttr(s.name)}" ifcVersion="${escapeAttr(s.ifcVersion.join(' '))}"` +
    attr('identifier', s.identifier) + attr('description', s.description) + attr('instructions', s.instructions);
  // Applicability: the schema is a fixed sequence (entity, partOf, classification, attribute, property, material).
  const app = [...s.applicability]
    .sort((a, b) => APPLICABILITY_ORDER.indexOf(a.kind) - APPLICABILITY_ORDER.indexOf(b.kind))
    .map((f) => facet(f, 'applicability', d + 2)).join('');
  const occurs = `minOccurs="${escapeAttr(s.minOccurs)}" maxOccurs="${escapeAttr(s.maxOccurs)}"`;
  const applicability = app
    ? `${pad(d + 1)}<${P}applicability ${occurs}>\n${app}${pad(d + 1)}</${P}applicability>\n`
    : `${pad(d + 1)}<${P}applicability ${occurs}/>\n`;
  let requirements = '';
  if (s.requirements.length > 0 || s.requirementsDescription !== null) {
    const attrs = attr('description', s.requirementsDescription);
    requirements = s.requirements.length === 0
      ? `${pad(d + 1)}<${P}requirements${attrs}/>\n`
      : `${pad(d + 1)}<${P}requirements${attrs}>\n${s.requirements.map((f) => facet(f, 'requirements', d + 2)).join('')}${pad(d + 1)}</${P}requirements>\n`;
  }
  return `${pad(d)}<${P}specification${head}>\n${applicability}${requirements}${pad(d)}</${P}specification>\n`;
}

function infoBlock(i: IdsDocument['info'], d: number): string {
  const P = style.ids;
  const el = (tag: string, v: string) => (v === '' ? '' : `${pad(d + 1)}<${P}${tag}>${escapeText(v)}</${P}${tag}>\n`);
  const inner =
    `${pad(d + 1)}<${P}title>${escapeText(i.title)}</${P}title>\n` +
    el('copyright', i.copyright) + el('version', i.version) + el('description', i.description) +
    el('author', i.author) + el('date', i.date) + el('purpose', i.purpose) + el('milestone', i.milestone);
  return `${pad(d)}<${P}info>\n${inner}${pad(d)}</${P}info>\n`;
}

const inStyle = <T>(s: Style, fn: () => T): T => { const before = style; style = s; try { return fn(); } finally { style = before; } };

/** One <specification> element in a given style, from its "<" to its ">", indented as at depth `d`. */
export function specificationText(s: Specification, st: Style, d = 2): string {
  return inStyle(st, () => specification(s, d).slice(st.unit.length * d, -1));
}
/** The <info> element in a given style, from its "<" to its ">", indented as at depth `d`. */
export function infoText(i: IdsDocument['info'], st: Style, d = 1): string {
  return inStyle(st, () => infoBlock(i, d).slice(st.unit.length * d, -1));
}

/** The IDS 1.0 XML for a document. Element order follows ids.xsd, which is a sequence. */
export function writeIds(doc: IdsDocument): string {
  return inStyle(OWN_STYLE, () => (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<ids xmlns="${IDS_NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="${IDS_NS} ${IDS_SCHEMA_URL}">\n` +
    infoBlock(doc.info, 1) +
    `${pad(1)}<specifications>\n${doc.specifications.map((s) => specification(s, 2)).join('')}${pad(1)}</specifications>\n` +
    `</ids>\n`
  ));
}
