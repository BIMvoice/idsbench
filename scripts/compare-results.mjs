/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Compares two files made by snapshot-results.ts, result by result (the fields added since the first version are ignored).
// Usage: node scripts/compare-results.mjs <a.json> <b.json>
import fs from 'node:fs';
const a=JSON.parse(fs.readFileSync(process.argv[2])), b=JSON.parse(fs.readFileSync(process.argv[3]));
const strip=(r)=>{ if(!r.specs) return r; return {...r, specs:r.specs.map(({failureTotal,groups,notListed,wholeFailure,...x})=>x)}; };
let diff=0, n=0;
for(const k of Object.keys(a)){ n++; if(JSON.stringify(strip(a[k]))!==JSON.stringify(strip(b[k]))){diff++; if(diff<6) { console.log('DIFF',k); const x=strip(a[k]), y=strip(b[k]); for (const key of Object.keys(x)) if (JSON.stringify(x[key])!==JSON.stringify(y[key])) console.log('  field',key, JSON.stringify(x[key]).slice(0,300),'|',JSON.stringify(y[key]).slice(0,300)); } } }
console.log(n,'pairs compared;',diff,'differ');
