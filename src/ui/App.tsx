import { useEffect, useMemo, useRef, useState } from 'react';
import { afterRun, failureCount, failuresCsvName, failuresCsvParts } from '../core/csv';
import { newSpecification, type Specification } from '../core/ids/model';
import { PATTERNS } from '../core/ids/patterns';
import { pageReportName, pageReportParts, sha256Of } from '../core/report';
import { alignResults, NOT_ALIGNED } from '../core/align';
import { ROW_CAP } from '../core/checkview';
import { About } from './page/About';
import { saveFile } from './page/draft';
import { FileBar } from './page/FileBar';
import { Findings } from './page/Findings';
import { SpecRow } from './page/SpecRow';
import { mark, modelMark, TitleBlock } from './page/TitleBlock';
import { ToFix } from './page/ToFix';
import { usePage } from './page/usePage';

/** One page around one document: the IDS file. It is checked when it arrives, run when a model is there, and edited in place. */
export function App() {
  const page = usePage();
  const { doc, report, run, model } = page;
  const [over, setOver] = useState(false);
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const result = run && 'outcome' in run ? run.outcome.result : null;
  const failing = result ? failureCount(result) : 0;
  // A result row is shown beside a specification only when the result is of exactly these specifications, in this order.
  const rows = useMemo(() => (result && doc ? alignResults(doc.specifications, result) : null), [result, doc]);

  // ---- files dropped anywhere on the page ----
  const depth = useRef(0);
  const addFiles = page.addFiles;
  const addRef = useRef(addFiles);
  addRef.current = addFiles;
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const enter = (e: DragEvent) => { if (hasFiles(e)) { e.preventDefault(); depth.current++; setOver(true); } };
    const overIt = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const leave = (e: DragEvent) => { if (hasFiles(e)) { depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setOver(false); } };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      // A folder arrives as an entry that is a directory; its "file" cannot be read, so it is named and left out.
      const folders: string[] = [], files: File[] = [];
      for (const item of [...(e.dataTransfer?.items ?? [])]) {
        if (item.kind !== 'file') continue;
        const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
        const file = item.getAsFile();
        if (entry?.isDirectory) folders.push(entry.name);
        else if (file) files.push(file);
      }
      void addRef.current(files.length || folders.length ? files : [...(e.dataTransfer?.files ?? [])], undefined, folders);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', overIt);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', overIt);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  // ---- downloads ----
  const guarded = (what: string, fn: () => void) => {
    try { setProblem(null); fn(); } catch (e) {
      console.error(e);
      setProblem(`${what} is too large for this browser to save. The result on this page is not affected.`);
    }
  };
  const downloadIds = async () => {
    const saved = await page.save();
    if (saved) saveFile(saved.parts, saved.name, 'application/xml');
  };
  const downloadReport = async () => {
    const idsName = page.name, blob = page.idsBlob();
    if (!report || !idsName || !blob) return;
    // The report names the exact bytes it is about. They are read now; the result on the page was made from the same text and model.
    const edited = !page.asOpened && page.dirty;
    const ids = { name: idsName, bytes: blob.size, sha256: await sha256Of(blob) };
    const ran = result && model ? { name: model.name, bytes: model.size, sha256: await sha256Of(model) } : null;
    guarded('The report', () => saveFile(pageReportParts(idsName, edited, report, result, ids, ran), pageReportName(idsName, result), 'application/json'));
  };
  const downloadCsv = () => {
    if (result) guarded('The list', () => saveFile(failuresCsvParts(result), failuresCsvName(result.ifcFile), 'text/csv;charset=utf-8'));
  };

  // ---- the document ----
  const setSpec = (s: Specification) => page.edit((d) => ({ ...d, specifications: d.specifications.map((x) => (x.uid === s.uid ? s : x)) }));
  const addSpec = (s: Specification) => {
    page.change(`Added "${s.name || 'a specification'}"`, (d) => ({ ...d, specifications: [...d.specifications, s] }));
    setAdding(false);
    page.setEditing(s.uid);
  };
  // goTo reads the document as it was when this render ran; a specification that was just added is focused here instead.
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => { if (adding) menu.current?.querySelector<HTMLElement>('button')?.focus(); }, [adding]);
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingFocus.current) return;
    document.querySelector<HTMLElement>(`#body-${pendingFocus.current} input[type=text]`)?.focus();
    pendingFocus.current = null;
  });

  const errorRows = doc && page.placed ? doc.specifications.findIndex((_, i) => (page.placed!.specs.get(i) ?? []).some((f) => f.severity === 'error')) : -1;
  // One primary action at a time.
  const primary = !doc && !page.source ? 'open'
    : page.dirty ? 'download'
    : doc && doc.specifications.length === 0 ? 'add'
    : report && !report.valid ? (errorRows >= 0 ? `edit-${errorRows}` : 'open')
    : !model ? 'model'
    : result ? (failing > 0 ? 'csv' : 'report') : '';
  const next = !doc && !page.source ? 'Open an IDS file, or drop an IDS file and an IFC model anywhere on this page. No files at hand? Try the example.'
    : page.blank ? 'Give the IDS a title under "About this IDS", then add the first specification.'
    : page.editing ? 'Your changes are checked as you make them. Press Done when the specification reads as you mean it.'
    : page.checking ? null
    : report && !report.valid ? (doc ? `Work through the list below: "Fix" opens the place concerned.${model ? ' The model is checked as soon as the file is valid.' : ''}` : 'This file has to be corrected in the tool that made it.')
    : page.dirty ? 'Download .ids to keep your changes.'
    : !model ? 'The IDS file is valid. Add an IFC model to check it against the file, or edit a specification.'
    : result ? afterRun(result)
    : null;
  const hasPage = doc !== null || page.source !== null;
  const listed = report ? report.findings.slice(0, ROW_CAP) : [];
  const shownFindings = (list: import('@idsbench/check').Finding[] | undefined) => (list ?? []).filter((f) => listed.includes(f));
  const waiting = !model ? null : report && !report.valid ? 'Waiting' : result ? null : run && 'error' in run ? null : 'Checking';

  return (
    <div className="page" data-doc={mark(page.text)} data-model={modelMark(model)}>
      <header className="top">
        <h1 className="brand">idsbench</h1>
        <p className="top-note">Checks IDS 1.0 files, and IFC models against them.</p>
      </header>

      <main>
        {!hasPage && <>
          <h2>Check an IDS file, and a model against it</h2>
          <p className="lead">Open an IDS file to see whether it is valid. Add an IFC model to see whether the model meets it. Change the file here when something needs to change.</p>
        </>}
        <FileBar page={page} primary={primary} onDownloadIds={() => void downloadIds()} />
        {page.refusal && (
          <div role="alert" className="file-refusal">
            <p className="error">{page.refusal.name} was not opened. {page.refusal.text}</p>
            <p className="refusal-action"><button type="button" className="btn small" onClick={page.clearRefusal}>Dismiss</button></p>
          </div>
        )}
        {page.saveProblem && <p className="error" role="alert">{page.saveProblem}</p>}
        {page.notice && (
          <p className="notice-box" role="status" id="page-notice">
            {page.notice} <button type="button" className="btn small" onClick={page.clearNotice}>Dismiss</button>
          </p>
        )}
        {problem && <p className="error" role="alert">{problem}</p>}
        {result && doc && !rows && <p className="error" role="alert" id="not-aligned">{NOT_ALIGNED}</p>}
        {next && <p className="next" id="next-step">{next}</p>}

        {hasPage && <h2 className="doc-title">{doc ? doc.info.title || 'Untitled IDS' : page.name}</h2>}
        <TitleBlock page={page} shown={hasPage} />
        {hasPage && <>
          {(report || result) && (
            <div className="actions">
              {result && failing > 0 && <button type="button" className={primary === 'csv' ? 'btn primary' : 'btn'} onClick={downloadCsv}>Download failing elements</button>}
              {report && <button type="button" className={primary === 'report' ? 'btn primary' : 'btn'} onClick={() => void downloadReport()}>Download report</button>}
            </div>
          )}
          {page.undo && (
            <p className="notice-box undo" role="status">
              {page.undo.label}. <button type="button" className="btn small" onClick={page.undoLast}>Undo</button>
            </p>
          )}
          <ToFix page={page} />
          {report && page.text !== null && <Findings findings={shownFindings(page.placed?.file)} xml={page.text} label="What was found in the file as a whole" />}
          {report && report.findings.length > ROW_CAP && (
            <p className="note-plain">The first {ROW_CAP} of {report.findings.length.toLocaleString('en')} are listed on this page. The downloaded report lists all of them.</p>
          )}
        </>}

        {doc && <>
          <About
            doc={doc} issues={page.issues} xml={page.text ?? ''}
            findings={report ? shownFindings(page.placed?.info) : []}
            editing={page.editing === 'about'} focusKey={page.editing === 'about' ? page.focusKey : null}
            onEdit={(open) => page.setEditing(open ? 'about' : null)}
            onChange={(k, v) => page.edit((d) => ({ ...d, info: { ...d.info, [k]: v } }))}
          />
          <section aria-labelledby="specs-title" className="spec-section">
            <h3 id="specs-title">Specifications</h3>
            {doc.specifications.length === 0 && <p className="empty">No specifications yet. Add the first one to say what the model must contain.</p>}
            <ol className={`specs page-specs${model ? ' with-state' : ''}`} data-of={result && run ? mark(run.text) : ''} data-of-model={result && run ? modelMark(run.model) : ''}>
              {doc.specifications.map((s, i) => (
                <SpecRow
                  key={s.uid} spec={s} index={i} count={doc.specifications.length}
                  result={rows ? rows[i] : null}
                  waiting={waiting}
                  findings={report && page.text !== null ? shownFindings(page.placed?.specs.get(i)) : []}
                  xml={page.text ?? ''}
                  issues={page.issues}
                  editing={page.editing === s.uid}
                  primary={primary === `edit-${i}`}
                  focusKey={page.editing === s.uid ? page.focusKey : null}
                  onEdit={(open) => page.setEditing(open ? s.uid : null)}
                  onChange={setSpec}
                  onMove={(d) => page.change(`Moved "${s.name}" ${d < 0 ? 'up' : 'down'}`, (x) => {
                    const list = [...x.specifications];
                    [list[i], list[i + d]] = [list[i + d], list[i]];
                    return { ...x, specifications: list };
                  })}
                  onDelete={() => { page.change(`Deleted "${s.name || 'Untitled specification'}"`, (x) => ({ ...x, specifications: x.specifications.filter((y) => y.uid !== s.uid) })); page.setEditing(null); }}
                />
              ))}
            </ol>
            {adding ? (
              <div ref={menu} className="add-menu patterns" role="group" aria-label="Start a specification from">
                <p className="hint">Start from the shape closest to what you need, then change the choices.</p>
                <ul>
                  {PATTERNS.map((p) => (
                    <li key={p.id}>
                      <button type="button" className="btn small" onClick={() => { const s = p.make(); pendingFocus.current = s.uid; addSpec(s); }}>{p.label}</button>
                      <span className="hint">{p.about}</span>
                    </li>
                  ))}
                  <li>
                    <button type="button" className="btn small" onClick={() => { const s = newSpecification(); pendingFocus.current = s.uid; addSpec(s); }}>An empty specification</button>
                    <span className="hint">Fill in everything yourself.</span>
                  </li>
                </ul>
                <button type="button" className="btn small" onClick={() => setAdding(false)}>Cancel</button>
              </div>
            ) : (
              <button type="button" className={primary === 'add' ? 'btn primary' : 'btn'} onClick={() => setAdding(true)}>Add a specification</button>
            )}
          </section>
        </>}
        {!doc && page.source && page.lines && report && [...(page.placed?.specs ?? [])].map(([i, list]) => (
          <section key={i} className="spec-section" aria-label={`Specification ${i + 1}`}>
            <h4>Specification {i + 1}{page.lines!.specs[i]?.name ? `: ${page.lines!.specs[i].name}` : ''}</h4>
            <Findings findings={shownFindings(list)} xml={page.text ?? ''} label={`What was found in specification ${i + 1}`} />
          </section>
        ))}
        {!doc && page.source && report && (page.placed?.info.length ?? 0) > 0 && (
          <section className="spec-section" aria-label="About this IDS">
            <h4>About this IDS</h4>
            <Findings findings={shownFindings(page.placed?.info)} xml={page.text ?? ''} label="What was found in About this IDS" />
          </section>
        )}
      </main>

      <footer className="foot">Runs in your browser. Your files are not uploaded. Unsaved changes stay in this browser tab until you close it.</footer>
      {over && <div className="drop-overlay" role="status"><p>Drop an IDS file, an IFC model, or both.</p></div>}
    </div>
  );
}
