/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Guard rails, not a validator: the things a form can stop as the user types without knowing the IFC tables.
// "error" means the schema or the Check engine reports it as an error and Download is switched off, so the
// writer never hands Check a file Check would reject (tests/writer-accepted-by-check.test.ts pins each rule
// against the engine). "advice" is a rule from the user manual that the engine does not report; it is shown
// but never blocks. What needs the IFC tables (is this class real, is this property in that standard set)
// is left to the Check engine, which the page runs on the exact text after every change and before Download.
import { translateXsdRegex } from '@ifc-lite/ids';
import {
  IFC_VERSIONS, allowedCardinalities, isValueGiven, specChoice,
  type Facet, type IdsDocument, type Specification, type Value,
} from './model';
import { modeOf } from './value';

export interface Issue {
  /** Where the message is shown: "info.title", "<specUid>.name", "<facetUid>.value". */
  key: string;
  /** Where it is in the document, in words, for the summary beside Download. */
  where: string;
  message: string;
  level: 'error' | 'advice';
}

const EMAIL = /^[^@]+@[^.]+\..+$/s; // the schema's pattern for <author>, anchored as XSD patterns are
const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
const NUMERIC_BASES = ['xs:double', 'xs:float', 'xs:decimal', 'xs:integer', 'xs:int', 'xs:long'];

export const isEmail = (s: string) => EMAIL.test(s);
export function isDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** Null when the text is a usable XSD regular expression, otherwise a plain reason. */
export function patternProblem(p: string): string | null {
  if (p === '') return 'Type the pattern.';
  try {
    const t = translateXsdRegex(p);
    new RegExp(t.pattern, 'u');
    if (!t.supported) return 'This pattern uses a feature that idsbench cannot check. Simplify it.';
    return null;
  } catch {
    return 'This is not a valid pattern. Check the brackets and the special characters.';
  }
}

/** What the title field says while it is empty. */
export const TITLE_SUGGESTED = 'A title is not required, but it helps people tell this IDS from others. Give it one if you can.';

/** What a required field says while it is empty. */
export const FILL_IN = 'Fill this in.';

/** Problems with one value, as [message] list. `required` means an empty simple value is not allowed. */
export function valueProblems(v: Value | null, required: boolean): string[] {
  if (v === null) return required ? [FILL_IN] : [];
  if (v.kind === 'simple') return required && v.value.trim() === '' ? [FILL_IN] : [];
  const out: string[] = [];
  if (v.facets.length === 0) return ['Say how to match: add a value, a pattern, a range or a length.'];
  switch (modeOf(v)) {
    case 'list': {
      if (v.facets.length === 0) out.push('Add at least one value to the list.');
      else if (v.facets.some((f) => f.value.trim() === '')) out.push('A value in the list is empty.');
      break;
    }
    case 'pattern': {
      const p = patternProblem(v.facets[0].value);
      if (p) out.push(p);
      break;
    }
    case 'range': {
      const numeric = v.base === null || NUMERIC_BASES.includes(v.base);
      const get = (n: string) => v.facets.find((f) => f.name === n);
      const lo = get('minInclusive') ?? get('minExclusive');
      const hi = get('maxInclusive') ?? get('maxExclusive');
      if (!lo && !hi) { out.push('Give a lowest or a highest value.'); break; }
      if ([lo, hi].some((f) => f && f.value.trim() === '')) { out.push('Fill in the number, or remove that end of the range.'); break; }
      if (numeric && [lo, hi].some((f) => f && !NUMBER.test(f.value.trim()))) { out.push('A range needs numbers, for example 2.5.'); break; }
      if (numeric && lo && hi) {
        const a = Number(lo.value), b = Number(hi.value);
        const open = lo.name === 'minExclusive' || hi.name === 'maxExclusive';
        if (a > b) out.push('The lowest value is higher than the highest value.');
        else if (a === b && open) out.push('No number fits between these two ends.');
      }
      break;
    }
    case 'length': {
      const n = (name: string) => v.facets.find((f) => f.name === name)?.value.trim();
      const vals = ['length', 'minLength', 'maxLength'].map(n);
      if (vals.every((x) => x === undefined)) { out.push('Give a length.'); break; }
      if (vals.some((x) => x !== undefined && !/^\d+$/.test(x))) { out.push('A length is a whole number, 0 or more.'); break; }
      const [ex, mn, mx] = vals.map((x) => (x === undefined ? null : Number(x)));
      if (mn !== null && mx !== null && mn > mx) out.push('The shortest length is longer than the longest.');
      if (ex !== null && ((mn !== null && ex < mn) || (mx !== null && ex > mx))) out.push('The exact length does not fit the shortest and longest.');
      break;
    }
    default:
      break; // 'other' restrictions are kept as they are; the Check engine judges them
  }
  return out;
}

export function checkDocument(doc: IdsDocument): Issue[] {
  const out: Issue[] = [];
  const add = (key: string, where: string, message: string, level: Issue['level'] = 'error') => out.push({ key, where, message, level });

  // The schema needs the <title> element, not a text in it, and the Check engine does not ask for one: suggested, never blocking.
  if (doc.info.title.trim() === '') add('info.title', 'About this IDS', TITLE_SUGGESTED, 'advice');
  if (doc.info.author !== '' && !isEmail(doc.info.author)) {
    add('info.author', 'About this IDS', 'This does not look like an email address, for example name@company.com.');
  }
  if (doc.info.date !== '' && !isDate(doc.info.date)) add('info.date', 'About this IDS', 'Use the form 2026-03-31.');
  if (doc.specifications.length === 0) add('specs', 'Specifications', 'Add at least one specification.');

  doc.specifications.forEach((s, i) => checkSpec(s, `Specification ${i + 1}`, add));
  return out;
}

type Add = (key: string, where: string, message: string, level?: Issue['level']) => void;

function checkSpec(s: Specification, label: string, add: Add) {
  const where = s.name.trim() ? `${label} "${s.name.trim()}"` : label;
  if (s.name.trim() === '') add(`${s.uid}.name`, where, 'Give the specification a name.');
  const unknown = s.ifcVersion.filter((v) => !(IFC_VERSIONS as readonly string[]).includes(v));
  if (s.ifcVersion.length === 0) add(`${s.uid}.ifcVersion`, where, 'Choose at least one IFC version.');
  else if (unknown.length) add(`${s.uid}.ifcVersion`, where, `The IFC version ${unknown.join(', ')} is not one IDS 1.0 allows.`);
  if (s.applicability.length === 0) add(`${s.uid}.applicability`, `${where}, Applies to`, 'Say what this applies to: add at least one item.');
  if (s.applicability.filter((f) => f.kind === 'entity').length > 1) {
    add(`${s.uid}.applicability`, `${where}, Applies to`, 'Only one "Type of element" is allowed here. Use a list of types in one item instead.');
  }
  const choice = specChoice(s);
  if (choice === 'custom') {
    add(`${s.uid}.occurs`, where, 'IDS 1.0 allows only required, optional or prohibited here. Choose one of them.');
  }
  if (choice === 'prohibited' && s.requirements.length > 0) {
    add(`${s.uid}.requirements`, `${where}, Must have`, 'A specification that says elements must not exist cannot also list what they must have. Remove the "Must have" items, or choose another option.');
  }
  if (choice === 'optional' && s.requirements.length === 0) {
    add(`${s.uid}.requirements`, `${where}, Must have`, 'An optional specification needs at least one "Must have" item. Add one, or make the specification required.');
  }
  s.applicability.forEach((f, i) => checkFacet(f, false, `${where}, Applies to, item ${i + 1}`, add));
  s.requirements.forEach((f, i) => checkFacet(f, true, `${where}, Must have, item ${i + 1}`, add));
}

function checkFacet(f: Facet, requirement: boolean, where: string, add: Add) {
  const field = (name: string, v: Value | null, required: boolean) => {
    for (const m of valueProblems(v, required)) add(`${f.uid}.${name}`, where, m);
  };
  // A class name must be in capitals; Check reports any other spelling as an error (the predefined type it accepts as typed).
  const caps = (name: string, v: Value | null, blocking: boolean) => {
    if (v?.kind === 'simple' && v.value !== '' && v.value !== v.value.toUpperCase()) {
      add(`${f.uid}.${name}`, where, 'IFC names are written in capitals, like IFCWALL. A name in other letters will match nothing.', blocking ? 'error' : 'advice');
    }
  };
  switch (f.kind) {
    case 'entity':
      field('name', f.name, true); caps('name', f.name, true); field('predefinedType', f.predefinedType, false); caps('predefinedType', f.predefinedType, false);
      break;
    case 'partOf':
      field('entity', f.entity.name, true); caps('entity', f.entity.name, true); field('predefinedType', f.entity.predefinedType, false); caps('predefinedType', f.entity.predefinedType, false);
      break;
    case 'attribute':
      field('name', f.name, true); field('value', f.value, false);
      break;
    case 'classification':
      field('system', f.system, true); field('value', f.value, false);
      break;
    case 'material':
      field('value', f.value, false);
      break;
    case 'property':
      field('propertySet', f.propertySet, true); field('baseName', f.baseName, true); field('value', f.value, false);
      if (f.dataType !== null && !/^[A-Z]+$/.test(f.dataType)) add(`${f.uid}.dataType`, where, 'A data type is written in capitals, like IFCLABEL.');
      if (isValueGiven(f.value) && !f.dataType) {
        add(`${f.uid}.dataType`, where, 'When you give a value, give the data type too (for example IFCLABEL).');
      }
      break;
  }
  if (!requirement || f.kind === 'entity') return;
  const allowed = allowedCardinalities(f.kind) ?? [];
  if (!allowed.includes(f.cardinality)) add(`${f.uid}.cardinality`, where, 'This choice is not allowed for this kind of item.');
  // Check: an optional property needs a data type; an optional attribute, classification or material needs a value.
  if (f.cardinality === 'optional') {
    if (f.kind === 'property' && !f.dataType) {
      add(`${f.uid}.cardinality`, where, 'Optional only means something when you also give the data type, so there is something to check.');
    } else if ((f.kind === 'attribute' || f.kind === 'classification' || f.kind === 'material') && !isValueGiven(f.value)) {
      add(`${f.uid}.cardinality`, where, 'Optional only means something when you also say what the value must be.');
    }
  }
  if (f.kind === 'property' && f.cardinality === 'prohibited' && f.dataType) {
    add(`${f.uid}.cardinality`, where, 'To prohibit a property, name it without a data type. Remove the data type or make the property required.');
  }
}
