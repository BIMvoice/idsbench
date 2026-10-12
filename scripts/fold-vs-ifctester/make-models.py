# Writes the models of the comparison with IfcTester (see compare.py): per IFC version (IFC2X3, IFC4, IFC4X3_ADD2) three
# models, "all" (the ten folded classes, their parents and a wall), "parents" (the parents and the wall) and "subs" (the ten
# only), two elements of each class, the Name of one the class itself and the Name of the other "plain-" and the class.
# Usage: IFCTESTER_PYTHONPATH=<site-packages with ifcopenshell and ifctester> python3 -I make-models.py <empty directory>
import os, sys, json
if os.environ.get('IFCTESTER_PYTHONPATH'): sys.path.insert(0, os.environ['IFCTESTER_PYTHONPATH'])
import ifcopenshell, ifcopenshell.guid
TEN = ['IFCBEAMSTANDARDCASE','IFCCOLUMNSTANDARDCASE','IFCDOORSTANDARDCASE','IFCMEMBERSTANDARDCASE','IFCOPENINGSTANDARDCASE','IFCPLATESTANDARDCASE','IFCSLABSTANDARDCASE','IFCWINDOWSTANDARDCASE','IFCDISTRIBUTIONCONTROLELEMENT','IFCDISTRIBUTIONFLOWELEMENT']
PAR = {'IFCBEAMSTANDARDCASE':'IFCBEAM','IFCCOLUMNSTANDARDCASE':'IFCCOLUMN','IFCDOORSTANDARDCASE':'IFCDOOR','IFCMEMBERSTANDARDCASE':'IFCMEMBER','IFCOPENINGSTANDARDCASE':'IFCOPENINGELEMENT','IFCPLATESTANDARDCASE':'IFCPLATE','IFCSLABSTANDARDCASE':'IFCSLAB','IFCWINDOWSTANDARDCASE':'IFCWINDOW','IFCDISTRIBUTIONCONTROLELEMENT':'IFCDISTRIBUTIONELEMENT','IFCDISTRIBUTIONFLOWELEMENT':'IFCDISTRIBUTIONELEMENT'}
out = sys.argv[1]
info = {}
for sch in ['IFC2X3','IFC4','IFC4X3_ADD2']:
  for variant in ['all','parents','subs']:
    f = ifcopenshell.file(schema=sch)
    classes = []
    pool = {'all': TEN + list(PAR.values()) + ['IFCWALL'], 'parents': list(PAR.values()) + ['IFCWALL'], 'subs': TEN}[variant]
    for c in dict.fromkeys(pool):
        try:
            # two elements of each class: one named after its class, one named "plain"
            for k, nm in enumerate([c, 'plain-' + c]):
                e = f.create_entity(c, GlobalId=ifcopenshell.guid.new(), Name=nm, Description='desc-' + nm)
                try:
                    e.PredefinedType = 'NOTDEFINED'
                except Exception:
                    pass
            classes.append(c)
        except Exception as e:
            print(sch, c, 'cannot:', str(e)[:80])
    path = f'{out}/{sch}.{variant}.ifc'
    f.write(path)
    info[sch+'.'+variant] = classes
json.dump(info, open(f'{out}/classes.json','w'))
