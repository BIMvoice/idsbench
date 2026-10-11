import { SelectField, TextField } from './fields';
import { ValueField } from './ValueField';
import { allowedCardinalities, type Cardinality, type Facet, type FacetKind, type Value, PARTOF_RELATIONS, simple } from '../../core/ids/model';
import { baseForDataType } from '../../core/ids/value';
import type { Issue } from '../../core/ids/check';

export const FACET_INFO: Record<FacetKind, { name: string; about: string }> = {
  entity: { name: 'Type of element', about: 'The kind of element, such as a wall or a door.' },
  attribute: { name: 'Attribute', about: 'A basic field every element has, such as its Name or Description.' },
  classification: { name: 'Classification', about: 'A code from a classification system, such as Uniclass or OmniClass.' },
  property: { name: 'Property', about: 'A named value in a property set, such as FireRating in Pset_WallCommon.' },
  material: { name: 'Material', about: 'The material an element is made of.' },
  partOf: { name: 'Part of', about: 'Whether an element sits in or belongs to another, such as a wall on a storey.' },
};

const RELATIONS: Record<string, string> = {
  '': 'Any relationship',
  IFCRELAGGREGATES: 'Is a component of',
  IFCRELASSIGNSTOGROUP: 'Is a member of a group',
  IFCRELCONTAINEDINSPATIALSTRUCTURE: 'Is located in',
  IFCRELNESTS: 'Is nested in',
  'IFCRELVOIDSELEMENT IFCRELFILLSELEMENT': 'Sits in an opening of',
};
const CARDINALITY: Record<Cardinality, string> = { required: 'Required', optional: 'Optional', prohibited: 'Prohibited' };
const DATA_TYPES = ['IFCLABEL', 'IFCTEXT', 'IFCIDENTIFIER', 'IFCBOOLEAN', 'IFCINTEGER', 'IFCREAL', 'IFCLENGTHMEASURE', 'IFCAREAMEASURE', 'IFCVOLUMEMEASURE', 'IFCTHERMALTRANSMITTANCEMEASURE'];

interface Props {
  facet: Facet;
  requirement: boolean;
  issues: Issue[];
  onChange: (f: Facet) => void;
}

export function FacetFields({ facet: f, requirement, issues, onChange }: Props) {
  const err = (k: string) => issues.find((i) => i.key === `${f.uid}.${k}` && i.level === 'error')?.message ?? null;
  const adv = (k: string) => issues.find((i) => i.key === `${f.uid}.${k}` && i.level === 'advice')?.message ?? null;
  const set = <K extends keyof Facet>(patch: Partial<Record<K, Facet[K]>>) => onChange({ ...f, ...patch } as Facet);
  const vf = (label: string, key: string, value: Value | null, optional: boolean, apply: (v: Value | null) => void, extra: { base?: string; suggestions?: string } = {}) => (
    <ValueField key={key} label={label} value={value} optional={optional} onChange={(v) => apply(v)} error={err(key)} advice={adv(key)} {...extra} />
  );
  const allowed = requirement ? allowedCardinalities(f.kind) : null;
  return (
    <div className="facet-fields">
      <datalist id="ids-classes">{CLASSES.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="ids-datatypes">{DATA_TYPES.map((c) => <option key={c} value={c} />)}</datalist>
      {f.kind === 'entity' && <>
        {vf('IFC class', 'name', f.name, false, (v) => set({ name: v ?? simple() } as never), { suggestions: 'ids-classes' })}
        {vf('Predefined type', 'predefinedType', f.predefinedType, true, (v) => set({ predefinedType: v } as never))}
      </>}
      {f.kind === 'attribute' && <>
        {vf('Attribute name', 'name', f.name, false, (v) => set({ name: v ?? simple() } as never))}
        {vf('Value', 'value', f.value, true, (v) => set({ value: v } as never))}
      </>}
      {f.kind === 'classification' && <>
        {vf('Classification system', 'system', f.system, false, (v) => set({ system: v ?? simple() } as never))}
        {vf('Code', 'value', f.value, true, (v) => set({ value: v } as never))}
      </>}
      {f.kind === 'property' && <>
        {vf('Property set', 'propertySet', f.propertySet, false, (v) => set({ propertySet: v ?? simple() } as never))}
        {vf('Property name', 'baseName', f.baseName, false, (v) => set({ baseName: v ?? simple() } as never))}
        <TextField label="Data type" mono list="ids-datatypes" value={f.dataType ?? ''} hint="Optional, in capitals, for example IFCLABEL."
          error={err('dataType')} advice={adv('dataType')} onChange={(v) => set({ dataType: v === '' ? null : v } as never)} />
        {vf('Value', 'value', f.value, true, (v) => set({ value: v } as never), { base: baseForDataType(f.dataType) ?? 'xs:string' })}
      </>}
      {f.kind === 'material' && vf('Material', 'value', f.value, true, (v) => set({ value: v } as never))}
      {f.kind === 'partOf' && <>
        <SelectField label="Relationship" value={f.relation ?? ''} options={[...Object.entries(RELATIONS).filter(([k]) => k === '' || (PARTOF_RELATIONS as readonly string[]).includes(k)).map(([value, label]) => ({ value, label })),
          ...(f.relation && !(f.relation in RELATIONS) ? [{ value: f.relation, label: f.relation }] : [])]}
          onChange={(v) => set({ relation: v === '' ? null : v } as never)} />
        {vf('Of this IFC class', 'entity', f.entity.name, false, (v) => onChange({ ...f, entity: { ...f.entity, name: v ?? simple() } }), { suggestions: 'ids-classes' })}
      </>}
      {allowed && f.kind !== 'entity' && (
        <SelectField label="This item is" value={f.cardinality as Cardinality}
          options={allowed.map((c) => ({ value: c, label: CARDINALITY[c] }))}
          error={err('cardinality')} advice={adv('cardinality')} onChange={(c) => set({ cardinality: c } as never)} />
      )}
      {requirement && (
        <details className="more">
          <summary>More details</summary>
          <TextField label="Instructions for the people delivering the model" multiline value={f.instructions ?? ''} onChange={(v) => set({ instructions: v === '' ? null : v } as never)} />
          {'uri' in f && <TextField label="Link to a definition (web address)" value={f.uri ?? ''} onChange={(v) => set({ uri: v === '' ? null : v } as never)} />}
        </details>
      )}
    </div>
  );
}

import { NOUNS } from '../../core/ids/words';
const CLASSES = Object.keys(NOUNS);
