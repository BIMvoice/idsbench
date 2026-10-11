import type { CheckResult, Finding } from './types.ts';
import { parseTree } from './xml.ts';
import { validateAgainstXsd, type SchemaVersion } from './xsd.ts';
import { runRules } from './rules.ts';

export type { CheckResult, Finding } from './types.ts';

const NS = 'http://standards.buildingsmart.org/IDS';
const LOCATIONS: Record<string, SchemaVersion> = {
  [`${NS} ${NS}/1.0/ids.xsd`]: '1.0',
  [`${NS} ${NS}/0.9.7/ids.xsd`]: '0.9.7',
};

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
    const out = await validateAgainstXsd(xml, '1.0');
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
  const version = LOCATIONS[location];
  if (!version) {
    findings.push({
      severity: 'error',
      code: 'ids-version-unsupported',
      message: location
        ? `The schema location '${location}' is not a supported IDS version; use xsi:schemaLocation="${NS} ${NS}/1.0/ids.xsd".`
        : `The <ids> element has no xsi:schemaLocation, so the IDS version is unknown; add xsi:schemaLocation="${NS} ${NS}/1.0/ids.xsd".`,
      line: root.line || undefined,
      column: root.column || undefined,
      path: 'ids',
    });
    return finish();
  }
  if (version === '0.9.7') {
    findings.push({
      severity: 'warning',
      code: 'ids-version-transitional',
      message: 'This file uses IDS 0.9.7, a transitional version; update it to IDS 1.0 before sharing it.',
      line: root.line || undefined,
      column: root.column || undefined,
      path: 'ids',
    });
  }

  const xsd = await validateAgainstXsd(xml, version, root);
  findings.push(...xsd.findings);
  if (xsd.notWellFormed) return finish(version);

  // The schema layer already reports a cardinality value outside the allowed set; do not say it twice.
  const xsdCardinality = new Set(xsd.findings.filter((f) => f.code === 'xsd-invalid-value' && f.message.includes("'cardinality'")).map((f) => f.line));
  findings.push(...(await runRules(root)).filter((f) => !(f.code === 'cardinality-invalid' && xsdCardinality.has(f.line))));
  return finish(version);
}
