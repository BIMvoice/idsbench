import { describe, expect, it } from 'vitest';
import { describeSpecification, valueWords } from '../src/core/ids/words';
import { newFacet, occursFor, simple, type Facet } from '../src/core/ids/model';
import { entity, fromLength, fromPattern, fromRange, list, property, spec } from './helpers/ids';

describe('values in words', () => {
  it('exact, list, pattern, range, length', () => {
    expect(valueWords(simple('A'))).toBe('"A"');
    expect(valueWords(list('A', 'B'))).toBe('one of "A", "B"');
    expect(valueWords(fromPattern('DT.*', 'xs:string'))).toBe('matching the pattern "DT.*"');
    expect(valueWords(fromRange({ lower: { value: '2', exclusive: true }, upper: { value: '5', exclusive: false } }, 'xs:double'))).toBe('more than 2 and at most 5');
    expect(valueWords(fromLength({ exactly: '3', atLeast: '', atMost: '' }, 'xs:string'))).toBe('exactly 3 characters long');
  });
});

describe('a specification in words', () => {
  const optional = occursFor('optional');
  it('the wall / fire rating example', () => {
    const s = spec({ ...optional, requirements: [property('Pset_WallCommon', 'FireRating')] });
    expect(describeSpecification(s)).toEqual({ mode: 'sentence', text: 'Every wall must have the property FireRating in Pset_WallCommon.' });
  });
  it('required adds that the model must contain one', () => {
    expect(describeSpecification(spec({ requirements: [property('P', 'N')] })).text)
      .toBe('Every wall must have the property N in P. The model must contain at least one wall.');
  });
  it('prohibited says the model must not contain them', () => {
    expect(describeSpecification(spec({ ...occursFor('prohibited') })).text).toBe('The model must not contain any wall.');
  });
  it('conditions in the applicability and a value', () => {
    const s = spec({
      ...optional,
      applicability: [entity('IFCWALL'), property('Pset_WallCommon', 'IsExternal', { value: simple('TRUE') } as never)],
      requirements: [property('Pset_WallCommon', 'FireRating', { value: list('1HR', '2HR') } as never)],
    });
    expect(describeSpecification(s).text).toBe('Every wall that has the property IsExternal in Pset_WallCommon set to "TRUE" must have the property FireRating in Pset_WallCommon set to one of "1HR", "2HR".');
  });
  it('a pattern, a range and a length read as "with a value ..."', () => {
    const at = (value: never) => describeSpecification(spec({ ...optional, requirements: [property('P', 'N', { value } as never)] })).text;
    expect(at(fromPattern('A.*', 'xs:string') as never)).toBe('Every wall must have the property N in P with a value matching the pattern "A.*".');
    expect(at(fromRange({ lower: { value: '2', exclusive: false }, upper: null }, 'xs:double') as never)).toBe('Every wall must have the property N in P with a value of at least 2.');
    expect(at(fromLength({ exactly: '', atLeast: '3', atMost: '' }, 'xs:string') as never)).toBe('Every wall must have the property N in P with a value at least 3 characters long.');
  });
  it('prohibited and optional requirement facets', () => {
    const m = { ...newFacet('material', 'requirements'), cardinality: 'prohibited' } as Facet;
    expect(describeSpecification(spec({ ...optional, requirements: [m] })).text).toBe('Every wall must not have a material.');
  });
  it('an unknown class is named, not guessed', () => {
    expect(describeSpecification(spec({ ...optional, applicability: [entity('IFCFLOWTERMINAL')] })).text).toBe('Every element of class IFCFLOWTERMINAL is accepted.');
  });
  it('falls back to a neutral listing when it cannot say it truthfully', () => {
    const odd = describeSpecification(spec({ minOccurs: '2', maxOccurs: '5', requirements: [property('P', 'N')] }));
    expect(odd.mode).toBe('listing');
    expect(odd.text).toBe('Applies to: type of element IFCWALL. Must have: required: property N in P, value any. Between 2 and 5 matching elements are allowed.');
  });
  it('falls back for two entity facets', () => {
    expect(describeSpecification(spec({ applicability: [entity('IFCWALL'), entity('IFCDOOR')] })).mode).toBe('listing');
  });
  it('falls back for a restriction it cannot phrase', () => {
    const weird = { kind: 'restriction' as const, base: 'xs:string', facets: [{ name: 'pattern' as const, value: 'a' }, { name: 'enumeration' as const, value: 'b' }] };
    const s = spec({ ...optional, requirements: [property('P', 'N', { value: weird } as never)] });
    expect(describeSpecification(s).mode).toBe('listing');
  });
});
