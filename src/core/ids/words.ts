// "This IDS in words": a short sentence per specification. It is small on purpose. When a specification is
// outside what it can say truthfully, it lists the parts neutrally instead of guessing.
import { specChoice, type Facet, type Specification, type Value } from './model';
import { lengthOf, listOf, modeOf, patternOf, rangeOf } from './value';

export const NOUNS: Record<string, string> = {
  IFCWALL: 'wall', IFCWALLSTANDARDCASE: 'wall', IFCDOOR: 'door', IFCWINDOW: 'window', IFCSLAB: 'slab', IFCCOLUMN: 'column',
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

function noun(f: Facet | undefined): string {
  if (!f || f.kind !== 'entity') return 'element';
  if (f.name.kind === 'simple') {
    const n = NOUNS[f.name.value];
    const base = n ?? `element of class ${f.name.value}`;
    if (f.predefinedType) return `${base} of type ${valueWords(f.predefinedType)}`;
    return base;
  }
  if (modeOf(f.name) === 'list') {
    const items = listOf(f.name).map((c) => NOUNS[c] ?? c);
    const base = items.join(' or ');
    return f.predefinedType ? `${base} of type ${valueWords(f.predefinedType)}` : base;
  }
  throw new TooComplex();
}

/** One condition on an element, with its verb: "has the property X in Y", "is located in a space". */
function clause(f: Facet): { verb: 'has' | 'is'; text: string } {
  switch (f.kind) {
    case 'entity': return { verb: 'is', text: `a ${noun(f)}` };
    case 'attribute': return { verb: 'has', text: `the attribute ${nameWords(f.name)}${f.value ? valueClause(f.value) : ''}` };
    case 'property':
      return { verb: 'has', text: `the property ${nameWords(f.baseName)} in ${nameWords(f.propertySet)}${f.value ? valueClause(f.value) : ''}` };
    case 'classification':
      return { verb: 'has', text: `a classification in ${nameWords(f.system)}${f.value ? (['exact', 'list'].includes(modeOf(f.value)) ? ` with the code ${valueWords(f.value)}` : ` with a code ${valueWords(f.value)}`) : ''}` };
    case 'material': return { verb: 'has', text: f.value ? `the material ${valueWords(f.value)}` : 'a material' };
    case 'partOf': {
      const rel = f.relation ? RELATIONS[f.relation] : 'part of';
      if (!rel) throw new TooComplex();
      return { verb: 'is', text: `${rel === 'part of' ? 'part of' : rel} a ${noun({ kind: 'entity', uid: '', instructions: null, ...f.entity })}` };
    }
  }
}

function join(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
/** "has A and B, and is C": consecutive clauses share their verb. */
function clauses(fs: Facet[], must: 'must' | 'must not' | 'may' | null): string {
  const cs = fs.map(clause);
  const groups: { verb: string; texts: string[] }[] = [];
  for (const c of cs) {
    const g = groups[groups.length - 1];
    if (g && g.verb === c.verb) g.texts.push(c.text); else groups.push({ verb: c.verb, texts: [c.text] });
  }
  const verb = (v: string) => (must === null ? (v === 'has' ? 'has' : 'is') : must === 'must not' ? `must not ${v === 'has' ? 'have' : 'be'}` : must === 'may' ? `may ${v === 'has' ? 'have' : 'be'}` : `must ${v === 'has' ? 'have' : 'be'}`);
  return groups.map((g) => `${verb(g.verb)} ${join(g.texts)}`).join(', and ');
}

export interface Words { text: string; mode: 'sentence' | 'listing' }

export function describeSpecification(s: Specification): Words {
  try { return { text: sentence(s), mode: 'sentence' }; } catch (e) {
    if (!(e instanceof TooComplex)) throw e;
    return { text: listing(s), mode: 'listing' };
  }
}

function sentence(s: Specification): string {
  const choice = specChoice(s);
  if (choice === 'custom') throw new TooComplex();
  if (s.applicability.length === 0) throw new TooComplex();
  const entities = s.applicability.filter((f) => f.kind === 'entity');
  if (entities.length > 1 || s.applicability.length + s.requirements.length > 8) throw new TooComplex();
  const rest = s.applicability.filter((f) => f.kind !== 'entity');
  const subject = noun(entities[0]);
  const who = rest.length ? `${subject} that ${clauses(rest, null)}` : subject;

  if (choice === 'prohibited') return `The model must not contain any ${who}.`;
  // Requirement facets with their own cardinality.
  const reqs = s.requirements;
  const parts: string[] = [];
  const by = (c: string, must: 'must' | 'must not' | 'may') => {
    const fs = reqs.filter((f) => f.kind !== 'entity' && f.cardinality === c);
    if (fs.length) parts.push(clauses(fs, must));
  };
  const ents = reqs.filter((f) => f.kind === 'entity');
  if (ents.length) parts.push(clauses(ents, 'must'));
  by('required', 'must'); by('prohibited', 'must not'); by('optional', 'may');
  const optionalNote = reqs.some((f) => f.kind !== 'entity' && f.cardinality === 'optional') ? ' (an optional item only has to match when the element has it)' : '';
  const existence = choice === 'required' ? `The model must contain at least one ${who}` : '';
  if (parts.length === 0) return existence ? `${existence}.` : `Every ${who} is accepted.`;
  const main = `Every ${who} ${parts.join(', and ')}${optionalNote}`;
  return existence ? `${main}. ${existence}.` : `${main}.`;
}

/** The neutral listing: names the kinds and values, claims nothing about how they combine. */
function listing(s: Specification): string {
  const one = (f: Facet): string => {
    const v = (x: Value | null) => (x ? safe(x) : 'any');
    switch (f.kind) {
      case 'entity': return `type of element ${v(f.name)}${f.predefinedType ? ` (${v(f.predefinedType)})` : ''}`;
      case 'attribute': return `attribute ${v(f.name)}, value ${v(f.value)}`;
      case 'property': return `property ${v(f.baseName)} in ${v(f.propertySet)}, value ${v(f.value)}`;
      case 'classification': return `classification ${v(f.system)}, code ${v(f.value)}`;
      case 'material': return `material ${v(f.value)}`;
      case 'partOf': return `part of ${v(f.entity.name)}${f.relation ? ` by ${f.relation}` : ''}`;
    }
  };
  const safe = (x: Value) => { try { return nameWords(x); } catch { return 'a combined condition'; } };
  const list = (fs: Facet[]) => (fs.length ? fs.map((f) => ('cardinality' in f && fs === s.requirements ? `${f.cardinality}: ` : '') + one(f)).join('; ') : 'nothing');
  const choice = specChoice(s);
  const occurs = choice === 'custom' ? `Between ${s.minOccurs} and ${s.maxOccurs} matching elements are allowed.` : `Matching elements are ${choice}.`;
  return `Applies to: ${list(s.applicability)}. Must have: ${list(s.requirements)}. ${occurs}`;
}
