import { useState } from 'react';
import { buildPhaseLines, statusLabel } from './consoleLines.js';
import './ConsolePanel.css';
import './PhasesPanel.css';

/**
 * Bottom panel that shows every compiler phase's output in its own tab,
 * so the demo/viva can SEE each stage instead of trusting it happened:
 *
 *   Console        - phase-by-phase log (what ConsolePanel used to show)
 *   Tokens         - Module 1  (lexer output)
 *   Parse Tree     - Module 2  (AST from the LL parser)
 *   Symbol Table   - Module 3  (routes, tables, fields)
 *   Quadruples     - Module 4  (intermediate code)
 *   Optimization   - Module 5  (before/after dead-code elimination)
 *   DB Result      - the compiler's SQL, run on the database, and what came back
 *
 * This component does no compiling — it only renders fields that
 * compile() already returned.
 */
const TABS = [
  { id: 'console', label: 'Console' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'tree', label: 'Parse Tree' },
  { id: 'symbols', label: 'Symbol Table' },
  { id: 'quads', label: 'Quadruples' },
  { id: 'optimized', label: 'Optimization' },
  { id: 'db', label: 'DB Result' },
];

// `tab` is controlled by App so "Run on DB" can jump straight to DB Result.
export default function PhasesPanel({ result, status, tab, onTabChange }) {
  const [open, setOpen] = useState(true);

  return (
    <div className={`console-panel${open ? '' : ' console-panel--collapsed'}`}>
      <div className="phases__bar">
        <div className="phases__tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`phases__tab${tab === t.id ? ' phases__tab--active' : ''}`}
              onClick={() => {
                onTabChange(t.id);
                setOpen(true);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button className="phases__toggle" onClick={() => setOpen((o) => !o)}>
          <span className="console-panel__status">{statusLabel(status, result)}</span>
          <span>{open ? '▾' : '▸'}</span>
        </button>
      </div>

      {open && (
        <div className="phases__body">
          {tab === 'console' && <ConsoleTab result={result} status={status} />}
          {tab === 'tokens' && <TokensTab result={result} />}
          {tab === 'tree' && <TreeTab result={result} />}
          {tab === 'symbols' && <SymbolsTab result={result} />}
          {tab === 'quads' && <QuadsTab result={result} />}
          {tab === 'optimized' && <OptimizedTab result={result} />}
          {tab === 'db' && <DbTab result={result} />}
        </div>
      )}
    </div>
  );
}

/* ---------------------------- small helpers ---------------------------- */

function Empty({ result, what }) {
  // If something failed earlier in the pipeline, say so; otherwise the
  // user simply hasn't compiled yet.
  if (!result) return <div className="phases__empty">Compile a script to see the {what}.</div>;
  return (
    <div className="phases__empty">
      No {what} — the pipeline stopped at an earlier phase (see the Console tab).
    </div>
  );
}

const quadKey = (q) => `${q.op}|${q.arg1}|${q.arg2}|${q.result}`;
const cell = (v) => (v === null || v === undefined ? '_' : String(v));

/* ------------------------------- tabs ---------------------------------- */

function ConsoleTab({ result, status }) {
  const lines = buildPhaseLines(result, status);
  if (lines.length === 0) {
    return <div className="phases__empty">Nothing compiled yet — write a script and hit Compile.</div>;
  }
  return lines.map((line, i) => (
    <div key={i} className={`console-panel__line console-panel__line--${line.kind}`}>
      {line.text}
    </div>
  ));
}

function TokensTab({ result }) {
  if (!result?.tokens) return <Empty result={result} what="tokens" />;
  // recoveryLog.position is the index of the token the parser corrected
  const fixed = new Map((result.recoveryLog || []).map((r) => [r.position, r.action]));
  return (
    <table className="phases__table">
      <thead>
        <tr><th>#</th><th>Type</th><th>Value</th><th>Line</th></tr>
      </thead>
      <tbody>
        {result.tokens.map((t, i) => (
          <tr key={i} className={fixed.has(i) ? 'phases__row--flag' : ''}>
            <td>{i}</td>
            <td>{t.type}</td>
            <td>{t.value === '' ? '' : String(t.value)}{fixed.has(i) ? (fixed.get(i) === 'insert' ? '   ← inserted by error recovery' : '   ← corrected by error recovery') : ''}</td>
            <td>{t.line}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TreeTab({ result }) {
  if (!result?.ast) return <Empty result={result} what="parse tree" />;
  return <TreeNode node={result.ast} label="" defaultOpen />;
}

/**
 * Generic recursive AST viewer. Objects with a `type` become nodes;
 * simple fields (method, table, ...) are shown inline on the node line,
 * object/array fields become collapsible children. Works for any AST
 * shape without hard-coding node types.
 */
function TreeNode({ node, label, defaultOpen = false }) {
  if (node === null || typeof node !== 'object') {
    return (
      <div className="tree__leaf">
        {label && <span className="tree__key">{label}: </span>}
        {String(node)}
      </div>
    );
  }

  const entries = Object.entries(node).filter(([k]) => k !== 'type');
  const simple = entries.filter(([, v]) => v === null || typeof v !== 'object');
  const nested = entries.filter(([, v]) => v !== null && typeof v === 'object');
  const title = Array.isArray(node) ? `[${node.length}]` : node.type || 'object';

  const summary = (
    <>
      {label && <span className="tree__key">{label}: </span>}
      <span className="tree__type">{title}</span>
      {!Array.isArray(node) &&
        simple.map(([k, v]) => (
          <span key={k} className="tree__attr">
            {' '}{k}={v === null ? 'null' : String(v)}
          </span>
        ))}
    </>
  );

  if (Array.isArray(node)) {
    return (
      <details className="tree__node" open={defaultOpen}>
        <summary>{summary}</summary>
        {node.map((child, i) => (
          <TreeNode key={i} node={child} label={String(i)} defaultOpen />
        ))}
      </details>
    );
  }

  if (nested.length === 0) {
    return <div className="tree__leaf">{summary}</div>;
  }

  return (
    <details className="tree__node" open={defaultOpen}>
      <summary>{summary}</summary>
      {nested.map(([k, v]) => (
        <TreeNode key={k} node={v} label={k} defaultOpen />
      ))}
    </details>
  );
}

function SymbolsTab({ result }) {
  const st = result?.symbolTable;
  if (!st) return <Empty result={result} what="symbol table" />;
  const warnings = st.warnings || [];
  return (
    <>
      <div className="phases__heading">Routes (scope: {st.scope})</div>
      <table className="phases__table">
        <thead><tr><th>Method</th><th>Path</th><th>Line</th></tr></thead>
        <tbody>
          {st.routes.map((r, i) => (
            <tr key={i}><td>{r.method}</td><td>{r.path}</td><td>{r.firstLine ?? r.line}</td></tr>
          ))}
        </tbody>
      </table>

      <div className="phases__heading">Tables &amp; fields</div>
      <table className="phases__table">
        <thead><tr><th>Table</th><th>Actions</th><th>Fields (type, uses)</th><th>First line</th></tr></thead>
        <tbody>
          {st.tables.map((t, i) => (
            <tr key={i}>
              <td>{t.name}</td>
              <td>{(t.actions || []).join(', ')}</td>
              <td>
                {t.fields && t.fields.length > 0
                  ? t.fields.map((f) => `${f.name} (${f.valueType}, ${f.uses})`).join(', ')
                  : '—'}
              </td>
              <td>{t.firstLine}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {warnings.length > 0 && (
        <>
          <div className="phases__heading">Warnings</div>
          {warnings.map((w, i) => (
            <div key={i} className="phases__note">{w}</div>
          ))}
        </>
      )}
    </>
  );
}

function QuadTable({ quads, removedKeys }) {
  return (
    <table className="phases__table">
      <thead>
        <tr><th>#</th><th>Operator</th><th>Arg1</th><th>Arg2</th><th>Result</th></tr>
      </thead>
      <tbody>
        {quads.map((q, i) => (
          <tr key={i} className={removedKeys && removedKeys.has(i) ? 'phases__row--flag' : ''}>
            <td>{i}</td><td>{q.op}</td><td>{cell(q.arg1)}</td><td>{cell(q.arg2)}</td><td>{cell(q.result)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function QuadsTab({ result }) {
  if (!result?.quadruples) return <Empty result={result} what="quadruples" />;
  return <QuadTable quads={result.quadruples} />;
}

function OptimizedTab({ result }) {
  if (!result?.optimizedQuadruples) return <Empty result={result} what="optimized code" />;

  const before = result.quadruples;
  const removed = result.removedQuadruples || [];

  // removed quadruples come back as plain copies (JSON), so match them
  // to rows in the "before" list by content.
  const pending = removed.map(quadKey);
  const removedIdx = new Set();
  before.forEach((q, i) => {
    const at = pending.indexOf(quadKey(q));
    if (at !== -1) {
      removedIdx.add(i);
      pending.splice(at, 1);
    }
  });

  return (
    <>
      <div className="phases__summary">
        {before.length} quadruple(s) before, {result.optimizedQuadruples.length} after —{' '}
        {removed.length === 0 ? 'no dead code found.' : `${removed.length} removed as dead code (highlighted).`}
        {result.basicBlocks ? ` Basic blocks: ${result.basicBlocks.length}.` : ''}
      </div>
      <div className="phases__split">
        <div>
          <div className="phases__heading">Before optimization</div>
          <QuadTable quads={before} removedKeys={removedIdx} />
        </div>
        <div>
          <div className="phases__heading">After dead-code elimination</div>
          <QuadTable quads={result.optimizedQuadruples} />
        </div>
      </div>
    </>
  );
}

/* ---------------------------- DB Result tab ---------------------------- */

function RowsTable({ rows }) {
  if (rows.length === 0) return <div className="phases__empty">0 rows</div>;
  const columns = Object.keys(rows[0]);
  return (
    <table className="phases__table phases__table--auto">
      <thead>
        <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>{columns.map((c) => <td key={c}>{cell(row[c])}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

// The compiler's output as the database will receive it: SQL + parameters.
function QueryHeader({ q }) {
  return (
    <>
      <div className="phases__heading">{q.method} {q.path}</div>
      <div className="phases__sql">
        {q.sql}
        {q.params.length > 0 && <span className="phases__params">   params: {JSON.stringify(q.params)}</span>}
      </div>
    </>
  );
}

function DbTab({ result }) {
  if (!result) return <div className="phases__empty">Write a script and click Run on DB.</div>;
  if (result.errors?.length > 0) {
    return <div className="phases__empty">The script did not compile, so nothing was sent to the database (see the Console tab).</div>;
  }
  if (result.dbError) return <div className="phases__error">{result.dbError}</div>;

  // Compiled with the Compile button: show what WOULD be sent.
  if (!result.dbResults) {
    return (
      <>
        <div className="phases__summary">
          Compiled only. This is what the compiler hands to the database; click Run on DB to run it.
        </div>
        {(result.queries || []).map((q, i) => <QueryHeader key={i} q={q} />)}
      </>
    );
  }

  return result.dbResults.map((r, i) => (
    <div key={i}>
      <QueryHeader q={r} />
      {r.status === 'error' && <div className="phases__error">{r.error}</div>}
      {r.status === 'skipped' && <div className="phases__note">{r.note}</div>}
      {r.status === 'ok' && r.kind === 'select' && (
        <>
          <div className="phases__summary">{r.rowCount} row(s)</div>
          <RowsTable rows={r.rows} />
        </>
      )}
      {r.status === 'ok' && r.kind === 'insert' && (
        <div className="phases__summary">{r.affectedRows} row inserted (id {r.insertId}). Run a GET to see it.</div>
      )}
    </div>
  ));
}
