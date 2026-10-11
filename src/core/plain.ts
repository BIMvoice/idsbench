// What the Check engine says, in the words of the people who use this page. The engine's sentences come from the XML
// and the standard ("The element <specifications> is incomplete; it needs <specification>."); this layer, which is
// the page's own and does not touch the engine, gives each finding a sentence in the user's terms, keyed by the
// finding's `code`. The engine's own sentence is kept (behind "Details" on the page) and is the fallback for a code,
// or a wording of one, that this layer has no sentence for. Nothing here changes whether a file is valid.
import type { Finding } from '@idsbench/check';

export interface Plain {
  /** The sentence to show. */
  plain: string;
  /** The engine's own sentence, exactly as it gave it. */
  technical: string;
  /** False when the engine's sentence is shown as it is, because no plain one is written for this code or this wording. */
  translated: boolean;
}

const ELEMENTS: Record<string, string> = {
  specifications: 'the list of specifications', specification: 'a specification', applicability: 'the "Applies to" part', requirements: 'the "Must have" part',
  entity: 'a type of element', attribute: 'an attribute', property: 'a property', classification: 'a classification', material: 'a material', partOf: 'a "part of" item',
  propertySet: 'a property set', baseName: 'a property name', simpleValue: 'a value', restriction: 'a rule for the value', name: 'a name', value: 'a value',
  system: 'a classification system', predefinedType: 'a predefined type', relation: 'a relationship', info: 'the information about the IDS', title: 'a title',
  ids: 'the IDS', minLength: 'a minimum length', maxLength: 'a maximum length',
};
const el = (n: string) => ELEMENTS[n] ?? `<${n}>`;
const list = (items: string[], and = 'or') => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`);
const tags = (s: string) => [...s.matchAll(/<([\w:]+)>/g)].map((m) => m[1]);

/** What a value of an XML Schema type looks like to a person, with an example. */
function typeWords(xs: string, v?: string): string {
  const t = xs.replace(/^xs:/, '');
  switch (t) {
    case 'integer': case 'int': case 'long': return v !== undefined && /^[+-]?\d+[.,]\d+$/.test(v) ? `a whole number, such as ${v.replace(/[.,]\d+$/, '')}, not ${v}` : 'a whole number, such as 42';
    case 'double': case 'float': case 'decimal': return 'a number, such as 2.5 (with a dot, not a comma)';
    case 'boolean': return 'true or false, in small letters';
    case 'date': return 'a date written as year-month-day, such as 2026-03-31';
    case 'dateTime': return 'a date and time such as 2026-03-31T14:30:00';
    case 'time': return 'a time such as 14:30:00';
    case 'duration': return 'a duration written the way IFC does, such as PT1H30M for one hour and thirty minutes';
    case 'anyURI': return 'a web address';
    case 'string': return 'text';
    default: return `a value of the kind ${xs}`;
  }
}
const typeOnly = (xs: string) => ({ 'xs:string': 'text', 'xs:integer': 'a whole number', 'xs:double': 'a number', 'xs:decimal': 'a number', 'xs:float': 'a number', 'xs:boolean': 'true or false', 'xs:date': 'a date', 'xs:dateTime': 'a date and time', 'xs:time': 'a time', 'xs:duration': 'a duration', 'xs:anyURI': 'a web address' } as Record<string, string>)[xs] ?? xs;

const RELATIONS: Record<string, string> = {
  IFCRELAGGREGATES: 'a component of', IFCRELASSIGNSTOGROUP: 'a member of', IFCRELCONTAINEDINSPATIALSTRUCTURE: 'located in', IFCRELNESTS: 'nested in', 'IFCRELVOIDSELEMENT IFCRELFILLSELEMENT': 'in an opening of',
};

type Rule = (m: Finding['message'], f: Finding) => string | null;
const rx = (re: RegExp, make: (m: RegExpExecArray, message: string) => string): Rule => (message) => { const m = re.exec(message); return m ? make(m, message) : null; };
const first = (...rules: Rule[]): Rule => (message, f) => { for (const r of rules) { const x = r(message, f); if (x !== null) return x; } return null; };
const didYouMean = (message: string) => { const m = /Did you mean '([^']+)'\?/.exec(message); return m ? ` Did you mean ${m[1]}?` : ''; };
const an = (noun: string) => `${/^[AEIOUaeiou]/.test(noun) || /^IFC[AEIOU]/.test(noun) ? 'an' : 'a'} ${noun}`;

/** What a name is a name of, from the engine's subject ("entity name", "property name in 'Pset_X'"). */
function thingOf(subject: string): string {
  if (subject === 'entity name') return 'IFC class';
  if (subject === 'predefined type') return 'predefined type';
  if (subject === 'attribute name') return 'attribute';
  if (subject.startsWith('property name in')) return `property of ${subject.replace('property name in ', '')}`;
  if (subject === 'value') return 'value this property can have';
  return subject;
}
/** The engine's "matches no valid value" sentences for a rule (a pattern, a list or a length) in place of a single name. */
const noMatch: Rule = (message) => {
  let m: RegExpExecArray | null;
  const tail = (t: string | undefined) => (t ?? '').replace(/ Check the spelling; the names are case-sensitive\./, '').replace(/ Did you mean '([^']+)'\?/, ' Did you mean $1?');
  if ((m = /^No enumeration option of the (.+?) \((.*?)\) is valid in (.+?)\.( .*)?$/.exec(message))) return `None of ${m[2]} is a ${thingOf(m[1])} in ${m[3]}.${tail(m[4])}`;
  if ((m = /^The pattern '(.*?)' for the (.+?) matches no valid value in (.+?)\.( .*)?$/.exec(message))) return `The pattern ${m[1]} matches no ${thingOf(m[2])} in ${m[3]}.${tail(m[4])}`;
  if ((m = /^The length restriction '(.*?)' for the (.+?) matches no valid value in (.+?)\.$/.exec(message))) return `A length of ${m[1]} fits no ${thingOf(m[2])} in ${m[3]}.`;
  return null;
};

const RULES: Record<string, Rule> = {
  'applicability-empty': () => 'Say which elements this specification is about: add a type of element, or another condition, under "Applies to".',
  'applicability-missing': () => 'Say which elements this specification applies to: add something under "Applies to".',
  'applicability-requirements-incompatible': rx(/applicability \(([^)]*)\) and the requirements \(([^)]*)\) can never describe the same element in ([\w, ]+?);/, (m) =>
    `What this specification applies to (${m[1]}) can never be the same element as what "Must have" names (${m[2]}) in ${m[3]}. Check the classes in both places.`),
  'attribute-unknown': first(
    rx(/attribute name '([^']*)' is not valid in ([\w ,]+?)\./, (m, all) => `${m[1]} is not an attribute that IFC knows in ${m[2]}. Attribute names are case-sensitive.${didYouMean(all)}`),
    noMatch,
  ),
  'attribute-value-type-mismatch': first(
    rx(/The attribute '([^']*)' does not hold a plain value in ([\w ,]+?), so a value cannot be required for it\./, (m) => `${m[1]} refers to another item in ${m[2]} and holds no plain value, so you cannot ask for a value of it. Remove the value.`),
    rx(/value restriction uses base type (\S+), but '([^']*)' needs (\S+) in ([\w ,]+?)\./, (m) => `The value of ${m[2]} has to be ${typeOnly(m[3])} in ${m[4]}, but this rule is set up for ${typeOnly(m[1])}. Choose the matching kind of value.`),
    rx(/value restriction has no base type, but '([^']*)' needs (\S+) in ([\w ,]+?)\./, (m) => `The rule for the value of ${m[1]} does not say what kind of value it is, and in ${m[3]} it has to be ${typeOnly(m[2])}.`),
  ),
  'cardinality-conflicts-datatype': () => 'To say a property must not exist, name it without a data type. Remove the data type, or make the property required.',
  'cardinality-invalid': first(
    rx(/minOccurs (\d+) is larger than maxOccurs 0/, () => "This specification is marked both 'must exist' and 'must not exist'. Choose one."),
    rx(/minOccurs (\d+) is larger than maxOccurs (\d+)/, (m) => `This specification asks for at least ${m[1]} matching elements but at most ${m[2]}, which cannot be. Choose one of: the model must have some, may have some, or must have none.`),
    rx(/is not one of the combinations IDS allows/, () => 'IDS allows only three choices for how many matching elements there may be: at least one, any number including none, or none. Choose one of them.'),
    rx(/applicability occurrence is invalid/, () => 'The number of matching elements this specification allows is not one that IDS knows. Choose one of: at least one, any number including none, or none.'),
  ),
  'cardinality-needs-value': first(
    rx(/An optional property needs a dataType/, () => 'An optional property only means something when you also say its data type, so that there is something to check. Give the data type, or make the property required.'),
    rx(/An optional (\w+) needs a value to check/, (m) => `An optional ${m[1]} only means something when you also say what its value must be. Give the value, or make the ${m[1]} required.`),
  ),
  'classification-system-empty': () => 'Name the classification system, for example Uniclass 2015. It is empty.',
  'conditions-impossible': rx(/can never be met together for ([\w, ]+?):/, (m) => `No IFC class fits all the conditions under "Applies to" in ${m[1]}, so this specification can never match anything.`),
  'entity-unknown-class': first(
    rx(/entity name '([^']*)' is not valid in ([\w ,]+?)\./, (m, all) => `${m[1]} is not an IFC class in ${m[2]}. Class names are written in capitals, like IFCWALL.${didYouMean(all)}`),
    noMatch,
  ),
  'entity-unknown-predefined-type': first(
    rx(/option of the predefined type \(([^)]*)\) is valid in ([\w ,]+?)(?: for (\w+))?\. (.*)$/, (m) => `${m[1].includes(',') ? 'None of' : ''} ${m[1]} ${m[1].includes(',') ? 'is' : 'is not'} a predefined type${m[3] ? ` of ${m[3]}` : ''} in ${m[2]}. ${m[4]}`.trim()),
    rx(/predefined type '([^']*)' is not valid in ([\w ,]+?)(?: for (\w+))?\. (.*)$/, (m) => `${m[1]} is not a predefined type${m[3] ? ` of ${m[3]}` : ''} in ${m[2]}. ${m[4]}`),
    noMatch,
  ),
  'ids-version-unsupported': first(
    rx(/This file is IDS ([\d.]+)\. idsbench works with IDS 1\.0 only/, (m) => `This file is IDS ${m[1]}, an older draft. idsbench works with IDS 1.0 only: update the file to version 1.0 in the tool that made it.`),
    rx(/The schema location '([^']*)' is not the IDS 1\.0 location/, () => 'This file does not point to the IDS 1.0 schema, so it cannot be told to be an IDS 1.0 file. Its schemaLocation must be http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd.'),
  ),
  'ifc-version-invalid': first(
    rx(/The IFC version '([^']*)' is not known/, (m) => `${m[1]} is not an IFC version that IDS knows. Use IFC2X3, IFC4 or IFC4X3_ADD2.`),
    rx(/names no IFC version/, () => 'This specification does not say which IFC versions it is for. Tick at least one of IFC2X3, IFC4 and IFC4X3_ADD2.'),
  ),
  'not-an-ids-file': rx(/The root element is <([^>]*)>/, (m) => `This is not an IDS file: it starts with <${m[1]}>, and an IDS file starts with <ids>. Check that you chose the right file.`),
  'partof-entity-incompatible': rx(/In ([\w, ]+?), (\w+(?: \w+)?) needs the whole to be an? (\w+), but the entity names (.+?); use a class/, (m) =>
    `In ${m[1]}, "${RELATIONS[m[2]] ?? m[2]}" only fits ${an(m[3])} (or one of its subtypes), but the class given is ${m[4]}. Choose a class that is ${an(m[3])}.`),
  'partof-relation-invalid': rx(/The relation '([^']*)' is not valid for partOf in ([\w, ]+?)\./, (m) => `${RELATIONS[m[1]] ?? m[1]} is not a relationship that "part of" can use in ${m[2]}. Choose one from the list.`),
  'pattern-invalid': rx(/The pattern '([^']*)' is not a valid regular expression/, (m) => `The pattern ${m[1]} is not a valid pattern. Check the brackets and the special characters.`),
  'property-datatype-invalid': first(
    rx(/The data type '([^']*)' is not valid for this standard property in ([\w ,]+?)\. (?:The only accepted value is '([^']*)'|Accepted values are (.*))\./, (m) => `The standard gives this property the data type ${m[3] ?? m[4]} in ${m[2]}, not ${m[1]}. Use the data type the standard gives.`),
    rx(/The data type '([^']*)' is not valid as an IFC data type in ([\w ,]+?)\./, (m) => `${m[1]} is not an IFC data type in ${m[2]}. Data types are written in capitals, like IFCLABEL.${didYouMean(m[0])}`),
  ),
  'property-reserved-prefix': rx(/'Pset_' are reserved for the IFC standard; this custom set needs a different name(?: \(you wrote '([^']*)'\))?/, (m) => `Names that start with Pset_ belong to the IFC standard.${m[1] ? ` ${m[1]} is not one of its sets.` : ''} Give your own property set another name, such as MyCompany_Walls.`),
  'property-unknown-in-standard-set': first(noMatch, rx(/The property name in '([^']*)' '([^']*)' is not valid in ([\w ,]+?)\. (.*)$/, (m) => `${m[1]} has no property called ${m[2]} in ${m[3]}. ${m[4].replace(/^(\d+) values are accepted, for example (.*?)\.$/, 'Standard ones include $2 and others.').replace(/^Accepted values are (.*?)\.$/, 'Standard ones are $1.')} Use a custom property set for your own properties.`)),
  'property-value-not-allowed': first(rx(/The value '([^']*)' is not valid in ([\w ,]+?)\. (.*)$/, (m) => `${m[1]} is not a value this property can have in ${m[2]}. ${m[3]}`), noMatch),
  'property-value-type-mismatch': rx(/uses base type (\S+), but (\w+) needs (\S+) in ([\w, ]+?)\./, (m) => `The value of this ${m[2]} property has to be ${typeOnly(m[3])} in ${m[4]}, but the rule is set up for ${m[1] === 'xs:invalid' ? 'a kind of value that does not exist' : typeOnly(m[1])}.`),
  'requirements-needed': () => 'A specification that applies "if the model has any" must say what those elements need. Add a requirement under "Must have", or make the specification required.',
  'requirements-not-allowed': () => 'A specification that says elements must not exist cannot also list what they must have. Remove the "Must have" items, or choose another option.',
  'restriction-base-invalid': first(
    rx(/This restriction has no base type/, () => 'This rule for a value does not say what kind of value it is (text, a whole number, and so on). Say which.'),
    rx(/The restriction base type '([^']*)' is not allowed/, (m) => `${m[1]} is not a kind of value that IDS allows in a rule. Use text, a number, a whole number, a date or the like.`),
  ),
  'restriction-empty': () => 'This rule for a value has nothing in it (no value list, pattern or limits), so it cannot match anything. Fill it in.',
  'restriction-facet-invalid': rx(/A '(\w+)' condition cannot be used in a restriction with base (\S+); allowed conditions are (.*)\./, (m) => `A ${m[1]} limit does not fit a value of the kind ${typeOnly(m[2])}. Use one of: ${m[3].replace('annotation, ', '')}.`),
  'restriction-facet-not-for-text': () => 'A limit on the number of digits does not apply to text. Use a length limit instead.',
  'value-empty': () => 'A "part of" item must say what the element is part of. Choose the class.',
  'value-invalid-for-type': first(
    rx(/The value '([^']*)' is not a valid (xs:\w+) value, which is what (\w+) needs\./, (m) => `${m[1] === '' ? 'An empty value is not allowed here: it' : `The value ${m[1]}`} must be ${typeWords(m[2], m[1])}, because ${m[3]} needs that.`),
    rx(/The value '([^']*)' is not a valid (xs:\w+) value\./, (m) => `${m[1] === '' ? 'An empty value is not allowed here: it' : `The value ${m[1]}`} must be ${typeWords(m[2], m[1])}.`),
  ),
  'value-missing': rx(/The (\w+) facet needs a (\w+) given as a simple value or a restriction/, (m) => `${el(m[1]).replace(/^a /, 'A ')} needs ${el(m[2])}, as a value or as a rule. None is given.`),
  'value-needs-datatype': () => 'A property that has a value must also say its data type, for example IFCLABEL.',
  'xml-not-well-formed': rx(/The file is not well-formed XML: (.*)$/, (m) => `This file is not readable as XML, so it cannot be an IDS file: ${m[1].replace(/\.$/, '')}. It may be damaged or cut off.`),
  'xsd-invalid-value': first(
    rx(/^(?:The attribute '([^']+)' on )?<(\w+)>(?: is)? is '([^']*)', which is not a valid (\w+) value\./, (m) => `${m[1] ? `The ${m[1]} of ${el(m[2])}` : `The value of ${el(m[2])}`} (${m[3] === '' ? 'empty' : m[3]}) must be ${typeWords(m[4], m[3])}.`),
    rx(/^The attribute '([^']+)' on <(\w+)> is '([^']*)', but it must be one of (.*)\.$/, (m) => `${m[1] === 'cardinality' ? `For ${el(m[2])} the choice must be one of ${list(m[4].replace(/'/g, '').split(', '))}` : `The ${m[1]} of ${el(m[2])} must be one of ${list(m[4].replace(/'/g, '').split(', '))}`}; it is ${m[3] === '' ? 'empty' : `"${m[3]}"`}.`),
    rx(/^The attribute '([^']+)' on <(\w+)> is '([^']*)', which does not match the required form (.*)\.$/, (m) => `The ${m[1]} of ${el(m[2])} (${m[3]}) is not written in the form the standard asks for.`),
    rx(/^<(\w+)> is '([^']*)', but it must be one of (.*)\.$/, (m) => `The value of ${el(m[1])} is "${m[2]}". Choose one of ${m[3].replace(/'/g, '')}.`),
  ),
  'xsd-missing-attribute': rx(/^<(\w+)> needs the attribute '([^']+)'; add it\.$/, (m) => `${el(m[1]).replace(/^a /, 'A ')} must have its ${m[2]}. Add it.`),
  'xsd-missing-element': rx(/^The element <(\w+)> is incomplete; it needs (.*)\.$/, (m) =>
    m[1] === 'specifications' ? 'Add at least one specification.' : `${el(m[1]).replace(/^(a|the) /, (x) => x.toUpperCase()).replace(/^./, (c) => c.toUpperCase())} is not finished: it needs ${list(tags(m[2]).map(el))}.`),
  'xsd-unexpected-attribute': rx(/^The attribute '([^']+)' is not allowed on <(\w+)>; remove it\.$/, (m) => `${m[1]} does not belong on ${el(m[2])}. Remove it.`),
  'xsd-unexpected-element': first(
    rx(/^The root element <([^>]*)> is not <ids>/, (m) => `This file starts with <${m[1]}>, not <ids> in the IDS namespace, so it is not an IDS 1.0 file.`),
    rx(/^The element <(\w+)> is not allowed here; expected (.*)\.$/, (m) => `${el(m[1]).replace(/^./, (c) => c.toUpperCase())} is not allowed here. What belongs here is ${list(tags(m[2]).map(el))}.`),
    rx(/^The element <(\w+)> is not allowed here\.$/, (m) => `${el(m[1]).replace(/^./, (c) => c.toUpperCase())} is not allowed here.`),
  ),
  'xsd-unexpected-text': rx(/^The element <(\w+)> contains text, but it may only contain other elements\.$/, (m) => `${el(m[1]).replace(/^./, (c) => c.toUpperCase())} holds loose text. It may only hold other items; move the text into one of them.`),
  // Left as the engine says them: they name the schema validator's own wording or its failure, and a rewording would claim more than is known.
  'xsd-other': () => null,
  'xsd-engine-failure': () => null,
};

/** Every code the Check engine can emit, as far as its source and the corpus show. The coverage test keeps this list honest. */
export const ENGINE_CODES: readonly string[] = [
  'applicability-empty', 'applicability-missing', 'applicability-requirements-incompatible', 'attribute-unknown', 'attribute-value-type-mismatch',
  'cardinality-conflicts-datatype', 'cardinality-invalid', 'cardinality-needs-value', 'classification-system-empty', 'conditions-impossible',
  'entity-unknown-class', 'entity-unknown-predefined-type', 'ids-version-unsupported', 'ifc-version-invalid', 'not-an-ids-file',
  'partof-entity-incompatible', 'partof-relation-invalid', 'pattern-invalid', 'property-datatype-invalid', 'property-reserved-prefix',
  'property-unknown-in-standard-set', 'property-value-not-allowed', 'property-value-type-mismatch', 'requirements-needed', 'requirements-not-allowed',
  'restriction-base-invalid', 'restriction-empty', 'restriction-facet-invalid', 'restriction-facet-not-for-text', 'value-empty', 'value-invalid-for-type',
  'value-missing', 'value-needs-datatype', 'xml-not-well-formed', 'xsd-engine-failure', 'xsd-invalid-value', 'xsd-missing-attribute', 'xsd-missing-element',
  'xsd-other', 'xsd-unexpected-attribute', 'xsd-unexpected-element', 'xsd-unexpected-text',
];

/** The codes whose sentence is left as the engine gives it: they carry the schema validator's own wording or its failure. */
export const KEPT_AS_THE_ENGINE_SAYS: readonly string[] = ['xsd-other', 'xsd-engine-failure'];

/** How many of the engine's codes have a plain sentence written for them, and which keep the engine's own. */
export function codeCoverage(): { total: number; translated: number; fallback: string[] } {
  const fallback = ENGINE_CODES.filter((c) => !RULES[c] || KEPT_AS_THE_ENGINE_SAYS.includes(c));
  return { total: ENGINE_CODES.length, translated: ENGINE_CODES.length - fallback.length, fallback };
}

/** The finding in the user's terms, with the engine's sentence kept beside it. */
export function plainFinding(f: Pick<Finding, 'code' | 'message'>): Plain {
  const rule = RULES[f.code];
  let plain: string | null = null;
  try { plain = rule ? rule(f.message, f as Finding) : null; } catch { plain = null; }
  return plain ? { plain, technical: f.message, translated: true } : { plain: f.message, technical: f.message, translated: false };
}
