import { useState } from 'react';
import { buildPhaseLines, statusLabel } from './consoleLines.js';
import './ConsolePanel.css';

/**
 * Bottom console per design.md: "collapsible terminal window displaying
 * compilation phases (Lexing, Parsing, Optimization) and ML error
 * recovery suggestions in plain, unformatted text." Everything here is
 * DERIVED from the compile() result already returned by the backend —
 * this component does no compiling itself, just narrates what
 * happened, phase by phase.
 *
 * The muted red (--error, #F87171) is used sparingly, per design.md,
 * only for: hard errors, and ML/heuristic recovery lines (so a
 * successful-but-corrected compile still visibly flags that a fix was
 * applied, without looking like a full error).
 */
export default function ConsolePanel({ result, status }) {
  const [open, setOpen] = useState(true);

  const lines = buildPhaseLines(result, status);

  return (
    <div className={`console-panel${open ? '' : ' console-panel--collapsed'}`}>
      <button className="console-panel__header" onClick={() => setOpen((o) => !o)}>
        <span>{open ? '▾' : '▸'} Console</span>
        <span className="console-panel__status">{statusLabel(status, result)}</span>
      </button>
      {open && (
        <div className="console-panel__body">
          {lines.length === 0 ? (
            <div className="console-panel__line console-panel__line--muted">
              Nothing compiled yet — write a script and hit Compile.
            </div>
          ) : (
            lines.map((line, i) => (
              <div key={i} className={`console-panel__line console-panel__line--${line.kind}`}>
                {line.text}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
