import { describe, expect, it } from 'vitest';
import { checkDocument, isEmail, isDate, patternProblem, valueProblems } from '../src/core/ids/check';
import { newFacet, simple, occursFor, type Facet } from '../src/core/ids/model';
import { blankDocument } from '../src/core/ids/model';
import { doc, entity, fromLength, fromPattern, fromRange, list, property, spec } from './helpers/ids';

const keys = (d: ReturnType<typeof doc>, level: 'error' | 'advice' = 'error') => checkDocument(d).filter((i) => i.level === level).map((i) => i.key.replace(/^u[a-z0-9]+\./, ''));

describe('guard rails', () => {
  it('a valid small document has no errors', () => expect(keys(doc(spec()))).toEqual([]));
  it('a blank document needs a title and a specification', () => {
    expect(keys(blankDocument() as never)).toEqual(['info.title', 'specs']);
  });
  it('a specification with no applicability', () => expect(keys(doc(spec({ applicability: [] })))).toEqual(['applicability']));
  it('a specification needs a name and an IFC version', () => {
    expect(keys(doc(spec({ name: ' ', ifcVersion: [] })))).toEqual(['name', 'ifcVersion']);
  });
  it('an IFC version the schema does not list', () => expect(keys(doc(spec({ ifcVersion: ['IFC4X3'] })))).toEqual(['ifcVersion']));
  it('only one entity facet in an applicability', () => {
    expect(keys(doc(spec({ applicability: [entity('IFCWALL'), entity('IFCDOOR')] })))).toEqual(['applicability']);
  });
  it('an empty required name', () => {
    expect(keys(doc(spec({ applicability: [{ ...entity(''), name: simple('') } as Facet] })))).toHaveLength(1);
  });
  it('a property facet without a property set, or without a name', () => {
    expect(keys(doc(spec({ requirements: [property('', 'N')] })))).toEqual(['propertySet']);
    expect(keys(doc(spec({ requirements: [property('P', ' ')] })))).toEqual(['baseName']);
  });
  it('a classification needs a system (the schema requires it)', () => {
    const f = { ...newFacet('classification', 'requirements'), system: simple('') } as Facet;
    expect(keys(doc(spec({ requirements: [f] })))).toEqual(['system']);
  });
  it('a pattern that is not a valid regular expression', () => {
    expect(patternProblem('[a-')).not.toBeNull();
    expect(patternProblem('(')).not.toBeNull();
    expect(patternProblem('')).not.toBeNull();
    expect(patternProblem('DT[0-9]{2}')).toBeNull();
    expect(keys(doc(spec({ requirements: [property('P', 'N', { dataType: 'IFCLABEL', value: fromPattern('(', 'xs:string') } as never)] })))).toEqual(['value']);
  });
  it('a lower bound above the upper bound', () => {
    const r = (lo: string, hi: string, ex = false) => valueProblems(fromRange({ lower: { value: lo, exclusive: ex }, upper: { value: hi, exclusive: ex } }, 'xs:double'), false);
    expect(r('10', '2')).toHaveLength(1);
    expect(r('2', '10')).toEqual([]);
    expect(r('5', '5')).toEqual([]);
    expect(r('5', '5', true)).toHaveLength(1);
    expect(r('9', '10.5')).toEqual([]);
    expect(r('a', '10')).toHaveLength(1);
  });
  it('lengths', () => {
    expect(valueProblems(fromLength({ exactly: '', atLeast: '5', atMost: '2' }, 'xs:string'), false)).toHaveLength(1);
    expect(valueProblems(fromLength({ exactly: '', atLeast: '-1', atMost: '' }, 'xs:string'), false)).toHaveLength(1);
    expect(valueProblems(fromLength({ exactly: '3', atLeast: '', atMost: '' }, 'xs:string'), false)).toEqual([]);
  });
  it('lists', () => {
    expect(valueProblems(list(), false)).toHaveLength(1);
    expect(valueProblems(list('a', ''), false)).toHaveLength(1);
    expect(valueProblems(list('a', 'b'), false)).toEqual([]);
  });
  it('partOf cannot be optional in requirements', () => {
    const f = { ...newFacet('partOf', 'requirements'), cardinality: 'optional', entity: { name: simple('IFCSPACE'), predefinedType: null } } as Facet;
    expect(keys(doc(spec({ requirements: [f] })))).toEqual(['cardinality']);
  });
  it('author must look like the schema\'s email pattern', () => {
    expect(isEmail('a@b.c')).toBe(true);
    expect(isEmail('petru@bimvoice.com')).toBe(true);
    for (const bad of ['petru', 'a@b', '@b.c', 'a@.c']) expect(isEmail(bad)).toBe(false);
    expect(isEmail('a b@c.d')).toBe(true); // the schema pattern is this loose
    const d = doc(spec()); d.info.author = 'nobody';
    expect(keys(d)).toEqual(['info.author']);
  });
  it('dates', () => {
    expect(isDate('2026-02-28')).toBe(true);
    expect(isDate('2026-02-30')).toBe(false);
    expect(isDate('31/03/2026')).toBe(false);
  });
});

// These four used to be advice. The Check engine reports each as an ERROR, so a file with one would be downloaded
// and then rejected by Check: they now block Download and "Use this IDS in Run" like the schema's own rules.
describe('manual rules the Check engine reports as errors now block', () => {
  it('a value without a data type', () => {
    const d = doc(spec({ requirements: [property('P', 'N', { value: simple('v') } as never)] }));
    expect(keys(d)).toEqual(['dataType']);
  });
  it('optional without a value (property: without a data type)', () => {
    expect(keys(doc(spec({ requirements: [property('P', 'N', { cardinality: 'optional' } as never)] })))).toEqual(['cardinality']);
    expect(keys(doc(spec({ requirements: [property('P', 'N', { cardinality: 'optional', dataType: 'IFCLABEL' } as never)] })))).toEqual([]);
  });
  it('IFC class names not in capitals', () => {
    expect(keys(doc(spec({ applicability: [{ ...entity('IfcWall') } as Facet] })))).toEqual(['name']);
  });
  it('requirements on a prohibited specification, and none on an optional one', () => {
    expect(keys(doc(spec({ ...occursFor('prohibited'), requirements: [property('P', 'N')] })))).toEqual(['requirements']);
    expect(keys(doc(spec({ ...occursFor('optional'), requirements: [] })))).toEqual(['requirements']);
  });
  it('a property prohibited with a data type', () => {
    expect(keys(doc(spec({ requirements: [property('P', 'N', { cardinality: 'prohibited', dataType: 'IFCLABEL' } as never)] })))).toEqual(['cardinality']);
  });
  it('a number of matching elements IDS 1.0 does not allow', () => {
    expect(keys(doc(spec({ minOccurs: '2', maxOccurs: '3' })))).toEqual(['occurs']);
  });
});

describe('advice (the engine does not report it) never blocks', () => {
  it('a predefined type not in capitals', () => {
    const d = doc(spec({ applicability: [{ ...entity('IFCWALL'), predefinedType: simple('shear') } as Facet] }));
    expect(keys(d)).toEqual([]);
    expect(keys(d, 'advice')).toEqual(['predefinedType']);
  });
});
