// Pick-lists for the names the IFC standard defines, built from the tables the Check engine ships (one per IFC
// version, loaded when first needed). The value of an option is the form that goes into the IDS file.
import type { SchemaData } from '@idsbench/check/ifc';

export interface Option { value: string; label: string }

/** "IfcWallStandardCase" reads "Wall standard case"; "Pset_WallCommon" reads "Wall common"; "FireRating" reads "Fire rating". */
export function plainName(technical: string): string {
  const core = technical.replace(/^Ifc(?=[A-Z0-9])/, '').replace(/^[A-Za-z]{1,5}set_/, '').replace(/^Qto_/, '');
  const words = core.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim().split(/\s+/);
  const text = words.map((w, i) => (/^[A-Z0-9]+$/.test(w) && w.length > 1 ? w : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w.toLowerCase())).join(' ');
  return text || technical;
}

const withPlain = (technical: string, value: string): Option => {
  const plain = plainName(technical);
  return { value, label: plain === technical ? technical : `${plain} (${technical})` };
};
const byLabel = (a: Option, b: Option) => a.label.localeCompare(b.label, 'en');

/** Things that are in a model or describe them: the concrete classes under IfcObjectDefinition. Written in capitals. */
export function classOptions(s: SchemaData): Option[] {
  return [...s.classes.values()]
    .filter((c) => c.kind === 'concrete' && s.isA(c.upper, 'IFCOBJECTDEFINITION'))
    .map((c) => withPlain(c.name, c.upper))
    .sort(byLabel);
}

/** The predefined types of one class, as the standard writes them. */
export function predefinedTypeOptions(s: SchemaData, classUpper: string): Option[] {
  return (s.classes.get(classUpper.toUpperCase())?.predefinedTypes ?? []).map((t) => ({ value: t, label: t }));
}

/** The standard property sets, narrowed to those that apply to a class when one is given and known. */
export function psetOptions(s: SchemaData, classUpper?: string): Option[] {
  const cls = classUpper && s.classes.has(classUpper.toUpperCase()) ? classUpper.toUpperCase() : null;
  const seen = new Set<string>();
  const out: Option[] = [];
  for (const p of s.psets) {
    if (seen.has(p.name)) continue;
    if (cls && !s.psets.some((q) => q.name === p.name && q.applicable.some((a) => s.isA(cls, a.toUpperCase())))) continue;
    seen.add(p.name);
    out.push(withPlain(p.name, p.name));
  }
  return out.sort(byLabel);
}

/** The properties of a standard property set; empty for a set the standard does not define. */
export function propertyOptions(s: SchemaData, psetName: string): Option[] {
  const seen = new Set<string>();
  return s.psets.filter((p) => p.name === psetName).flatMap((p) => p.props)
    .filter((p) => !seen.has(p.name) && seen.add(p.name))
    .map((p) => withPlain(p.name, p.name));
}

/** The data type the standard gives a property of a standard set, in capitals, or null. */
export function dataTypeFor(s: SchemaData, psetName: string, propName: string): string | null {
  return s.psets.filter((p) => p.name === psetName).flatMap((p) => p.props).find((p) => p.name === propName)?.dataTypes[0] ?? null;
}

export function dataTypeOptions(s: SchemaData): Option[] {
  return s.dataTypeNames.map((n) => withPlain(n, n.toUpperCase())).sort(byLabel);
}

/** Type-ahead: options whose plain or technical name holds the text, those that start with it first. */
export function filterOptions(options: Option[], query: string, limit = 50): Option[] {
  const q = query.trim().toLowerCase();
  if (q === '') return options.slice(0, limit);
  const rank = (o: Option) => {
    const l = o.label.toLowerCase(), v = o.value.toLowerCase();
    if (l === q || v === q) return 0;
    if (l.startsWith(q) || v.startsWith(q) || v.startsWith(`ifc${q}`)) return 1;
    if (l.split(/[\s(_]+/).some((w) => w.startsWith(q))) return 2;
    return l.includes(q) || v.includes(q) ? 3 : -1;
  };
  return options.map((o, i) => ({ o, r: rank(o), i })).filter((x) => x.r >= 0).sort((a, b) => a.r - b.r || a.i - b.i).slice(0, limit).map((x) => x.o);
}

/** The option a typed text names exactly (by plain label, full label or technical name, any letter case), or null. */
export function exactOption(options: Option[], text: string): Option | null {
  const q = text.trim().toLowerCase();
  if (q === '') return null;
  return options.find((o) => o.value.toLowerCase() === q || o.label.toLowerCase() === q || o.label.toLowerCase().startsWith(`${q} (`)) ?? null;
}

/** The pick-lists of one specification. */
export interface Lists {
  classes: Option[];
  predefinedTypes: (classUpper: string) => Option[];
  /** Attribute names; narrowed to those the class has when a class is given and known. */
  attributes: (classUpper?: string) => Option[];
  propertySets: (classUpper?: string) => Option[];
  properties: (psetName: string) => Option[];
  dataTypeFor: (psetName: string, propName: string) => string | null;
  dataTypes: Option[];
}

const attributeOption = (n: string): Option => ({ value: n, label: plainName(n) === n ? n : `${plainName(n)} (${n})` });

/** The attribute names a class has; every attribute name of the version when no class is given or the class is not known. */
export function attributeOptions(s: SchemaData, classUpper?: string): Option[] {
  const cls = classUpper && s.classes.has(classUpper.toUpperCase()) ? classUpper.toUpperCase() : null;
  const names = cls ? s.allAttributeNames.filter((n) => s.attributes.get(n)?.classes.includes(cls)) : s.allAttributeNames;
  return names.map(attributeOption);
}

function listsOfOne(s: SchemaData): Lists {
  return {
    classes: classOptions(s),
    predefinedTypes: (c) => predefinedTypeOptions(s, c),
    attributes: (c) => attributeOptions(s, c),
    propertySets: (c) => psetOptions(s, c),
    properties: (p) => propertyOptions(s, p),
    dataTypeFor: (p, n) => dataTypeFor(s, p, n),
    dataTypes: dataTypeOptions(s),
  };
}

/** How the lists were made before they followed every ticked version and the class: from the first version alone, with every attribute name. Kept for scripts/picklists.ts, which measures the difference. */
export function listsOfFirstVersion(s: SchemaData): Lists {
  return { ...listsOfOne(s), attributes: () => s.allAttributeNames.map(attributeOption) };
}

/**
 * The pick-lists for a specification that ticks these IFC versions (their tables, in the order ticked): what every one
 * of them defines. The engine checks a specification against each version it lists, so a name only some of them have
 * would be offered here and then rejected there.
 */
export function listsFor(schemas: SchemaData[]): Lists {
  const each = schemas.map(listsOfOne);
  if (each.length === 1) return each[0];
  const [first, ...rest] = each;
  const inAll = (own: Option[], others: Option[][]) => {
    const sets = others.map((o) => new Set(o.map((x) => x.value)));
    return own.filter((o) => sets.every((set) => set.has(o.value)));
  };
  return {
    classes: inAll(first.classes, rest.map((l) => l.classes)),
    predefinedTypes: (c) => inAll(first.predefinedTypes(c), rest.map((l) => l.predefinedTypes(c))),
    attributes: (c) => inAll(first.attributes(c), rest.map((l) => l.attributes(c))),
    propertySets: (c) => inAll(first.propertySets(c), rest.map((l) => l.propertySets(c))),
    properties: (p) => inAll(first.properties(p), rest.map((l) => l.properties(p))),
    // A data type is filled in only when every version gives the property the same one.
    dataTypeFor: (p, n) => { const t = first.dataTypeFor(p, n); return t !== null && rest.every((l) => l.dataTypeFor(p, n) === t) ? t : null; },
    dataTypes: inAll(first.dataTypes, rest.map((l) => l.dataTypes)),
  };
}
