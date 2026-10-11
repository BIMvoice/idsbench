import type { RunResult, SpecRow, SpecState } from '../core/types';
import { plural } from '../core/shape';

const STATE_TEXT: Record<SpecState, string> = {
  pass: 'Pass',
  fail: 'Fail',
  nothing: 'Applied to nothing',
};
const STATE_MARK: Record<SpecState, string> = { pass: '✓', fail: '✗', nothing: '–' };

function Spec({ spec }: { spec: SpecRow }) {
  const expandable = spec.failures.length > 0 || !!spec.note;
  const summary = (
    <>
      <span className={`state ${spec.state}`}>
        <span aria-hidden="true">{STATE_MARK[spec.state]}</span> {STATE_TEXT[spec.state]}
      </span>
      <span className="spec-name">{spec.name}</span>
      <span className="spec-counts">
        applied to {plural(spec.applicable, 'element')}, {spec.passed} passed, {spec.failed} failed{expandable ? '. Open for details.' : ''}
      </span>
    </>
  );

  if (spec.failures.length === 0 && !spec.note) {
    return <li className="spec"><div className="spec-head static">{summary}</div></li>;
  }
  return (
    <li className="spec">
      <details>
        <summary className="spec-head">{summary}</summary>
        {spec.note && <p className="note">{spec.note}</p>}
        {spec.failures.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>IFC class</th><th>Name</th><th>GlobalId</th><th>Why it failed</th></tr>
              </thead>
              <tbody>
                {spec.failures.map((f, i) => (
                  <tr key={i}>
                    <td>{f.ifcClass}</td>
                    <td>{f.name ?? '(no name)'}</td>
                    <td className="mono">{f.globalId ?? '(none)'}</td>
                    <td>{f.reasons.length ? f.reasons.join(' ') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {spec.failuresNotShown > 0 && (
          <p className="note">
            And {spec.failuresNotShown} more failing {spec.failuresNotShown === 1 ? 'element' : 'elements'} not shown. The first {spec.failures.length} are listed.
          </p>
        )}
      </details>
    </li>
  );
}

export function Results({ result }: { result: RunResult }) {
  return (
    <section className="results" aria-label="Result">
      <p className={`headline ${result.allPassed ? 'pass' : 'fail'}`} tabIndex={-1}>
        {result.headline}
      </p>
      <p className="meta">
        {result.ifcFile}, {result.schema}, {result.entityCount.toLocaleString()} entities. Checked in {result.seconds.toFixed(1)} s.
      </p>
      <ul className="specs">
        {result.specs.map((s, i) => <Spec key={i} spec={s} />)}
      </ul>
    </section>
  );
}
