import type { RestrictionFacet, RestrictionName, Value } from './model';

/** How the user chooses to match a value. 'other' is a restriction the form cannot show as one of the five; it is kept as it is. */
export type ValueMode = 'any' | 'exact' | 'list' | 'pattern' | 'range' | 'length' | 'other';

const RANGE = ['minInclusive', 'minExclusive', 'maxInclusive', 'maxExclusive'];
const LENGTH = ['length', 'minLength', 'maxLength'];

export function modeOf(v: Value | null): ValueMode {
  if (v === null) return 'any';
  if (v.kind === 'simple') return 'exact';
  const names = v.facets.map((f) => f.name);
  if (names.length === 0) return 'other';
  const all = (set: string[]) => names.every((n) => set.includes(n));
  const once = (set: string[]) => set.every((n) => names.filter((x) => x === n).length <= 1);
  if (all(['enumeration'])) return 'list';
  if (all(['pattern']) && names.length === 1) return 'pattern';
  if (all(RANGE) && once(RANGE) && !(names.includes('minInclusive') && names.includes('minExclusive')) && !(names.includes('maxInclusive') && names.includes('maxExclusive'))) return 'range';
  if (all(LENGTH) && once(LENGTH)) return 'length';
  return 'other';
}

export const listOf = (v: Value | null): string[] =>
  v && v.kind === 'restriction' ? v.facets.filter((f) => f.name === 'enumeration').map((f) => f.value) : [];
export const patternOf = (v: Value | null): string =>
  v && v.kind === 'restriction' ? v.facets.find((f) => f.name === 'pattern')?.value ?? '' : '';

export interface Bound { value: string; exclusive: boolean }
export interface RangeParts { lower: Bound | null; upper: Bound | null }
export function rangeOf(v: Value | null): RangeParts {
  const parts: RangeParts = { lower: null, upper: null };
  if (v?.kind !== 'restriction') return parts;
  for (const f of v.facets) {
    if (f.name === 'minInclusive') parts.lower = { value: f.value, exclusive: false };
    if (f.name === 'minExclusive') parts.lower = { value: f.value, exclusive: true };
    if (f.name === 'maxInclusive') parts.upper = { value: f.value, exclusive: false };
    if (f.name === 'maxExclusive') parts.upper = { value: f.value, exclusive: true };
  }
  return parts;
}
export interface LengthParts { exactly: string; atLeast: string; atMost: string }
export function lengthOf(v: Value | null): LengthParts {
  const get = (n: RestrictionName) => (v?.kind === 'restriction' ? v.facets.find((f) => f.name === n)?.value ?? '' : '');
  return { exactly: get('length'), atLeast: get('minLength'), atMost: get('maxLength') };
}

const restriction = (base: string | null, facets: RestrictionFacet[]): Value => ({ kind: 'restriction', base, facets });

export const fromList = (items: string[], base: string): Value => restriction(base, items.map((value) => ({ name: 'enumeration', value })));
export const fromPattern = (pattern: string, base: string): Value => restriction(base, [{ name: 'pattern', value: pattern }]);
export function fromRange(r: RangeParts, base: string): Value {
  const facets: RestrictionFacet[] = [];
  if (r.lower) facets.push({ name: r.lower.exclusive ? 'minExclusive' : 'minInclusive', value: r.lower.value });
  if (r.upper) facets.push({ name: r.upper.exclusive ? 'maxExclusive' : 'maxInclusive', value: r.upper.value });
  return restriction(base, facets);
}
export function fromLength(l: LengthParts, base: string): Value {
  const facets: RestrictionFacet[] = [];
  if (l.exactly !== '') facets.push({ name: 'length', value: l.exactly });
  if (l.atLeast !== '') facets.push({ name: 'minLength', value: l.atLeast });
  if (l.atMost !== '') facets.push({ name: 'maxLength', value: l.atMost });
  return restriction(base, facets);
}

/** The starting value when the user switches how to match. The text already typed is carried over where it makes sense. */
export function switchMode(prev: Value | null, to: ValueMode, base: string): Value | null {
  const text = prev?.kind === 'simple' ? prev.value : listOf(prev)[0] ?? '';
  switch (to) {
    case 'any': return null;
    case 'exact': return { kind: 'simple', value: text };
    case 'list': return fromList(text ? [text] : [''], base);
    case 'pattern': return fromPattern('', base);
    case 'range': return fromRange({ lower: { value: '', exclusive: false }, upper: null }, base === 'xs:string' ? 'xs:double' : base);
    case 'length': return fromLength({ exactly: '', atLeast: '', atMost: '' }, base);
    case 'other': return prev;
  }
}

/** The xs:base a restriction needs for a property data type (IDS DataTypes.md: "Restriction base type"). Null when the type is not known here. */
export function baseForDataType(dt: string | null): string | null {
  if (!dt) return null;
  const exact: Record<string, string> = {
    IFCDATE: 'xs:date', IFCDATETIME: 'xs:dateTime', IFCDURATION: 'xs:duration', IFCTIME: 'xs:time', IFCBOOLEAN: 'xs:boolean',
    IFCINTEGER: 'xs:integer', IFCPOSITIVEINTEGER: 'xs:integer', IFCCOUNTMEASURE: 'xs:integer', IFCINTEGERCOUNTRATEMEASURE: 'xs:integer',
    IFCREAL: 'xs:double',
    IFCLABEL: 'xs:string', IFCTEXT: 'xs:string', IFCIDENTIFIER: 'xs:string', IFCLOGICAL: 'xs:string',
    IFCURIREFERENCE: 'xs:string', IFCGLOBALLYUNIQUEID: 'xs:string',
  };
  if (exact[dt]) return exact[dt];
  if (/MEASURE$/.test(dt)) return 'xs:double';
  if (/ENUM$/.test(dt)) return 'xs:string';
  return null;
}
