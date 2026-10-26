/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The ready-made IDS files that ship as static files next to the page (public/examples/). Nothing here is in the first
// load: the list and a file are fetched from the page's own origin when the person asks for them.
export interface ExampleEntry { file: string; title: string; description: string }

const BASE = `${import.meta.env.BASE_URL}examples/`;

/** The list of examples, from the page's own origin. */
export async function fetchExampleList(): Promise<ExampleEntry[]> {
  const r = await fetch(`${BASE}index.json`);
  if (!r.ok) throw new Error(`examples/index.json: ${r.status}`);
  const j = (await r.json()) as { examples?: ExampleEntry[] };
  if (!Array.isArray(j.examples)) throw new Error('examples/index.json: no list');
  return j.examples;
}

/** One example as a File, so that it is opened exactly as a file the person chose. */
export async function fetchExampleFile(entry: ExampleEntry): Promise<File> {
  const r = await fetch(`${BASE}${entry.file}`);
  if (!r.ok) throw new Error(`examples/${entry.file}: ${r.status}`);
  return new File([await r.blob()], entry.file, { type: 'application/xml' });
}
