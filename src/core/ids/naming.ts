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

function phrase(f: Facet, o: NamingOptions): string | null {
  const no = 'cardinality' in f && f.cardinality === 'prohibited';
  switch (f.kind) {
    case 'property': { const n = text(f.baseName); return n ? `${no ? 'have no' : 'have a'} ${lower(n)}` : null; }
    case 'classification': { const sys = text(f.system); return no ? 'are not classified' : sys ? `are classified in ${sys}` : 'are classified'; }
    case 'material': return no ? 'have no material' : 'have a material';
    case 'attribute': {
      const n = text(f.name);
      if (!n) return null;
      return no ? `have no ${lower(n)}` : f.value ? `have a ${lower(n)} that meets the rule` : `have a ${lower(n)}`;
    }
    case 'partOf': { const c = firstClass(f.entity.name); const n = c ? nounOf(c, o) : null; return n ? `are part of a ${n}` : 'are part of another element'; }
    default: return null;
  }
}

/** The class a specification applies to as a plural noun ("walls", "building element proxies"); null when it names none or it is not known. */
export function pluralSubject(s: Pick<Specification, 'applicability'>, o: NamingOptions = {}): string | null {
  const entity = s.applicability.find((f) => f.kind === 'entity');
  const cls = entity && entity.kind === 'entity' ? firstClass(entity.name) : null;
  const noun = cls ? nounOf(cls, o) : null;
  return noun ? plural(noun) : null;
}

/** The name of a specification from its content; '' when the content does not yet say which elements it is about. */
export function suggestName(s: Pick<Specification, 'applicability' | 'requirements' | 'minOccurs' | 'maxOccurs'>, o: NamingOptions = {}): string {
  const entity = s.applicability.find((f) => f.kind === 'entity');
  const cls = entity && entity.kind === 'entity' ? firstClass(entity.name) : null;
  if (!cls) return '';
  const noun = nounOf(cls, o) ?? 'element';
  const subject = plural(noun);
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  if (s.minOccurs === '0' && s.maxOccurs === '0') return `No ${subject}`;
  const phrases = s.requirements.map((f) => phrase(f, o)).filter((p): p is string => p !== null);
  return cap([subject, phrases.join(' and ')].filter(Boolean).join(' '));
}

/** The specification with its name brought in step with its content, when the name is still the one this page worked out. */
export function syncName<S extends Pick<Specification, 'applicability' | 'requirements' | 'minOccurs' | 'maxOccurs' | 'name' | 'autoName'>>(s: S, o: NamingOptions = {}): S {
  if (!s.autoName) return s;
  const name = suggestName(s, o);
  return name && name !== s.name ? { ...s, name } : s;
}
