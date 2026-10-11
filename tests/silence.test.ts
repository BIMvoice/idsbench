// The page says "has not answered" when the worker has been silent for longer than it may. Reading a large model has
// steps that cannot say anything until they are done, and they grow with the model: what is allowed grows with it too.
import { describe, expect, it } from 'vitest';
import { READING_MS_PER_MB, SILENCE_MS, silenceAllowed } from '../src/runner';

const MB = 1024 * 1024;
describe('how long the worker may be silent', () => {
  it('30 seconds while it checks, whatever the size of the model', () => {
    expect(silenceAllowed('checking', 5 * MB)).toBe(30_000);
    expect(silenceAllowed('checking', 1024 * MB)).toBe(30_000);
    expect(silenceAllowed(null, 1024 * MB)).toBe(30_000);
    expect(silenceAllowed('reading-ids', 1024 * MB)).toBe(SILENCE_MS);
  });
  it('longer while a large model is being read: the longest step measured (1.5 s for 107 MB) fits six times over at any size', () => {
    for (const mb of [1, 107, 300, 1024]) {
      const measured = (1500 / 107) * mb;
      expect(silenceAllowed('reading-ifc', mb * MB)).toBeGreaterThanOrEqual(6 * measured);
      expect(silenceAllowed('reading-ifc', mb * MB)).toBe(SILENCE_MS + mb * READING_MS_PER_MB);
    }
    expect(silenceAllowed('reading-ifc', 1024 * MB)).toBeGreaterThan(3 * 60_000);
  });
  it('and a small model is still called silent after about half a minute', () => {
    expect(silenceAllowed('reading-ifc', 2 * MB)).toBeLessThan(31_000);
  });
});
