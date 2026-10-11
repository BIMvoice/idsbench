import { useEffect, useMemo, useState } from 'react';
import type { Finding } from '@idsbench/check';
import { checkText } from '../../core/checkview';
import { writeIds } from '../../core/ids/write';
import { dataTypeFor } from '../../core/picks';
import { candidateFixes, verifyFixes, type Fix } from '../../core/quickfix';
import { useSchema } from '../write/useSchema';
import type { Page, Report } from './usePage';

/** How many findings the page tries one-press fixes for. Each try is one run of the engine. */
const FIX_TRIES = 12;

/** The one-press fixes the engine has confirmed, per finding, for the check now on screen. */
function useFixes(page: Page): Map<Finding, Fix[]> {
  const { report, doc, targets } = page;
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
        const candidates = t ? candidateFixes(f, doc, t, (set, name) => (schema ? dataTypeFor(schema, set, name) : null)) : [];
        if (candidates.length === 0 || tried++ >= FIX_TRIES) continue;
        const ok = await verifyFixes(f, candidates, doc, report.errors, async (d) => {
          const view = await checkText(writeIds(d));
          return view.kind === 'report' ? view.findings : null;
        }).catch(() => []);
        if (!live) return;
        if (ok.length) fixes.set(f, ok);
      }
      if (live) setFound({ report, fixes });
    })();
    return () => { live = false; };
  }, [report, doc, targets, schema]);
  return found && found.report === report ? found.fixes : new Map();
}

/** Under the stamp: what there is to fix in the IDS file, one line each, and the way to the place or the fix itself. */
export function ToFix({ page }: { page: Page }) {
  const { report, targets, doc } = page;
  const fixes = useFixes(page);
  const lines = useMemo(() => {
    const groups = new Map<string, Finding[]>();
    for (const f of report?.findings ?? []) groups.set(`${f.severity}|${f.code}|${f.message}`, [...(groups.get(`${f.severity}|${f.code}|${f.message}`) ?? []), f]);
    return [...groups.values()];
  }, [report]);
  if (!report || lines.length === 0) return null;
  const n = report.findings.length;
  return (
    <section className="to-fix" aria-label="To fix">
      <h3>{report.errors > 0 ? `${n} ${n === 1 ? 'thing' : 'things'} to fix in this IDS file` : `${n} ${n === 1 ? 'thing' : 'things'} to look at in this IDS file`}</h3>
      {!doc && <p className="note-plain">This file cannot be changed here{page.unreadable && !report.findings.some((f) => f.message === page.unreadable) ? `: ${page.unreadable}` : '.'} Correct it in the tool that made it, then open it again.</p>}
      <ol className="fix-list">
        {lines.map((group, i) => {
          const f = group[0];
          const t = targets.get(f);
          const reachable = doc && t && t.kind !== 'file';
          const where = t && t.kind !== 'file' && doc ? (t.kind === 'info' ? 'About this IDS' : `Specification ${t.spec + 1}`) : null;
          return (
            <li key={i} className="fix-line">
              <span className={`sev ${f.severity}`}>{f.severity === 'error' ? 'Problem' : 'Warning'}</span>
              <span className="fix-text">{f.message}{group.length > 1 ? ` (${group.length} places)` : ''}{where ? <span className="hint"> {where}.</span> : null}</span>
              <span className="row-actions">
                {(fixes.get(f) ?? []).map((fix) => (
                  <button key={fix.label} type="button" className="btn small" onClick={() => page.change(fix.label, fix.apply)}>{fix.label}</button>
                ))}
                {reachable && <button type="button" className="btn small" aria-label={`Fix: ${f.message}`} onClick={() => page.goTo(t)}>Fix</button>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
