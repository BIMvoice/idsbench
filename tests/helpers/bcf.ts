/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Reads a .bcfzip the way a BCF tool would and validates every XML file in it against the official buildingSMART BCF-XML
// schemas. The schemas are not copied into this repository (the BCF-XML repository states no licence): they are
// downloaded from github.com/buildingSMART/BCF-XML (branch release_2_1) into .scratch/bcf-xsd/ the first time and kept there.
import { DOMParser } from '@xmldom/xmldom';
import { unzipSync, strFromU8 } from 'fflate';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateXML } from 'xmllint-wasm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(root, '.scratch/bcf-xsd/2.1');
const NAMES = ['markup', 'visinfo', 'project', 'version'] as const;

export async function schemas(): Promise<Record<(typeof NAMES)[number], string>> {
  fs.mkdirSync(dir, { recursive: true });
  const out = {} as Record<(typeof NAMES)[number], string>;
  for (const n of NAMES) {
    const file = path.join(dir, `${n}.xsd`);
    if (!fs.existsSync(file)) {
      const res = await fetch(`https://raw.githubusercontent.com/buildingSMART/BCF-XML/release_2_1/Schemas/${n}.xsd`);
      if (!res.ok) throw new Error(`could not download ${n}.xsd for the BCF schema check (${res.status})`);
      fs.writeFileSync(file, await res.text());
    }
    out[n] = fs.readFileSync(file, 'utf8');
  }
  return out;
}

export interface ReadTopic {
  folder: string;
  guid: string;
  title: string;
  description: string;
  type: string;
  status: string;
  labels: string[];
  viewpointFiles: string[];
  /** The IfcGuid of every Component in the Selection of the topic's viewpoints; null when the topic has no viewpoint. */
  selection: string[] | null;
  /** Everything in the viewpoint that is not a Selection: cameras and other Components. */
  cameras: number;
}

export interface ReadBcf { files: string[]; topics: ReadTopic[]; invalid: string[]; version: string }

const text = (el: { textContent: string | null } | null | undefined) => el?.textContent ?? '';
const parse = (x: string) => new DOMParser().parseFromString(x, 'text/xml');

/** Unzips a .bcfzip, validates each XML file against its official schema (`invalid` lists the errors, empty when all are valid) and reads the topics. */
export async function readBcf(blob: Blob): Promise<ReadBcf> {
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const xsd = await schemas();
  const invalid: string[] = [];
  const check = async (files: string[], schema: string) => {
    if (!files.length) return;
    const res = await validateXML({ xml: files.map((f) => ({ fileName: f, contents: strFromU8(zip[f]) })), schema: [{ fileName: 'schema.xsd', contents: schema }] });
    if (!res.valid) invalid.push(...res.errors.map((e) => `${e.rawMessage ?? e.message}`));
  };
  const files = Object.keys(zip);
  await check(files.filter((f) => f === 'bcf.version'), xsd.version);
  await check(files.filter((f) => f === 'project.bcfp'), xsd.project);
  await check(files.filter((f) => f.endsWith('/markup.bcf')), xsd.markup);
  await check(files.filter((f) => f.endsWith('.bcfv')), xsd.visinfo);
  const topics: ReadTopic[] = files.filter((f) => f.endsWith('/markup.bcf')).map((f) => {
    const doc = parse(strFromU8(zip[f]));
    const topic = doc.getElementsByTagName('Topic')[0];
    const folder = f.split('/')[0];
    const vps = Array.from(doc.getElementsByTagName('Viewpoint')).map((v) => `${folder}/${text(v)}`);
    let selection: string[] | null = null;
    let cameras = 0;
    for (const vf of vps) {
      const vdoc = parse(strFromU8(zip[vf]));
      selection ??= [];
      for (const sel of Array.from(vdoc.getElementsByTagName('Selection'))) for (const c of Array.from(sel.getElementsByTagName('Component'))) selection.push(c.getAttribute('IfcGuid') ?? '');
      cameras += vdoc.getElementsByTagName('PerspectiveCamera').length + vdoc.getElementsByTagName('OrthogonalCamera').length;
    }
    return {
      folder, guid: topic.getAttribute('Guid') ?? '', title: text(topic.getElementsByTagName('Title')[0]), description: text(topic.getElementsByTagName('Description')[0]),
      type: topic.getAttribute('TopicType') ?? '', status: topic.getAttribute('TopicStatus') ?? '',
      labels: Array.from(topic.getElementsByTagName('Labels')).map((l) => text(l)), viewpointFiles: vps, selection, cameras,
    };
  });
  const version = text(parse(strFromU8(zip['bcf.version'])).getElementsByTagName('Version')[0]).trim();
  return { files, topics, invalid, version: parse(strFromU8(zip['bcf.version'])).documentElement?.getAttribute('VersionId') ?? version };
}
