// Not part of the product: loads the module in a browser, checks one valid and one invalid file, prints the result.
import { checkIds } from '../src/index.ts';

const NS = 'http://standards.buildingsmart.org/IDS';
const doc = (entityName: string) => `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="${NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NS} ${NS}/1.0/ids.xsd">
  <info><title>Demo</title></info>
  <specifications>
    <specification name="Walls" ifcVersion="IFC4">
      <applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>${entityName}</simpleValue></name></entity></applicability>
      <requirements><attribute><name><simpleValue>Name</simpleValue></name></attribute></requirements>
    </specification>
  </specifications>
</ids>`;
// the invalid one has a schema error (unknown attribute) as well as a rule error (unknown IFC class)
const invalid = doc('IFCWALLL').replace('<specification ', '<specification bogus="1" ');

const out = document.getElementById('out')!;
const t0 = performance.now();
const valid = await checkIds(doc('IFCWALL'));
const bad = await checkIds(invalid);
(window as unknown as { __result: unknown }).__result = { valid, bad, ms: Math.round(performance.now() - t0) };
out.textContent = JSON.stringify((window as unknown as { __result: unknown }).__result, null, 2);
