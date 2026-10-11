import { useEffect, useRef, useState } from 'react';
import { DropZone } from './DropZone';
import { Results } from './Results';
import { Verdict } from './Verdict';
import { runInWorker, RunCancelled, RunFailed, type Run } from '../runner';
import { reportFileName, reportParts } from '../core/format';
import { UNEXPECTED } from '../core/errors';
import type { RunResult, Verdict as VerdictState } from '../core/types';
import type { Phase } from '../core/validate';

const PHASE_TEXT: Record<Phase, string> = {
  'reading-ids': 'Checking the IDS file...',
  'reading-ifc': 'Reading the IFC model. Large models take a while...',
  checking: 'Checking the model against the specifications...',
};

const VERDICT_WORD: Record<VerdictState, string> = { pass: 'Pass', fail: 'Fail', incomplete: 'Incomplete' };

/** An IDS file handed over from another tab. A new token means a new hand-over, even of a file with the same name. */
export interface Incoming { file: File; token: number }

export function RunTab({ incoming = null, onShowInCheck }: { incoming?: Incoming | null; onShowInCheck: (ids: File) => void }) {
  const [ids, setIds] = useState<File | null>(null);
  const [ifc, setIfc] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // True when the error is "the IDS file has problems": the page then offers to show them in Check.
  const [refused, setRefused] = useState(false);
  const [idsWarnings, setIdsWarnings] = useState(0);
  // The run in progress. A result is only ever shown by the run held here, so
  // a run that was replaced or whose files changed cannot put its result on
  // screen under other file names.
  const current = useRef<Run | null>(null);
  const busy = phase !== null;

  const reset = () => {
    current.current?.cancel();
    current.current = null;
    setPhase(null);
    setResult(null);
    setError(null);
    setRefused(false);
  };
  useEffect(() => () => current.current?.cancel(), []);

  const choose = (set: (f: File | null) => void) => (f: File | null) => {
    reset();
    set(f);
  };

  useEffect(() => {
    if (!incoming) return;
    reset();
    setIds(incoming.file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming?.token]);

  const run = async () => {
    if (!ids || !ifc || current.current) return;
    setError(null);
    setRefused(false);
    setResult(null);
    setPhase('reading-ids');
    // The phase callback can fire before runInWorker returns, so it is tied
    // to a flag, not to the returned run.
    const live = { on: true };
    const started = runInWorker({ ids, ifc }, (p) => { if (live.on) setPhase(p); });
    const mine: Run = { promise: started.promise, cancel: () => { live.on = false; started.cancel(); } };
    current.current = mine;
    try {
      const r = await mine.promise;
      if (current.current === mine) {
        setIdsWarnings(r.idsWarnings);
        setResult(r.result);
      }
    } catch (e) {
      if (e instanceof RunCancelled || current.current !== mine) return;
      console.error(e);
      setError(e instanceof RunFailed ? e.info.message : UNEXPECTED);
      setRefused(e instanceof RunFailed && e.info.kind === 'ids-invalid');
    } finally {
      live.on = false;
      if (current.current === mine) {
        current.current = null;
        setPhase(null);
      }
    }
  };

  const download = () => {
    if (!result) return;
    try {
      const blob = new Blob(reportParts(result), { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = reportFileName(result.ifcFile);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error(e);
      setError('The report is too large for this browser to save. The result on this page is not affected.');
    }
  };

  return (
    <>
      <h2>Run</h2>
      <p className="lead">Choose an IDS file and an IFC model, then run the check.</p>
      <div className="drops">
        <DropZone label="IDS file (.ids)" accept=".ids,.xml" file={ids} onFile={choose(setIds)} />
        <DropZone label="IFC model (.ifc)" accept=".ifc" file={ifc} onFile={choose(setIfc)} />
      </div>
      <div className="actions">
        <button type="button" className="btn primary" disabled={!ids || !ifc || busy} onClick={run}>
          {busy ? 'Working...' : 'Run'}
        </button>
        {result && (
          <button type="button" className="btn" onClick={download}>
            Download report
          </button>
        )}
      </div>
      {/* One live region, present from the start, so a screen reader announces
          progress, an error and the headline as each appears. */}
      <div aria-live="polite" className="status">
        {phase && <p className="working">{PHASE_TEXT[phase]}</p>}
        {error && <p className="error">{error}</p>}
        {error && refused && ids && (
          <p className="refusal-action">
            <button type="button" className="btn" onClick={() => onShowInCheck(ids)}>Show them in Check</button>
          </p>
        )}
        {result && <Verdict state={result.verdict} word={VERDICT_WORD[result.verdict]}>{result.headline}</Verdict>}
      </div>
      {result && (
        <p className="meta">
          {idsWarnings > 0
            ? `The IDS file is valid, with ${idsWarnings} ${idsWarnings === 1 ? 'thing' : 'things'} to look at in the Check tab. It was run as it is.`
            : 'The IDS file was checked first and is valid.'}
        </p>
      )}
      {result && <Results result={result} />}
    </>
  );
}
