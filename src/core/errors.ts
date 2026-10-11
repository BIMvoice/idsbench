import type { AppErrorInfo, ErrorKind } from './types';

/** An error whose message is already fit to show to a person. */
export class AppError extends Error {
  readonly kind: ErrorKind;
  constructor(kind: ErrorKind, message: string) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
  }
}

export type Stage = 'ids' | 'ifc' | 'validate';

const NOT_XML =
  'This file could not be read as an IDS file. It is damaged or cut off, or it is not an IDS file at all. Check that you chose the right file, or export it again.';
const IDS_REJECTED =
  'This file could not be used as an IDS file. It may be a different kind of file, or an IDS file with parts missing. Check that you chose the right file, or export it again.';
const IFC_UNREADABLE =
  'The IFC model could not be read. The file may be damaged. Export it again from the modelling software and try once more.';
export const UNEXPECTED =
  'Something went wrong and the check did not finish, so there is no result. Try again. If it happens again with the same files, idsbench cannot check them yet.';

/** The reader holds every distinct name and identifier of the model in one table that a browser limits to about 16 million entries. */
export const TOO_MANY_DISTINCT =
  'This model has more distinct names and identifiers than a browser can hold at once, so it could not be read and no result was made. Split the model by building or discipline in the modelling software, or export only what the IDS file needs, and choose that file.';
export const OUT_OF_MEMORY =
  'The model is too large to check here: the browser ran out of memory. Close other tabs and programs and try again, or use a computer with more memory.';
export const FILE_UNREADABLE =
  'One of the files could not be opened from your computer. It may have been moved, renamed or deleted, or it may be too large. Choose it again.';

/** The model's bytes could not be had from the file that was chosen: what a browser does when the file changed or went away after it was chosen. */
export const MODEL_UNREADABLE =
  'The model could not be read from your computer. It was moved, renamed, deleted or saved again after it was chosen here, so no result was made. Choose it again.';

/** True for what a browser says when an allocation fails. */
export const isMemoryError = (err: unknown): boolean => MEMORY.test(err instanceof Error ? `${err.name} ${err.message}` : String(err));

/** Word patterns the XML parser uses for a document that is not XML at all. */
const XML_BROKEN = /(missing root|not well|unclosed|unexpected end|xml.*(error|fatal)|fatal.?error|invalid character|not valid xml|doctype|premature)/i;

/** What browsers say when an allocation fails. */
const MEMORY = /(out of memory|allocation failed|invalid (array|string|typed array) length|array buffer allocation|memory access out of bounds)/i;

/**
 * Turn anything thrown into a plain-language message. Never includes a stack
 * trace; the caller logs the original error to the console.
 */
export function mapError(err: unknown, stage: Stage): AppErrorInfo {
  if (err instanceof AppError) return { kind: err.kind, message: err.message };
  const text = err instanceof Error ? `${err.name} ${err.message} ${(err as { details?: string }).details ?? ''}` : String(err);
  if (stage === 'ids') {
    return XML_BROKEN.test(text)
      ? { kind: 'ids-not-xml', message: NOT_XML }
      : { kind: 'ids-rejected', message: IDS_REJECTED };
  }
  if (/maximum size exceeded/i.test(text)) return { kind: 'ifc-too-large', message: TOO_MANY_DISTINCT };
  if (MEMORY.test(text)) return { kind: 'out-of-memory', message: OUT_OF_MEMORY };
  if (stage === 'ifc') return { kind: 'ifc-unreadable', message: IFC_UNREADABLE };
  return { kind: 'unexpected', message: UNEXPECTED };
}
