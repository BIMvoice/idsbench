import { useState } from 'react';
import { DropZone } from './DropZone';
import { Results } from './Results';
import { runInWorker, RunFailed } from '../runner';
import { reportFileName } from '../core/format';
import type { RunResult } from '../core/types';
import type { Phase } from '../core/validate';

const PHASE_TEXT: Record<Phase, string> = {
  'reading-ids': 'Reading the IDS file...',
  'reading-ifc': 'Reading the IFC model. Large models take a while...',
  checking: 'Checking the model against the specifications...',
};

export function RunTab() {
  const [ids, setIds] = useState<File | null>(null);
  const [ifc, setIfc] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = phase !== null;

  const run = async () => {
    if (!ids || !ifc) return;
    setError(null);
    setResult(null);
    setPhase('reading-ids');
    try {
      setResult(await runInWorker({ ids, ifc }, setPhase));
    } catch (e) {
      console.error(e);
      setError(e instanceof RunFailed ? e.info.message : 'Something went wrong while checking. The details are in the browser console.');
    } finally {
      setPhase(null);
    }
  };

  const download = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = reportFileName(result.ifcFile);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <h2>Run</h2>
      <p className="lead">Choose an IDS file and an IFC model, then run the check.</p>
      <div className="drops">
        <DropZone label="IDS file (.ids)" accept=".ids,.xml" file={ids} onFile={setIds} />
        <DropZone label="IFC model (.ifc)" accept=".ifc" file={ifc} onFile={setIfc} />
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
      <div aria-live="polite" className="status">
        {phase && <p className="working">{PHASE_TEXT[phase]}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      {result && <Results result={result} />}
    </>
  );
}
