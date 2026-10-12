/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// What a specification leaves out of THIS model. IDS matches the exact IFC class ("There is no automatic inheritance in
// IDS entity facet interpretation"), so a specification for IfcWall does not apply to an IfcWallStandardCase, and a model
// whose walls are all IfcWallStandardCase reports "no element matches it". This works out, from the model's own class
// counts and the IFC tables of the model's version, which elements of a subtype, a supertype or a sibling of a class the
// specification names are in the model and not covered, so that the result can say so. It only reads counts: it never
// changes what a specification applied to, how many elements failed, or the verdict.
import type { SchemaData } from '@idsbench/check/ifc';
import type { Coverage } from './types';

const join = (items: string[], and = 'and') => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`);

/** At most this many classes are named in the sentence; the rest are counted. */
const NAMED = 4;

/**
 * @param named the classes the specification names, in capitals
 * @param applicable how many elements the specification applied to
 * @param count how many elements of exactly this class (in capitals) the model has
 * @returns null when the model holds nothing of the kind, or when the specification could not have been the reason
 */
export function coverageOf(named: string[], applicable: number, count: (upper: string) => number, schema: SchemaData, hasOtherConditions = false): Coverage | null {
  const cls = (u: string) => schema.classes.get(u);
  const real = named.filter((u) => cls(u)?.kind === 'concrete');
  if (real.length === 0) return null;
  const related = new Map<string, 'subtype' | 'supertype' | 'sibling'>();
  const add = (u: string, how: 'subtype' | 'supertype' | 'sibling') => { if (!named.includes(u) && cls(u)?.kind === 'concrete' && !related.has(u)) related.set(u, how); };
  for (const n of real) {
    for (const u of schema.concrete(n)) add(u, 'subtype');
    const parent = cls(n)?.parentUpper;
    for (let p = parent; p; p = cls(p)?.parentUpper) if (cls(p)?.kind === 'concrete') add(p, 'supertype');
    // A sibling is told only in a small family: the other variants of the class named (IfcWallElementedCase beside
    // IfcWallStandardCase, both an IfcWall). Where the class above is itself one of many under a class elements can be
    // (IfcSanitaryTerminal under IfcFlowTerminal under IfcDistributionFlowElement), its siblings are other things
    // altogether (light fixtures, air terminals), and a specification for one has nothing to say about them.
    const grand = parent ? cls(parent)?.parentUpper : undefined;
    if (parent && cls(parent)?.kind === 'concrete' && !(grand && cls(grand)?.kind === 'concrete')) {
      for (const sib of schema.children.get(parent) ?? []) for (const u of schema.concrete(sib)) add(u, 'sibling');
    }
  }
  const present = [...related].map(([upper, how]) => ({ upper, how, count: count(upper) })).filter((r) => r.count > 0).sort((a, b) => b.count - a.count || a.upper.localeCompare(b.upper));
  if (present.length === 0) return null;
  const display = (u: string) => cls(u)?.name ?? u;
  const names = real.map(display);
  const shown = present.slice(0, NAMED).map((r) => `${r.count.toLocaleString('en')} ${display(r.upper)}`);
  const more = present.length - NAMED;
  const theirs = `${join(shown)}${more > 0 ? ` and ${more} other ${more === 1 ? 'class' : 'classes'}` : ''}`;
  let text: string;
  if (applicable === 0) {
    // Only said when the class itself is not in the model; a specification with other conditions may match nothing for those.
    if (hasOtherConditions || real.some((u) => count(u) > 0)) return null;
    text = `This specification names ${join(names)}. The model has no ${join(names, 'or')}, but it has ${theirs}, which this specification does not cover.`;
  } else {
    text = `This specification names ${join(names)}. The model also has ${theirs}, which this specification does not cover.`;
  }
  return { text, related: present.map((r) => ({ name: display(r.upper), upper: r.upper, count: r.count, how: r.how })) };
}

/** The classes the entity facet of a library specification's applicability names (simple value or list), in capitals; null for a pattern or no entity facet. */
export function namedByLibrarySpec(spec: { applicability?: { facets: { type: string; name?: unknown; predefinedType?: unknown }[] } }): { named: string[]; other: boolean } | null {
  const facets = spec.applicability?.facets ?? [];
  const entity = facets.find((f) => f.type === 'entity');
  const c = entity?.name as { type: string; value?: string; values?: string[] } | undefined;
  if (!entity || !c) return null;
  const named = c.type === 'simpleValue' && c.value ? [c.value] : c.type === 'enumeration' && c.values?.length ? c.values : null;
  if (!named) return null;
  return { named: named.map((n) => n.toUpperCase()), other: facets.length > 1 || entity.predefinedType !== undefined };
}

/** The version of the tables for a model's IFC version as the file names it. */
export function tableVersion(modelSchema: string): 'IFC2X3' | 'IFC4' | 'IFC4X3_ADD2' | null {
  const u = modelSchema.trim().toUpperCase();
  return u.startsWith('IFC4X3') ? 'IFC4X3_ADD2' : u.startsWith('IFC2X3') ? 'IFC2X3' : u === 'IFC4' ? 'IFC4' : null;
}
