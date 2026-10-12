/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// A "value" in an IDS facet is either a <simpleValue> or an <xs:restriction>. This module models both and
// answers "which of these candidate strings can the value match?", which is how the audit tool tells that a
// facet can never match anything in the stated IFC version.
import { type XNode } from './xml.ts';

export type Problem =
  | { kind: 'no-match'; what: 'value' | 'enumeration' | 'pattern' | 'length'; value: string; candidates: string[] }
  | { kind: 'bad-base'; base: string }
  | { kind: 'total-digits' };

export interface MatchResult {
  matches: string[];
  problems: Problem[];
}

export class Matcher {
  readonly simple?: string;
  readonly restriction?: XNode;
  readonly base: string;
  constructor(public readonly holder: XNode) {
    const first = holder.children.find((c) => c.name === 'simpleValue' || c.name === 'restriction');
    if (first?.name === 'simpleValue') this.simple = first.text;
    else if (first) this.restriction = first;
    this.base = first?.name === 'restriction' ? first.attrs['base'] ?? '' : '';
  }

  static of(holder: XNode | undefined): Matcher | undefined {
    if (!holder) return undefined;
    const m = new Matcher(holder);
    return m.simple === undefined && !m.restriction ? undefined : m;
  }

  /** Values that are spelled out (simple value, enumerations, range bounds). */
  discreteValues(): string[] {
    if (this.simple !== undefined) return [this.simple];
    const out: string[] = [];
    for (const c of this.restriction?.children ?? []) {
      if (['enumeration', 'minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive'].includes(c.name)) {
        out.push(c.attrs['value'] ?? '');
      }
    }
    return out;
  }

  /** True when the value is absent or can only match an empty string. */
  isNullOrEmpty(): boolean {
    if (this.simple !== undefined) return this.simple === '';
    if (this.restriction) return this.tryMatch(['']).length > 0;
    return true;
  }

  startsWith(prefix: string): boolean {
    if (this.simple !== undefined) return this.simple.startsWith(prefix);
    return (this.restriction?.children ?? []).some((c) => c.name === 'enumeration' && (c.attrs['value'] ?? '').startsWith(prefix));
  }

  tryMatch(candidates: string[]): string[] {
    return this.run(candidates).matches;
  }

  mustMatch(candidates: string[]): MatchResult {
    return this.run(candidates);
  }

  private run(candidates: string[]): MatchResult {
    if (this.simple !== undefined) {
      const matches = candidates.filter((c) => c === this.simple);
      return {
        matches,
        problems: matches.length ? [] : [{ kind: 'no-match', what: 'value', value: this.simple, candidates }],
      };
    }
    const r = this.restriction!;
    if (this.base !== '' && this.base !== 'xs:string') {
      return { matches: [], problems: [{ kind: 'bad-base', base: this.base }] };
    }
    const problems: Problem[] = [];
    // Facets other than enumeration/pattern are AND-ed in document order; enumerations are OR-ed together and
    // patterns are OR-ed together, and those two groups are applied after the others.
    const enums = r.children.filter((c) => c.name === 'enumeration');
    const pats = r.children.filter((c) => c.name === 'pattern');
    const singles = r.children.filter((c) => c.name === 'length' || c.name === 'totalDigits');
    let anyCondition = false;
    let acc: string[] | undefined;
    const apply = (groupMatches: string[]) => {
      acc = acc === undefined ? groupMatches : acc.filter((x) => groupMatches.includes(x));
    };
    for (const s of singles) {
      anyCondition = true;
      if (s.name === 'totalDigits') {
        problems.push({ kind: 'total-digits' });
        apply([]);
      } else {
        const n = /^[+-]?\d+$/.test((s.attrs['value'] ?? '').trim()) ? parseInt(s.attrs['value']!, 10) : NaN;
        const m = Number.isNaN(n) ? [] : candidates.filter((x) => x.length === n);
        if (m.length === 0) problems.push({ kind: 'no-match', what: 'length', value: s.attrs['value'] ?? '', candidates });
        apply(m);
      }
    }
    if (enums.length) {
      anyCondition = true;
      const values = enums.map((e) => e.attrs['value'] ?? '');
      const m = candidates.filter((x) => values.includes(x));
      if (m.length === 0) problems.push({ kind: 'no-match', what: 'enumeration', value: values.join(', '), candidates });
      apply(m);
    }
    if (pats.length) {
      anyCondition = true;
      const res = pats.map((p) => compilePattern(p.attrs['value'] ?? ''));
      const m = candidates.filter((x) => res.some((re) => re && re.test(x)));
      if (m.length === 0) problems.push({ kind: 'no-match', what: 'pattern', value: pats.map((p) => p.attrs['value'] ?? '').join(' | '), candidates });
      apply(m);
    }
    return { matches: anyCondition ? acc ?? [] : [], problems };
  }

  /**
   * Each enumeration option on its own must match at least one candidate (so a typo hiding among valid options
   * is reported). Only meaningful for restrictions.
   */
  eachEnumerationMatches(candidates: string[]): Problem[] {
    const out: Problem[] = [];
    for (const e of this.restriction?.children.filter((c) => c.name === 'enumeration') ?? []) {
      const v = e.attrs['value'] ?? '';
      if (!candidates.includes(v)) out.push({ kind: 'no-match', what: 'enumeration', value: v, candidates });
    }
    return out;
  }
}

const patternCache = new Map<string, RegExp | null>();

/** XSD regular expressions are implicitly anchored; \i \c \d \w use XML character classes. */
export function compilePattern(pattern: string): RegExp | null {
  if (patternCache.has(pattern)) return patternCache.get(pattern)!;
  const src = '^(?:' + translateXsdRegex(pattern) + ')$';
  let re: RegExp | null = null;
  for (const flags of ['su', 's']) {
    try {
      re = new RegExp(src, flags);
      break;
    } catch {
      re = null;
    }
  }
  patternCache.set(pattern, re);
  return re;
}

const NAME_START = 'A-Za-z_:\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD';
const NAME_CHAR = NAME_START + '\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040';

function translateXsdRegex(p: string): string {
  let out = '';
  let inClass = 0;
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '\\' && i + 1 < p.length) {
      const n = p[i + 1];
      i++;
      switch (n) {
        case 'i': out += inClass ? NAME_START : `[${NAME_START}]`; break;
        case 'I': out += inClass ? '' : `[^${NAME_START}]`; break;
        case 'c': out += inClass ? NAME_CHAR : `[${NAME_CHAR}]`; break;
        case 'C': out += inClass ? '' : `[^${NAME_CHAR}]`; break;
        case 'd': out += '\\p{Nd}'; break;
        case 'D': out += '\\P{Nd}'; break;
        case 'w': out += inClass ? '' : '[^\\p{P}\\p{Z}\\p{C}]'; break;
        case 'W': out += inClass ? '' : '[\\p{P}\\p{Z}\\p{C}]'; break;
        default: out += '\\' + n;
      }
      continue;
    }
    if (ch === '[') inClass++;
    else if (ch === ']' && inClass) inClass--;
    out += ch;
  }
  return out;
}

/** Closest candidate by edit distance, for "did you mean" hints. */
export function closest(value: string, candidates: string[], maxDistance = 2): string | undefined {
  let best: string | undefined;
  let bestD = maxDistance + 1;
  const v = value.toUpperCase();
  for (const c of candidates) {
    if (Math.abs(c.length - v.length) > maxDistance) continue;
    const d = lev(v, c.toUpperCase());
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}
