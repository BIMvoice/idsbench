/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// What an edit did to the result of the specification that was edited, in one line, so that a person who closes a form
// does not have to find the changed row among the others.
import { failureTotalOf } from './csv';
import type { SpecRow, SpecState, Verdict } from './types';
import { plural } from './shape';

export interface Snapshot { state: SpecState; failed: number; verdict: Verdict }

export const snapshotOf = (row: Pick<SpecRow, 'state' | 'failures' | 'failureTotal'>, verdict: Verdict): Snapshot => ({ state: row.state, failed: failureTotalOf(row), verdict });

const WORD: Record<Verdict, string> = { pass: 'Pass', fail: 'Fail', incomplete: 'Incomplete' };

/**
 * The line to show when the specification's state, its number of failing elements or the verdict is not what it was
 * before the edit; null when nothing the person looks at changed.
 */
export function changeLine(before: Snapshot, after: Snapshot, failedNow: number): string | null {
  if (before.state === after.state && before.failed === after.failed && before.verdict === after.verdict) return null;
  let what: string;
  if (after.state === 'fail') {
    what = failedNow > 0 ? `${before.state === 'fail' ? 'Still fails' : 'Now fails'}: ${plural(failedNow, 'element')}` : `${before.state === 'fail' ? 'Still fails' : 'Now fails'}`;
  } else if (after.state === 'pass') what = 'Now passes';
  else if (after.state === 'nothing') what = 'Now: nothing to check';
  else what = 'Now not checked';
  if (before.state === after.state && after.state === 'fail' && before.failed !== failedNow) what += ` (was ${before.failed.toLocaleString('en')})`;
  return before.verdict !== after.verdict ? `${what}. The verdict is now ${WORD[after.verdict]}.` : what;
}
