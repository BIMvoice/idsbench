/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Rules beyond the XSD. Logic ported from the buildingSMART IDS-Audit-tool (MIT, C#); see README for the
// rule-by-rule table. Every rule has a stable code. A facet that fails its own checks is "invalid" and
// takes no part in the cross-facet type-coherence rule (as in the tool).
import type { Finding } from './types.ts';
import { Matcher, compilePattern } from './matcher.ts';
import { Reporter, describeProblem, hint, problemCode } from './report.ts';
import { DATA_TYPE_BACKING, loadSchema, type IfcVersion, type SchemaData } from './ifc.ts';
import { child, walk, type XNode } from './xml.ts';
import { ALLOWED_FACETS, isKnownBase, isValidLexical, normaliseBase } from './xstypes.ts';

const FACETS = ['entity', 'attribute', 'property', 'classification', 'material', 'partOf'];

interface FacetResult {
  valid: boolean;
  required: boolean;
  /** Upper-case class names the facet restricts the subject to, per IFC version; undefined = unconstrained. */
  types?: Map<IfcVersion, string[]>;
}

export async function runRules(root: XNode): Promise<Finding[]> {
  const rep = new Reporter();
  // restrictions and patterns are checked wherever they appear
  walk(root, (n) => {
    if (n.name === 'restriction') auditRestriction(n, rep);
    if (n.name === 'pattern' && !compilePattern(n.attrs['value'] ?? '')) {
      rep.error(n, 'pattern-invalid', `The pattern '${n.attrs['value'] ?? ''}' is not a valid regular expression.`);
    }
  });
  const specs = child(root, 'specifications')?.children.filter((c) => c.name === 'specification') ?? [];
  for (const spec of specs) {
    try {
      await auditSpecification(spec, rep);
    } catch (e) {
      // A broken document structure (reported by the schema layer) must not hide the other findings.
      void e;
    }
  }
  return rep.findings;
}

function auditRestriction(n: XNode, rep: Reporter): void {
  const base = n.attrs['base'] ?? '';
  if (n.children.length === 0) {
    rep.error(n, 'restriction-empty', 'This restriction has no conditions (no enumeration, pattern or bounds), so it cannot match anything.');
  }
  if (base === '') {
    rep.error(n, 'restriction-base-invalid', 'This restriction has no base type; add base="xs:string" or another XML Schema type such as xs:integer.');
  } else if (!isKnownBase(base)) {
    rep.error(n, 'restriction-base-invalid', `The restriction base type '${base}' is not allowed; use one of ${Object.keys(ALLOWED_FACETS).join(', ')}.`);
  } else {
    const allowed = ALLOWED_FACETS[normaliseBase(base)];
    for (const c of n.children) {
      if (!allowed.includes(c.name)) {
        rep.error(c, 'restriction-facet-invalid', `A '${c.name}' condition cannot be used in a restriction with base ${base}; allowed conditions are ${allowed.join(', ')}.`);
      }
    }
  }
}

function parseVersions(attr: string, node: XNode, rep: Reporter): IfcVersion[] {
  const out = new Set<IfcVersion>();
  let bad = false;
  for (const tok of attr.split(' ').filter(Boolean)) {
    if (tok === 'IFC2X3') out.add('IFC2X3');
    else if (tok === 'IFC4') out.add('IFC4');
    else if (tok === 'IFC4X3' || tok === 'IFC4X3_ADD2') out.add('IFC4X3_ADD2');
    else {
      bad = true;
      rep.error(node, 'ifc-version-invalid', `The IFC version '${tok}' is not known; use IFC2X3, IFC4 or IFC4X3_ADD2.`);
    }
  }
  if (out.size === 0 && !bad) {
    rep.error(node, 'ifc-version-invalid', 'The specification names no IFC version; set ifcVersion to IFC2X3, IFC4 or IFC4X3_ADD2 (separated by spaces).');
  }
  return [...out];
}

class SpecCtx {
  results = new Map<XNode, FacetResult>();
  constructor(public schemas: SchemaData[], public rep: Reporter) {}
}

async function auditSpecification(spec: XNode, rep: Reporter): Promise<void> {
  const versions = parseVersions(spec.attrs['ifcVersion'] ?? '', spec, rep);
  const schemas = await Promise.all(versions.map((v) => loadSchema(v)));
  const ctx = new SpecCtx(schemas, rep);
  const applic = child(spec, 'applicability');
  const reqs = child(spec, 'requirements');

  for (const coll of [applic, reqs]) {
    if (!coll) continue;
    for (const f of coll.children) {
      if (FACETS.includes(f.name)) auditFacet(f, ctx);
    }
  }

  // cardinality of requirement facets (applicability facets carry no cardinality of their own)
  if (reqs) for (const f of reqs.children) if (FACETS.includes(f.name)) auditFacetCardinality(f, ctx);

  let applicCard: { required: boolean; prohibited: boolean } | undefined;
  if (applic) {
    applicCard = auditApplicabilityCardinality(applic, rep);
  }

  if (!applic) {
    rep.error(spec, 'applicability-missing', 'This specification has no applicability; say which elements it applies to.');
    return;
  }
  if (!applic.children.some((c) => FACETS.includes(c.name))) {
    rep.error(applic, 'applicability-empty', 'The applicability has no conditions; add at least one (for example an entity) to say which elements it applies to.');
    return;
  }

  // type coherence inside each facet collection
  for (const coll of [applic, reqs]) {
    if (!coll) continue;
    const facets = coll.children.filter((c) => FACETS.includes(c.name));
    if (facets.some((f) => !(ctx.results.get(f)?.valid ?? true))) continue;
    for (const s of schemas) {
      const t = collectionTypes(coll, ctx, s.version);
      if (t && t.length === 0) {
        rep.perSchema(coll, 'conditions-impossible', 'set', s.label, (l) => `The conditions in this ${coll.name} can never be met together for ${l}: no IFC class satisfies all of them.`);
      }
    }
  }

  const reqFacets = reqs?.children.filter((c) => FACETS.includes(c.name)) ?? [];
  if (applicCard?.prohibited) {
    if (reqFacets.length > 0) {
      rep.error(spec, 'requirements-not-allowed', 'A specification whose applicability is prohibited (maxOccurs="0") cannot have requirements; remove them or change the applicability.');
    }
  } else if (applicCard && !applicCard.required) {
    if (reqFacets.length === 0) {
      rep.error(spec, 'requirements-needed', 'A specification whose applicability is optional (minOccurs="0") needs requirements; add some or make the applicability required.');
    }
  }

  if (reqs) {
    for (const s of schemas) {
      const a = collectionTypes(applic, ctx, s.version);
      const r = collectionTypes(reqs, ctx, s.version);
      if (a && r && a.length > 0 && r.length > 0) {
        const set = new Set(r);
        if (!a.some((x) => set.has(x))) {
          const desc = (l: string[]) => (l.length > 5 ? `${l.length} classes` : l.join(', '));
          rep.perSchema(spec, 'applicability-requirements-incompatible', `${desc(a)}|${desc(r)}`, s.label, (l) =>
            `The applicability (${desc(a)}) and the requirements (${desc(r)}) can never describe the same element in ${l}; check the classes they name.`);
        }
      }
    }
  }
}

function auditApplicabilityCardinality(applic: XNode, rep: Reporter): { required: boolean; prohibited: boolean } {
  const min = applic.attrs['minOccurs'] ?? '1';
  const max = applic.attrs['maxOccurs'] ?? '1';
  const required = min === '1';
  const prohibited = max === '0';
  let err: string | undefined;
  const isUint = (s: string) => /^\d+$/.test(s);
  if (max !== 'unbounded' && !isUint(max)) err = `maxOccurs '${max}' is not a number or 'unbounded'`;
  else if (!isUint(min)) err = `minOccurs '${min}' is not a number`;
  else {
    const maxN = max === 'unbounded' ? Infinity : parseInt(max, 10);
    const minN = parseInt(min, 10);
    if (maxN < minN) err = `minOccurs ${min} is larger than maxOccurs ${max}`;
    else if (minN > 1 || (maxN !== 0 && maxN !== Infinity)) err = `minOccurs="${min}" maxOccurs="${max}" is not one of the combinations IDS allows`;
  }
  if (err) {
    rep.error(applic, 'cardinality-invalid', `The applicability occurrence is invalid: ${err}. Use minOccurs="1" maxOccurs="unbounded" (required), minOccurs="0" maxOccurs="unbounded" (optional) or minOccurs="0" maxOccurs="0" (prohibited).`);
  }
  return { required, prohibited };
}

function facetRequired(f: XNode): boolean {
  if (f.name === 'entity') return true;
  return (f.attrs['cardinality'] ?? 'required') === 'required';
}

function collectionTypes(coll: XNode, ctx: SpecCtx, v: IfcVersion): string[] | null {
  let acc: string[] | null = null;
  for (const f of coll.children) {
    if (!FACETS.includes(f.name)) continue;
    const r = ctx.results.get(f);
    if (!r || !r.required) continue;
    const t = r.types?.get(v);
    if (!t) continue;
    if (acc === null) acc = t.slice();
    else {
      const set = new Set(t);
      acc = acc.filter((x) => set.has(x));
    }
    if (acc.length === 0) break;
  }
  return acc;
}

// ---------------------------------------------------------------- facets

function auditFacet(f: XNode, ctx: SpecCtx): void {
  const r: FacetResult = { valid: true, required: facetRequired(f) };
  ctx.results.set(f, r);
  switch (f.name) {
    case 'entity': return auditEntity(f, ctx, r);
    case 'attribute': return auditAttribute(f, ctx, r);
    case 'property': return auditProperty(f, ctx, r);
    case 'classification': return auditClassification(f, ctx, r);
    case 'partOf': {
      // the entity inside a partOf is audited like any other entity facet, and first
      const inner = child(f, 'entity');
      if (inner) auditFacet(inner, ctx);
      return auditPartOf(f, ctx, r);
    }
    case 'material':
      if (r.required) r.types = new Map(ctx.schemas.map((s) => [s.version, relAssignClasses(s)]));
      return;
  }
}

function missing(f: XNode, ctx: SpecCtx, what: string): void {
  ctx.rep.error(f, 'value-missing', `The ${f.name} facet needs a ${what} given as a simple value or a restriction; none was found.`);
}

function auditEntity(f: XNode, ctx: SpecCtx, r: FacetResult): void {
  r.valid = false;
  const nameNode = child(f, 'name');
  const nameM = Matcher.of(nameNode);
  if (!nameM) return missing(f, ctx, 'name');
  const predNode = child(f, 'predefinedType');
  const predM = predNode ? Matcher.of(predNode) : undefined;
  if (predNode && !predM) return missing(f, ctx, 'predefinedType');
  r.valid = true;
  let failed = false;
  const types = new Map<IfcVersion, string[]>();

  if (nameM.restriction) {
    const all = [...new Set(ctx.schemas.flatMap((s) => [...s.classes.keys()]))];
    for (const p of nameM.eachEnumerationMatches(all)) {
      failed = true;
      ctx.rep.error(nameNode!, 'entity-unknown-class', describeProblem('entity name', p, ctx.schemas.map((s) => s.label).join(' or ')));
    }
  }
  for (const s of ctx.schemas) {
    if (failed) continue; // the tool stops at the first schema that has a problem
    const names = [...s.classes.keys()];
    const res = nameM.mustMatch(names);
    for (const p of res.problems) {
      failed = true;
      ctx.rep.perSchema(nameNode!, problemCode(p, 'entity-unknown-class'), `${p.kind}:${JSON.stringify(p).slice(0, 80)}`, s.label, (l) => describeProblem('entity name', p, l));
    }
    if (failed) continue;
    types.set(s.version, res.matches);
    if (!predM || predM.isNullOrEmpty()) continue;
    let possible: string[] | undefined;
    for (const cls of res.matches) {
      const c = s.classes.get(cls)!;
      possible = possible === undefined ? [...c.predefinedTypes] : possible.filter((x) => c.predefinedTypes.includes(x));
    }
    if (possible === undefined) {
      continue;
    } else if (possible.includes('USERDEFINED')) {
      continue;
    } else {
      const pr = predM.mustMatch(possible);
      for (const p of pr.problems) {
        failed = true;
        ctx.rep.perSchema(predNode!, problemCode(p, 'entity-unknown-predefined-type'), `${p.kind}:${JSON.stringify(p).slice(0, 80)}`, s.label, (l) =>
          describeProblem('predefined type', p, `${l} for ${res.matches.length === 1 ? s.classes.get(res.matches[0])!.name : 'the named classes'}`));
      }
      if (predM.restriction) {
        for (const p of predM.eachEnumerationMatches(possible)) {
          failed = true;
          ctx.rep.perSchema(predNode!, 'entity-unknown-predefined-type', `enum:${JSON.stringify(p).slice(0, 80)}`, s.label, (l) => describeProblem('predefined type', p, l));
        }
      }
    }
  }
  if (failed) r.valid = false;
  else r.types = types;
}

function auditAttribute(f: XNode, ctx: SpecCtx, r: FacetResult): void {
  r.valid = false;
  const nameNode = child(f, 'name');
  const nameM = Matcher.of(nameNode);
  if (!nameM) return missing(f, ctx, 'name');
  const valueNode = child(f, 'value');
  r.valid = true;
  let failed = false;
  const types = new Map<IfcVersion, string[]>();
  for (const s of ctx.schemas) {
    // without a value any attribute of the version is fine; with a value it must be one the tool can value-check
    const valid = valueNode ? [...s.attributes.keys()] : s.allAttributeNames;
    const res = nameM.mustMatch(valid);
    if (res.problems.length) {
      failed = true;
      for (const p of res.problems) {
        ctx.rep.perSchema(nameNode!, problemCode(p, 'attribute-unknown'), `${p.kind}:${JSON.stringify(p).slice(0, 80)}`, s.label, (l) => describeProblem('attribute name', p, l));
      }
      continue;
    }
    if (valueNode) {
      const possibleTypes = [...new Set(res.matches.flatMap((n) => s.attributes.get(n)?.xsdTypes ?? []))];
      const valueM = Matcher.of(valueNode);
      const hasRestriction = !!valueM?.restriction;
      const base = valueM?.base ?? '';
      if (possibleTypes.length === 0) {
        failed = true;
        ctx.rep.perSchema(valueNode, 'attribute-value-type-mismatch', 'none', s.label, (l) => `The attribute ${quoteList(res.matches)} does not hold a plain value in ${l}, so a value cannot be required for it.`);
      } else if (possibleTypes.length === 1) {
        const expected = possibleTypes[0];
        if (hasRestriction && !possibleTypes.includes(base)) {
          failed = true;
          ctx.rep.perSchema(valueNode, 'attribute-value-type-mismatch', `${base}|${expected}`, s.label, (l) =>
            base === ''
              ? `The value restriction has no base type, but ${quoteList(res.matches)} needs ${expected} in ${l}.`
              : `The value restriction uses base type ${base}, but ${quoteList(res.matches)} needs ${expected} in ${l}.`);
        }
        if (valueM) {
          for (const d of valueM.discreteValues()) {
            if (!isValidLexical(d, expected)) {
              failed = true;
              ctx.rep.perSchema(valueNode, 'value-invalid-for-type', `${d}|${expected}`, s.label, () => `The value '${d}' is not a valid ${expected} value.`);
            }
          }
        }
      } else if (hasRestriction && !possibleTypes.includes(base)) {
        failed = true;
        ctx.rep.perSchema(valueNode, 'attribute-value-type-mismatch', `${base}|${possibleTypes.join(',')}`, s.label, (l) =>
          `The value restriction uses base type ${base || '(none)'}, but ${quoteList(res.matches)} needs one of ${possibleTypes.join(', ')} in ${l}.`);
      }
    }
    const classes = new Set<string>();
    for (const n of res.matches) for (const c of s.attributes.get(n)?.classes ?? []) classes.add(c);
    types.set(s.version, [...classes]);
  }
  if (failed) r.valid = false;
  else r.types = types;
}

function quoteList(l: string[]): string {
  return l.length === 1 ? `'${l[0]}'` : `'${l.slice(0, 3).join("', '")}${l.length > 3 ? "', ..." : "'"}`;
}

function auditClassification(f: XNode, ctx: SpecCtx, r: FacetResult): void {
  const system = Matcher.of(child(f, 'system'));
  if (!system || system.isNullOrEmpty()) {
    ctx.rep.error(f, 'classification-system-empty', 'The classification facet needs a classification system (for example "Uniclass 2015"); it is empty.');
    r.valid = true; // the tool does not mark the facet invalid for this
  }
  if (r.required) {
    r.types = new Map(ctx.schemas.map((s) => [s.version, classificationClasses(s)]));
  }
}

const IFC4_CLASSIFICATION_ROOTS = ['IFCOBJECTDEFINITION', 'IFCPROPERTYDEFINITION', 'IFCPROPERTYABSTRACTION', 'IFCPHYSICALQUANTITY', 'IFCAPPLIEDVALUE', 'IFCCONTEXTDEPENDENTUNIT', 'IFCCONVERSIONBASEDUNIT', 'IFCPROFILEDEF', 'IFCACTORROLE', 'IFCAPPROVAL', 'IFCCONSTRAINT', 'IFCTIMESERIES', 'IFCMATERIALDEFINITION', 'IFCPERSON', 'IFCPERSONANDORGANIZATION', 'IFCORGANIZATION', 'IFCEXTERNALREFERENCE', 'IFCEXTERNALINFORMATION', 'IFCSHAPEASPECT'];
const IFC4X3_CLASSIFICATION_ROOTS = ['IFCOBJECTDEFINITION', 'IFCPROPERTYDEFINITION', 'IFCACTORROLE', 'IFCAPPLIEDVALUE', 'IFCAPPROVAL', 'IFCCONSTRAINT', 'IFCCONTEXTDEPENDENTUNIT', 'IFCCONVERSIONBASEDUNIT', 'IFCEXTERNALINFORMATION', 'IFCEXTERNALREFERENCE', 'IFCMATERIALDEFINITION', 'IFCORGANIZATION', 'IFCPERSON', 'IFCPERSONANDORGANIZATION', 'IFCPHYSICALQUANTITY', 'IFCPROFILEDEF', 'IFCPROPERTYABSTRACTION', 'IFCSHAPEASPECT', 'IFCTIMESERIES'];

function classificationClasses(s: SchemaData): string[] {
  const roots = s.version === 'IFC2X3' ? ['IFCROOT'] : s.version === 'IFC4' ? IFC4_CLASSIFICATION_ROOTS : IFC4X3_CLASSIFICATION_ROOTS;
  return [...new Set(roots.flatMap((u) => s.concrete(u)))];
}

function relAssignClasses(s: SchemaData): string[] {
  const roots = s.version === 'IFC2X3' ? ['IFCROOT'] : ['IFCOBJECTDEFINITION', 'IFCPROPERTYDEFINITION'];
  return [...new Set(roots.flatMap((u) => s.concrete(u)))];
}

function auditFacetCardinality(f: XNode, ctx: SpecCtx): void {
  const r = ctx.results.get(f);
  const card = f.attrs['cardinality'] ?? (f.name === 'entity' ? undefined : 'required');
  if (card === undefined) return;
  const allowed = f.name === 'partOf' ? ['required', 'prohibited'] : ['required', 'prohibited', 'optional'];
  if (!allowed.includes(card)) {
    ctx.rep.error(f, 'cardinality-invalid', `The cardinality '${card}' on this ${f.name} is not valid; use ${allowed.join(', ')}.`);
    if (r && f.name !== 'property' && f.name !== 'partOf') r.valid = false;
    return;
  }
  if (card === 'optional') {
    if (f.name === 'property') {
      if (!f.attrs['dataType']) {
        ctx.rep.error(f, 'cardinality-needs-value', 'An optional property needs a dataType, otherwise there is nothing to check; add dataType or make the property required.');
        if (r) r.valid = false;
      }
    } else if (f.name === 'attribute' || f.name === 'classification' || f.name === 'material') {
      const v = Matcher.of(child(f, 'value'));
      if (!v || v.isNullOrEmpty()) {
        ctx.rep.error(f, 'cardinality-needs-value', `An optional ${f.name} needs a value to check; add a value or make the ${f.name} required.`);
        if (r) r.valid = false;
      }
    }
  } else if (card === 'prohibited' && f.name === 'property' && f.attrs['dataType']) {
    ctx.rep.error(f, 'cardinality-conflicts-datatype', 'A prohibited property cannot have a dataType; remove the dataType or make the property required.');
    if (r) r.valid = false;
  }
}

function auditPartOf(f: XNode, ctx: SpecCtx, r: FacetResult): void {
  r.valid = false;
  if (!r.required) {
    r.valid = true;
    return;
  }
  const rel = f.attrs['relation'] ?? '';
  let failed = false;
  const types = new Map<IfcVersion, string[]>();
  for (const s of ctx.schemas) {
    if (!rel) continue;
    const names = s.partOf.map((p) => p.relation);
    if (!names.includes(rel)) {
      failed = true;
      ctx.rep.perSchema(f, 'partof-relation-invalid', rel, s.label, (l) => `The relation '${rel}' is not valid for partOf in ${l}. ${hint(rel, names)}`);
      continue;
    }
    const info = s.partOf.find((p) => p.relation === rel)!;
    types.set(s.version, s.concrete(info.part));
    const entity = child(f, 'entity');
    if (!entity) {
      failed = true;
      ctx.rep.error(f, 'value-empty', 'The partOf facet needs an entity saying what the element is part of; none was found.');
      continue;
    }
    const entityTypes = ctx.results.get(entity)?.types?.get(s.version);
    if (entityTypes) {
      // the entity must be (or contain) a descendant of the relation's owner class
      const owner = new Set(s.concrete(info.owner));
      if (!entityTypes.some((t) => owner.has(t))) {
        failed = true;
        const list = entityTypes.length > 5 ? `${entityTypes.length} classes, e.g. ${entityTypes.slice(0, 5).join(', ')}` : entityTypes.join(', ');
        ctx.rep.perSchema(f, 'partof-entity-incompatible', `${rel}|${list}`, s.label, (l) =>
          `In ${l}, ${rel} needs the whole to be a ${info.owner}, but the entity names ${list}; use a class that descends from ${info.owner}.`);
      }
    }
  }
  if (failed) {
    r.valid = false;
    r.types = undefined;
  } else {
    r.valid = true;
    if (types.size) r.types = types;
  }
}

/** Classes a standard property set can be attached to, including the type classes of those occurrences. */
function psetClasses(s: SchemaData, psetNames: string[]): string[] {
  const out = new Set<string>();
  for (const name of psetNames) {
    const ps = s.psetByName.get(name);
    if (!ps) continue;
    const base = new Set<string>();
    for (const a of ps.applicable) for (const c of s.concrete(a.toUpperCase())) base.add(c);
    // `Classes.TryGetValue(className)` in the tool is case-sensitive; class names are stored in their IFC spelling
    for (const c of base) {
      out.add(c);
      const types = s.classes.get(c)?.typeClasses ?? [];
      for (const t of types) {
        out.add(t);
        for (const ch of s.children.get(t) ?? []) out.add(ch);
      }
    }
  }
  return [...out];
}

function auditProperty(f: XNode, ctx: SpecCtx, r: FacetResult): void {
  r.valid = false;
  const psetNode = child(f, 'propertySet');
  const psetM = Matcher.of(psetNode);
  if (!psetM) return missing(f, ctx, 'propertySet');
  const nameNode = child(f, 'baseName');
  const nameM = Matcher.of(nameNode);
  if (!nameM) return missing(f, ctx, 'baseName');
  const valueNode = child(f, 'value');
  const valueM = Matcher.of(valueNode);
  const dataType = f.attrs['dataType'] ?? '';
  if (!dataType && valueM && !valueM.isNullOrEmpty()) {
    ctx.rep.error(f, 'value-needs-datatype', 'A property with a value must also state its dataType (for example IFCLABEL); add the dataType attribute.');
    return;
  }
  let failed = false;
  const types = new Map<IfcVersion, string[]>();
  for (const s of ctx.schemas) {
    r.valid = true;
    let validMeasures: string[] | undefined;
    if (r.required) {
      const matchingPsets = psetM.tryMatch(s.psets.map((p) => p.name));
      if (matchingPsets.length) {
        const propNames = [...new Set(matchingPsets.flatMap((p) => s.psetByName.get(p)!.props.map((q) => q.name)))];
        const res = nameM.mustMatch(propNames);
        if (res.problems.length) {
          for (const p of res.problems) {
            ctx.rep.perSchema(nameNode!, problemCode(p, 'property-unknown-in-standard-set'), `${p.kind}:${JSON.stringify(p).slice(0, 80)}`, s.label, (l) =>
              describeProblem(`property name in ${quoteList([...new Set(matchingPsets)])}`, p, l));
          }
          r.valid = false;
          return;
        }
        // every entry of a matching set, repeats included, as the tool does
        const props = s.psets.filter((p) => matchingPsets.includes(p.name)).flatMap((p) => p.props.filter((q) => res.matches.includes(q.name)));
        if (valueM) {
          const anyOpen = props.some((q) => q.kind !== 'e');
          if (!anyOpen) {
            const options = [...new Set(props.flatMap((q) => q.enumeration ?? []))];
            const vr = valueM.mustMatch(options);
            for (const p of vr.problems) {
              failed = true;
              ctx.rep.perSchema(valueNode!, problemCode(p, 'property-value-not-allowed'), `${p.kind}:${JSON.stringify(p).slice(0, 80)}`, s.label, (l) => describeProblem('value', p, l));
            }
          }
        }
        validMeasures = [...new Set(props.flatMap((q) => q.dataTypes))];
        types.set(s.version, psetClasses(s, [...new Set(matchingPsets)]));
      } else if (psetM.startsWith('Pset_')) {
        ctx.rep.error(psetNode!, 'property-reserved-prefix', `Property set names starting with 'Pset_' are reserved for the IFC standard; this custom set needs a different name${psetM.simple ? ` (you wrote '${psetM.simple}')` : ''}.`);
        r.valid = false;
        return;
      }
    }
    if (dataType) {
      const all = validMeasures ?? s.dataTypeNames;
      if (!all.includes(dataType)) {
        failed = true;
        ctx.rep.perSchema(f, 'property-datatype-invalid', `${dataType}|${validMeasures ? 'std' : 'all'}`, s.label, (l) =>
          `The data type '${dataType}' is not valid ${validMeasures ? 'for this standard property' : 'as an IFC data type'} in ${l}. ${hint(dataType, all)}`);
      } else {
        const backing = DATA_TYPE_BACKING.get(dataType);
        if (backing && valueNode && valueM) {
          if (valueM.restriction && normaliseBase(valueM.base) !== backing) {
            failed = true;
            const b = valueM.base;
            ctx.rep.perSchema(valueNode, 'property-value-type-mismatch', `${b}|${backing}`, s.label, (l) =>
              b === ''
                ? `The value restriction has no base type, but ${dataType} needs ${backing} in ${l}.`
                : `The value restriction uses base type ${b}, but ${dataType} needs ${backing} in ${l}.`);
          }
          for (const d of valueM.discreteValues()) {
            if (!isValidLexical(d, backing)) {
              failed = true;
              ctx.rep.perSchema(valueNode, 'value-invalid-for-type', `${d}|${backing}`, s.label, () => `The value '${d}' is not a valid ${backing} value, which is what ${dataType} needs.`);
            }
          }
        }
      }
    }
    if (failed) r.valid = false;
  }
  if (!ctx.schemas.length) r.valid = false;
  if (r.valid && r.required && types.size) r.types = types;
}

