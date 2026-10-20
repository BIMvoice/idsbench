/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { CheckResult, Finding } from './types.ts';
import { parseTree } from './xml.ts';
import { validateAgainstXsd } from './xsd.ts';
import { runRules } from './rules.ts';
import { versionProblem } from './version.ts';

export type { CheckResult, Finding } from './types.ts';
export { ValidatorFailed } from './xsd.ts';

const NS = 'http://standards.buildingsmart.org/IDS';

export { declaredVersion, versionProblem, LOCATION_1_0 } from './version.ts';

/**
 * Checks an IDS file (as text) against the official IDS schema and the additional rules of the buildingSMART
 * IDS audit tool. Runs entirely in the browser or in Node; makes no network calls. Throws ValidatorFailed when the
 * schema validator could not finish (it ran out of memory, most often): there is then no verdict on the file.
 * `signal` stops the check: the validator's Worker is ended and the call rejects with the signal's reason.
 */
export async function checkIds(input: string, options: { signal?: AbortSignal } = {}): Promise<CheckResult> {
  const { signal } = options;
  const xml = input.replace(/^\uFEFF/, ''); // a byte-order mark is allowed and ignored
  const findings: Finding[] = [];
  const finish = (idsVersion?: string): CheckResult => {
    findings.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0));
    return { valid: !findings.some((f) => f.severity === 'error'), idsVersion, findings };
  };

  const parsed = parseTree(xml);
  if (!parsed.root) {
    // Let libxml2 describe the parse problem (it reports line and column precisely).
    const out = await validateAgainstXsd(xml, undefined, { signal });
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
  const problem = versionProblem(location);
  if (problem) {
    findings.push({ severity: 'error', code: 'ids-version-unsupported', message: problem.message, ...where });
    return finish(problem.named);
  }
  const version = '1.0';

  const xsd = await validateAgainstXsd(xml, root, { signal });
  signal?.throwIfAborted();
  findings.push(...xsd.findings);
  if (xsd.notWellFormed) return finish(version);

  // The schema layer already reports a cardinality value outside the allowed set; do not say it twice.
  const xsdCardinality = new Set(xsd.findings.filter((f) => f.code === 'xsd-invalid-value' && f.message.includes("'cardinality'")).map((f) => f.line));
  findings.push(...(await runRules(root)).filter((f) => !(f.code === 'cardinality-invalid' && xsdCardinality.has(f.line))));
  return finish(version);
}
