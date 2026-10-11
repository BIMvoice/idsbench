import { AppError } from './errors';

const SWAPPED = 'Put the IDS file in the IDS box and the model in the IFC box.';

export interface IfcHeader {
  /** The IFC version exactly as the file names it, for example "IFC4X3_ADD2". */
  schema: string;
}

/** IFC2X3, IFC4 and IFC4X3 are the versions IDS covers. Editions of IFC4X3 count as IFC4X3. */
export function schemaFamily(v: string): string {
  const u = v.trim().toUpperCase();
  if (u.startsWith('IFC4X3')) return 'IFC4X3';
  if (u.startsWith('IFC2X3')) return 'IFC2X3';
  return u;
}

const SUPPORTED = new Set(['IFC2X3', 'IFC4', 'IFC4X3']);

function latin1(bytes: ArrayBuffer, from: number, to: number): string {
  return new TextDecoder('latin1').decode(new Uint8Array(bytes, from, Math.max(0, to - from)));
}

/**
 * Look at the file before it is handed to the parser, which reads what it can
 * from anything and reports "IFC4" when it cannot tell. A model that is cut
 * off, zipped, in another format or of an unsupported IFC version must stop
 * here with a sentence, not go on to a verdict.
 */
export function inspectIfc(bytes: ArrayBuffer): IfcHeader {
  if (bytes.byteLength === 0) {
    throw new AppError('ifc-empty', 'The IFC file is empty (0 bytes). Export the model again and choose the new file.');
  }
  const head = latin1(bytes, 0, Math.min(bytes.byteLength, 65536)).replace(/^ï»¿/, '').replace(/^\s+/, '');
  if (head.startsWith('PK')) {
    throw new AppError('ifc-is-zip', 'This file is zipped (an .ifczip or .zip file). Unzip it and choose the .ifc file inside.');
  }
  if (head.startsWith('<')) {
    if (/<(?:[\w.-]+:)?ids[\s>]/.test(head)) {
      throw new AppError('ifc-is-ids', `This is an IDS file, not an IFC model. ${SWAPPED}`);
    }
    throw new AppError('ifc-is-xml', 'This file is in an XML format (for example ifcXML). idsbench reads IFC models saved as .ifc only. Export the model as .ifc and choose that file.');
  }
  if (!head.startsWith('ISO-10303-21')) {
    throw new AppError('ifc-not-step', 'This file is not an IFC model that idsbench can read. Choose a model saved as .ifc. IFCX, ifcXML and zipped files are not read.');
  }
  const tail = latin1(bytes, Math.max(0, bytes.byteLength - 4096), bytes.byteLength);
  if (!/END-ISO-10303-21\s*;/.test(tail)) {
    throw new AppError('ifc-cut-off', 'The IFC file is cut off: its closing line is missing, so part of the model is not there. A result for half a model would be wrong. Export or copy the file again.');
  }
  const headerEnd = head.search(/\bENDSEC\s*;/);
  const header = (headerEnd === -1 ? head : head.slice(0, headerEnd)).replace(/\/\*[\s\S]*?\*\//g, '');
  const m = /FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/i.exec(header);
  const schema = m?.[1].trim() ?? '';
  if (!schema) {
    throw new AppError('ifc-schema', 'The IFC file does not say which IFC version it uses, so it cannot be checked. Export it again from the modelling software.');
  }
  if (!SUPPORTED.has(schemaFamily(schema))) {
    throw new AppError('ifc-schema', `This model is ${schema}. IDS covers IFC2X3, IFC4 and IFC4X3 only, so this model cannot be checked. Export it as one of those versions.`);
  }
  return { schema };
}
