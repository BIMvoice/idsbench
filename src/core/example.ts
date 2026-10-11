// A small IDS file and a small model that ship inside the app, for a first visit without files of one's own.
// Three specifications, chosen so that the result shows three states: Fail, Pass and Nothing to check.
export const EXAMPLE_IDS_NAME = 'example-requirements.ids';
export const EXAMPLE_IFC_NAME = 'example-building.ifc';

export const EXAMPLE_IDS = `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">
  <info>
    <title>Example requirements</title>
    <description>An example that ships with idsbench.</description>
  </info>
  <specifications>
    <specification name="Walls have a fire rating" ifcVersion="IFC4">
      <applicability minOccurs="1" maxOccurs="unbounded">
        <entity>
          <name><simpleValue>IFCWALL</simpleValue></name>
        </entity>
      </applicability>
      <requirements>
        <property dataType="IFCLABEL" cardinality="required">
          <propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet>
          <baseName><simpleValue>FireRating</simpleValue></baseName>
        </property>
      </requirements>
    </specification>
    <specification name="Walls have a name" ifcVersion="IFC4">
      <applicability minOccurs="1" maxOccurs="unbounded">
        <entity>
          <name><simpleValue>IFCWALL</simpleValue></name>
        </entity>
      </applicability>
      <requirements>
        <attribute cardinality="required">
          <name><simpleValue>Name</simpleValue></name>
        </attribute>
      </requirements>
    </specification>
    <specification name="Doors are classified" ifcVersion="IFC4">
      <applicability minOccurs="0" maxOccurs="unbounded">
        <entity>
          <name><simpleValue>IFCDOOR</simpleValue></name>
        </entity>
      </applicability>
      <requirements>
        <classification cardinality="required">
          <system><simpleValue>Uniclass 2015</simpleValue></system>
        </classification>
      </requirements>
    </specification>
  </specifications>
</ids>
`;

export const EXAMPLE_IFC = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('example-building.ifc','2026-01-01T00:00:00',(),(),'idsbench','idsbench','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCWALL('0aExampleWall000000001',$,'Wall north',$,$,$,$,$,$);
#2=IFCWALL('0aExampleWall000000002',$,'Wall east',$,$,$,$,$,$);
#3=IFCWALL('0aExampleWall000000003',$,'Wall south',$,$,$,$,$,$);
#4=IFCWALL('0aExampleWall000000004',$,'Wall west',$,$,$,$,$,$);
#10=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('60 min'),$);
#11=IFCPROPERTYSET('0aExamplePset000000001',$,'Pset_WallCommon',$,(#10));
#12=IFCRELDEFINESBYPROPERTIES('0aExampleRel0000000001',$,$,$,(#1,#2),#11);
ENDSEC;
END-ISO-10303-21;
`;
