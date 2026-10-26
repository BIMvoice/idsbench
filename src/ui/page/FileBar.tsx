/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useRef, useState } from 'react';
import { fetchExampleFile, fetchExampleList, type ExampleEntry } from '../../core/examples';
import { formatSize } from '../../core/format';
import type { Page } from './usePage';

interface Props { page: Page; primary: string; onDownloadIds: () => void }

/** The two inputs. Files can also be dropped anywhere on the page; these boxes are the visible places to press. */
export function FileBar({ page, primary, onDownloadIds }: Props) {
  const idsPicker = useRef<HTMLInputElement>(null);
  const ifcPicker = useRef<HTMLInputElement>(null);
  const earlierPicker = useRef<HTMLInputElement>(null);
  const cls = (id: string) => (primary === id ? 'btn small primary' : 'btn small');
  const has = page.doc !== null || page.source !== null;
  // The Example menu: null while closed; the list is fetched from the page's own origin when it is first opened.
  const [menu, setMenu] = useState<{ list: ExampleEntry[] | null; problem: string | null } | null>(null);
  const toggleExamples = () => {
    if (menu) { setMenu(null); return; }
    setMenu({ list: null, problem: null });
    fetchExampleList().then((list) => setMenu({ list, problem: null }), () => setMenu({ list: null, problem: 'The examples could not be loaded.' }));
  };
  const chooseExample = async (entry: ExampleEntry) => {
    try {
      const file = await fetchExampleFile(entry);
      setMenu(null);
      await page.openIds(file);
    } catch { setMenu({ list: menu?.list ?? null, problem: 'That example could not be loaded.' }); }
  };
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
          <button type="button" className="btn small" aria-expanded={!!menu} aria-controls="example-menu" onClick={toggleExamples}>Example</button>
          {page.doc && <button type="button" className={cls('download')} disabled={!!page.downloadBlocked} aria-describedby="ids-reason" onClick={onDownloadIds}>Download .ids</button>}
          {!has && <button type="button" className="btn small" onClick={page.tryExample}>Try an example</button>}
          {has && <button type="button" className="btn small quiet" onClick={page.closeAll}>{page.source?.example ? 'Clear the example' : 'Close'}</button>}
        </span>
        {menu && (
          <div className="example-menu" id="example-menu" role="group" aria-label="Examples">
            {menu.list === null && !menu.problem && <span className="drop-hint" role="status">Loading the examples...</span>}
            {menu.problem && <span className="drop-hint" role="alert">{menu.problem}</span>}
            {menu.list?.map((e) => (
              <div className="example-item" key={e.file}>
                <button type="button" className="btn small" onClick={() => void chooseExample(e)}>{e.title}</button>
                <span className="drop-hint">{e.description}</span>
              </div>
            ))}
          </div>
        )}
        {page.source?.example && page.asOpened && <span className="drop-hint">This is the example that ships with idsbench, not a file of yours.</span>}
        <span className="drop-hint" id="ids-reason" role="status">{page.doc ? page.downloadBlocked : ''}</span>
        {page.saveNote && <span className="drop-hint" id="save-note">{page.saveNote}</span>}
        {page.source?.encoding && <span className="drop-hint" id="encoding-note">This file is written in {page.source.encoding}. If you change it here, it is saved as UTF-8.</span>}
        {page.dirty && !page.draftKept && <span className="drop-hint" id="draft-note">These unsaved changes are too large to keep in this tab: they are lost if the page is loaded again. Download .ids to keep them.</span>}
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
        {page.model && (
          <span className="drop-hint earlier" id="earlier-status">
            {page.earlier
              ? <>Compared with the earlier delivery <strong className="fname">{page.earlier.name}</strong> <span className="fsize">({formatSize(page.earlier.size)})</span>.{' '}</>
              : 'Received a new version of this model? Compare it with the one delivered before. '}
            <span className="drop-actions">
              <button type="button" className="btn small" onClick={() => earlierPicker.current?.click()}>{page.earlier ? 'Choose another earlier delivery' : 'Compare with an earlier delivery'}</button>
              {page.earlier && <button type="button" className="btn small quiet" onClick={page.removeEarlier}>Remove the earlier delivery</button>}
            </span>
          </span>
        )}
        {page.earlierRefusal && <span className="drop-hint" role="alert" id="earlier-refusal">{page.earlierRefusal}</span>}
        <input ref={ifcPicker} type="file" accept=".ifc" tabIndex={-1} aria-label="Choose an IFC model" className="file-input"
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) void page.addFiles(f, 'ifc'); }} />
        <input ref={earlierPicker} type="file" accept=".ifc" tabIndex={-1} aria-label="Choose the earlier delivery of the model" className="file-input"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void page.chooseEarlier(f); }} />
      </div>
    </div>
  );
}
