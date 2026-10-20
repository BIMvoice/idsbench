/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Layer 1: validate the document against the official IDS XSD with libxml2 compiled to WebAssembly
// (npm: xmllint-wasm). All schema files are bundled (see schemas.generated.ts); nothing is fetched at runtime.
import { memoryPages, validateXML } from 'xmllint-wasm';
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

/**
 * The schema validator could not finish, for a reason of its own (most often it ran out of memory): it said nothing
 * about the file, so there is no verdict. Never reported as a finding, which would call a valid file not valid.
 */
export class ValidatorFailed extends Error {
  /** True when the validator ran out of memory. */
  readonly outOfMemory: boolean;
  constructor(detail: string, outOfMemory: boolean) {
    super(`The schema validator could not finish: ${detail}`);
    this.name = 'ValidatorFailed';
    this.outOfMemory = outOfMemory;
  }
}

/**
 * The most memory libxml2 may take for a document of this many characters, in WebAssembly pages of 64 KiB: sixteen
 * times the document and 32 MiB, never more than the 4 GiB WebAssembly allows. Measured in Node with xmllint-wasm
 * 5.3.0, the least it needed was about 4.7 times the document and 16 MiB for files of simple specifications (15, 30 and
 * 64 MB) and 6.4 times for 30 MB of long enumerations. The limit is a ceiling, not an allocation: the memory grows only
 * as far as the document needs.
 */
export function memoryPagesFor(chars: number): number {
  return Math.min(memoryPages.max, 2 * memoryPages.defaultInitialMemoryPages + Math.ceil((chars * 16) / (64 * 1024)));
}

/**
 * libxml2's own out-of-memory error, as xmllint prints it: `document.xml:54464: error: libxml2: out of memory`, or the
 * message alone. Matched as a whole line, because the rest of what the validator prints quotes the file: a value
 * (`ifcVersion="OOM"`), and after a parser error a line of the file itself.
 */
const LIBXML2_OUT_OF_MEMORY = /^(?:[^\s:]+:\d+: (?:[a-z ]+ )?error ?: )?libxml2: out of memory$/;
/**
 * The WebAssembly runtime's own: memory for the validator could not be had (V8's RangeError, as a failed Worker's
 * ErrorEvent states it), or the runtime gave up for want of it (Emscripten's `Aborted(OOM)`). Matched at the start of
 * the message, which these errors write themselves; never in xmllint's output.
 */
const RUNTIME_OUT_OF_MEMORY = /^(?:Uncaught )?(?:RangeError: (?:WebAssembly\.(?:Memory|Memory\.grow|Instance|instantiate)\(\)|Out of memory: Cannot allocate Wasm memory)|(?:RuntimeError: )?Aborted\(OOM\))/;

/** True when one of the lines of xmllint's output is libxml2 saying it ran out of memory. A line of the file that libxml2 quotes (it is followed by a caret line) is not. */
export function libxml2OutOfMemory(output: string): boolean {
  const lines = output.split('\n');
  return lines.some((l, i) => LIBXML2_OUT_OF_MEMORY.test(l) && !/^\s*\^\s*$/.test(lines[i + 1] ?? ''));
}

/** True when the validator's failure `e` is its running out of memory: xmllint's exit code 9, libxml2's own message, or the runtime's. */
export function failedForWantOfMemory(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  if (code === 9) return true;
  const text = String((e as { message?: unknown })?.message ?? e);
  // An exit code means the text is xmllint's output, which quotes the file: only libxml2's own line counts there.
  return typeof code === 'number' ? libxml2OutOfMemory(text) : RUNTIME_OUT_OF_MEMORY.test(text) || libxml2OutOfMemory(text);
}

export interface XsdOptions {
  /** The memory ceiling, in WebAssembly pages; by default memoryPagesFor the document. */
  maxMemoryPages?: number;
  /** Stops the validation: its Worker is ended at once and the call rejects with the signal's reason. */
  signal?: AbortSignal;
}

type Validation = ReturnType<typeof validateXML>;

/**
 * validateXML, with its Worker ended when `signal` aborts. xmllint-wasm starts a Worker for each call and ends it only
 * when the call settles, so a validation the page no longer waits for (given up, or replaced by a newer check) would
 * go on working, and holding its memory, beside the next one. The Worker is made synchronously inside validateXML, so
 * it is caught by putting a subclass in place of the global Worker for the length of that one synchronous call. In
 * Node, where xmllint-wasm takes its Worker from worker_threads, there is nothing to catch: the call still rejects at
 * once, and the Worker ends when it is done.
 */
function validateStoppable(options: Parameters<typeof validateXML>[0], signal?: AbortSignal): Validation {
  if (!signal) return validateXML(options);
  signal.throwIfAborted();
  const scope = globalThis as { Worker?: typeof Worker };
  const Original = scope.Worker;
  let started: { terminate(): void } | undefined;
  if (Original) {
    scope.Worker = class extends Original {
      constructor(...args: ConstructorParameters<typeof Worker>) { super(...args); started = this; }
    };
  }
  let running: Validation;
  try { running = validateXML(options); } finally { if (Original) scope.Worker = Original; }
  return new Promise((resolve, reject) => {
    const stop = () => { started?.terminate(); reject(signal.reason); };
    signal.addEventListener('abort', stop, { once: true });
    running.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

/** Throws ValidatorFailed when the validator could not finish, and the signal's reason when it was stopped. */
export async function validateAgainstXsd(xml: string, tree?: XNode, options: XsdOptions = {}): Promise<XsdOutcome> {
  const schema = localise(ids10);
  let raw: string;
  try {
    const res = await validateStoppable({
      xml: [{ fileName: 'document.xml', contents: xml }],
      schema: [{ fileName: 'ids.xsd', contents: schema }],
      preload: [
        { fileName: 'xml.xsd', contents: xmlXsd },
        { fileName: 'XMLSchema.xsd', contents: xmlSchema },
        { fileName: 'XMLSchema-instance.xsd', contents: XSI_STUB },
      ],
      initialMemoryPages: memoryPages.defaultInitialMemoryPages,
      maxMemoryPages: options.maxMemoryPages ?? memoryPagesFor(xml.length),
      // Without it libxml2 calls a valid file with a text node over 10 MB not well-formed ("Resource limit exceeded"):
      // the page reads files of up to 100 MB, and how much memory the validator may take is set above.
      modifyArguments: (args) => ['--huge', ...args],
    }, options.signal);
    raw = res.rawOutput;
  } catch (e) {
    if (options.signal?.aborted) throw options.signal.reason;
    // xmllint ended with another exit code than valid (0) or not valid (3, 4). 9 is its code for "out of memory": its
    // message is then sometimes only a piece of the file, because there was no memory left to write the sentence. In a
    // browser a Worker that failed hands over an ErrorEvent, whose message says what happened.
    const text = String((e as { message?: unknown })?.message ?? e);
    const outOfMemory = failedForWantOfMemory(e);
    throw new ValidatorFailed(outOfMemory ? 'it ran out of memory' : text.split('\n')[0], outOfMemory);
  }
  // A validator that ran out of memory part of the way has not looked at the rest of the file.
  if (libxml2OutOfMemory(raw)) throw new ValidatorFailed('it ran out of memory', true);
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
  /** The line libxml2 gave each schema finding (a finding it cannot place has none of its own). */
  const reportedAt = new Map<Finding, number>();
  let notWellFormed = false;
  // For each line, its first element and its elements of each name (the first, and how many): what a finding at that
  // line is placed on. And for each name, the first element of it in the file and how many there are.
  const byLine = new Map<number, OnLine>();
  const byName = new Map<string, Counted>();
  const count = (m: Map<string, Counted>, n: XNode) => {
    const c = m.get(n.name);
    if (c) c.count++; else m.set(n.name, { node: n, count: 1 });
  };
  if (tree) {
    walk(tree, (n) => {
      let at = byLine.get(n.line);
      if (!at) byLine.set(n.line, (at = { first: n, named: new Map() }));
      count(at.named, n);
      count(byName, n);
    });
  }
  const index: Index = { byLine, byName };

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
    const f = mapValidity(text, line, index);
    reportedAt.set(f, line);
    findings.push(f);
  }
  // The attribute list type repeats the enumeration error just above it: it goes when another invalid-value finding is
  // on the line libxml2 gave it. Counted once per line, not looked for once per finding, which took seconds for 80,000
  // findings.
  const at = (f: Finding) => reportedAt.get(f) ?? f.line;
  const invalidValues = new Map<number | undefined, number>();
  for (const f of findings) if (f.code === 'xsd-invalid-value') invalidValues.set(at(f), (invalidValues.get(at(f)) ?? 0) + 1);
  const dedup = findings.filter(
    (f) => !(f.message.includes('is not a valid value of the local list type') && (invalidValues.get(at(f)) ?? 0) - (f.code === 'xsd-invalid-value' ? 1 : 0) > 0),
  );
  return { notWellFormed, findings: dedup };
}

interface Counted { node: XNode; count: number }
interface OnLine { first: XNode; named: Map<string, Counted> }
interface Index { byLine: Map<number, OnLine>; byName: Map<string, Counted> }

/**
 * libxml2 keeps the line of an element in 16 bits: from line 65,535 on, the line it gives for a schema error is not the
 * element's (65,535 itself, or the line of a text node near it), and a line there may belong to the next specification.
 */
const FIRST_UNSURE_LINE = 65_535;
const FAR_IN_FILE =
  'The schema check cannot say where in the file this is: past line 65,534 the line numbers it gives are not reliable.';
const SAME_LINE = (line: number, name: string) =>
  `The schema check gives only the line, and line ${line} holds more than one <${name}>, so which one it is cannot be said.`;

/**
 * The element a schema error at `line` is about. libxml2 gives only the line, so it is the element of that name on that
 * line, or the only one of that name in the file. When neither says which element it is (several of that name on the
 * line, as in a file written on one line, or a line libxml2 cannot count), the finding is not placed on any element or
 * line, and its `unplaced` says why: placing it on a guess would point at the wrong specification.
 */
function locate(elementName: string | undefined, line: number, index: Index): { node?: XNode; line?: number; unsure?: string } {
  const only = elementName ? index.byName.get(elementName) : undefined;
  if (only?.count === 1) return { node: only.node, line: line < FIRST_UNSURE_LINE ? line : only.node.line };
  if (line >= FIRST_UNSURE_LINE) return { unsure: FAR_IN_FILE };
  if (!elementName) return { line };
  const at = index.byLine.get(line);
  if (!at) return { line };
  const named = at.named.get(elementName);
  if (named && named.count > 1) return { unsure: SAME_LINE(line, elementName) };
  return { node: named?.node ?? at.first, line };
}

function mapValidity(text: string, reported: number, index: Index): Finding {
  const el = /^Element '([^']+)'(?:, attribute '([^']+)')?: (.*)$/.exec(text);
  const elementName = el ? localName(el[1]) : undefined;
  const attrName = el?.[2];
  const rest = el ? el[3] : text;
  const { node, line, unsure } = locate(elementName, reported, index);
  const where = (f: Omit<Finding, 'line' | 'column' | 'path' | 'severity'>): Finding => ({
    severity: 'error',
    ...f,
    line,
    column: node?.column || undefined,
    path: node ? pathOf(node) : undefined,
    ...(unsure ? { unplaced: unsure } : {}),
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
