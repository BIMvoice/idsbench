import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FACET_INFO, FacetFields } from './FacetRow';
import { TextField } from './fields';
import { SubtypeLine } from '../page/SubtypeLine';
import type { SubtypeNote } from '../../core/subtypes';
import { useLists } from './useSchema';
import type { Lists } from '../../core/picks';
import { type Issue } from '../../core/ids/check';
import {
  IFC_VERSIONS, newFacet, occursFor, sortApplicability, specChoice,
  type Cardinality, type Facet, type FacetKind, type Specification,
} from '../../core/ids/model';

const CHOICES: { value: Cardinality; label: string; about: string }[] = [
  { value: 'required', label: 'Required', about: 'The model must contain at least one matching element, and each must meet "Must have".' },
  { value: 'optional', label: 'Optional', about: 'The model may have matching elements. Each one that exists must meet "Must have".' },
  { value: 'prohibited', label: 'Prohibited', about: 'The model must not contain any matching element. "Must have" is not checked.' },
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
  const lists = useLists(s.ifcVersion);
  const several = s.ifcVersion.length > 1;
  const entity = s.applicability.find((f) => f.kind === 'entity');
  const appliesTo = entity?.kind === 'entity' && entity.name.kind === 'simple' ? entity.name.value : '';
  const hidden = ['ifcVersion', 'occurs'].map((k) => `${s.uid}.${k}`);
  const [moreOpen, setMoreOpen] = useState(false);
  const more = moreOpen || choice !== 'required' || !!err('ifcVersion') || !!err('occurs') || (focusKey !== null && hidden.includes(focusKey.key));
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusKey || !root.current) return;
    const place = root.current.querySelector<HTMLElement>(`[data-key="${focusKey.key}"]`);
    const target = place?.matches('input, select, textarea, button') ? place : place?.querySelector<HTMLElement>('input, select, textarea, button');
    (target ?? root.current.querySelector<HTMLElement>('input'))?.focus();
    (place ?? root.current).scrollIntoView({ block: 'nearest' });
  }, [focusKey]);

  const toggleVersion = (v: string) => {
    const on = s.ifcVersion.includes(v);
    const next = on ? s.ifcVersion.filter((x) => x !== v) : [...s.ifcVersion, v];
    onChange({ ...s, ifcVersion: [...IFC_VERSIONS.filter((x) => next.includes(x)), ...next.filter((x) => !(IFC_VERSIONS as readonly string[]).includes(x))] });
  };

  return (
    <div className="spec-body" ref={root}>
      <TextField label="Name" dataKey={`${s.uid}.name`} required value={s.name} error={err('name')} onChange={(v) => onChange({ ...s, name: v })} />
      <FacetList title="Applies to" help="Which elements this specification is about." kind="applicability" facets={s.applicability} issues={issues} groupError={err('applicability')} groupAdvice={adv('applicability')}
        dataKey={`${s.uid}.applicability`} lists={lists} several={several} appliesTo="" onChange={(f) => onChange({ ...s, applicability: sortApplicability(f) })}
        extra={subtypes ? <SubtypeLine note={subtypes} onAdd={onAddSubtypes} /> : undefined} />
      <FacetList title="Must have" help="What each of those elements must have." kind="requirements" facets={s.requirements} issues={issues} groupError={err('requirements')} groupAdvice={adv('requirements')}
        dataKey={`${s.uid}.requirements`} lists={lists} several={several} appliesTo={appliesTo} onChange={(f) => onChange({ ...s, requirements: f })}
        extra={(
          <details className="more requirements-more" open={s.requirementsDescription !== null && s.requirementsDescription !== '' ? true : undefined}>
            <summary>More options</summary>
            <TextField label="Description of the requirements" multiline hint="Says in words what the items above ask for. It is kept in the file as the description of the requirements."
              dataKey={`${s.uid}.requirementsDescription`} value={s.requirementsDescription ?? ''} onChange={(v) => onChange({ ...s, requirementsDescription: v === '' ? null : v })} />
          </details>
        )} />

      <details className="more" open={more} onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary>More options</summary>
        <fieldset className="choice-group" data-key={`${s.uid}.occurs`}>
          <legend>Matching elements in the model are</legend>
          {CHOICES.map((c) => (
            <label key={c.value} className="radio">
              <input type="radio" name={`${s.uid}-occurs`} checked={choice === c.value} onChange={() => onChange({ ...s, ...occursFor(c.value) })} />
              <span><strong>{c.label}</strong> <span className="hint">{c.about}</span></span>
            </label>
          ))}
          {err('occurs') && <span className="msg error-msg">{err('occurs')}</span>}
          {choice === 'custom' && (
            <label className="radio"><input type="radio" name={`${s.uid}-occurs`} checked readOnly />
              <span><strong>Custom</strong> <span className="hint">Between {s.minOccurs} and {s.maxOccurs} matching elements, as in the opened file. Choose one of the above to replace it.</span></span>
            </label>
          )}
        </fieldset>
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
}

function FacetList({ title, help, kind, facets, issues, groupError, groupAdvice, onChange, dataKey, lists, several, appliesTo, extra }: ListProps) {
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
            <FacetFields facet={f} requirement={requirement} issues={issues} lists={lists} several={several} appliesTo={appliesTo} onChange={(n) => onChange(facets.map((x) => (x === f ? n : x)))} />
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
