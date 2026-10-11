// The engine's sentences in the user's terms, keyed by the finding's code, with the engine's own sentence kept.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkIds } from '@idsbench/check';
import { codeCoverage, ENGINE_CODES, KEPT_AS_THE_ENGINE_SAYS, plainFinding } from '../src/core/plain';

const here = path.dirname(new URL(import.meta.url).pathname);
const checkSrc = path.join(here, '..', 'packages', 'check', 'src');
const corpus = path.join(here, '..', 'packages', 'check', 'test', 'fixtures', 'corpus');
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.ids') ? [path.join(d, e.name)] : []));
const f = (code: string, message: string) => ({ code, message });

describe('every code the engine can emit', () => {
  it('ENGINE_CODES is the set of codes in the engine\'s source', () => {
    const src = fs.readdirSync(checkSrc).filter((n) => n.endsWith('.ts') && !/generated/.test(n)).map((n) => fs.readFileSync(path.join(checkSrc, n), 'utf8')).join('\n');
    const found = new Set<string>();
    for (const m of src.matchAll(/(?:\.error|\.warning|\.perSchema|problemCode)\([^'()]*(?:\([^()]*\)[^'()]*)*,\s*(?:\w+,\s*)?'([a-z]+(?:-[a-z]+)+)'/g)) found.add(m[1]);
    for (const m of src.matchAll(/code:\s*'([a-z]+(?:-[a-z]+)+)'/g)) found.add(m[1]);
    for (const m of src.matchAll(/'(restriction-facet-not-for-text|restriction-base-invalid)'/g)) found.add(m[1]);
    expect([...found].sort()).toEqual([...ENGINE_CODES].sort());
  });

  it('all but two have a sentence in plain words, and the two that have none keep the engine\'s', () => {
    const c = codeCoverage();
    expect(c).toEqual({ total: 42, translated: 40, fallback: ['xsd-engine-failure', 'xsd-other'] });
    for (const code of KEPT_AS_THE_ENGINE_SAYS) {
      const p = plainFinding(f(code, 'The schema check reported: x'));
      expect(p).toEqual({ plain: 'The schema check reported: x', technical: 'The schema check reported: x', translated: false });
    }
  });

  it('every finding the engine gives on the 700+ files of the corpora is translated (not shown in its XML words)', async () => {
    let total = 0;
    const left: string[] = [];
    const codes = new Set<string>();
    for (const file of walk(corpus)) {
      for (const x of (await checkIds(fs.readFileSync(file, 'utf8'))).findings) {
        total++; codes.add(x.code);
        const p = plainFinding(x);
        if (!p.translated) left.push(`${x.code}: ${x.message}`);
        expect(p.technical).toBe(x.message);
      }
    }
    expect(left).toEqual([]);
    expect(total).toBeGreaterThan(150);
    expect(codes.size).toBeGreaterThanOrEqual(30);
    for (const c of codes) expect(ENGINE_CODES).toContain(c);
  }, 120_000);

  it('the three codes the corpus never produces are translated from the engine\'s wording in its source', () => {
    expect(plainFinding(f('value-empty', 'The partOf facet needs an entity saying what the element is part of; none was found.')).translated).toBe(true);
    expect(plainFinding(f('xsd-missing-attribute', "<specification> needs the attribute 'name'; add it.")).plain).toBe('A specification must have its name. Add it.');
    expect(plainFinding(f('xsd-unexpected-text', 'The element <applicability> contains text, but it may only contain other elements.')).translated).toBe(true);
  });
});

describe('the sentences asked for', () => {
  it('xs:integer: a whole number, such as 42, not 42.0', () => {
    expect(plainFinding(f('value-invalid-for-type', "The value '42.0' is not a valid xs:integer value, which is what IFCINTEGER needs.")).plain).toBe('The value 42.0 must be a whole number, such as 42, not 42.0, because IFCINTEGER needs that.');
    expect(plainFinding(f('xsd-invalid-value', "The attribute 'minOccurs' on <applicability> is '1.0', which is not a valid integer value.")).plain).toBe('The minOccurs of the "Applies to" part (1.0) must be a whole number, such as 1, not 1.0.');
  });
  it('the incomplete <specifications> element: add at least one specification', () => {
    expect(plainFinding(f('xsd-missing-element', 'The element <specifications> is incomplete; it needs <specification>.')).plain).toBe('Add at least one specification.');
  });
  it('minOccurs larger than maxOccurs', () => {
    expect(plainFinding(f('cardinality-invalid', 'The applicability occurrence is invalid: minOccurs 1 is larger than maxOccurs 0. Use minOccurs="1" maxOccurs="unbounded" (required), minOccurs="0" maxOccurs="unbounded" (optional) or minOccurs="0" maxOccurs="0" (prohibited).')).plain)
      .toBe("This specification is marked both 'must exist' and 'must not exist'. Choose one.");
  });
  it('requirements on a prohibited specification', () => {
    expect(plainFinding(f('requirements-not-allowed', 'A specification whose applicability is prohibited (maxOccurs="0") cannot have requirements; remove them or change the applicability.')).plain)
      .toBe('A specification that says elements must not exist cannot also list what they must have. Remove the "Must have" items, or choose another option.');
  });
  it('keeps the engine\'s sentence, exactly, beside the plain one', () => {
    const m = 'The element <specifications> is incomplete; it needs <specification>.';
    expect(plainFinding(f('xsd-missing-element', m))).toEqual({ plain: 'Add at least one specification.', technical: m, translated: true });
  });
});
