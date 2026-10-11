import { subtypeAction, type SubtypeNote } from '../../core/subtypes';

/** One calm line: this class is exactly this class, and what it leaves out (or: this class is abstract and matches nothing); with the action that adds what it leaves out as a list, when there is something to add. */
export function SubtypeLine({ note, onAdd }: { note: SubtypeNote; onAdd?: () => void }) {
  const action = subtypeAction(note);
  return (
    <p className="note subtype-note">
      {note.text}{' '}
      {onAdd && action && <button type="button" className="btn small" onClick={onAdd}>{action}</button>}
    </p>
  );
}
