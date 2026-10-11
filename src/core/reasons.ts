// The app's own sentence for why an element failed one requirement, and what to do about it. The Check library gives a
// reason in its words; two of them mislead people who model ("does not exist" for an attribute that is there and empty,
// "Property set not found" without saying which property was needed), so they are put right here, at the one place the
// library's reason becomes the app's. "What to fix" is built from the requirement and the kind of failure.
import { plainName } from './picks';
import { NOUNS } from './ids/words';

export interface RequirementOutcome {
  status: string;
  failureReason?: string;
  actualValue?: string;
  failure?: { type?: string; field?: string; actual?: string; expected?: string; context?: Record<string, string> };
  /** The requirement as the library holds it (the facet and what it asks for). */
  requirement?: { optionality?: string; facet?: unknown };
}

type Constraint = { type?: string; value?: string; values?: string[]; pattern?: string; minInclusive?: number; minExclusive?: number; maxInclusive?: number; maxExclusive?: number } | undefined;
/** What a constraint asks for when it asks for one thing or a short list; undefined for a pattern, a range and the like. */
function simpleOf(c: unknown): string | undefined {
  const k = c as Constraint;
  if (!k) return undefined;
  if (k.type === 'simpleValue' && k.value) return k.value;
  if (k.type === 'enumeration' && k.values?.length) return k.values.join(' or ');
  return undefined;
}
/**
 * What a constraint asks for, in words that can follow "to" or "with": `"EI60"`, `"A" or "B"`, `a value that matches the
 * pattern "L[0-9]+"`, `a value of at least 0 and less than 10`. `noun` is what the thing is called ("value", "code").
 * Undefined when there is no constraint, or one this cannot put in words.
 */
function askedFor(c: unknown, noun = 'value'): string | undefined {
  const k = c as Constraint;
  if (!k) return undefined;
  if (k.type === 'simpleValue' && k.value !== undefined && k.value !== '') return `"${k.value}"`;
  if (k.type === 'enumeration' && k.values?.length) return k.values.length <= 6 ? k.values.map((v) => `"${v}"`).join(' or ') : `one of the ${k.values.length} ${noun}s the specification lists`;
  if (k.type === 'pattern' && k.pattern) return `a ${noun} that matches the pattern "${k.pattern}"`;
  if (k.type === 'bounds') {
    const parts = [
      k.minInclusive !== undefined ? `at least ${k.minInclusive}` : k.minExclusive !== undefined ? `more than ${k.minExclusive}` : '',
      k.maxInclusive !== undefined ? `at most ${k.maxInclusive}` : k.maxExclusive !== undefined ? `less than ${k.maxExclusive}` : '',
    ].filter(Boolean);
    return parts.length ? `a ${noun} of ${parts.join(' and ')}` : undefined;
  }
  return undefined;
}
/** After a name: ` set to "A"` for one value or a short list, ` with a value that matches ...` for the rest; '' without a constraint. */
const setTo = (c: unknown, noun = 'value') => { const w = askedFor(c, noun); return !w ? '' : /^"/.test(w) ? ` set to ${w}` : ` with ${w}`; };
const facetOf = (q: RequirementOutcome) => q.requirement?.facet as (Record<string, unknown> & { type?: string }) | undefined;
const lower = (s: string) => plainName(s).toLowerCase();
/** "IfcSpace" or "IFCSPACE" as a plain lower-case noun: "space". */
const classWord = (cls: string) => NOUNS[cls.toUpperCase()] ?? (/[a-z]/.test(cls) ? lower(cls) : cls.replace(/^IFC/, '').toLowerCase());
const withArticle = (noun: string) => `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
const unquote = (s: string | undefined) => (s ?? '').replace(/^"+|"+$/g, '');

/** What the run knows beyond the requirement: the IFC tables of the model's version. */
export interface ReasonContext {
  /** Whether the class has the attribute in the model's IFC version; undefined when that is not known. */
  hasAttribute?: (cls: string, attribute: string) => boolean | undefined;
}

const RELATION_WORDS: Record<string, string> = {
  IFCRELAGGREGATES: 'a component of', IFCRELASSIGNSTOGROUP: 'a member of', IFCRELCONTAINEDINSPATIALSTRUCTURE: 'located in', IFCRELNESTS: 'nested in',
  'IFCRELVOIDSELEMENT IFCRELFILLSELEMENT': 'placed in an opening of',
};
/** A partOf facet in words: "a component of a slab of type "FLOOR"", "part of another element". */
function partOfWords(facet: Record<string, unknown> | undefined): { relation: string; whole: string } {
  const raw = String(facet?.rawRelation ?? facet?.relation ?? '').toUpperCase();
  const relation = RELATION_WORDS[raw] ?? 'part of';
  const entity = facet?.entity as { name?: unknown; predefinedType?: unknown } | undefined;
  const name = entity?.name as Constraint;
  const cls = name?.type === 'simpleValue' && name.value ? withArticle(classWord(name.value)) : name?.type === 'enumeration' && name.values?.length ? name.values.map((v) => withArticle(classWord(v))).join(' or ') : raw === 'IFCRELASSIGNSTOGROUP' ? 'a group' : 'another element';
  const type = askedFor(entity?.predefinedType, 'type');
  return { relation, whole: `${cls}${type ? (/^"/.test(type) ? ` of type ${type}` : ' of the predefined type asked for') : ''}` };
}
/** The property a requirement or its failure names: "Pset_WallCommon.FireRating"; and its two parts where they are known. */
function propertyOf(q: RequirementOutcome): { pset: string; prop: string; target: string } {
  const f = q.failure, facet = facetOf(q);
  const pset = simpleOf(facet?.propertySet) ?? unquote(f?.context?.propertySet);
  // The failure names the property it looked at, often with its set in front ("Foo_Bar.Foobaz"): the set is not said twice.
  const field = unquote(f?.field);
  const prop = simpleOf(facet?.baseName) ?? (pset && field.startsWith(`${pset}.`) ? field.slice(pset.length + 1) : field);
  return { pset, prop, target: pset && prop ? `${pset}.${prop}` : prop };
}
/** True when the model's IFC version is known not to give the class this attribute: nothing a modeller does to the element can meet the requirement. */
const cannotHave = (cls: string, attribute: string | undefined, ctx: ReasonContext) => !!attribute && ctx.hasAttribute?.(cls, attribute) === false;

/** The reason in the app's words, or null when the library's own sentence is to be used as it is. `cls` is the element's class. */
export function reasonOf(q: RequirementOutcome, cls = '', ctx: ReasonContext = {}): string | null {
  const f = q.failure;
  const facet = facetOf(q);
  // A requirement that says "must not have" fails when the element has it. The library's sentence for that leaves a
  // placeholder unfilled ('Prohibited Name found: "{actual}"'), so the reason is said here from the requirement.
  if (!f && q.requirement?.optionality === 'prohibited') {
    switch (facet?.type) {
      case 'property': { const { target } = propertyOf(q); return target ? `Prohibited: this element has the property ${target}${setTo(facet.value)}.` : null; }
      case 'attribute': { const a = simpleOf(facet.name); return a ? `Prohibited: this element has the attribute ${a}${setTo(facet.value)}.` : null; }
      case 'classification': { const sys = simpleOf(facet.system); const code = askedFor(facet.value, 'code'); return `Prohibited: this element is classified${sys ? ` in ${sys}` : ''}${code ? ` with ${/^"/.test(code) ? `the code ${code}` : code}` : ''}.`; }
      case 'material': { const m = askedFor(facet.value, 'material'); return `Prohibited: this element has ${m ? (/^"/.test(m) ? `the material ${m}` : m) : 'a material'}.`; }
      case 'partOf': { const w = partOfWords(facet); return `Prohibited: this element is ${w.relation} ${w.whole}.`; }
      default: return null;
    }
  }
  if (!f) return null;
  // An attribute the class does not have in this IFC version is not "empty": there is nowhere to fill it in.
  if ((f.type === 'ATTRIBUTE_MISSING' || (f.type === 'ATTRIBUTE_VALUE_MISMATCH' && f.actual === '(empty)')) && cannotHave(cls, f.field ?? simpleOf(facet?.name), ctx)) {
    return `${withArticle(cls).replace(/^a/, 'A')} has no attribute ${f.field ?? simpleOf(facet?.name)} in the IFC version of this model, so it cannot meet this requirement.`;
  }
  // An attribute that is not set (IFC "$") or set to nothing is empty, which is what a person sees in the modelling program.
  if (f.type === 'ATTRIBUTE_MISSING' && f.field && simpleOf(facet?.name) === f.field) return `${f.field} is empty.`;
  if (f.type === 'ATTRIBUTE_VALUE_MISMATCH' && f.field && f.actual === '(empty)') return `${f.field} is empty.`;
  // A property set that is not there means the property is not there: say which property was needed.
  if (f.type === 'PSET_MISSING') {
    const prop = simpleOf(facet?.baseName);
    const pset = unquote(f.field) || simpleOf(facet?.propertySet);
    if (prop && pset) {
      const available = f.context?.availablePsets;
      return `The property "${prop}" is missing: the property set "${pset}" is not on this element.${available ? ` Property sets it has: ${available}.` : ''}`;
    }
  }
  // The library has no sentence for this one and gives its code.
  if (f.type === 'PARTOF_PREDEFINED_TYPE_MISMATCH') {
    const w = partOfWords(facet);
    return `This element is ${w.relation} an element of type "${unquote(f.actual)}", and it has to be ${w.relation} ${w.whole}.`;
  }
  return null;
}

/** What to do about a failed requirement, in the imperative; '' when there is nothing specific to say. `cls` is the element's class. */
export function whatToFix(q: RequirementOutcome, cls: string, ctx: ReasonContext = {}): string {
  const f = q.failure;
  const facet = facetOf(q);
  const what = classWord(cls);
  const system = simpleOf(facet?.system);
  const { pset, prop, target } = propertyOf(q);
  const expected = f?.expected && f.expected !== '?' ? f.expected : '';
  // "to" what: from the requirement where it can be put in words, otherwise as the library says it.
  const to = (c: unknown, noun = 'value') => askedFor(c, noun) ?? expected;
  // A requirement that says "must not have" fails when the element has it: the library gives no failure detail then.
  if (!f && q.requirement?.optionality === 'prohibited') {
    const orChange = (c: unknown, thing: string) => (askedFor(c) ? `, or change ${thing}` : '');
    switch (facet?.type) {
      case 'property': return `Remove the property ${target || ''} from this ${what}${orChange(facet.value, 'its value')}`.replace('  ', ' ');
      case 'attribute': return `Remove the ${lower(simpleOf(facet?.name) ?? 'attribute')} from this ${what}${orChange(facet.value, 'it')}`;
      case 'classification': return `${system ? `Remove the ${system} classification from this ${what}` : `Remove the classification from this ${what}`}${orChange(facet.value, 'its code')}`;
      case 'material': return `Remove the material from this ${what}${orChange(facet.value, 'it')}`;
      case 'partOf': { const w = partOfWords(facet); return `Change this ${what} so that it is not ${w.relation} ${w.whole}`; }
      default: return `Remove what this ${what} must not have`;
    }
  }
  const classify = () => {
    const sys = facet?.system as Constraint;
    const where = system ? ` in ${system}` : sys?.type === 'pattern' && sys.pattern ? ` in a system whose name matches the pattern "${sys.pattern}"` : !facet && expected ? ` in ${expected}` : '';
    const code = askedFor(facet?.value, 'code');
    return `Classify this ${what}${where}${code ? ` with ${/^"/.test(code) ? `the code ${code}` : code}` : ''}`;
  };
  const partOf = () => {
    const w = partOfWords(facet);
    // Without the requirement at hand, what the library expected is all there is to say.
    if (!facet?.entity && !facet?.relation) return `Make this ${what} part of ${expected && expected !== 'any' ? expected : 'the element asked for'}`;
    const raw = String(facet?.rawRelation ?? facet?.relation ?? '').toUpperCase();
    if (raw === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') return `Place this ${what} in ${w.whole}`;
    if (raw === 'IFCRELNESTS') return `Nest this ${what} in ${w.whole}`;
    if (raw === 'IFCRELVOIDSELEMENT IFCRELFILLSELEMENT') return `Place this ${what} in an opening of ${w.whole}`;
    return `Make this ${what} ${w.relation} ${w.whole}`;
  };
  switch (f?.type) {
    case 'PSET_MISSING':
    case 'PROPERTY_MISSING': {
      // Adding the property is not enough when the requirement also says what its value must be.
      const value = setTo(facet?.value);
      const type = simpleOf(facet?.dataType);
      const more = `${value}${type && value ? ` (data type ${type})` : ''}`;
      return prop && pset ? `Add the property ${prop} to ${pset}${more}` : prop ? `Add the property ${prop}${more}` : pset ? `Add the property the specification asks for to ${pset}` : 'Add the missing property';
    }
    case 'PROPERTY_EMPTY': { const v = askedFor(facet?.value); return v ? `Set ${target || 'the property'} to ${v}` : `Give ${target || 'the property'} a value`; }
    case 'PROPERTY_VALUE_MISMATCH':
    case 'PROPERTY_OUT_OF_BOUNDS': { const v = to(facet?.value); return v ? `Change ${target || 'the property'} to ${v}` : `Correct the value of ${target || 'the property'}`; }
    case 'PROPERTY_DATATYPE_MISMATCH': return expected ? `Change the data type of ${target || 'the property'} to ${unquote(expected)}` : `Correct the data type of ${target || 'the property'}`;
    case 'PROPERTY_DATATYPE_UNKNOWN': return `Give ${target || 'the property'} a data type the standard knows`;
    case 'ATTRIBUTE_MISSING':
    case 'ATTRIBUTE_VALUE_MISMATCH':
    case 'ATTRIBUTE_PATTERN_MISMATCH': {
      const a = f.field ?? simpleOf(facet?.name);
      if (!a) return f.type === 'ATTRIBUTE_MISSING' ? `Fill in the missing attribute of this ${what}` : 'Correct the attribute';
      const empty = f.type === 'ATTRIBUTE_MISSING' || f.actual === '(empty)';
      if (empty && cannotHave(cls, a, ctx)) return `Nothing can be filled in on this ${what}: change what the specification applies to, or what it asks for`;
      const v = askedFor(facet?.value);
      if (empty) return v ? `Set the ${lower(a)} of this ${what} to ${v}` : `Give this ${what} a ${lower(a)}`;
      const wanted = v ?? expected;
      return wanted ? (/^a value that matches/.test(wanted) ? `Change the ${lower(a)} to ${wanted}` : f.type === 'ATTRIBUTE_PATTERN_MISMATCH' ? `Change the ${lower(a)} so that it matches ${wanted}` : `Change the ${lower(a)} to ${wanted}`) : `Correct the ${lower(a)}`;
    }
    case 'CLASSIFICATION_MISSING':
    case 'CLASSIFICATION_SYSTEM_MISMATCH': return classify();
    case 'CLASSIFICATION_VALUE_MISMATCH': { const v = to(facet?.value, 'code'); return v ? `Change the ${system ? `${system} ` : ''}classification code of this ${what} to ${v}` : 'Correct the classification code'; }
    case 'MATERIAL_MISSING': { const m = askedFor(facet?.value, 'material'); return m ? `Assign ${/^"/.test(m) ? `the material ${m}` : m} to this ${what}` : `Assign a material to this ${what}`; }
    case 'MATERIAL_VALUE_MISMATCH': { const m = to(facet?.value, 'material'); return m ? `Change the material to ${m}` : 'Correct the material'; }
    case 'PARTOF_RELATION_MISSING':
    case 'PARTOF_ENTITY_MISMATCH':
    case 'PARTOF_PREDEFINED_TYPE_MISMATCH': return partOf();
    case 'ENTITY_TYPE_MISMATCH': { const c = to(facet?.name, 'class'); return c ? `Change the class to ${c}` : 'Change the class'; }
    case 'PREDEFINED_TYPE_MISMATCH':
    case 'PREDEFINED_TYPE_MISSING': return expected ? `Set the predefined type to ${expected}` : 'Set the predefined type';
    case 'PROHIBITED_ATTRIBUTE_EXISTS': return `Remove the ${lower(f.field ?? 'attribute')} from this ${what}`;
    case 'PROHIBITED_PROPERTY_EXISTS': return `Remove the property ${target || ''} from this ${what}`.replace('  ', ' ');
    case 'PROHIBITED_CLASSIFICATION_EXISTS': return `Remove the classification from this ${what}`;
    case 'PROHIBITED_MATERIAL_EXISTS': return `Remove the material from this ${what}`;
    default: return '';
  }
}

/** The sentence for an element that is in the model and must not be. */
export const REMOVE_ELEMENT = 'Remove this element or change its class';
