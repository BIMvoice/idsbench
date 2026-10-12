/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// IDS matches the exact IFC class. The user manual of the standard (Documentation/UserManual/entity-facet.md, "Inheritance"):
// "There is no automatic inheritance in IDS entity facet interpretation. In other words, all the entities need to be
// listed explicitly." A specification for IfcWall therefore does not reach an IfcWallStandardCase. This works out, from
// the class tables the Check engine ships, which subtypes a chosen class has in the IFC versions a specification
// ticks, says so in one line, and builds the list that includes them. The list holds the subtypes of EVERY ticked
// version, also those only some of them have (IfcDoorStandardCase is a class of IFC4 alone): a specification that ticks
// IFC4 is run against IFC4 models, and a list without that class would pass over their doors. The Check engine accepts
// such a list (each name has to be a class of some ticked version, and each version has to know at least one of them;
// tests/subtype-union.test.ts feeds it every class the form offers). The one kind left out is a class that another
// ticked version puts under a different class (IfcZone: an IfcSystem in IFC4, not in IFC2X3), because there the list
// would apply to more than the class named; the line says so. A class that is abstract (IfcElement,
// IfcBuildingElement: nothing in a model is one of these itself) is said to match nothing and is replaced by its subtypes.
import type { SchemaData } from '@idsbench/check/ifc';
import type { Facet, Specification, Value } from './ids/model';
import { fromList, listOf, modeOf } from './ids/value';

export interface SubtypeNote {
  /** The classes the specification names, as the standard writes them: "IfcWall". */
  chosen: string[];
  /** The concrete subtypes of them, in any ticked version, that the specification does not name: "IfcWallStandardCase". These are what the action adds. */
  subtypes: { name: string; upper: string }[];
  /** The named classes that are abstract in every ticked version that has them: no element in a model is one of these, so naming them matches nothing. The action takes them out. */
  abstract: { name: string; upper: string }[];
  /** The concrete subtypes that are subtypes in some ticked versions (those given) and classes under another class in others. Named in the line; never added. */
  partial: { name: string; upper: string; versions: string[] }[];
  /** The line to show. */
  text: string;
}

const join = (items: string[], and: string) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`);
const short = (names: string[], keep: number) => (names.length > keep + 1 ? [...names.slice(0, keep), `${names.length - keep} more`] : names);
const byName = <T extends { name: string }>(list: T[]) => list.sort((a, b) => a.name.localeCompare(b.name, 'en'));

/** The classes the entity facet of the applicability names, in capitals; null when it names them in a way a list cannot extend (a pattern, say). */
export function namedClasses(f: Facet | undefined): string[] | null {
  if (!f || f.kind !== 'entity') return null;
  if (f.name.kind === 'simple') return f.name.value ? [f.name.value.toUpperCase()] : null;
  return modeOf(f.name) === 'list' ? listOf(f.name).filter(Boolean).map((c) => c.toUpperCase()) : null;
}

/**
 * What the specification's classes leave out, in the given IFC tables (those of the versions the specification
 * ticks): their concrete subtypes in any of those versions, minus those it already names; and which of its classes
 * are abstract. Null when there is nothing to say, or when the classes are not known.
 */
export function subtypeNote(spec: Pick<Specification, 'applicability'>, schemas: SchemaData[]): SubtypeNote | null {
  const entity = spec.applicability.find((f) => f.kind === 'entity');
  const named = namedClasses(entity);
  if (!named || named.length === 0 || schemas.length === 0) return null;
  const known = named.filter((c) => schemas.some((s) => s.classes.has(c)));
  if (known.length === 0) return null;
  const display = (u: string) => schemas.map((s) => s.classes.get(u)?.name).find(Boolean) ?? u;
  const isAbstract = (c: string) => schemas.every((s) => { const k = s.classes.get(c)?.kind; return k === undefined || k === 'abstract'; });
  // Every concrete subtype any ticked version gives a named class. One is added to the list unless some ticked version
  // has it as a class that is NOT under any named class there (IfcZone is an IfcSystem in IFC4 and a class of its own in
  // IFC2X3): in a list it would apply to elements that version does not count among the named class.
  const under = (s: SchemaData, u: string) => known.some((c) => s.classes.has(c) && s.isA(u, c));
  // A named class that some ticked version does not have brings nothing in: the Check engine refuses the name for that
  // version, and a list of its subtypes would pass for a file that covers the class there, which it would not.
  const everywhere = (c: string) => schemas.every((s) => s.classes.has(c));
  const found = new Set<string>();
  for (const c of known) if (everywhere(c)) for (const s of schemas) for (const u of s.concrete(c)) if (u !== c && !named.includes(u)) found.add(u);
  const elsewhere = (u: string) => schemas.some((s) => s.classes.get(u)?.kind === 'concrete' && !under(s, u));
  // An abstract class whose subtypes are all named beside it (as this page writes it) needs no word: the list applies to them.
  const covered = (c: string) => everywhere(c) && schemas.some((s) => s.concrete(c).length > 0) && schemas.every((s) => s.concrete(c).every((u) => named.includes(u) || elsewhere(u)));
  const abstract = byName(known.filter((c) => isAbstract(c) && !covered(c)).map((upper) => ({ upper, name: display(upper) })));
  if (found.size === 0 && abstract.length === 0) return null;
  const subtypes = byName([...found].filter((u) => !elsewhere(u)).map((upper) => ({ upper, name: display(upper) })));
  const partial = byName([...found].filter(elsewhere).map((upper) => ({ upper, name: display(upper), versions: schemas.filter((s) => s.classes.get(upper)?.kind === 'concrete' && under(s, upper)).map((s) => s.label) })));
  const chosen = known.map(display);
  const real = known.filter((c) => !isAbstract(c)).map(display);

  const parts: string[] = [];
  if (abstract.length) {
    const one = abstract.length === 1;
    const names = join(abstract.map((a) => a.name), 'and');
    parts.push(`${names} ${one ? 'is an abstract class' : 'are abstract classes'}: a model never holds ${one ? `an element that is ${names} itself` : 'an element that is one of them itself'}, only ${one ? 'its' : 'their'} subtypes${real.length ? '' : ', so this specification applies to nothing as it is written'}.`);
  }
  const leftOut = byName([...subtypes, ...partial]).map((x) => x.name);
  if (real.length && leftOut.length) parts.push(`This applies to ${join(real, 'and')} only, not to ${join(short(leftOut, 5), 'or')}.`);
  if (partial.length) {
    const one = partial.length === 1;
    const which = short(partial.map((x) => `${x.name} (a subtype in ${x.versions.join(', ')} only)`), 3);
    parts.push(`${join(which, 'and')} ${one ? 'is' : 'are'} under another class in the other IFC versions this specification ticks, so ${one ? 'it is' : 'they are'} not offered: add ${one ? 'it' : 'them'} to the list yourself, or tick fewer versions.`);
  }
  return { chosen, subtypes, abstract, partial, text: parts.join(' ') };
}

/**
 * The entity name as a list of the classes it names and their subtypes, without the classes that are abstract (when
 * there is something to put in their place). With `keepAbstract` an abstract class stays at the head of its subtypes:
 * it applies to nothing itself, and it is what says which class the list was made from.
 */
export function withSubtypes(name: Value, note: SubtypeNote, keepAbstract = false): Value {
  const named = name.kind === 'simple' ? [name.value] : listOf(name);
  const gone = new Set(note.subtypes.length && !keepAbstract ? note.abstract.map((a) => a.upper) : []);
  return fromList([...named.filter((c) => !gone.has(c.toUpperCase())), ...note.subtypes.map((s) => s.upper)], 'xs:string');
}

/** What the button says; null when there is nothing to add (the line then only says what is). */
export function subtypeAction(note: SubtypeNote): string | null {
  const n = note.subtypes.length;
  if (n === 0) return null;
  // With nothing but abstract classes named, the subtypes do not come on top of something that applies: they take its place.
  if (note.abstract.length === note.chosen.length) return n === 1 ? `Apply it to ${note.subtypes[0].name} instead` : `Apply it to the ${n} subtypes instead`;
  return n === 1 ? `Also apply it to ${note.subtypes[0].name}` : `Also apply it to the ${n} subtypes`;
}

/** The specification with its entity facet naming the classes and their subtypes. */
export function addSubtypes<S extends Pick<Specification, 'applicability'>>(spec: S, note: SubtypeNote, keepAbstract = false): S {
  return { ...spec, applicability: spec.applicability.map((f) => (f.kind === 'entity' ? { ...f, name: withSubtypes(f.name, note, keepAbstract) } : f)) };
}

// ---- the default for a specification made by this page: the class and its subtypes ----

/** A class and subtypes of it, as the entity facet of a specification lists them. */
export interface Family {
  /** The class every other one in the list is a subtype of, in capitals. */
  head: string;
  /** The others, in capitals, in the order the list has them. */
  others: string[];
}

/**
 * The class that all the other classes of the entity facet's list are subtypes of (in every ticked version that has
 * both), or null when the facet is not such a list.
 */
export function familyOf(spec: Pick<Specification, 'applicability'>, schemas: SchemaData[]): Family | null {
  const named = namedClasses(spec.applicability.find((f) => f.kind === 'entity'));
  if (!named || named.length < 2 || schemas.length === 0) return null;
  const head = named.find((c) => named.every((o) => o === c || schemas.some((s) => s.classes.has(o) && s.classes.has(c) && s.isA(o, c))));
  return head ? { head, others: named.filter((c) => c !== head) } : null;
}

/**
 * The specification applying to the class it names and its subtypes: what a specification made by this page does, unless
 * the person narrowed it. Unchanged when there is nothing to add. The class named stays first in the list, also when it
 * is abstract, so that the page (and a reader of the file) can tell which class the list stands for.
 */
export function withDefaultSubtypes<S extends Pick<Specification, 'applicability'>>(spec: S, schemas: SchemaData[]): S {
  const note = subtypeNote(spec, schemas);
  return note && note.subtypes.length ? addSubtypes(spec, note, true) : spec;
}

/** The specification applying to the head class alone. */
export function narrowToHead<S extends Pick<Specification, 'applicability'>>(spec: S, family: Family): S {
  return { ...spec, applicability: spec.applicability.map((f) => (f.kind === 'entity' ? { ...f, name: { kind: 'simple' as const, value: family.head } } : f)) };
}
