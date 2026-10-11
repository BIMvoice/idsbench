import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { exactOption, filterOptions, type Option } from '../../core/picks';
import { FILL_IN } from '../../core/ids/check';

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
  /** Names only some of the ticked IFC versions define: offered after the rest, each with its versions. */
  extraOptions?: Option[];
  /** Said under the field while text is being typed that is not one of the options: given the text and how many options it finds. */
  typedNote?: (text: string, found: number) => string | null;
  /** Told the text being typed (null when the field is not being edited), so that the message around the field can follow it. */
  onDraft?: (text: string | null) => void;
}

const versionLabel = (o: Option) => (o.onlyIn ? `${o.label} (only ${o.onlyIn.join(', ')})` : o.label);

/**
 * A pick-list with type-ahead (the ARIA combobox pattern with a list popup). Choosing an option writes its technical
 * form; text that names no option is kept as typed, so a custom name stays possible.
 */
export function Combo({ label, value, options, onChange, hint, error, advice, dataKey, customNote, extraOptions = [], typedNote, onDraft }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState<string | null>(null); // null: not being edited, show the value
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const chosen = options.find((o) => o.value === value) ?? extraOptions.find((o) => o.value === value) ?? null;
  const shown = text ?? (chosen ? (chosen.onlyIn ? chosen.value : chosen.label) : value);
  const typed = (text ?? '').trim();
  const matches = open ? [...filterOptions(options, text ?? ''), ...filterOptions(extraOptions, text ?? '', 20)].slice(0, 50) : [];
  const found = typed ? filterOptions(options, typed).length + filterOptions(extraOptions, typed).length : 0;
  useEffect(() => { onDraft?.(text); }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  const expanded = open && matches.length > 0;
  const custom = value !== '' && options.length > 0 && !chosen && text === null;
  // A field with text in it never says "Fill this in": the text is not taken into the file until the field is left, but it is there.
  const shownError = error === FILL_IN && typed ? null : error;
  const typedMessage = typed && typedNote && !exactOption(options, typed) ? typedNote(typed, found) : null;
  const message = shownError ?? advice ?? typedMessage ?? (custom ? customNote : null) ?? null;

  // The list of a pick-list is loaded when the form opens, and a quick typist is there first: what is typed before the
  // list has arrived is taken as it is. When the list arrives, text typed here that names one of its options (a plain
  // name, "wall") becomes that option, as it would have had the list been there. Only text typed in this field, never
  // a value that came from the file.
  const typedEarly = useRef<string | null>(null);
  useEffect(() => {
    const early = typedEarly.current;
    if (options.length === 0 || early === null) return;
    typedEarly.current = null;
    if (early.trim() !== value && early !== value) return;
    const exact = exactOption(options, early);
    if (exact && exact.value !== value) onChange(exact.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const pick = (o: Option) => { onChange(o.value); setText(null); setOpen(false); };
  const commit = () => {
    if (text !== null) {
      const exact = exactOption(options, text);
      if (options.length === 0) typedEarly.current = text;
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
        aria-invalid={shownError ? true : undefined} aria-describedby={message || hint ? `${id}-msg` : undefined}
        value={shown}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          // Free text (no list to pick from) is taken as it is typed; with a list, on choosing or on leaving the field.
          setText(e.target.value); setOpen(true); setActive(0);
          if (options.length === 0) { typedEarly.current = e.target.value; onChange(e.target.value); }
        }}
        onClick={() => { if (options.length) setOpen(true); }}
        onKeyDown={onKey}
        onBlur={commit}
      />
      <ul id={listId} role="listbox" aria-label={label} className="combo-list" hidden={!expanded}>
        {matches.map((o, i) => (
          <li key={o.value} id={`${id}-o${i}`} role="option" aria-selected={i === active} className={i === active ? 'combo-option active' : 'combo-option'}
            onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setActive(i)}>
            {versionLabel(o)}
            {o.meaning && <span className="combo-meaning">{o.meaning}</span>}
          </li>
        ))}
      </ul>
      <span id={`${id}-msg`} className={shownError ? 'msg error-msg' : message ? 'msg advice-msg' : 'hint'}>{message ?? hint ?? ''}</span>
    </div>
  );
}
