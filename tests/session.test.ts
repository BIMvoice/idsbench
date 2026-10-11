// The parsed model is kept between runs, and only for the very file it was read from.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ModelKeeper, runSession, sameModel, type ModelRef } from '../src/core/session';
import { RunStopped, readIds } from '../src/core/validate';
import { AppError, mapError } from '../src/core/errors';

const NS = 'http://standards.buildingsmart.org/IDS';
const ifc = (names: string[], schema = 'IFC4') =>
  `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\nFILE_NAME('','2022-10-07T13:48:44',(),(),'x','x','');\nFILE_SCHEMA(('${schema}'));\nENDSEC;\nDATA;\n${names.map((n, i) => `#${i + 1}=IFCWALL('${String(i + 1).padStart(22, '0')}',$,'${n}',$,$,$,$,$,$);\n`).join('')}ENDSEC;\nEND-ISO-10303-21;\n`;
const bytes = (text: string) => { const u = new TextEncoder().encode(text); return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer; };
const nameIs = (v: string) => readIds(`<?xml version="1.0"?><ids xmlns="${NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications><specification name="s" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><attribute><name><simpleValue>Name</simpleValue></name><value><simpleValue>${v}</simpleValue></value></attribute></requirements></specification></specifications></ids>`);

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

/** A model as the page hands it to the worker: a reference, and a reader that counts how often it is called. */
function model(text: string, ref: Partial<ModelRef> = {}) {
  const b = bytes(text);
  const m = { reads: 0, ref: { token: 1, name: 'm.ifc', size: b.byteLength, lastModified: 1000, ...ref } as ModelRef, read: async () => { m.reads++; return b.slice(0); } };
  return m;
}
const without = (r: { seconds: number }) => ({ ...r, seconds: 0 });

describe('which model a kept copy may stand for', () => {
  const a: ModelRef = { token: 1, name: 'm.ifc', size: 100, lastModified: 5 };
  it('the same file object, size, name and time', () => expect(sameModel(a, { ...a })).toBe(true));
  it('not another file object, even with the same name, size and time', () => expect(sameModel(a, { ...a, token: 2 })).toBe(false));
  it('not a file of another size', () => expect(sameModel(a, { ...a, size: 101 })).toBe(false));
  it('not a file saved again (another last-modified time)', () => expect(sameModel(a, { ...a, lastModified: 6 })).toBe(false));
  it('not a file of another name', () => expect(sameModel(a, { ...a, name: 'n.ifc' })).toBe(false));
});

describe('a run after the first only checks again', () => {
  it('reads and parses the model once for the same file, and gives the same result as the run that read it', async () => {
    const keeper = new ModelKeeper();
    const m = model(ifc(['Waldo', 'Wilma']));
    const first = await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: m.ref, read: m.read });
    const second = await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: m.ref, read: m.read });
    expect([first.reused, second.reused]).toEqual([false, true]);
    expect(m.reads).toBe(1);
    expect(without(second.result)).toEqual(without(first.result));
    expect(first.result.specs[0].failed).toBe(1);
  });
  it('a different IDS against the kept model gives that IDS its own result', async () => {
    const keeper = new ModelKeeper();
    const m = model(ifc(['Waldo', 'Waldo']));
    expect((await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: m.ref, read: m.read })).result.verdict).toBe('pass');
    const other = await runSession(keeper, { ids: nameIs('Wilma'), idsName: 'a.ids', model: m.ref, read: m.read });
    expect(other.reused).toBe(true);
    expect(other.result.verdict).toBe('fail');
  });

  // The model on disk is changed in a way that keeps its name, its size and its time: only the file object tells.
  it('a changed model is never served from the kept copy: another file object with the same name, size and time is read again', async () => {
    const keeper = new ModelKeeper();
    const before = model(ifc(['Waldo', 'Waldo']));
    const after = model(ifc(['Wilma', 'Wilma']), { token: 2 });
    expect(after.ref.size).toBe(before.ref.size);
    expect((await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: before.ref, read: before.read })).result.verdict).toBe('pass');
    const r = await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: after.ref, read: after.read });
    expect(r.reused).toBe(false);
    expect(after.reads).toBe(1);
    expect(r.result.verdict).toBe('fail');
  });
  it('the same file object saved again (another time) or of another size is read again', async () => {
    const keeper = new ModelKeeper();
    const m = model(ifc(['Waldo']));
    await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: m.ref, read: m.read });
    const touched = model(ifc(['Wilma']), { lastModified: 2000 });
    expect((await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: touched.ref, read: touched.read })).result.verdict).toBe('fail');
    expect(touched.reads).toBe(1);
    const longer = model(ifc(['Waldo', 'Waldo']));
    const r = await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: { ...longer.ref, lastModified: 2000 }, read: longer.read });
    expect(r.reused).toBe(false);
    expect(r.result.specs[0].applicable).toBe(2);
  });
  it('"Run again" reads the model again even though a copy is kept', async () => {
    const keeper = new ModelKeeper();
    const m = model(ifc(['Waldo']));
    await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: m.ref, read: m.read });
    const r = await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: m.ref, read: m.read, fresh: true });
    expect([r.reused, m.reads]).toEqual([false, 2]);
  });
  it('a file that is not the size it was chosen with is refused and no copy is kept of it', async () => {
    const keeper = new ModelKeeper();
    const m = model(ifc(['Waldo']), { size: 5 });
    await expect(runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: m.ref, read: m.read })).rejects.toBeInstanceOf(AppError);
    expect(keeper.ref).toBeNull();
  });
  it('a run that fails drops the kept copy; a run that is only stopped keeps it', async () => {
    const keeper = new ModelKeeper();
    const m = model(ifc(['Waldo', 'Waldo']));
    await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: m.ref, read: m.read });
    await expect(runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: m.ref, read: m.read, onTick: () => { throw new RunStopped(); } })).rejects.toBeInstanceOf(RunStopped);
    expect(keeper.ref).not.toBeNull();
    await expect(runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: m.ref, read: m.read, onTick: () => { throw new Error('boom'); } })).rejects.toBeTruthy();
    expect(keeper.ref).toBeNull();
  });
  it('a new model lets go of the old one before it is read', async () => {
    const keeper = new ModelKeeper();
    const a = model(ifc(['Waldo']));
    await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: a.ref, read: a.read });
    let keptWhileReading: ModelRef | null | undefined;
    const b = model(ifc(['Waldo']), { token: 2, name: 'b.ifc' });
    await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: b.ref, read: async () => { keptWhileReading = keeper.ref; return b.read(); } });
    expect(keptWhileReading).toBeNull();
    expect(keeper.ref?.name).toBe('b.ifc');
  });
});

// The report names the model by a SHA-256. It has to be of the bytes that were parsed, not of what the file holds later.
describe('which bytes a result is of', () => {
  const sha = async (b: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('');
  it('a run says how many bytes it parsed and their SHA-256', async () => {
    const keeper = new ModelKeeper();
    const text = ifc(['Waldo', 'Wilma']);
    const m = model(text);
    const r = await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: m.ref, read: m.read });
    expect(r.model).toEqual({ bytes: bytes(text).byteLength, sha256: await sha(bytes(text)) });
  });
  it('a run served from the kept copy names the bytes that copy was read from, whatever the file holds by then', async () => {
    const keeper = new ModelKeeper();
    const before = ifc(['Waldo', 'Waldo']), after = ifc(['Wilma', 'Wilma']);
    expect(after.length).toBe(before.length);
    // One file object, whose content changes on disk in a way that keeps its size and its time.
    let onDisk = before, reads = 0;
    const ref: ModelRef = { token: 1, name: 'm.ifc', size: bytes(before).byteLength, lastModified: 1000 };
    const read = async () => { reads++; return bytes(onDisk); };
    const first = await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: ref, read });
    onDisk = after;
    const second = await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: ref, read });
    expect([second.reused, reads]).toEqual([true, 1]);
    // The verdict is of the first content (every wall is named Waldo), and so is the digest: the two are of the same bytes.
    expect(second.result.verdict).toBe('pass');
    expect(second.model.sha256).toBe(await sha(bytes(before)));
    expect(second.model).toEqual(first.model);
    // "Run again" reads the file as it is now: the verdict and the digest are both of the new content.
    const third = await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: ref, read, fresh: true });
    expect(third.result.verdict).toBe('fail');
    expect(third.model.sha256).toBe(await sha(bytes(after)));
  });
});

// A browser refuses to hand over the bytes of a file that changed or went away after it was chosen.
describe('a model that cannot be read any more', () => {
  it('is said as that, with what to do, and not as "something went wrong"', async () => {
    const keeper = new ModelKeeper();
    const m = model(ifc(['Waldo']));
    const gone = Object.assign(new Error('A requested file or directory could not be found at the time an operation was processed.'), { name: 'NotFoundError' });
    const failed = await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: m.ref, read: async () => { throw gone; } }).catch((e) => e);
    expect(failed).toBeInstanceOf(AppError);
    expect(mapError(failed, 'validate')).toEqual({ kind: 'file-unreadable', message: 'The model could not be read from your computer. It was moved, renamed, deleted or saved again after it was chosen here, so no result was made. Choose it again.' });
    expect(keeper.ref).toBeNull();
  });
  it('but a file too large for the browser to hand over in one piece is a memory problem', async () => {
    const m = model(ifc(['Waldo']));
    const failed = await runSession(new ModelKeeper(), { ids: nameIs('Waldo'), idsName: 'a.ids', model: m.ref, read: async () => { throw new RangeError('Array buffer allocation failed'); } }).catch((e) => e);
    expect(mapError(failed, 'validate').kind).toBe('out-of-memory');
  });
});

// The page offers to stop a run when the worker has been silent for too long, so the worker has to speak from inside its long steps.
describe('a run says that it is going on while the model is read', () => {
  it('ticks while the model is counted and parsed, before the check begins', async () => {
    const m = model(ifc(Array.from({ length: 30_000 }, (_, i) => `Wall ${i}`)));
    let ticks = 0, beforeChecking = -1;
    await runSession(new ModelKeeper(), { ids: nameIs('Waldo'), idsName: 'a.ids', model: m.ref, read: m.read, onTick: () => { ticks++; }, onPhase: (p) => { if (p === 'checking') beforeChecking = ticks; } });
    expect(beforeChecking).toBeGreaterThan(0);
  });
  it('a run stopped while the model is being parsed ends as stopped, not as a damaged file, and keeps no copy', async () => {
    const keeper = new ModelKeeper();
    const m = model(ifc(Array.from({ length: 30_000 }, (_, i) => `Wall ${i}`)));
    let phase = '';
    const stopped = await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: m.ref, read: m.read, onPhase: (p) => { phase = p; }, onTick: () => { throw new RunStopped(); } }).catch((e) => e);
    expect(stopped).toBeInstanceOf(RunStopped);
    expect(phase).toBe('reading-ifc');
    expect(keeper.ref).toBeNull();
  });
});

// The page tells the worker which model it has now; a copy of any other model is let go, whether a run follows or not.
describe('the kept copy is let go when the page has another model, or none', () => {
  const kept = async () => { const keeper = new ModelKeeper(); const m = model(ifc(['Waldo'])); await runSession(keeper, { ids: nameIs('Waldo'), idsName: 'a.ids', model: m.ref, read: m.read }); return keeper; };
  it('another file: let go', async () => { const k = await kept(); k.forgetOthers(2); expect(k.ref).toBeNull(); });
  it('no model: let go', async () => { const k = await kept(); k.forgetOthers(null); expect(k.ref).toBeNull(); });
  it('the same file: kept, so that the next run does not read it again', async () => { const k = await kept(); k.forgetOthers(1); expect(k.ref?.token).toBe(1); });
});
