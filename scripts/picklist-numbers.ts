// What ticking all three IFC versions does to the pick-lists of the common classes: how many property sets, properties
// of the class's common set, and attributes are offered with IFC4 alone and with all three ticked, and how many more
// names only some versions define (offered after the rest, each with its versions, never silently dropped).
// Usage: npx vite-node scripts/picklist-numbers.ts
import { loadSchema } from '@idsbench/check/ifc';
import { listsFor } from '../src/core/picks';

const [x23, x4, x43] = await Promise.all([loadSchema('IFC2X3'), loadSchema('IFC4'), loadSchema('IFC4X3_ADD2')]);
const four = listsFor([x4]), all = listsFor([x23, x4, x43]);
const common: Record<string, string> = { IFCWALL: 'Pset_WallCommon', IFCDOOR: 'Pset_DoorCommon', IFCWINDOW: 'Pset_WindowCommon', IFCSLAB: 'Pset_SlabCommon', IFCSPACE: 'Pset_SpaceCommon', IFCCOLUMN: 'Pset_ColumnCommon', IFCBEAM: 'Pset_BeamCommon' };
console.log('class | property sets IFC4 -> all three (+ partial) | props of its common set IFC4 -> all three (+ partial) | attributes IFC4 -> all three');
for (const [cls, set] of Object.entries(common)) {
  console.log([
    cls.replace('IFC', ''),
    `${four.propertySets(cls).length} -> ${all.propertySets(cls).length} (+${all.propertySetsPartial(cls).length})`,
    `${set}: ${four.properties(set).length} -> ${all.properties(set).length} (+${all.propertiesPartial(set).length})`,
    `${four.attributes(cls).length} -> ${all.attributes(cls).length}`,
  ].join(' | '));
  const lost = all.propertiesPartial(set).map((o) => `${o.value} [${o.onlyIn!.join(',')}]`);
  if (lost.length) console.log(`    partial in ${set}: ${lost.join('; ')}`);
  const lostSets = all.propertySetsPartial(cls).length;
  void lostSets;
}
console.log('is any common list empty with all three ticked?', Object.entries(common).some(([c, s]) => all.propertySets(c).length === 0 || all.properties(s).length === 0 || all.attributes(c).length === 0) ? 'yes' : 'no');
