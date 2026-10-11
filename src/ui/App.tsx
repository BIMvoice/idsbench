import { useEffect, useMemo, useRef, useState } from 'react';
import { afterRun, failureCount, failuresCsvName, failuresCsvParts, wholeFailureCount } from '../core/csv';
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
import { addSubtypes, familyOf, subtypeNote, withDefaultSubtypes } from '../core/subtypes';
import { syncName } from '../core/ids/naming';
import type { WordsOptions } from '../core/ids/words';
import { classNameIn, loadSchemas, useSchemaMap, versionsFor } from './write/useSchema';

/** One page around one document: the IDS file. It is checked when it arrives, run when a model is there, and edited in place. */
export function App() {
  const page = usePage();
  const { doc, report, run, model } = page;
  const [over, setOver] = useState(false);
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [downloadNote, setDownloadNote] = useState<string | null>(null);
  const result = run && 'outcome' in run ? run.outcome.result : null;
  const failing = result ? failureCount(result) : 0;
  const wholeFailed = result ? wholeFailureCount(result) : 0;
  // A result row is shown beside a specification only when the result is of exactly these specifications, in this order.
  const rows = useMemo(() => (result && doc ? alignResults(doc.specifications, result) : null), [result, doc]);

  // ---- the classes a specification names leave their subtypes out: IDS matches the exact class ----
  const schemaMap = useSchemaMap(doc ? doc.specifications.flatMap((s) => versionsFor(s.ifcVersion)) : []);
  const tablesOf = (s: Specification) => {
    const have = versionsFor(s.ifcVersion).map((v) => schemaMap[v]);
    return have.every(Boolean) ? (have as NonNullable<(typeof have)[number]>[]) : null;
  };
  const subtypesOf = (s: Specification) => {
    const have = tablesOf(s);
    return have ? subtypeNote(s, have) : null;
  };
  /** What a sentence needs from the IFC tables: the plain name of a class, and whether the classes it lists are one class and its subtypes. */
  const wordsOf = (s: Specification): WordsOptions => {
    const have = tablesOf(s);
    return { className: classNameIn(have ?? Object.values(schemaMap)), family: have ? familyOf(s, have) : null };
  };
  /** A specification the page makes: it applies to the class and its subtypes in every version ticked, and its name is worked out from what it says. */
  const startSpec = async (made: Specification) => {
    let s = made;
    try {
      const tables = await loadSchemas(versionsFor(made.ifcVersion));
      s = syncName(withDefaultSubtypes(made, tables), { className: classNameIn(tables) });
    } catch (e) { console.error(e); }
    pendingFocus.current = s.uid;
    addSpec(s);
  };

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
  // A browser drops a download that starts within about a tenth of a second of the one before it (Chromium does; and it
  // may ask or refuse after many in a row). So the downloads of this page go one at a time, at least SPACING_MS apart:
  // a press while the last file is still being handed over waits its turn and then gives its file. Only a pile of more
  // than MAX_WAITING presses is answered with a sentence instead, and many files in a short time are followed by a
  // sentence about what the browser may do.
  const lastStart = useRef(0);
  const queued = useRef(0);
  const lane = useRef<Promise<void>>(Promise.resolve());
  const recent = useRef<number[]>([]);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = (text: string | null) => {
    setDownloadNote(text);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    if (text) noteTimer.current = setTimeout(() => setDownloadNote(null), 8000);
  };
  const rejectedUntil = useRef(0);
  const SPACING_MS = 150, MAX_WAITING = 12, MANY = 8;
  const download = (what: string, job: () => Promise<string | null>) => {
    if (queued.current >= MAX_WAITING) { rejectedUntil.current = Date.now() + 8000; say(`${what} was not started again: ${MAX_WAITING} files are already waiting to be saved. Press it again in a moment.`); return lane.current; }
    queued.current++;
    lane.current = lane.current.then(async () => {
      try {
        const wait = lastStart.current + SPACING_MS - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        lastStart.current = Date.now();
        const name = await job();
        if (name === null) return;
        const now = Date.now();
        recent.current = [...recent.current.filter((t) => now - t < 60_000), now];
        // The sentence for a press that found the queue full is not taken away by the one about many files.
        if (recent.current.length >= MANY && Date.now() > rejectedUntil.current) {
          say(`Download started: ${name}. That is ${recent.current.length} files in the last minute. A browser may ask before it saves more files from one page, or refuse without a word: if no file appears, allow downloads for this site (look in the address bar), then press again.`);
        }
      } finally {
        queued.current--;
      }
    });
    return lane.current;
  };
  // A press waits its turn, and the page can change while it waits (an edit, another model, a new result). A file is
  // only ever of what is on the page: a press whose turn comes after such a change gives a sentence, not a file of what was there.
  // (A result is told by the text, the model and the run it was made for, not by the object that holds it: the page may make the same result again.)
  const shown = { ranText: result ? run?.text : null, ranModel: result ? run?.model : null, ranNonce: result ? run?.nonce : null, text: page.text, xml: page.xml };
  const onPage = useRef(shown);
  onPage.current = shown;
  const outdated = (what: string, was: Partial<typeof shown>) => {
    const now = onPage.current;
    if ((Object.keys(was) as (keyof typeof shown)[]).every((k) => now[k] === was[k])) return false;
    rejectedUntil.current = Date.now() + 8000;
    say(`${what} was not saved: the page changed while the file was waiting its turn. Press it again for the file of what is on the page now.`);
    return true;
  };
  const guarded = (what: string, fn: () => string) => {
    try { setProblem(null); return fn(); } catch (e) {
      console.error(e);
      setProblem(`${what} is too large for this browser to save. The result on this page is not affected.`);
      return null;
    }
  };
  const downloadIds = () => download('The IDS file', async () => {
    if (outdated('The IDS file', { xml: page.xml })) return null;
    const saved = await page.save();
    if (!saved) return null;
    saveFile(saved.parts, saved.name, 'application/xml');
    return saved.name;
  });
  const downloadReport = () => download('The report', async () => {
    const idsName = page.name, blob = page.idsBlob();
    if (!report || !idsName || !blob) return null;
    if (outdated('The report', { ranText: shown.ranText, ranModel: shown.ranModel, ranNonce: shown.ranNonce, text: page.text })) return null;
    // The report names the exact bytes it is about. They are read now; the result on the page was made from the same text and model.
    const edited = !page.asOpened && page.dirty;
    const ids = { name: idsName, bytes: blob.size, sha256: await sha256Of(blob) };
    // The model is named by the bytes the worker parsed, hashed there and then: the file on disk may have changed since.
    const ran = result && run && 'outcome' in run ? { name: result.ifcFile, ...run.outcome.model } : null;
    return guarded('The report', () => { const name = pageReportName(idsName, result); saveFile(pageReportParts(idsName, edited, report, result, ids, ran, edited ? page.leftOut : []), name, 'application/json'); return name; });
  });
  const downloadCsv = () => download('The list', async () => {
    if (!result || outdated('The list', { ranText: shown.ranText, ranModel: shown.ranModel, ranNonce: shown.ranNonce })) return null;
    return guarded('The list', () => { const name = failuresCsvName(result.ifcFile); saveFile(failuresCsvParts(result), name, 'text/csv;charset=utf-8'); return name; });
  });

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
    : result ? (failing + wholeFailed > 0 ? 'csv' : 'report') : '';
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
        {downloadNote && <p className="notice-box" role="status" id="download-note">{downloadNote}</p>}
        {result && doc && !rows && <p className="error" role="alert" id="not-aligned">{NOT_ALIGNED}</p>}
        {next && <p className="next" id="next-step">{next}</p>}

        {hasPage && <h2 className="doc-title">{doc ? doc.info.title || 'Untitled IDS' : page.name}</h2>}
        <TitleBlock page={page} shown={hasPage} />
        {hasPage && <>
          {(report || result) && (
            <div className="actions">
              {result && failing + wholeFailed > 0 && <button type="button" className={primary === 'csv' ? 'btn primary' : 'btn'} onClick={() => void downloadCsv()}>Download failing elements</button>}
              {report && <button type="button" className={primary === 'report' ? 'btn primary' : 'btn'} onClick={() => void downloadReport()}>Download report</button>}
            </div>
          )}
          {page.undo && (
            <p className="notice-box undo" role="status">
              {page.undo.label}. <button type="button" className="btn small" onClick={page.undoLast}>Undo</button>
            </p>
          )}
          <ToFix page={page} />
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
                  subtypes={subtypesOf(s)}
                  words={wordsOf(s)}
                  onAddSubtypes={() => { const note = subtypesOf(s); if (note && note.subtypes.length) page.change(`Applied "${s.name || 'the specification'}" also to ${note.subtypes.length === 1 ? note.subtypes[0].name : `${note.subtypes.length} subtypes`}`, (d) => ({ ...d, specifications: d.specifications.map((x) => (x.uid === s.uid ? addSubtypes(x, note) : x)) })); }}
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
                      <button type="button" className="btn small" onClick={() => { void startSpec(p.make()); }}>{p.label}</button>
                      <span className="hint">{p.about}</span>
                    </li>
                  ))}
                  <li>
                    <button type="button" className="btn small" onClick={() => { void startSpec({ ...newSpecification(), autoName: true }); }}>An empty specification</button>
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
