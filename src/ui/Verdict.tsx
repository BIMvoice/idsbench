/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReactNode } from 'react';

interface Props {
  /** Decides the colour and the mark. "waiting" is not a verdict: a dashed cell, for a check that has not finished. */
  state: 'pass' | 'fail' | 'incomplete' | 'waiting';
  /** The verdict in one or two words, for example "Pass". */
  word: string;
  /** The sentence that gives the counts. */
  children: ReactNode;
}

/**
 * The verdict of a check: one word in a stamped cell, and the sentence beside it.
 * Render it inside the live region so the word and the sentence are announced together.
 */
export function Verdict({ state, word, children }: Props) {
  return (
    <div className={`verdict ${state}`}>
      <p className="verdict-word">{word}</p>
      <p className={`headline ${state}`}>{children}</p>
    </div>
  );
}
