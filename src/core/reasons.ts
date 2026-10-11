// The app's own sentence for why an element failed one requirement, and what to do about it. The Check library gives a
// reason in its words; two of them mislead people who model ("does not exist" for an attribute that is there and empty,
// "Property set not found" without saying which property was needed), so they are put right here, at the one place the
// library's reason becomes the app's. "What to fix" is built from the requirement and the kind of failure.
import { plainName } from './picks';

export interface RequirementOutcome {
  status: string;
  failureReason?: string;
  actualValue?: string;
  failure?: { type?: string; field?: string; actual?: string; expected?: string; context?: Record<string, string> };
  /** The requirement as the library holds it (the facet and what it asks for). */
  requirement?: { optionality?: string; facet?: unknown };
}

type Constraint = { type?: string; value?: string; values?: string[] } | undefined;
/** What a constraint asks for when it asks for one thing or a short list; undefined for a pattern, a range and the like. */
function simpleOf(c: unknown): string | undefined {
  const k = c as Constraint;
  if (!k) return undefined;
  if (k.type === 'simpleValue' && k.value) return k.value;
  if (k.type === 'enumeration' && k.values?.length) return k.values.join(' or ');
  return undefined;
}
const facetOf = (q: RequirementOutcome) => q.requirement?.facet as (Record<string, unknown> & { type?: string }) | undefined;
const lower = (s: string) => plainName(s).toLowerCase();
/** "IfcSpace" or "IFCSPACE" as a plain lower-case noun: "space". */
const classWord = (cls: string) => (/[a-z]/.test(cls) ? lower(cls) : cls.replace(/^IFC/, '').toLowerCase());

/** The reason in the app's words, or null when the library's own sentence is to be used as it is. */
export function reasonOf(q: RequirementOutcome): string | null {
  const f = q.failure;
  if (!f) return null;
  // An attribute that is not set (IFC "$") or set to nothing is empty, which is what a person sees in the modelling program.
  if (f.type === 'ATTRIBUTE_MISSING' && f.field && simpleOf(facetOf(q)?.name) === f.field) return `${f.field} is empty.`;
  if (f.type === 'ATTRIBUTE_VALUE_MISMATCH' && f.field && f.actual === '(empty)') return `${f.field} is empty.`;
  // A property set that is not there means the property is not there: say which property was needed.
  if (f.type === 'PSET_MISSING') {
    const facet = facetOf(q);
    const prop = simpleOf(facet?.baseName);
    const pset = f.field || simpleOf(facet?.propertySet);
    if (prop && pset) {
      const available = f.context?.availablePsets;
      return `The property "${prop}" is missing: the property set "${pset}" is not on this element.${available ? ` Property sets it has: ${available}.` : ''}`;
    }
  }
  return null;
}

/** What to do about a failed requirement, in the imperative; '' when there is nothing specific to say. `cls` is the element's class. */
export function whatToFix(q: RequirementOutcome, cls: string): string {
  const f = q.failure;
  const facet = facetOf(q);
  const what = classWord(cls);
  const system = simpleOf(facet?.system);
  const pset = simpleOf(facet?.propertySet) ?? f?.context?.propertySet ?? '';
  const prop = simpleOf(facet?.baseName) ?? f?.field ?? '';
  const target = pset && prop ? `${pset}.${prop}` : prop;
  const expected = f?.expected && f.expected !== '?' ? f.expected : '';
  // A requirement that says "must not have" fails when the element has it: the library gives no failure detail then.
  if (!f && q.requirement?.optionality === 'prohibited') {
    switch (facet?.type) {
      case 'property': return `Remove the property ${target || ''} from this ${what}`.replace('  ', ' ');
      case 'attribute': return `Remove the ${lower(simpleOf(facet?.name) ?? 'attribute')} from this ${what}`;
      case 'classification': return system ? `Remove the ${system} classification from this ${what}` : `Remove the classification from this ${what}`;
      case 'material': return `Remove the material from this ${what}`;
      default: return `Remove what this ${what} must not have`;
    }
  }
  switch (f?.type) {
    case 'PSET_MISSING':
    case 'PROPERTY_MISSING': return prop && pset ? `Add the property ${prop} to ${pset}` : prop ? `Add the property ${prop}` : 'Add the missing property';
    case 'PROPERTY_EMPTY': return `Give ${target || 'the property'} a value`;
    case 'PROPERTY_VALUE_MISMATCH':
    case 'PROPERTY_OUT_OF_BOUNDS': return expected ? `Change ${target || 'the property'} to ${expected}` : `Correct the value of ${target || 'the property'}`;
    case 'PROPERTY_DATATYPE_MISMATCH': return expected ? `Change the data type of ${target || 'the property'} to ${expected}` : `Correct the data type of ${target || 'the property'}`;
    case 'PROPERTY_DATATYPE_UNKNOWN': return `Give ${target || 'the property'} a data type the standard knows`;
    case 'ATTRIBUTE_MISSING': {
      const a = f.field && simpleOf(facet?.name) === f.field ? f.field : simpleOf(facet?.name);
      return a ? `Give this ${what} a ${lower(a)}` : `Fill in the missing attribute of this ${what}`;
    }
    case 'ATTRIBUTE_VALUE_MISMATCH': {
      const a = f.field ?? simpleOf(facet?.name) ?? 'attribute';
      return f.actual === '(empty)' ? `Give this ${what} a ${lower(a)}` : expected ? `Change the ${lower(a)} to ${expected}` : `Correct the ${lower(a)}`;
    }
    case 'ATTRIBUTE_PATTERN_MISMATCH': return `Change the ${lower(f.field ?? simpleOf(facet?.name) ?? 'attribute')} so that it matches ${expected || 'the pattern'}`;
    case 'CLASSIFICATION_MISSING': return system ? `Classify this ${what} in ${system}` : `Classify this ${what}`;
    case 'CLASSIFICATION_SYSTEM_MISMATCH': return `Classify this ${what} in ${system ?? expected ?? 'the classification system asked for'}`;
    case 'CLASSIFICATION_VALUE_MISMATCH': return expected ? `Change the classification code to ${expected}` : 'Correct the classification code';
    case 'MATERIAL_MISSING': return `Assign a material to this ${what}`;
    case 'MATERIAL_VALUE_MISMATCH': return expected ? `Change the material to ${expected}` : 'Correct the material';
    case 'PARTOF_RELATION_MISSING': return `Make this ${what} part of ${expected && expected !== 'any' ? expected : 'the element asked for'}`;
    case 'PARTOF_ENTITY_MISMATCH': return expected ? `Make this ${what} part of ${expected}` : `Correct what this ${what} is part of`;
    case 'ENTITY_TYPE_MISMATCH': return expected ? `Change the class to ${expected}` : 'Change the class';
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
