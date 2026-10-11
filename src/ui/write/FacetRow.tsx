import { useMemo } from 'react';
import { Combo } from './Combo';
import { SelectField, TextField } from './fields';
import { ValueField } from './ValueField';
import { allowedCardinalities, type Cardinality, type Facet, type FacetKind, type Value, PARTOF_RELATIONS, simple } from '../../core/ids/model';
import { baseForDataType, fromPattern, modeOf } from '../../core/ids/value';
import type { Issue } from '../../core/ids/check';
import { plainName, type Lists, type Option } from '../../core/picks';

export const FACET_INFO: Record<FacetKind, { name: string; about: string }> = {
  entity: { name: 'Type of element', about: 'The exact kind of element, such as a wall or a door. A class does not include its subtypes.' },
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
const NOT_STANDARD = 'A custom name: it is not one the IFC standard defines.';
const NOT_IN_ALL = 'Not a name every IFC version ticked for this specification defines.';
const NONE: Option[] = [];
const text = (v: Value | null | undefined) => (v && v.kind === 'simple' ? v.value : '');

export interface Props {
  facet: Facet;
  requirement: boolean;
  issues: Issue[];
  onChange: (f: Facet) => void;
  /** The pick-lists for the IFC versions the specification ticks; null until their tables have loaded. */
  lists: Lists | null;
  /** True when the specification ticks more than one IFC version: the lists then hold what all of them define. */
  several: boolean;
  /** The IFC class this specification applies to, when it names exactly one: it narrows the lists. */
  appliesTo: string;
  /** Set on the "Type of element" item when its classes are one class and its subtypes: the class is shown as that class, with the choice to include the subtypes. */
  family?: { head: string; subtypes: string[]; onHead: (upper: string) => void; onExact: () => void; /** Show the list as the list it is, to be changed by hand. */ onList: () => void } | null;
  /** Apply the specification to these IFC versions only (the person pressed the button beside a name that only they define). */
  onLimitVersions?: (versions: string[]) => void;
}

/** The sentence for a name typed in a standard property set that the set does not define. */
export function noSuchProperty(pset: string, name: string, standard: Option[]): string {
  const shown = standard.slice(0, 8).map((o) => o.value).join(', ');
  const rest = standard.length - 8;
  return `${pset} has no property called ${name}. Standard ones are: ${shown}${rest > 0 ? ` and ${rest} more` : ''}. Use a custom property set for your own properties.`;
}

export function FacetFields({ facet: f, requirement, issues, onChange, lists, several, appliesTo, onLimitVersions, family }: Props) {
  const notListed = several ? NOT_IN_ALL : NOT_STANDARD;
  const err = (k: string) => issues.find((i) => i.key === `${f.uid}.${k}` && i.level === 'error')?.message ?? null;
  const adv = (k: string) => issues.find((i) => i.key === `${f.uid}.${k}` && i.level === 'advice')?.message ?? null;
  const set = (patch: Partial<Record<string, unknown>>) => onChange({ ...f, ...patch } as Facet);
  const vf = (label: string, key: string, value: Value | null, optional: boolean, apply: (v: Value | null) => void, extra: { base?: string; options?: Option[]; customNote?: string; extraOptions?: Option[]; typedNote?: (text: string, found: number) => string | null } = {}) => (
    <ValueField key={key} dataKey={`${f.uid}.${key}`} label={label} value={value} optional={optional} onChange={(v) => apply(v)} error={err(key)} advice={adv(key)} {...extra} />
  );
  const classes = lists?.classes ?? NONE;
  const dataTypes = lists?.dataTypes ?? NONE;
  // In "Must have" the attribute has to be one the class named in "Applies to" has, or the two can never describe the same element.
  const attributes = useMemo(() => (lists && f.kind === 'attribute' ? lists.attributes(requirement ? appliesTo || undefined : undefined) : NONE), [lists, f.kind, requirement, appliesTo]);
  // The predefined types offered are those of the class; for a class with its subtypes included, those of the class.
  const ownClass = f.kind === 'entity' ? (family?.head ?? text(f.name)) : f.kind === 'partOf' ? text(f.entity.name) : '';
  const predefined = useMemo(() => (lists && ownClass ? lists.predefinedTypes(ownClass) : NONE), [lists, ownClass]);
  const psets = useMemo(() => (lists && f.kind === 'property' ? lists.propertySets(appliesTo || undefined) : NONE), [lists, f.kind, appliesTo]);
  const psetName = f.kind === 'property' ? text(f.propertySet) : '';
  const props = useMemo(() => (lists && psetName ? lists.properties(psetName) : NONE), [lists, psetName]);
  const psetsPartial = useMemo(() => (lists && f.kind === 'property' ? lists.propertySetsPartial(appliesTo || undefined) : NONE), [lists, f.kind, appliesTo]);
  const propsPartial = useMemo(() => (lists && psetName ? lists.propertiesPartial(psetName) : NONE), [lists, psetName]);
  const baseName = f.kind === 'property' ? text(f.baseName) : '';
  // A name that only some of the ticked versions define: the file would be rejected for the others, so the person is told which have it.
  const onlySome = f.kind === 'property' ? [...psetsPartial.filter((o) => o.value === psetName), ...propsPartial.filter((o) => o.value === baseName)][0] ?? null : null;
  // A property typed into a standard set that does not define it, said before the field is left (and after).
  const mentionable = (t: string) => (props.length > 0 && !propsPartial.some((o) => o.value === t) ? noSuchProperty(psetName, t, props) : null);
  const allowed = requirement ? allowedCardinalities(f.kind) : null;
  return (
    <div className="facet-fields">
      {f.kind === 'entity' && <>
        {family
          // "One of a list" chosen here opens the list as it is written (the class and its subtypes), not a list of the class alone.
          ? vf('IFC class', 'name', simple(family.head), false, (v) => (v?.kind === 'simple' ? family.onHead(v.value) : v && modeOf(v) === 'list' ? family.onList() : set({ name: v ?? simple() })), { options: classes, customNote: notListed })
          : vf('IFC class', 'name', f.name, false, (v) => set({ name: v ?? simple() }), { options: classes, customNote: notListed })}
        {family && (
          <label className="check subtype-choice">
            <input type="checkbox" checked onChange={() => family.onExact()} />{' '}
            Include the subtypes: {family.subtypes.length <= 3 ? family.subtypes.join(', ') : `${family.subtypes.length} classes`}
          </label>
        )}
        {vf('Predefined type', 'predefinedType', f.predefinedType, true, (v) => set({ predefinedType: v }), { options: predefined })}
      </>}
      {f.kind === 'attribute' && <>
        {vf('Attribute', 'name', f.name, false, (v) => set({ name: v ?? simple() }), { options: attributes, customNote: requirement && appliesTo ? 'Not an attribute of the class this specification applies to.' : notListed })}
        {vf('Value', 'value', f.value, true, (v) => set({ value: v }))}
        {requirement && f.value === null && text(f.name) && (
          <p className="next-choice">
            <button type="button" className="btn small quiet" onClick={() => set({ value: fromPattern('', 'xs:string') })}>...and the {plainName(text(f.name)).toLowerCase()} must follow a pattern</button>
          </p>
        )}
      </>}
      {f.kind === 'classification' && <>
        {vf('Classification system', 'system', f.system, false, (v) => set({ system: v ?? simple() }))}
        {vf('Code', 'value', f.value, true, (v) => set({ value: v }))}
      </>}
      {f.kind === 'property' && <>
        {vf('Property set', 'propertySet', f.propertySet, false, (v) => set({ propertySet: v ?? simple() }), { options: psets, extraOptions: psetsPartial, customNote: appliesTo || several ? 'A custom property set: not one the IFC standard defines for this class and the IFC versions ticked.' : 'A custom property set: it is not one the IFC standard defines.' })}
        {vf('Property', 'baseName', f.baseName, false, (v) => {
          // A property of a standard set brings its data type with it.
          const type = lists && v?.kind === 'simple' && psetName ? lists.dataTypeFor(psetName, v.value) : null;
          set(type ? { baseName: v ?? simple(), dataType: type } : { baseName: v ?? simple() });
        }, { options: props, extraOptions: propsPartial, typedNote: (t, found) => (found === 0 ? mentionable(t) : null), customNote: mentionable(baseName) ?? undefined })}
        {onlySome?.onlyIn && (
          <p className="msg advice-msg limit-versions">
            {onlySome.value} is defined by {onlySome.onlyIn.join(' and ')} only, and this specification also lists the other IFC versions, so the check would refuse it.{' '}
            <button type="button" className="btn small" onClick={() => onLimitVersions?.(onlySome.onlyIn!)}>Apply this specification to {onlySome.onlyIn.join(' and ')} only</button>
          </p>
        )}
        <Combo label="Data type" dataKey={`${f.uid}.dataType`} value={f.dataType ?? ''} options={dataTypes} hint="Needed when you give a value."
          error={err('dataType')} advice={adv('dataType')} onChange={(v) => set({ dataType: v === '' ? null : v })} />
        {vf('Value', 'value', f.value, true, (v) => set({ value: v }), { base: baseForDataType(f.dataType) ?? 'xs:string' })}
      </>}
      {f.kind === 'material' && vf('Material', 'value', f.value, true, (v) => set({ value: v }))}
      {f.kind === 'partOf' && <>
        <SelectField label="Relationship" dataKey={`${f.uid}.relation`} error={err('relation')} advice={adv('relation')} value={f.relation ?? ''} options={[...Object.entries(RELATIONS).filter(([k]) => k === '' || (PARTOF_RELATIONS as readonly string[]).includes(k)).map(([value, label]) => ({ value, label })),
          ...(f.relation && !(f.relation in RELATIONS) ? [{ value: f.relation, label: f.relation }] : [])]}
          onChange={(v) => set({ relation: v === '' ? null : v })} />
        {vf('Of this IFC class', 'entity', f.entity.name, false, (v) => onChange({ ...f, entity: { ...f.entity, name: v ?? simple() } }), { options: classes, customNote: notListed })}
        {vf('Predefined type', 'predefinedType', f.entity.predefinedType, true, (v) => onChange({ ...f, entity: { ...f.entity, predefinedType: v } }), { options: predefined })}
      </>}
      {allowed && f.kind !== 'entity' && (
        <SelectField label="This item is" dataKey={`${f.uid}.cardinality`} value={f.cardinality as Cardinality}
          options={allowed.map((c) => ({ value: c, label: CARDINALITY[c] }))}
          error={err('cardinality')} advice={adv('cardinality')} onChange={(c) => set({ cardinality: c })} />
      )}
      {requirement && (
        <details className="more">
          <summary>More options</summary>
          <TextField label="Instructions for the people delivering the model" multiline value={f.instructions ?? ''} onChange={(v) => set({ instructions: v === '' ? null : v })} />
          {'uri' in f && <TextField label="Link to a definition (web address)" value={f.uri ?? ''} onChange={(v) => set({ uri: v === '' ? null : v })} />}
        </details>
      )}
    </div>
  );
}
