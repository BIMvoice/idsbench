/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
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
export function sharedReason(f: FailingElement): string {
  if (f.reasons.length === 0) return NO_REASON;
  return f.reasons.map((r, i) => { const own = f.found?.[i]; return own ? r.replace(`"${own}"`, OWN_VALUE) : r; }).join(' ');
}
/** The values an element has of its own in its reasons, for the list of a group whose elements differ in them. */
/** All of an element's reasons as one sentence (the text of a group whose elements all have the same). */
export const fullReason = (f: FailingElement): string => (f.reasons.length ? f.reasons.join(' ') : NO_REASON);
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

/** A group as the page lists it: the elements shown (at most the cap), and the group's full count. */
export type ShownGroup = FailureGroup & { total: number };

/** How many different reasons are told apart before the rest are only counted (a reason of every element's own would otherwise be one entry each). */
export const MAX_REASONS = 5000;

/**
 * The groups of groupFailures, built one element at a time, so that a result with millions of failing elements never
 * has to be held (or grouped) as a whole. It keeps, per reason, the count and the first `cap` elements only; what it
 * hands back through shown() is what capGroups(groupFailures(all), cap) gives, and the counts are exact.
 */
export class GroupAccumulator {
  private groups = new Map<string, { group: FailureGroup & { total: number }; full: string }>();
  /** Elements whose reason was not told apart because more than MAX_REASONS reasons were already in. */
  untold = 0;
  count = 0;
  constructor(private cap: number) {}

  add(f: FailingElement): void {
    this.count++;
    const key = sharedReason(f);
    let g = this.groups.get(key);
    if (!g) {
      if (this.groups.size >= MAX_REASONS) { this.untold++; return; }
      g = { group: { reason: key, elements: [], varies: false, total: 0 }, full: fullReason(f) };
      this.groups.set(key, g);
    }
    g.group.total++;
    if (fullReason(f) !== g.full) g.group.varies = true;
    if (g.group.elements.length < this.cap) g.group.elements.push(f);
  }

  /** The groups cut to at most `cap` elements in all, and how many elements are not listed (those left out, and those of untold reasons). */
  shown(): { shown: ShownGroup[]; notShown: number } {
    const all: ShownGroup[] = [...this.groups.values()].map(({ group, full }) => ({ ...group, reason: group.varies ? group.reason : full }));
    let left = this.cap, listed = 0;
    const shown: ShownGroup[] = [];
    for (const g of all) {
      const take = g.elements.slice(0, Math.max(0, left));
      left -= take.length;
      listed += take.length;
      if (take.length) shown.push({ ...g, elements: take });
    }
    return { shown, notShown: this.count - listed };
  }
}
