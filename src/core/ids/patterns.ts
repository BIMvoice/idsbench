// The common shapes of a specification. Each one is a complete, valid specification with ordinary choices filled in,
// so that changing two or three of them finishes it. tests/patterns.test.ts runs every one through the Check engine.
import { newFacet, newSpecification, occursFor, simple, type Facet, type Specification } from './model';

export interface Pattern { id: string; label: string; about: string; make: () => Specification }

const entity = (cls: string): Facet => ({ ...newFacet('entity', 'applicability'), name: simple(cls) } as Facet);
const spec = (name: string, cls: string, requirements: Facet[], extra: Partial<Specification> = {}): Specification =>
  ({ ...newSpecification(), name, applicability: [entity(cls)], requirements, ...extra });

export const PATTERNS: Pattern[] = [
  {
    id: 'property', label: 'Elements must have a property', about: 'For example: every wall has a fire rating.',
    make: () => spec('Walls have a fire rating', 'IFCWALL', [{ ...newFacet('property', 'requirements'), propertySet: simple('Pset_WallCommon'), baseName: simple('FireRating'), dataType: 'IFCLABEL' } as Facet]),
  },
  {
    id: 'classification', label: 'Elements must have a classification', about: 'For example: every door has a Uniclass 2015 code.',
    make: () => spec('Doors are classified', 'IFCDOOR', [{ ...newFacet('classification', 'requirements'), system: simple('Uniclass 2015') } as Facet]),
  },
  {
    id: 'material', label: 'Elements must have a material', about: 'For example: every slab has a material.',
    make: () => spec('Slabs have a material', 'IFCSLAB', [newFacet('material', 'requirements')]),
  },
  {
    id: 'name', label: 'Elements must be named a certain way', about: 'For example: every space has a name that starts with a level code.',
    make: () => spec('Spaces are named by level', 'IFCSPACE', [{ ...newFacet('attribute', 'requirements'), name: simple('Name'), value: { kind: 'restriction', base: 'xs:string', facets: [{ name: 'pattern', value: 'L[0-9]{2}.*' }] } } as Facet]),
  },
  {
    id: 'prohibited', label: 'Elements must not exist in the model', about: 'For example: no element is left as a generic proxy.',
    make: () => spec('No generic proxy elements', 'IFCBUILDINGELEMENTPROXY', [], occursFor('prohibited')),
  },
];
