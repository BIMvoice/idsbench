import { useEffect, useMemo, useState } from 'react';
import type { Finding } from '@idsbench/check';
import { checkText, excerpt, whereText } from '../../core/checkview';
import { plainFinding } from '../../core/plain';
import { dataTypeFor } from '../../core/picks';
import { candidateFixes, verifyFixes, type Fix } from '../../core/quickfix';
import { useSchema } from '../write/useSchema';
import type { Page, Report } from './usePage';

/** How many findings the page tries one-press fixes for. Each try is one run of the engine. */
const FIX_TRIES = 12;

/** The one-press fixes the engine has confirmed, per finding, for the check now on screen. */
function useFixes(page: Page): { fixes: Map<Finding, Fix[]>; ready: boolean } {
  const { report, doc, targets, textOf, asInFile } = page;
  const hasKept = page.kept !== null;
  const needsTables = !!report?.findings.some((f) => f.code === 'value-needs-datatype');
  const schema = useSchema(needsTables ? 'IFC4' : null);
  const [found, setFound] = useState<{ report: Report; fixes: Map<Finding, Fix[]> } | null>(null);
  useEffect(() => {
    if (!report || report.valid && report.warnings === 0 || !doc) return;
    let live = true;
    void (async () => {
      const fixes = new Map<Finding, Fix[]>();
      let tried = 0;
      for (const f of report.findings) {
        const t = targets.get(f);
        const candidates = t ? candidateFixes(f, doc, t, (set, name) => (schema ? dataTypeFor(schema, set, name) : null), { specification: asInFile, info: hasKept, file: hasKept }) : [];
        if (candidates.length === 0 || tried++ >= FIX_TRIES) continue;
        const ok = await verifyFixes(f, candidates, doc, report.errors, async (d) => {
          // The engine judges the text this page would write for the changed document, not another rendering of it.
          const view = await checkText(textOf(d));
          return view.kind === 'report' ? view.findings : null;
        }).catch(() => []);
        if (!live) return;
        if (ok.length) fixes.set(f, ok);
      }
      if (live) setFound({ report, fixes });
    })();
    return () => { live = false; };
  }, [report, doc, targets, schema, textOf, asInFile, hasKept]);
  return found && found.report === report ? { fixes: found.fixes, ready: true } : { fixes: new Map(), ready: false };
}

/** Under the stamp: what there is to fix in the IDS file, one line each, and the way to the place or the fix itself. */
export function ToFix({ page }: { page: Page }) {
  const { report, targets, doc, extraGuard } = page;
  const { fixes, ready } = useFixes(page);
  const xml = page.text ?? '';
  const lines = useMemo(() => {
    const groups = new Map<string, Finding[]>();
    for (const f of report?.findings ?? []) groups.set(`${f.severity}|${f.code}|${f.message}`, [...(groups.get(`${f.severity}|${f.code}|${f.message}`) ?? []), f]);
    return [...groups.values()];
  }, [report]);
  if ((!report || lines.length === 0) && extraGuard.length === 0) return null;
  // One count, one list: the engine's findings and the form's own problems the engine does not word the same way.
  const n = (report?.findings.length ?? 0) + extraGuard.length;
  const errors = (report?.errors ?? 0) > 0 || extraGuard.length > 0;
  return (
    <section className="to-fix" aria-label="To fix" data-fixes={ready || !doc ? 'ready' : 'looking'}>
      <h3>{errors ? `${n} ${n === 1 ? 'thing' : 'things'} to fix in this IDS file` : `${n} ${n === 1 ? 'thing' : 'things'} to look at in this IDS file`}</h3>
      {!doc && <p className="note-plain">This file cannot be changed here{page.unreadable && !report?.findings.some((f) => f.message === page.unreadable) ? `: ${page.unreadable}` : '.'} Correct it in the tool that made it, then open it again.</p>}
      <ol className="fix-list">
        {extraGuard.map((g) => (
          <li key={g.key} className="fix-line">
            <span className="sev error">Problem</span>
            <span className="fix-text">{g.message}<span className="hint"> {g.where}.</span></span>
            <span className="row-actions">
              <button type="button" className="btn small" aria-label={`Fix: ${g.message}`} onClick={() => page.goToIssue(g.key)}>Fix</button>
            </span>
          </li>
        ))}
        {lines.map((group, i) => {
          const f = group[0];
          const t = targets.get(f);
          const reachable = doc && t && t.kind !== 'file';
          const where = t && t.kind !== 'file' && doc ? (t.kind === 'info' ? 'About this IDS' : `Specification ${t.spec + 1}`) : null;
          const words = plainFinding(f);
          const around = f.line ? excerpt(xml, f.line, f.column) : null;
          return (
            <li key={i} className="fix-line">
              <span className={`sev ${f.severity}`}>{f.severity === 'error' ? 'Problem' : 'Warning'}</span>
              <span className="fix-text">
                {words.plain}{group.length > 1 ? ` (${group.length} places)` : ''}{where ? <span className="hint"> {where}.</span> : null}
                <details className="fix-details">
                  <summary>Details</summary>
                  {words.translated && <p className="technical">What the check engine says: {words.technical}</p>}
                  <p className="technical">{[whereText(f), f.code].filter(Boolean).join(' · ')}</p>
                  {around && <pre className="excerpt" tabIndex={0} aria-label={`The file around ${whereText(f)}`}>{around.join('\n')}</pre>}
                </details>
              </span>
              <span className="row-actions">
                {(fixes.get(f) ?? []).map((fix) => (
                  <button key={fix.label} type="button" className="btn small" onClick={() => page.change(fix.label, fix.apply)}>{fix.label}</button>
                ))}
                {reachable && <button type="button" className="btn small" aria-label={`Fix: ${words.plain}`} onClick={() => page.goTo(t)}>Fix</button>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
