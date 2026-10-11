import { subtypeAction, type SubtypeNote } from '../../core/subtypes';

/** One calm line: this class is exactly this class, and what it leaves out; with the action that adds what it leaves out as a list. */
export function SubtypeLine({ note, onAdd }: { note: SubtypeNote; onAdd?: () => void }) {
  return (
    <p className="note subtype-note">
      {note.text}{' '}
      {onAdd && <button type="button" className="btn small" onClick={onAdd}>{subtypeAction(note)}</button>}
    </p>
  );
}
