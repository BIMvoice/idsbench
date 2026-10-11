import { useEffect, useRef, useState } from 'react';
import { FACET_INFO, FacetFields } from './FacetRow';
import { TextField } from './fields';
import { type Issue } from '../../core/ids/check';
import { describeSpecification } from '../../core/ids/words';
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
}

export function SpecEditor({ spec: s, issues, onChange }: Props) {
  const mine = issues.filter((i) => i.key.startsWith(`${s.uid}.`));
  const err = (k: string) => mine.find((i) => i.key === `${s.uid}.${k}` && i.level === 'error')?.message ?? null;
  const adv = (k: string) => mine.find((i) => i.key === `${s.uid}.${k}` && i.level === 'advice')?.message ?? null;
  const choice = specChoice(s);
  const words = describeSpecification(s);
  const facetIssues = issues.filter((i) => i.key.split('.')[0] !== s.uid);

  const toggleVersion = (v: string) => {
    const on = s.ifcVersion.includes(v);
    const next = on ? s.ifcVersion.filter((x) => x !== v) : [...s.ifcVersion, v];
    onChange({ ...s, ifcVersion: [...IFC_VERSIONS.filter((x) => next.includes(x)), ...next.filter((x) => !(IFC_VERSIONS as readonly string[]).includes(x))] });
  };

  return (
    <div className="spec-body">
      <p className="words" aria-label="This IDS in words"><strong>In words:</strong> {words.text}</p>
      <TextField label="Name" required value={s.name} error={err('name')} onChange={(v) => onChange({ ...s, name: v })} />
      <fieldset className="choice-group">
        <legend>IFC versions this applies to</legend>
        {IFC_VERSIONS.map((v) => (
          <label key={v} className="check"><input type="checkbox" checked={s.ifcVersion.includes(v)} onChange={() => toggleVersion(v)} /> {v}</label>
        ))}
        {err('ifcVersion') && <span className="msg error-msg">{err('ifcVersion')}</span>}
      </fieldset>
      <TextField label="Description" multiline hint="Why this information is needed." value={s.description ?? ''} onChange={(v) => onChange({ ...s, description: v === '' ? null : v })} />
      <TextField label="Instructions" multiline hint="How the people delivering the model should provide it." value={s.instructions ?? ''} onChange={(v) => onChange({ ...s, instructions: v === '' ? null : v })} />
      <fieldset className="choice-group">
        <legend>Matching elements in the model are</legend>
        {CHOICES.map((c) => (
          <label key={c.value} className="radio">
            <input type="radio" name={`${s.uid}-occurs`} checked={choice === c.value} onChange={() => onChange({ ...s, ...occursFor(c.value) })} />
            <span><strong>{c.label}</strong> <span className="hint">{c.about}</span></span>
          </label>
        ))}
        {choice === 'custom' && (
          <label className="radio"><input type="radio" name={`${s.uid}-occurs`} checked readOnly />
            <span><strong>Custom</strong> <span className="hint">Between {s.minOccurs} and {s.maxOccurs} matching elements, as in the opened file. Choose one of the above to replace it.</span></span>
          </label>
        )}
      </fieldset>

      <FacetList title="Applies to" help="Which elements this specification is about." kind="applicability" facets={s.applicability} issues={facetIssues} groupError={err('applicability')}
        onChange={(f) => onChange({ ...s, applicability: sortApplicability(f) })} specName={s.name} />
      <FacetList title="Must have" help="What each of those elements must have." kind="requirements" facets={s.requirements} issues={facetIssues} groupError={null} groupAdvice={adv('requirements')}
        onChange={(f) => onChange({ ...s, requirements: f })} specName={s.name} />

      <details className="more">
        <summary>More details</summary>
        <TextField label="Identifier" hint="A short code to refer to this specification, such as SP01." value={s.identifier ?? ''} onChange={(v) => onChange({ ...s, identifier: v === '' ? null : v })} />
      </details>
    </div>
  );
}

interface ListProps {
  title: string; help: string; kind: 'applicability' | 'requirements';
  facets: Facet[]; issues: Issue[]; groupError: string | null; groupAdvice?: string | null;
  onChange: (f: Facet[]) => void; specName: string;
}

function FacetList({ title, help, kind, facets, issues, groupError, groupAdvice, onChange }: ListProps) {
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
    const j = i + d;
    if (j < 0 || j >= facets.length) return;
    const next = [...facets];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  // In an applicability the schema fixes the order of the kinds, so an item only swaps with one of its own kind.
  const canMove = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= facets.length) return false;
    return requirement || facets[j].kind === facets[i].kind;
  };
  return (
    <section className="facet-list" aria-label={title} ref={root}>
      <h4>{title}</h4>
      <p className="hint">{help}</p>
      {facets.length === 0 && <p className="empty">{requirement ? 'Nothing is required yet. Add an item to say what these elements must have.' : 'Nothing here yet. Add the first item to say which elements this is about.'}</p>}
      {groupError && <p className="msg error-msg">{groupError}</p>}
      {groupAdvice && <p className="msg advice-msg">{groupAdvice}</p>}
      <ol className="facets">
        {facets.map((f, i) => (
          <li key={f.uid} className="facet" data-facet={f.uid}>
            <div className="facet-head">
              <h5>{FACET_INFO[f.kind].name}</h5>
              <span className="row-actions">
                <button type="button" className="btn small" disabled={!canMove(i, -1)} onClick={() => move(i, -1)} aria-label={`Move ${FACET_INFO[f.kind].name} item ${i + 1} up in ${title}`}>Move up</button>
                <button type="button" className="btn small" disabled={!canMove(i, 1)} onClick={() => move(i, 1)} aria-label={`Move ${FACET_INFO[f.kind].name} item ${i + 1} down in ${title}`}>Move down</button>
                <button type="button" className="btn small" onClick={() => { onChange(facets.filter((x) => x !== f)); setFocusNext('add'); }} aria-label={`Delete ${FACET_INFO[f.kind].name} item ${i + 1} from ${title}`}>Delete</button>
              </span>
            </div>
            <FacetFields facet={f} requirement={requirement} issues={issues} onChange={(n) => onChange(facets.map((x) => (x === f ? n : x)))} />
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
                  <button type="button" className="btn" disabled={blocked} onClick={() => { const nf = newFacet(k, kind); onChange([...facets, nf]); setAdding(false); setFocusNext(nf.uid); }}>
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
        <button type="button" className="btn" data-add onClick={() => { setAdding(true); setFocusNext('menu'); }} aria-label={`Add an item to ${title}`}>Add</button>
      )}
    </section>
  );
}

