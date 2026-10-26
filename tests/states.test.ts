/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// What the 3D view paints and selects, as a function of GlobalIds (core/states.ts), on an official fail pair of the
// buildingSMART IDS test cases ("Properties can be associated to relevant object types": its model has wall types and
// four walls that have shapes) and on a specification of walls written for the same model.
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { colourOverrides, elementStates, expressIdsOf, listedGlobalId, STATE_COLOURS, stateOf } from '../src/core/states';
import { idsText, nameIs, specXml, runText } from './helpers/small-model';

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

const ifc = fs.readFileSync(new URL('./fixtures/official-fail-wall-types.ifc', import.meta.url), 'utf8');
const ids = fs.readFileSync(new URL('./fixtures/official-fail-wall-types.ids', import.meta.url), 'utf8');

/** Express id to GlobalId of every element line of the model with the given class, as the renderer would know them. */
const guidsOf = (cls: string): Map<number, string> => {
  const out = new Map<number, string>();
  for (const m of ifc.matchAll(new RegExp(`^#(\\d+)=${cls}\\('([^']+)'`, 'gm'))) out.set(Number(m[1]), m[2]);
  return out;
};
const walls = guidsOf('IFCWALL');
const wallTypes = guidsOf('IFCWALLTYPE');
const guidOf = new Map<number, string>([...walls, ...wallTypes]);
/** The GlobalId of the wall type of this name. DEMO1 has no fire rating and DEMO4 has "FOOBAR", so both fail; DEMO2 ("-/-/-") and DEMO3 ("120/120/120") meet the pattern. */
const typeNamed = (name: string) => [...ifc.matchAll(new RegExp(`^#(\\d+)=IFCWALLTYPE\\('([^']+)',\\$,'${name}'`, 'gm'))].map((m) => ({ express: Number(m[1]), guid: m[2] }))[0];
const FAILING_TYPES = ['DEMO1', 'DEMO4'].map(typeNamed);
const PASSING_TYPES = ['DEMO2', 'DEMO3'].map(typeNamed);
const red = (c: readonly number[]) => c[0] > 0.6 && c[1] < 0.3 && c[2] < 0.3 && c[3] === 1;
const green = (c: readonly number[]) => c[1] > 0.5 && c[0] < 0.3 && c[2] < 0.4 && c[3] === 1;
const ghost = (c: readonly number[]) => c[3] < 0.5;

describe('the official fail pair: wall types need a fire rating of a given form', () => {
  it('the fixture is what it says: 4 wall types (two meet the pattern) and 4 walls', () => {
    expect(wallTypes.size).toBe(4);
    expect(FAILING_TYPES.concat(PASSING_TYPES).every((t) => t && wallTypes.get(t.express) === t.guid)).toBe(true);
    expect(walls.size).toBe(4);
  });

  it('the wall types without a proper fire rating fail, the others pass, and the walls it does not apply to are neither', async () => {
    const r = await runText(ids, ifc, { collect: true });
    expect(r.specs[0].state).toBe('fail');
    const states = elementStates(r.keys!.failing[0].map((f) => f.globalId), r.keys!.applicable[0]);
    for (const t of FAILING_TYPES) expect(stateOf(states, t.guid)).toBe('fail');
    for (const t of PASSING_TYPES) expect(stateOf(states, t.guid)).toBe('pass');
    for (const g of walls.values()) expect(stateOf(states, g)).toBe('other');
    // An element that is not in the model at all is not any state either.
    expect(stateOf(states, 'no-such-guid')).toBe('other');
    expect(stateOf(states, null)).toBe('other');
  });

  it('what is painted: red for the failing types, green for the passing ones, ghost for the walls', async () => {
    const r = await runText(ids, ifc, { collect: true });
    const states = elementStates(r.keys!.failing[0].map((f) => f.globalId), r.keys!.applicable[0]);
    const paint = colourOverrides(states, guidOf);
    expect(paint.size).toBe(8);
    for (const t of FAILING_TYPES) expect(red(paint.get(t.express)!)).toBe(true);
    for (const t of PASSING_TYPES) expect(green(paint.get(t.express)!)).toBe(true);
    for (const e of walls.keys()) expect(ghost(paint.get(e)!)).toBe(true);
  });
});

describe('a specification of walls, on the same model: red, green and ghost', () => {
  // WALL 1 passes, the other three walls fail, the wall types are not the walls' specification's business.
  const wallIds = idsText(specXml('Walls are named WALL 1', 'IFCWALL', 'minOccurs="1" maxOccurs="unbounded"', nameIs('WALL 1')));
  const wallOf = (name: string) => [...ifc.matchAll(new RegExp(`^#(\\d+)=IFCWALL\\('([^']+)',\\$,'${name}'`, 'gm'))].map((m) => ({ express: Number(m[1]), guid: m[2] }))[0];

  it('failing walls fail, the passing wall passes, the wall types are ghosted', async () => {
    const r = await runText(wallIds, ifc, { collect: true });
    const states = elementStates(r.keys!.failing[0].map((f) => f.globalId), r.keys!.applicable[0]);
    expect(stateOf(states, wallOf('WALL 1').guid)).toBe('pass');
    for (const n of ['WALL 2', 'WALL 3', 'WALL 4']) expect(stateOf(states, wallOf(n).guid)).toBe('fail');
    for (const g of wallTypes.values()) expect(stateOf(states, g)).toBe('other');
    const paint = colourOverrides(states, guidOf);
    expect(green(paint.get(wallOf('WALL 1').express)!)).toBe(true);
    for (const n of ['WALL 2', 'WALL 3', 'WALL 4']) expect(red(paint.get(wallOf(n).express)!)).toBe(true);
    for (const e of wallTypes.keys()) expect(ghost(paint.get(e)!)).toBe(true);
  });

  it('an element that is listed as failing is never also painted as passing', () => {
    const states = elementStates(['a'], ['a', 'b']);
    expect(stateOf(states, 'a')).toBe('fail');
    expect(stateOf(states, 'b')).toBe('pass');
  });

  it('the three colours cannot be mistaken for one another', () => {
    expect(red(STATE_COLOURS.fail)).toBe(true);
    expect(green(STATE_COLOURS.pass)).toBe(true);
    expect(ghost(STATE_COLOURS.other)).toBe(true);
  });
});

describe('selection', () => {
  it('GlobalIds to the express ids the renderer frames; an element without a shape is left out', () => {
    const [a, b] = [...walls];
    expect(expressIdsOf([a[1], b[1], 'has-no-shape', null], guidOf)).toEqual(new Set([a[0], b[0]]));
    expect(expressIdsOf([], guidOf).size).toBe(0);
  });

  it('a click in 3D is reported only for an element the page lists', () => {
    const [[express, guid], [other]] = [...walls];
    expect(listedGlobalId(express, guidOf, new Set([guid]))).toBe(guid);
    // Clicked, but the page does not list it: no row to highlight.
    expect(listedGlobalId(other, guidOf, new Set([guid]))).toBeNull();
    // Clicked on nothing, or on an element that has no GlobalId in the model.
    expect(listedGlobalId(null, guidOf, new Set([guid]))).toBeNull();
    expect(listedGlobalId(999999, guidOf, new Set([guid]))).toBeNull();
  });
});
