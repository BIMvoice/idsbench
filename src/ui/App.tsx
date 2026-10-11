import { useRef, useState, type KeyboardEvent } from 'react';
import { RunTab } from './RunTab';

const TABS = [
  { id: 'write', label: 'Write' },
  { id: 'check', label: 'Check' },
  { id: 'run', label: 'Run' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function App() {
  const [tab, setTab] = useState<TabId>('run');
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
          <h2>Write</h2>
          <p>Not built yet. This tab will let you create and edit an IDS file with plain forms.</p>
        </section>
        <section role="tabpanel" id="panel-check" aria-labelledby="tab-check" hidden={tab !== 'check'}>
          <h2>Check</h2>
          <p>Not built yet. This tab will tell you whether an IDS file is itself valid.</p>
        </section>
        <section role="tabpanel" id="panel-run" aria-labelledby="tab-run" hidden={tab !== 'run'}>
          <RunTab />
        </section>
      </main>

      <footer className="foot">Runs in your browser. Your files are not uploaded.</footer>
    </div>
  );
}
