import { useRef } from 'react';
import './CodeEditor.css';

/**
 * A plain line-numbered <textarea> — design.md calls for a simple
 * "line-numbered text area for writing the OptiScript DSL", not a full
 * syntax-highlighting editor (that'd be over-engineering a compiler
 * class project's frontend). The line-number gutter scrolls in sync
 * with the textarea via a shared scrollTop.
 */
export default function CodeEditor({ value, onChange, errorLine }) {
  const gutterRef = useRef(null);
  const lineCount = value.split('\n').length;

  function syncScroll(e) {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.target.scrollTop;
    }
  }

  return (
    <div className="code-editor">
      <div className="code-editor__gutter" ref={gutterRef}>
        {Array.from({ length: lineCount }, (_, i) => {
          const n = i + 1;
          const isErrorLine = errorLine === n;
          return (
            <div key={n} className={`code-editor__line-number${isErrorLine ? ' code-editor__line-number--error' : ''}`}>
              {n}
            </div>
          );
        })}
      </div>
      <textarea
        className="code-editor__textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        spellCheck={false}
        placeholder="GET /books -> FIND all IN library_db"
      />
    </div>
  );
}
