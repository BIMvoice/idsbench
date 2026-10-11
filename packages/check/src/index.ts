import type { CheckResult, Finding } from './types.ts';
import { parseTree } from './xml.ts';
import { validateAgainstXsd } from './xsd.ts';
import { runRules } from './rules.ts';

export type { CheckResult, Finding } from './types.ts';

const NS = 'http://standards.buildingsmart.org/IDS';
/** The only schema location idsbench accepts. */
const LOCATION_1_0 = `${NS} ${NS}/1.0/ids.xsd`;

/** The IDS version a schema location names, for example `0.9.7` or `1.1`; undefined when it names none. */
export function declaredVersion(location: string): string | undefined {
  const dir = /\/IDS\/(\d+(?:\.\d+)*)\/ids\.xsd/i.exec(location);
  if (dir) return dir[1];
  const file = /ids_(\d)(\d)(\d)?\.xsd/i.exec(location); // old drafts: ids_09.xsd
  return file ? [file[1], file[2], file[3]].filter(Boolean).join('.') : undefined;
}

/** True when `a` is a later version than `b` (numeric, part by part). */
function isLater(a: string, b: string): boolean {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/**
 * Checks an IDS file (as text) against the official IDS schema and the additional rules of the buildingSMART
 * IDS audit tool. Runs entirely in the browser or in Node; makes no network calls.
 */
export async function checkIds(input: string): Promise<CheckResult> {
  const xml = input.replace(/^\uFEFF/, ''); // a byte-order mark is allowed and ignored
  const findings: Finding[] = [];
  const finish = (idsVersion?: string): CheckResult => {
    findings.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0));
    return { valid: !findings.some((f) => f.severity === 'error'), idsVersion, findings };
  };

  const parsed = parseTree(xml);
  if (!parsed.root) {
    // Let libxml2 describe the parse problem (it reports line and column precisely).
    const out = await validateAgainstXsd(xml);
    const wf = out.findings.filter((f) => f.code === 'xml-not-well-formed');
    findings.push(
      ...(wf.length ? wf : [{ severity: 'error' as const, code: 'xml-not-well-formed', message: `The file is not well-formed XML: ${parsed.error ?? 'no content'}.` }]),
    );
    return finish();
  }
  const root = parsed.root;
  if (root.name !== 'ids') {
    findings.push({
      severity: 'error',
      code: 'not-an-ids-file',
      message: `The root element is <${root.name}>, but an IDS file must start with <ids xmlns="${NS}">.`,
      line: root.line || undefined,
      column: root.column || undefined,
    });
    return finish();
  }
  const location = root.attrs['schemaLocation'] ?? '';
  const where = { line: root.line || undefined, column: root.column || undefined, path: 'ids' };
  if (location !== LOCATION_1_0) {
    const named = declaredVersion(location);
    let message: string;
    if (named && named !== '1.0') {
      message = `This file is IDS ${named}. idsbench works with IDS 1.0 only. ${
        isLater(named, '1.0') ? 'Save the file as IDS 1.0' : 'Update the file to version 1.0'
      } and check it again.`;
    } else if (location) {
      message = `The schema location '${location}' is not the IDS 1.0 location; use xsi:schemaLocation="${LOCATION_1_0}".`;
    } else {
      message = `The <ids> element has no xsi:schemaLocation, so the IDS version is unknown; add xsi:schemaLocation="${LOCATION_1_0}".`;
    }
    findings.push({ severity: 'error', code: 'ids-version-unsupported', message, ...where });
    return finish(named);
  }
  const version = '1.0';

  const xsd = await validateAgainstXsd(xml, root);
  findings.push(...xsd.findings);
  if (xsd.notWellFormed) return finish(version);

  // The schema layer already reports a cardinality value outside the allowed set; do not say it twice.
  const xsdCardinality = new Set(xsd.findings.filter((f) => f.code === 'xsd-invalid-value' && f.message.includes("'cardinality'")).map((f) => f.line));
  findings.push(...(await runRules(root)).filter((f) => !(f.code === 'cardinality-invalid' && xsdCardinality.has(f.line))));
  return finish(version);
}
