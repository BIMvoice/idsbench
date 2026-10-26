/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The 3D canvas. This file is the only one that imports the renderer, and it is loaded only when 3D is opened
// (see Show3D.tsx), so the renderer is not part of the page a reader first gets. It paints what core/states.ts says.
import { useEffect, useRef, useState } from 'react';
import { Renderer } from '@ifc-lite/renderer';
import type { Scene } from '../../core/scene';
import { colourOverrides, expressIdsOf, pickOf, type ElementState } from '../../core/states';
import { onDeviceLost } from './lost';

export interface ViewerProps {
  scene: Scene;
  states: ReadonlyMap<string, ElementState>;
  /** The GlobalIds the page lists for the selected specification: only a click on one of these is reported. */
  listed: ReadonlySet<string>;
  /** Elements to frame and highlight. `n` changes with every press, so pressing the same row again frames it again. */
  focus: { globalIds: string[]; n: number } | null;
  /** `beyondList`: the element fails but is not one of the listed rows (it has no row to highlight). */
  onPick: (globalId: string | null, beyondList: boolean) => void;
  onProblem: (message: string) => void;
}

type Box = { min: [number, number, number]; max: [number, number, number] };

/** The box around the meshes of these express ids. */
function boxOf(scene: Scene, ids: ReadonlySet<number>): Box | null {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let any = false;
  for (const m of scene.meshes) {
    if (!ids.has(m.expressId)) continue;
    const p = m.positions;
    // A vertex is at the element's own origin plus its position (see MeshData.origin).
    const o = m.origin ?? [0, 0, 0];
    for (let i = 0; i + 2 < p.length; i += 3) {
      any = true;
      for (let k = 0; k < 3; k++) { const v = o[k] + p[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
    }
  }
  return any ? { min, max } : null;
}

export function Viewer({ scene, states, listed, focus, onPick, onProblem }: ViewerProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef<{ renderer: Renderer; dirty: boolean; selected: Set<number> } | null>(null);
  const guidOf = useRef(new Map<number, string>(scene.guids));
  const props = useRef({ states, listed, onPick });
  props.current = { states, listed, onPick };
  const [ready, setReady] = useState(false);

  // The renderer is made once for the scene and let go of when the scene changes or the view closes. A new result
  // (the same model checked again after an edit) is not a new scene: the renderer and the camera stay, and the colours
  // follow `states` (below); so does the selection, whose elements are the model's and are still in it.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let stopped = false;
    let frame = 0;
    const renderer = new Renderer(el);
    guidOf.current = new Map(scene.guids);
    (async () => {
      try {
        await renderer.init();
        if (stopped) return;
        renderer.loadGeometry(scene.meshes);
        renderer.fitToView();
        live.current = { renderer, dirty: true, selected: new Set() };
        applyColours();
        onDeviceLost(renderer.getGPUDevice(), () => stopped, onProblem);
        setReady(true);
        const report = () => { el.dataset.target = JSON.stringify(renderer.getCamera().getTarget()); el.dataset.position = JSON.stringify(renderer.getCamera().getPosition()); };
        report();
        let last = performance.now();
        const loop = (now: number) => {
          if (stopped) return;
          const l = live.current!;
          const animating = renderer.getCamera().update(now - last);
          last = now;
          if (animating || l.dirty) {
            l.dirty = false;
            renderer.render({ selectedIds: l.selected, clearColor: [0.97, 0.97, 0.96, 1] });
            if (animating) l.dirty = true;
            else report();
          }
          frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
      } catch (e) {
        console.error(e);
        if (!stopped) onProblem('The 3D view could not be started in this browser. The list of failing elements is not affected.');
      }
    })();

    // Drag to turn, shift or right button to move, wheel to come closer; a click without a drag picks.
    let drag: { x: number; y: number; moved: boolean; pan: boolean } | null = null;
    const down = (e: PointerEvent) => { el.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, moved: false, pan: e.shiftKey || e.button === 2 }; };
    const move = (e: PointerEvent) => {
      if (!drag || !live.current) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      drag.x = e.clientX; drag.y = e.clientY;
      const cam = renderer.getCamera();
      if (drag.pan) cam.pan(dx, dy); else cam.orbit(dx, dy);
      live.current.dirty = true;
    };
    const up = async (e: PointerEvent) => {
      const d = drag;
      drag = null;
      if (!d || d.moved || !live.current) return;
      const r = el.getBoundingClientRect();
      const hit = await renderer.pick(e.clientX - r.left, e.clientY - r.top);
      const p = pickOf(hit ? hit.expressId : null, guidOf.current, props.current.listed, props.current.states);
      const g = p.listed ?? p.unlisted;
      live.current.selected = g ? expressIdsOf([g], guidOf.current) : new Set();
      live.current.dirty = true;
      props.current.onPick(p.listed, p.unlisted !== null);
    };
    const wheel = (e: WheelEvent) => {
      if (!live.current) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      renderer.getCamera().zoom(e.deltaY, false, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
      live.current.dirty = true;
    };
    const menu = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('contextmenu', menu);
    const resize = new ResizeObserver(() => {
      // The renderer sizes its drawing buffer from the element on every frame; the view only has to be drawn again.
      if (live.current) live.current.dirty = true;
    });
    resize.observe(el);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('contextmenu', menu);
      live.current = null;
      try { renderer.destroy(); } catch (e) { console.error(e); }
    };
  }, [scene]);

  function applyColours() {
    const l = live.current;
    if (!l) return;
    const device = l.renderer.getGPUDevice();
    const pipeline = l.renderer.getPipeline();
    if (!device || !pipeline) return;
    l.renderer.getScene().setColorOverrides(colourOverrides(props.current.states, guidOf.current), device, pipeline);
    l.dirty = true;
  }

  // Another specification: the elements are painted again.
  useEffect(() => { if (ready) applyColours(); }, [states, ready]);

  // A row or a group was pressed: those elements are highlighted and the camera is brought to them.
  useEffect(() => {
    const l = live.current;
    if (!ready || !l || !focus) return;
    const ids = expressIdsOf(focus.globalIds, guidOf.current);
    l.selected = ids;
    l.dirty = true;
    const box = boxOf(scene, ids);
    if (box) void l.renderer.getCamera().frameBounds({ x: box.min[0], y: box.min[1], z: box.min[2] } as never, { x: box.max[0], y: box.max[1], z: box.max[2] } as never, 300, 1.6);
  }, [focus, ready]);

  return <canvas ref={canvas} className="view3d-canvas" aria-label="3D view of the model: failing elements red, passing green, the rest grey" data-ready={ready ? 'true' : 'false'} tabIndex={0} />;
}
