/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Finding } from './types.ts';
import { pathOf, type XNode } from './xml.ts';
import { closest, type Problem } from './matcher.ts';

/** Collects findings; identical findings that differ only by IFC version are merged ("IFC2X3 and IFC4"). */
export class Reporter {
  readonly findings: Finding[] = [];
  private merged = new Map<string, { f: Finding; labels: string[]; make: (labels: string) => string }>();

  error(node: XNode, code: string, message: string): void {
    this.findings.push({ severity: 'error', code, message, line: node.line || undefined, column: node.column || undefined, path: pathOf(node) });
  }
  warning(node: XNode, code: string, message: string): void {
    this.findings.push({ severity: 'warning', code, message, line: node.line || undefined, column: node.column || undefined, path: pathOf(node) });
  }

  /** Report once per distinct `key`; `make` receives the joined list of IFC versions it applies to. */
  perSchema(node: XNode, code: string, key: string, label: string, make: (labels: string) => string): void {
    const k = `${code}|${pathOf(node)}|${key}`;
    const hit = this.merged.get(k);
    if (hit) {
      if (!hit.labels.includes(label)) hit.labels.push(label);
      hit.f.message = hit.make(joinLabels(hit.labels));
      return;
    }
    const f: Finding = { severity: 'error', code, message: make(label), line: node.line || undefined, column: node.column || undefined, path: pathOf(node) };
    this.findings.push(f);
    this.merged.set(k, { f, labels: [label], make });
  }
}

export function joinLabels(l: string[]): string {
  return l.length <= 1 ? l.join('') : l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1];
}

function quote(v: string): string {
  return `'${v}'`;
}

export function hint(value: string, candidates: string[]): string {
  if (candidates.length === 0) return 'Nothing is allowed here, so this can never match.';
  const near = value ? closest(value, candidates) : undefined;
  const didYouMean = near ? ` Did you mean ${quote(near)}?` : '';
  if (candidates.length > 30) return `Check the spelling; the names are case-sensitive.${didYouMean}`;
  if (candidates.length === 1) return `The only accepted value is ${quote(candidates[0])}.${didYouMean}`;
  if (candidates.length <= 8) return `Accepted values are ${candidates.map(quote).join(', ')}.${didYouMean}`;
  return `${candidates.length} values are accepted, for example ${candidates.slice(0, 5).map(quote).join(', ')}.${didYouMean}`;
}

/** Plain-English sentence for a matcher problem. `subject` reads like "entity name". */
export function describeProblem(subject: string, p: Problem, labels: string): string {
  switch (p.kind) {
    case 'bad-base':
      return `The ${subject} restriction uses base type ${quote(p.base)}, but a text restriction (xs:string) is required here.`;
    case 'total-digits':
      return `The ${subject} restriction uses totalDigits, which does not apply to text; use length instead.`;
    case 'no-match':
      switch (p.what) {
        case 'value':
          return `The ${subject} ${quote(p.value)} is not valid in ${labels}. ${hint(p.value, p.candidates)}`;
        case 'enumeration':
          return `No enumeration option of the ${subject} (${p.value}) is valid in ${labels}. ${hint(p.value.split(', ')[0], p.candidates)}`;
        case 'pattern':
          return `The pattern ${quote(p.value)} for the ${subject} matches no valid value in ${labels}. ${hint('', p.candidates)}`;
        case 'length':
          return `The length restriction ${quote(p.value)} for the ${subject} matches no valid value in ${labels}.`;
      }
  }
}

/** Problems about the restriction itself get their own codes; others use the code of the rule that asked. */
export function problemCode(p: Problem, code: string): string {
  if (p.kind === 'total-digits') return 'restriction-facet-not-for-text';
  if (p.kind === 'bad-base') return 'restriction-base-invalid';
  return code;
}
