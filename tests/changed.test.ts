import { describe, expect, it } from 'vitest';
import { changeLine, snapshotOf } from '../src/core/changed';

const snap = (state: 'pass' | 'fail' | 'nothing' | 'unchecked', failed = 0, verdict: 'pass' | 'fail' | 'incomplete' = 'pass') => ({ state, failed, verdict });

describe('what an edit did to a result, in one line', () => {
  it('says nothing when nothing changed', () => expect(changeLine(snap('pass'), snap('pass'), 0)).toBeNull());
  it('Now fails: 1 element', () => expect(changeLine(snap('pass'), snap('fail', 1, 'pass'), 1)).toBe('Now fails: 1 element'));
  it('adds the verdict when it changed', () => expect(changeLine(snap('pass', 0, 'pass'), snap('fail', 2, 'fail'), 2)).toBe('Now fails: 2 elements. The verdict is now Fail.'));
  it('Now passes', () => expect(changeLine(snap('fail', 3, 'fail'), snap('pass', 0, 'pass'), 0)).toBe('Now passes. The verdict is now Pass.'));
  it('still fails with another number', () => expect(changeLine(snap('fail', 3, 'fail'), snap('fail', 1, 'fail'), 1)).toBe('Still fails: 1 element (was 3)'));
  it('nothing to check, not checked', () => {
    expect(changeLine(snap('fail', 1, 'fail'), snap('nothing', 0, 'pass'), 0)).toBe('Now: nothing to check. The verdict is now Pass.');
    expect(changeLine(snap('pass'), snap('unchecked', 0, 'incomplete'), 0)).toBe('Now not checked. The verdict is now Incomplete.');
  });
  it('snapshotOf reads a row\'s own total', () => expect(snapshotOf({ state: 'fail', failures: [], failureTotal: 7 }, 'fail')).toEqual({ state: 'fail', failed: 7, verdict: 'fail' }));
});
