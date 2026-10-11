import type { Finding } from '@idsbench/check';
import { failureTotalOf } from '../../core/csv';
import { capGroups, groupFailures, ownValues } from '../../core/groups';
import type { Issue } from '../../core/ids/check';
import type { Specification } from '../../core/ids/model';
import { describeSpecification, type WordsOptions } from '../../core/ids/words';
import { subtypeAction, type SubtypeNote } from '../../core/subtypes';
import { SubtypeLine } from './SubtypeLine';
import { plural } from '../../core/shape';
import { FAILURE_CAP, type SpecRow as Result, type SpecState } from '../../core/types';
import { SpecEditor } from '../write/SpecEditor';
import { Findings } from './Findings';

const STATE_TEXT: Record<SpecState, string> = { pass: 'Pass', fail: 'Fail', nothing: 'Nothing to check', unchecked: 'Not checked' };

/** The failing elements of one specification, one group per reason, so each reason is read once. */
export function FailureGroups({ spec }: { spec: Result }) {
  // A row made in the worker carries its groups, counted over every failing element; one built by hand is grouped here.
  const { shown, notShown } = spec.groups ? { shown: spec.groups, notShown: spec.notListed ?? 0 } : capGroups(groupFailures(spec.failures), FAILURE_CAP);
  if (shown.length === 0) return null;
  const total = failureTotalOf(spec);
  const listed = total - notShown;
  return (
    <details className="more fails">
      <summary>Show the {plural(total, 'failing element')}, by reason</summary>
      {shown.map((g, i) => (
        <section key={i} className="fail-group" aria-label={g.reason}>
          <h5 className="group-reason">{plural(g.total, 'element')}: {g.reason}{g.varies ? ' Each element\'s own value is in the last column.' : ''}</h5>
          <div className="table-wrap">
            {/* The roles keep this a table for screen readers on a narrow screen, where each row is laid out as a block. */}
            <table role="table">
              <thead role="rowgroup">
                <tr role="row"><th role="columnheader">IFC class</th><th role="columnheader">Name</th><th role="columnheader">GlobalId</th>{g.varies && <th role="columnheader">It has</th>}</tr>
              </thead>
              <tbody role="rowgroup">
                {g.elements.map((f, j) => (
                  <tr key={j} role="row">
                    <td role="cell">{f.ifcClass}</td>
                    <td role="cell">{f.name ?? '(no name)'}</td>
                    <td role="cell" className="mono">{f.globalId ?? '(none)'}</td>
                    {g.varies && <td role="cell">{ownValues(f)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {notShown > 0 && (
        <p className="note">
          The first {listed.toLocaleString('en')} failing elements are listed here. {notShown.toLocaleString('en')} more {notShown === 1 ? 'is' : 'are'} not shown on this page. The downloaded files list all {total.toLocaleString('en')}.
        </p>
      )}
    </details>
  );
}

interface Props {
  spec: Specification;
  index: number;
  count: number;
  /** The result of the run for this specification, when there is a current one. */
  result: Result | null;
  /** What the state cell says when there is no result: a model is loaded but its result is not there (yet). */
  waiting: string | null;
  findings: Finding[];
  xml: string;
  issues: Issue[];
  editing: boolean;
  primary: boolean;
  focusKey: { key: string; n: number } | null;
  onEdit: (open: boolean) => void;
  onChange: (s: Specification) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
  /** What the specification's classes leave out (their subtypes), when it leaves any out; and the action that adds them. */
  subtypes?: SubtypeNote | null;
  onAddSubtypes?: () => void;
  /** What the IFC tables tell the sentence (plain class names, classes that are one class and its subtypes). */
  words?: WordsOptions;
  /** One line on what the last edit did to this specification's result ("Now fails: 1 element"). */
  changed?: string | null;
}

/** One specification: its sentence first, then its result, what the engine found in it, and its form when it is being edited. */
export function SpecRow({ spec: s, index, count, result, waiting, findings, xml, issues, editing, primary, focusKey, onEdit, onChange, onMove, onDelete, subtypes, onAddSubtypes, words: wordsOptions, changed }: Props) {
  const label = s.name.trim() || 'Untitled specification';
  const words = describeSpecification(s, wordsOptions);
  // While a row is being edited its result is not shown as its state.
  const state = editing ? <span className="state waiting">Editing</span>
    : result ? <span className={`state ${result.state}`}>{STATE_TEXT[result.state]}</span>
    : waiting ? <span className="state waiting">{waiting}</span> : null;
  return (
    <li className={`spec${editing ? ' editing' : ''}`} id={`spec-${s.uid}`} data-result-of={result ? result.name : undefined}>
      <div className={`spec-head static${state ? '' : ' no-state'}`}>
        {state}
        <span className="spec-name">{label}</span>
        <span className="spec-words words" aria-label="This specification in words">{words.text}</span>
        {result && !editing && <span className="spec-counts">{result.summary}</span>}
        <span className="row-actions">
          <button type="button" className={primary ? 'btn small primary' : 'btn small'} aria-expanded={editing} aria-controls={`body-${s.uid}`} aria-label={`${editing ? 'Done editing' : 'Edit'} ${label}`} onClick={() => onEdit(!editing)}>{editing ? 'Done' : 'Edit'}</button>
        </span>
      </div>
      {changed && !editing && <p className="note change-line" role="status">{changed}</p>}
      {result?.coverage && !editing && (
        <p className="note coverage-note">
          {result.coverage.text}{' '}
          {subtypes && subtypeAction(subtypes) && onAddSubtypes && <button type="button" className="btn small" onClick={onAddSubtypes}>{subtypeAction(subtypes)}</button>}
        </p>
      )}
      {subtypes && !editing && !result?.coverage && <SubtypeLine note={subtypes} onAdd={onAddSubtypes} />}
      {result && !editing && result.note && <p className="note">{result.note}</p>}
      {result && !editing && result.schemaNote && <p className="note schema-note">{result.schemaNote}</p>}
      <Findings findings={findings} xml={xml} label={`What was found in ${label}`} />
      {result && !editing && <FailureGroups spec={result} />}
      {editing && (
        <div id={`body-${s.uid}`}>
          <SpecEditor spec={s} issues={issues} onChange={onChange} focusKey={focusKey} subtypes={subtypes ?? null} onAddSubtypes={onAddSubtypes} />
          <div className="spec-foot">
            <button type="button" className="btn small" onClick={() => onEdit(false)}>Done</button>
            <button type="button" className="btn small quiet" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${label} up`}>Move up</button>
            <button type="button" className="btn small quiet" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${label} down`}>Move down</button>
            <button type="button" className="btn small quiet" onClick={onDelete} aria-label={`Delete ${label}`}>Delete</button>
          </div>
        </div>
      )}
    </li>
  );
}
