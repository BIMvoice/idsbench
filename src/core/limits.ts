/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// What a browser tab can hold, as far as it can be known before it runs out. The numbers come from measuring the page
// on a model of many walls (scripts/make-large-model.mjs, scripts/measure-browser.mjs): the parsed model takes a fixed
// amount of memory per entity, and a tab that runs out of memory is ended by the browser without a word, so the
// check has to be made before the model is read, not after.
import { AppError } from './errors';
import { formatSize } from './format';

/** A model larger than this is not read at all: a browser cannot hold a file of this size in one piece, and its parsed form needs several times its size again. */
export const MAX_MODEL_BYTES = 1024 * 1024 * 1024;
/**
 * What the parsed model takes in memory per entity, measured (scripts/measure-browser.mjs, a model of walls: about 540
 * bytes an entity in the whole browser, with the checking itself). Rounded up.
 */
export const BYTES_PER_ENTITY = 600;
/** What share of the memory a browser reports for the computer one tab may be expected to use. */
export const MEMORY_SHARE = 0.65;
/**
 * The most entities a model may have for a tab to hold it, for a computer that reports `deviceMemoryGiB` (browsers
 * report at most 8, and nothing at all in some: those are held to the same limit as 8, because it is the tab that gives
 * out, not the computer). On 8 GiB or more: 9.3 million, below the 10 million that were measured to work and the 12
 * million that ended the tab (780 MB and 940 MB models of walls and other elements, on a computer with 26 GB). On a
 * computer that reports less, proportionally fewer. The limit is in entities of the costly kind (see EntityCount.named);
 * the others are weighed down before they are held against it (weighedEntities).
 */
export function maxEntities(deviceMemoryGiB = 8): number {
  const gib = Math.min(8, Math.max(0.25, deviceMemoryGiB));
  return Math.floor((gib * 1024 ** 3 * MEMORY_SHARE) / BYTES_PER_ENTITY);
}

/** From this size on the page says that the model is large. */
export const LARGE_MODEL_BYTES = 100 * 1024 * 1024;

export const TOO_BIG_FILE = (size: number) =>
  `This model is ${formatSize(size)}. A browser tab cannot hold a model of that size, so it was not opened and no result was made. Split the model by building or discipline in the modelling software, or export only what the IDS file needs, and choose that file.`;

/** How many entities a model holds, and how many of them are of the kind that costs the most memory. */
export interface EntityCount {
  /** Every entity of the file: every record that starts with "#". */
  all: number;
  /**
   * Those whose first value is a text: every element, relationship, property set and type (their first value is the
   * GlobalId), and the properties, materials and the like that start with a name. The parsed model holds a name and an
   * identifier for each of these; the others (points, loops, placements: most of a real model) are held as an index only.
   */
  named: number;
}

/**
 * What an entity that is not `named` takes, as a share of one that is. Measured in the page (headless Chromium, 4
 * million entities, peak memory above the empty page with the file's own bytes taken off): walls 860 bytes an entity,
 * points 250, a mix of one named entity in ten 270. Rounded up to a third.
 */
export const LIGHT_SHARE = 1 / 3;

/** The count that is held against maxEntities: the named entities, and a third of the others. */
export const weighedEntities = (c: EntityCount): number => c.named + Math.ceil((c.all - c.named) * LIGHT_SHARE);

const millions = (n: number) => (Math.round(n / 100_000) / 10).toLocaleString('en');

/**
 * The refusal. It says what was counted (the entities of the file, exactly) and where the limit comes from: the memory
 * the browser reports for the computer (`reportedGiB`: at most 8 whatever the computer has, and nothing at all in
 * Firefox and Safari) and what a tab was measured to hold. Nothing was measured on the reader's own computer, and the
 * sentence does not say so.
 */
export const TOO_MANY_ENTITIES = (count: EntityCount, limit: number, reportedGiB: number | undefined) => {
  const kind = 'entities that have a name or an identifier of their own';
  const has = `This model has ${count.all.toLocaleString('en')} entities${count.named < count.all ? `, ${count.named.toLocaleString('en')} of them with a name or an identifier of their own (the others, mostly geometry, count for a third)` : ''}.`;
  const basis = reportedGiB === undefined || !Number.isFinite(reportedGiB)
    ? `This browser does not say how much memory the computer has, so the limit is the most a browser tab was measured to hold: about ${millions(limit)} million ${kind}.`
    : reportedGiB >= 8
      ? `This browser reports 8 GB of memory or more for this computer, and a browser tab was measured to hold about ${millions(limit)} million ${kind}.`
      : `This browser reports ${reportedGiB} GB of memory for this computer; by what was measured on a larger one, a browser tab then holds about ${millions(limit)} million ${kind}.`;
  return `${has} ${basis} So the model was not read and no result was made. Split the model by building or discipline in the modelling software, or export only what the IDS file needs, and choose that file.`;
};

/** Refuse a file by its size, before any of it is read. */
export function checkSize(size: number): void {
  if (size > MAX_MODEL_BYTES) throw new AppError('ifc-too-large', TOO_BIG_FILE(size));
}

const QUOTE = 0x27, HASH = 0x23, SEMI = 0x3b, OPEN = 0x28, SLASH = 0x2f, STAR = 0x2a;
const isSpace = (b: number) => b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09;

/**
 * The entities of a STEP file, counted: every record that starts with "#" where a record may start (at the start of
 * the data, or after the ";" that ends the record before it), whatever the line breaks are, and never a "#" or a ";"
 * inside a text or a comment. One pass over the bytes, which are in memory already; about a second for a gigabyte.
 * `onTick` is called every 16 MB, so that whoever waits knows the count is going on.
 */
export function countEntities(bytes: ArrayBuffer, onTick?: () => void): EntityCount {
  const u = new Uint8Array(bytes);
  const n = u.length;
  let all = 0, named = 0;
  let inText = false, atStart = true;
  // 0: not looking; 1: in a record, before its "("; 2: just after the "(": the next byte that is not a space decides.
  let first = 0;
  for (let i = 0; i < n; i++) {
    if (onTick && (i & 0xffffff) === 0xffffff) onTick();
    const b = u[i];
    if (inText) { if (b === QUOTE) inText = false; continue; }
    if (b === QUOTE) { inText = true; if (first === 2) named++; first = 0; atStart = false; continue; }
    if (isSpace(b)) continue;
    if (b === SLASH && u[i + 1] === STAR) {
      i += 2;
      while (i < n && !(u[i] === STAR && u[i + 1] === SLASH)) i++;
      i++;
      continue;
    }
    if (b === SEMI) { atStart = true; first = 0; continue; }
    if (first === 2) first = 0;
    else if (first === 1 && b === OPEN) first = 2;
    if (atStart) { if (b === HASH) { all++; first = 1; } atStart = false; }
  }
  return { all, named };
}

/**
 * The refusal of the earlier delivery of a comparison when it fits a tab alone but not beside the model the tab already
 * holds. `weight` and `held` are weighed counts (see weighedEntities). The model's own result is not affected by it.
 */
export const PAIR_TOO_LARGE = (weight: number, held: number, limit: number) =>
  `This model and the earlier delivery together have ${(weight + held).toLocaleString('en')} entities, counted as for one model (geometry for a third), and a browser tab holds about ${limit.toLocaleString('en')}: each fits alone, but not both at once, and a comparison needs both. The earlier delivery was not read, so there is no comparison; the result of this model is not affected. To compare them, export the two models in smaller parts, split the same way (by building or discipline), and compare part with part.`;

/**
 * Refuse a model by the number of its entities, before it is parsed, and return its weighed count. `held` is the
 * weighed count of a model the tab already holds beside it (the other model of a comparison): the two are held
 * against one budget. `limit` stands in for the budget of this browser (tests lower it).
 */
export function checkEntities(bytes: ArrayBuffer, deviceMemoryGiB?: number, onTick?: () => void, held?: number, limit = maxEntities(deviceMemoryGiB)): number {
  const count = countEntities(bytes, onTick), weight = weighedEntities(count);
  if (weight > limit) throw new AppError('ifc-too-large', TOO_MANY_ENTITIES(count, limit, deviceMemoryGiB));
  if (held !== undefined && weight + held > limit) throw new AppError('ifc-too-large', PAIR_TOO_LARGE(weight, held, limit));
  return weight;
}
