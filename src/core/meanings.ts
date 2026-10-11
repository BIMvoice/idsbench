// An AID FOR SEARCHING, NOT THE STANDARD. People look for a property or an attribute by what it is for ("room
// number", "fire resistance", "U value"), and the IFC names do not say. This is a short, hand-written table of search
// words and a one-line plain meaning for the names people ask for most. The IFC tables the Check engine ships carry no
// definitions to take them from (see packages/check/src/ifc.ts: classes, attributes, property sets and data types
// only), so these lines are the page's own wording of what the buildingSMART IFC documentation says each name is for.
// Every name here must exist in at least one of the IFC tables; tests/meanings.test.ts fails if one does not.

export interface Meaning {
  /** The property or attribute name exactly as the standard writes it. */
  name: string;
  /** Other words people use for it. Type-ahead finds the name by these. */
  words: string[];
  /** What it is, in one line. */
  means: string;
}

export const MEANINGS: Meaning[] = [
  // Attributes every object has
  { name: 'Name', words: ['title', 'label', 'called'], means: 'The short name of the item, as shown in the modelling program.' },
  { name: 'LongName', words: ['full name', 'long name', 'room name'], means: 'The longer, descriptive name, such as the full name of a room.' },
  { name: 'Description', words: ['note', 'comment', 'remarks', 'text'], means: 'A free text describing the item.' },
  { name: 'ObjectType', words: ['type name', 'kind', 'user type'], means: 'The kind of item, in the modeller\'s own words, when the standard types do not fit.' },
  { name: 'Tag', words: ['mark', 'id', 'number', 'identifier', 'serial'], means: 'A label or mark that identifies the item in the modelling program.' },
  { name: 'GlobalId', words: ['guid', 'id', 'identifier', 'unique'], means: 'The unique identifier of the item, the same in every file it is in.' },
  { name: 'PredefinedType', words: ['subtype', 'kind', 'variant'], means: 'One of the standard kinds of the class, such as a standard door or a gate.' },
  { name: 'Elevation', words: ['height', 'level', 'storey height', 'floor level'], means: 'The height of a building storey above the zero level of the building.' },
  { name: 'CompositionType', words: ['whole', 'complex', 'part'], means: 'Whether a spatial element is the whole, a complex of parts or one part.' },
  // Properties named in many standard sets
  { name: 'Reference', words: ['number', 'code', 'mark', 'id', 'identifier', 'room number', 'type mark'], means: 'The identifier you give the item or its type, such as a room number or a type mark.' },
  { name: 'Status', words: ['phase', 'stage', 'new', 'existing', 'demolish'], means: 'Whether the item is new, existing, to be demolished or temporary.' },
  { name: 'IsExternal', words: ['exterior', 'outside', 'external', 'facade'], means: 'Whether the item is on the outside of the building.' },
  { name: 'LoadBearing', words: ['structural', 'structure', 'carries load', 'bearing'], means: 'Whether the item carries load in the structure of the building.' },
  { name: 'FireRating', words: ['fire resistance', 'fire protection', 'fire class', 'rei', 'ei30', 'fire'], means: 'How long the item resists fire, as a rating such as 60 minutes or EI60.' },
  { name: 'AcousticRating', words: ['sound', 'noise', 'acoustic', 'sound insulation', 'db'], means: 'How well the item insulates against sound.' },
  { name: 'ThermalTransmittance', words: ['u value', 'u-value', 'heat loss', 'insulation', 'thermal'], means: 'The U value: how much heat passes through the item.' },
  { name: 'Combustible', words: ['burns', 'flammable', 'fire load'], means: 'Whether the material of the item can burn.' },
  { name: 'SurfaceSpreadOfFlame', words: ['flame', 'fire class', 'surface fire'], means: 'How quickly flame spreads over the surface of the item.' },
  { name: 'SecurityRating', words: ['security', 'burglar', 'break in', 'rc2'], means: 'How well the item resists break-in.' },
  { name: 'FireExit', words: ['escape', 'emergency exit', 'exit', 'fire door'], means: 'Whether the door is a fire exit.' },
  { name: 'HandicapAccessible', words: ['accessible', 'wheelchair', 'barrier free', 'disabled', 'access'], means: 'Whether the item can be used by a person in a wheelchair.' },
  { name: 'SelfClosing', words: ['closer', 'auto close', 'door closer'], means: 'Whether the door closes by itself.' },
  { name: 'SmokeStop', words: ['smoke', 'smoke control'], means: 'Whether the door stops smoke.' },
  { name: 'GlazingAreaFraction', words: ['glass', 'glazed', 'glazing share'], means: 'The share of the door or window that is glass.' },
  { name: 'Infiltration', words: ['air leakage', 'draught', 'airtight', 'leak'], means: 'How much air leaks through the closed item.' },
  { name: 'PubliclyAccessible', words: ['public', 'open to public'], means: 'Whether the public can enter the space.' },
  { name: 'Category', words: ['use', 'room type', 'room use', 'function', 'kind of space'], means: 'The use of the space, such as office or corridor.' },
  { name: 'GrossPlannedArea', words: ['area', 'planned area', 'size', 'floor area', 'm2'], means: 'The planned floor area of the space including its walls.' },
  { name: 'NetPlannedArea', words: ['area', 'planned area', 'usable area', 'size', 'm2'], means: 'The planned usable floor area of the space.' },
  { name: 'FloorCovering', words: ['flooring', 'floor finish', 'floor material'], means: 'The finish of the floor of the space.' },
  { name: 'WallCovering', words: ['wall finish', 'paint', 'wall material'], means: 'The finish of the walls of the space.' },
  { name: 'CeilingCovering', words: ['ceiling finish', 'ceiling material'], means: 'The finish of the ceiling of the space.' },
  { name: 'ExtendToStructure', words: ['to slab', 'full height', 'reaches ceiling'], means: 'Whether the wall reaches up to the structure above it.' },
  { name: 'Compartmentation', words: ['fire compartment', 'fire cell', 'fire wall'], means: 'Whether the wall bounds a fire compartment.' },
  { name: 'PitchAngle', words: ['slope', 'incline', 'angle', 'gradient'], means: 'The slope of the item against the horizontal.' },
  { name: 'NominalHeight', words: ['height', 'size'], means: 'The nominal height of the item.' },
  { name: 'NominalWidth', words: ['width', 'size'], means: 'The nominal width of the item.' },
  // Quantities
  { name: 'GrossFloorArea', words: ['area', 'floor area', 'size', 'm2'], means: 'The floor area including walls, as measured in the model.' },
  { name: 'NetFloorArea', words: ['area', 'floor area', 'usable area', 'size', 'm2'], means: 'The floor area without walls, as measured in the model.' },
  { name: 'NetVolume', words: ['volume', 'size', 'm3'], means: 'The volume of the item without openings, as measured in the model.' },
  { name: 'GrossVolume', words: ['volume', 'size', 'm3'], means: 'The volume of the item including openings, as measured in the model.' },
  { name: 'Height', words: ['tall', 'size'], means: 'The height of the item, as measured in the model.' },
  { name: 'Width', words: ['wide', 'size'], means: 'The width of the item, as measured in the model.' },
  { name: 'Length', words: ['long', 'size'], means: 'The length of the item, as measured in the model.' },
];

const BY_NAME = new Map(MEANINGS.map((m) => [m.name, m]));
export const meaningOf = (name: string): Meaning | undefined => BY_NAME.get(name);
