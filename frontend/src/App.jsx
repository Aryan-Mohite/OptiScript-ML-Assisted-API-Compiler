import { useState } from 'react';
import CodeEditor from './components/CodeEditor.jsx';
import OutputPane from './components/OutputPane.jsx';
import PhasesPanel from './components/PhasesPanel.jsx';
import { compileSource } from './api.js';
import './App.css';

const DEFAULT_SOURCE = `GET /books -> FIND all IN library_db`;

export default function App() {
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | compiling | done | network-error

  async function handleCompile() {
    setStatus('compiling');
    try {
      const data = await compileSource(source);
      setResult(data);
      setStatus('done');
    } catch (err) {
      setResult(null);
      setStatus('network-error');
      console.error(err);
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
        <button className="app__compile-btn" onClick={handleCompile} disabled={status === 'compiling'}>
          {status === 'compiling' ? 'Compiling…' : 'Compile'}
        </button>
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

      <PhasesPanel result={result} status={status} />
    </div>
  );
}
