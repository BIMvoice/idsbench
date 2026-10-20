/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Layer 1: validate the document against the official IDS XSD with libxml2 compiled to WebAssembly
// (npm: xmllint-wasm). All schema files are bundled (see schemas.generated.ts); nothing is fetched at runtime.
import { validateXML } from 'xmllint-wasm';
import { ids10, xml as xmlXsd, xmlSchema } from './schemas.generated.ts';
import type { Finding } from './types.ts';
import { pathOf, walk, type XNode } from './xml.ts';

const XSI_STUB =
  '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://www.w3.org/2001/XMLSchema-instance"/>';

/** The official files point at w3.org URLs; point them at the in-memory copies instead. */
function localise(xsd: string): string {
  return xsd
    .replace('schemaLocation="http://www.w3.org/2001/xml.xsd"', 'schemaLocation="xml.xsd"')
    .replace('schemaLocation="http://www.w3.org/2001/XMLSchema.xsd"', 'schemaLocation="XMLSchema.xsd"')
    .replace('schemaLocation="http://www.w3.org/2001/XMLSchema-instance"', 'schemaLocation="XMLSchema-instance.xsd"');
}

export interface XsdOutcome {
  /** True when the document could not even be parsed as XML. */
  notWellFormed: boolean;
  findings: Finding[];
}

export async function validateAgainstXsd(xml: string, tree?: XNode): Promise<XsdOutcome> {
  const schema = localise(ids10);
  let raw: string;
  try {
    const res = await validateXML({
      xml: [{ fileName: 'document.xml', contents: xml }],
      schema: [{ fileName: 'ids.xsd', contents: schema }],
      preload: [
        { fileName: 'xml.xsd', contents: xmlXsd },
        { fileName: 'XMLSchema.xsd', contents: xmlSchema },
        { fileName: 'XMLSchema-instance.xsd', contents: XSI_STUB },
      ],
      initialMemoryPages: 256,
      maxMemoryPages: 2048,
    });
    raw = res.rawOutput;
  } catch (e) {
    return {
      notWellFormed: false,
      findings: [
        { severity: 'error', code: 'xsd-engine-failure', message: `The schema validator could not run: ${String((e as Error).message ?? e).split('\n')[0]}` },
      ],
    };
  }
  return interpret(raw, tree);
}

function localName(q: string): string {
  return q.replace(/^\{[^}]*\}/, '');
}

function plainList(s: string): string {
  return s
    .replace(/^\(\s*|\s*\)$/g, '')
    .split(/,\s*/)
    .map((x) => `<${localName(x.trim())}>`)
    .join(', ');
}

export function interpret(raw: string, tree?: XNode): XsdOutcome {
  const lines = raw.split('\n');
  const findings: Finding[] = [];
  let notWellFormed = false;
  // For each line, its first element and its first element of each name: what a finding at that line is placed on.
  const byLine = new Map<number, OnLine>();
  if (tree) {
    walk(tree, (n) => {
      const at = byLine.get(n.line);
      if (!at) byLine.set(n.line, { first: n, named: new Map([[n.name, n]]) });
      else if (!at.named.has(n.name)) at.named.set(n.name, n);
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const m = /^[^:]+:(\d+): (parser error|Schemas validity error|Schemas parser error|Schemas parser warning|[a-z ]+error) : (.*)$/.exec(lines[i]);
    if (!m) continue;
    const line = parseInt(m[1], 10);
    const kind = m[2];
    const text = m[3];
    if (kind === 'parser error') {
      notWellFormed = true;
      // libxml2 prints the source line and a caret under the offending column
      const caret = lines[i + 2];
      const column = caret && /^\s*\^\s*$/.test(caret) ? caret.indexOf('^') + 1 : undefined;
      findings.push({
        severity: 'error',
        code: 'xml-not-well-formed',
        message: `The file is not well-formed XML: ${text.replace(/ line \d+$/, '')} (line ${line}${column ? `, column ${column}` : ''}).`,
        line,
        column,
      });
      break;
    }
    if (kind !== 'Schemas validity error') {
      findings.push({ severity: 'error', code: 'xsd-other', message: `The schema check reported: ${text}`, line });
      continue;
    }
    findings.push(mapValidity(text, line, byLine));
  }
  // The attribute list type repeats the enumeration error just above it.
  const dedup = findings.filter(
    (f, idx) => !(f.message.includes('is not a valid value of the local list type') && findings.some((g, j) => j !== idx && g.line === f.line && g.code === 'xsd-invalid-value')),
  );
  return { notWellFormed, findings: dedup };
}

interface OnLine { first: XNode; named: Map<string, XNode> }

function mapValidity(text: string, line: number, byLine: Map<number, OnLine>): Finding {
  const el = /^Element '([^']+)'(?:, attribute '([^']+)')?: (.*)$/.exec(text);
  const elementName = el ? localName(el[1]) : undefined;
  const attrName = el?.[2];
  const rest = el ? el[3] : text;
  const at = byLine.get(line);
  const node = elementName && at ? at.named.get(elementName) ?? at.first : undefined;
  const where = (f: Omit<Finding, 'line' | 'column' | 'path' | 'severity'>): Finding => ({
    severity: 'error',
    ...f,
    line,
    column: node?.column || undefined,
    path: node ? pathOf(node) : undefined,
  });
  let m: RegExpExecArray | null;
  if ((m = /^This element is not expected\. Expected is (?:one of )?(\(.*\))\.?$/.exec(rest))) {
    return where({ code: 'xsd-unexpected-element', message: `The element <${elementName}> is not allowed here; expected ${plainList(m[1])}.` });
  }
  if (/^This element is not expected\.?$/.test(rest)) {
    return where({ code: 'xsd-unexpected-element', message: `The element <${elementName}> is not allowed here.` });
  }
  if ((m = /^Missing child element\(s\)\. Expected is (?:one of )?(\(.*\))\.?$/.exec(rest))) {
    return where({ code: 'xsd-missing-element', message: `The element <${elementName}> is incomplete; it needs ${plainList(m[1])}.` });
  }
  if ((m = /^The attribute '([^']+)' is not allowed\.?$/.exec(rest))) {
    return where({ code: 'xsd-unexpected-attribute', message: `The attribute '${m[1]}' is not allowed on <${elementName}>; remove it.` });
  }
  if ((m = /^The attribute '([^']+)' is required but missing\.?$/.exec(rest))) {
    return where({ code: 'xsd-missing-attribute', message: `<${elementName}> needs the attribute '${m[1]}'; add it.` });
  }
  if ((m = /^\[facet 'enumeration'\] The value '([^']*)' is not an element of the set \{(.*)\}\.?$/.exec(rest))) {
    const allowed = m[2].replace(/'/g, '').split(/,\s*/).map((x) => `'${x}'`).join(', ');
    return where({ code: 'xsd-invalid-value', message: `${attrName ? `The attribute '${attrName}' on <${elementName}>` : `<${elementName}>`} is '${m[1]}', but it must be one of ${allowed}.` });
  }
  if ((m = /^\[facet 'pattern'\] The value '([^']*)' is not accepted by the pattern '([^']*)'\.?$/.exec(rest))) {
    return where({ code: 'xsd-invalid-value', message: `${attrName ? `The attribute '${attrName}' on <${elementName}>` : `<${elementName}>`} is '${m[1]}', which does not match the required form ${m[2]}.` });
  }
  if ((m = /^'([^']*)' is not a valid value of the (?:atomic|list|union) type '([^']*)'\.?$/.exec(rest))) {
    const subject = attrName ? `The attribute '${attrName}' on <${elementName}>` : `<${elementName}>`;
    return where({ code: 'xsd-invalid-value', message: `${subject} is '${m[1]}', which is not a valid ${m[2].replace('xs:', '')} value.` });
  }
  if ((m = /^(?:\[facet '[^']+'\] )?(?:The value '([^']*)' )?(?:is not a valid value of|has a length of|is not accepted by).*$/.exec(rest)) && attrName) {
    return where({ code: 'xsd-invalid-value', message: `The attribute '${attrName}' on <${elementName}> has an invalid value: ${rest}` });
  }
  if (/^Character content other than whitespace is not allowed/.test(rest)) {
    return where({ code: 'xsd-unexpected-text', message: `The element <${elementName}> contains text, but it may only contain other elements.` });
  }
  if (/^No matching global declaration available for the validation root/.test(rest)) {
    return where({ code: 'xsd-unexpected-element', message: `The root element <${elementName}> is not <ids> in the IDS namespace (http://standards.buildingsmart.org/IDS).` });
  }
  return where({ code: 'xsd-other', message: `<${elementName ?? 'document'}>: ${rest}` });
}
