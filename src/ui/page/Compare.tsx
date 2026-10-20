/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { capGroups, groupFailures, ownValues } from '../../core/groups';
import { ELEMENT_CHANGE_WORDS, ELEMENT_CHANGES, elementsOf, NO_LONGER_FAILING, SPEC_CHANGE_WORDS, type Comparison, type ElementChange, type SpecChange, type SpecComparison } from '../../core/compare';
import { formatSize } from '../../core/format';
import type { ModelBytes } from '../../core/session';
import { plural } from '../../core/shape';
import { FAILURE_CAP, type SpecState } from '../../core/types';

/** The box a change is drawn with: the state the specification is in now, or Not checked when there is nothing to compare. */
const BOX: Record<SpecChange, SpecState> = {
  'now-passes': 'pass', 'still-passes': 'pass', 'now-fails': 'fail', 'still-fails': 'fail', 'not-checked': 'unchecked', 'not-in-both': 'unchecked',
};

/** One kind of element change of one specification, grouped by reason as the list of failing elements is. */
function ChangeGroup({ spec, change }: { spec: SpecComparison; change: ElementChange }) {
  const list = elementsOf(spec, change);
  if (list.length === 0) return null;
  const { shown, notShown } = capGroups(groupFailures(list), FAILURE_CAP);
  const before = NO_LONGER_FAILING.has(change);
  return (
    <section className="fail-group change-group" aria-label={`${ELEMENT_CHANGE_WORDS[change]}: ${plural(list.length, 'element')}`}>
      <h5>{ELEMENT_CHANGE_WORDS[change]}: {plural(list.length, 'element')}</h5>
      {shown.map((g, i) => (
        <div key={i}>
          <p className="group-reason">{plural(g.total, 'element')}{before ? ', which failed because: ' : ': '}{g.reason}{g.varies ? ' Each element\'s own value is in the last column.' : ''}</p>
          <div className="table-wrap">
            <table role="table">
              <thead role="rowgroup">
                <tr role="row"><th role="columnheader">IFC class</th><th role="columnheader">Name</th><th role="columnheader">GlobalId</th>{g.varies && <th role="columnheader">{before ? 'It had' : 'It has'}</th>}</tr>
              </thead>
              <tbody role="rowgroup">
                {g.elements.map((f, j) => (
                  <tr key={j} role="row">
                    <td role="cell">{f.ifcClass}</td>
                    <td role="cell">{f.name ?? '(no name)'}</td>
                    <td role="cell" className="mono">{f.globalId}</td>
                    {g.varies && <td role="cell">{ownValues(f)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {notShown > 0 && <p className="note-plain">The first {(list.length - notShown).toLocaleString('en')} are listed here. Download the comparison lists all {list.length.toLocaleString('en')}.</p>}
    </section>
  );
}

interface Props {
  comparison: Comparison | null;
  /** The bytes each run was read from. */
  earlierBytes: ModelBytes | null;
  laterBytes: ModelBytes | null;
  /** Set while the earlier delivery is being run. */
  working: boolean;
  /** Why the earlier delivery could not be run, when it could not. */
  error: string | null;
  onDownload: () => void;
  onRunAgain: () => void;
}

/** The model against the earlier delivery: the two files, one sentence, and per specification what changed and which elements. */
export function Compare({ comparison: c, earlierBytes, laterBytes, working, error, onDownload, onRunAgain }: Props) {
  const sha = (b: ModelBytes | null) => b?.sha256 ?? 'not available in this browser';
  return (
    <section className="spec-section compare" aria-labelledby="compare-title" id="compare">
      <h3 id="compare-title">Compared with the earlier delivery</h3>
      <div aria-live="polite">
        {error ? (
          <div className="model-refusal" role="alert">
            <p className="error">The earlier delivery could not be checked. {error}</p>
            <p className="refusal-action"><button type="button" className="btn small" onClick={onRunAgain}>Run again</button></p>
          </div>
        ) : !c ? (
          working ? <p className="working">Checking the earlier delivery against the same IDS file...</p> : null
        ) : (
          <>
            <p className="compare-headline" id="compare-headline">{c.headline}</p>
            {c.elementLine && <p className="note-plain" id="compare-elements">{c.elementLine}</p>}
          </>
        )}
      </div>
      {c && <>
        <div className="table-wrap compare-files">
          <table role="table" aria-label="The two models compared">
            <thead role="rowgroup">
              <tr role="row"><th role="columnheader">Delivery</th><th role="columnheader">Model</th><th role="columnheader">Size</th><th role="columnheader">SHA-256</th></tr>
            </thead>
            <tbody role="rowgroup">
              <tr role="row"><td role="cell">Earlier</td><td role="cell">{c.earlierFile}</td><td role="cell">{earlierBytes ? formatSize(earlierBytes.bytes) : ''}</td><td role="cell" className="ident sha">{sha(earlierBytes)}</td></tr>
              <tr role="row"><td role="cell">This model</td><td role="cell">{c.laterFile}</td><td role="cell">{laterBytes ? formatSize(laterBytes.bytes) : ''}</td><td role="cell" className="ident sha">{sha(laterBytes)}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={onDownload}>Download the comparison</button>
        </div>
        <ol className="specs page-specs with-state compare-specs">
          {c.specs.map((s, i) => (
            <li key={i} className="spec" data-change={s.change}>
              <div className="spec-head static">
                <span className={`state ${BOX[s.change]}`}>{SPEC_CHANGE_WORDS[s.change]}</span>
                <span className="spec-name">{s.name}</span>
                <span className="spec-counts">{s.summary}</span>
              </div>
              {s.elements.length > 0 && (
                <details className="more fails">
                  <summary>Show the {plural(s.elements.length, 'element')} that failed in either delivery, by change and reason</summary>
                  {ELEMENT_CHANGES.map((k) => <ChangeGroup key={k} spec={s} change={k} />)}
                </details>
              )}
            </li>
          ))}
        </ol>
      </>}
    </section>
  );
}
