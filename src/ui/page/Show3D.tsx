/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { runInWorker } from '../../runner';
import type { SceneKeeper } from '../../core/sceneKeeper';
import { SCENE_MAX_BYTES, SCENE_TOO_BIG, type Scene } from '../../core/scene';
import { elementStates } from '../../core/states';
import type { CompareKeys, RunResult } from '../../core/types';

// The renderer is a chunk of its own, requested only when 3D is opened.
const Viewer = lazy(() => import('../view3d/Viewer').then((m) => ({ default: m.Viewer })));

const NO_WEBGPU = '3D needs WebGPU, which this browser does not offer. A recent Chrome or Edge has it. The list of failing elements below is complete without it.';
const TOO_MANY = 'This model has too many elements to colour in 3D at once. The list of failing elements is complete without it.';

type Loaded = { scene: Scene; keys: CompareKeys } | { problem: string } | null;

interface Props {
  idsFile: File;
  model: File;
  /** Holds the shapes of the model while 3D is open, so that the view rebuilt after an edit does not make them again. */
  keeper: SceneKeeper;
  /** The result of the page. When it changes the elements are painted again; the view and its camera stay (only another model makes a new one). */
  result: RunResult;
  /** True while `result` is the last one made and the page is making another (after an edit): the view is kept, out of sight, and not shown as the answer for a file it was not made for. */
  stale?: boolean;
  /** True while the page is making another run in the worker (a comparison): the view waits for it. */
  busy: boolean;
  spec: number | null;
  focus: { globalIds: string[]; n: number } | null;
  /** The GlobalIds the page lists for the selected specification. */
  listed: ReadonlySet<string>;
  onSpec: (i: number) => void;
  onPick: (globalId: string | null) => void;
}

/** The 3D view: the model's shapes coloured by one specification. Open only while the reader has asked for it. */
export function Show3D({ idsFile, model, keeper, result, stale = false, busy, spec, focus, listed, onSpec, onPick }: Props) {
  const gpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const tooBig = model.size > SCENE_MAX_BYTES;
  const [scene, setScene] = useState<Scene | null>(null);
  // The states of the elements, with the result they were made for: they are shown only for that result.
  const [keyed, setKeyed] = useState<{ result: RunResult; keys: CompareKeys } | null>(null);
  const [beyond, setBeyond] = useState(false);
  // A click on a failing element the page does not list is explained until the next click or another specification.
  useEffect(() => { setBeyond(false); }, [spec, result, focus]);
  const [problem, setProblem] = useState<string | null>(tooBig ? SCENE_TOO_BIG(model.size) : !gpu ? NO_WEBGPU : null);

  // The shapes: once for the model.
  useEffect(() => {
    if (!gpu || tooBig) return;
    let live = true;
    setScene(null);
    setKeyed(null);
    // The keeper ends a pass in the worker when 3D closes or the model changes (see App), so this view only stops listening.
    keeper.get(model).then((s) => { if (live) setScene(s); }, (e: Error) => { if (live) setProblem(e.message); });
    return () => { live = false; };
  }, [model, keeper, gpu, tooBig]);

  // The state of every element: whenever the result is made again (the same worker, the model it keeps; only the check is run).
  useEffect(() => {
    if (!gpu || tooBig || busy) return;
    let live = true;
    // The states of the earlier result stay (out of sight) until these arrive, so that the view is not made again.
    const run = runInWorker({ ids: idsFile, ifc: model }, () => {}, { collect: true });
    run.promise.then((o) => {
      if (!live) return;
      const k = o.result.keys;
      if (!k || k.tooMany) setProblem(TOO_MANY); else setKeyed({ result, keys: k });
    }, (e: unknown) => { if (live) setProblem(e instanceof Error && e.message ? e.message : 'The check could not be made again for 3D.'); });
    return () => { live = false; run.cancel(); };
  }, [result, idsFile, model, gpu, tooBig, busy]);

  const keys = keyed?.keys ?? null;
  // Out of sight while the states are those of an earlier result, or the page is making another.
  const waiting = stale || keyed?.result !== result;
  const states = useMemo(() => (keys && spec !== null && keys.failing[spec] ? elementStates(keys.failing[spec].map((f) => f.globalId), keys.applicable[spec]) : new Map()), [keys, spec]);

  if (problem) return <p className="note view3d-note" role="status" id="view3d-note">{problem}</p>;
  if (!scene || !keys) return <p className="note view3d-note" role="status" id="view3d-note">Making the shapes of the model for 3D. The check is not affected.</p>;
  if (scene.meshes.length === 0) return <p className="note view3d-note" role="status" id="view3d-note">This model has no shapes to show: its elements have no geometry. The list of failing elements is complete without it.</p>;
  return (
    <>
    {waiting && <p className="note view3d-note" role="status" id="view3d-note">Checking again after your change. The 3D view comes back with the new result.</p>}
    <div className="view3d" id="view3d" style={waiting ? { visibility: 'hidden' } : undefined} aria-hidden={waiting || undefined}>
      <div className="view3d-bar">
        <label>
          Colour by{' '}
          <select value={spec ?? ''} onChange={(e) => onSpec(Number(e.target.value))}>
            {result.specs.map((s, i) => <option key={i} value={i}>{s.name || 'Untitled specification'}</option>)}
          </select>
        </label>
        <span className="legend" aria-label="Legend">
          <span className="swatch fail" aria-hidden="true" /> fails
          <span className="swatch pass" aria-hidden="true" /> passes
          <span className="swatch other" aria-hidden="true" /> not covered by it
        </span>
      </div>
      <Suspense fallback={<p className="note">Loading the 3D view.</p>}>
        <Viewer scene={scene} states={states} listed={listed} focus={focus} onPick={(g, beyondList) => { setBeyond(beyondList); onPick(g); }} onProblem={setProblem} />
      </Suspense>
      {beyond && <p className="note" role="status" id="view3d-beyond">This element fails, but it is not one of the {listed.size.toLocaleString('en')} the page lists for this specification, so it has no row. Every failing element is in the downloads.</p>}
      <p className="note">Drag to turn, shift-drag to move, scroll to come closer. Press a failing element in the list to see where it is; press an element here to find its row. {scene.meshes.length.toLocaleString('en')} elements have a shape.</p>
    </div>
    </>
  );
}
