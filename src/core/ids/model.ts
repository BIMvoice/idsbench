/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The editor's model of an IDS 1.0 document. It is deliberately close to the
// XML (one field per element or attribute of ids.xsd) so that reading a file
// and writing it back loses nothing. @ifc-lite/ids only reads IDS and its
// parsed model drops parts of the file (uri, the description of the
// requirements, the exact restriction facets), so this model is separate.

export const IDS_NS = 'http://standards.buildingsmart.org/IDS';
export const IDS_SCHEMA_URL = 'http://standards.buildingsmart.org/IDS/1.0/ids.xsd';

/** The values the schema allows for ifcVersion, in the order the schema lists them. */
export const IFC_VERSIONS = ['IFC2X3', 'IFC4', 'IFC4X3_ADD2'] as const;

export type RestrictionName =
  | 'enumeration' | 'pattern'
  | 'minInclusive' | 'maxInclusive' | 'minExclusive' | 'maxExclusive'
  | 'length' | 'minLength' | 'maxLength' | 'totalDigits' | 'fractionDigits';
export const RESTRICTION_NAMES: readonly RestrictionName[] = [
  'enumeration', 'pattern', 'minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive',
  'length', 'minLength', 'maxLength', 'totalDigits', 'fractionDigits',
];

export interface RestrictionFacet {
  name: RestrictionName; value: string;
  /** The file's own xs:annotation on this item (for example a label for one enumeration value), as XML text, written back unchanged. */
  annotation?: string;
}

/** A value is a simple value or an xs:restriction made of facets (kept in file order). */
export type Value =
  | { kind: 'simple'; value: string }
  | { kind: 'restriction'; base: string | null; facets: RestrictionFacet[]; /** The file's own xs:annotation on the restriction, as XML text, written back unchanged. */ annotation?: string };

export type Cardinality = 'required' | 'optional' | 'prohibited';
export type FacetKind = 'entity' | 'partOf' | 'classification' | 'attribute' | 'property' | 'material';
/** The order the schema requires in an applicability. */
export const APPLICABILITY_ORDER: readonly FacetKind[] = ['entity', 'partOf', 'classification', 'attribute', 'property', 'material'];

export interface EntityRef { name: Value; predefinedType: Value | null }

interface Base { uid: string }
export interface EntityFacet extends Base, EntityRef { kind: 'entity'; instructions: string | null }
export interface AttributeFacet extends Base { kind: 'attribute'; name: Value; value: Value | null; cardinality: Cardinality; instructions: string | null }
export interface ClassificationFacet extends Base { kind: 'classification'; value: Value | null; system: Value; uri: string | null; cardinality: Cardinality; instructions: string | null }
export interface PropertyFacet extends Base { kind: 'property'; propertySet: Value; baseName: Value; dataType: string | null; value: Value | null; uri: string | null; cardinality: Cardinality; instructions: string | null }
export interface MaterialFacet extends Base { kind: 'material'; value: Value | null; uri: string | null; cardinality: Cardinality; instructions: string | null }
export interface PartOfFacet extends Base { kind: 'partOf'; relation: string | null; entity: EntityRef; cardinality: Cardinality; instructions: string | null }
export type Facet = EntityFacet | AttributeFacet | ClassificationFacet | PropertyFacet | MaterialFacet | PartOfFacet;

export const PARTOF_RELATIONS = [
  'IFCRELAGGREGATES', 'IFCRELASSIGNSTOGROUP', 'IFCRELCONTAINEDINSPATIALSTRUCTURE', 'IFCRELNESTS', 'IFCRELVOIDSELEMENT IFCRELFILLSELEMENT',
] as const;

export interface Specification {
  uid: string;
  name: string;
  ifcVersion: string[];
  identifier: string | null;
  description: string | null;
  instructions: string | null;
  /** The occurrence attributes of <applicability>, as written (defaults of the schema applied: both "1"). */
  minOccurs: string;
  maxOccurs: string;
  applicability: Facet[];
  requirements: Facet[];
  /** The description attribute of <requirements>. */
  requirementsDescription: string | null;
  /**
   * Set by the fix "Write this specification again": the specification is written from this model even though it says
   * what the opened file says, because the file's own text of it holds something the standard does not allow.
   */
  rewrite?: true;
  /** Set on a specification this page made (from a starter shape or an empty form), never on one read from a file. */
  made?: true;
  /** Set while the name is the one this page worked out from the content: it follows the content until the person types a name. */
  autoName?: true;
  /** Set when the person narrowed the class to exactly that class: choosing another class then does not bring its subtypes in. */
  exact?: true;
}

export interface Info {
  title: string;
  copyright: string; version: string; description: string; author: string;
  date: string; purpose: string; milestone: string;
}
export const INFO_OPTIONAL = ['copyright', 'version', 'description', 'author', 'date', 'purpose', 'milestone'] as const;

export interface IdsDocument {
  info: Info; specifications: Specification[];
  /** Set by a fix: the info section ('info') or the whole file ('all') is written from this model, not kept as the opened file has it. */
  rewrite?: 'info' | 'all';
}

// The prefix is random per page load so that a draft restored from the session never collides with new ids.
const PREFIX = Math.random().toString(36).slice(2, 6);
let counter = 0;
export const newUid = () => `u${PREFIX}${++counter}`;

export const simple = (value = ''): Value => ({ kind: 'simple', value });

export function blankDocument(): IdsDocument {
  return {
    info: { title: '', copyright: '', version: '', description: '', author: '', date: '', purpose: '', milestone: '' },
    specifications: [],
  };
}

export function newFacet(kind: FacetKind, where: 'applicability' | 'requirements'): Facet {
  const uid = newUid();
  const common = { uid, instructions: null };
  const req = { cardinality: 'required' as Cardinality };
  switch (kind) {
    case 'entity': return { kind, ...common, name: simple(), predefinedType: null };
    case 'attribute': return { kind, ...common, ...req, name: simple(), value: null };
    case 'classification': return { kind, ...common, ...req, value: null, system: simple(), uri: null };
    case 'property': return { kind, ...common, ...req, propertySet: simple(), baseName: simple(), dataType: null, value: null, uri: null };
    case 'material': return { kind, ...common, ...req, value: null, uri: null };
    case 'partOf': return { kind, ...common, ...req, relation: null, entity: { name: simple(), predefinedType: null } };
  }
  void where;
}

/**
 * A specification made by this page. It ticks all three IFC versions and is optional: it applies to every matching
 * element the model has, and a model with none is not failed for that. (The standard's own default for a file that
 * says nothing is "required"; that is what a file read from disk still gets, see ids/read.ts.)
 */
export function newSpecification(): Specification {
  return {
    uid: newUid(), name: '', ifcVersion: [...IFC_VERSIONS], identifier: null, description: null, instructions: null,
    minOccurs: '0', maxOccurs: 'unbounded', applicability: [], requirements: [], requirementsDescription: null,
    made: true,
  };
}

// ---- how many matching elements the model may hold (applicability occurs) ----

export type SpecChoice = Cardinality | 'custom';

/**
 * The user manual, "Cardinality of the applicability entity":
 *   minOccurs 1, maxOccurs unbounded = required   ("At least one ... must be found in the IFC model, each such ... must have ...")
 *   minOccurs 0, maxOccurs unbounded = optional   ("... are optional in the model, if any ... is present, they must all have ...")
 *   minOccurs 0, maxOccurs 0         = prohibited ("No ... should be found in the IFC model, requirements are ignored")
 */
export function specChoice(s: Pick<Specification, 'minOccurs' | 'maxOccurs'>): SpecChoice {
  if (s.minOccurs === '1' && s.maxOccurs === 'unbounded') return 'required';
  if (s.minOccurs === '0' && s.maxOccurs === 'unbounded') return 'optional';
  if (s.minOccurs === '0' && s.maxOccurs === '0') return 'prohibited';
  return 'custom';
}
export function occursFor(c: Cardinality): { minOccurs: string; maxOccurs: string } {
  if (c === 'required') return { minOccurs: '1', maxOccurs: 'unbounded' };
  if (c === 'optional') return { minOccurs: '0', maxOccurs: 'unbounded' };
  return { minOccurs: '0', maxOccurs: '0' };
}

/** Which of required / optional / prohibited a requirement facet may take (the XSD: cardinality attribute types). */
export function allowedCardinalities(kind: FacetKind): Cardinality[] | null {
  if (kind === 'entity') return null; // no cardinality on an entity facet in requirements
  if (kind === 'partOf') return ['required', 'prohibited']; // ids:simpleCardinality
  return ['required', 'optional', 'prohibited']; // ids:conditionalCardinality
}

/** Applicability facets must follow the schema order; this keeps their relative order within a kind. */
export function sortApplicability(f: Facet[]): Facet[] {
  return [...f].sort((a, b) => APPLICABILITY_ORDER.indexOf(a.kind) - APPLICABILITY_ORDER.indexOf(b.kind));
}

/**
 * True when a value says something: not nothing, not an empty text, and not a restriction that holds only empty
 * parts (an empty pattern, a list of empty lines, a range or a length with no number). The one rule for "a value is
 * given", used by the guard rails and by the data type that comes with a value.
 */
export function isValueGiven(v: Value | null): boolean {
  if (v === null) return false;
  if (v.kind === 'simple') return v.value !== '';
  return v.facets.some((f) => f.value.trim() !== '');
}

/**
 * A property item given a value. IDS asks for a data type with a value ("if `value` is provided, it also requires
 * `dataType`"), and for none when the item only asks that the property exists, so the data type the standard states for
 * the property is written at the moment a value is added, and only if the item has none. A property the standard does
 * not know keeps what it has: the person is told, at the field, that a value needs a data type.
 */
export function withPropertyValue(f: PropertyFacet, value: Value | null, typeOf: (propertySet: string, baseName: string) => string | null): PropertyFacet {
  if (!isValueGiven(value) || f.dataType || f.propertySet.kind !== 'simple' || f.baseName.kind !== 'simple') return { ...f, value };
  return { ...f, value, dataType: typeOf(f.propertySet.value, f.baseName.value) };
}
