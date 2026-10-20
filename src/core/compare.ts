/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Two deliveries of a model run against the same IDS file: what changed, specification by specification, and element
// by element. Elements are matched by their GlobalId, which IFC keeps the same for an element in every file it is in.
import { csvCell, failureTotalOf } from './csv';
import { plural } from './shape';
import { COMPARE_LIMIT, type CompareKeys, type FailingElement, type RunResult, type SpecRow, type SpecState } from './types';

/** How a specification's result changed from the earlier delivery to this one. */
export type SpecChange = 'now-passes' | 'now-fails' | 'still-fails' | 'still-passes' | 'not-checked' | 'not-in-both';

/**
 * What happened to one failing element, for one specification. fixed: it failed before, and now the specification
 * applies to it and it passes. no-longer-checked: it failed before and is still in the model, but the specification
 * does not apply to it any more (its class changed, say), so it is not known to pass. removed: it failed before and is
 * not in the model any more. new-failure: the specification applied to it before and it passed; it fails now.
 * newly-checked: it was in the earlier model but the specification did not apply to it; it applies now, and it fails.
 * new-element: it was not in the earlier model, and fails now. still-failing: it fails in both.
 */
export type ElementChange = 'fixed' | 'no-longer-checked' | 'removed' | 'new-failure' | 'newly-checked' | 'new-element' | 'still-failing';

export const SPEC_CHANGE_WORDS: Record<SpecChange, string> = {
  'now-passes': 'Now passes',
  'now-fails': 'Now fails',
  'still-fails': 'Still fails',
  'still-passes': 'Still passes',
  'not-checked': 'Not checked in one',
  'not-in-both': 'In one result only',
};
export const ELEMENT_CHANGE_WORDS: Record<ElementChange, string> = {
  fixed: 'Fixed',
  'no-longer-checked': 'No longer checked by this specification',
  removed: 'Element removed',
  'new-failure': 'New failure',
  'newly-checked': 'Newly checked by this specification, failing',
  'new-element': 'New element, failing',
  'still-failing': 'Still failing',
};
/** The order in which element changes are listed: what got better first. */
export const ELEMENT_CHANGES: ElementChange[] = ['fixed', 'no-longer-checked', 'removed', 'new-failure', 'newly-checked', 'new-element', 'still-failing'];
/** The changes of an element that does not fail now: what is listed of them is how they failed before. */
export const NO_LONGER_FAILING: ReadonlySet<ElementChange> = new Set(['fixed', 'no-longer-checked', 'removed']);

export interface ChangedElement {
  change: ElementChange;
  /** The element as the delivery where it fails has it: the earlier one for the changes in NO_LONGER_FAILING, this one otherwise. */
  element: FailingElement;
}

export interface SpecComparison {
  name: string;
  change: SpecChange;
  before: SpecRow | null;
  after: SpecRow | null;
  /** How many elements failed it, in the earlier delivery and in this one (0 where it was not checked). */
  failedBefore: number;
  failedAfter: number;
  elements: ChangedElement[];
  counts: Record<ElementChange, number>;
  /** Failing elements without a GlobalId, in either delivery: they cannot be matched, so they are counted and not listed. */
  noGlobalId: number;
  /** Failing elements, in either delivery, whose GlobalId another entity of the model also carries: not matched, counted and not listed. */
  duplicateGlobalId: number;
  /** The change in words, with the counts. */
  summary: string;
}

export interface Comparison {
  earlierFile: string;
  laterFile: string;
  specs: SpecComparison[];
  counts: Record<SpecChange, number>;
  elements: Record<ElementChange, number>;
  headline: string;
  /** The element changes over all specifications in one sentence; empty when there are none. */
  elementLine: string;
  /** Failing elements over all specifications that share their GlobalId with another element (see SpecComparison.duplicateGlobalId). */
  duplicateGlobalId: number;
}

const passing = (s: SpecState) => s === 'pass' || s === 'nothing';
const zeroElements = (): Record<ElementChange, number> => ({ fixed: 0, 'no-longer-checked': 0, removed: 0, 'new-failure': 0, 'newly-checked': 0, 'new-element': 0, 'still-failing': 0 });
const zeroSpecs = (): Record<SpecChange, number> => ({ 'now-passes': 0, 'now-fails': 0, 'still-fails': 0, 'still-passes': 0, 'not-checked': 0, 'not-in-both': 0 });
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** How the state of one specification changed. */
export function specChange(before: SpecRow | null, after: SpecRow | null): SpecChange {
  if (!before || !after) return 'not-in-both';
  if (before.state === 'unchecked' || after.state === 'unchecked') return 'not-checked';
  const was = passing(before.state), is = passing(after.state);
  if (was && is) return 'still-passes';
  if (!was && !is) return 'still-fails';
  return is ? 'now-passes' : 'now-fails';
}

/** What an element is matched against: the GlobalIds of each model, and those of the elements the specification applies to in each run. */
export interface MatchContext {
  earlierIds: ReadonlySet<string>;
  laterIds: ReadonlySet<string>;
  earlierApplicable: ReadonlySet<string>;
  laterApplicable: ReadonlySet<string>;
  /** GlobalIds that more than one entity of either model carries: an element with one of them cannot be told from the other by it, so it is not matched. */
  duplicates?: ReadonlySet<string>;
}

/**
 * The failing elements of one specification in the two deliveries, matched by GlobalId. An element that fails no more
 * is "fixed" only when the specification applies to it now (and so it passes); "no longer checked" when the model still
 * holds it but the specification does not apply to it; "removed" when the model does not hold it. Each way round the
 * same: a new failure is an element the specification applied to before (it passed), "newly checked" one the earlier
 * model held without the specification applying to it, and a "new element" one the earlier model did not hold.
 */
export function diffElements(before: FailingElement[], after: FailingElement[], ctx: MatchContext): { elements: ChangedElement[]; noGlobalId: number; duplicateGlobalId: number } {
  const keyed = (list: FailingElement[]) => {
    const m = new Map<string, FailingElement>();
    for (const f of list) if (f.globalId && !m.has(f.globalId)) m.set(f.globalId, f);
    return m;
  };
  const was = keyed(before), now = keyed(after);
  const elements: ChangedElement[] = [];
  let noGlobalId = 0, duplicateGlobalId = 0;
  const shared = (f: FailingElement) => !!f.globalId && (ctx.duplicates?.has(f.globalId) ?? false);
  for (const f of before) {
    if (!f.globalId) { noGlobalId++; continue; }
    if (shared(f)) { duplicateGlobalId++; continue; }
    if (now.has(f.globalId)) continue;
    elements.push({ change: ctx.laterApplicable.has(f.globalId) ? 'fixed' : ctx.laterIds.has(f.globalId) ? 'no-longer-checked' : 'removed', element: f });
  }
  for (const f of after) {
    if (!f.globalId) { noGlobalId++; continue; }
    if (shared(f)) { duplicateGlobalId++; continue; }
    const change: ElementChange = was.has(f.globalId) ? 'still-failing' : ctx.earlierApplicable.has(f.globalId) ? 'new-failure' : ctx.earlierIds.has(f.globalId) ? 'newly-checked' : 'new-element';
    elements.push({ change, element: f });
  }
  return { elements, noGlobalId, duplicateGlobalId };
}

/** The pairs of rows of the two results: by position when the two list the same specifications, else by name, and what is left over alone. */
function pairRows(a: SpecRow[], b: SpecRow[]): [SpecRow | null, SpecRow | null][] {
  if (a.length === b.length && a.every((s, i) => norm(s.name) === norm(b[i].name))) return a.map((s, i) => [s, b[i]]);
  // The IDS file is the same for both runs, so this does not happen; if it ever does, nothing is matched by guess.
  const used = new Set<number>();
  const pairs: [SpecRow | null, SpecRow | null][] = a.map((s) => {
    const j = b.findIndex((t, k) => !used.has(k) && norm(t.name) === norm(s.name));
    if (j < 0) return [s, null];
    used.add(j);
    return [s, b[j]];
  });
  b.forEach((t, k) => { if (!used.has(k)) pairs.push([null, t]); });
  return pairs;
}

function countsLine(counts: Record<ElementChange, number>): string {
  const parts: string[] = [];
  if (counts.fixed) parts.push(`${counts.fixed.toLocaleString('en')} fixed`);
  if (counts['no-longer-checked']) parts.push(`${counts['no-longer-checked'].toLocaleString('en')} no longer checked by this specification`);
  if (counts.removed) parts.push(`${counts.removed.toLocaleString('en')} removed from the model`);
  const fresh = counts['new-failure'] + counts['new-element'];
  if (fresh) parts.push(`${plural(fresh, 'new failure')}${counts['new-element'] ? ` (${counts['new-element'] === fresh ? (fresh === 1 ? 'a new element' : 'all new elements') : `${counts['new-element'].toLocaleString('en')} of them new ${counts['new-element'] === 1 ? 'element' : 'elements'}`})` : ''}`);
  if (counts['newly-checked']) parts.push(`${counts['newly-checked'].toLocaleString('en')} newly checked and failing`);
  if (counts['still-failing']) parts.push(`${counts['still-failing'].toLocaleString('en')} still failing`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? '';
}

function summaryOf(c: Omit<SpecComparison, 'summary'>): string {
  const lead: Record<SpecChange, string> = {
    'now-passes': 'Failed in the earlier delivery, passes now.',
    'now-fails': 'Passed in the earlier delivery, fails now.',
    'still-fails': 'Fails in both.',
    'still-passes': 'Passes in both.',
    'not-checked': c.before?.state === 'unchecked' && c.after?.state === 'unchecked' ? 'Not checked in either delivery, so there is nothing to compare.'
      : c.before?.state === 'unchecked' ? 'Not checked in the earlier delivery, so there is nothing to compare.' : 'Not checked in this model, so there is nothing to compare.',
    'not-in-both': `In the result of ${c.before ? 'the earlier delivery' : 'this model'} only. Both were checked against the same IDS file, so this should not happen: choose the earlier delivery again.`,
  };
  const words = [lead[c.change]];
  if (c.change === 'still-fails' || c.change === 'now-passes' || c.change === 'now-fails') {
    words.push(`Failing elements: ${c.failedBefore.toLocaleString('en')} before, ${c.failedAfter.toLocaleString('en')} now.`);
    const line = countsLine(c.counts);
    if (line) words.push(`${line[0].toUpperCase()}${line.slice(1)}.`);
    if (c.failedBefore === 0 && c.failedAfter === 0 && c.change === 'still-fails') words.push('It fails as a whole in both, with no element to list.');
  }
  if (c.duplicateGlobalId) words.push(sharedSentence(c.duplicateGlobalId));
  if (c.noGlobalId) words.push(`${plural(c.noGlobalId, 'failing element')} without a GlobalId cannot be matched and ${c.noGlobalId === 1 ? 'is' : 'are'} not listed.`);
  return words.join(' ');
}

const sharedSentence = (n: number) => `${plural(n, 'failing element')} (in either delivery) share${n === 1 ? 's' : ''} a GlobalId with another element of the model, so ${n === 1 ? 'it is' : 'they are'} not matched by it: counted, not listed.`;

function headlineOf(later: string, earlier: string, counts: Record<SpecChange, number>, total: number): string {
  if (total === 0) return `${later} against ${earlier}: the IDS file has no specifications, so there is nothing to compare.`;
  const parts: [number, string, string][] = [
    [counts['now-passes'], 'now passes', 'now pass'],
    [counts['now-fails'], 'now fails', 'now fail'],
    [counts['still-fails'], 'still fails', 'still fail'],
    [counts['still-passes'], 'still passes', 'still pass'],
  ];
  const said = parts.filter(([n]) => n > 0).map(([n, one, many], i) => `${i === 0 ? plural(n, 'specification') : n.toLocaleString('en')} ${n === 1 ? one : many}`);
  const list = said.length > 1 ? `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}` : said[0];
  const out = [list ? `${later} against ${earlier}: ${list}.` : `${later} against ${earlier}:`];
  if (counts['not-checked']) out.push(`${plural(counts['not-checked'], 'specification')} ${counts['not-checked'] === 1 ? 'was' : 'were'} not checked in one of the two or both.`);
  if (counts['not-in-both']) out.push(`${plural(counts['not-in-both'], 'specification')} ${counts['not-in-both'] === 1 ? 'is' : 'are'} in one result only.`);
  return out.join(' ');
}

const keysOf = (r: RunResult): CompareKeys => {
  if (!r.keys) throw new Error('a comparison needs a run made with collect');
  if (r.keys.tooMany) throw new Error('a comparison of a run with too many keys (see tooManyToCompare)');
  return r.keys;
};

export { COMPARE_LIMIT };

/**
 * Null when the two runs can be compared on the page; else the sentence that says why not: a model with more keys
 * (GlobalIds, elements applied to and failing elements together) than the page holds for a comparison.
 */
export function tooManyToCompare(earlier: RunResult, later: RunResult): string | null {
  const over = [earlier, later].filter((r) => r.keys?.tooMany);
  if (over.length === 0) return null;
  const limit = over[0].keys!.tooMany!.limit;
  const names = over.map((r) => r.ifcFile).join(' and ');
  return `${names} ${over.length === 1 ? 'has' : 'have'} too many elements to compare on this page: a comparison holds at most ${limit.toLocaleString('en')} GlobalIds and element results of each model, and it does not compare part of them. The result of this model above is complete, and Download failing elements gives every failing element of it. To compare, export both models in smaller parts, split the same way (by building or discipline).`;
}

/** Compare the run of the earlier delivery with the run of this one, both against the same IDS file. */
export function compareDeliveries(earlier: RunResult, later: RunResult): Comparison {
  const ek = keysOf(earlier), lk = keysOf(later);
  const earlierIds = new Set(ek.globalIds), laterIds = new Set(lk.globalIds);
  // A GlobalId more than one entity of a model carries (the list of a model holds each entity's once).
  const duplicates = new Set<string>();
  for (const list of [ek.globalIds, lk.globalIds]) { const seen = new Set<string>(); for (const g of list) { if (seen.has(g)) duplicates.add(g); else seen.add(g); } }
  const failingOf = (r: RunResult, k: CompareKeys, row: SpecRow) => k.failing[r.specs.indexOf(row)] ?? [];
  const applicableOf = (r: RunResult, k: CompareKeys, row: SpecRow) => new Set(k.applicable[r.specs.indexOf(row)] ?? []);
  const counts = zeroSpecs(), elements = zeroElements();
  const specs = pairRows(earlier.specs, later.specs).map(([before, after]): SpecComparison => {
    const change = specChange(before, after);
    const checked = change !== 'not-checked' && change !== 'not-in-both';
    const diff = checked && before && after ? diffElements(failingOf(earlier, ek, before), failingOf(later, lk, after), { earlierIds, laterIds, earlierApplicable: applicableOf(earlier, ek, before), laterApplicable: applicableOf(later, lk, after), duplicates }) : { elements: [], noGlobalId: 0, duplicateGlobalId: 0 };
    const c = zeroElements();
    for (const e of diff.elements) c[e.change]++;
    counts[change]++;
    for (const k of ELEMENT_CHANGES) elements[k] += c[k];
    const base = {
      name: (after ?? before)!.name,
      change, before, after,
      failedBefore: checked && before ? failureTotalOf(before) : 0,
      failedAfter: checked && after ? failureTotalOf(after) : 0,
      elements: diff.elements, counts: c, noGlobalId: diff.noGlobalId, duplicateGlobalId: diff.duplicateGlobalId,
    };
    return { ...base, summary: summaryOf(base) };
  });
  const line = countsLine(elements);
  const duplicateGlobalId = specs.reduce((n, s) => n + s.duplicateGlobalId, 0);
  return {
    earlierFile: earlier.ifcFile,
    laterFile: later.ifcFile,
    specs,
    counts,
    elements,
    headline: headlineOf(later.ifcFile, earlier.ifcFile, counts, specs.length),
    elementLine: [line ? `Failing elements: ${line}.` : '', duplicateGlobalId ? sharedSentence(duplicateGlobalId) : ''].filter(Boolean).join(' '),
    duplicateGlobalId,
  };
}

/** The changed elements of one kind, as plain failing elements (for grouping by reason as the failure list does). */
export const elementsOf = (c: SpecComparison, change: ElementChange): FailingElement[] => c.elements.filter((e) => e.change === change).map((e) => e.element);

// ---- the CSV for the people who model ----

export const COMPARE_COLUMNS = ['Row about', 'Change', 'Specification', 'Requirement', 'Details', 'What to fix', 'IFC class', 'Name', 'GlobalId', 'Storey or space', 'Earlier model', 'Model', 'IDS file'] as const;
const row = (cells: string[]) => `${cells.map(csvCell).join(',')}\r\n`;

/**
 * The comparison as CSV: one row per specification ("Specification" in the first column, with its change and the counts
 * in words), then one row per changed element ("Element", with what happened to it and, for an element that fails now,
 * why and what to fix; for one that no longer fails, why it failed before). UTF-8 with a byte order mark and CRLF line
 * ends, and no cell a spreadsheet would run as a formula, as the list of failing elements.
 */
export function comparisonCsvParts(c: Comparison, idsFile: string): BlobPart[] {
  const parts: BlobPart[] = [`﻿${row([...COMPARE_COLUMNS])}`];
  for (const s of c.specs) {
    const requirement = s.after?.requirement ?? s.before?.requirement ?? '';
    const mine = [row(['Specification', SPEC_CHANGE_WORDS[s.change], s.name, requirement, s.summary, '', '', '', '', '', c.earlierFile, c.laterFile, idsFile])];
    for (const k of ELEMENT_CHANGES) {
      for (const e of s.elements) {
        if (e.change !== k) continue;
        const f = e.element;
        const fails = !NO_LONGER_FAILING.has(k);
        mine.push(row(['Element', ELEMENT_CHANGE_WORDS[k], s.name, requirement, `${fails ? '' : 'It failed before: '}${f.reasons.join(' ')}`, fails ? (f.toFix ?? []).filter(Boolean).join('; ') : '', f.ifcClass, f.name ?? '', f.globalId ?? '', f.place ?? '', c.earlierFile, c.laterFile, idsFile]));
      }
    }
    parts.push(mine.join(''));
  }
  return parts;
}

export function comparisonCsvName(c: Pick<Comparison, 'earlierFile' | 'laterFile'>): string {
  const base = (n: string) => n.replace(/\.ifc$/i, '') || 'model';
  return `${base(c.laterFile)}-compared-with-${base(c.earlierFile)}.csv`;
}

/** How many changed elements one piece of the report holds. */
const ELEMENTS_PER_PIECE = 5000;

/**
 * The comparison for the report as JSON text in pieces: the JSON of comparisonForReport, with the changed elements of
 * each specification written a block at a time, so a comparison with millions of changes is never one string.
 */
export function comparisonReportParts(c: Comparison): BlobPart[] {
  const head = { earlierModel: c.earlierFile, model: c.laterFile, headline: c.headline, counts: c.counts, elements: c.elements };
  const parts: BlobPart[] = [`${JSON.stringify(head).slice(0, -1)},"specs":[`];
  c.specs.forEach((s, i) => {
    const { elements: _elements, ...own } = specForReport(s);
    parts.push(`${i ? ',' : ''}${JSON.stringify(own).slice(0, -1)},"elements":[`);
    for (let k = 0; k < s.elements.length; k += ELEMENTS_PER_PIECE) {
      parts.push(`${k ? ',' : ''}${s.elements.slice(k, k + ELEMENTS_PER_PIECE).map((e) => JSON.stringify(elementForReport(e))).join(',')}`);
    }
    parts.push(']}');
  });
  parts.push(']}');
  return parts;
}

const elementForReport = (e: ChangedElement) => ({ change: e.change, ifcClass: e.element.ifcClass, name: e.element.name, globalId: e.element.globalId });

/** The comparison for the report: the headline, and per specification its change, counts and changed elements. */
export function comparisonForReport(c: Comparison) {
  return {
    earlierModel: c.earlierFile,
    model: c.laterFile,
    headline: c.headline,
    counts: c.counts,
    elements: c.elements,
    specs: c.specs.map(specForReport),
  };
}

function specForReport(s: SpecComparison) {
  return {
    name: s.name,
    change: s.change,
    failedBefore: s.failedBefore,
    failedAfter: s.failedAfter,
    counts: s.counts,
    noGlobalId: s.noGlobalId,
    duplicateGlobalId: s.duplicateGlobalId,
    summary: s.summary,
    elements: s.elements.map(elementForReport),
  };
}
