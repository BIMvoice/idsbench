/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The 3D view's colouring and selection, as plain functions of GlobalIds: no renderer, no browser. What the view paints
// is a function of one specification's result (its failing elements and the elements it applies to) and of which
// express id the renderer calls which GlobalId; the tests hold this mapping, the view only applies it.

/** What one element is, for the selected specification. */
export type ElementState = 'fail' | 'pass' | 'other';

/** Red, green, and a ghosted grey (RGBA, 0 to 1). */
export const STATE_COLOURS: Record<ElementState, [number, number, number, number]> = {
  fail: [0.86, 0.12, 0.12, 1],
  pass: [0.16, 0.62, 0.28, 1],
  other: [0.62, 0.64, 0.68, 0.14],
};

/**
 * The state of every element the specification applies to: failing ones fail, the others it applies to pass. An element
 * that is not in the map is neither (`other`). An element that fails is never also a pass, whatever the lists say.
 */
export function elementStates(failing: Iterable<string | null>, applicable: Iterable<string>): Map<string, ElementState> {
  const states = new Map<string, ElementState>();
  for (const g of applicable) states.set(g, 'pass');
  for (const g of failing) if (g) states.set(g, 'fail');
  return states;
}

export const stateOf = (states: ReadonlyMap<string, ElementState>, globalId: string | null | undefined): ElementState =>
  (globalId ? states.get(globalId) : undefined) ?? 'other';

/** The colour of every element that has geometry, by the express id the renderer knows it by. `guidOf` maps express id to GlobalId. */
export function colourOverrides(states: ReadonlyMap<string, ElementState>, guidOf: ReadonlyMap<number, string>): Map<number, [number, number, number, number]> {
  const out = new Map<number, [number, number, number, number]>();
  for (const [expressId, g] of guidOf) out.set(expressId, STATE_COLOURS[stateOf(states, g)]);
  return out;
}

/** The express ids of the elements with these GlobalIds that have geometry (an element with none cannot be shown, and is left out). */
export function expressIdsOf(globalIds: Iterable<string | null>, guidOf: ReadonlyMap<number, string>): Set<number> {
  const wanted = new Set<string>();
  for (const g of globalIds) if (g) wanted.add(g);
  const out = new Set<number>();
  for (const [expressId, g] of guidOf) if (wanted.has(g)) out.add(expressId);
  return out;
}

/** The GlobalId of the element clicked in 3D, when it is one of the elements the page lists (its row is then highlighted); otherwise null. */
export function listedGlobalId(expressId: number | null, guidOf: ReadonlyMap<number, string>, listed: ReadonlySet<string>): string | null {
  const g = expressId === null ? undefined : guidOf.get(expressId);
  return g && listed.has(g) ? g : null;
}
