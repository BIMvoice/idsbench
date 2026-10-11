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
const pad = (n: number) => '  '.repeat(n);

function value(tag: string, v: Value, d: number): string {
  if (v.kind === 'simple') return `${pad(d)}<${tag}><simpleValue>${escapeText(v.value)}</simpleValue></${tag}>\n`;
  const base = v.base ? ` base="${escapeAttr(v.base)}"` : '';
  const note = v.annotation ? `${pad(d + 2)}${v.annotation}\n` : '';
  const inner = note + v.facets.map((f) => (f.annotation
    ? `${pad(d + 2)}<xs:${f.name} value="${escapeAttr(f.value)}">${f.annotation}</xs:${f.name}>\n`
    : `${pad(d + 2)}<xs:${f.name} value="${escapeAttr(f.value)}"/>\n`)).join('');
  return `${pad(d)}<${tag}>\n${pad(d + 1)}<xs:restriction${base}>\n${inner}${pad(d + 1)}</xs:restriction>\n${pad(d)}</${tag}>\n`;
}
const opt = (tag: string, v: Value | null, d: number) => (v ? value(tag, v, d) : '');

function entityRef(tag: string, e: EntityRef, d: number, attrs = ''): string {
  return `${pad(d)}<${tag}${attrs}>\n${value('name', e.name, d + 1)}${opt('predefinedType', e.predefinedType, d + 1)}${pad(d)}</${tag}>\n`;
}

/**
 * One facet, in the child order ids.xsd requires. Attributes that only exist
 * on requirement facets (cardinality, uri, instructions) are left out of an
 * applicability, where the schema forbids them.
 */
function facet(f: Facet, where: 'applicability' | 'requirements', d: number): string {
  const r = where === 'requirements';
  const card = (c: string) => (r ? attr('cardinality', c) : '');
  const extra = (uri: string | null, instr: string | null) => (r ? attr('uri', uri) + attr('instructions', instr) : '');
  switch (f.kind) {
    case 'entity':
      return entityRef('entity', f, d, r ? attr('instructions', f.instructions) : '');
    case 'partOf': {
      const a = attr('relation', f.relation) + card(f.cardinality) + (r ? attr('instructions', f.instructions) : '');
      return `${pad(d)}<partOf${a}>\n${entityRef('entity', f.entity, d + 1)}${pad(d)}</partOf>\n`;
    }
    case 'classification': {
      const a = card(f.cardinality) + (r ? attr('uri', f.uri) + attr('instructions', f.instructions) : '');
      return `${pad(d)}<classification${a}>\n${opt('value', f.value, d + 1)}${value('system', f.system, d + 1)}${pad(d)}</classification>\n`;
    }
    case 'attribute': {
      const a = card(f.cardinality) + (r ? attr('instructions', f.instructions) : '');
      return `${pad(d)}<attribute${a}>\n${value('name', f.name, d + 1)}${opt('value', f.value, d + 1)}${pad(d)}</attribute>\n`;
    }
    case 'property': {
      const a = attr('dataType', f.dataType) + card(f.cardinality) + (r ? attr('uri', f.uri) + attr('instructions', f.instructions) : '');
      return `${pad(d)}<property${a}>\n${value('propertySet', f.propertySet, d + 1)}${value('baseName', f.baseName, d + 1)}${opt('value', f.value, d + 1)}${pad(d)}</property>\n`;
    }
    case 'material': {
      const a = card(f.cardinality) + extra(f.uri, f.instructions);
      return `${pad(d)}<material${a}>\n${opt('value', f.value, d + 1)}${pad(d)}</material>\n`;
    }
  }
}

function specification(s: Specification, d: number): string {
  const head = ` name="${escapeAttr(s.name)}" ifcVersion="${escapeAttr(s.ifcVersion.join(' '))}"` +
    attr('identifier', s.identifier) + attr('description', s.description) + attr('instructions', s.instructions);
  // Applicability: the schema is a fixed sequence (entity, partOf, classification, attribute, property, material).
  const app = [...s.applicability]
    .sort((a, b) => APPLICABILITY_ORDER.indexOf(a.kind) - APPLICABILITY_ORDER.indexOf(b.kind))
    .map((f) => facet(f, 'applicability', d + 2)).join('');
  const occurs = `minOccurs="${escapeAttr(s.minOccurs)}" maxOccurs="${escapeAttr(s.maxOccurs)}"`;
  const applicability = app
    ? `${pad(d + 1)}<applicability ${occurs}>\n${app}${pad(d + 1)}</applicability>\n`
    : `${pad(d + 1)}<applicability ${occurs}/>\n`;
  let requirements = '';
  if (s.requirements.length > 0 || s.requirementsDescription !== null) {
    const attrs = attr('description', s.requirementsDescription);
    requirements = s.requirements.length === 0
      ? `${pad(d + 1)}<requirements${attrs}/>\n`
      : `${pad(d + 1)}<requirements${attrs}>\n${s.requirements.map((f) => facet(f, 'requirements', d + 2)).join('')}${pad(d + 1)}</requirements>\n`;
  }
  return `${pad(d)}<specification${head}>\n${applicability}${requirements}${pad(d)}</specification>\n`;
}

/** The IDS 1.0 XML for a document. Element order follows ids.xsd, which is a sequence. */
export function writeIds(doc: IdsDocument): string {
  const i = doc.info;
  const el = (tag: string, v: string) => (v === '' ? '' : `${pad(2)}<${tag}>${escapeText(v)}</${tag}>\n`);
  const info =
    `${pad(2)}<title>${escapeText(i.title)}</title>\n` +
    el('copyright', i.copyright) + el('version', i.version) + el('description', i.description) +
    el('author', i.author) + el('date', i.date) + el('purpose', i.purpose) + el('milestone', i.milestone);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<ids xmlns="${IDS_NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="${IDS_NS} ${IDS_SCHEMA_URL}">\n` +
    `${pad(1)}<info>\n${info}${pad(1)}</info>\n` +
    `${pad(1)}<specifications>\n${doc.specifications.map((s) => specification(s, 2)).join('')}${pad(1)}</specifications>\n` +
    `</ids>\n`
  );
}
