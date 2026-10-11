// An AID FOR SEARCHING, NOT THE STANDARD. People look for a property or an attribute by what it is for ("room
// number", "fire resistance", "U value"), and the IFC names do not say. This is a short, hand-written table of search
// words and a one-line plain meaning for the names people ask for most. The IFC tables the Check engine ships carry no
// definitions to take them from (see packages/check/src/ifc.ts: classes, attributes, property sets and data types
// only), so these lines are the page's own wording of what the buildingSMART IFC documentation says each name is for. A name
// means one thing here whatever set it is in, so a line says only what holds for every standard set that has the name
// (Reference is the reference of the TYPE in all of them; FireExit is on doors, stairs, ramps and spaces).
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
  { name: 'Name', words: ['title', 'label', 'called', 'number', 'room number'], means: 'The short name or number of the item, as the modelling program shows it. For a space this is usually the room number.' },
  { name: 'LongName', words: ['full name', 'long name', 'room name'], means: 'The longer, descriptive name, such as the full name of a room.' },
  { name: 'Description', words: ['note', 'comment', 'remarks', 'text'], means: 'A free text describing the item.' },
  { name: 'ObjectType', words: ['type name', 'kind', 'user type'], means: 'The kind of item, in the modeller\'s own words, when the standard types do not fit.' },
  { name: 'Tag', words: ['mark', 'serial', 'position number', 'element number', 'id', 'identifier'], means: 'An identifier of this one item, such as a serial or position number. Many programs write their own element number here.' },
  { name: 'GlobalId', words: ['guid', 'id', 'identifier', 'unique'], means: 'The unique identifier of the item, the same in every file it is in.' },
  { name: 'PredefinedType', words: ['subtype', 'kind', 'variant'], means: 'One of the standard kinds of the class, such as a standard door or a gate.' },
  { name: 'Elevation', words: ['level', 'floor level', 'height above zero'], means: 'The height of the base of a building storey above the zero level of the building.' },
  { name: 'CompositionType', words: ['whole', 'complex', 'part'], means: 'Whether a spatial element stands for itself, for a complex of several, or for a part of one.' },
  // Properties named in many standard sets
  { name: 'Reference', words: ['type mark', 'type reference', 'type code', 'type id', 'construction type'], means: 'The reference of the type the item is of in this project, such as type A-1. It is not a number of the item itself: a room number is the Name.' },
  { name: 'Status', words: ['phase', 'stage', 'new', 'existing', 'demolish'], means: 'Whether the item is new, existing, to be demolished or temporary.' },
  { name: 'IsExternal', words: ['exterior', 'outside', 'external', 'facade'], means: 'Whether the item is on the outside of the building.' },
  { name: 'LoadBearing', words: ['structural', 'structure', 'carries load', 'bearing'], means: 'Whether the item carries load in the structure of the building.' },
  { name: 'FireRating', words: ['fire resistance', 'fire protection', 'fire class', 'rei', 'ei30', 'fire', 'fire door'], means: 'The fire rating of the item in the national fire classification, such as EI 60.' },
  { name: 'AcousticRating', words: ['sound', 'noise', 'acoustic', 'sound insulation', 'db'], means: 'How well the item insulates against sound.' },
  { name: 'ThermalTransmittance', words: ['u value', 'u-value', 'heat loss', 'insulation', 'thermal'], means: 'The U value: how much heat passes through the item.' },
  { name: 'Combustible', words: ['burns', 'flammable'], means: 'Whether the item is made of material that can burn.' },
  { name: 'SurfaceSpreadOfFlame', words: ['flame', 'fire class', 'surface fire'], means: 'How flame spreads over the surface of the item, as a class in the national building code.' },
  { name: 'SecurityRating', words: ['security', 'burglar', 'break in', 'rc2'], means: 'The security level of the item, as a rating in the national building code.' },
  { name: 'FireExit', words: ['escape', 'emergency exit', 'exit'], means: 'Whether the item is designed to serve as an exit in case of fire.' },
  { name: 'HandicapAccessible', words: ['accessible', 'wheelchair', 'barrier free', 'disabled', 'access'], means: 'Whether the item is designed to be accessible to people with disabilities, under the national building code.' },
  { name: 'SelfClosing', words: ['closer', 'auto close', 'door closer'], means: 'Whether the door closes by itself.' },
  { name: 'SmokeStop', words: ['smoke', 'smoke control'], means: 'Whether the door or window is designed to stop smoke.' },
  { name: 'GlazingAreaFraction', words: ['glass', 'glazed', 'glazing share'], means: 'The share of the door or window that is glass.' },
  { name: 'Infiltration', words: ['air leakage', 'draught', 'airtight', 'leak'], means: 'How much air leaks through the closed item.' },
  { name: 'PubliclyAccessible', words: ['public', 'open to public'], means: 'Whether the public can enter the space.' },
  { name: 'Category', words: ['use', 'room type', 'room use', 'function', 'kind of space'], means: 'The category the item is put in. In IFC2X3 this is the use of a space (office, corridor); in later versions it is the category of an actor, a material or a sign, not of a space.' },
  { name: 'GrossPlannedArea', words: ['area', 'planned area', 'size', 'floor area', 'm2'], means: 'The planned gross area of the space, storey or building, as set when it was programmed.' },
  { name: 'NetPlannedArea', words: ['area', 'planned area', 'usable area', 'size', 'm2'], means: 'The planned net area of the space, storey or building, as set when it was programmed.' },
  { name: 'FloorCovering', words: ['flooring', 'floor finish', 'floor material'], means: 'The finish of the floor of the space.' },
  { name: 'WallCovering', words: ['wall finish', 'paint', 'wall material'], means: 'The finish of the walls of the space.' },
  { name: 'CeilingCovering', words: ['ceiling finish', 'ceiling material'], means: 'The finish of the ceiling of the space.' },
  { name: 'ExtendToStructure', words: ['to slab', 'full height', 'reaches ceiling'], means: 'Whether the wall reaches up to the structure above it.' },
  { name: 'Compartmentation', words: ['fire compartment', 'fire cell', 'fire wall'], means: 'Whether the wall or slab is designed to bound a fire compartment.' },
  { name: 'PitchAngle', words: ['slope', 'incline', 'angle', 'gradient'], means: 'The angle of the slab against the horizontal, when it is part of a roof.' },
  { name: 'NominalHeight', words: ['height', 'size'], means: 'The nominal height of the item.' },
  { name: 'NominalWidth', words: ['width', 'size'], means: 'The nominal width of the item.' },
  // Quantities
  { name: 'GrossFloorArea', words: ['area', 'floor area', 'size', 'm2'], means: 'The floor area including the construction elements that stand in it, as measured in the model.' },
  { name: 'NetFloorArea', words: ['area', 'floor area', 'usable area', 'size', 'm2'], means: 'The floor area without the construction elements that stand in it, as measured in the model.' },
  { name: 'NetVolume', words: ['volume', 'size', 'm3'], means: 'The volume of the item without openings, as measured in the model.' },
  { name: 'GrossVolume', words: ['volume', 'size', 'm3'], means: 'The volume of the item including openings, as measured in the model.' },
  { name: 'Height', words: ['tall', 'size'], means: 'The height of the item.' },
  { name: 'Width', words: ['wide', 'size'], means: 'The width of the item.' },
  { name: 'Length', words: ['long', 'size'], means: 'The length of the item.' },
];

const BY_NAME = new Map(MEANINGS.map((m) => [m.name, m]));
export const meaningOf = (name: string): Meaning | undefined => BY_NAME.get(name);
