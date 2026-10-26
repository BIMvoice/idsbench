/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Two ways the 3D view could leave the reader with something that looks like a view and is not: a graphics device that
// was taken away (a blank canvas, said nowhere), and a failing element that is red in 3D but is not among the rows the
// page lists (a click that did nothing and said nothing).
import { describe, expect, it, vi } from 'vitest';
import { elementStates, pickOf } from '../src/core/states';
import { DEVICE_LOST, onDeviceLost } from '../src/ui/view3d/lost';

describe('a graphics device that is lost', () => {
  it('is said in a sentence when it goes while the view is open', async () => {
    let lose!: (i: { reason: string }) => void;
    const device = { lost: new Promise<{ reason: string }>((r) => { lose = r; }) };
    const say = vi.fn();
    onDeviceLost(device, () => false, say);
    lose({ reason: 'unknown' });
    await vi.waitFor(() => expect(say).toHaveBeenCalledWith(DEVICE_LOST));
    expect(DEVICE_LOST).toMatch(/list of failing elements/);
  });
  it('is not said when the view was closed first (the renderer destroys its own device then)', async () => {
    let lose!: (i: { reason: string }) => void;
    const device = { lost: new Promise<{ reason: string }>((r) => { lose = r; }) };
    const say = vi.fn();
    onDeviceLost(device, () => true, say);
    lose({ reason: 'destroyed' });
    await new Promise((r) => setTimeout(r, 10));
    expect(say).not.toHaveBeenCalled();
  });
  it('is not a failure of the page when there is no device to watch', () => {
    expect(() => onDeviceLost(null, () => false, () => {})).not.toThrow();
  });
});

describe('a click in 3D on an element', () => {
  const guidOf = new Map<number, string>([[1, 'A'], [2, 'B'], [3, 'C'], [4, 'D']]);
  // A and B fail, C passes, D is not covered. Only A is among the rows the page lists (the page lists the first 200).
  const states = elementStates(['A', 'B'], ['A', 'B', 'C']);
  const listed = new Set(['A']);
  it('a listed failing element is reported as listed', () => {
    expect(pickOf(1, guidOf, listed, states)).toEqual({ listed: 'A', unlisted: null });
  });
  it('a failing element beyond the listed rows is told apart from one that simply is not a failure', () => {
    expect(pickOf(2, guidOf, listed, states)).toEqual({ listed: null, unlisted: 'B' });
    expect(pickOf(3, guidOf, listed, states)).toEqual({ listed: null, unlisted: null });
    expect(pickOf(4, guidOf, listed, states)).toEqual({ listed: null, unlisted: null });
    expect(pickOf(null, guidOf, listed, states)).toEqual({ listed: null, unlisted: null });
  });
});
