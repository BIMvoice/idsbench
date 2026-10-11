// IDS matches the exact IFC class. The user manual of the standard (Documentation/UserManual/entity-facet.md, "Inheritance"):
// "There is no automatic inheritance in IDS entity facet interpretation. In other words, all the entities need to be
// listed explicitly." A specification for IfcWall therefore does not reach an IfcWallStandardCase. This works out, from
// the class tables the Check engine ships, which subtypes a chosen class has in the IFC versions a specification
// ticks, says so in one line, and builds the list that includes them. The list holds only what every ticked version
// has as a class an element can be: a subtype that only some of them have is named in the line and left out of the
// list, and a class that is abstract (IfcElement, IfcBuildingElement: nothing in a model is one of these itself) is
// said to match nothing and is replaced by its subtypes.
import type { SchemaData } from '@idsbench/check/ifc';
import type { Facet, Specification, Value } from './ids/model';
import { fromList, listOf, modeOf } from './ids/value';

export interface SubtypeNote {
  /** The classes the specification names, as the standard writes them: "IfcWall". */
  chosen: string[];
  /** The concrete subtypes of them that every ticked version has and the specification does not name: "IfcWallStandardCase". These are what the action adds. */
  subtypes: { name: string; upper: string }[];
  /** The named classes that are abstract in every ticked version that has them: no element in a model is one of these, so naming them matches nothing. The action takes them out. */
  abstract: { name: string; upper: string }[];
  /** The concrete subtypes that only some of the ticked versions have, with those versions. Named in the line; never added. */
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
 * ticks): their concrete subtypes, minus those it already names; and which of its classes are abstract. Null when
 * there is nothing to say, or when the classes are not known.
 */
export function subtypeNote(spec: Pick<Specification, 'applicability'>, schemas: SchemaData[]): SubtypeNote | null {
  const entity = spec.applicability.find((f) => f.kind === 'entity');
  const named = namedClasses(entity);
  if (!named || named.length === 0 || schemas.length === 0) return null;
  const known = named.filter((c) => schemas.some((s) => s.classes.has(c)));
  if (known.length === 0) return null;
  const display = (u: string) => schemas.map((s) => s.classes.get(u)?.name).find(Boolean) ?? u;
  const isAbstract = (c: string) => schemas.every((s) => { const k = s.classes.get(c)?.kind; return k === undefined || k === 'abstract'; });
  const inEvery = new Set<string>(), inSome = new Map<string, Set<string>>();
  for (const c of known) {
    const per = schemas.map((s) => new Set(s.classes.has(c) ? s.concrete(c).filter((u) => u !== c && !named.includes(u)) : []));
    per.forEach((set, i) => {
      for (const u of set) {
        if (per.every((p) => p.has(u))) inEvery.add(u);
        else inSome.set(u, (inSome.get(u) ?? new Set()).add(schemas[i].label));
      }
    });
  }
  // A subtype that every version has under one of the named classes is offered, whatever the other named classes say.
  for (const u of inEvery) inSome.delete(u);
  const abstract = byName(known.filter(isAbstract).map((upper) => ({ upper, name: display(upper) })));
  if (inEvery.size === 0 && inSome.size === 0 && abstract.length === 0) return null;
  const subtypes = byName([...inEvery].map((upper) => ({ upper, name: display(upper) })));
  const partial = byName([...inSome].map(([upper, versions]) => ({ upper, name: display(upper), versions: [...versions] })));
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
  if (partial.length && schemas.length > 1) {
    const one = partial.length === 1;
    const which = short(partial.map((x) => `${x.name} (${x.versions.join(', ')} only)`), 3);
    parts.push(`${join(which, 'and')} ${one ? 'is' : 'are'} not in every IFC version this specification ticks, so ${one ? 'it is' : 'they are'} not offered.`);
  }
  return { chosen, subtypes, abstract, partial, text: parts.join(' ') };
}

/** The entity name as a list of the classes it names and their subtypes, without the classes that are abstract (when there is something to put in their place). */
export function withSubtypes(name: Value, note: SubtypeNote): Value {
  const named = name.kind === 'simple' ? [name.value] : listOf(name);
  const gone = new Set(note.subtypes.length ? note.abstract.map((a) => a.upper) : []);
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
export function addSubtypes<S extends Pick<Specification, 'applicability'>>(spec: S, note: SubtypeNote): S {
  return { ...spec, applicability: spec.applicability.map((f) => (f.kind === 'entity' ? { ...f, name: withSubtypes(f.name, note) } : f)) };
}
