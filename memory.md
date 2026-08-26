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
