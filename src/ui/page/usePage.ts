// The one state of the page: the IDS document, the model, the check of the document and the run against the model.
//
// Two rules hold everywhere and are enforced here, not in the components:
//  1. A result is stored with the exact text (and model) it was made for, and is only handed out while that is still
//     the current text (and model). A result of an older version of the document therefore cannot be shown, even for
//     one frame, because showing it is decided at render time by comparing the two, not by clearing state in time.
//  2. A file that was opened and not changed is checked, run and downloaded as it is: `text` is then the file's own
//     text, the run reads the very File that was opened, and Download saves that File's own bytes. Once the document
//     differs from the opened file, what is checked, run and saved is the opened text with only the changed
//     specifications (or the info section) written anew (core/ids/keep.ts), so a change stays where it was made.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Finding } from '@idsbench/check';
import { chooseDropped, type DroppedKind } from '../../core/align';
import { checkText, readForCheck, type CheckView } from '../../core/checkview';
import { keepSource, sameContent, wholeLoss, writeKept, type Kept, type LostPart } from '../../core/ids/keep';
import { leftOutSentence, sayLost, type LeftOut, type LostItem } from '../../core/ids/lost';
import { AppError, UNEXPECTED } from '../../core/errors';
import { EXAMPLE_IDS, EXAMPLE_IDS_NAME, EXAMPLE_IFC, EXAMPLE_IFC_NAME } from '../../core/example';
import { checkDocument, type Issue } from '../../core/ids/check';
import { blankDocument, type IdsDocument } from '../../core/ids/model';
import { readIdsText } from '../../core/ids/read';
import { writeIds } from '../../core/ids/write';
import { outline, placeFindings, targetOf, type Outline, type Placed, type Target } from '../../core/place';
import { plainFinding } from '../../core/plain';
import { kindOfFile, type FileKind } from '../../core/sniff';
import type { AppErrorInfo } from '../../core/types';
import type { Phase } from '../../core/validate';
import { forgetModel, onSilence, runInWorker, RunCancelled, RunFailed, stopWorker, type RunOutcome } from '../../runner';
import { loadDraft, saveDraft, type Draft } from './draft';

/** How long the page waits after the last change to the document before it checks and runs it again. */
export const SETTLE_MS = 400;

const BLANK_XML = writeIds(blankDocument());
const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export interface Source {
  name: string; size: number; text: string; example: boolean;
  /** The file as it was opened: what Download saves while nothing is changed. */
  file: File;
  /** What a run reads while nothing is changed: the opened file itself, or its letters when it is not in UTF-8. */
  runFile: File;
  /** True when the opened file starts with a byte order mark; a changed file is saved with one too. */
  bom: boolean;
  /** The opened text cut into the pieces that are written back unchanged, or null when it cannot be cut safely. */
  kept: Kept | null;
  /** Set when the file is in another encoding than UTF-8: its name. A changed file is saved as UTF-8. */
  encoding: string | null;
}
type Checked = { text: string; view: CheckView } | { text: string; failed: string };
type Ran = { text: string; model: File; nonce: number } & ({ outcome: RunOutcome } | { error: AppErrorInfo });
export type Report = Extract<CheckView, { kind: 'report' }>;
export interface Undo { doc: IdsDocument; label: string }

const BOM = '\uFEFF';
const sourceOf = (name: string, text: string, bom: boolean, kept: Kept | null): Source => {
  const file = new File([bom ? BOM + text : text], name, { type: 'application/xml' });
  return { name, size: file.size, text, file, runFile: file, bom, kept, example: false, encoding: null };
};

/** What the page starts with: nothing, or the unsaved work this tab held before it was loaded again. */
function restore(): { draft: Draft | null; source: Source | null; notice: string | null } {
  const { draft, unreadable } = loadDraft();
  if (!draft) return { draft: null, source: null, notice: unreadable ? 'Unsaved changes were kept in this tab, but they could not be read, so they were not restored.' : null };
  let source: Source | null = null;
  if (draft.source && draft.fileName) {
    try {
      // The opened file as it was read then, with the ids its specifications had, so that the ones not changed are still written as the file has them.
      const opened = readIdsText(draft.source.text);
      if (opened.specifications.length === draft.source.specUids.length) {
        opened.specifications.forEach((s, i) => { s.uid = draft.source!.specUids[i]; });
        const kept = keepSource(draft.source.text, opened);
        if (kept) source = sourceOf(draft.fileName, draft.source.text, draft.source.bom === true, kept);
      }
    } catch { /* the changes are restored without it, and are then written in full */ }
  }
  const notice = `Your unsaved changes were restored.${draft.model ? ` The model ${draft.model} is not kept when the page is loaded again: choose it again to see its result.` : ''}`;
  return { draft: source ? { ...draft, savedXml: source.text } : draft, source, notice };
}

export function usePage() {
  const [start] = useState(restore);
  const restored = start.draft;
  const [doc, setDoc] = useState<IdsDocument | null>(() => restored?.doc ?? null);
  const [source, setSource] = useState<Source | null>(start.source);
  /** Something the page did by itself that the person has to know: said once, and it can be dismissed. */
  const [notice, setNotice] = useState<string | null>(start.notice);
  /** False when the unsaved changes could not be stored in this tab (too large): a reload would lose them. */
  const [draftKept, setDraftKept] = useState(true);
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
  /** Set while the worker has said nothing for longer than it may during a run (to how long that is, in milliseconds): the page then offers to stop it. */
  const [silent, setSilent] = useState<number | null>(null);
  /** Set by "Run again" and "Stop and try again": the next run reads the model again instead of using the copy the worker keeps. */
  const freshNext = useRef(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<{ key: string; n: number } | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [saveProblem, setSaveProblem] = useState<string | null>(null);

  const kept = source?.kept ?? null;
  const written = useMemo(() => (doc ? (kept ? writeKept(kept, doc) : { text: writeIds(doc), commentsLost: [], infoCommentsLost: false, whole: true, lost: [] }) : null), [doc, kept]);
  const xml = written?.text ?? null;
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
    () => (text === null ? null : asOpened && source ? source.runFile : new File([text], name ?? 'untitled.ids', { type: 'application/xml' })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, asOpened, source],
  );
  const runnable = valid && model !== null && text !== null && text === settled && !blank;
  useEffect(() => {
    if (!runnable || !idsFile || !model || text === null) return;
    const live = { on: true };
    setPhase('reading-ids');
    const fresh = freshNext.current;
    freshNext.current = false;
    const run = runInWorker({ ids: idsFile, ifc: model }, (p) => { if (live.on) setPhase(p); }, { fresh });
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
  useEffect(() => onSilence(setSilent), []);
  // The model the worker has read is let go when the page no longer has that model: when the model is removed, and
  // also when another is chosen while no run can start (the IDS file is not valid just then), so that a model that
  // is no longer on the page does not go on holding its memory.
  useEffect(() => { forgetModel(model); }, [model]);
  const run = ran !== null && ran.text === text && ran.model === model && ran.nonce === nonce && runnable ? ran : null;
  const running = runnable && run === null;

  // ---- the draft and the leave prompt ----
  useEffect(() => {
    const t = setTimeout(() => {
      const from = source && kept ? { text: source.text, specUids: kept.specs.map((s) => s.uid), bom: source.bom } : undefined;
      setDraftKept(saveDraft(dirty && doc ? { doc, fileName, savedXml, source: from, model: model?.name ?? null } : null));
    }, 250);
    return () => clearTimeout(t);
  }, [dirty, doc, fileName, savedXml, source, kept, model]);
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
      fromEngine.push({ key: t.key, where: '', message: plainFinding(f).plain, level: f.severity === 'error' ? 'error' : 'advice' });
    }
    return [...own, ...fromEngine];
  }, [doc, targets]);
  const guardErrors = useMemo(() => (doc ? checkDocument(doc).filter((i) => i.level === 'error') : []), [doc]);
  /** The form's own problems that the engine does not already say in the same words: they join the list of things to fix, so that the count in the header and the list agree. */
  const extraGuard = useMemo(() => {
    const said = new Set((report?.findings ?? []).map((f) => plainFinding(f).plain));
    // The engine's finding is about the same field as the form's problem: one line, not two.
    const fields = new Set([...targets].flatMap(([, t]) => (t.kind === 'field' || t.kind === 'info' ? [t.key] : [])));
    return guardErrors.filter((g) => !said.has(g.message) && !fields.has(g.key));
  }, [guardErrors, report, targets]);

  // ---- actions ----
  const discardOk = useCallback(() => !dirty || window.confirm('You have unsaved changes. Discard them?'), [dirty]);
  const token = useRef(0);

  const show = (next: { doc: IdsDocument | null; source: Source | null; unreadable?: string | null; fileName: string | null; seed?: Checked }) => {
    atOnce.current = true;
    setDoc(next.doc);
    setSource(next.source);
    setUnreadable(next.unreadable ?? null);
    setFileName(next.fileName);
    setSavedXml(next.doc ? (next.source?.kept ? next.source.text : writeIds(next.doc)) : BLANK_XML);
    setNotice(null);
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
      // A file in another encoding than UTF-8 is run from its letters: the worker reads its input as UTF-8.
      const runFile = read.utf8 ? file : new File([read.text], file.name, { type: 'application/xml' });
      const src: Source = { name: file.name, size: file.size, text: read.text, file, runFile, bom: read.bom, kept: null, example, encoding: read.utf8 ? null : read.encoding };
      let d: IdsDocument | null = null, why: string | null = null;
      try { d = readIdsText(read.text); } catch (e) {
        if (!(e instanceof AppError)) console.error(e);
        why = e instanceof AppError ? e.message : 'This file could not be opened in the forms.';
      }
      if (d) {
        if (!discardOk()) return;
        src.kept = keepSource(read.text, d);
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

  /**
   * Takes one file or several, wherever they were dropped: an IFC model and an IDS file are told apart by content.
   * `folders` are names of folders that were dropped. What is not taken (a second IDS file, a second model, a folder)
   * is said by name.
   */
  const addFiles = async (files: File[], hint?: FileKind, folders: string[] = []) => {
    const items: { file: { name: string; file?: File }; kind: DroppedKind }[] = folders.map((name) => ({ file: { name }, kind: 'folder' }));
    for (const f of files) {
      let head = '';
      try { head = await f.slice(0, 4096).text(); } catch { /* an unreadable file is reported by whoever reads it next */ }
      items.push({ file: { name: f.name, file: f }, kind: kindOfFile(f.name, head, files.length === 1 ? hint : undefined) });
    }
    const taken = chooseDropped(items);
    if (taken.ifc?.file) setModel(taken.ifc.file);
    if (taken.ids?.file) await openIds(taken.ids.file);
    // After the file is shown (which clears older notices), so that this one stays.
    if (taken.left) setNotice(taken.left);
  };

  const startNew = () => {
    if (!discardOk()) return;
    show({ doc: blankDocument(), source: null, fileName: null });
    setEditing('about');
    setFocusKey((p) => ({ key: 'info.title', n: (p?.n ?? 0) + 1 }));
  };
  const tryExample = () => {
    if (!discardOk()) return;
    const d = readIdsText(EXAMPLE_IDS);
    show({ doc: d, source: { ...sourceOf(EXAMPLE_IDS_NAME, EXAMPLE_IDS, false, keepSource(EXAMPLE_IDS, d)), example: true }, fileName: EXAMPLE_IDS_NAME });
    setModel(new File([EXAMPLE_IFC], EXAMPLE_IFC_NAME));
  };
  const closeAll = () => {
    if (!discardOk()) return;
    show({ doc: null, source: null, fileName: null });
    setModel(null);
  };

  /** A change made in a form: checked again after a pause. */
  // The offer to undo goes with the first change typed after it: Undo puts back the document as it was before the one
  // press, and would otherwise take everything typed since with it.
  const edit = (fn: (d: IdsDocument) => IdsDocument) => { atOnce.current = false; setUndo(null); setDoc((d) => (d ? fn(d) : d)); };
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

  /** Open the field a problem of the form's own concerns ("About this IDS" for a key of the info, else the specification the key names). */
  const goToIssue = (key: string) => {
    if (!doc) return;
    if (key.startsWith('info.')) { setEditing('about'); setFocusKey((p) => ({ key, n: (p?.n ?? 0) + 1 })); return; }
    const owner = doc.specifications.find((s) => key.startsWith(`${s.uid}.`));
    if (owner) { setEditing(owner.uid); setFocusKey((p) => ({ key, n: (p?.n ?? 0) + 1 })); }
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

  // A file that was opened and not changed is saved as its own bytes: the form's own rules (a title, for one) say
  // what a change must not leave behind, and do not stand between a person and the file they opened.
  /** The same count the list of things to fix shows. */
  const thingsToFix = (report?.findings.length ?? 0) + extraGuard.length;
  const downloadBlocked: string | null = !doc ? null
    : guardErrors.length > 0 && !(asOpened && source) ? `Download is off until this is fixed: ${(extraGuard[0] ?? guardErrors[0]).where}: ${(extraGuard[0] ?? guardErrors[0]).message}${thingsToFix > 1 ? ` (and ${thingsToFix - 1} more)` : ''}`
    : report && !report.valid ? `Download is off until the IDS file is valid: ${plainFinding(report.findings.find((f) => f.severity === 'error') ?? { code: '', message: '' }).plain}`
    : null;

  /**
   * What Download saves, once the engine has accepted exactly that text; null (with the reason shown) when it has not.
   * A file that was opened and not changed is saved as its own bytes. A changed one is read back first: only if the
   * reader finds in the text the very document on the page is it saved as written into the opened file; otherwise the
   * whole document is written.
   */
  const save = async (): Promise<{ parts: BlobPart[]; name: string } | null> => {
    if (xml === null || !doc || !name || downloadBlocked) return null;
    setSaveProblem(null);
    try {
      let out = xml;
      if (kept && !asOpened) {
        let faithful = false;
        try { faithful = sameContent(readIdsText(xml), doc); } catch { /* not readable: written in full below */ }
        if (!faithful) out = writeIds(doc);
      }
      const view = check && 'view' in check && out === text ? check.view : await checkText(out);
      if (view.kind === 'sentence') { setSaveProblem(view.text); return null; }
      if (view.errors > 0) {
        const first = view.findings.find((f) => f.severity === 'error');
        setSaveProblem(`The Check engine found ${view.errors} ${view.errors === 1 ? 'problem' : 'problems'} in this IDS, so it was not saved. ${first ? plainFinding(first).plain : ''}`);
        return null;
      }
      if (asOpened && source) return { parts: [source.file], name };
      // After a download the page shows the file that was saved: it is the opened file from then on.
      const bom = source?.bom ?? false;
      const next = sourceOf(name, out, bom, keepSource(out, doc));
      atOnce.current = true;
      setSource(next);
      setFileName(name);
      setSavedXml(next.kept ? out : writeIds(doc));
      return { parts: [bom ? BOM + out : out], name };
    } catch (e) {
      console.error(e);
      setSaveProblem('The IDS could not be checked just now, so it was not saved. Try again.');
      return null;
    }
  };

  /** A document as this page would write it now: into the opened file where that is kept, else in full. */
  const textOf = useCallback((d: IdsDocument) => (kept ? writeKept(kept, d).text : writeIds(d)), [kept]);
  /** True when this specification is still written as the opened file has it, character for character. */
  const asInFile = useCallback((s: { uid: string; rewrite?: true }) => !!kept && !s.rewrite && kept.specs.some((k) => k.uid === s.uid), [kept]);

  /** The bytes of the IDS as it is checked and run now: the opened file itself, or the document as Download would save it. */
  const idsBlob = (): Blob | null => (text === null ? null : asOpened && source ? source.file : new Blob([source?.bom ? BOM + text : text]));

  /** What writing the whole file again would leave out, when Download has to write it in full: found once per opened file. */
  const wholeLost: LostItem[] = useMemo(() => {
    if (!dirty || !source || !doc || (kept && !written?.whole)) return [];
    try { return wholeLoss(source.text, readIdsText(source.text)); } catch { return []; }
  }, [dirty, source, kept, written?.whole]); // eslint-disable-line react-hooks/exhaustive-deps

  /** What Download leaves out of the opened file, part by part: the same list is in the note and in the report. */
  const leftOut: LeftOut[] = useMemo(() => {
    if (!dirty || !source || !written) return [];
    if (!kept || written.whole) return wholeLost.length ? [{ part: 'file', name: source.name, items: wholeLost.map((i) => i.phrase) }] : [];
    return written.lost.map((l: LostPart) => ({ part: l.part, name: l.name, items: l.items.map((i) => i.phrase) }));
  }, [dirty, source, written, kept, wholeLost]);

  /** What Download will not keep of the opened file, in words; null when it keeps everything. */
  const saveNote: string | null = !dirty || !source || !written ? null
    : !kept || written.whole ? `Download writes this file again in full, in idsbench's own layout.${leftOut.length ? ` Writing it again will leave out: ${sayLost(wholeLost)}.` : ''} What it says stays the same.`
    : leftOut.length > 0
      ? `${leftOut.map(leftOutSentence).join(' ')} The rest of the file is saved as it was opened.`
      : null;

  return {
    doc, source, unreadable, name, dirty, asOpened, blank, text, xml, model, refusal, opening,
    notice, clearNotice: () => setNotice(null), draftKept, saveNote, leftOut,
    check, report, valid, checking: text !== null && !blank && check === null,
    run, running, phase, runnable,
    placed, targets, issues, guardErrors, extraGuard, lines,
    editing, setEditing, focusKey, undo, saveProblem, downloadBlocked,
    openIds, addFiles, startNew, tryExample, closeAll, edit, change, undoLast, goTo, goToIssue, save, idsBlob, textOf, asInFile, kept,
    setModel, clearRefusal: () => setRefusal(null),
    runAgain: () => { freshNext.current = true; setNonce((n) => n + 1); },
    /** The worker has been silent too long: end it, and with it the model it holds, and run again from the file. */
    stopAndRetry: () => { stopWorker(); freshNext.current = true; setNonce((n) => n + 1); },
    silent: silent !== null && running,
    /** How long the worker had to be silent for `silent` to be said, in seconds. */
    silentSeconds: Math.round((silent ?? 0) / 1000),
  };
}
export type Page = ReturnType<typeof usePage>;
