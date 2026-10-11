import { describe, expect, it } from 'vitest';
import { checkEntities, checkSize, estimateEntities, MAX_MODEL_BYTES, maxEntities } from '../src/core/limits';
import { mapError } from '../src/core/errors';

const bytes = (text: string) => { const u = new TextEncoder().encode(text); return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer; };
const wall = (i: number) => `#${i}=IFCWALL('${String(i).padStart(22, '0')}',$,'Waldo',$,$,$,$,$,$);\n`;
const model = (n: number) => `ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n${Array.from({ length: n }, (_, i) => wall(i + 1)).join('')}ENDSEC;\nEND-ISO-10303-21;\n`;

describe('what a tab can hold is decided before the model is read', () => {
  it('a file over the size limit is refused by its size, with a sentence that says what to do', () => {
    expect(() => checkSize(MAX_MODEL_BYTES)).not.toThrow();
    expect(() => checkSize(MAX_MODEL_BYTES + 1)).toThrow(/Split the model/);
  });
  it('counts the entities of a small file exactly', () => expect(estimateEntities(bytes(model(1000)))).toBe(1000));
  it('estimates those of a large file from its first and last megabyte, within 5 percent', () => {
    const n = 90_000; // about 7 MB
    const est = estimateEntities(bytes(model(n)));
    expect(Math.abs(est - n) / n).toBeLessThan(0.05);
  });
  it('allows fewer entities on a computer that reports less memory, and no more than 9.3 million on any', () => {
    expect(maxEntities(8)).toBeGreaterThan(9_000_000);
    expect(maxEntities(8)).toBeLessThan(10_000_000);
    expect(maxEntities(64)).toBe(maxEntities(8));
    expect(maxEntities(4)).toBeLessThan(maxEntities(8) / 1.9);
  });
  it('refuses a model with more entities than the computer can hold, and says how many it has and how many fit', () => {
    const big = bytes(model(330_000)); // 25 MB: more than a computer with 0.25 GiB holds (about 313,000)
    expect(() => checkEntities(big, 8)).not.toThrow();
    try { checkEntities(big, 0.25); } catch (e) {
      expect((e as { kind: string }).kind).toBe('ifc-too-large');
      expect((e as Error).message).toMatch(/This model has about 0\.3 million entities\. This computer can hold about 0\.3 million/);
      return;
    }
    throw new Error('not refused');
  });
  it('says plainly when the reader meets its own limit on distinct names, instead of calling the file damaged', () => {
    const m = mapError(new RangeError('Map maximum size exceeded'), 'ifc');
    expect(m.kind).toBe('ifc-too-large');
    expect(m.message).toMatch(/more distinct names and identifiers than a browser can hold/);
  });
  it('still calls a failed allocation a memory problem', () => {
    expect(mapError(new RangeError('Array buffer allocation failed'), 'ifc').kind).toBe('out-of-memory');
  });
});
