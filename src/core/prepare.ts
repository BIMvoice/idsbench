/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { IDSDocument } from '@ifc-lite/ids';
import { AppError } from './errors';
import { checkText } from './checkview';
import { precheckIdsText } from './idsfile';
import { readIds } from './validate';

const plural = (n: number) => `${n} ${n === 1 ? 'problem' : 'problems'}`;

export const refusal = (problems: number) =>
  `This IDS file has ${plural(problems)}, so the result could not be trusted.`;

/** An IDS file the Check engine found problems in. Carries the count the page shows. */
export class IdsInvalid extends AppError {
  readonly problems: number;
  constructor(problems: number) {
    super('ids-invalid', refusal(problems));
    this.problems = problems;
  }
}

/**
 * The one way Run opens an IDS file: the Check engine decides first, and only a file it accepts is read.
 * Whatever versions, structure or content the engine rejects, Run does not run.
 * Returns the parsed document and the number of warnings the engine raised (the file is still used).
 */
export async function prepareIds(xml: string): Promise<{ doc: IDSDocument; warnings: number }> {
  precheckIdsText(xml);
  const view = await checkText(xml);
  if (view.kind === 'sentence') throw new AppError('ids-unusable', view.text);
  if (view.errors > 0) throw new IdsInvalid(view.errors);
  return { doc: readIds(xml), warnings: view.warnings };
}
