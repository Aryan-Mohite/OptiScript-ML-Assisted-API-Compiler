# Week 4 — Wiring `mlRecovery.js` into `parser.js`

## Files added
- `parser/mlRecovery.js` — the interceptor (self-contained, no other module depends on your parser internals)
- `parser/mlRecovery.test.js` — standalone test suite (`node parser/mlRecovery.test.js`)

## What to change in `parser.js`
Your Week 2/3 parser almost certainly has a helper like `expect(tokenType)` or
`match(tokenType)` that either consumes the current token or throws a
`ParserError`. That's the ONE place this plugs into.

1. Make that helper `async` (and update its callers to `await` it — since
   parsing is recursive descent, this just means every `parseX()` function
   that calls `expect`/`match` also becomes `async`, and `compile()` calls
   `await parser.parse(...)`).

2. At the point where it's about to throw, try recovery first:

```js
const { attemptRecovery } = require('./mlRecovery');

async expect(expectedType, expectedValue) {
  const current = this.tokens[this.pos];

  if (current && current.type === expectedType &&
      (expectedValue === undefined || current.value === expectedValue)) {
    this.pos++;
    return current;
  }

  // --- ML-powered recovery interceptor ---
  const recovery = await attemptRecovery({
    badToken: current || null,
    expected: expectedValue ? `${expectedType} (${expectedValue})` : expectedType,
    contextTokens: this.tokens.slice(Math.max(0, this.pos - 2), this.pos + 2),
    line: current ? current.line : this.tokens[this.pos - 1]?.line ?? -1,
  });

  if (recovery.corrected) {
    // Splice the corrected token in place of the bad one and retry
    const fixedToken = { type: recovery.type, value: recovery.value, line: current?.line };
    if (current) {
      this.tokens[this.pos] = fixedToken;
    } else {
      this.tokens.push(fixedToken); // recovering a missing token at EOF
    }
    this.recoveryLog = this.recoveryLog || [];
    this.recoveryLog.push({ ...recovery, position: this.pos });
    return this.expect(expectedType, expectedValue); // retry, now against the patched stream
  }

  // --- required fallback (rules.md): normal typed error, never a crash ---
  throw new ParserError(
    `Expected ${expectedType}${expectedValue ? ` "${expectedValue}"` : ''} but found "${current?.value ?? 'EOF'}"`,
    current?.line ?? -1
  );
}
```

3. Expose `parser.recoveryLog` on the result object your `compile()` pipeline
   returns, so Week 8's React console panel can show "ML fixed `GRT` → `GET`
   on line 1" distinctly (per `design.md`, using the muted red `#F87171`
   sparingly).

## Running it
```bash
# No API key needed — exercises the offline heuristic fallback
node parser/mlRecovery.test.js

# To test the real ML path, set a key first:
export ANTHROPIC_API_KEY=sk-ant-...
node parser/mlRecovery.test.js   # heuristic tests still pass; try it manually via attemptRecovery()
```

Add to `package.json`:
```json
"scripts": {
  "test:mlrecovery": "node parser/mlRecovery.test.js"
}
```

## For your `memory.md` (repo root)
```
### Week 4 — ML-Powered Error Recovery (done)
- Built `parser/mlRecovery.js`: interceptor that packages the bad token +
  surrounding context + expected grammar rule into a strict JSON-only
  prompt to Claude (claude-3-5-haiku), with a 6s timeout.
- Never throws — always resolves {corrected, type?, value?, source}.
  source is 'ml' | 'heuristic' | 'none'.
- Added offline fallback: Levenshtein edit-distance match against known
  keywords/symbols (accepts only distance <= 2), so recovery still works
  with no API key / no network — good for demo reliability.
- Required fallback per rules.md confirmed: on any ML failure, timeout,
  or unparseable response, corrected=false and parser throws its normal
  ParserError — no crash.
- 9/9 tests passing in mlRecovery.test.js (all exercise the offline path
  by design, so the suite is deterministic).
- Open TODO for Week 4 wiring: patch parser.js's expect()/match() helper
  per docs/week4-integration.md, make it async, expose recoveryLog on the
  compile() result for the Week 8 console panel.
```

## Open design question resolved
Per your existing decision: recovery is scoped to `ParserError` (syntax)
cases only — `mlRecovery.js` has no dependency on `SymbolTable`, so
semantic errors (e.g. duplicate route) still fail immediately as before.
