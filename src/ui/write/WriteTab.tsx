import { useEffect, useMemo, useRef, useState } from 'react';
import { SpecEditor } from './SpecEditor';
import { TextField } from './fields';
import { checkDocument } from '../../core/ids/check';
import { blankDocument, newSpecification, specChoice, INFO_OPTIONAL, type IdsDocument, type Specification } from '../../core/ids/model';
import { readIdsText } from '../../core/ids/read';
import { writeIds } from '../../core/ids/write';
import { AppError } from '../../core/errors';

const DRAFT_KEY = 'idsbench.write.draft';
interface Draft { doc: IdsDocument; fileName: string | null; savedXml: string }

/** The draft lives in sessionStorage only: it goes when the tab closes and is never sent anywhere. */
function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d || !d.doc || !Array.isArray(d.doc.specifications) || typeof d.savedXml !== 'string') return null;
    return d;
  } catch { return null; }
}
function saveDraft(d: Draft | null) {
  try { if (d) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); else sessionStorage.removeItem(DRAFT_KEY); } catch { /* storage may be blocked; the page works without it */ }
}

const INFO_LABELS: Record<(typeof INFO_OPTIONAL)[number], string> = {
  copyright: 'Copyright', version: 'Version', description: 'Description', author: 'Author (email address)',
  date: 'Date', purpose: 'Purpose', milestone: 'Milestone',
};
const INFO_HINTS: Partial<Record<(typeof INFO_OPTIONAL)[number], string>> = {
  author: 'For example name@company.com.', date: 'Year-month-day, for example 2026-03-31.', version: 'For example 1.0.',
  purpose: 'Why the information is needed.', milestone: 'When the information is needed, for example Design or Handover.',
};

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

interface Props { onUseInRun: (file: File) => void }

export function WriteTab({ onUseInRun }: Props) {
  const [restored] = useState(loadDraft);
  const [doc, setDoc] = useState<IdsDocument>(() => restored?.doc ?? blankDocument());
  const [fileName, setFileName] = useState<string | null>(() => restored?.fileName ?? null);
  const [savedXml, setSavedXml] = useState<string>(() => restored?.savedXml ?? writeIds(blankDocument()));
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [focusSpec, setFocusSpec] = useState<string | null>(null);
  useEffect(() => {
    if (!focusSpec) return;
    document.querySelector<HTMLElement>(`#body-${focusSpec} input[type=text]`)?.focus();
    setFocusSpec(null);
  }, [focusSpec, openUid]);

  const xml = useMemo(() => writeIds(doc), [doc]);
  const dirty = xml !== savedXml;
  const issues = useMemo(() => checkDocument(doc), [doc]);
  const errors = issues.filter((i) => i.level === 'error');
  const blocked = errors.length > 0 ? `Download is off until this is fixed: ${errors[0].where}: ${errors[0].message}${errors.length > 1 ? ` (and ${errors.length - 1} more)` : ''}` : null;

  // Keep the draft while there is something unsaved; clear it when there is not.
  useEffect(() => {
    const t = setTimeout(() => saveDraft(dirty ? { doc, fileName, savedXml } : null), 250);
    return () => clearTimeout(t);
  }, [dirty, doc, fileName, savedXml]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const info = (k: keyof IdsDocument['info'], v: string) => setDoc((d) => ({ ...d, info: { ...d.info, [k]: v } }));
  const issue = (key: string) => errors.find((i) => i.key === key)?.message ?? null;
  const updateSpec = (s: Specification) => setDoc((d) => ({ ...d, specifications: d.specifications.map((x) => (x.uid === s.uid ? s : x)) }));
  const moveSpec = (i: number, delta: -1 | 1) => setDoc((d) => {
    const j = i + delta;
    if (j < 0 || j >= d.specifications.length) return d;
    const next = [...d.specifications];
    [next[i], next[j]] = [next[j], next[i]];
    return { ...d, specifications: next };
  });
  const addSpec = () => {
    const s = newSpecification();
    setDoc((d) => ({ ...d, specifications: [...d.specifications, s] }));
    setOpenUid(s.uid);
    setFocusSpec(s.uid);
  };

  const discardOk = () => !dirty || window.confirm('You have unsaved changes. Discard them?');
  const startNew = () => {
    if (!discardOk()) return;
    const b = blankDocument();
    setDoc(b); setFileName(null); setSavedXml(writeIds(b)); setOpenUid(null); setProblem(null);
  };
  const open = async (file: File | undefined) => {
    if (!file) return;
    if (!discardOk()) return;
    try {
      const d = readIdsText(await file.text());
      setDoc(d); setFileName(file.name); setSavedXml(writeIds(d)); setOpenUid(null); setProblem(null);
    } catch (e) {
      console.error(e);
      setProblem(e instanceof AppError ? e.message : 'This file could not be opened. Check that you chose an IDS file.');
    }
  };

  const downloadName = fileName ?? `${slug(doc.info.title) || 'untitled'}.ids`;
  const download = () => {
    if (blocked) return;
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
    const a = document.createElement('a');
    a.href = url; a.download = downloadName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFileName(downloadName);
    setSavedXml(xml);
  };
  const useInRun = () => { if (!blocked) onUseInRun(new File([xml], downloadName, { type: 'application/xml' })); };

  return (
    <>
      <h2>Write</h2>
      <p className="lead">Write an IDS file with plain forms. Your draft stays in this browser tab until you close it. Nothing is uploaded.</p>

      <div className="actions write-bar" role="toolbar" aria-label="File">
        <button type="button" className="btn" onClick={startNew}>New</button>
        <button type="button" className="btn" onClick={() => picker.current?.click()}>Open…</button>
        <input ref={picker} type="file" accept=".ids,.xml" className="file-input" tabIndex={-1} aria-label="Choose an IDS file to open"
          onChange={(e) => { void open(e.target.files?.[0]); e.target.value = ''; }} />
        <button type="button" className="btn primary" disabled={!!blocked} aria-describedby="write-reason" onClick={download}>Download .ids</button>
        <button type="button" className="btn" disabled={!!blocked} aria-describedby="write-reason" onClick={useInRun}>Use this IDS in Run</button>
      </div>
      <p className="meta" id="write-status">
        <span className="file-name">{fileName ?? 'Untitled.ids'}</span>
        {dirty && <span className="unsaved"> — unsaved changes</span>}
      </p>
      <p className="meta" id="write-reason" role="status">{blocked}</p>
      {problem && <p className="error" role="alert">{problem}</p>}

      <section aria-labelledby="write-about">
        <h3 id="write-about">About this IDS</h3>
        <TextField label="Title" required value={doc.info.title} error={issue('info.title')} onChange={(v) => info('title', v)} />
        <details className="more">
          <summary>More details</summary>
          {INFO_OPTIONAL.map((k) => (
            <TextField key={k} label={INFO_LABELS[k]} hint={INFO_HINTS[k]} multiline={k === 'description'} value={doc.info[k]} error={issue(`info.${k}`)} onChange={(v) => info(k, v)} />
          ))}
        </details>
      </section>

      <section aria-labelledby="write-specs">
        <h3 id="write-specs">Specifications</h3>
        {doc.specifications.length === 0 && <p className="empty">No specifications yet. Add the first one to say what the model must contain.</p>}
        {issue('specs') && doc.specifications.length > 0 && <p className="msg error-msg">{issue('specs')}</p>}
        <ul className="specs write-specs">
          {doc.specifications.map((s, i) => {
            const isOpen = openUid === s.uid;
            const choice = specChoice(s);
            const label = s.name.trim() || 'Untitled specification';
            const bad = errors.filter((e) => e.key.startsWith(`${s.uid}.`) || s.applicability.concat(s.requirements).some((f) => e.key.startsWith(`${f.uid}.`))).length;
            return (
              <li key={s.uid} className="spec">
                <div className="spec-head write-spec-head">
                  <button type="button" className="spec-toggle" aria-expanded={isOpen} aria-controls={`body-${s.uid}`} onClick={() => setOpenUid(isOpen ? null : s.uid)}>
                    <span className="spec-name">{label}</span>
                    <span className="hint"> {choice === 'custom' ? 'Custom' : choice[0].toUpperCase() + choice.slice(1)}{bad ? ` — ${bad} to fix` : ''}</span>
                  </button>
                  <span className="row-actions">
                    <button type="button" className="btn small" disabled={i === 0} onClick={() => moveSpec(i, -1)} aria-label={`Move ${label} up`}>Move up</button>
                    <button type="button" className="btn small" disabled={i === doc.specifications.length - 1} onClick={() => moveSpec(i, 1)} aria-label={`Move ${label} down`}>Move down</button>
                    {confirmDelete === s.uid ? (
                      <>
                        <button type="button" className="btn small" onClick={() => { setDoc((d) => ({ ...d, specifications: d.specifications.filter((x) => x.uid !== s.uid) })); setConfirmDelete(null); }}>Yes, delete</button>
                        <button type="button" className="btn small" onClick={() => setConfirmDelete(null)}>Keep</button>
                      </>
                    ) : (
                      <button type="button" className="btn small" onClick={() => setConfirmDelete(s.uid)} aria-label={`Delete ${label}`}>Delete</button>
                    )}
                  </span>
                </div>
                {isOpen && <div id={`body-${s.uid}`}><SpecEditor spec={s} issues={issues} onChange={updateSpec} /></div>}
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn" onClick={addSpec}>Add a specification</button>
      </section>
    </>
  );
}
