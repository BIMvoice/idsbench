/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useId, type ReactNode } from 'react';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  advice?: string | null;
  /** The key messages for this field are filed under; "Fix" finds the field by it. */
  dataKey?: string;
  children: (a: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** A label, the control, an optional hint, and the message next to the field. */
export function Field({ label, hint, error, advice, dataKey, children }: FieldProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  const hintId = `${id}-hint`;
  const message = error ?? advice;
  const describedBy = [hint ? hintId : '', message ? msgId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field" data-key={dataKey}>
      <label htmlFor={id} className="field-label">{label}</label>
      {children({ id, describedBy, invalid: !!error })}
      {hint && <span id={hintId} className="hint">{hint}</span>}
      {message && <span id={msgId} className={error ? 'msg error-msg' : 'msg advice-msg'}>{message}</span>}
    </div>
  );
}

interface TextProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string | null;
  advice?: string | null;
  multiline?: boolean;
  placeholder?: string;
  required?: boolean;
  dataKey?: string;
}
export function TextField({ label, value, onChange, hint, error, advice, multiline, placeholder, required, dataKey }: TextProps) {
  return (
    <Field label={label} hint={hint} error={error} advice={advice} dataKey={dataKey}>
      {({ id, describedBy, invalid }) =>
        multiline ? (
          <textarea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid || undefined} aria-required={required || undefined} placeholder={placeholder} />
        ) : (
          <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid || undefined} aria-required={required || undefined} placeholder={placeholder} />
        )
      }
    </Field>
  );
}

interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  error?: string | null;
  advice?: string | null;
  dataKey?: string;
}
export function SelectField<T extends string>({ label, value, options, onChange, error, advice, dataKey }: SelectProps<T>) {
  return (
    <Field label={label} error={error} advice={advice} dataKey={dataKey}>
      {({ id, describedBy, invalid }) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} aria-describedby={describedBy} aria-invalid={invalid || undefined}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}
