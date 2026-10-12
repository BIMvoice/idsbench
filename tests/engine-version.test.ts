// The guard in core/foldguard.ts exists for @ifc-lite/ids 3.2.0 and goes with it. This fails, with the instructions,
// the day a fixed engine version is installed while the guard is still in the code.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FIXED = [3, 3, 0];

function installedVersion(pkg: string): string {
  const require = createRequire(import.meta.url);
  let dir = dirname(require.resolve(pkg));
  while (!existsSync(join(dir, 'package.json')) || JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name !== pkg) {
    const up = dirname(dir);
    if (up === dir) throw new Error(`${pkg} has no package.json above its entry file`);
    dir = up;
  }
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
}

const atLeast = (v: string, min: number[]): boolean => {
  const parts = v.split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((parts[i] ?? 0) !== min[i]) return (parts[i] ?? 0) > min[i];
  return true;
};

describe('the fold guard and the engine version', () => {
  it('the guard is still needed: @ifc-lite/ids is older than the version that fixed the fold (3.3.0)', () => {
    const v = installedVersion('@ifc-lite/ids');
    expect(
      atLeast(v, FIXED),
      `@ifc-lite/ids ${v} is installed, and the fold of ten classes onto their parent is fixed from 3.3.0. ` +
      'Remove the guard: delete src/core/foldguard.ts and its use in src/core/validate.ts (declaring, the four-way split of the run), ' +
      'SpecRow.withheld, ShapeOptions.withheld and the withheld row in core/shape.ts and core/csv.ts, tests/exact-class-guard.test.ts ' +
      'and this test, the REPORTED_AS table and its evidence test in tests/subtype-union.test.ts, the README paragraph about the guard and scripts/fold-vs-ifctester; ' +
      'then check that the 307 official pairs and every test keep their verdicts.',
    ).toBe(false);
  });

  it('the version comparison reads 3.2.0 as older and 3.3.0, 3.10.0 and 4.0.0 as fixed', () => {
    expect(atLeast('3.2.0', FIXED)).toBe(false);
    expect(atLeast('3.2.9', FIXED)).toBe(false);
    expect(atLeast('3.3.0', FIXED)).toBe(true);
    expect(atLeast('3.10.0', FIXED)).toBe(true);
    expect(atLeast('4.0.0-rc.1', FIXED)).toBe(true);
  });
});
