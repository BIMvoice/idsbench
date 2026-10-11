import type { RunResult, SpecRow, SpecState } from '../core/types';
import { listed } from '../core/shape';

const STATE_TEXT: Record<SpecState, string> = {
  pass: 'Pass',
  fail: 'Fail',
  nothing: 'Nothing to check',
  unchecked: 'Not checked',
};

function Spec({ spec }: { spec: SpecRow }) {
  const { shown, notShown } = listed(spec.failures);
  const expandable = shown.length > 0;
  const summary = (
    <>
      <span className={`state ${spec.state}`}>{STATE_TEXT[spec.state]}</span>
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
          {/* The roles keep this a table for screen readers on a narrow screen, where each row is laid out as a block. */}
          <table role="table">
            <thead role="rowgroup">
              <tr role="row"><th role="columnheader">IFC class</th><th role="columnheader">Name</th><th role="columnheader">GlobalId</th><th role="columnheader">Why it failed</th></tr>
            </thead>
            <tbody role="rowgroup">
              {shown.map((f, i) => (
                <tr key={i} role="row">
                  <td role="cell">{f.ifcClass}</td>
                  <td role="cell">{f.name ?? '(no name)'}</td>
                  <td role="cell" className="mono">{f.globalId ?? '(none)'}</td>
                  <td role="cell">{f.reasons.length ? f.reasons.join(' ') : '(no reason given)'}</td>
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
      <dl className="meta record">
        <div><dt>IDS file</dt><dd>{result.idsFile}</dd></div>
        <div><dt>Model</dt><dd>{result.ifcFile}</dd></div>
        <div><dt>IFC version</dt><dd>{result.schema}</dd></div>
        <div><dt>Entities</dt><dd>{result.entityCount.toLocaleString('en')}</dd></div>
        <div><dt>Checked in</dt><dd>{result.seconds.toFixed(1)} s</dd></div>
      </dl>
      <ol className="specs" aria-label="Specifications">
        {result.specs.map((s, i) => <Spec key={i} spec={s} />)}
      </ol>
    </section>
  );
}
