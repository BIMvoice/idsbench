/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// What the failing-element lists and the 3D view tell each other: which specification the view shows, which
// elements it should bring the camera to, and which element a click in 3D landed on.
import { createContext } from 'react';

export interface Focus3d {
  /** The 3D view is open. */
  open: boolean;
  /** The specification (its index in the file) the view colours. */
  spec: number | null;
  /** The element clicked in 3D, when it is one of those listed for `spec`. */
  picked: string | null;
  /** Colour the view by this specification and bring the camera to these elements. */
  show: (spec: number, globalIds: string[]) => void;
}

export const NO_3D: Focus3d = { open: false, spec: null, picked: null, show: () => {} };
export const Focus3dContext = createContext<Focus3d>(NO_3D);
