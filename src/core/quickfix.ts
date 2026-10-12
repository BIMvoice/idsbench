/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Fixes the engine's own finding already spells out, offered as one press. Each is a change to the document model,
// the same one the forms make. A fix is only offered after the engine has been run on the changed file and no longer
// reports that finding (see verifyFixes), so a button never leads to the same problem again.
import type { Finding } from '@idsbench/check';
import { IFC_VERSIONS, type Facet, type IdsDocument, type Specification, type Value } from './ids/model';
import type { Target } from './place';

export interface Fix { label: string; apply: (doc: IdsDocument) => IdsDocument }

const mapSpec = (doc: IdsDocument, index: number, fn: (s: Specification) => Specification): IdsDocument =>
  ({ ...doc, specifications: doc.specifications.map((s, i) => (i === index ? fn(s) : s)) });
const mapFacet = (doc: IdsDocument, index: number, uid: string, fn: (f: Facet) => Facet): IdsDocument =>
  mapSpec(doc, index, (s) => ({ ...s, applicability: s.applicability.map((f) => (f.uid === uid ? fn(f) : f)), requirements: s.requirements.map((f) => (f.uid === uid ? fn(f) : f)) }));

function findFacet(doc: IdsDocument, index: number, uid: string): Facet | null {
  const s = doc.specifications[index];
  return s ? [...s.applicability, ...s.requirements].find((f) => f.uid === uid) ?? null : null;
}
/** The simple text in one field of an item, or null when the field holds something else. */
function textOf(f: Facet, field: string): string | null {
  if (field === 'dataType') return f.kind === 'property' ? f.dataType : null;
  const v: Value | null | undefined = field === 'entity' && f.kind === 'partOf' ? f.entity.name : (f as unknown as Record<string, Value | null>)[field];
  return v && typeof v === 'object' && v.kind === 'simple' ? v.value : null;
}
function withText(f: Facet, field: string, text: string): Facet {
  if (field === 'dataType') return { ...f, dataType: text } as Facet;
  if (field === 'entity' && f.kind === 'partOf') return { ...f, entity: { ...f.entity, name: { kind: 'simple', value: text } } };
  return { ...f, [field]: { kind: 'simple', value: text } } as Facet;
}

/** Looks up the data type the standard gives a property of a standard property set; null when it is not known (yet). */
export type DataTypeLookup = (propertySet: string, property: string) => string | null;

/**
 * What of the opened file is still written as the file has it (see keep.ts). A problem that is in the file's own text
 * and not in what it says (an attribute the standard does not know, parts in the wrong order) cannot be reached from a
 * form; writing that part again from what the page read is then the fix, and it is offered like any other.
 */
export interface KeptParts { specification: (s: Specification) => boolean; info: boolean; file: boolean }
const NOTHING_KEPT: KeptParts = { specification: () => false, info: false, file: false };

export const WRITE_SPEC_AGAIN = 'Write this specification again in the standard form';
export const WRITE_INFO_AGAIN = 'Write "About this IDS" again in the standard form';
export const WRITE_FILE_AGAIN = 'Write the whole file again in the standard form';

/** The fixes a finding suggests, before the engine has confirmed them. Pure. */
export function candidateFixes(f: Pick<Finding, 'code' | 'message'>, doc: IdsDocument, target: Target, dataTypeOf: DataTypeLookup = () => null, kept: KeptParts = NOTHING_KEPT): Fix[] {
  const own = fixesInTheModel(f, doc, target, dataTypeOf);
  if (own.length > 0 || doc.rewrite === 'all') return own;
  if (target.kind === 'file') return kept.file ? [{ label: WRITE_FILE_AGAIN, apply: (d) => ({ ...d, rewrite: 'all' }) }] : [];
  if (target.kind === 'info') return kept.info && doc.rewrite !== 'info' ? [{ label: WRITE_INFO_AGAIN, apply: (d) => ({ ...d, rewrite: 'info' }) }] : [];
  const s = doc.specifications[target.spec];
  return s && kept.specification(s) ? [{ label: WRITE_SPEC_AGAIN, apply: (d) => mapSpec(d, target.spec, (x) => ({ ...x, rewrite: true })) }] : [];
}

function fixesInTheModel(f: Pick<Finding, 'code' | 'message'>, doc: IdsDocument, target: Target, dataTypeOf: DataTypeLookup): Fix[] {
  if (target.kind !== 'field') return [];
  const index = target.spec;
  const dot = target.key.indexOf('.');
  const uid = target.key.slice(0, dot), field = target.key.slice(dot + 1);
  const s = doc.specifications[index];
  if (!s) return [];
  if (uid === s.uid) {
    if (field === 'requirements' && f.code === 'requirements-not-allowed') {
      const n = s.requirements.length;
      return [{ label: n === 1 ? 'Remove the 1 "Must have" item' : `Remove the ${n} "Must have" items`, apply: (d) => mapSpec(d, index, (x) => ({ ...x, requirements: [], requirementsDescription: null })) }];
    }
    if (field === 'ifcVersion' && s.ifcVersion.length === 0) {
      return IFC_VERSIONS.map((v) => ({ label: `Use ${v}`, apply: (d: IdsDocument) => mapSpec(d, index, (x) => ({ ...x, ifcVersion: [v] })) }));
    }
    return [];
  }
  const facet = findFacet(doc, index, uid);
  if (!facet) return [];
  const set = (text: string): Fix => ({ label: `Change it to ${text}`, apply: (d) => mapFacet(d, index, uid, (x) => withText(x, field, text)) });
  const current = textOf(facet, field);
  const meant = /Did you mean '([^']+)'\?/.exec(f.message)?.[1];
  // The engine's "Did you mean" is the nearest name by spelling. Only when it is the same name in other letters is it
  // certainly what was meant; a name one or two letters away may be another thing altogether (IFCPILE for IFCPIPE,
  // Dir for Dim), so that stays a suggestion in the sentence and is not made one press.
  if (meant && current !== null && current !== meant && current.toLowerCase() === meant.toLowerCase()) return [set(meant)];
  if (current && current !== current.toUpperCase() && ['entity-unknown-class', 'property-datatype-invalid'].includes(f.code)) return [set(current.toUpperCase())];
  if (f.code === 'value-needs-datatype' && facet.kind === 'property' && !facet.dataType) {
    const set_ = textOf(facet, 'propertySet'), name = textOf(facet, 'baseName');
    const type = set_ && name ? dataTypeOf(set_, name) : null;
    if (type) return [{ label: `Add the data type ${type}`, apply: (d) => mapFacet(d, index, uid, (x) => ({ ...x, dataType: type } as Facet)) }];
  }
  return [];
}

/**
 * The same finding in two check results: same rule at the same place. The sentence is not compared: it quotes the
 * value, so a change that leaves the problem standing would otherwise pass for one that removed it.
 */
const sameFinding = (a: Pick<Finding, 'code' | 'path'>, b: Pick<Finding, 'code' | 'path'>) => a.code === b.code && a.path === b.path;

/**
 * Keeps the candidates the engine confirms: after the change, the engine reports nothing of that rule at that place
 * any more, and fewer errors than before. `check` runs the engine on a document and returns its findings.
 */
export async function verifyFixes(
  finding: Finding, fixes: Fix[], doc: IdsDocument, errorsNow: number,
  check: (doc: IdsDocument) => Promise<Finding[] | null>,
): Promise<Fix[]> {
  const out: Fix[] = [];
  for (const fix of fixes) {
    const after = await check(fix.apply(doc));
    if (!after) continue;
    const errors = after.filter((x) => x.severity === 'error');
    const improved = finding.severity === 'error' ? errors.length < errorsNow : errors.length <= errorsNow;
    if (improved && !after.some((x) => sameFinding(x, finding))) out.push(fix);
  }
  return out;
}
