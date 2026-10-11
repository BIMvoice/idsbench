import { useState } from 'react';
import type { Finding } from '@idsbench/check';
import { excerpt, whereText } from '../../core/checkview';

/** One finding: what is wrong, where it is in the file that was checked, its short code and, on demand, the lines around it. */
function Row({ finding, xml }: { finding: Finding; xml: string }) {
  const [open, setOpen] = useState(false);
  const where = whereText(finding);
  const shown = open && finding.line ? excerpt(xml, finding.line, finding.column) : null;
  const canOpen = !!finding.line && excerpt(xml, finding.line) !== null;
  const head = (
    <>
      <span className={`sev ${finding.severity}`}>{finding.severity === 'error' ? 'Problem' : 'Warning'}</span>
      <span className="finding-message">{finding.message}</span>
      <span className="finding-meta">
        {where && <span className="finding-where">{where}</span>}
        <code className="finding-code">{finding.code}</code>
      </span>
    </>
  );
  if (!canOpen) return <li className="finding"><div className="finding-head static">{head}</div></li>;
  return (
    <li className="finding">
      <details onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="finding-head">{head}</summary>
        {shown && <pre className="excerpt" tabIndex={0} aria-label={`The file around ${where}`}>{shown.join('\n')}</pre>}
      </details>
    </li>
  );
}

export function Findings({ findings, xml, label }: { findings: Finding[]; xml: string; label: string }) {
  if (findings.length === 0) return null;
  return <ul className="findings attached" aria-label={label}>{findings.map((f, i) => <Row key={i} finding={f} xml={xml} />)}</ul>;
}
