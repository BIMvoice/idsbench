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
  'The IDS file is not valid XML, so it could not be read. Check that you chose an .ids file and that it is not cut off.';
const IDS_REJECTED =
  'The IDS file was read as XML but is not a usable IDS. It may be missing required parts, or use a structure IDS does not allow.';
const IFC_UNREADABLE =
  'The IFC model could not be read. Only IFC files in the STEP format (.ifc) are supported, and the file must not be empty or cut off.';
const UNEXPECTED =
  'Something went wrong while checking. The details are in the browser console.';

/** Word patterns the XML parser uses for a document that is not XML at all. */
const XML_BROKEN = /(missing root|not well|unclosed|unexpected end|xml.*(error|fatal)|fatal.?error|invalid character|not valid xml|doctype|premature)/i;

/**
 * Turn anything thrown into a plain-language message. Never includes a stack
 * trace; the caller logs the original error to the console.
 */
export function mapError(err: unknown, stage: Stage): AppErrorInfo {
  if (err instanceof AppError) return { kind: err.kind, message: err.message };
  const text = err instanceof Error ? `${err.message} ${(err as { details?: string }).details ?? ''}` : String(err);
  if (stage === 'ids') {
    return XML_BROKEN.test(text)
      ? { kind: 'ids-not-xml', message: NOT_XML }
      : { kind: 'ids-rejected', message: IDS_REJECTED };
  }
  if (stage === 'ifc') return { kind: 'ifc-unreadable', message: IFC_UNREADABLE };
  return { kind: 'unexpected', message: UNEXPECTED };
}
