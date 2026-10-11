import { useRef } from 'react';
import { formatSize } from '../../core/format';
import type { Page } from './usePage';

interface Props { page: Page; primary: string; onDownloadIds: () => void }

/** The two inputs. Files can also be dropped anywhere on the page; these boxes are the visible places to press. */
export function FileBar({ page, primary, onDownloadIds }: Props) {
  const idsPicker = useRef<HTMLInputElement>(null);
  const ifcPicker = useRef<HTMLInputElement>(null);
  const cls = (id: string) => (primary === id ? 'btn small primary' : 'btn small');
  const has = page.doc !== null || page.source !== null;
  return (
    <div className="drops">
      <div className={`drop static${has ? ' has-file' : ''}${page.refusal ? ' invalid' : ''}`} role="group" aria-label="IDS file">
        <span className="drop-label">IDS file</span>
        <span className="drop-detail" id="ids-status">
          {page.opening ? `Opening ${page.opening}...`
            : has ? <><strong className="fname file-name">{page.name ?? 'Untitled.ids'}</strong>{page.source && page.asOpened ? <span className="fsize"> ({formatSize(page.source.size)})</span> : null}{page.dirty && <span className="unsaved">, unsaved changes</span>}</>
            : 'No file yet. Open one, start a new one, or drop it anywhere on this page.'}
        </span>
        <span className="drop-actions">
          <button type="button" className={cls('open')} onClick={() => idsPicker.current?.click()}>Open</button>
          <button type="button" className="btn small" onClick={page.startNew}>New</button>
          {page.doc && <button type="button" className={cls('download')} disabled={!!page.downloadBlocked} aria-describedby="ids-reason" onClick={onDownloadIds}>Download .ids</button>}
          {!has && <button type="button" className="btn small" onClick={page.tryExample}>Try an example</button>}
          {has && <button type="button" className="btn small quiet" onClick={page.closeAll}>{page.source?.example ? 'Clear the example' : 'Close'}</button>}
        </span>
        {page.source?.example && page.asOpened && <span className="drop-hint">This is the example that ships with idsbench, not a file of yours.</span>}
        <span className="drop-hint" id="ids-reason" role="status">{page.doc ? page.downloadBlocked : ''}</span>
        <input ref={idsPicker} type="file" accept=".ids,.xml" tabIndex={-1} aria-label="Choose an IDS file to open" className="file-input"
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) void page.addFiles(f, 'ids'); }} />
      </div>
      <div className={`drop static${page.model ? ' has-file' : ''}${page.run && 'error' in page.run ? ' invalid' : ''}`} role="group" aria-label="IFC model">
        <span className="drop-label">IFC model</span>
        <span className="drop-detail">
          {page.model ? <><strong className="fname">{page.model.name}</strong> <span className="fsize">({formatSize(page.model.size)})</span></>
            : 'Optional. Add a model to check it against the IDS file.'}
        </span>
        <span className="drop-actions">
          <button type="button" className={cls('model')} onClick={() => ifcPicker.current?.click()}>{page.model ? 'Choose another model' : 'Choose a model'}</button>
          {page.model && <button type="button" className="btn small quiet" onClick={() => page.setModel(null)}>Remove the model</button>}
        </span>
        <input ref={ifcPicker} type="file" accept=".ifc" tabIndex={-1} aria-label="Choose an IFC model" className="file-input"
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) void page.addFiles(f, 'ifc'); }} />
      </div>
    </div>
  );
}
