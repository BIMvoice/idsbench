import { useState } from 'react';
import { Combo } from './Combo';
import { Field, TextField } from './fields';
import { modeOf, listOf, patternOf, rangeOf, lengthOf, switchMode, fromList, fromPattern, fromRange, fromLength, type ValueMode } from '../../core/ids/value';
import type { Value } from '../../core/ids/model';
import type { Option } from '../../core/picks';

interface Props {
  label: string;
  value: Value | null;
  onChange: (v: Value | null) => void;
  /** True when the value may be left out ("Any value"). */
  optional?: boolean;
  /** xs:base for a new restriction (a property's data type decides it). */
  base?: string;
  /** Names the standard defines for this field. With them the field is a pick-list; other text stays possible. */
  options?: Option[];
  customNote?: string;
  error?: string | null;
  advice?: string | null;
  dataKey?: string;
}

const MODES: { value: ValueMode; label: string }[] = [
  { value: 'exact', label: 'Exactly this' },
  { value: 'list', label: 'One of a list' },
  { value: 'pattern', label: 'Matches a pattern' },
  { value: 'range', label: 'A number range' },
  { value: 'length', label: 'A text length' },
];

/** One value of an item. The field itself comes first; beside it, the choice of how the value is compared. */
export function ValueField({ label, value, onChange, optional, base = 'xs:string', options = [], customNote, error, advice, dataKey }: Props) {
  // A rule with nothing filled in yet has no shape to read the choice from, so the choice just made is kept.
  const [picked, setPicked] = useState<ValueMode | null>(null);
  const mode = value?.kind === 'restriction' && value.facets.length === 0 && picked ? picked : modeOf(value);
  const restBase = value?.kind === 'restriction' && value.base ? value.base : base;
  const choices = [
    ...(optional ? [{ value: 'any' as ValueMode, label: 'Any value' }] : []),
    ...MODES,
    ...(mode === 'other' ? [{ value: 'other' as ValueMode, label: 'Combined rule (kept as in the file)' }] : []),
  ];
  const select = (visible: boolean) => (
    <Field label={visible ? label : `${label}: accepted values`}>
      {({ id }) => (
        <select id={id} value={mode} onChange={(e) => { const m = e.target.value as ValueMode; setPicked(m); onChange(switchMode(value, m, base)); }}>
          {choices.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
  return (
    <div className={`value-field${mode === 'any' ? ' any' : ''}`} data-key={dataKey} role="group" aria-label={label}>
      <div className="value-row">
        {mode !== 'any' && (
          <div className="value-inputs">
            {mode === 'exact' && value?.kind === 'simple' && (
              <Combo label={label} value={value.value} options={options} customNote={customNote} onChange={(v) => onChange({ kind: 'simple', value: v })} />
            )}
            {mode === 'list' && <ListInput label={label} value={value} base={restBase} onChange={onChange} />}
            {mode === 'pattern' && (
              <TextField label={`${label}: pattern`} value={patternOf(value)} hint="A dot is any one character, .* is anything. DT[0-9]{2} matches DT01 and DT02."
                onChange={(v) => onChange(fromPattern(v, restBase))} />
            )}
            {mode === 'range' && <RangeInput value={value} base={restBase} onChange={onChange} />}
            {mode === 'length' && <LengthInput value={value} base={restBase} onChange={onChange} />}
            {mode === 'other' && <p className="hint">{label}: this rule combines several conditions. It is kept as it is. Choose another kind to replace it.</p>}
          </div>
        )}
        <div className={mode === 'any' ? 'value-mode' : 'value-mode beside'}>{select(mode === 'any')}</div>
      </div>
      {error && <span className="msg error-msg">{error}</span>}
      {!error && advice && <span className="msg advice-msg">{advice}</span>}
    </div>
  );
}

/** One value per line. The text is held here so a new empty line can be typed before the next value. */
function ListInput({ label, value, base, onChange }: { label: string; value: Value | null; base: string; onChange: (v: Value) => void }) {
  const [text, setText] = useState(() => listOf(value).join('\n'));
  return (
    <TextField label={`${label}: values`} multiline hint="One value per line." value={text}
      onChange={(t) => { setText(t); onChange(fromList(t.split('\n').filter((l) => l.trim() !== ''), base)); }} />
  );
}

function RangeInput({ value, base, onChange }: { value: Value | null; base: string; onChange: (v: Value) => void }) {
  const r = rangeOf(value);
  const [s, setS] = useState({ lo: r.lower?.value ?? '', loEx: r.lower?.exclusive ?? false, hi: r.upper?.value ?? '', hiEx: r.upper?.exclusive ?? false });
  const push = (n: typeof s) => {
    setS(n);
    onChange(fromRange({ lower: n.lo.trim() !== '' ? { value: n.lo.trim(), exclusive: n.loEx } : null, upper: n.hi.trim() !== '' ? { value: n.hi.trim(), exclusive: n.hiEx } : null }, base));
  };
  return (
    <div className="range">
      <Field label="Lowest">
        {({ id }) => (
          <span className="pair">
            <select aria-label="Lowest: how to compare" value={s.loEx ? 'ex' : 'in'} onChange={(e) => push({ ...s, loEx: e.target.value === 'ex' })}>
              <option value="in">at least</option><option value="ex">more than</option>
            </select>
            <input id={id} type="text" inputMode="decimal" value={s.lo} onChange={(e) => push({ ...s, lo: e.target.value })} />
          </span>
        )}
      </Field>
      <Field label="Highest">
        {({ id }) => (
          <span className="pair">
            <select aria-label="Highest: how to compare" value={s.hiEx ? 'ex' : 'in'} onChange={(e) => push({ ...s, hiEx: e.target.value === 'ex' })}>
              <option value="in">at most</option><option value="ex">less than</option>
            </select>
            <input id={id} type="text" inputMode="decimal" value={s.hi} onChange={(e) => push({ ...s, hi: e.target.value })} />
          </span>
        )}
      </Field>
      <span className="hint range-hint">Leave one end empty for no limit.</span>
    </div>
  );
}

function LengthInput({ value, base, onChange }: { value: Value | null; base: string; onChange: (v: Value) => void }) {
  const l = lengthOf(value);
  const set = (k: 'exactly' | 'atLeast' | 'atMost') => (v: string) => onChange(fromLength({ ...l, [k]: v.trim() }, base));
  return (
    <div className="range">
      <TextField label="Exactly (characters)" value={l.exactly} onChange={set('exactly')} />
      <TextField label="At least (characters)" value={l.atLeast} onChange={set('atLeast')} />
      <TextField label="At most (characters)" value={l.atMost} onChange={set('atMost')} />
    </div>
  );
}
