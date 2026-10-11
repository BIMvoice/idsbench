import type { RunResult, SpecRow, SpecState } from '../core/types';
import { listed } from '../core/shape';

const STATE_TEXT: Record<SpecState, string> = {
  pass: 'Pass',
  fail: 'Fail',
  nothing: 'Nothing to check',
  unchecked: 'Not checked',
};
const STATE_MARK: Record<SpecState, string> = { pass: '✓', fail: '✗', nothing: '–', unchecked: '?' };

function Spec({ spec }: { spec: SpecRow }) {
  const { shown, notShown } = listed(spec.failures);
  const expandable = shown.length > 0;
  const summary = (
    <>
      <span className={`state ${spec.state}`}>
        <span aria-hidden="true">{STATE_MARK[spec.state]}</span> {STATE_TEXT[spec.state]}
      </span>
      <span className="spec-name">{spec.name}</span>
      <span className="spec-counts">
        {spec.summary}{expandable ? ' Open to see the elements.' : ''}
      </span>
    </>
  );
  const notes = (
    <>
      {spec.note && <p className="note">{spec.note}</p>}
      {spec.schemaNote && <p className="note schema-note">{spec.schemaNote}</p>}
    </>
  );

  if (!expandable) {
    return <li className="spec"><div className="spec-head static">{summary}</div>{notes}</li>;
  }
  return (
    <li className="spec">
      <details>
        <summary className="spec-head">{summary}</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>IFC class</th><th>Name</th><th>GlobalId</th><th>Why it failed</th></tr>
            </thead>
            <tbody>
              {shown.map((f, i) => (
                <tr key={i}>
                  <td>{f.ifcClass}</td>
                  <td>{f.name ?? '(no name)'}</td>
                  <td className="mono">{f.globalId ?? '(none)'}</td>
                  <td>{f.reasons.length ? f.reasons.join(' ') : '(no reason given)'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {notShown > 0 && (
          <p className="note">
            The first {shown.length} failing elements are listed here. {notShown.toLocaleString('en')} more {notShown === 1 ? 'is' : 'are'} not shown on this page. The downloaded report lists all {spec.failures.length.toLocaleString('en')}.
          </p>
        )}
      </details>
      {notes}
    </li>
  );
}

export function Results({ result }: { result: RunResult }) {
  return (
    <section className="results" aria-label="Result">
      <p className="meta">
        IDS file: {result.idsFile}. Model: {result.ifcFile}, {result.schema}, {result.entityCount.toLocaleString('en')} entities. Checked in {result.seconds.toFixed(1)} s.
      </p>
      <ul className="specs">
        {result.specs.map((s, i) => <Spec key={i} spec={s} />)}
      </ul>
    </section>
  );
}
