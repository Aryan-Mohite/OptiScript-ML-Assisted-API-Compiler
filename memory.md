# OptiScript — Project Memory Log

Running log of what's been built, key decisions, and TODOs. Add a new
dated entry after every milestone that works.

---

## 2026-08-24 — Week 1 Complete: DSL Design + Lexer (Module 1)

**Built:**
- `docs/grammar.md` — finalized token-level grammar for OptiScript v1
  (keywords, symbols, literals, comments).
- `lexer/lexer.js` — hand-coded character-by-character lexer (`Lexer`
  class + `tokenize()` helper). No regex-based shortcuts, satisfies
  rules.md "hand-coded lexer" requirement.
- `lexer/test-lexer.js` — manual test runner, 10 sample DSL snippets
  (8 valid + 2 intentionally broken), prints token arrays.

**Key decisions:**
- Keywords are case-sensitive and matched exactly (`GET`, `POST`, `FIND`,
  `all`, `IN`, `WHERE`, `INSERT`, `INTO`). Anything else alphabetic lexes
  as `IDENTIFIER`. Chosen to keep the lexer simple — no case-folding.
- Numbers are integers only for v1 (no decimals/floats) — DSL doesn't
  need them yet (route params, WHERE id = 1, etc.).
- Comments use `#` to end-of-line and are discarded entirely (not
  emitted as tokens).
- Every token is `{ type, value, line }`. A final `EOF` token is always
  appended so the Week 2 parser knows when the stream ends.
- Lexer throws a typed `LexerError` (with line/column) on: unrecognized
  characters, and unterminated string literals. This matches rules.md's
  "all errors must be strictly typed" requirement even at the lexer
  stage.
- `(` and `)` (`LPAREN`/`RPAREN`) are tokenized now but not used by any
  grammar rule yet — reserved for potential function-style syntax later.
  Not a problem, just noting it so Week 2 doesn't get confused about
  where they're used.

**Verified:** `node lexer/test-lexer.js` runs clean — all 8 valid samples
produce correct token streams, both broken samples throw the expected
`LexerError` with sensible messages instead of crashing.

**Status:** Week 1 deliverable complete and matches phases.md /
OptiScript_2Month_Plan.md target ("lexer.js + grammar.md + test file
with passing token output").

**Next (Week 2):** Write the CFG in BNF, implement `parser.js` as a
recursive-descent predictive (LL) parser, build a minimal AST node
structure, get it parsing 1–2 valid inputs into an AST.

**TODO / open questions for later weeks:**
- Multi-segment paths (`/order_items/1024`) currently lex fine as
  `SLASH IDENTIFIER SLASH NUMBER` — parser will need to decide how to
  group these into a single "path" AST node.
- No semicolons/statement terminators in v1 — if multi-statement
  programs cause parser ambiguity in Week 2, may need to revisit
  (e.g. require newline-as-terminator or add explicit `;`).

---

## 2026-08-24 — Week 2 Complete: CFG + Recursive-Descent Parser + AST (Module 2)

**Built:**
- `docs/cfg.md` — formal BNF grammar (`<program>`, `<routeStatement>`,
  `<method>`, `<path>`, `<pathSegment>`, `<action>`, `<findAction>`,
  `<insertAction>`, `<whereClause>`), plus a left-recursion/ambiguity
  check written out for viva purposes.
- `parser/parser.js` — hand-written recursive-descent **predictive (LL)**
  parser. One function per grammar rule (`parseProgram`, `parseStatement`,
  `parseRouteStatement`, `parseMethod`, `parsePath`, `parsePathSegment`,
  `parseAction`, `parseFindAction`, `parseInsertAction`,
  `parseWhereClause`). No ANTLR / parser generators, per rules.md.
- `parser/test-parser.js` — 8 samples (5 valid covering every grammar
  rule including multi-statement programs and multi-segment paths, 3
  intentionally broken) printing the AST / errors.

**Key decisions:**
- AST nodes are plain JS objects (`{ type, ...fields, line }`) per
  phases.md — no class hierarchy, keeps it simple for a DSL this small.
- The old "multi-segment path" open question from Week 1 is resolved:
  `<path> ::= (SLASH pathSegment)+`, so `/order_items/1024` becomes a
  single `Path` node with `segments: ["order_items", "1024"]` — one node,
  not nested per-segment nodes. Confirmed working in Sample 5.
- `<action>` dispatch (`FIND` vs `INSERT`) is a straightforward LL(1)
  lookahead — peek one token, no backtracking needed anywhere in the
  grammar. Documented in cfg.md for the viva.
- `whereClause` is optional everywhere it's used; parser just peeks for
  the `WHERE` keyword before deciding whether to call
  `parseWhereClause()`.
- Parser throws a typed `ParserError` (message + line number) on any
  unexpected token, mirroring the `LexerError` pattern from Week 1 —
  keeps error handling consistent across phases per rules.md. Not doing
  ML-based recovery yet — that's Week 4; right now it just throws.
- Old Week 1 open question about statement separation is resolved: since
  every `RouteStatement` always ends with either `IN table`, `INTO
  table`, or a WHERE clause, and every new statement always starts with
  `GET`/`POST`, there's no ambiguity — no semicolons/newlines needed as
  terminators. Confirmed with Sample 4 (two back-to-back statements).

**Verified:** `node parser/test-parser.js` runs clean — all 5 valid
samples produce correct, fully-shaped ASTs; all 3 broken samples throw
the expected `ParserError` with a clear line number and message instead
of crashing.

**Status:** Week 2 deliverable complete and matches
OptiScript_2Month_Plan.md target ("parser.js producing an AST for valid
OptiScript input").

**Next (Week 3):** Extend parser/tests to 10+ programs (valid + broken),
build `symbolTable.js` to track endpoint names / DB tables / variable
scope, and wire it into the parser so it populates during parsing.

**TODO / open questions for later weeks:**
- `(` / `)` (`LPAREN`/`RPAREN`) tokens still unused by any grammar rule —
  still just reserved, not a problem.
- Symbol table (Week 3) will need to decide: do route paths themselves
  need entries (e.g. to catch duplicate `GET /books` definitions), or
  just table/column names? Flag this as a design decision to make at the
  start of Week 3.

---

## 2026-08-26 — Week 3 Complete: Symbol Table + Full Parser Wiring (Module 3)

**Built:**
- `semantic/symbolTable.js` — `SymbolTable` class + typed `SymbolTableError`,
  same error pattern as `LexerError`/`ParserError`. Tracks three kinds of
  symbols, all within one global `scope` (OptiScript v1 has no nested
  blocks/user variables, so a single scope is correct and simplest):
  1. **Routes** — `"METHOD /path"` → `{ method, path, line }`. Throws
     `SymbolTableError` on an exact duplicate route definition.
  2. **Tables** — `tableName` → `{ name, firstLine, actions: Set, fields: Map }`.
     Never throws on reuse — the same table legitimately gets hit by
     multiple routes (e.g. `GET /books` and `POST /books` both using
     `library_db`), so `actions` just accumulates `'FIND'`/`'INSERT'`.
  3. **Fields** — WHERE-clause columns, scoped *per table* (a `Map` inside
     each table entry, not a flat global map) since the same field name
     could mean different things on different tables.
  - `declareField()` does NOT throw if the same field is later used with a
    different literal type (e.g. `WHERE id = 1` then `WHERE id = "abc"`);
    it records a soft warning in `symbolTable.warnings` instead. Chosen
    over a hard error because DSL v1 has no declared column types to check
    against — flagging it as a warning is honest (something to know about)
    without being overly strict for a Week 3 scope.
  - `toJSON()` gives a plain-object summary for tests / the future Week 8
    console panel.
- `parser/parser.js` **updated** — `Parser` constructor now takes an
  optional `symbolTable` (creates its own `SymbolTable` if omitted, so old
  standalone parser usage still works). Wired in at the natural points:
  - `parseRouteStatement()` calls `symbolTable.declareRoute()` right after
    the path is parsed (before the action) — this is also where a
    duplicate-route error will surface.
  - `parseFindAction()` / `parseInsertAction()` call `declareTable()`.
  - `parseWhereClause(tableName)` — now takes the table name as a param
    (passed by the two action parsers) and calls `declareField()`.
  - **Breaking change from Week 2:** `parse(tokens)` now returns
    `{ ast, symbolTable }` instead of just the AST, since the table is
    built as a side effect of the same parse pass (per the plan: "wire it
    into the parser so it fills up during parsing", not a separate pass).
    `parser/test-parser.js` updated to destructure `{ ast }`.
- `semantic/test-symbolTable.js` — 10 samples: 6 valid (single route,
  WHERE with string, a table shared across GET+POST, multiple
  distinct tables, consistent field reuse, and a field type-conflict
  case showing the soft warning) + 4 broken (2 existing parser-level
  errors re-verified through the new return shape, 2 new
  `SymbolTableError` cases for duplicate routes — one single-segment,
  one multi-segment path, to confirm the path-join used for the route
  key handles segments correctly).

**Key decisions:**
- **Resolved Week 2's open question:** route paths DO get their own
  symbol table entries (not just tables/columns) — duplicate
  `GET /books` definitions are a real semantic bug worth catching, and
  it costs almost nothing to check via a `Map` keyed on `"METHOD path"`.
- Table symbols never throw on reuse; only exact duplicate *routes*
  throw. This mirrors real-world semantics: two endpoints hitting the
  same table is completely normal (CRUD), but two identical route
  definitions is always a mistake.
- Field type conflicts are warnings, not errors — kept intentionally
  lenient for v1 since OptiScript has no column-type declarations to
  validate against yet.
- Symbol table population happens **inline during parsing** (not a
  second AST-traversal pass), exactly as OptiScript_2Month_Plan.md
  specifies for Week 3 — this is also the standard textbook approach for
  Syntax-Directed Translation (build attributes as you reduce/parse),
  which matters for the Module 3 viva.

**Verified:** `npm run test:parser` (Week 2 regression, still green after
the return-shape change) and `npm run test:symbols` (new Week 3 tests)
both run clean — all 6 valid samples produce correct symbol tables
(shared tables, per-table field scoping, and the soft warning all behave
as designed), all 4 broken samples throw the correct typed error
(`ParserError` or `SymbolTableError`) with a clear message and line
number instead of crashing.

**Status:** Week 3 deliverable complete — full parser (all grammar rules
from Week 2, unchanged) + working `SymbolTable` wired in during parsing,
unit-testable independently via `semantic/test-symbolTable.js` (per
rules.md modular design: symbol table is its own module, only imported
by the parser, not merged into it).

**Next (Week 4):** Build the ML-powered error recovery interceptor —
when the parser is about to throw a `ParserError`, package the
surrounding tokens + expected grammar rule into a prompt, call an LLM
API for a suggested fix, and fall back to the normal typed error if the
API fails/times out/returns garbage. Note: `SymbolTableError`s (semantic,
not syntax) are a different failure class and should probably NOT go
through ML recovery — only genuine parse/syntax errors should. Flag this
as a Week 4 design decision.

**TODO / open questions for later weeks:**
- Week 4 needs to decide: does ML recovery hook into `Parser.expect()`
  (lowest-level, catches everything) or into specific `parse*` methods
  (more context per error, but more call sites to wire)? Leaning toward
  `expect()` since it's the single choke point for every "unexpected
  token" error today.
- `symbolTable.warnings` currently just accumulates strings — Week 8's
  console panel will want these surfaced separately from hard errors
  (e.g. shown in the muted red `#F87171` but not blocking compilation).

---

## 2026-09-24 — Week 4 Complete: ML-Powered Error Recovery (Module 2/3 extension)

**Built:**
- `parser/mlRecovery.js` — the interceptor. `attemptRecovery(ctx)` takes
  the bad token (or `null` at EOF), a human-readable "expected" string,
  a small window of surrounding tokens, and the line number. Tries the
  real ML path first (Claude API, `claude-3-5-haiku`, strict JSON-only
  prompt, 6s timeout via `AbortController`), then falls back to an
  offline heuristic (Levenshtein edit distance against the real
  keyword/symbol set — imported straight from `lexer.js` as the single
  source of truth, not duplicated), accepting only distance <= 2 so it
  doesn't make wild guesses. Never throws — always resolves
  `{corrected, type?, value?, source}` where `source` is `'ml' |
  'heuristic' | 'none'`.
- `parser/mlRecovery.test.js` — 10 tests, all green, all exercising the
  offline path (no API key needed for a reproducible demo/CI run).
- `parser.js` **updated** — this was the real integration work, not just
  bolting the module on:
  - Resolved Week 3's open question ("expect() vs specific parse*
    methods?") in favor of a **shared chokepoint**, `_recoverOrThrow()`,
    called by both `expect()` (single required token) and a new
    `expectOneOf()` (choice points like "GET or POST"). This meant
    `parseMethod()`, `parsePathSegment()`, `parseAction()`, and the
    WHERE-clause literal check — which all used to `throw` directly,
    bypassing `expect()` entirely — now go through recovery too. Without
    this, ML recovery would only have covered about half the grammar's
    actual error sites.
  - Every grammar-rule method (`parseProgram`, `parseStatement`, …,
    `parseWhereClause`) is now `async`/`await`s its `expect` calls, since
    recovery may involve a network call. `parse(tokens, symbolTable)` is
    now `async` too and returns `{ ast, symbolTable, recoveryLog }`.
  - `_recoverOrThrow()` patches `this.tokens` in place (replaces the bad
    token, or splices in a missing one at EOF) and retries; if the
    "corrected" token still doesn't satisfy any option (a bad ML/heuristic
    guess, or a self-match no-op — see below), it undoes the patch and
    throws the normal typed `ParserError`, exactly per rules.md's
    required fallback. Every *successful* fix is appended to
    `parser.recoveryLog` for the future Week 8 console panel.
  - `SymbolTableError`s are untouched by any of this — they're thrown
    from `declareRoute()`/`declareField()`, nowhere near `expect()`, so
    the Week 3 decision (ML recovery = syntax errors only) held without
    extra work.
- `parser/test-parser.js`, `semantic/test-symbolTable.js` — updated to
  `await` the now-async `parse()`; added two new *recoverable* samples
  (`GRT` -> `GET`, `FYND` -> `FIND`) to `test-parser.js` to actually show
  self-correction happening, not just fallback failure.
- `package.json` — added `test:mlrecovery` script.

**Key decisions:**
- Went with the offline heuristic (edit distance against the real
  keyword/symbol set) as a first-class fallback, not just a stub — it
  means the whole pipeline demos cleanly with **no API key and no
  network**, which matters a lot for a live viva.
- Discovered and handled a real edge case: if the "bad" token is itself
  a *valid* token in the wrong grammar position (e.g. a stray `FIND`
  where `->` was expected, or `=` where `->` was expected), edit
  distance to itself is 0, so the heuristic "corrects" it to itself —
  a no-op. `_recoverOrThrow()` detects this (the retry still doesn't
  match any option) and falls straight through to the normal
  `ParserError` instead of looping or logging a fake fix. Documented in
  `mlRecovery.test.js` since it's a good viva talking point on the
  limits of a pure text-similarity heuristic.
- Single source of truth for keywords/symbols: `mlRecovery.js` imports
  `KEYWORDS`/`SYMBOLS` from `lexer.js` instead of hardcoding its own
  copy (the first draft of this file, written before I had the real
  lexer/parser to check against, did hardcode a copy and it drifted —
  e.g. used one generic `'SYMBOL'` type instead of the real `ARROW` /
  `SLASH` / `LPAREN` / `RPAREN` / `EQUALS` types).
- Raw single-character typos (e.g. a lone `-`) never actually reach this
  module in practice — `lexer.js` throws a `LexerError` on any character
  outside its known set *before* tokenizing gets that far. So ML/
  heuristic recovery in this DSL is really scoped to keyword/identifier-
  level typos, not arbitrary symbol garbling. Worth a line in the report.

**Verified:** `npm run test:mlrecovery` (10/10), `npm run test:parser`
(all 8 original samples behave identically — including the 3
intentionally-broken ones still throwing `ParserError` exactly as
before — plus 2 new recoverable samples now showing the console
`(ML recovery applied 1 fix(es): heuristic: -> 'GET')` line), and
`npm run test:symbols` (all 10 Week 3 samples unchanged, confirming the
async `parse()` change didn't break anything). No `ANTHROPIC_API_KEY`
was set for any of these runs — everything above exercises the offline
path; the real Claude-API path shares the same `attemptRecovery()`
contract and hasn't been separately load-tested yet.

**Status:** Week 4 deliverable complete — the "novel" feature — matches
OptiScript_2Month_Plan.md target ("working error-recovery interceptor +
fallback error system").

**Next (Week 5):** Write `icg.js` — traverse the AST into quadruples
(`Operator, Arg1, Arg2, Result`), Aho/Ullman textbook style, with a
couple of `T1`/`T2` temp variables for the viva.

**TODO / open questions for later weeks:**
- Real Claude-API path (`callMlApi`) is implemented but only exercised
  by the offline fallback in tests so far — worth manually testing once
  with a real `ANTHROPIC_API_KEY` before the demo, to confirm the JSON-
  only prompt actually gets honored by the model in practice.
- `recoveryLog` is populated but nothing consumes it yet — Week 8's
  React console panel needs to render it (per design.md: muted red
  `#F87171`, sparingly), distinct from hard errors.
- `expectOneOf`'s "un-consume and re-dispatch" trick in `parseAction()`
  (needed so `parseFindAction()`/`parseInsertAction()` can still `expect()`
  the keyword normally) works but is a little fiddly — fine for a DSL
  this small with only 2 action keywords; would need a cleaner dispatch
  table if the grammar grew more action types.

---

## 2026-09-24 — Week 5 Complete: Intermediate Code Generation (Module 4 — Quadruples)

**Built:**
- `icg/icg.js` — `generateQuadruples(ast)` walks the `Program` AST and
  emits a flat `Quadruple[]` list (`{op, arg1, arg2, result}`, with a
  textbook `(OP, arg1, arg2, result)` `toString()`). One shared `ICG`
  class holds the temp counter (`T1`, `T2`, ...) across the whole
  program — matches the Aho/Ullman style the syllabus expects, just
  applied to route/DB actions instead of arithmetic expressions.
  - Per route statement, up to 3 quadruples, in order:
    1. `(EQ, field, value, T1)` — only emitted if a WHERE clause exists
    2. `(SELECT|INSERT, table, T1|_, T2)` — the DB action, referencing
       the WHERE temp if there was one, else `_`
    3. `(ROUTE, method, path, T2)` — binds the endpoint to whichever
       temp holds the action's result
  - String WHERE values are quoted in the printed quad (`"Dune"` vs
    `1`) purely for readability when eyeballing a dump.
  - No dependency on `symbolTable` or on Week 4's `mlRecovery` — pure
    one-directional AST -> IR pass, keeping it independently unit-
    testable per rules.md's modular-design rule.
- `icg/test-icg.js` — 6 sample programs (was aiming for "5+" per the
  plan): no-WHERE FIND, numeric WHERE, string WHERE, multi-segment
  path, a 3-route program (confirms the temp counter climbs correctly
  across statements: T1..T5), and the same table hit by both a FIND
  and an INSERT in one program. All printed quad lists checked by hand
  against their DSL input — they line up.
- `package.json` — added `test:icg` script.

**Key decisions:**
- Went with **3 quads per route** (condition, action, route-binding)
  rather than folding the WHERE condition into the SELECT/INSERT quad's
  own arg1/arg2 directly — closer to how the textbook chains sub-
  expressions through temps one operation at a time, and it's what
  Week 6's dead-code elimination will actually operate on (e.g. an EQ
  quad whose temp never gets referenced is dead code).
- One global temp counter per `generate()` call (i.e. per whole
  program), not reset per statement — also textbook-standard, and
  means `T1..Tn` in a printed dump map 1:1 across the whole compiled
  output, which will matter for cross-referencing quads once
  `optimizer.js` and `codegen.js` need to consume this list in Week 6/7.

**Verified:** `npm run test:icg` — all 6 samples produce quadruple
lists that logically match their DSL input (checked by hand).
`npm run test:lexer`, `test:parser`, `test:symbols`, `test:mlrecovery`
unaffected — `icg.js` only reads the AST `parse()` already returns, no
changes needed to any earlier-week file.

**Status:** Week 5 deliverable complete, on the original 8-week
schedule (this was meant to land Week 5, delivered Week 5).

**Next (Week 6):** `optimizer.js` — basic-block/flow-graph pass over
this quadruple list, then dead-code elimination: detect quads whose
`result` temp is never referenced downstream (e.g. an unused `ROUTE`
whose action nobody calls, per the plan's phrasing) and strip them,
keeping a before/after quad-list comparison for the report.

**TODO / open questions for later weeks:**
- Right now every WHERE-having route always emits its EQ quad even if
  in practice nothing downstream could make it "dead" (a route always
  uses its own where-temp) — so Week 6's dead-code elimination will
  need at least one deliberately-unused-def sample script (per the plan)
  to actually have something to strip; none of today's 6 ICG samples
  produce dead code on their own.
- `codegen.js` (Week 7) will need to map `SELECT`/`INSERT`/`ROUTE` quad
  triples back into Express route handlers + SQL strings — worth
  sketching that mapping early since it constrains whether the 3-quad-
  per-route shape chosen here is actually convenient to consume, or
  whether it's worth collapsing back down before codegen.

---

## 2026-09-24 — Week 6 Complete: Optimization (Module 5 — Basic Blocks + Dead-Code Elimination)

**Built:**
- `optimizer/optimizer.js`:
  - `buildBasicBlocks(quads)` — OptiScript has no loops/branches/jumps,
    so this always returns exactly one block spanning the whole quad
    list. Kept as its own named function (not skipped) so the Module 5
    concept is represented correctly, and so `codegen.js` has a clean
    seam if the grammar ever grows control flow.
  - `eliminateDeadCode(quads)` — classic backward liveness analysis,
    single pass (straight-line IR, no loops, so no fixed-point worklist
    needed). `ROUTE` is the only "always-live" op (it's the program's
    observable output — an API endpoint); everything else is kept only
    if its result temp is referenced by something live.
  - `optimize(quads)` — convenience wrapper bundling blocks +
    before/after/removed for a report.
- `optimizer/test-optimizer.js` — two parts:
  - **Part A**: 3 real DSL programs compiled through the full lexer ->
    parser -> icg pipeline. All show **0 removed**, correctly — see
    design note below.
  - **Part B**: 3 hand-built quadruple lists (bypassing the DSL
    frontend) with genuinely dead defs mixed into otherwise-live route
    chains, confirming the optimizer removes exactly the dead quads and
    leaves the rest untouched, in original order — this is the plan's
    "test with a script that has 1-2 deliberately unused defs" target,
    adapted since valid OptiScript source can't currently produce dead
    code (see design note).
- `package.json` — added `test:optimizer`.

**Bug found + fixed while testing (worth mentioning in the report — this
is exactly why you test before demoing):**
First version of `eliminateDeadCode` only checked `arg1`/`arg2` for
temp references when marking things live. But `ROUTE`'s `result` field
(per icg.js's Week 5 design) is actually a *reference* to the upstream
action's temp, not a new definition — nothing downstream ever consumes
"the route's own temp". So the first version incorrectly deleted every
`SELECT`/`INSERT` quad on real DSL programs (Part A initially reported
1, 2, and 5 quads "removed" — all wrong). Fixed by special-casing: for
root ops specifically, also treat `result` as a use. Reran Part A after
the fix — 0 removed across all 3, as it should be. Left the story in
this file because it's a legitimate compiler-correctness point: an
optimizer pass needs to know which quad fields are defs vs. uses
*per operator*, not just "arg1/arg2 = use, result = def" uniformly.

**Design note — why Part A shows 0 removals (and why that's correct,
not a weak demo):** `icg.js` always wires every temp into exactly one
downstream consumer (WHERE -> action -> ROUTE), so a syntactically
valid OptiScript program structurally never contains dead code today —
there's no unused-variable concept in this DSL yet. Part A is a
correctness check (the optimizer must NOT remove anything from valid,
fully-live code), not a dead-code demo. Part B proves the algorithm
itself works, using hand-built IR — standard practice for testing an
optimization pass independently of its frontend.

**Verified:** `npm run test:optimizer` (all 6 sub-cases PASS).
`npm run test:lexer/parser/symbols/mlrecovery/icg` all still pass —
`optimizer.js` only reads the quad list `icg.js` already produces, no
changes needed to any earlier-week file.

**Status:** Week 6 deliverable complete, on schedule.

**Next (Week 7):** `codegen.js` — map the optimized quadruples to
Express.js route templates (`app.get('/books', ...)`) and MySQL
statements (`SELECT * FROM ...`), wire the full pipeline into one
`compile(sourceCode)` function, expose it via a small Express
`POST /compile` endpoint.

**TODO / open questions for later weeks:**
- `codegen.js` should run on `optimizer.optimize(quads).optimized`, not
  the raw `icg` output — need to remember to thread that through when
  wiring the full pipeline in Week 7's `compile()` function.
- If the DSL ever grows a feature that lets a temp genuinely go unused
  from valid source (e.g. a WHERE clause on an action whose table
  doesn't exist, or multiple WHERE conditions where only the last is
  kept), Part A's "0 removed" story changes — worth a note in the
  final report either way, since "our optimizer is correct but our
  frontend never gives it anything to optimize" is itself a fair thing
  to say in a viva if asked why the demo doesn't show dead code on real
  input.

---

## 2026-09-24 — Week 7 Complete: Code Generation (Module 6) + Backend Wiring

**Built:**
- `codegen/codegen.js` — `generateCode(quads)` walks the (optimized)
  quadruple list and, for each `ROUTE` quad, produces:
  - a literal Express handler (`app.get`/`app.post`), matching the
    route's exact literal path — the grammar has no `:param` syntax
    (per `docs/grammar.md`), so numeric path segments stay literal,
    consistent with how `symbolTable.js` already treats `/books/1` and
    `/books/2` as distinct routes rather than one parameterized one.
  - the matching SQL statement, as a **parameterized query** (`?`
    placeholders + a separate `params` array), never string-
    concatenated — a deliberate choice so generated code isn't
    trivially SQL-injectable even though this is a small class project.
  - Resolves each `ROUTE` back to its action (`SELECT`/`INSERT`) and
    that action's optional `WHERE` (`EQ`) by walking a temp -> defining-
    quad index, not by assuming any particular adjacency in the quad
    list (since the optimizer is free to have reordered/removed things).
  - INSERT with no WHERE (grammar allows it, but there's then no
    field/value to insert) emits a clearly-flagged `/* TODO */` SQL
    comment instead of invalid or silently-wrong SQL — same
    never-fail-silently spirit as `mlRecovery.js`'s fallback.
- `codegen/test-codegen.js` — 4 DSL samples (incl. the PRD's own Library
  API example verbatim) run through the FULL pipeline (lexer -> parser
  -> icg -> optimizer -> codegen), plus the INSERT-no-WHERE edge case.
  Generated JS is syntax-checked with Node's `vm.Script` (compiles
  without executing — there's no real MySQL/Express runtime wired up
  in a test, but a `SyntaxError` would mean the generated code is
  definitely broken, which is the "confirm output code is actually
  valid" check the plan asks for at this stage). All PASS.
- `compiler.js` (repo root) — `compile(sourceCode)`, the full pipeline
  in one function, exactly matching the plan's target shape:
  `{tokens, ast, symbolTable, recoveryLog, warnings, basicBlocks,
  quadruples, optimizedQuadruples, removedQuadruples, expressCode,
  sqlCode, errors}`. Every phase's typed error (`LexerError`,
  `ParserError`, `SymbolTableError`) is caught here and turned into an
  `errors[]` entry instead of throwing — so a broken script never
  crashes the pipeline, matching rules.md's fallback philosophy applied
  end-to-end, not just inside `mlRecovery.js`.
- `test-compiler.js` (repo root) — 4 end-to-end samples: PRD's Library
  API example, a clean 3-route program, a duplicate-route hard error
  (confirms `compile()` returns a typed error instead of throwing), and
  a `GRT`->`GET` typo (confirms Week 4's recovery flows all the way
  through a full compile with `recoveryLog` populated and no errors).
  All PASS.
- `server.js` — small Express API, `POST /compile` (body
  `{source: "<DSL text>"}` -> the full `compile()` result as JSON) plus
  a `GET /health`. Always responds 200 with JSON — even a compile
  failure is reported inside `result.errors`, not as an HTTP error
  status, so the Week 8 React playground can render it either way
  without special-casing status codes. Installed `express` as a real
  dependency and **smoke-tested the actual running server** with curl
  (not just a syntax check) — confirmed clean compile, the duplicate-
  route error, and a malformed request body all return correct JSON.
- `package.json` — added `express` dependency, `test:codegen`,
  `test:compiler`, and `start` (`node server.js`) scripts; `main`
  updated to `compiler.js`.

**Bug found + fixed while testing (same class of bug as Week 6's,
worth noting together in the report):**
`buildTempIndex` in `codegen.js` initially treated *every* quad's
`result` field as a definition — including `ROUTE`'s, which (per the
Week 5/6 design) is a *reference* to its action's temp, not a new one.
Since a `ROUTE` quad and its action quad share the same temp name in
their `result` field, the index ended up overwriting the real
`SELECT`/`INSERT` entry with a self-reference to the `ROUTE` quad
itself — `generateCode` then tried to treat the `ROUTE` quad as if it
were the action, threw `unknown action op 'ROUTE'` on the very first
sample. Fixed by restricting `buildTempIndex` to `EQ`/`SELECT`/`INSERT`
only (the ops that genuinely define a new temp). Reran — all samples
generate correctly. This is the SAME underlying convention (root ops'
`result` = reference, not def) that caused Week 6's optimizer bug —
worth stating explicitly in the report as one design decision (ROUTE
aliases its action's temp) that had to be respected consistently by
every later phase that reads quadruples, and that consistency was only
actually verified by testing each phase, not assumed from the design.

**Verified:** `npm run test:codegen` (4 samples + edge case, all valid
JS per `vm.Script`), `npm run test:compiler` (4/4 end-to-end scenarios),
and a live `node server.js` smoke-tested via curl for a clean compile,
a semantic error, and a bad request — all correct. Full regression:
`test:lexer/parser/symbols/mlrecovery/icg/optimizer` all still pass —
Weeks 1-6 needed zero changes.

**Status:** Week 7 deliverable complete — full pipeline is now callable
as one function AND reachable over HTTP, on schedule.

**Next (Week 8):** React split-screen playground per `design.md`
(neutral palette, DSL input left / generated code right, collapsible
console showing compile phases + ML recovery suggestions in muted red
`#F87171`), wired to `POST /compile`. Then final report + demo script.

**TODO / open questions for later weeks:**
- `server.js` has no CORS middleware yet — the Week 8 React dev server
  (likely on a different port, e.g. 5173 for Vite) will need either
  `cors` added here or a dev proxy configured on the frontend side.
- `db.js` (the actual mysql2 pool the generated code's `require('./db')`
  expects) doesn't exist yet — not needed for the compiler itself to
  work (codegen only emits the `require('./db')` line as text), but
  worth stubbing out before the live demo if you want to show a
  generated route actually executing against a real database, not just
  show the generated code.
- Consider whether `compiler.js`'s `result.ast`/`result.quadruples`
  (potentially large) should be trimmed or made optional for the HTTP
  response once the React console panel's actual needs are clearer in
  Week 8 — right now `/compile` returns everything, which is fine for
  a demo but is more payload than a real API would want.

---

## 2026-09-24 — Week 8 (partial) — React Playground UI Built

**Built** (`frontend/`, Vite + React, per `design.md`'s exact spec):
- `src/index.css` — the full design.md palette/typography as CSS custom
  properties (`--bg-base #F9FAFB`, `--bg-editor #FFFFFF`,
  `--text-primary #1F2937`, `--text-secondary #6B7280`, `--border
  #E5E7EB`, `--accent #9CA3AF`, `--error #F87171`; Inter/system-ui for
  UI, Fira Code/JetBrains Mono for code).
- `src/App.jsx` + `App.css` — top bar (title + a deliberately plain,
  unstyled-looking Compile button) and the split-pane body.
- `src/components/CodeEditor.jsx` — line-numbered DSL input (left
  pane). Plain `<textarea>` + a synced-scroll line-number gutter, not a
  full syntax-highlighting editor — matches design.md's literal spec
  ("line-numbered text area") without over-engineering a compiler
  class project's frontend. Highlights the error line in the muted red
  when the backend returns one.
- `src/components/OutputPane.jsx` — right pane, tabbed (Express.js /
  MySQL) read-only output. Tabs rather than stacking both, since the
  generated Express code already embeds each route's SQL inline.
- `src/components/ConsolePanel.jsx` — the bottom collapsible console.
  Purely derives a phase-by-phase log (Lexing -> Parsing/Symbol Table
  -> ML Recovery -> Optimization -> Codegen) from whatever `compile()`
  already returned — does no compiling itself. ML/heuristic recovery
  lines and hard errors are the ONLY things shown in the muted red
  `#F87171`, used sparingly per design.md; everything else stays in
  plain text/dark grey.
- `src/api.js` — thin `fetch('/compile', ...)` wrapper. Uses a
  **relative** URL on purpose: `vite.config.js` proxies `/compile` and
  `/health` to `http://localhost:4000` in dev, so there's no need for a
  `cors` package on the backend at all — resolves the CORS TODO flagged
  at the end of Week 7 with a simpler fix than expected.
- `package.json` (root) — added `dev:frontend` convenience script.

**Verified:**
- `npm run build` (inside `frontend/`) succeeds cleanly — validates all
  JSX/imports resolve.
- Ran the actual backend (`node server.js`) and actual Vite dev server
  together, then curled `http://localhost:5173/compile` (i.e. through
  the Vite proxy, exactly the path the browser will take) — confirmed
  it correctly forwards to the backend and returns a real compile
  result. Not just a syntax check — an actual running-server smoke test,
  same standard applied to `server.js` itself in Week 7.
- All 8 backend module suites re-confirmed passing — the frontend build
  touched nothing under Weeks 1-7.

**Gotcha worth remembering for next session:** `cd dir && cmd &`
backgrounds the WHOLE compound command including the `cd`, so the
current shell's own working directory never actually changes — looked
like `cd` was silently failing on a later command. Fix: put `cd` on its
own line/statement, only background the actual long-running process
after it.

**Status:** Week 8 UI build (Days 1-4 of the plan: split-pane editor,
Compile wiring, console panel with ML recovery shown distinctly) done.
Remaining Week 8 work per the plan: Day 5 bug-fixing pass (none found
yet, but haven't tried it in an actual browser, only build+proxy
smoke-tested), Day 6 final report/documentation (architecture diagram,
syllabus module mapping table, example inputs/outputs, screenshots),
Day 7 five-minute demo script (2 valid inputs, 1 broken input showing
ML recovery, 1 showing dead-code elimination).

**TODO / open questions:**
- Haven't visually verified the UI in an actual browser yet (only
  `npm run build` + a proxy-level curl smoke test) — worth a real
  look before the demo, especially the collapsible console's scroll
  behavior with a long recoveryLog.
- `db.js` still doesn't exist — fine for showing generated code in the
  playground, but if the demo wants a route to actually execute, this
  needs stubbing (or mocking `db.query` to return canned data) first.
- No loading/error state polish beyond the basic "Compiling…" button
  label and a "Backend unreachable" console line — acceptable for a
  class demo, but worth a glance during the Day 5 pass.

---

## 2026-10-10 — Week 8 addition: Compiler Phases Tab Panel

**What was built:** the bottom console is now a tabbed **PhasesPanel**
so every compiler phase's output is visible in the playground (great
for the viva — each tab maps to a syllabus module). Frontend only; no
backend or compiler changes, since `compile()` already returned every
field needed.

**Tabs:** `Console | Tokens | Parse Tree | Symbol Table | Quadruples | Optimization`
| Tab | Module | Shows |
|---|---|---|
| Tokens | 1 | index / type / value / line table. Tokens fixed by error recovery are flagged in muted red (matched via `recoveryLog[].position`). |
| Parse Tree | 2 | collapsible AST (native `<details>`), generic recursive renderer — works for any node shape. |
| Symbol Table | 3 | routes table + tables/fields table (type, use count) + warnings. |
| Quadruples | 4 | `# / Operator / Arg1 / Arg2 / Result` table (`_` = empty). |
| Optimization | 5 | before vs after dead-code elimination side by side; removed rows highlighted in muted red; basic-block count in the summary line. |

**Files:**
- NEW `frontend/src/components/PhasesPanel.jsx` + `PhasesPanel.css`.
- NEW `frontend/src/components/consoleLines.js` — `buildPhaseLines` and
  `statusLabel` moved out of `ConsolePanel.jsx` (lint warned about
  exporting non-components from a component file). Console tab reuses them.
- `App.jsx` now renders `<PhasesPanel>` instead of `<ConsolePanel>`.
  `ConsolePanel.jsx` is no longer used by the app (kept, not deleted).

**Key decisions:**
- Plain HTML tables + native `<details>` — no chart/graph libraries.
- Removed quadruples arrive from the API as JSON copies, so the
  Optimization tab matches them to the "before" list by content
  (`op|arg1|arg2|result`) rather than by object identity.
- Tabs show "pipeline stopped at an earlier phase" when a phase's data
  is null (e.g. a parser error means no AST/quadruples).
- Muted red `#F87171` still used sparingly (flagged rows only).

**Verified:**
- `npm run build` and `oxlint` both clean (0 warnings, 0 errors).
- Ran the real backend + Vite dev server and drove the page in a real
  headless browser (Playwright): compiled `GRT /books ...` + a POST
  route, opened all 5 new tabs, content correct, no JS errors, and the
  `GRT -> GET` corrected token was flagged in the Tokens tab.
  Screenshot reviewed — layout matches design.md.

**Gotcha:** `npm install` is needed in BOTH the repo root (backend:
express) and `frontend/` — the backend crashes on `require('express')`
otherwise.

**TODO / not yet verified:**
- Dead-code highlighting in the Optimization tab is untested in the UI:
  none of the sample DSL scripts produce removed quadruples (the
  optimizer only removes quads whose result is never used). Worth
  finding/adding a script that triggers it before the demo.
- Panel body is a fixed 240px tall; a program with many routes just
  scrolls inside it. Fine for the demo, easy to make resizable later.
- Remaining Week 8: Day 6 report/docs, Day 7 demo script.
