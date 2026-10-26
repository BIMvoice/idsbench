/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// A browser takes the graphics device away from a page now and then (a driver reset, the tab long in the background,
// the card needed elsewhere). The canvas then stops drawing and stays as it was, or blank, and nothing says why.

export const DEVICE_LOST = 'The 3D view stopped because the browser took the graphics device away (a driver reset, or a tab left in the background). Press "Show in 3D" twice to open it again. The list of failing elements is not affected.';

/** The part of a GPUDevice this needs. */
export interface WatchedDevice { lost: Promise<unknown> }

/** Says DEVICE_LOST when the device goes while the view is still open (`stopped()` is false); a device the view itself let go of is not a loss. */
export function onDeviceLost(device: WatchedDevice | null | undefined, stopped: () => boolean, say: (message: string) => void): void {
  device?.lost.then(() => { if (!stopped()) say(DEVICE_LOST); }, () => {});
}
