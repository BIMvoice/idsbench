# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
# Compares, element by element, what the page answers (run-app.ts) with what IfcTester answers over the same models and
# IDS files. A row withheld by the guard is not compared (it gives no result); every other row must be identical in the
# number of elements the specification applied to, the elements that failed and the verdict of the specification. The
# "lowercase" rows (a class name written in lower case) are left out: the library refuses a literal that is not in capitals,
# as IDS 1.0 requires, and IfcTester does not; that is not the fold.
# Usage, from the repository root, with D an empty directory:
#   IFCTESTER_PYTHONPATH=<site-packages> python3 -I scripts/fold-vs-ifctester/make-models.py D
#   npx vite-node scripts/fold-vs-ifctester/run-app.ts D
#   IFCTESTER_PYTHONPATH=<site-packages> python3 -I scripts/fold-vs-ifctester/compare.py D
# It prints the counts and exits 1 if any compared row differs.
import os, sys, json, collections
if os.environ.get('IFCTESTER_PYTHONPATH'): sys.path.insert(0, os.environ['IFCTESTER_PYTHONPATH'])
import ifcopenshell
from ifctester import ids
d = sys.argv[1]
rows = json.load(open(f'{d}/app.json'))
bymodel = collections.defaultdict(list)
for r in rows: bymodel[r['model']].append(r)
tot = collections.Counter()
bad = []
for model, rs in bymodel.items():
    m = ifcopenshell.open(f'{d}/{model}.ifc')
    doc = ids.open(f'{d}/{model}.ids')
    doc.validate(m)
    assert len(doc.specifications) == len(rs), (len(doc.specifications), len(rs))
    for s, r in zip(doc.specifications, rs):
        assert s.name == r['id']
        app_names = sorted(e.Name for e in s.applicable_entities)
        failed = sorted(e.Name for e in s.failed_entities)
        prohibited = s.maxOccurs == 0
        want_failed = app_names if prohibited else failed
        tr = {'applicable': len(app_names), 'failed': want_failed, 'status': s.status}
        lib = r['lib']
        libeq = ('error' not in lib) and len(lib['applicable']) == tr['applicable'] and lib['failed'] == want_failed and (r['state'] in ('pass','nothing')) == s.status
        # app state compare
        appok = r['applicable'] == tr['applicable'] and r['failed'] == want_failed and ((r['state'] in ('pass','nothing')) == s.status)
        key = 'withheld' if r['withheld'] else 'run'
        tot[(key, 'lib==tester' if libeq else 'lib!=tester')] += 1
        if r['withheld'] or 'lowercase' in r['id']:
            continue
        tot[('app', 'ok' if appok else 'MISMATCH')] += 1
        if not appok: bad.append((model, r['id'], r['applicable'], r['failed'], r['state'], tr, lib))
for k, v in sorted(tot.items()): print(k, v)
print(len(bad), 'app mismatches')
for b in bad[:25]: print(b)
sys.exit(1 if bad else 0)
