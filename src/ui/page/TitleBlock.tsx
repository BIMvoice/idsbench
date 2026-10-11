import { Verdict } from '../Verdict';
import { formatSize } from '../../core/format';
import { LARGE_MODEL_BYTES } from '../../core/limits';
import type { Verdict as RunVerdict } from '../../core/types';
import type { Phase } from '../../core/validate';
import type { Page } from './usePage';

const PHASE_TEXT: Record<Phase, string> = {
  'reading-ids': 'Checking the IDS file...',
  'reading-ifc': 'Reading the IFC model. Large models take a while...',
  checking: 'Checking the model against the specifications...',
};
const RUN_WORD: Record<RunVerdict, string> = { pass: 'Pass', fail: 'Fail', incomplete: 'Incomplete' };

/** A short stable mark of a text, so a check can tell which version of the document a result on screen belongs to. */
export function mark(text: string | null): string {
  let h = 5381;
  for (let i = 0; i < (text?.length ?? 0); i++) h = ((h << 5) + h + text!.charCodeAt(i)) | 0;
  return `${text?.length ?? 0}-${(h >>> 0).toString(36)}`;
}

/** A mark of a model file, so a check can tell which model a result on screen was made for. */
export function modelMark(f: File | null): string {
  return f ? `${f.name}:${f.size}:${f.lastModified}` : '';
}

/** The verdict and the record of what it judged. Pass and Fail are about a model; Valid and Not valid are about the IDS file. */
export function TitleBlock({ page, shown }: { page: Page; shown: boolean }) {
  // The live region is on the page from the start, before there is a document, so that what appears in it is announced.
  if (!shown) return <section className="results title-block" aria-label="Result"><div aria-live="polite" className="status" /></section>;
  const { report, check, run, model, name, dirty } = page;
  const idsName = `${name ?? 'Untitled.ids'}${dirty ? ' (with unsaved changes)' : ''}`;
  const of = run ? mark(run.text) : check ? mark(check.text) : '';
  const result = run && 'outcome' in run ? run.outcome.result : null;
  let verdict;
  if (page.blank) {
    verdict = <Verdict state="waiting" word="New">Nothing to check yet. Give the IDS a title and add the first specification.</Verdict>;
  } else if (check && 'failed' in check) {
    verdict = <p className="error">{check.failed}</p>;
  } else if (check && 'view' in check && check.view.kind === 'sentence') {
    verdict = <p className="error">{check.view.text}</p>;
  } else if (!report) {
    verdict = <Verdict state="waiting" word="Checking"><span className="working">{dirty ? 'Checking the IDS file again after your change...' : 'Checking the IDS file...'}</span></Verdict>;
  } else if (!report.valid) {
    verdict = (
      <Verdict state="fail" word="Not valid">
        {report.headline}{model ? ' The model is checked as soon as the file is valid.' : ''}
      </Verdict>
    );
  } else if (result) {
    verdict = <Verdict state={result.verdict} word={RUN_WORD[result.verdict]}>{result.headline}</Verdict>;
  } else if (page.running) {
    verdict = (
      <Verdict state="waiting" word="Checking">
        <span className="working">{PHASE_TEXT[page.phase]}{model && model.size >= LARGE_MODEL_BYTES ? ` This model is ${formatSize(model.size)}; a large model needs several gigabytes of memory.` : ''}</span>
        {page.silent && (
          <span className="stalled" id="stalled" role="alert">
            {' '}The check has not answered for {page.silentSeconds} seconds. It may still be working on a very large model, or the browser may have stopped it.{' '}
            <button type="button" className="btn small" onClick={page.stopAndRetry}>Stop and try again</button>
          </span>
        )}
      </Verdict>
    );
  } else {
    verdict = <Verdict state={report.warnings ? 'incomplete' : 'pass'} word="Valid">{report.headline}</Verdict>;
  }
  return (
    <section className="results title-block" aria-label="Result" data-of={of} data-of-model={run ? modelMark(run.model) : ''} data-kind={result ? 'run' : report ? 'check' : 'waiting'}>
      {/* One live region, present from the start, so a screen reader announces progress, a refusal and the verdict as each appears. */}
      <div aria-live="polite" className="status">{verdict}</div>
      {result ? (
        <dl className="meta record">
          <div><dt>IDS file</dt><dd>{idsName}</dd></div>
          <div><dt>Model</dt><dd>{result.ifcFile}</dd></div>
          <div><dt>IFC version</dt><dd>{result.schema}</dd></div>
          <div><dt>Entities</dt><dd>{result.entityCount.toLocaleString('en')}</dd></div>
          <div><dt>Checked in</dt><dd>{result.seconds.toFixed(1)} s</dd></div>
        </dl>
      ) : (
        <dl className="meta record of-file">
          <div><dt>IDS file</dt><dd>{idsName}</dd></div>
          <div><dt>Model</dt><dd>{model ? model.name : 'none yet'}</dd></div>
          <div><dt>IDS version</dt><dd>{report ? report.version ?? 'none stated' : ''}</dd></div>
          <div><dt>Specifications</dt><dd>{page.doc ? page.doc.specifications.length.toLocaleString('en') : page.lines ? page.lines.specs.length.toLocaleString('en') : ''}</dd></div>
        </dl>
      )}
      {result && report && (
        <p className="meta notice">
          {report.warnings > 0
            ? `The IDS file is valid, with ${report.warnings} ${report.warnings === 1 ? 'thing' : 'things'} to look at, listed with the specifications they concern. It was run as it is.`
            : 'The IDS file was checked first and is valid.'}
        </p>
      )}
      {run && 'error' in run && (
        <div className="model-refusal" role="alert">
          <p className="error">{run.error.message}</p>
          {['unexpected', 'out-of-memory', 'file-unreadable', 'worker-stopped'].includes(run.error.kind) && (
            <p className="refusal-action"><button type="button" className="btn small" onClick={page.runAgain}>Run again</button></p>
          )}
        </div>
      )}
    </section>
  );
}
