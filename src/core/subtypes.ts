// IDS matches the exact IFC class. The user manual of the standard (Documentation/UserManual/entity-facet.md, "Inheritance"):
// "There is no automatic inheritance in IDS entity facet interpretation. In other words, all the entities need to be
// listed explicitly." A specification for IfcWall therefore does not reach an IfcWallStandardCase. This works out, from
// the class tables the Check engine ships, which subtypes a chosen class has in the IFC versions a specification
// ticks, says so in one line, and builds the list that includes them.
import type { SchemaData } from '@idsbench/check/ifc';
import type { Facet, Specification, Value } from './ids/model';
import { fromList, listOf, modeOf } from './ids/value';

export interface SubtypeNote {
  /** The classes the specification names, as the standard writes them: "IfcWall". */
  chosen: string[];
  /** The concrete subtypes of them, in any ticked version, that the specification does not name: "IfcWallStandardCase". */
  subtypes: { name: string; upper: string }[];
  /** The line to show. */
  text: string;
}

const join = (items: string[], and: string) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`);

/** The classes the entity facet of the applicability names, in capitals; null when it names them in a way a list cannot extend (a pattern, say). */
export function namedClasses(f: Facet | undefined): string[] | null {
  if (!f || f.kind !== 'entity') return null;
  if (f.name.kind === 'simple') return f.name.value ? [f.name.value.toUpperCase()] : null;
  return modeOf(f.name) === 'list' ? listOf(f.name).filter(Boolean).map((c) => c.toUpperCase()) : null;
}

/**
 * What the specification's classes leave out: their concrete subtypes in the given IFC tables (those of the versions
 * the specification ticks), minus those it already names. Null when there are none, or when the classes are not known.
 */
export function subtypeNote(spec: Pick<Specification, 'applicability'>, schemas: SchemaData[]): SubtypeNote | null {
  const entity = spec.applicability.find((f) => f.kind === 'entity');
  const named = namedClasses(entity);
  if (!named || named.length === 0 || schemas.length === 0) return null;
  const known = named.filter((c) => schemas.some((s) => s.classes.has(c)));
  if (known.length === 0) return null;
  const subs = new Map<string, string>();
  for (const s of schemas) {
    for (const c of known) {
      for (const u of s.concrete(c)) {
        if (u !== c && !named.includes(u)) subs.set(u, s.classes.get(u)?.name ?? u);
      }
    }
  }
  if (subs.size === 0) return null;
  const chosen = known.map((c) => schemas.map((s) => s.classes.get(c)?.name).find(Boolean) ?? c);
  const subtypes = [...subs].sort((a, b) => a[1].localeCompare(b[1], 'en')).map(([upper, name]) => ({ name, upper }));
  const shown = subtypes.length > 6 ? [...subtypes.slice(0, 5).map((s) => s.name), `${subtypes.length - 5} more`] : subtypes.map((s) => s.name);
  return { chosen, subtypes, text: `This applies to ${join(chosen, 'and')} only, not to ${join(shown, 'or')}.` };
}

/** The entity name as a list of the classes it names and their subtypes. */
export function withSubtypes(name: Value, note: SubtypeNote): Value {
  const named = name.kind === 'simple' ? [name.value] : listOf(name);
  return fromList([...named, ...note.subtypes.map((s) => s.upper)], 'xs:string');
}

/** What the button says. */
export function subtypeAction(note: SubtypeNote): string {
  const n = note.subtypes.length;
  return n === 1 ? `Also apply it to ${note.subtypes[0].name}` : `Also apply it to the ${n} subtypes`;
}

/** The specification with its entity facet naming the classes and their subtypes. */
export function addSubtypes<S extends Pick<Specification, 'applicability'>>(spec: S, note: SubtypeNote): S {
  return { ...spec, applicability: spec.applicability.map((f) => (f.kind === 'entity' ? { ...f, name: withSubtypes(f.name, note) } : f)) };
}
