// The column "Storey or space" of the CSV tells the person who models where to look. It names the storey or the space
// the model puts the element in, through each way a model can say so, and is empty when the model does not say: the
// name of a curtain wall or of a stair is not a storey.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idsText, ifcText, nameIs, runText } from './helpers/small-model';

const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
beforeAll(() => { console.log = console.warn = console.error = console.info = () => {}; });
afterAll(() => { Object.assign(console, saved); });

const G = (i: number) => String(i).padStart(22, '0');
const el = (i: number, c: string, n: string, extra = '$,$,$,$,$,$') => `#${i}=${c}('${G(i)}',$,'${n}',${extra});\n`;
const body =
  `#1=IFCBUILDING('${G(1)}',$,'Block A',$,$,$,$,$,.ELEMENT.,$,$,$);\n#2=IFCBUILDINGSTOREY('${G(2)}',$,'Level 1',$,$,$,$,$,.ELEMENT.,0.);\n#3=IFCSPACE('${G(3)}',$,'1.01',$,$,$,$,'Office',.ELEMENT.,.INTERNAL.,$);\n` +
  `#4=IFCRELAGGREGATES('${G(4)}',$,$,$,#1,(#2));\n#5=IFCRELAGGREGATES('${G(5)}',$,$,$,#2,(#3));\n` +
  el(10, 'IFCWALL', 'on the storey') + el(11, 'IFCCURTAINWALL', 'curtain wall') + el(12, 'IFCPLATE', 'panel of the curtain wall') + el(13, 'IFCSTAIR', 'stair') +
  el(14, 'IFCSTAIRFLIGHT', 'flight of the stair', '$,$,$,$,$,$,$,$,$,$') + el(15, 'IFCFURNISHINGELEMENT', 'desk in the space', '$,$,$,$,$') + el(16, 'IFCWALL', 'placed nowhere') +
  el(17, 'IFCWALL', 'placed in the building') + el(18, 'IFCMEMBER', 'mullion of a curtain wall placed nowhere') + el(19, 'IFCCURTAINWALL', 'curtain wall placed nowhere') +
  `#20=IFCRELCONTAINEDINSPATIALSTRUCTURE('${G(20)}',$,$,$,(#10,#11,#13),#2);\n#21=IFCRELAGGREGATES('${G(21)}',$,$,$,#11,(#12));\n#22=IFCRELAGGREGATES('${G(22)}',$,$,$,#13,(#14));\n` +
  `#23=IFCRELCONTAINEDINSPATIALSTRUCTURE('${G(23)}',$,$,$,(#15),#3);\n#24=IFCRELCONTAINEDINSPATIALSTRUCTURE('${G(24)}',$,$,$,(#17),#1);\n#25=IFCRELAGGREGATES('${G(25)}',$,$,$,#19,(#18));\n`;
const classes = ['IFCWALL', 'IFCCURTAINWALL', 'IFCPLATE', 'IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCFURNISHINGELEMENT', 'IFCMEMBER', 'IFCSPACE'];
const everything = `<specification name="S" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded"><entity><name><xs:restriction base="xs:string">${classes.map((c) => `<xs:enumeration value="${c}"/>`).join('')}</xs:restriction></name></entity></applicability>${nameIs('never this')}</specification>`;

describe('the storey or space of a failing element', () => {
  for (const schema of ['IFC2X3', 'IFC4', 'IFC4X3_ADD2']) {
    it(`${schema}: directly on a storey, as a component of something on a storey, in a space, in the building, and nowhere`, async () => {
      const r = await runText(idsText(everything), ifcText(body, schema));
      const place = Object.fromEntries(r.specs[0].failures.map((f) => [f.name, f.place ?? '']));
      expect(place).toEqual({
        'on the storey': 'Level 1',
        'curtain wall': 'Level 1',
        // A component is where the whole is: never the name of the whole in a column that says "storey or space".
        'panel of the curtain wall': 'Level 1',
        'stair': 'Level 1',
        'flight of the stair': 'Level 1',
        'desk in the space': '1.01 (space)',
        // A space is on the storey it is a component of.
        '1.01': 'Level 1',
        'placed in the building': 'Block A (building)',
        // Unknown is empty, not a guess.
        'placed nowhere': '',
        'curtain wall placed nowhere': '',
        'mullion of a curtain wall placed nowhere': '',
      });
    });
  }
});
