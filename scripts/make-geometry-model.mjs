/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Writes an IFC4 model of many walls that have a shape (a box each, in a grid), for measuring what the 3D view costs.
// Every third wall is named "Waldo", the others "Wall <n>", so a specification that wants Name = Waldo fails two in three.
// Usage: node scripts/make-geometry-model.mjs <walls> <out.ifc>
import fs from 'node:fs';
const [n, out] = [Number(process.argv[2]), process.argv[3]];
if (!n || !out) throw new Error('usage: make-geometry-model.mjs <walls> <out.ifc>');
const guid = (i) => String(i).padStart(22, '0');
const fd = fs.openSync(out, 'w');
// #1 context, #2 unit assignment, #3 project, #4 axis (origin), #5 profile-free placement parent
fs.writeSync(fd, `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\nFILE_NAME('','2022-10-07T13:48:44',(),(),'x','x','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;
#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCAXIS2PLACEMENT3D(#1,$,$);
#3=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#2,$);
#4=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#5=IFCUNITASSIGNMENT((#4));
#6=IFCPROJECT('${guid(1000000000)}',$,'P',$,$,$,$,(#3),#5);
#7=IFCDIRECTION((0.,0.,1.));
#8=IFCDIRECTION((1.,0.,0.));
#9=IFCAXIS2PLACEMENT2D(#10,$);
#10=IFCCARTESIANPOINT((0.,0.));
#11=IFCRECTANGLEPROFILEDEF(.AREA.,$,#9,4.,0.2);
#12=IFCSHAPEREPRESENTATION(#3,'Body','SweptSolid',(#13));
#13=IFCEXTRUDEDAREASOLID(#11,#2,#7,3.);
`);
let buf = [];
const side = Math.ceil(Math.sqrt(n));
for (let i = 1; i <= n; i++) {
  const b = 20 + (i - 1) * 6;
  const x = ((i - 1) % side) * 6, y = Math.floor((i - 1) / side) * 3;
  buf.push(`#${b}=IFCCARTESIANPOINT((${x}.,${y}.,0.));\n#${b + 1}=IFCAXIS2PLACEMENT3D(#${b},$,$);\n#${b + 2}=IFCLOCALPLACEMENT($,#${b + 1});\n#${b + 3}=IFCPRODUCTDEFINITIONSHAPE($,$,(#12));\n#${b + 4}=IFCWALL('${guid(i)}',$,'${i % 3 === 0 ? 'Waldo' : `Wall ${i}`}',$,$,#${b + 2},#${b + 3},$,.NOTDEFINED.);\n`);
  if (i % 20000 === 0) { fs.writeSync(fd, buf.join('')); buf = []; }
}
fs.writeSync(fd, buf.join('') + 'ENDSEC;\nEND-ISO-10303-21;\n');
fs.closeSync(fd);
