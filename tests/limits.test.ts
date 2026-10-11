import { describe, expect, it } from 'vitest';
import { checkEntities, checkSize, countEntities, MAX_MODEL_BYTES, maxEntities, TOO_MANY_ENTITIES, weighedEntities } from '../src/core/limits';
import { mapError } from '../src/core/errors';

const bytes = (text: string) => { const u = new TextEncoder().encode(text); return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer; };
const wall = (i: number) => `#${i}=IFCWALL('${String(i).padStart(22, '0')}',$,'Waldo',$,$,$,$,$,$);\n`;
const model = (n: number) => `ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n${Array.from({ length: n }, (_, i) => wall(i + 1)).join('')}ENDSEC;\nEND-ISO-10303-21;\n`;

describe('what a tab can hold is decided before the model is read', () => {
  it('a file over the size limit is refused by its size, with a sentence that says what to do', () => {
    expect(() => checkSize(MAX_MODEL_BYTES)).not.toThrow();
    expect(() => checkSize(MAX_MODEL_BYTES + 1)).toThrow(/Split the model/);
  });
  it('counts the entities of a small file exactly', () => expect(countEntities(bytes(model(1000))).all).toBe(1000));
  it('counts those of a large file exactly too', () => {
    const n = 90_000; // about 7 MB
    expect(countEntities(bytes(model(n)))).toEqual({ all: n, named: n });
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
      expect((e as Error).message).toMatch(/^This model has 330,000 entities\. This browser reports 0\.25 GB of memory for this computer; by what was measured on a larger one, a browser tab then holds about 0\.3 million entities that have a name or an identifier of their own\. So the model was not read and no result was made\. Split the model/);
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

// The count used to be worked out from the first and the last megabyte of the file. A file is not the same throughout.
describe('the count is of the whole file, not of a sample of it', () => {
  const point = (i: number) => `#${i}=IFCCARTESIANPOINT((${i}.,2.5,0.));\n`;
  const longWall = (i: number) => `#${i}=IFCWALL('${String(i).padStart(22, '0')}',$,'Waldo','${'x'.repeat(2000)}',$,$,$,$,$);\n`;
  const file = (...parts: string[]) => bytes(`ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n${parts.join('')}ENDSEC;\nEND-ISO-10303-21;\n`);
  const run = (from: number, n: number, line: (i: number) => string) => Array.from({ length: n }, (_, i) => line(from + i)).join('');

  it('a file with short records at both ends and long ones between is not refused for entities it does not have', () => {
    // 80,000 walls in 2 MB at each end, 4,000 in 8 MB between: 164,000 walls. The two ends alone would say about half a million.
    const b = file(run(1, 80_000, wall), run(100_001, 4_000, longWall), run(200_001, 80_000, wall));
    expect(b.byteLength).toBeGreaterThan(12 * 1024 * 1024);
    expect(countEntities(b)).toEqual({ all: 164_000, named: 164_000 });
    expect(maxEntities(0.25)).toBeGreaterThan(164_000);
    expect(() => checkEntities(b, 0.25)).not.toThrow();
  });
  it('a file with long records at both ends and short ones between is refused for the entities it has', () => {
    // 1,000 long walls (2 MB) at each end, 400,000 short ones between: the two ends alone would say about 8,000.
    const b = file(run(1, 1_000, longWall), run(100_001, 400_000, wall), run(600_001, 1_000, longWall));
    expect(countEntities(b).all).toBe(402_000);
    expect(() => checkEntities(b, 0.25)).toThrow(/This model has 402,000 entities\./);
  });
  it('counts records, not lines: a file on one line, records over several lines, and a "#" or a ";" inside a text or a comment', () => {
    expect(countEntities(file(run(1, 500, wall).replace(/\n/g, ''))).all).toBe(500);
    expect(countEntities(file(run(1, 500, wall).replace(/,\$/g, ',\r\n  $'))).all).toBe(500);
    const tricky = file(`#1=IFCWALL('0000000000000000000001',$,'a;\n#99=IFCWALL(''quoted'');',$,$,$,$,$,$);\n/* #7=IFCDOOR(';'); */\n#2 = IFCSLAB ( '0000000000000000000002',$,'S',$,$,$,$,$,$);\n#3=IFCCARTESIANPOINT((0.,0.,0.));\n`);
    expect(countEntities(tricky)).toEqual({ all: 3, named: 2 });
  });
  it('says while it counts that it is counting', () => {
    let ticks = 0;
    countEntities(file(run(1, 500_000, point)), () => { ticks++; });
    expect(ticks).toBeGreaterThan(0);
  });
});

// The limit was measured on walls. Most of a real model is geometry, which the parsed model holds as an index only.
describe('entities are weighed by what they cost', () => {
  const point = (i: number) => `#${i}=IFCCARTESIANPOINT((${i}.,2.5,0.));\n`;
  const file = (body: string) => bytes(`ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n${body}ENDSEC;\nEND-ISO-10303-21;\n`);
  it('a model of geometry with more entities than the limit, but a third of the weight, is not refused', () => {
    const n = 600_000; // twice what a computer reporting 0.25 GB is allowed in walls
    const b = file(Array.from({ length: n }, (_, i) => point(i + 1)).join(''));
    expect(n).toBeGreaterThan(maxEntities(0.25) * 2);
    expect(countEntities(b)).toEqual({ all: n, named: 0 });
    expect(weighedEntities({ all: n, named: 0 })).toBe(n / 3);
    expect(() => checkEntities(b, 0.25)).not.toThrow();
  });
  it('the same number of walls is refused, and so is geometry of more than three times the limit', () => {
    expect(() => checkEntities(bytes(model(600_000)), 0.25)).toThrow(/600,000 entities/);
    const n = 900_000;
    expect(() => checkEntities(file(Array.from({ length: n }, (_, i) => point(i + 1)).join('')), 0.25)).toThrow(/This model has 900,000 entities, 0 of them with a name or an identifier of their own \(the others, mostly geometry, count for a third\)\./);
  });
  it('a mixed model says how many of its entities are of the costly kind', () => {
    const body = Array.from({ length: 900_000 }, (_, i) => (i % 3 === 0 ? wall(i + 1) : point(i + 1))).join('');
    expect(() => checkEntities(file(body), 0.25)).toThrow(/This model has 900,000 entities, 300,000 of them with a name or an identifier of their own/);
  });
});

// What the browser reports for the computer is at most 8, and nothing at all in Firefox and Safari.
describe('what the refusal says the limit comes from', () => {
  const tooMany = (reported: number | undefined, n: number) => { try { checkEntities(bytes(model(n)), reported); } catch (e) { return (e as Error).message; } return null; };
  it('8 (which every computer with 8 GB or more reports): the measured limit, and not "this computer can hold"', () => {
    expect(maxEntities(8)).toBe(9_305_762);
    expect(maxEntities(undefined)).toBe(maxEntities(8));
  });
  it('4 and 0.5: proportionally fewer, and the sentence gives the figure the browser reported', () => {
    expect(maxEntities(4)).toBe(4_652_881);
    expect(maxEntities(0.5)).toBe(581_610);
    expect(tooMany(0.5, 590_000)).toMatch(/This browser reports 0\.5 GB of memory for this computer; by what was measured on a larger one, a browser tab then holds about 0\.6 million/);
    expect(tooMany(0.5, 580_000)).toBeNull();
  });
  it('no browser profile is told that its own computer was measured', () => {
    for (const reported of [8, 4, 0.5, undefined]) {
      const limit = maxEntities(reported);
      const text = TOO_MANY_ENTITIES({ all: limit + 1, named: limit + 1 }, limit, reported);
      expect(text).not.toMatch(/This computer can hold/);
      expect(text).toMatch(reported === undefined ? /This browser does not say how much memory the computer has, so the limit is the most a browser tab was measured to hold: about 9\.3 million/ : reported >= 8 ? /This browser reports 8 GB of memory or more for this computer, and a browser tab was measured to hold about 9\.3 million/ : /This browser reports (4|0\.5) GB of memory for this computer/);
    }
  });
});
