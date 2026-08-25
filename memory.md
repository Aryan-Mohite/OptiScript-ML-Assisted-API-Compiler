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
