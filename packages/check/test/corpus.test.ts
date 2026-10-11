import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkIds } from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(here, 'fixtures', 'corpus');
const reference = JSON.parse(readFileSync(join(here, 'fixtures', 'reference', 'reference.json'), 'utf8')).results as {
  file: string;
  verdict: 'valid' | 'invalid';
  messages: { level: string; code: string | null; text: string }[];
}[];

/** Our rule codes mapped to the error numbers of the official tool (see README). */
const TOOL_CODE: Record<string, string> = {
  'xml-not-well-formed': 'fatal', 'not-an-ids-file': 'fatal', 'ids-version-unsupported': 'fatal', 'restriction-facet-not-for-text': '302',
  'ifc-version-invalid': '107', 'applicability-missing': '101', 'applicability-empty': '101',
  'requirements-not-allowed': '204', 'requirements-needed': '204', 'cardinality-invalid': '301',
  'cardinality-needs-value': '202', 'cardinality-conflicts-datatype': '202', 'value-missing': '102',
  'classification-system-empty': '106', 'value-empty': '106', 'entity-unknown-class': '103',
  'entity-unknown-predefined-type': '103', 'attribute-unknown': '103', 'attribute-value-type-mismatch': '303',
  'value-invalid-for-type': '305', 'property-unknown-in-standard-set': '103', 'property-value-not-allowed': '103',
  'property-datatype-invalid': '103', 'property-reserved-prefix': '401', 'value-needs-datatype': '203',
  'property-value-type-mismatch': '303', 'partof-relation-invalid': '103', 'partof-entity-incompatible': '201',
  'conditions-impossible': '201', 'applicability-requirements-incompatible': '201', 'restriction-empty': '304',
  'restriction-base-invalid': '303', 'restriction-facet-invalid': '308', 'pattern-invalid': '109',
};
const toolCode = (c: string) => (c.startsWith('xsd-') ? '306' : TOOL_CODE[c] ?? c);

describe('corpus against the official tool', () => {
  it('agrees on every file', async () => {
    const rows: { file: string; reference: string; ours: string; refCodes: string[]; ourCodes: string[]; ourMessages: string[] }[] = [];
    for (const r of reference) {
      const res = await checkIds(readFileSync(join(corpus, r.file), 'utf8'));
      const errors = res.findings.filter((f) => f.severity === 'error');
      rows.push({
        file: r.file,
        reference: r.verdict,
        ours: res.valid ? 'valid' : 'invalid',
        // the tool's "crit" (not an IDS stream) and 502 (XML exception) are its fatal reports; an invalid file with no
        // message at all (an empty file) is fatal too
        refCodes: (() => {
          const codes = [...new Set(r.messages.filter((m) => m.level !== 'warn').map((m) => (m.level === 'crit' || m.code === '502' ? 'fatal' : m.code ?? m.level)))].sort();
          return codes.length === 0 && r.verdict === 'invalid' ? ['fatal'] : codes;
        })(),
        ourCodes: [...new Set(errors.map((f) => toolCode(f.code)))].sort(),
        ourMessages: errors.map((f) => `${f.line ?? '?'}: ${f.message}`),
      });
    }
    if (process.env.COMPARE_OUT) writeFileSync(process.env.COMPARE_OUT, JSON.stringify(rows, null, 1));
    // idsbench accepts IDS 1.0 only (by design the official tool also accepts 0.9.7, with a warning). A file that
    // declares anything else must be invalid for the version reason alone; every other file must agree exactly.
    const declares = (file: string) => /xsi:schemaLocation="[^"]*\/IDS\/([0-9.]+)\/ids\.xsd"/.exec(readFileSync(join(corpus, file), 'utf8'))?.[1];
    const other = rows.filter((x) => declares(x.file) !== undefined && declares(x.file) !== '1.0');
    for (const x of other) {
      expect(x.ours, x.file).toBe('invalid');
      expect(x.ourCodes, x.file).toEqual(['fatal']);
      expect(x.ourMessages[0], x.file).toContain(`This file is IDS ${declares(x.file)}`);
    }
    console.log(`files declaring a version other than 1.0: ${other.length} (${other.map((x) => `${x.file}: reference ${x.reference}`).join('; ')})`);
    expect(other.length).toBe(1);
    const rest = rows.filter((x) => !other.includes(x));
    console.log(`IDS 1.0 files (and files naming no version): ${rest.length}, same verdict as the official tool: ${rest.filter((x) => x.reference === x.ours).length}`);
    rows.splice(0, rows.length, ...rest);
    const disagree = rows.filter((x) => x.reference !== x.ours).map((x) => `${x.file}: reference ${x.reference}, ours ${x.ours}`);
    const invalid = rows.filter((x) => x.reference === 'invalid');
    const sameCodes = invalid.filter((x) => x.refCodes.join() === x.ourCodes.join());
    console.log(`files=${rows.length} verdict-agree=${rows.length - disagree.length} disagree=${disagree.length} identical-error-code-set=${sameCodes.length}/${invalid.length}`);
    expect(rows.length + other.length).toBe(426);
    expect(disagree).toEqual([]);
    const differing = invalid.filter((x) => x.refCodes.join() !== x.ourCodes.join()).map((x) => `${x.file}: reference [${x.refCodes}] ours [${x.ourCodes}]`);
    console.log(differing.join('\n'));
    expect(differing).toEqual([]);
  });
});
