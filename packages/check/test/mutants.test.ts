// Optional: compares checkIds with the official tool on altered copies of the valid corpus files.
//   node scripts/make-mutants.mjs /tmp/mutants
//   DOTNET_ROLL_FORWARD=Major node scripts/run-reference.mjs <ids-tool> /tmp/mutants-ref.json /tmp/mutants
//   MUTANT_DIR=/tmp/mutants MUTANT_REF=/tmp/mutants-ref.json npx vitest run test/mutants.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkIds } from '../src/index.ts';

const dir = process.env.MUTANT_DIR;
const refFile = process.env.MUTANT_REF;

describe.skipIf(!dir || !refFile)('mutants against the official tool', () => {
  it('agrees on every mutant', async () => {
    const ref = JSON.parse(readFileSync(refFile!, 'utf8')).results as { file: string; verdict: string; messages: { code: string | null; level: string }[] }[];
    const manifest = JSON.parse(readFileSync(join(dir!, 'manifest.json'), 'utf8')) as { file: string; source: string; mutation: string }[];
    const bad: string[] = [];
    let invalid = 0;
    for (const r of ref) {
      const res = await checkIds(readFileSync(join(dir!, r.file), 'utf8'));
      const ours = res.valid ? 'valid' : 'invalid';
      if (r.verdict === 'invalid') invalid++;
      if (ours !== r.verdict) {
        const m = manifest.find((x) => x.file === r.file)!;
        bad.push(`${r.file} (${m.mutation} of ${m.source}): reference ${r.verdict} [${r.messages.map((x) => x.code).join(',')}], ours ${ours} [${res.findings.filter((f) => f.severity === 'error').map((f) => f.code).join(',')}]`);
      }
    }
    console.log(`mutants=${ref.length} reference-invalid=${invalid} agree=${ref.length - bad.length} disagree=${bad.length}\n${bad.join('\n')}`);
    expect(bad).toEqual([]);
  });
});
