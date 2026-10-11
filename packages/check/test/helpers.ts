export const NS = 'http://standards.buildingsmart.org/IDS';

export function ids(specBody: string, opts: { ifc?: string; version?: string; appAttrs?: string } = {}): string {
  const version = opts.version ?? '1.0';
  return `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="${NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NS} ${NS}/${version}/ids.xsd">
  <info><title>Test</title></info>
  <specifications>
    <specification name="Spec" ifcVersion="${opts.ifc ?? 'IFC4'}">
${specBody}
    </specification>
  </specifications>
</ids>`;
}

export const sv = (v: string) => `<simpleValue>${v}</simpleValue>`;
export const entity = (name = 'IFCWALL', predefined?: string) =>
  `<entity><name>${sv(name)}</name>${predefined === undefined ? '' : `<predefinedType>${sv(predefined)}</predefinedType>`}</entity>`;
export const applicability = (inner = entity(), attrs = 'minOccurs="1" maxOccurs="unbounded"') => `<applicability ${attrs}>${inner}</applicability>`;
export const requirements = (inner: string) => `<requirements>${inner}</requirements>`;
export const spec = (applic: string, reqs = '') => applicability(applic) + (reqs ? requirements(reqs) : '');

export function prop(o: { set?: string; name?: string; value?: string; dataType?: string; cardinality?: string } = {}): string {
  const dt = o.dataType === undefined ? '' : ` dataType="${o.dataType}"`;
  const card = o.cardinality ? ` cardinality="${o.cardinality}"` : '';
  return `<property${dt}${card}><propertySet>${sv(o.set ?? 'Pset_WallCommon')}</propertySet><baseName>${sv(o.name ?? 'FireRating')}</baseName>${o.value === undefined ? '' : `<value>${o.value}</value>`}</property>`;
}

export function attribute(o: { name?: string; value?: string; cardinality?: string } = {}): string {
  const card = o.cardinality ? ` cardinality="${o.cardinality}"` : '';
  return `<attribute${card}><name>${sv(o.name ?? 'Name')}</name>${o.value === undefined ? '' : `<value>${o.value}</value>`}</attribute>`;
}

export const restriction = (base: string, inner: string) => `<xs:restriction base="${base}">${inner}</xs:restriction>`;
