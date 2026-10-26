/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { loadScene, runInWorker } from '../../runner';
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
  /** The result of the page: the view is made again when it changes. */
  result: RunResult;
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
export function Show3D({ idsFile, model, result, busy, spec, focus, listed, onSpec, onPick }: Props) {
  const gpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const tooBig = model.size > SCENE_MAX_BYTES;
  const [scene, setScene] = useState<Scene | null>(null);
  const [keys, setKeys] = useState<CompareKeys | null>(null);
  const [problem, setProblem] = useState<string | null>(tooBig ? SCENE_TOO_BIG(model.size) : !gpu ? NO_WEBGPU : null);

  // The shapes: once for the model.
  useEffect(() => {
    if (!gpu || tooBig) return;
    let live = true;
    setScene(null);
    loadScene(model).then((s) => { if (live) setScene(s); }, (e: Error) => { if (live) setProblem(e.message); });
    return () => { live = false; };
  }, [model, gpu, tooBig]);

  // The state of every element: whenever the result is made again (the same worker, the model it keeps; only the check is run).
  useEffect(() => {
    if (!gpu || tooBig || busy) return;
    let live = true;
    setKeys(null);
    const run = runInWorker({ ids: idsFile, ifc: model }, () => {}, { collect: true });
    run.promise.then((o) => {
      if (!live) return;
      const k = o.result.keys;
      if (!k || k.tooMany) setProblem(TOO_MANY); else setKeys(k);
    }, (e: unknown) => { if (live) setProblem(e instanceof Error && e.message ? e.message : 'The check could not be made again for 3D.'); });
    return () => { live = false; run.cancel(); };
  }, [result, idsFile, model, gpu, tooBig, busy]);

  const states = useMemo(() => (keys && spec !== null && keys.failing[spec] ? elementStates(keys.failing[spec].map((f) => f.globalId), keys.applicable[spec]) : new Map()), [keys, spec]);

  if (problem) return <p className="note view3d-note" role="status" id="view3d-note">{problem}</p>;
  if (!scene || !keys) return <p className="note view3d-note" role="status" id="view3d-note">Making the shapes of the model for 3D. The check is not affected.</p>;
  if (scene.meshes.length === 0) return <p className="note view3d-note" role="status" id="view3d-note">This model has no shapes to show: its elements have no geometry. The list of failing elements is complete without it.</p>;
  return (
    <div className="view3d" id="view3d">
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
        <Viewer scene={scene} states={states} listed={listed} focus={focus} onPick={onPick} onProblem={setProblem} />
      </Suspense>
      <p className="note">Drag to turn, shift-drag to move, scroll to come closer. Press a failing element in the list to see where it is; press an element here to find its row. {scene.meshes.length.toLocaleString('en')} elements have a shape.</p>
    </div>
  );
}
