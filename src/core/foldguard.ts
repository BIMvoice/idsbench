/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// A known defect of the run library, @ifc-lite/ids 3.2.0 on @ifc-lite/parser 9.2.0 (their issue 7402, fixed in their pull
// request 7412 and released after 3.2.0). The entity facet reads the class of an element from a table in which ten
// classes are folded onto a parent: the library says "IfcDoor" of an IfcDoorStandardCase. IDS matches the exact class
// ("There is no automatic inheritance in IDS entity facet interpretation"). The library finds the candidates of a
// facet that names a class by the class the file declares and then confirms each with the folded class, so a facet in the
// applicability that names only the subtype applies to nothing; a facet that is compared with the folded class without
// that look-up (a pattern, an entity facet among the requirements, a partOf facet) is met by the subtype when it names
// only the parent.
//
// What this file does about it, for a model that holds an element of one of the ten classes (the class is read from the
// parser's entity index, which keeps the class of the STEP line as written; the same class is what the parser's entity
// table answers to getExactTypeName, see tests/exact-class-guard.test.ts):
//  - A specification whose entity facet names the class or its parent in a way the fold changes, and which is a plain
//    case (the entity facet is in the applicability, a name, a list of names or a pattern that is safe to work out, no
//    predefined type), is run with the class the file declares. The answers of that run were compared with IfcTester
//    over the same models, element by element (scripts/fold-vs-ifctester): identical, in every one of the pairs,
//    patterns included.
//  - Any other specification the fold changes (a pattern in a requirement or one that could take long, a predefined
//    type, an entity facet among the requirements, a partOf facet, a name an IFC2X3 occurrence/type mapping answers
//    for) is not run, and its row is "Not checked"
//    with the sentence below. It is never shown as Pass or Fail.
//  - The library also names the attributes of an element after the folded class. One attribute is lost by that:
//    ControlElementId of an IFC2X3 IfcDistributionControlElement. A specification with an attribute facet that name
//    answers to is not run either, in an IFC2X3 model that holds the class.
// A model without one of the ten classes, and a specification whose outcome the fold does not change (it names the
// subtype and the parent both, or neither), are left exactly as they were. The whole file goes when the library is
// fixed: tests/engine-version.test.ts fails once @ifc-lite/ids 3.3.0 or later is installed.
import { matchConstraint } from '@ifc-lite/ids';
import type { IDSConstraint, IDSEntityFacet, IDSFacet, IDSSpecification } from '@ifc-lite/ids';

/** The ten classes the library folds, in capitals, and the class each is read as. */
export const FOLDED_ONTO: Readonly<Record<string, string>> = {
  IFCBEAMSTANDARDCASE: 'IFCBEAM', IFCCOLUMNSTANDARDCASE: 'IFCCOLUMN', IFCDOORSTANDARDCASE: 'IFCDOOR', IFCMEMBERSTANDARDCASE: 'IFCMEMBER',
  IFCOPENINGSTANDARDCASE: 'IFCOPENINGELEMENT', IFCPLATESTANDARDCASE: 'IFCPLATE', IFCSLABSTANDARDCASE: 'IFCSLAB', IFCWINDOWSTANDARDCASE: 'IFCWINDOW',
  IFCDISTRIBUTIONCONTROLELEMENT: 'IFCDISTRIBUTIONELEMENT', IFCDISTRIBUTIONFLOWELEMENT: 'IFCDISTRIBUTIONELEMENT',
};

/** How the standard writes each of them and their parents. */
export const CLASS_NAME: Readonly<Record<string, string>> = {
  IFCBEAMSTANDARDCASE: 'IfcBeamStandardCase', IFCBEAM: 'IfcBeam', IFCCOLUMNSTANDARDCASE: 'IfcColumnStandardCase', IFCCOLUMN: 'IfcColumn',
  IFCDOORSTANDARDCASE: 'IfcDoorStandardCase', IFCDOOR: 'IfcDoor', IFCMEMBERSTANDARDCASE: 'IfcMemberStandardCase', IFCMEMBER: 'IfcMember',
  IFCOPENINGSTANDARDCASE: 'IfcOpeningStandardCase', IFCOPENINGELEMENT: 'IfcOpeningElement', IFCPLATESTANDARDCASE: 'IfcPlateStandardCase', IFCPLATE: 'IfcPlate',
  IFCSLABSTANDARDCASE: 'IfcSlabStandardCase', IFCSLAB: 'IfcSlab', IFCWINDOWSTANDARDCASE: 'IfcWindowStandardCase', IFCWINDOW: 'IfcWindow',
  IFCDISTRIBUTIONCONTROLELEMENT: 'IfcDistributionControlElement', IFCDISTRIBUTIONFLOWELEMENT: 'IfcDistributionFlowElement', IFCDISTRIBUTIONELEMENT: 'IfcDistributionElement',
};

/**
 * In an IFC2X3 model the library also lets an entity facet name the type of an occurrence (IfcSensor for an
 * IfcDistributionControlElement typed by an IfcSensorType): the rows of its mapping table whose occurrence is one of the ten.
 */
export const IFC2X3_ALIASES: Readonly<Record<string, readonly string[]>> = {
  IFCDISTRIBUTIONCONTROLELEMENT: ['IFCACTUATOR', 'IFCALARM', 'IFCCONTROLLER', 'IFCFLOWINSTRUMENT', 'IFCSENSOR'],
};

/**
 * The attributes one of the ten has and its parent has not, in an IFC2X3 model (IFC4 and IFC4X3 have none; the test over
 * the IFC tables in tests/exact-class-guard.test.ts fails if this list is not what they say). The library names the
 * attributes of an element after the class it reads, so it never finds one of these on an element that has it.
 */
export const IFC2X3_OWN_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  IFCDISTRIBUTIONCONTROLELEMENT: ['ControlElementId'],
};

/** The folded classes the model declares, in capitals. `countOf` is how many entities the file declares of exactly this class. */
export function declaredFolded(countOf: (upper: string) => number): string[] {
  return Object.keys(FOLDED_ONTO).filter((c) => countOf(c) > 0);
}

type Match = boolean | 'unknown';
// A pattern with a group that repeats, or a back-reference, is not run here (it could take long to work out); the
// library would run it against every element, but this is run once per class, and an unsafe pattern is not guessed at.
const RISKY = /\)\s*[+*{?]|\\[1-9]/;

function matches(c: IDSConstraint, cls: string): Match {
  if (c.type === 'simpleValue') return c.value === c.value.toUpperCase() && c.value.toUpperCase() === cls;
  if (c.type === 'enumeration' && !c.and) return c.values.some((v) => v.toUpperCase() === cls);
  if (c.type === 'pattern' && !c.and) {
    if (c.pattern.length > 200 || RISKY.test(c.pattern)) return 'unknown';
    // Read by the library's own matcher, with the options its entity facet gives it: the question is what the library
    // will answer for this name. A pattern is in the language of XML Schema (the whole pattern stands between the two ends,
    // so "IFCDOOR|IFCWALL" is one name or the other; \p{L}, \c and \i are its own), which a JavaScript pattern is not.
    try { return matchConstraint(c, CLASS_NAME[cls] ?? cls, { caseInsensitive: true }); } catch { return 'unknown'; }
  }
  return 'unknown';
}

export interface FoldEffect {
  /** The folded classes (in capitals) the model declares and the specification's outcome depends on. */
  classes: string[];
  /** True when the specification can be run with the class the file declares (a plain entity facet of the applicability). */
  correctable: boolean;
}

interface Place { facet: IDSEntityFacet; plain: boolean }

/** Every entity facet of a specification, with whether it is a plain one: an entity facet of the applicability. */
function entityFacets(spec: IDSSpecification): Place[] {
  const out: Place[] = [];
  const add = (f: IDSFacet, inApplicability: boolean) => {
    if (f.type === 'entity') out.push({ facet: f, plain: inApplicability && f.predefinedType === undefined });
    else if (f.type === 'partOf' && f.entity) out.push({ facet: f.entity, plain: false });
  };
  for (const f of spec.applicability.facets) add(f, true);
  for (const r of spec.requirements) add(r.facet, false);
  return out;
}

/**
 * What the fold does to this specification in a model that declares `present` (see declaredFolded). Null when it
 * changes nothing: no entity facet reads any of the present classes differently from the class beside it.
 */
export function foldEffect(spec: IDSSpecification, present: readonly string[], ifc2x3: boolean): FoldEffect | null {
  if (present.length === 0) return null;
  const places = entityFacets(spec);
  const hit = new Set<string>();
  let correctable = true;
  for (const { facet, plain } of places) {
    for (const d of present) {
      const asDeclared = matches(facet.name, d);
      const asRead = matches(facet.name, FOLDED_ONTO[d]);
      // The mapping only adds names that are met. A facet met by the class and by its parent alike is met either way.
      const alias = ifc2x3 && !(asDeclared === true && asRead === true) && (IFC2X3_ALIASES[d] ?? []).some((a) => matches(facet.name, a) !== false);
      // A constraint this file cannot work out (a pattern that could take long, a combination) is never taken for "the same".
      const unknown = asDeclared === 'unknown' || asRead === 'unknown';
      if (asDeclared === asRead && !alias && !unknown) continue;
      hit.add(d);
      // A name, a list of names or a pattern can be run with the declared class; `unknown` (below) keeps out a pattern that could take long.
      const simple = facet.name.type === 'simpleValue' || ((facet.name.type === 'enumeration' || facet.name.type === 'pattern') && !facet.name.and);
      if (!plain || !simple || unknown || alias) correctable = false;
    }
  }
  // An attribute facet, anywhere in the specification, whose name one of those attributes answers to: the library cannot
  // read the attribute of the element, with the class the file declares or without, so the specification is not run.
  if (ifc2x3) {
    const attributeNames = [...spec.applicability.facets, ...spec.requirements.map((r) => r.facet)].flatMap((f) => (f.type === 'attribute' ? [f.name] : []));
    for (const d of present) {
      const named = (IFC2X3_OWN_ATTRIBUTES[d] ?? []).some((a) => attributeNames.some((n) => {
        try { return matchConstraint(n, a, { caseInsensitive: true }); } catch { return true; }
      }));
      if (named) { hit.add(d); correctable = false; }
    }
  }
  return hit.size ? { classes: Object.keys(FOLDED_ONTO).filter((c) => hit.has(c)), correctable } : null;
}

const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/** The sentence for a specification that is not checked because of the fold: the row's note, the CSV row and the report all carry it. */
export function withheldSentence(classes: string[]): string {
  const own = classes.map((c) => CLASS_NAME[c]);
  const parents = [...new Set(classes.map((c) => CLASS_NAME[FOLDED_ONTO[c]]))];
  return `This model has ${list(own)} elements, and the engine in this version cannot tell ${classes.length === 1 ? 'that class' : 'those classes'} from ${classes.length === 1 ? 'its parent class' : parents.length === 1 ? 'their parent class' : 'their parent classes'} ${list(parents)}, so the result for this specification is withheld until a fixed engine version, which is on its way.`;
}
