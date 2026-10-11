import { blankDocument, newFacet, newSpecification, simple, type Facet, type IdsDocument, type Specification, type Value } from '../../src/core/ids/model';
import { fromList, fromPattern, fromRange, fromLength } from '../../src/core/ids/value';

export const entity = (cls: string): Facet => ({ ...newFacet('entity', 'applicability'), name: simple(cls) } as Facet);
export const property = (set: string, name: string, extra: Partial<Facet> = {}): Facet =>
  ({ ...newFacet('property', 'requirements'), propertySet: simple(set), baseName: simple(name), ...extra } as Facet);
export const spec = (o: Partial<Specification> = {}): Specification => ({ ...newSpecification(), made: undefined, ifcVersion: ['IFC4'], minOccurs: '1', name: 'S', applicability: [entity('IFCWALL')], ...o });
export const doc = (...specs: Specification[]): IdsDocument => ({ ...blankDocument(), info: { ...blankDocument().info, title: 'T' }, specifications: specs });
export const list = (...v: string[]): Value => fromList(v, 'xs:string');
export { fromPattern, fromRange, fromLength };
