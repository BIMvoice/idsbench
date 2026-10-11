import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { formatSize } from '../core/format';

interface Props {
  label: string;
  accept: string;
  file: File | null;
  onFile: (f: File | null) => void;
}

export function DropZone({ label, accept, file, onFile }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const id = useId();

  const pick = () => input.current?.click();
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div
      className={`drop${over ? ' over' : ''}${file ? ' has-file' : ''}`}
      role="button"
      tabIndex={0}
      aria-labelledby={`${id}-l`}
      aria-describedby={`${id}-d`}
      onClick={pick}
      onKeyDown={onKey}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <span className="drop-label" id={`${id}-l`}>{label}</span>
      <span className="drop-detail" id={`${id}-d`}>
        {file ? (
          <>
            <strong className="fname">{file.name}</strong> <span className="fsize">({formatSize(file.size)})</span>
          </>
        ) : (
          'Drop a file here, or press to choose one.'
        )}
      </span>
      {file && <span className="drop-hint">Press to choose another file.</span>}
      <input
        ref={input}
        type="file"
        accept={accept}
        tabIndex={-1}
        aria-hidden="true"
        className="file-input"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          onFile(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
    </div>
  );
}
