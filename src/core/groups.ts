// The failing elements of one specification, grouped by why they failed, so that the same sentence is read once.
import type { FailingElement } from './types';

export interface FailureGroup {
  /** The reason or reasons the elements share, as one sentence or several. */
  reason: string;
  elements: FailingElement[];
}

export const NO_REASON = '(no reason given)';

/**
 * Elements with exactly the same reasons form one group. Groups keep the order in which their first element appears,
 * elements keep their order, and every element is in exactly one group, so the counts add up to the list given.
 */
export function groupFailures(failures: FailingElement[]): FailureGroup[] {
  const groups = new Map<string, FailureGroup>();
  for (const f of failures) {
    const reason = f.reasons.length ? f.reasons.join(' ') : NO_REASON;
    const g = groups.get(reason);
    if (g) g.elements.push(f);
    else groups.set(reason, { reason, elements: [f] });
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
    if (take.length) shown.push({ reason: g.reason, elements: take, total: g.elements.length });
  }
  return { shown, notShown };
}
