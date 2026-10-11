import { useState } from 'react';
import CodeEditor from './components/CodeEditor.jsx';
import OutputPane from './components/OutputPane.jsx';
import PhasesPanel from './components/PhasesPanel.jsx';
import { compileSource, runOnDb, resetDb } from './api.js';
import './App.css';

const DEFAULT_SOURCE = `GET /books -> FIND all IN library_db`;

export default function App() {
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [result, setResult] = useState(null);
  // idle | compiling | running | done | network-error
  const [status, setStatus] = useState('idle');
  const [tab, setTab] = useState('console'); // which bottom-panel tab is showing
  const [notice, setNotice] = useState(''); // small message next to the buttons

  const busy = status === 'compiling' || status === 'running';

  // Compiler only: the database is not involved.
  async function handleCompile() {
    setStatus('compiling');
    setNotice('');
    try {
      setResult(await compileSource(source));
      setStatus('done');
    } catch (err) {
      setResult(null);
      setStatus('network-error');
      console.error(err);
    }
  }

  // Compiler, then the SQL it produced is run on the database.
  async function handleRun() {
    setStatus('running');
    setNotice('');
    try {
      setResult(await runOnDb(source));
      setStatus('done');
      setTab('db'); // jump to the database results
    } catch (err) {
      setResult(null);
      setStatus('network-error');
      console.error(err);
    }
  }

  async function handleReset() {
    setNotice('');
    try {
      await resetDb();
      setNotice('Database reset to the sample data.');
    } catch (err) {
      setNotice(err.message);
    }
  }

  // Only a lexer/parser/semantic error carries a line number the editor
  // gutter can highlight — codegen errors (rare, e.g. an internal bug)
  // don't map to a source line.
  const errorLine = result?.errors?.find((e) => typeof e.line === 'number')?.line ?? null;

  return (
    <div className="app">
      <header className="app__topbar">
        <h1 className="app__title">OptiScript</h1>
        <div className="app__actions">
          {notice && <span className="app__notice">{notice}</span>}
          <button className="app__compile-btn" onClick={handleReset} disabled={busy} title="Reload db/schema.sql and db/data.sql">
            Reset DB
          </button>
          <button className="app__compile-btn" onClick={handleCompile} disabled={busy}>
            {status === 'compiling' ? 'Compiling…' : 'Compile'}
          </button>
          <button className="app__compile-btn" onClick={handleRun} disabled={busy} title="Compile, then run the generated SQL on the database">
            {status === 'running' ? 'Running…' : 'Run on DB'}
          </button>
        </div>
      </header>

      <main className="app__body">
        <section className="app__pane">
          <CodeEditor value={source} onChange={setSource} errorLine={errorLine} />
        </section>
        <section className="app__pane">
          <OutputPane
            expressCode={result?.expressCode ?? null}
            sqlCode={result?.sqlCode ?? null}
          />
        </section>
      </main>

      <PhasesPanel result={result} status={status} tab={tab} onTabChange={setTab} />
    </div>
  );
}
