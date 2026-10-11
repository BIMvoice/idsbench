import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FACET_INFO, FacetFields } from './FacetRow';
import { TextField } from './fields';
import { SubtypeLine } from '../page/SubtypeLine';
import type { SubtypeNote } from '../../core/subtypes';
import { classNameIn, useSchemas } from './useSchema';
import { listsFor } from '../../core/picks';
import { familyOf, narrowToHead, withDefaultSubtypes } from '../../core/subtypes';
import { pluralSubject, syncName } from '../../core/ids/naming';
import { plainName } from '../../core/picks';
import type { Lists } from '../../core/picks';
import { type Issue } from '../../core/ids/check';
import {
  IFC_VERSIONS, newFacet, occursFor, sortApplicability, specChoice,
  type Cardinality, type Facet, type FacetKind, type Specification,
} from '../../core/ids/model';

const CHOICES: { value: Cardinality; label: string; about: (what: string) => string }[] = [
  { value: 'optional', label: 'That is fine', about: (w) => `The specification applies to every ${w} the model has. A model with none passes.` },
  { value: 'required', label: 'That is a failure', about: (w) => `The model must contain at least one ${w}, and each must meet "Must have".` },
  { value: 'prohibited', label: 'None may exist', about: (w) => `The model must not contain any ${w}. "Must have" is not checked.` },
];
const KINDS: FacetKind[] = ['entity', 'attribute', 'classification', 'property', 'material', 'partOf'];

interface Props {
  spec: Specification;
  issues: Issue[];
  onChange: (s: Specification) => void;
  /** The field to put the keyboard in, when "Fix" or "Add" asked for one. */
  focusKey: { key: string; n: number } | null;
  /** What the class it applies to leaves out (its subtypes), and the action that adds them. */
  subtypes: SubtypeNote | null;
  onAddSubtypes?: () => void;
}

/** The form of one specification. What the common case needs is in view; the rest is behind "More options". */
export function SpecEditor({ spec: s, issues, onChange, focusKey, subtypes, onAddSubtypes }: Props) {
  const err = (k: string) => issues.find((i) => i.key === `${s.uid}.${k}` && i.level === 'error')?.message ?? null;
  const adv = (k: string) => issues.find((i) => i.key === `${s.uid}.${k}` && i.level === 'advice')?.message ?? null;
  const choice = specChoice(s);
  const schemas = useSchemas(s.ifcVersion);
  const lists = useMemo(() => (schemas ? listsFor(schemas) : null), [schemas]);
  const naming = useMemo(() => ({ className: classNameIn(schemas ?? []) }), [schemas]);
  const several = s.ifcVersion.length > 1;
  const entity = s.applicability.find((f) => f.kind === 'entity');
  const appliesTo = entity?.kind === 'entity' && entity.name.kind === 'simple' ? entity.name.value : '';
  const hidden = ['ifcVersion'].map((k) => `${s.uid}.${k}`);
  const [moreOpen, setMoreOpen] = useState(false);
  const more = moreOpen || !!err('ifcVersion') || (focusKey !== null && hidden.includes(focusKey.key));
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusKey || !root.current) return;
    const place = root.current.querySelector<HTMLElement>(`[data-key="${focusKey.key}"]`);
    const target = place?.matches('input, select, textarea, button') ? place : place?.querySelector<HTMLElement>('input, select, textarea, button');
    (target ?? root.current.querySelector<HTMLElement>('input'))?.focus();
    (place ?? root.current).scrollIntoView({ block: 'nearest' });
  }, [focusKey]);

  // Every change goes through here: a name the page worked out follows the content, until the person types one of their own.
  const change = (n: Specification) => onChange(syncName(n, naming));
  const setVersions = (next: string[]) => change({ ...s, ifcVersion: [...IFC_VERSIONS.filter((x) => next.includes(x)), ...next.filter((x) => !(IFC_VERSIONS as readonly string[]).includes(x))] });
  const toggleVersion = (v: string) => setVersions(s.ifcVersion.includes(v) ? s.ifcVersion.filter((x) => x !== v) : [...s.ifcVersion, v]);

  // A specification made by this page applies to the class and its subtypes in every version ticked, until the person
  // narrows it to the exact class. A class chosen in the form, or a version ticked, brings the list in step.
  const family = schemas ? familyOf(s, schemas) : null;
  const entityFacet = s.applicability.find((f) => f.kind === 'entity');
  const classChosen = entityFacet?.kind === 'entity' && entityFacet.name.kind === 'simple' && entityFacet.predefinedType === null;
  useEffect(() => {
    if (!schemas || !s.made || s.exact) return;
    const base = family ? narrowToHead(s, family) : classChosen ? s : null;
    if (!base) return;
    const wide = withDefaultSubtypes(base, schemas);
    const names = (x: Specification) => JSON.stringify(x.applicability.map((f) => (f.kind === 'entity' ? f.name : null)));
    if (names(wide) !== names(s) && (!family || entityFacet?.kind === 'entity' && entityFacet.predefinedType === null)) onChange(syncName(wide, naming));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemas, s.applicability, s.ifcVersion, s.exact, s.made]);
  const subtypeNames = family ? family.others.map((u) => plainName(naming.className(u) ?? u).toLowerCase()) : [];
  const narrow = family ? (
    <label className="check subtype-choice">
      <input type="checkbox" checked onChange={() => change({ ...narrowToHead(s, family), exact: true })} />{' '}
      Include the subtypes: {subtypeNames.length <= 3 ? subtypeNames.join(', ') : `${subtypeNames.length} classes`}
    </label>
  ) : null;
  const what = pluralSubject(s, naming) ?? 'matching element';

  return (
    <div className="spec-body" ref={root}>
      <TextField label="Name" dataKey={`${s.uid}.name`} required value={s.name} error={err('name')} onChange={(v) => onChange({ ...s, name: v, autoName: undefined })} />
      <FacetList title="Applies to" help="Which elements this specification is about." kind="applicability" facets={s.applicability} issues={issues} groupError={err('applicability')} groupAdvice={adv('applicability')}
        dataKey={`${s.uid}.applicability`} lists={lists} several={several} appliesTo="" onChange={(f) => change({ ...s, applicability: sortApplicability(f) })} onLimitVersions={setVersions}
        extra={<>{narrow}{subtypes ? <SubtypeLine note={subtypes} onAdd={onAddSubtypes} /> : null}</>} />
      <FacetList title="Must have" help="What each of those elements must have." kind="requirements" facets={s.requirements} issues={issues} groupError={err('requirements')} groupAdvice={adv('requirements')}
        dataKey={`${s.uid}.requirements`} lists={lists} several={several} appliesTo={appliesTo} onChange={(f) => change({ ...s, requirements: f })} onLimitVersions={setVersions}
        extra={(
          <details className="more requirements-more" open={s.requirementsDescription !== null && s.requirementsDescription !== '' ? true : undefined}>
            <summary>More options</summary>
            <TextField label="Description of the requirements" multiline hint="Says in words what the items above ask for. It is kept in the file as the description of the requirements."
              dataKey={`${s.uid}.requirementsDescription`} value={s.requirementsDescription ?? ''} onChange={(v) => onChange({ ...s, requirementsDescription: v === '' ? null : v })} />
          </details>
        )} />

      <fieldset className="choice-group occurs" data-key={`${s.uid}.occurs`}>
        <legend>If the model has no {what}</legend>
        {CHOICES.map((c) => (
          <label key={c.value} className="radio">
            <input type="radio" name={`${s.uid}-occurs`} checked={choice === c.value} onChange={() => change({ ...s, ...occursFor(c.value) })} />
            <span><strong>{c.label}</strong> <span className="hint">{c.about(what)}</span></span>
          </label>
        ))}
        {err('occurs') && <span className="msg error-msg">{err('occurs')}</span>}
        {choice === 'custom' && (
          <label className="radio"><input type="radio" name={`${s.uid}-occurs`} checked readOnly />
            <span><strong>Custom</strong> <span className="hint">Between {s.minOccurs} and {s.maxOccurs} matching elements, as in the opened file. Choose one of the above to replace it.</span></span>
          </label>
        )}
      </fieldset>

      <details className="more" open={more} onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary>More options</summary>
        <fieldset className="choice-group" data-key={`${s.uid}.ifcVersion`}>
          <legend>IFC versions this applies to</legend>
          {IFC_VERSIONS.map((v) => (
            <label key={v} className="check"><input type="checkbox" checked={s.ifcVersion.includes(v)} onChange={() => toggleVersion(v)} /> {v}</label>
          ))}
          {err('ifcVersion') && <span className="msg error-msg">{err('ifcVersion')}</span>}
        </fieldset>
        <TextField label="Description" multiline hint="Why this information is needed." value={s.description ?? ''} onChange={(v) => onChange({ ...s, description: v === '' ? null : v })} />
        <TextField label="Instructions" multiline hint="How the people delivering the model should provide it." value={s.instructions ?? ''} onChange={(v) => onChange({ ...s, instructions: v === '' ? null : v })} />
        <TextField label="Identifier" hint="A short code to refer to this specification, such as SP01." value={s.identifier ?? ''} onChange={(v) => onChange({ ...s, identifier: v === '' ? null : v })} />
      </details>
    </div>
  );
}

interface ListProps {
  title: string; help: string; kind: 'applicability' | 'requirements';
  facets: Facet[]; issues: Issue[]; groupError: string | null; groupAdvice?: string | null;
  onChange: (f: Facet[]) => void; dataKey: string; lists: Lists | null; several: boolean; appliesTo: string;
  /** More under the list, inside its group. */
  extra?: ReactNode;
  onLimitVersions?: (versions: string[]) => void;
}

function FacetList({ title, help, kind, facets, issues, groupError, groupAdvice, onChange, dataKey, lists, several, appliesTo, extra, onLimitVersions }: ListProps) {
  const [adding, setAdding] = useState(false);
  // Where keyboard focus goes after a change that removes the button that had it.
  const [focusNext, setFocusNext] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focusNext || !root.current) return;
    const r = root.current;
    const target = focusNext === 'menu' ? r.querySelector('.add-menu button:not([disabled])')
      : focusNext === 'add' ? r.querySelector('[data-add]')
      : r.querySelector(`[data-facet="${focusNext}"] input[type=text], [data-facet="${focusNext}"] textarea`) ?? r.querySelector(`[data-facet="${focusNext}"] select`);
    (target as HTMLElement | null)?.focus();
    setFocusNext(null);
  }, [focusNext, adding, facets.length]);
  const requirement = kind === 'requirements';
  const hasEntity = facets.some((f) => f.kind === 'entity');
  const move = (i: number, d: -1 | 1) => {
    const next = [...facets];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  // In "Applies to" the standard fixes the order of the kinds, so an item only swaps with one of its own kind.
  const canMove = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= facets.length) return false;
    return requirement || facets[j].kind === facets[i].kind;
  };
  return (
    <section className="facet-list" aria-label={title} ref={root} data-key={dataKey}>
      <h4>{title}</h4>
      <p className="hint">{help}</p>
      {facets.length === 0 && <p className="empty">{requirement ? 'Nothing is required yet. Add an item to say what these elements must have.' : 'Nothing here yet. Add the first item to say which elements this is about.'}</p>}
      {groupError && <p className="msg error-msg">{groupError}</p>}
      {!groupError && groupAdvice && <p className="msg advice-msg">{groupAdvice}</p>}
      <ol className="facets">
        {facets.map((f, i) => (
          <li key={f.uid} className="facet" data-facet={f.uid}>
            <div className="facet-head">
              <h5>{FACET_INFO[f.kind].name}</h5>
              <span className="row-actions">
                {facets.length > 1 && canMove(i, -1) && <button type="button" className="btn small quiet" onClick={() => move(i, -1)} aria-label={`Move ${FACET_INFO[f.kind].name} item ${i + 1} up in ${title}`}>Up</button>}
                {facets.length > 1 && canMove(i, 1) && <button type="button" className="btn small quiet" onClick={() => move(i, 1)} aria-label={`Move ${FACET_INFO[f.kind].name} item ${i + 1} down in ${title}`}>Down</button>}
                <button type="button" className="btn small quiet" onClick={() => { onChange(facets.filter((x) => x !== f)); setFocusNext('add'); }} aria-label={`Remove ${FACET_INFO[f.kind].name} item ${i + 1} from ${title}`}>Remove</button>
              </span>
            </div>
            <FacetFields facet={f} requirement={requirement} issues={issues} lists={lists} several={several} appliesTo={appliesTo} onLimitVersions={onLimitVersions} onChange={(n) => onChange(facets.map((x) => (x === f ? n : x)))} />
          </li>
        ))}
      </ol>
      {adding ? (
        <div className="add-menu" role="group" aria-label={`Add to ${title}`}>
          <ul>
            {KINDS.map((k) => {
              const blocked = !requirement && k === 'entity' && hasEntity;
              return (
                <li key={k}>
                  <button type="button" className="btn small" disabled={blocked} onClick={() => { const nf = newFacet(k, kind); onChange([...facets, nf]); setAdding(false); setFocusNext(nf.uid); }}>
                    {FACET_INFO[k].name}
                  </button>
                  <span className="hint">{blocked ? 'Only one is allowed here.' : FACET_INFO[k].about}</span>
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn small" onClick={() => { setAdding(false); setFocusNext('add'); }}>Cancel</button>
        </div>
      ) : (
        <button type="button" className="btn small" data-add onClick={() => { setAdding(true); setFocusNext('menu'); }} aria-label={`Add an item to ${title}`}>Add an item</button>
      )}
      {extra}
    </section>
  );
}
