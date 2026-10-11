// The one state of the page: the IDS document, the model, the check of the document and the run against the model.
//
// Two rules hold everywhere and are enforced here, not in the components:
//  1. A result is stored with the exact text (and model) it was made for, and is only handed out while that is still
//     the current text (and model). A result of an older version of the document therefore cannot be shown, even for
//     one frame, because showing it is decided at render time by comparing the two, not by clearing state in time.
//  2. A file that was opened and not changed is checked and run as it is: `text` is then the file's own text and the
//     run reads the very File that was opened. Only once the document differs from the opened file is it written out
//     again, and that written text is what is checked and run.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Finding } from '@idsbench/check';
import { checkText, readForCheck, type CheckView } from '../../core/checkview';
import { AppError, UNEXPECTED } from '../../core/errors';
import { EXAMPLE_IDS, EXAMPLE_IDS_NAME, EXAMPLE_IFC, EXAMPLE_IFC_NAME } from '../../core/example';
import { checkDocument, type Issue } from '../../core/ids/check';
import { blankDocument, type IdsDocument } from '../../core/ids/model';
import { readIdsText } from '../../core/ids/read';
import { writeIds } from '../../core/ids/write';
import { outline, placeFindings, targetOf, type Outline, type Placed, type Target } from '../../core/place';
import { kindOfFile, type FileKind } from '../../core/sniff';
import type { AppErrorInfo } from '../../core/types';
import type { Phase } from '../../core/validate';
import { runInWorker, RunCancelled, RunFailed, type RunOutcome } from '../../runner';
import { loadDraft, saveDraft } from './draft';

/** How long the page waits after the last change to the document before it checks and runs it again. */
export const SETTLE_MS = 400;

const BLANK_XML = writeIds(blankDocument());
const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export interface Source { name: string; size: number; text: string; file: File; example: boolean }
type Checked = { text: string; view: CheckView } | { text: string; failed: string };
type Ran = { text: string; model: File; nonce: number } & ({ outcome: RunOutcome } | { error: AppErrorInfo });
export type Report = Extract<CheckView, { kind: 'report' }>;
export interface Undo { doc: IdsDocument; label: string }

export function usePage() {
  const [restored] = useState(loadDraft);
  const [doc, setDoc] = useState<IdsDocument | null>(() => restored?.doc ?? null);
  const [source, setSource] = useState<Source | null>(null);
  /** Why the opened file cannot be shown in the forms, when it cannot. */
  const [unreadable, setUnreadable] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(() => restored?.fileName ?? null);
  const [savedXml, setSavedXml] = useState<string>(() => restored?.savedXml ?? BLANK_XML);
  const [model, setModel] = useState<File | null>(null);
  /** A file that was not taken, and why. It never replaces what is on the page. */
  const [refusal, setRefusal] = useState<{ name: string; text: string } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [ran, setRan] = useState<Ran | null>(null);
  const [phase, setPhase] = useState<Phase>('reading-ids');
  const [nonce, setNonce] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<{ key: string; n: number } | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [saveProblem, setSaveProblem] = useState<string | null>(null);

  const xml = useMemo(() => (doc ? writeIds(doc) : null), [doc]);
  const dirty = xml !== null && xml !== savedXml;
  /** True while the page shows a file exactly as it was opened. */
  const asOpened = source !== null && (xml === null || xml === savedXml);
  const text = asOpened ? source.text : xml;
  const blank = doc !== null && source === null && xml === BLANK_XML;
  const name = fileName ?? source?.name ?? (doc ? `${slug(doc.info.title) || 'untitled'}.ids` : null);

  // ---- settle: an edit is checked after a short pause; opening a file or applying a fix is checked at once ----
  const [settled, setSettled] = useState<string | null>(text);
  const atOnce = useRef(true);
  useEffect(() => {
    if (text === settled) return;
    if (atOnce.current) { setSettled(text); return; }
    const t = setTimeout(() => setSettled(text), SETTLE_MS);
    return () => clearTimeout(t);
  }, [text, settled]);

  // ---- the check of the current text ----
  const checkedRef = useRef(checked);
  checkedRef.current = checked;
  useEffect(() => {
    if (settled === null || checkedRef.current?.text === settled) return;
    let live = true;
    checkText(settled).then(
      (view) => { if (live) setChecked({ text: settled, view }); },
      (e) => { console.error(e); if (live) setChecked({ text: settled, failed: UNEXPECTED }); },
    );
    return () => { live = false; };
  }, [settled]);
  const check = checked !== null && checked.text === text ? checked : null;
  const report: Report | null = check && 'view' in check && check.view.kind === 'report' ? check.view : null;
  const valid = report?.valid === true;

  // ---- the run: starts by itself when the current text is valid and a model is there; stops when either changes ----
  const idsFile = useMemo(
    () => (text === null ? null : asOpened && source ? source.file : new File([text], name ?? 'untitled.ids', { type: 'application/xml' })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, asOpened, source],
  );
  const runnable = valid && model !== null && text !== null && text === settled && !blank;
  useEffect(() => {
    if (!runnable || !idsFile || !model || text === null) return;
    const live = { on: true };
    setPhase('reading-ids');
    const run = runInWorker({ ids: idsFile, ifc: model }, (p) => { if (live.on) setPhase(p); });
    run.promise.then(
      (outcome) => { if (live.on) setRan({ text, model, nonce, outcome }); },
      (e) => {
        if (!live.on || e instanceof RunCancelled) return;
        console.error(e);
        setRan({ text, model, nonce, error: e instanceof RunFailed ? e.info : { kind: 'unexpected', message: UNEXPECTED } });
      },
    );
    return () => { live.on = false; run.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runnable, idsFile, model, nonce]);
  const run = ran !== null && ran.text === text && ran.model === model && ran.nonce === nonce && runnable ? ran : null;
  const running = runnable && run === null;

  // ---- the draft and the leave prompt ----
  useEffect(() => {
    const t = setTimeout(() => saveDraft(dirty && doc ? { doc, fileName, savedXml } : null), 250);
    return () => clearTimeout(t);
  }, [dirty, doc, fileName, savedXml]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // ---- findings and where they belong ----
  const lines: Outline | null = useMemo(() => (report && text !== null ? outline(text) : null), [report, text]);
  const placed: Placed | null = useMemo(() => (report && lines ? placeFindings(report.findings, lines) : null), [report, lines]);
  const targets: Map<Finding, Target> = useMemo(() => {
    const m = new Map<Finding, Target>();
    if (report && lines) for (const f of report.findings) m.set(f, doc ? targetOf(f, doc, lines) : { kind: 'file' });
    return m;
  }, [report, lines, doc]);
  /** The form's own rules, then what the engine found, each under the field it concerns. */
  const issues: Issue[] = useMemo(() => {
    if (!doc) return [];
    const own = checkDocument(doc);
    const fromEngine: Issue[] = [];
    for (const [f, t] of targets) {
      if (t.kind !== 'field' && t.kind !== 'info') continue;
      if (own.some((i) => i.key === t.key && i.level === 'error')) continue;
      fromEngine.push({ key: t.key, where: '', message: f.message, level: f.severity === 'error' ? 'error' : 'advice' });
    }
    return [...own, ...fromEngine];
  }, [doc, targets]);
  const guardErrors = useMemo(() => (doc ? checkDocument(doc).filter((i) => i.level === 'error') : []), [doc]);

  // ---- actions ----
  const discardOk = useCallback(() => !dirty || window.confirm('You have unsaved changes. Discard them?'), [dirty]);
  const token = useRef(0);

  const show = (next: { doc: IdsDocument | null; source: Source | null; unreadable?: string | null; fileName: string | null; seed?: Checked }) => {
    atOnce.current = true;
    setDoc(next.doc);
    setSource(next.source);
    setUnreadable(next.unreadable ?? null);
    setFileName(next.fileName);
    setSavedXml(next.doc ? writeIds(next.doc) : BLANK_XML);
    if (next.seed) setChecked(next.seed);
    setEditing(null); setUndo(null); setRefusal(null); setSaveProblem(null);
  };

  const openIds = async (file: File, example = false) => {
    const mine = ++token.current;
    setRefusal(null);
    setOpening(file.name);
    try {
      const read = await readForCheck(file);
      if (mine !== token.current) return;
      if ('sentence' in read) { setRefusal({ name: file.name, text: read.sentence }); return; }
      const src: Source = { name: file.name, size: file.size, text: read.text, file, example };
      let d: IdsDocument | null = null, why: string | null = null;
      try { d = readIdsText(read.text); } catch (e) {
        if (!(e instanceof AppError)) console.error(e);
        why = e instanceof AppError ? e.message : 'This file could not be opened in the forms.';
      }
      if (d) {
        if (!discardOk()) return;
        show({ doc: d, source: src, fileName: file.name });
        return;
      }
      // The quick reader could not take it. The engine says whether it is an IDS file with problems (shown, with
      // its findings) or not an IDS file at all (refused; what is on the page stays).
      const view = await checkText(read.text);
      if (mine !== token.current) return;
      if (view.kind === 'sentence') { setRefusal({ name: file.name, text: view.text }); return; }
      if (!discardOk()) return;
      show({ doc: null, source: src, unreadable: why, fileName: file.name, seed: { text: read.text, view } });
    } catch (e) {
      console.error(e);
      if (mine === token.current) setRefusal({ name: file.name, text: UNEXPECTED });
    } finally {
      if (mine === token.current) setOpening(null);
    }
  };

  /** Takes one file or several, wherever they were dropped: an IFC model and an IDS file are told apart by content. */
  const addFiles = async (files: File[], hint?: FileKind) => {
    for (const f of files.slice(0, 2)) {
      let head = '';
      try { head = await f.slice(0, 4096).text(); } catch { /* an unreadable file is reported by whoever reads it next */ }
      if (kindOfFile(f.name, head, files.length === 1 ? hint : undefined) === 'ifc') setModel(f);
      else await openIds(f);
    }
  };

  const startNew = () => {
    if (!discardOk()) return;
    show({ doc: blankDocument(), source: null, fileName: null });
    setEditing('about');
    setFocusKey((p) => ({ key: 'info.title', n: (p?.n ?? 0) + 1 }));
  };
  const tryExample = () => {
    if (!discardOk()) return;
    const file = new File([EXAMPLE_IDS], EXAMPLE_IDS_NAME, { type: 'application/xml' });
    show({ doc: readIdsText(EXAMPLE_IDS), source: { name: EXAMPLE_IDS_NAME, size: file.size, text: EXAMPLE_IDS, file, example: true }, fileName: EXAMPLE_IDS_NAME });
    setModel(new File([EXAMPLE_IFC], EXAMPLE_IFC_NAME));
  };
  const closeAll = () => {
    if (!discardOk()) return;
    show({ doc: null, source: null, fileName: null });
    setModel(null);
  };

  /** A change made in a form: checked again after a pause. */
  const edit = (fn: (d: IdsDocument) => IdsDocument) => { atOnce.current = false; setDoc((d) => (d ? fn(d) : d)); };
  /** A change made in one press (a fix, a delete, a move): checked at once, and it can be undone. */
  const change = (label: string, fn: (d: IdsDocument) => IdsDocument) => {
    if (!doc) return;
    atOnce.current = true;
    setUndo({ doc, label });
    setDoc(fn(doc));
  };
  const undoLast = () => {
    if (!undo) return;
    atOnce.current = true;
    setDoc(undo.doc);
    setUndo(null);
  };

  const goTo = (t: Target) => {
    if (!doc) return;
    if (t.kind === 'info') { setEditing('about'); setFocusKey((p) => ({ key: t.key, n: (p?.n ?? 0) + 1 })); }
    else if (t.kind === 'specification' || t.kind === 'field') {
      const s = doc.specifications[t.spec];
      if (!s) return;
      setEditing(s.uid);
      setFocusKey((p) => ({ key: t.kind === 'field' ? t.key : `${s.uid}.name`, n: (p?.n ?? 0) + 1 }));
    }
  };

  const downloadBlocked: string | null = !doc ? null
    : guardErrors.length > 0 ? `Download is off until this is fixed: ${guardErrors[0].where}: ${guardErrors[0].message}${guardErrors.length > 1 ? ` (and ${guardErrors.length - 1} more)` : ''}`
    : report && !report.valid ? `Download is off until the IDS file is valid: ${report.findings.find((f) => f.severity === 'error')?.message ?? ''}`
    : null;

  /** The text to save, once the engine has accepted exactly that text. Null (with the reason shown) when it has not. */
  const textToSave = async (): Promise<string | null> => {
    if (xml === null || downloadBlocked) return null;
    setSaveProblem(null);
    try {
      const view = check && 'view' in check && xml === text ? check.view : await checkText(xml);
      if (view.kind === 'sentence') { setSaveProblem(view.text); return null; }
      if (view.errors > 0) {
        const first = view.findings.find((f) => f.severity === 'error');
        setSaveProblem(`The Check engine found ${view.errors} ${view.errors === 1 ? 'problem' : 'problems'} in this IDS, so it was not saved. ${first ? first.message : ''}`);
        return null;
      }
      return xml;
    } catch (e) {
      console.error(e);
      setSaveProblem('The IDS could not be checked just now, so it was not saved. Try again.');
      return null;
    }
  };
  /** After a download the page shows the file that was saved: it is the opened file from then on. */
  const markSaved = (saved: string, as: string) => {
    atOnce.current = true;
    const file = new File([saved], as, { type: 'application/xml' });
    setSource({ name: as, size: file.size, text: saved, file, example: false });
    setFileName(as);
    setSavedXml(saved);
  };

  return {
    doc, source, unreadable, name, dirty, asOpened, blank, text, xml, model, refusal, opening,
    check, report, valid, checking: text !== null && !blank && check === null,
    run, running, phase, runnable,
    placed, targets, issues, guardErrors, lines,
    editing, setEditing, focusKey, undo, saveProblem, downloadBlocked,
    openIds, addFiles, startNew, tryExample, closeAll, edit, change, undoLast, goTo, textToSave, markSaved,
    setModel, clearRefusal: () => setRefusal(null), runAgain: () => setNonce((n) => n + 1),
  };
}
export type Page = ReturnType<typeof usePage>;
