import { AppError } from '../errors';
import { versionProblem } from '@idsbench/check/version';
import { IDS_NAMESPACE } from '../idsfile';
import {
  RESTRICTION_NAMES, blankDocument, newUid,
  type Cardinality, type EntityRef, type Facet, type IdsDocument, type RestrictionName, type Specification, type Value,
} from './model';

/** The one way a file enters the editor: text in, a model out, or an AppError whose message is fit to show. */
export interface XmlEnv { parse: (xml: string) => Document; serialize: (node: Node) => string }
const browserEnv: XmlEnv = { parse: browserParse, serialize: (n) => new XMLSerializer().serializeToString(n) };

export function readIdsText(text: string, env: XmlEnv = browserEnv): IdsDocument {
  const t = text.replace(/^﻿/, '');
  if (t.trim() === '') throw new AppError('ids-empty', 'The file is empty. Choose another file.');
  if (t.trimStart().startsWith('ISO-10303-21')) {
    throw new AppError('ids-is-ifc', 'This is an IFC model, not an IDS file. Put the IDS file in the IDS box and the model in the IFC box.');
  }
  const doc = env.parse(t);
  const root = doc.documentElement;
  if (!root || root.localName !== 'ids') {
    throw new AppError('ids-rejected', 'This file is not an IDS file. Check that you chose the right file.');
  }
  // IDS 1.0 only: an older draft is refused, never converted. The decision and the sentence are the Check engine's own
  // (a module of a few lines, so opening a file does not load the engine).
  const problem = versionProblem(root.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'schemaLocation') ?? root.getAttribute('xsi:schemaLocation') ?? '');
  if (problem) throw new AppError('ids-old-version', problem.message);
  if (root.namespaceURI !== IDS_NAMESPACE) {
    throw new AppError('ids-namespace', 'This file does not identify itself as a buildingSMART IDS file, so it was not opened.');
  }
  try {
    return readDocument(root, env.serialize);
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (e instanceof ReadProblem) throw new AppError('ids-rejected', `This IDS file cannot be opened here: ${e.message}`);
    throw e;
  }
}

function browserParse(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new AppError('ids-not-xml', 'This file could not be read as an IDS file. It is damaged or cut off, or it is not an IDS file at all.');
  }
  return doc;
}

class ReadProblem extends Error {}
const fail = (m: string): never => { throw new ReadProblem(m); };

const kids = (e: Element): Element[] => Array.from(e.childNodes).filter((n): n is Element => n.nodeType === 1);
const named = (e: Element, n: string) => kids(e).filter((c) => c.localName === n);
const one = (e: Element, n: string): Element | null => named(e, n)[0] ?? null;
const attrOf = (e: Element, n: string): string | null => (e.hasAttribute(n) ? e.getAttribute(n) : null);

let serialize: XmlEnv['serialize'] = () => '';
function readDocument(root: Element, ser: XmlEnv['serialize']): IdsDocument {
  serialize = ser;
  const doc = blankDocument();
  const info = one(root, 'info');
  if (info) {
    for (const k of Object.keys(doc.info) as (keyof typeof doc.info)[]) {
      const el = one(info, k);
      if (el) doc.info[k] = el.textContent ?? '';
    }
  }
  const specs = one(root, 'specifications');
  doc.specifications = specs ? named(specs, 'specification').map(readSpecification) : [];
  return doc;
}

function readSpecification(el: Element): Specification {
  const name = attrOf(el, 'name');
  if (name === null) fail('a specification has no name');
  const app = one(el, 'applicability');
  if (!app) fail(`the specification "${name}" has no applicability`);
  const req = one(el, 'requirements');
  return {
    uid: newUid(),
    name: name ?? '',
    ifcVersion: (attrOf(el, 'ifcVersion') ?? '').split(/\s+/).filter(Boolean),
    identifier: attrOf(el, 'identifier'),
    description: attrOf(el, 'description'),
    instructions: attrOf(el, 'instructions'),
    // The schema defaults both to "1".
    minOccurs: attrOf(app!, 'minOccurs') ?? '1',
    maxOccurs: attrOf(app!, 'maxOccurs') ?? '1',
    applicability: kids(app!).map((c) => readFacet(c, false)),
    requirements: req ? kids(req).map((c) => readFacet(c, true)) : [],
    requirementsDescription: req ? attrOf(req, 'description') : null,
  };
}

function readValue(parent: Element, tag: string, required: true): Value;
function readValue(parent: Element, tag: string, required: false): Value | null;
function readValue(parent: Element, tag: string, required: boolean): Value | null {
  const el = one(parent, tag);
  if (!el) return required ? fail(`a <${tag}> is missing`) : null;
  const sv = one(el, 'simpleValue');
  if (sv) return { kind: 'simple', value: sv.textContent ?? '' };
  const r = one(el, 'restriction');
  if (!r) return fail(`<${tag}> holds neither a value nor a restriction`);
  const annotationOf = (e: Element) => { const a = one(e, 'annotation'); return a ? serialize(a) : undefined; };
  const facets = kids(r).filter((c) => c.localName !== 'annotation').map((c) => {
    if (!(RESTRICTION_NAMES as readonly string[]).includes(c.localName)) fail(`a restriction uses "${c.localName}", which is not supported`);
    const annotation = annotationOf(c);
    return annotation ? { name: c.localName as RestrictionName, value: c.getAttribute('value') ?? '', annotation } : { name: c.localName as RestrictionName, value: c.getAttribute('value') ?? '' };
  });
  const annotation = annotationOf(r);
  return annotation ? { kind: 'restriction', base: attrOf(r, 'base'), facets, annotation } : { kind: 'restriction', base: attrOf(r, 'base'), facets };
}

function readEntityRef(el: Element): EntityRef {
  return { name: readValue(el, 'name', true), predefinedType: readValue(el, 'predefinedType', false) };
}

function readCardinality(el: Element, where: boolean): Cardinality {
  if (!where) return 'required';
  const c = attrOf(el, 'cardinality') ?? 'required';
  if (c !== 'required' && c !== 'optional' && c !== 'prohibited') fail(`"${c}" is not a valid requirement setting`);
  return c as Cardinality;
}

function readFacet(el: Element, requirement: boolean): Facet {
  const uid = newUid();
  const common = { uid, instructions: requirement ? attrOf(el, 'instructions') : null };
  const cardinality = readCardinality(el, requirement);
  const uri = requirement ? attrOf(el, 'uri') : null;
  switch (el.localName) {
    case 'entity': return { kind: 'entity', ...common, ...readEntityRef(el) };
    case 'attribute': return { kind: 'attribute', ...common, cardinality, name: readValue(el, 'name', true), value: readValue(el, 'value', false) };
    case 'classification': return { kind: 'classification', ...common, cardinality, uri, value: readValue(el, 'value', false), system: readValue(el, 'system', true) };
    case 'property': return {
      kind: 'property', ...common, cardinality, uri, dataType: attrOf(el, 'dataType'),
      propertySet: readValue(el, 'propertySet', true), baseName: readValue(el, 'baseName', true), value: readValue(el, 'value', false),
    };
    case 'material': return { kind: 'material', ...common, cardinality, uri, value: readValue(el, 'value', false) };
    case 'partOf': {
      const ent = one(el, 'entity');
      if (!ent) fail('a "part of" has no entity');
      return { kind: 'partOf', ...common, cardinality, relation: attrOf(el, 'relation'), entity: readEntityRef(ent!) };
    }
    default: return fail(`"${el.localName}" is not a facet the editor knows`);
  }
}
