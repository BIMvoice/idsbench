// The failing elements of one specification, grouped by why they failed, so that the same sentence is read once.
import type { FailingElement } from './types';

export interface FailureGroup {
  /** The reason or reasons the elements share, as one sentence or several. Where each element has a value of its own in it, that value reads "…". */
  reason: string;
  elements: FailingElement[];
  /** True when the elements have different values of their own where the reason says "…": the list then shows each one's. */
  varies: boolean;
}

export const NO_REASON = '(no reason given)';
/** What stands in a shared reason where each element has its own value. */
export const OWN_VALUE = '"…"';

/** The reasons of an element with its own values taken out, so that elements failing the same requirement share them. */
function sharedReason(f: FailingElement): string {
  if (f.reasons.length === 0) return NO_REASON;
  return f.reasons.map((r, i) => { const own = f.found?.[i]; return own ? r.replace(`"${own}"`, OWN_VALUE) : r; }).join(' ');
}
/** The values an element has of its own in its reasons, for the list of a group whose elements differ in them. */
export const ownValues = (f: FailingElement): string => (f.found ?? []).filter((v): v is string => v !== null).join('; ');

/**
 * Elements that fail the same requirements form one group, whatever value each of them has where the reason quotes
 * one ("Name is "Wall 12", expected "Waldo"" and "Name is "Wall 13", expected "Waldo"" are one reason). A group whose
 * elements all have the same value keeps the full sentence. Groups keep the order in which their first element
 * appears, elements keep their order, and every element is in exactly one group, so the counts add up to the list given.
 */
export function groupFailures(failures: FailingElement[]): FailureGroup[] {
  const groups = new Map<string, FailureGroup>();
  for (const f of failures) {
    const key = sharedReason(f);
    const g = groups.get(key);
    if (g) g.elements.push(f);
    else groups.set(key, { reason: key, elements: [f], varies: false });
  }
  for (const g of groups.values()) {
    const full = g.elements[0].reasons.length ? g.elements[0].reasons.join(' ') : NO_REASON;
    if (g.elements.every((e) => (e.reasons.length ? e.reasons.join(' ') : NO_REASON) === full)) g.reason = full;
    else g.varies = true;
  }
  return [...groups.values()];
}

/** The groups cut to at most `cap` elements in all, in order, and how many elements were left out. */
export function capGroups(groups: FailureGroup[], cap: number): { shown: (FailureGroup & { total: number })[]; notShown: number } {
  let left = cap, notShown = 0;
  const shown: (FailureGroup & { total: number })[] = [];
  for (const g of groups) {
    const take = g.elements.slice(0, Math.max(0, left));
    left -= take.length;
    notShown += g.elements.length - take.length;
    if (take.length) shown.push({ reason: g.reason, elements: take, total: g.elements.length, varies: g.varies });
  }
  return { shown, notShown };
}
