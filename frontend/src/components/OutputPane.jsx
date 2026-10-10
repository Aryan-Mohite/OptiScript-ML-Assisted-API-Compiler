import { useState } from 'react';
import './OutputPane.css';

/**
 * Right pane per design.md: "Read-only text area displaying the
 * generated Express.js and MySQL code." Two tabs (Express / SQL)
 * rather than stacking both at once, since the Express code already
 * embeds each route's SQL string inline — showing SQL again below
 * would just be the same text twice.
 */
export default function OutputPane({ expressCode, sqlCode }) {
  const [tab, setTab] = useState('express');
  const hasOutput = expressCode !== null;

  return (
    <div className="output-pane">
      <div className="output-pane__tabs">
        <button
          className={`output-pane__tab${tab === 'express' ? ' output-pane__tab--active' : ''}`}
          onClick={() => setTab('express')}
        >
          Express.js
        </button>
        <button
          className={`output-pane__tab${tab === 'sql' ? ' output-pane__tab--active' : ''}`}
          onClick={() => setTab('sql')}
        >
          MySQL
        </button>
      </div>
      <div className="output-pane__body">
        {hasOutput ? (
          <pre className="output-pane__code">{tab === 'express' ? expressCode : sqlCode}</pre>
        ) : (
          <div className="output-pane__empty">Compile a script to see generated code here.</div>
        )}
      </div>
    </div>
  );
}
