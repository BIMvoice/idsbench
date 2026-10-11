import { useEffect, useState } from 'react';
import type { Finding } from '@idsbench/check';
import { DropZone } from './DropZone';
import {
  checkText, excerpt, NOT_UPLOADED, readForCheck, reportFileName, reportJson, ROW_CAP, whereText, type CheckView,
} from '../core/checkview';
import { UNEXPECTED } from '../core/errors';

/** A finished check, kept with the file it belongs to so it can never be shown under another file. */
type Done = { file: File; xml: string; view: CheckView } | { file: File; failed: string };

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
        {shown && (
          <pre className="excerpt" tabIndex={0} aria-label={`The file around ${where}`}>{shown.join('\n')}</pre>
        )}
      </details>
    </li>
  );
}

export function CheckTab({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const [done, setDone] = useState<Done | null>(null);

  useEffect(() => {
    if (!file) return;
    // The result below is only ever shown for the file it was made for, and a
    // check that was overtaken by another file is dropped when it finishes.
    let live = true;
    void (async () => {
      try {
        const read = await readForCheck(file);
        if (!live) return;
        if ('sentence' in read) { setDone({ file, xml: '', view: { kind: 'sentence', text: read.sentence } }); return; }
        const view = await checkText(read.text);
        if (live) setDone({ file, xml: read.text, view });
      } catch (e) {
        console.error(e);
        if (live) setDone({ file, failed: UNEXPECTED });
      }
    })();
    return () => { live = false; };
  }, [file]);

  const current = done && done.file === file ? done : null;
  const checking = !!file && !current;
  const view = current && 'view' in current ? current.view : null;
  const report = view?.kind === 'report' ? view : null;

  const download = () => {
    if (!file || !report) return;
    const url = URL.createObjectURL(new Blob([reportJson(file.name, report)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = reportFileName(file.name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const listed = report ? report.findings.slice(0, ROW_CAP) : [];
  return (
    <>
      <h2>Check</h2>
      <p className="lead">Choose an IDS file to see whether it is valid.</p>
      <div className="drops single">
        <DropZone label="IDS file (.ids)" accept=".ids,.xml" file={file} onFile={onFile} />
      </div>
      <div className="status" aria-live="polite">
        {checking && <p className="working">Checking the IDS file...</p>}
        {current && 'failed' in current && <p className="error">{current.failed}</p>}
        {view?.kind === 'sentence' && <p className="error">{view.text}</p>}
        {report && (
          <p className={`headline ${report.valid ? (report.warnings ? 'incomplete' : 'pass') : 'fail'}`}>{report.headline}</p>
        )}
      </div>
      {report && current && 'xml' in current && (
        <section className="results" aria-label="Result">
          <p className="meta">
            {report.version ? `IDS version found: ${report.version}.` : 'IDS version found: none stated.'}
          </p>
          {report.findings.length > 0 && (
            <ul className="findings">
              {listed.map((f, i) => <Row key={i} finding={f} xml={current.xml} />)}
            </ul>
          )}
          {report.findings.length > ROW_CAP && (
            <p className="note">
              The first {ROW_CAP} of {report.findings.length.toLocaleString('en')} are listed here. The downloaded report lists all of them.
            </p>
          )}
          <div className="actions">
            <button type="button" className="btn" onClick={download}>Download report</button>
          </div>
        </section>
      )}
      <p className="meta privacy">{NOT_UPLOADED}</p>
    </>
  );
}
