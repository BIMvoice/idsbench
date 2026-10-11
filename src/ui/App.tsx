import { useRef, useState, type KeyboardEvent } from 'react';
import { CheckTab } from './CheckTab';
import { RunTab, type Incoming } from './RunTab';
import { WriteTab } from './write/WriteTab';

const TABS = [
  { id: 'write', label: 'Write' },
  { id: 'check', label: 'Check' },
  { id: 'run', label: 'Run' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function App() {
  const [tab, setTab] = useState<TabId>('run');
  // The IDS file shown in Check. Run hands its own file over when it refuses it.
  const [checkFile, setCheckFile] = useState<File | null>(null);
  // An IDS handed over from Write: Run takes it as if the file had been chosen.
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKey = (e: KeyboardEvent, i: number) => {
    let n = i;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') n = (i + TABS.length - 1) % TABS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = TABS.length - 1;
    else return;
    e.preventDefault();
    setTab(TABS[n].id);
    refs.current[TABS[n].id]?.focus();
  };

  return (
    <div className="page">
      <header className="top">
        <h1 className="brand">idsbench</h1>
        <div role="tablist" aria-label="Sections" className="tabs">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => { refs.current[t.id] = el; }}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className="tab"
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main>
        <section role="tabpanel" id="panel-write" aria-labelledby="tab-write" hidden={tab !== 'write'}>
          <WriteTab
            onUseInRun={(file) => { setIncoming((p) => ({ file, token: (p?.token ?? 0) + 1 })); setTab('run'); }}
            onShowInCheck={(f) => { setCheckFile(f); setTab('check'); refs.current.check?.focus(); }}
          />
        </section>
        <section role="tabpanel" id="panel-check" aria-labelledby="tab-check" hidden={tab !== 'check'}>
          <CheckTab file={checkFile} onFile={setCheckFile} />
        </section>
        <section role="tabpanel" id="panel-run" aria-labelledby="tab-run" hidden={tab !== 'run'}>
          <RunTab incoming={incoming} onShowInCheck={(f) => { setCheckFile(f); setTab('check'); refs.current.check?.focus(); }} />
        </section>
      </main>

      <footer className="foot">Runs in your browser. Your files are not uploaded.</footer>
    </div>
  );
}
