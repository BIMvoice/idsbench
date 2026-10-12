/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Lexical checks for the XML Schema base types an IDS restriction may use. The regular expressions follow the
// IDS-Audit-tool (MIT, buildingSMART International): they are deliberately a little stricter than the XSD lexical
// spaces so that a bad value is caught early.
const RE: Record<string, RegExp> = {
  'xs:anyURI': /^\S+$/,
  'xs:boolean': /^(true|false|0|1)$/,
  'xs:date': /^\d{4}-\d{2}-\d{2}(Z|([+-]\d{2}:\d{2}))?$/,
  'xs:dateTime': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|([+-]\d{2}:\d{2}))?$/,
  'xs:double': /^([-+]?[0-9]*\.?[0-9]*([eE][-+]?[0-9]+)?|NaN|\+INF|-INF)$/,
  'xs:float': /^([-+]?[0-9]*\.?[0-9]*([eE][-+]?[0-9]+)?|NaN|\+INF|-INF)$/,
  'xs:decimal': /^([-+]?[0-9]*\.?[0-9]*([eE][-+]?[0-9]+)?|NaN|\+INF|-INF)$/,
  'xs:duration': /^[-+]?P(\d+Y)?(\d+M)?(\d+D)?(T(\d+H)?(\d+M)?(\d+S)?)?$/,
  'xs:integer': /^[+-]?(\d+)$/,
  'xs:time': /^\d{2}:\d{2}:\d{2}(\.\d+)?(Z|([+-]\d{2}:\d{2}))?$/,
};

/** Base types the audit accepts for <xs:restriction base="...">, and the facets each allows. */
const NUMERIC_FACETS = ['annotation', 'pattern', 'enumeration', 'minExclusive', 'maxExclusive', 'minInclusive', 'maxInclusive'];
const STRING_FACETS = ['annotation', 'pattern', 'enumeration', 'minLength', 'maxLength', 'length'];
export const ALLOWED_FACETS: Record<string, string[]> = {
  'xs:string': STRING_FACETS,
  'xs:anyURI': STRING_FACETS,
  'xs:double': NUMERIC_FACETS,
  'xs:float': NUMERIC_FACETS,
  'xs:duration': NUMERIC_FACETS,
  'xs:dateTime': NUMERIC_FACETS,
  'xs:time': NUMERIC_FACETS,
  'xs:date': NUMERIC_FACETS,
  'xs:decimal': NUMERIC_FACETS,
  'xs:boolean': ['annotation', 'pattern'],
  'xs:integer': NUMERIC_FACETS,
};

/** `xs:anyUri` is accepted as an alias of `xs:anyURI` by the audit tool. */
export function normaliseBase(base: string): string {
  return base === 'xs:anyUri' ? 'xs:anyURI' : base;
}

export function isKnownBase(base: string): boolean {
  return normaliseBase(base) in ALLOWED_FACETS;
}

/** True when `value` is acceptable lexically for the XSD base type (unknown/string types accept anything). */
export function isValidLexical(value: string, base: string): boolean {
  const re = RE[normaliseBase(base)];
  return re ? re.test(value) : true;
}
