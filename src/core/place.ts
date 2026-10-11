// Where a finding of the Check engine belongs on the page: a specification, "About this IDS", or the file as a whole;
// and, when the document is open in the editor, which field of the form it concerns.
import type { Finding } from '@idsbench/check';
import type { Facet, FacetKind, IdsDocument } from './ids/model';

export interface Outline {
  /** First and last line of <info>, or null when the file has none. */
  info: { from: number; to: number } | null;
  /** One entry per <specification>, in file order: its first and last line and its name as written. */
  specs: { from: number; to: number; name: string | null }[];
}

const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(\/?)(?:[A-Za-z_][\w.-]*:)?(info|specification)(?=[\s>/])([^>]*)>/g;

/** The lines the specifications and the info section occupy, read from the text alone (so it also works on a file that is not valid). */
export function outline(xml: string): Outline {
  const text = xml.replace(/^﻿/, '');
  const out: Outline = { info: null, specs: [] };
  let line = 1, at = 0;
  const lineOf = (index: number) => {
    line += (text.slice(at, index).match(/\r\n|\n|\r/g) ?? []).length;
    at = index;
    return line;
  };
  for (const m of text.matchAll(TOKEN)) {
    if (!m[2]) continue;
    const from = lineOf(m.index);
    const to = lineOf(m.index + m[0].length);
    const closing = m[1] === '/';
    const selfClosed = /\/\s*$/.test(m[3]);
    if (m[2] === 'info') {
      if (!closing) out.info = { from, to: selfClosed ? to : Number.MAX_SAFE_INTEGER };
      else if (out.info) out.info.to = to;
    } else if (!closing) {
      const name = /(?:^|\s)name\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(m[3]);
      out.specs.push({ from, to: selfClosed ? to : Number.MAX_SAFE_INTEGER, name: name ? (name[1] ?? name[2]) : null });
    } else {
      const open = [...out.specs].reverse().find((s) => s.to === Number.MAX_SAFE_INTEGER);
      if (open) open.to = to;
    }
  }
  return out;
}

export type Place = { kind: 'specification'; index: number } | { kind: 'info' } | { kind: 'file' };

const SPEC_PATH = /^ids\/specifications(?:\[1\])?\/specification(?:\[(\d+)\])?(?:\/(.*))?$/;

/** The engine's path decides when it has one; otherwise the line does; otherwise the finding is about the file. */
export function placeFinding(f: Pick<Finding, 'path' | 'line'>, o: Outline): Place {
  if (f.path) {
    const m = SPEC_PATH.exec(f.path);
    if (m) return { kind: 'specification', index: m[1] ? Number(m[1]) - 1 : 0 };
    if (/^ids\/info(\/|\[|$)/.test(f.path)) return { kind: 'info' };
    return { kind: 'file' };
  }
  if (f.line) {
    const i = o.specs.findIndex((s) => f.line! >= s.from && f.line! <= s.to);
    if (i !== -1) return { kind: 'specification', index: i };
    if (o.info && f.line >= o.info.from && f.line <= o.info.to) return { kind: 'info' };
  }
  return { kind: 'file' };
}

export interface Placed { file: Finding[]; info: Finding[]; specs: Map<number, Finding[]> }

export function placeFindings(findings: Finding[], o: Outline): Placed {
  const out: Placed = { file: [], info: [], specs: new Map() };
  for (const f of findings) {
    const p = placeFinding(f, o);
    if (p.kind === 'file') out.file.push(f);
    else if (p.kind === 'info') out.info.push(f);
    else out.specs.set(p.index, [...(out.specs.get(p.index) ?? []), f]);
  }
  return out;
}

/** What "Fix" opens: a field of a form (by the key the form shows messages under), a specification, the info section, or nothing. */
export type Target =
  | { kind: 'field'; spec: number; key: string }
  | { kind: 'specification'; spec: number }
  | { kind: 'info'; key: string }
  | { kind: 'file' };

const FACET_KINDS: readonly FacetKind[] = ['entity', 'partOf', 'classification', 'attribute', 'property', 'material'];
const FIRST_FIELD: Record<FacetKind, string> = { entity: 'name', attribute: 'name', classification: 'system', property: 'propertySet', material: 'value', partOf: 'entity' };
const VALUE_FIELDS = ['name', 'predefinedType', 'value', 'system', 'propertySet', 'baseName'];
const INFO_FIELDS = ['title', 'copyright', 'version', 'description', 'author', 'date', 'purpose', 'milestone'];

function facetField(f: Facet, rest: string[], finding: Pick<Finding, 'code' | 'message'>): string {
  if (f.kind === 'partOf') return /^cardinality-/.test(finding.code) ? 'cardinality' : 'entity';
  if (rest.length && VALUE_FIELDS.includes(rest[0])) return rest[0];
  if (finding.code === 'cardinality-conflicts-datatype' || finding.code === 'property-datatype-invalid' || finding.code === 'value-needs-datatype' || /'dataType'/.test(finding.message)) return 'dataType';
  if (/^cardinality-/.test(finding.code) || /'cardinality'/.test(finding.message)) return f.kind === 'entity' ? 'name' : 'cardinality';
  return FIRST_FIELD[f.kind];
}

/** The place in the open document a finding concerns. Pure: the engine's path and code, and the document model. */
export function targetOf(f: Pick<Finding, 'path' | 'line' | 'code' | 'message'>, doc: IdsDocument, o: Outline): Target {
  const place = placeFinding(f, o);
  if (place.kind === 'file') return { kind: 'file' };
  if (place.kind === 'info') {
    const tag = /^ids\/info(?:\[1\])?\/([A-Za-z]+)/.exec(f.path ?? '')?.[1];
    return { kind: 'info', key: `info.${tag && INFO_FIELDS.includes(tag) ? tag : 'title'}` };
  }
  const s = doc.specifications[place.index];
  if (!s) return { kind: 'file' };
  const field = (k: string): Target => ({ kind: 'field', spec: place.index, key: k });
  const rest = (SPEC_PATH.exec(f.path ?? '')?.[2] ?? '').split('/').filter(Boolean);
  if (rest.length === 0) {
    if (f.code === 'ifc-version-invalid' || /'ifcVersion'/.test(f.message)) return field(`${s.uid}.ifcVersion`);
    if (f.code === 'requirements-not-allowed' || f.code === 'requirements-needed') return field(`${s.uid}.requirements`);
    if (f.code === 'applicability-missing') return field(`${s.uid}.applicability`);
    if (f.code === 'xsd-missing-attribute' && /'name'/.test(f.message)) return field(`${s.uid}.name`);
    return { kind: 'specification', spec: place.index };
  }
  const section = rest[0].replace(/\[\d+\]$/, '');
  if (section !== 'applicability' && section !== 'requirements') return { kind: 'specification', spec: place.index };
  if (rest.length === 1) {
    if (section === 'applicability' && (f.code === 'cardinality-invalid' || /'(min|max)Occurs'/.test(f.message))) return field(`${s.uid}.occurs`);
    return field(`${s.uid}.${section}`);
  }
  const m = /^([A-Za-z]+)(?:\[(\d+)\])?$/.exec(rest[1]);
  const kind = m?.[1] as FacetKind | undefined;
  if (!kind || !FACET_KINDS.includes(kind)) return field(`${s.uid}.${section}`);
  const facet = s[section].filter((x) => x.kind === kind)[m![2] ? Number(m![2]) - 1 : 0];
  if (!facet) return field(`${s.uid}.${section}`);
  return field(`${facet.uid}.${facetField(facet, rest.slice(2), f)}`);
}
