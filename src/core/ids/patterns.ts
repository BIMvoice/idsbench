/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The common shapes of a specification. Each one is a complete, valid specification with ordinary choices filled in,
// so that changing two or three of them finishes it. tests/patterns.test.ts runs every one through the Check engine.
import { newFacet, newSpecification, occursFor, simple, type Facet, type Specification } from './model';
import { suggestName } from './naming';

export interface Pattern { id: string; label: string; about: string; make: () => Specification }

const entity = (cls: string): Facet => ({ ...newFacet('entity', 'applicability'), name: simple(cls) } as Facet);
// A shape fills in what the form needs to be a valid specification (the class, and for a property or a classification
// which one) and never a value that narrows what the rule asks for beyond its title: no text pattern, no number, no
// code, and no data type: IDS asks for one only with a value (the form writes it when a value is added). The name is worked out from the content and follows it until the person types one of their own.
const spec = (cls: string, requirements: Facet[], extra: Partial<Specification> = {}): Specification => {
  const made: Specification = { ...newSpecification(), applicability: [entity(cls)], requirements, ...extra, autoName: true };
  return { ...made, name: suggestName(made) };
};

export const PATTERNS: Pattern[] = [
  {
    id: 'property', label: 'Elements must have a property', about: 'For example: every wall has a fire rating.',
    make: () => spec('IFCWALL', [{ ...newFacet('property', 'requirements'), propertySet: simple('Pset_WallCommon'), baseName: simple('FireRating') } as Facet]),
  },
  {
    id: 'classification', label: 'Elements must have a classification', about: 'For example: every door has a Uniclass 2015 code.',
    make: () => spec('IFCDOOR', [{ ...newFacet('classification', 'requirements'), system: simple('Uniclass 2015') } as Facet]),
  },
  {
    id: 'material', label: 'Elements must have a material', about: 'For example: every slab has a material.',
    make: () => spec('IFCSLAB', [newFacet('material', 'requirements')]),
  },
  {
    id: 'name', label: 'Elements must have a name', about: 'For example: every space has a name. You can then ask that the name follows a pattern.',
    make: () => spec('IFCSPACE', [{ ...newFacet('attribute', 'requirements'), name: simple('Name'), value: null } as Facet]),
  },
  {
    id: 'prohibited', label: 'Elements must not exist in the model', about: 'For example: no element is left as a generic proxy.',
    make: () => spec('IFCBUILDINGELEMENTPROXY', [], occursFor('prohibited')),
  },
];
