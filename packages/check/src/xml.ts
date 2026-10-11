import { DOMParser } from '@xmldom/xmldom';

/** A light element tree with source positions. Namespaces and prefixes are ignored (local names only). */
export interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: XNode[];
  /** Concatenated text of the element's own text nodes. */
  text: string;
  line: number;
  column: number;
  parent?: XNode;
  /** 1-based position among siblings with the same name. */
  index: number;
}

export function parseTree(xml: string): { root?: XNode; error?: string } {
  const errors: string[] = [];
  let doc;
  try {
    doc = new DOMParser({
      onError: (level, msg) => {
        if (level !== 'warning') errors.push(String(msg));
      },
    }).parseFromString(xml, 'text/xml');
  } catch (e) {
    return { error: String((e as Error).message ?? e) };
  }
  if (errors.length > 0 || !doc || !doc.documentElement) {
    return { error: errors[0] ?? 'no root element' };
  }
  return { root: convert(doc.documentElement as unknown as DomEl, undefined, 1) };
}

interface DomEl {
  localName?: string | null;
  nodeName: string;
  attributes: ArrayLike<{ name: string; localName?: string | null; namespaceURI?: string | null; value: string }>;
  childNodes: ArrayLike<{ nodeType: number; data?: string }>;
  lineNumber?: number;
  columnNumber?: number;
}

function convert(el: DomEl, parent: XNode | undefined, index: number): XNode {
  const attrs: Record<string, string> = {};
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    if (a.name.startsWith('xmlns')) continue;
    attrs[a.localName ?? a.name] = a.value;
  }
  const node: XNode = {
    name: el.localName ?? el.nodeName,
    attrs,
    children: [],
    text: '',
    line: el.lineNumber ?? 0,
    column: el.columnNumber ?? 0,
    parent,
    index,
  };
  const counts = new Map<string, number>();
  for (let i = 0; i < el.childNodes.length; i++) {
    const c = el.childNodes[i];
    if (c.nodeType === 1) {
      const ce = c as unknown as DomEl;
      const nm = ce.localName ?? ce.nodeName;
      const n = (counts.get(nm) ?? 0) + 1;
      counts.set(nm, n);
      node.children.push(convert(ce, node, n));
    } else if (c.nodeType === 3 || c.nodeType === 4) {
      node.text += c.data ?? '';
    }
  }
  return node;
}

export function pathOf(n: XNode): string {
  const parts: string[] = [];
  for (let cur: XNode | undefined = n; cur; cur = cur.parent) {
    const same = cur.parent ? cur.parent.children.filter((c) => c.name === cur!.name).length : 1;
    parts.unshift(same > 1 ? `${cur.name}[${cur.index}]` : cur.name);
  }
  return parts.join('/');
}

export function child(n: XNode | undefined, name: string): XNode | undefined {
  return n?.children.find((c) => c.name === name);
}

export function walk(n: XNode, fn: (n: XNode) => void): void {
  fn(n);
  for (const c of n.children) walk(c, fn);
}
