// A name for a specification, worked out from what it says ("Walls have a fire rating"). A specification made by this
// page carries `autoName` while its name is the one worked out here; the name then follows the content, and stops
// following it the moment the person types a name of their own.
import { NOUNS } from './words';
import { listOf, modeOf } from './value';
import { plainName } from '../picks';
import type { Facet, Specification, Value } from './model';

export interface NamingOptions {
  /** The class as the standard writes it ("IfcBuildingElementProxy") from the name in capitals; undefined when not known. */
  className?: (upper: string) => string | undefined;
  /** Set when the classes the entity facet lists are one class and subtypes of it: the name is then about that class. */
  family?: { head: string; others: string[] } | null;
}

export function plural(noun: string): string {
  if (/[^aeiou]y$/.test(noun)) return `${noun.slice(0, -1)}ies`;
  if (/(s|x|ch|sh)$/.test(noun)) return `${noun}es`;
  return `${noun}s`;
}

const lower = (s: string) => plainName(s).toLowerCase();

/** The class, as a plain lower-case noun ("wall", "building element proxy"); null when it is not known. */
function nounOf(upper: string, o: NamingOptions): string | null {
  const n = NOUNS[upper];
  if (n) return n;
  const display = o.className?.(upper);
  return display ? plainName(display).toLowerCase() : null;
}

const firstClass = (v: Value): string | null => (v.kind === 'simple' ? (v.value || null) : modeOf(v) === 'list' ? listOf(v)[0] ?? null : null);
const text = (v: Value | null) => (v && v.kind === 'simple' ? v.value : '');

/**
 * The elements a specification is about, as a plural: "walls" for one class or for a class and its subtypes, "walls and
 * doors" for two classes, "walls and 3 other classes" for a longer list that is not one class and its subtypes (a name
 * that said "walls" alone would be the name of another specification). Null when no class is named.
 */
function subjectOf(s: Pick<Specification, 'applicability'>, o: NamingOptions): string | null {
  const entity = s.applicability.find((f) => f.kind === 'entity');
  if (!entity || entity.kind !== 'entity') return null;
  const classes = entity.name.kind === 'simple' ? [entity.name.value].filter(Boolean) : modeOf(entity.name) === 'list' ? listOf(entity.name).filter(Boolean) : [];
  if (classes.length === 0) return null;
  const many = (upper: string) => plural(nounOf(upper, o) ?? 'element');
  const fam = o.family;
  if (fam && classes.length === fam.others.length + 1 && [fam.head, ...fam.others].every((c) => classes.includes(c))) return many(fam.head);
  if (classes.length === 1) return many(classes[0]);
  if (classes.length === 2) return `${many(classes[0])} and ${many(classes[1])}`;
  return `${many(classes[0])} and ${classes.length - 1} other classes`;
}
/** True when the specification is about some of the elements of its class only: a predefined type, or another condition under "Applies to". */
const narrowed = (s: Pick<Specification, 'applicability'>) => s.applicability.some((f) => f.kind !== 'entity' || f.predefinedType !== null);

function phrase(f: Facet, o: NamingOptions): string | null {
  const no = 'cardinality' in f && f.cardinality === 'prohibited';
  switch (f.kind) {
    // A requirement that also says what the value must be is not named as if any value would do.
    case 'property': { const n = text(f.baseName); return n ? (no ? `have no ${lower(n)}` : f.value ? `have a ${lower(n)} that meets the rule` : `have a ${lower(n)}`) : null; }
    case 'classification': { const sys = text(f.system); return no ? (sys ? `are not classified in ${sys}` : 'are not classified') : `${sys ? `are classified in ${sys}` : 'are classified'}${f.value ? ' with the code asked for' : ''}`; }
    case 'material': return no ? 'have no material' : f.value ? 'have the material asked for' : 'have a material';
    case 'attribute': {
      const n = text(f.name);
      if (!n) return null;
      return no ? `have no ${lower(n)}` : f.value ? `have a ${lower(n)} that meets the rule` : `have a ${lower(n)}`;
    }
    case 'partOf': { const c = firstClass(f.entity.name); const n = c ? nounOf(c, o) : null; return n ? `are part of a ${n}` : 'are part of another element'; }
    default: return null;
  }
}

/** The elements a specification applies to as a plural noun ("walls", "building element proxies", "walls and doors"); null when it names none. */
export function pluralSubject(s: Pick<Specification, 'applicability'>, o: NamingOptions = {}): string | null {
  return subjectOf(s, o);
}

/** The name of a specification from its content; '' when the content does not yet say which elements it is about. */
export function suggestName(s: Pick<Specification, 'applicability' | 'requirements' | 'minOccurs' | 'maxOccurs'>, o: NamingOptions = {}): string {
  const subject = subjectOf(s, o);
  if (!subject) return '';
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  // "Walls have a fire rating" would be the name of a rule for every wall: one for some of them says so.
  const some = narrowed(s);
  if (s.minOccurs === '0' && s.maxOccurs === '0') return some ? `No ${subject} of a certain kind` : `No ${subject}`;
  // "have a name and have a reference" reads "have a name and a reference".
  const phrases = s.requirements.map((f) => phrase(f, o)).filter((p): p is string => p !== null).map((p, i, all) => (i > 0 && p.startsWith('have a ') && all[i - 1].startsWith('have a ') ? p.slice('have '.length) : p));
  return cap([some ? `certain ${subject}` : subject, phrases.join(' and ')].filter(Boolean).join(' '));
}

/** The specification with its name brought in step with its content, when the name is still the one this page worked out. */
export function syncName<S extends Pick<Specification, 'applicability' | 'requirements' | 'minOccurs' | 'maxOccurs' | 'name' | 'autoName'>>(s: S, o: NamingOptions = {}): S {
  if (!s.autoName) return s;
  const name = suggestName(s, o);
  return name && name !== s.name ? { ...s, name } : s;
}

/**
 * The specification after the person has edited its name field to `typed`. A name of their own stops the name following the
 * content; a field they have emptied has no name of its own any more, so the name follows the content again (it is filled in
 * at the next change of the content, not at once, so that clearing the field to type another name is not undone under their hands).
 */
export function withTypedName<S extends Pick<Specification, 'name' | 'autoName'>>(s: S, typed: string): S {
  const { autoName: _was, ...rest } = s;
  return (typed.trim() === '' ? { ...rest, name: typed, autoName: true } : { ...rest, name: typed }) as S;
}
