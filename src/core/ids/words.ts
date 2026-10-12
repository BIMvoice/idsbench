/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// "This IDS in words": a short sentence per specification. It is small on purpose. When a specification is
// outside what it can say truthfully, it lists the parts neutrally instead of guessing.
import { specChoice, type Facet, type Specification, type Value } from './model';
import { lengthOf, listOf, modeOf, patternOf, rangeOf } from './value';
import { plainName } from '../picks';

export const NOUNS: Record<string, string> = {
  IFCWALL: 'wall', IFCDOOR: 'door', IFCWINDOW: 'window', IFCSLAB: 'slab', IFCCOLUMN: 'column',
  IFCBEAM: 'beam', IFCSPACE: 'space', IFCROOF: 'roof', IFCSTAIR: 'stair', IFCRAILING: 'railing', IFCCOVERING: 'covering',
  IFCFURNISHINGELEMENT: 'furnishing element', IFCBUILDINGSTOREY: 'building storey', IFCBUILDING: 'building', IFCSITE: 'site',
  IFCPROJECT: 'project', IFCCURTAINWALL: 'curtain wall', IFCPLATE: 'plate', IFCMEMBER: 'member', IFCFOOTING: 'footing',
  IFCPILE: 'pile', IFCRAMP: 'ramp', IFCPIPESEGMENT: 'pipe segment', IFCDUCTSEGMENT: 'duct segment', IFCSYSTEM: 'system',
  IFCDISTRIBUTIONSYSTEM: 'distribution system', IFCZONE: 'zone', IFCOPENINGELEMENT: 'opening',
};
const RELATIONS: Record<string, string> = {
  IFCRELAGGREGATES: 'a component of', IFCRELASSIGNSTOGROUP: 'a member of', IFCRELCONTAINEDINSPATIALSTRUCTURE: 'located in',
  IFCRELNESTS: 'nested in', 'IFCRELVOIDSELEMENT IFCRELFILLSELEMENT': 'in an opening of',
};

/** What the sentence may be told that the specification itself does not say. Both come from the IFC tables, which load after the page. */
export interface WordsOptions {
  /** The class as the standard writes it ("IfcBuildingElementProxy") from the name in capitals; undefined when not known. */
  className?: (upper: string) => string | undefined;
  /** The classes the entity facet lists are one class and subtypes of it: said as "wall, including wall standard case". */
  family?: { head: string; others: string[] } | null;
}

/** "a wall", "an element". */
export const withArticle = (noun: string): string => `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;

class TooComplex extends Error {}
const q = (s: string) => `"${s}"`;

/** After a name: `set to "A"` for an exact value or a list, otherwise `with a value ...`. */
function valueClause(v: Value): string {
  const m = modeOf(v);
  const w = valueWords(v);
  if (m === 'exact' || m === 'list') return ` set to ${w}`;
  if (m === 'range') return ` with a value of ${w}`;
  if (m === 'length') return ` with a value ${w.replace(/ characters long$/, ' characters long')}`;
  return ` with a value ${w}`;
}

/** A value in words, for example `"A"`, `one of "A", "B"`, `at least 2`. */
export function valueWords(v: Value): string {
  switch (modeOf(v)) {
    case 'exact': return q((v as { value: string }).value);
    case 'list': return `one of ${listOf(v).map(q).join(', ')}`;
    case 'pattern': return `matching the pattern ${q(patternOf(v))}`;
    case 'range': {
      const r = rangeOf(v);
      const lo = r.lower ? `${r.lower.exclusive ? 'more than' : 'at least'} ${r.lower.value}` : '';
      const hi = r.upper ? `${r.upper.exclusive ? 'less than' : 'at most'} ${r.upper.value}` : '';
      return [lo, hi].filter(Boolean).join(' and ');
    }
    case 'length': {
      const l = lengthOf(v);
      const parts = [l.exactly && `exactly ${l.exactly}`, l.atLeast && `at least ${l.atLeast}`, l.atMost && `at most ${l.atMost}`].filter(Boolean);
      return `${parts.join(' and ')} characters long`;
    }
    default: throw new TooComplex();
  }
}
const nameWords = (v: Value) => (v.kind === 'simple' ? v.value : valueWords(v));

/** A class in words: the plain name; for a class without one here, the plain name with the technical one beside it. */
function classNoun(upper: string, o: WordsOptions): string {
  const known = NOUNS[upper];
  if (known) return known;
  const display = o.className?.(upper);
  return display ? `${plainName(display).toLowerCase()} (${display})` : `element of class ${upper}`;
}

/** A class by its plain name alone, for a list that is one class and its subtypes (the technical names are in the form). */
function plainNoun(upper: string, o: WordsOptions): string {
  const display = NOUNS[upper] ? undefined : o.className?.(upper);
  return NOUNS[upper] ?? (display ? plainName(display).toLowerCase() : classNoun(upper, o));
}

function noun(f: Facet | undefined, o: WordsOptions = {}, useFamily = false, inside = false): string {
  if (!f || f.kind !== 'entity') return 'element';
  const type = f.predefinedType ? ` of type ${valueWords(f.predefinedType)}` : '';
  if (f.name.kind === 'simple') return `${classNoun(f.name.value, o)}${type}`;
  if (modeOf(f.name) === 'list') {
    const names = listOf(f.name);
    const fam = useFamily ? o.family : null;
    if (fam && names.length === fam.others.length + 1 && [fam.head, ...fam.others].every((c) => names.includes(c))) {
      const rest = fam.others.map((c) => plainNoun(c, o));
      return `${plainNoun(fam.head, o)}${rest.length <= 2 && !inside ? `, including ${rest.join(' and ')}` : ` (and its ${rest.length} ${rest.length === 1 ? 'subtype' : 'subtypes'})`}${type}`;
    }
    return `${names.map((c) => classNoun(c, o)).join(' or ')}${type}`;
  }
  throw new TooComplex();
}

/** One condition on an element, with its verb: "has the property X in Y", "is located in a space". */
function clause(f: Facet, o: WordsOptions = {}): { verb: 'has' | 'is'; text: string } {
  switch (f.kind) {
    case 'entity': return { verb: 'is', text: withArticle(noun(f, o)) };
    case 'attribute': return { verb: 'has', text: `the attribute ${nameWords(f.name)}${f.value ? valueClause(f.value) : ''}` };
    case 'property':
      return { verb: 'has', text: `the property ${nameWords(f.baseName)} in ${nameWords(f.propertySet)}${f.value ? valueClause(f.value) : ''}` };
    case 'classification':
      return { verb: 'has', text: `a classification in ${nameWords(f.system)}${f.value ? (['exact', 'list'].includes(modeOf(f.value)) ? ` with the code ${valueWords(f.value)}` : ` with a code ${valueWords(f.value)}`) : ''}` };
    case 'material': return { verb: 'has', text: f.value ? `the material ${valueWords(f.value)}` : 'a material' };
    case 'partOf': {
      const rel = f.relation ? RELATIONS[f.relation] : 'part of';
      if (!rel) throw new TooComplex();
      return { verb: 'is', text: `${rel} ${withArticle(noun({ kind: 'entity', uid: '', instructions: null, ...f.entity }, o))}` };
    }
  }
}

function join(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
/** "has A and B, and is C": consecutive clauses share their verb. */
function clauses(fs: Facet[], must: 'must' | 'must not' | 'may' | null, o: WordsOptions = {}): string {
  const cs = fs.map((f) => clause(f, o));
  const groups: { verb: string; texts: string[] }[] = [];
  for (const c of cs) {
    const g = groups[groups.length - 1];
    if (g && g.verb === c.verb) g.texts.push(c.text); else groups.push({ verb: c.verb, texts: [c.text] });
  }
  const verb = (v: string) => (must === null ? (v === 'has' ? 'has' : 'is') : must === 'must not' ? `must not ${v === 'has' ? 'have' : 'be'}` : must === 'may' ? `may ${v === 'has' ? 'have' : 'be'}` : `must ${v === 'has' ? 'have' : 'be'}`);
  return groups.map((g) => `${verb(g.verb)} ${join(g.texts)}`).join(', and ');
}

export interface Words { text: string; mode: 'sentence' | 'listing' }

export function describeSpecification(s: Specification, o: WordsOptions = {}): Words {
  try { return { text: sentence(s, o), mode: 'sentence' }; } catch (e) {
    if (!(e instanceof TooComplex)) throw e;
    return { text: listing(s, o), mode: 'listing' };
  }
}

const sameValue = (a: Value | null, b: Value | null) => JSON.stringify(a) === JSON.stringify(b);

function sentence(s: Specification, o: WordsOptions): string {
  const choice = specChoice(s);
  if (choice === 'custom') throw new TooComplex();
  if (s.applicability.length === 0) throw new TooComplex();
  const entities = s.applicability.filter((f) => f.kind === 'entity');
  if (entities.length > 1 || s.applicability.length + s.requirements.length > 12) throw new TooComplex();
  const rest = s.applicability.filter((f) => f.kind !== 'entity');
  const subject = noun(entities[0], o, true, rest.length > 0);
  const who = rest.length ? `${subject} that ${clauses(rest, null, o)}` : subject;
  // "wall, including wall standard case" is followed by a comma where a verb comes next.
  const lead = /, including [^,]*$/.test(who) ? `${who},` : who;

  if (choice === 'prohibited') return `The model must not contain any ${who}.`;
  // Requirement facets with their own cardinality.
  const reqs = s.requirements;
  const parts: string[] = [];
  const by = (c: string, must: 'must' | 'must not' | 'may') => {
    const fs = reqs.filter((f) => f.kind !== 'entity' && f.cardinality === c);
    if (fs.length) parts.push(clauses(fs, must, o));
  };
  // A requirement that names the very class the specification applies to says nothing more than the applicability does.
  const ents = reqs.filter((f) => f.kind === 'entity' && !(entities[0] && f.kind === 'entity' && entities[0].kind === 'entity' && sameValue(f.name, entities[0].name) && sameValue(f.predefinedType, entities[0].predefinedType)));
  if (ents.length) parts.push(clauses(ents, 'must', o));
  by('required', 'must'); by('prohibited', 'must not'); by('optional', 'may');
  const optionalNote = reqs.some((f) => f.kind !== 'entity' && f.cardinality === 'optional') ? ' (an optional item only has to match when the element has it)' : '';
  const existence = choice === 'required' ? `The model must contain at least one ${who}` : '';
  if (parts.length === 0) return existence ? `${existence}.` : `Every ${who} is accepted.`;
  const main = `Every ${lead} ${parts.join(', and ')}${optionalNote}`;
  return existence ? `${main}. ${existence}.` : `${main}.`;
}

/** The neutral listing: names the kinds and values, claims nothing about how they combine. */
function listing(s: Specification, o: WordsOptions): string {
  const one = (f: Facet): string => {
    const v = (x: Value | null) => (x ? safe(x) : 'any');
    switch (f.kind) {
      case 'entity': return `type of element ${classes(f.name)}${f.predefinedType ? ` (${v(f.predefinedType)})` : ''}`;
      case 'attribute': return `attribute ${v(f.name)}, value ${v(f.value)}`;
      case 'property': return `property ${v(f.baseName)} in ${v(f.propertySet)}, value ${v(f.value)}`;
      case 'classification': return `classification ${v(f.system)}, code ${v(f.value)}`;
      case 'material': return `material ${v(f.value)}`;
      case 'partOf': return `${f.relation && RELATIONS[f.relation] ? RELATIONS[f.relation] : 'part of'} ${classes(f.entity.name)}`;
    }
  };
  const classes = (x: Value): string => {
    try { return x.kind === 'simple' ? classNoun(x.value, o) : modeOf(x) === 'list' ? listOf(x).map((c) => classNoun(c, o)).join(' or ') : nameWords(x); } catch { return 'a combined condition'; }
  };
  const safe = (x: Value) => { try { return nameWords(x); } catch { return 'a combined condition'; } };
  const list = (fs: Facet[]) => (fs.length ? fs.map((f) => ('cardinality' in f && fs === s.requirements ? `${f.cardinality}: ` : '') + one(f)).join('; ') : 'nothing');
  const choice = specChoice(s);
  const min = Number(s.minOccurs), max = s.maxOccurs === 'unbounded' ? Infinity : Number(s.maxOccurs);
  const occurs = choice !== 'custom' ? `Matching elements are ${choice}.`
    : min > max ? `Its limits contradict each other: at least ${s.minOccurs} matching elements but at most ${s.maxOccurs}.`
    : `Between ${s.minOccurs} and ${s.maxOccurs} matching elements are allowed.`;
  return `Applies to: ${list(s.applicability)}. Must have: ${list(s.requirements)}. ${occurs}`;
}
