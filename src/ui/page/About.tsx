/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useEffect, useRef } from 'react';
import type { Finding } from '@idsbench/check';
import type { Issue } from '../../core/ids/check';
import { INFO_OPTIONAL, type IdsDocument } from '../../core/ids/model';
import { TextField } from '../write/fields';
import { Findings } from './Findings';

const LABELS: Record<(typeof INFO_OPTIONAL)[number], string> = {
  copyright: 'Copyright', version: 'Version', description: 'Description', author: 'Author (email address)',
  date: 'Date', purpose: 'Purpose', milestone: 'Milestone',
};
const HINTS: Partial<Record<(typeof INFO_OPTIONAL)[number], string>> = {
  author: 'For example name@company.com.', date: 'Year-month-day, for example 2026-03-31.', version: 'For example 1.0.',
  purpose: 'Why the information is needed.', milestone: 'When the information is needed, for example Design or Handover.',
};

interface Props {
  doc: IdsDocument;
  issues: Issue[];
  findings: Finding[];
  xml: string;
  editing: boolean;
  focusKey: { key: string; n: number } | null;
  onEdit: (open: boolean) => void;
  onChange: (k: keyof IdsDocument['info'], v: string) => void;
}

/** The information about the IDS file itself. It asks for the title only, until "More details" is opened. */
export function About({ doc, issues, findings, xml, editing, focusKey, onEdit, onChange }: Props) {
  const issue = (k: string) => issues.find((i) => i.key === `info.${k}` && i.level === 'error')?.message ?? null;
  const filled = INFO_OPTIONAL.filter((k) => doc.info[k] !== '');
  const moreNeeded = INFO_OPTIONAL.some((k) => issue(k)) || (focusKey !== null && focusKey.key.startsWith('info.') && focusKey.key !== 'info.title');
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!editing || !focusKey?.key.startsWith('info.') || !root.current) return;
    root.current.querySelector<HTMLElement>(`[data-key="${focusKey.key}"] input, [data-key="${focusKey.key}"] textarea`)?.focus();
  }, [editing, focusKey]);
  return (
    <section className="about" aria-labelledby="about-title" ref={root}>
      <div className="section-head">
        <h3 id="about-title">About this IDS</h3>
        <button type="button" className="btn small" aria-expanded={editing} onClick={() => onEdit(!editing)}>{editing ? 'Done' : 'Edit'}</button>
      </div>
      <Findings findings={findings} xml={xml} label="What was found in About this IDS" />
      {editing ? (
        <div className="about-form">
          <TextField label="Title" dataKey="info.title" required value={doc.info.title} error={issue('title')} onChange={(v) => onChange('title', v)} />
          <details className="more" open={moreNeeded || undefined}>
            <summary>More details</summary>
            {INFO_OPTIONAL.map((k) => (
              <TextField key={k} label={LABELS[k]} dataKey={`info.${k}`} hint={HINTS[k]} multiline={k === 'description'} value={doc.info[k]} error={issue(k)} onChange={(v) => onChange(k, v)} />
            ))}
          </details>
        </div>
      ) : (
        <dl className="about-list">
          <div><dt>Title</dt><dd>{doc.info.title || <span className="hint">No title yet.</span>}</dd></div>
          {filled.map((k) => <div key={k}><dt>{LABELS[k].replace(' (email address)', '')}</dt><dd>{doc.info[k]}</dd></div>)}
        </dl>
      )}
    </section>
  );
}
