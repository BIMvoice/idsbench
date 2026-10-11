import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { exactOption, filterOptions, type Option } from '../../core/picks';

interface Props {
  label: string;
  /** The value as it is written in the IDS file. */
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  hint?: string;
  error?: string | null;
  advice?: string | null;
  dataKey?: string;
  /** Said under the field when the text is not one of the options. */
  customNote?: string;
}

/**
 * A pick-list with type-ahead (the ARIA combobox pattern with a list popup). Choosing an option writes its technical
 * form; text that names no option is kept as typed, so a custom name stays possible.
 */
export function Combo({ label, value, options, onChange, hint, error, advice, dataKey, customNote }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState<string | null>(null); // null: not being edited, show the value
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const chosen = options.find((o) => o.value === value) ?? null;
  const shown = text ?? (chosen ? chosen.label : value);
  const matches = open ? filterOptions(options, text ?? '') : [];
  const expanded = open && matches.length > 0;
  const custom = value !== '' && options.length > 0 && !chosen && text === null;
  const message = error ?? advice ?? (custom ? customNote : null) ?? null;

  const pick = (o: Option) => { onChange(o.value); setText(null); setOpen(false); };
  const commit = () => {
    if (text !== null) {
      const exact = exactOption(options, text);
      onChange(exact ? exact.value : text.trim());
    }
    setText(null);
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); setActive(0); return; }
      const n = matches.length;
      if (n) setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : (a + n - 1) % n));
    } else if (e.key === 'Enter') {
      if (expanded && matches[active]) { e.preventDefault(); pick(matches[active]); }
      else commit();
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); setOpen(false); setText(null); }
    }
  };
  return (
    <div className="field combo" data-key={dataKey}>
      <label htmlFor={id} className="field-label">{label}</label>
      <input
        ref={input} id={id} type="text" role="combobox" autoComplete="off" spellCheck={false}
        aria-expanded={expanded} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={expanded ? `${id}-o${active}` : undefined}
        aria-invalid={error ? true : undefined} aria-describedby={message || hint ? `${id}-msg` : undefined}
        value={shown}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          // Free text (no list to pick from) is taken as it is typed; with a list, on choosing or on leaving the field.
          setText(e.target.value); setOpen(true); setActive(0);
          if (options.length === 0) onChange(e.target.value);
        }}
        onClick={() => { if (options.length) setOpen(true); }}
        onKeyDown={onKey}
        onBlur={commit}
      />
      <ul id={listId} role="listbox" aria-label={label} className="combo-list" hidden={!expanded}>
        {matches.map((o, i) => (
          <li key={o.value} id={`${id}-o${i}`} role="option" aria-selected={i === active} className={i === active ? 'combo-option active' : 'combo-option'}
            onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setActive(i)}>
            {o.label}
          </li>
        ))}
      </ul>
      <span id={`${id}-msg`} className={error ? 'msg error-msg' : message ? 'msg advice-msg' : 'hint'}>{message ?? hint ?? ''}</span>
    </div>
  );
}
