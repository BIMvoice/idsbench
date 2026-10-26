/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The geometry of the model for the 3D view, made in the worker. The geometry engine (a WebAssembly module) is
// loaded only when 3D is asked for. The model's file is read once more for it (the parsed model the worker keeps holds
// the data of the elements, not their shapes), and the shapes are made by the geometry engine in a pass of its own.
import { createDataAccessor } from '@ifc-lite/ids/bridge';
import type { MeshData } from '@ifc-lite/geometry';
import type { LoadedModel } from './validate';

/** The shapes of a model and which GlobalId each belongs to. */
export interface Scene {
  meshes: MeshData[];
  /** Express id (what the renderer calls an element) to GlobalId, for every mesh that has one. */
  guids: [number, string][];
  triangles: number;
  /** Milliseconds the geometry pass took. */
  ms: number;
}

/**
 * The most triangles the 3D view takes. Measured in the page (headless Chromium, software GPU): 100,000 walls of 12
 * triangles (a 25 MB file) took 22 s and 1.3 GB above the empty page, the check included; the shapes are counted
 * while they are made and the pass stops at this number, so a model with more is refused and no more is made.
 */
export const SCENE_MAX_TRIANGLES = 1_200_000;
/** The geometry pass reads the file once more, beside the parsed model: a larger file is refused before it is read. */
export const SCENE_MAX_BYTES = 100 * 1024 * 1024;

export const SCENE_TOO_BIG = (size: number): string =>
  `This model is ${(size / 1024 / 1024).toFixed(0)} MB. 3D is not opened for a model over ${SCENE_MAX_BYTES / 1024 / 1024} MB, because the shapes would not fit in a tab with the model; the list of failing elements is complete without it.`;

export const SCENE_TOO_MANY_TRIANGLES = `The shapes of this model are over ${SCENE_MAX_TRIANGLES.toLocaleString('en')} triangles. 3D is not opened for a model with so many, because the tab could not draw them; the list of failing elements is complete without it.`;

/** The shapes are over SCENE_MAX_TRIANGLES. */
export class SceneTooLarge extends Error {}

/** The meshes of the model in `bytes`, with the GlobalId of each element, made with the geometry engine. */
export async function buildScene(bytes: ArrayBuffer, loaded: LoadedModel, onTick?: () => void): Promise<Scene> {
  const t0 = performance.now();
  const { GeometryProcessor } = await import('@ifc-lite/geometry');
  const processor = new GeometryProcessor();
  await processor.init();
  onTick?.();
  // Streamed, so that the count can stop the pass: the batches come as the shapes are made.
  const meshes: MeshData[] = [];
  let triangles = 0;
  for await (const event of processor.processStreaming(new Uint8Array(bytes))) {
    if (event.type !== 'batch') continue;
    for (const m of event.meshes) { meshes.push(m); triangles += m.indices.length / 3; }
    onTick?.();
    if (triangles > SCENE_MAX_TRIANGLES) throw new SceneTooLarge(SCENE_TOO_MANY_TRIANGLES);
  }
  const accessor = createDataAccessor(loaded.store);
  const guids: [number, string][] = [];
  const seen = new Set<number>();
  for (const m of meshes) {
    if (seen.has(m.expressId)) continue;
    seen.add(m.expressId);
    const g = accessor.getGlobalId(m.expressId);
    if (g) guids.push([m.expressId, g]);
  }
  return { meshes, guids, triangles, ms: performance.now() - t0 };
}
