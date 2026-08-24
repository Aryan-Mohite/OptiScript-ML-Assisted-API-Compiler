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
