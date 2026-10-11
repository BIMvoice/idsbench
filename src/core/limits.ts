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
 * report at most 8, and nothing at all in some). On 8 GiB or more: 9.3 million entities, below the 10 million that were measured to
 * work and the 12 million that ended the tab (780 MB and 940 MB models of walls). On a computer that reports less, proportionally fewer.
 */
export function maxEntities(deviceMemoryGiB = 8): number {
  const gib = Math.min(8, Math.max(0.25, deviceMemoryGiB));
  return Math.floor((gib * 1024 ** 3 * MEMORY_SHARE) / BYTES_PER_ENTITY);
}

/** From this size on the page says that the model is large. */
export const LARGE_MODEL_BYTES = 100 * 1024 * 1024;

export const TOO_BIG_FILE = (size: number) =>
  `This model is ${formatSize(size)}. A browser tab cannot hold a model of that size, so it was not opened and no result was made. Split the model by building or discipline in the modelling software, or export only what the IDS file needs, and choose that file.`;

export const TOO_MANY_ENTITIES = (entities: number, limit: number) =>
  `This model has about ${(Math.round(entities / 100_000) / 10).toLocaleString('en')} million entities. This computer can hold about ${(Math.round(limit / 100_000) / 10).toLocaleString('en')} million in a browser tab, so the model was not read and no result was made. Split the model by building or discipline in the modelling software, or export only what the IDS file needs, and choose that file.`;

/** Refuse a file by its size, before any of it is read. */
export function checkSize(size: number): void {
  if (size > MAX_MODEL_BYTES) throw new AppError('ifc-too-large', TOO_BIG_FILE(size));
}

/**
 * About how many entities a STEP file holds, from the entity lines in its first and last megabyte (the file's lines
 * are of much the same kind throughout, and counting them all would need reading the whole file). Exact for files
 * of 2 MB or less.
 */
export function estimateEntities(bytes: ArrayBuffer): number {
  const MB = 1024 * 1024;
  const decode = (from: number, to: number) => new TextDecoder('latin1').decode(new Uint8Array(bytes, from, to - from));
  const count = (text: string) => { let n = 0; for (let i = text.indexOf('\n#'); i !== -1; i = text.indexOf('\n#', i + 2)) n++; return n; };
  const total = bytes.byteLength;
  if (total <= 2 * MB) return count(decode(0, total));
  // Lines of one entity per line are the norm; a file written on one line is counted by its "#n=" instead.
  const sample = (from: number) => { const t = decode(from, from + MB); return Math.max(count(t), (t.match(/#\d+\s*=/g) ?? []).length); };
  const perMb = (sample(0) + sample(total - MB)) / 2;
  return Math.round((perMb * total) / MB);
}

/** Refuse a model by its estimated number of entities, before it is parsed. */
export function checkEntities(bytes: ArrayBuffer, deviceMemoryGiB?: number): void {
  const n = estimateEntities(bytes), limit = maxEntities(deviceMemoryGiB);
  if (n > limit) throw new AppError('ifc-too-large', TOO_MANY_ENTITIES(n, limit));
}
