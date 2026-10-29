# OptiScript — ML-Assisted API Compiler

OptiScript is a small compiler that turns a one-line-per-route DSL into a
working **Express.js** backend and **MySQL** queries. When the parser hits a
syntax error (e.g. a typo like `GRT`), it asks an ML model — or an offline
fallback — to suggest the fix instead of just crashing.

**Course:** 7CS301 Compiler Design (Sem V) | **Stack:** Node.js (compiler core), React + Vite (playground)

```text
GET /books -> FIND all IN library_db
```
becomes
```js
app.get('/books', (req, res) => {
  const sql = "SELECT * FROM `library_db`";
  ...
});
```

---

## 1. Quick Start

```bash
# 1. backend (compiler + API)
npm install
npm start                 # http://localhost:4000

# 2. frontend (playground) — new terminal
cd frontend
npm install
npm run dev               # http://localhost:5173
```

> Both folders need their own `npm install`. The Vite dev server proxies
> `/compile`, `/run` and `/db` to the backend, so no CORS setup is needed.

**Database (to use the "Run on DB" button):** start MySQL, copy `.env.example`
to `.env` and set `DB_USER` / `DB_PASSWORD`. That's it: the first "Run on DB"
creates the `optiscript_demo` database from `db/schema.sql` + `db/data.sql`.
Use the **Reset DB** button (or `npm run db:setup`) to put the sample data back,
and `npm run test:db` for the integration test (it uses its own database).
Without MySQL everything else still works; "Compile" never touches the database.

**Optional ML mode:** copy `.env.example` to `.env` and paste a **free Gemini
key** (https://aistudio.google.com/apikey) as `GEMINI_API_KEY`. `npm start`
reads `.env` automatically and prints which ML provider is active. An
`ANTHROPIC_API_KEY` also works, and if both are set Gemini is tried first
(`ML_PROVIDER=anthropic` flips that). Without any key the compiler uses the
offline fallback (Section 5), so the demo works with no internet and no key.

**Run the tests:**
```bash
npm run test:lexer && npm run test:parser && npm run test:symbols \
 && npm run test:mlrecovery && npm run test:icg && npm run test:optimizer \
 && npm run test:codegen && npm run test:compiler
```

---

## 2. The DSL in 30 Seconds

```text
GET  /books        -> FIND all IN library_db
GET  /books/1      -> FIND all IN library_db WHERE id = 1
POST /books        -> INSERT INTO library_db WHERE title = "Dune"

```

- **Keywords** (case-sensitive): `GET POST FIND all IN WHERE INSERT INTO`
- **Symbols:** `->  /  (  )  =`
- **Literals:** identifiers, integers, `"strings"`

Full grammar: [`compiler/docs/grammar.md`](compiler/docs/grammar.md) and [`compiler/docs/cfg.md`](compiler/docs/cfg.md).

```text
<program>     ::= <statement>* EOF
<statement>   ::= <method> <path> ARROW <action>
<method>      ::= "GET" | "POST"
<path>        ::= ( SLASH <pathSegment> )+
<action>      ::= "FIND" "all" "IN" IDENTIFIER <where>?
                | "INSERT" "INTO" IDENTIFIER <where>?
<where>       ::= "WHERE" IDENTIFIER EQUALS ( STRING | NUMBER )
```

---

## 3. Compiler Pipeline

```text
 Source text
     │
     ▼
 [lexer/]     Lexical Analysis ──────► Tokens            (Module 1)
     │
     ▼
 [parser/]    LL(1) Recursive Descent ─► AST             (Module 2)
     │   ▲                                 │
     │   └── mlRecovery.js (ML / heuristic fix on error) │
     ▼                                      ▼
 [semantic/]  Symbol Table ◄──────── filled while parsing (Module 3)
     │
     ▼
 [icg/]       Intermediate Code ────► Quadruples         (Module 4)
     │
     ▼
 [optimizer/] Basic blocks + Dead-code elimination       (Module 5)
     │
     ▼
 [codegen/]   Express.js routes + MySQL queries          (Module 6)
```

`compiler/compiler.js` wires all of these into one function, `compile(source)`.
`server/server.js` exposes it as `POST /compile`, and as `POST /run`, which also
sends the compiler's SQL to the database (see Section 4).

| Syllabus Module | Phase | Folder / File |
|---|---|---|
| 1 — Lexical Analysis | Hand-coded lexer | `compiler/lexer/lexer.js` |
| 2 — Syntax Analysis (LL) | Recursive-descent predictive parser + ML recovery | `compiler/parser/parser.js`, `compiler/parser/mlRecovery.js` |
| 3 — SDT & Symbol Table | Symbol table filled during parsing | `compiler/semantic/symbolTable.js` |
| 4 — Intermediate Code | Quadruples | `compiler/icg/icg.js` |
| 5 — Code Optimization | Basic blocks, dead-code elimination | `compiler/optimizer/optimizer.js` |
| 6 — Code Generation | Express + MySQL output | `compiler/codegen/codegen.js` |

---

## 4. Folder-by-Folder Guide

The project is three independent parts. Only the thin `server/` part knows both
of the others exist:

```text
 compiler/  ──── queries (SQL + values) ────►  server/  ────►  db/
 the compiler                                  the bridge       schema.sql + data.sql
 (knows nothing about databases)               (runs the SQL)   (plain SQL, no code)
```

- **`compiler/`** turns OptiScript into Express code and a list of `queries`.
  A test checks it never loads a database library.
- **`db/`** is just two SQL files: the schema and the sample data.
- **`server/`** takes the compiler's `queries` and runs them on MySQL. Only SQL
  that the compiler produced is ever executed, using `?` placeholders.

### `compiler/lexer/` — Phase 1: Lexical Analysis
- **Does:** scans the source one character at a time (hand-coded, no regex
  generator) and produces tokens shaped `{ type, value, line }`.
- **Token types:** `KEYWORD, IDENTIFIER, STRING, NUMBER, ARROW, SLASH, LPAREN, RPAREN, EQUALS, EOF`.
- **Skips:** whitespace and `#` comment lines. Newlines only bump the line counter.
- **Errors:** throws `LexerError` for an unknown character or an unterminated string.
- **Test:** `npm run test:lexer`

### `compiler/parser/` — Phase 2: Syntax Analysis
- **`parser.js`** — a **recursive-descent predictive (LL(1)) parser**: one
  method per grammar rule (`parseProgram`, `parseRouteStatement`, `parseAction`, …).
  One token of lookahead is always enough to pick the right rule, so there is
  no backtracking. Builds the AST from plain objects: `Program → RouteStatement → Path / FindAction / InsertAction → WhereClause`.
- **`mlRecovery.js`** — the "ML-assisted" part. See Section 5.
- **Errors:** `ParserError` when a token is wrong and recovery can't fix it.
- **Tests:** `npm run test:parser`, `npm run test:mlrecovery`

### `compiler/semantic/` — Phase 3: Symbol Table
- **`symbolTable.js`** — the single source of truth for what the program
  defines. Tracks three kinds of symbols in one global scope:
  1. **Routes** (`METHOD /path`) — a duplicate route throws `SymbolTableError`.
  2. **Tables** — every DB table used and which actions (FIND/INSERT) touch it.
  3. **Fields** — WHERE columns per table, with their value type and use count.
- **Warning (not error):** using the same field with two different types
  (e.g. `id = 1` then `id = "x"`).
- **Test:** `npm run test:symbols`

### `compiler/icg/` — Phase 4: Intermediate Code Generation
- **`icg.js`** — walks the AST and emits **quadruples**
  `(Operator, Arg1, Arg2, Result)` using temporaries `T1, T2, …`, textbook style.
- **Per route, up to 3 quadruples:**
  1. `EQ field value Tn` — only if there is a WHERE
  2. `SELECT` / `INSERT table [Tn] Tm` — the DB action
  3. `ROUTE method path Tm` — binds the endpoint to the action's result

  Example for `GET /books -> FIND all IN library_db`:
  ```text
  (SELECT, library_db, _, T1)
  (ROUTE,  GET, /books, T1)
  ```
- **Test:** `npm run test:icg`

### `compiler/optimizer/` — Phase 5: Optimization
- **Basic blocks:** OptiScript has no loops or branches, so every program is
  exactly **one** basic block. The function exists so the concept is explicit.
- **Dead-code elimination:** one backward liveness pass. `ROUTE` quadruples are
  always kept (they are the program's output); any other quadruple is kept only
  if something live uses its result temp.
- **Returns:** `{ optimized, removed }`.
- **Test:** `npm run test:optimizer` (uses hand-built quadruple lists that
  contain real dead code — see the Q&A for why).

### `compiler/codegen/` — Phase 6: Target Code Generation
- **`codegen.js`** — reads the **optimized** quadruples. For each `ROUTE` it
  follows the temps back to the `SELECT`/`INSERT` and its `EQ`, then emits an
  Express handler plus its SQL.
- **Safe SQL:** values become `?` placeholders passed as parameters — never
  concatenated into the SQL string (prevents SQL injection in generated code).
- **Test:** `npm run test:codegen`

### `db/` — the database (schema and data only)
- **`schema.sql`** — drops and creates the tables `library_db`, `authors_db`,
  `members_db`. The names match the DSL's `IN <table>` / `INTO <table>`.
- **`data.sql`** — the sample rows.
- Running the two files in that order always gives a fresh, known state. There is
  no code in this folder.

### `server/` — the bridge (the only place compiler and database meet)
- **`server.js`** — Express API: `POST /compile`, `POST /run`, `POST /db/reset`,
  `GET /health`. `/run` compiles, then runs `result.queries` on the database and
  returns the normal compile result plus `dbResults` (or `dbError` if MySQL is off).
- **`dbRunner.js`** — `setupDatabase()` loads `db/schema.sql` + `db/data.sql`;
  `runQueries()` runs the compiler's queries as prepared statements and reports
  rows / insert ids / errors per query. Creates the database on first use.
- **`db-setup.js`** — `npm run db:setup` (same as the Reset DB button).
- **`loadEnv.js`** — tiny `.env` reader (no extra package).
- **`test-bridge.js`** — `npm run test:db`: source → compiler → real MySQL →
  results, including an SQL-injection attempt and a failing query.

### Compiler files and root files
| File | Purpose |
|---|---|
| `compiler/compiler.js` | `compile(source)` — runs every phase, collects results and errors into one object, never throws |
| `compiler/test-compiler.js` | End-to-end tests: PRD example, multi-route, duplicate-route error, `GRT → GET` recovery, missing `->` / `IN` insertion, the `queries` output, and that the compiler loads no database code |
| `compiler/docs/` | `grammar.md` (tokens), `cfg.md` (BNF + LL(1) analysis), `week4-integration.md` |
| `examples/library.optiscript` | A sample program to paste into the playground |
| `.env.example` | ML keys and `DB_*` settings (copy to `.env`) |
| `memory.md` | Running log of what was built each week, decisions, gotchas, TODOs |

`compile()` returns: `tokens, ast, symbolTable, recoveryLog, warnings, basicBlocks, quadruples, optimizedQuadruples, removedQuadruples, expressCode, sqlCode, queries, errors`.
`queries` is the list the database receives: `{ method, path, sql, params, runnable }` per route.
Any field stays `null` if the pipeline stopped before reaching that phase.

### `frontend/` — React Playground
- **Left:** line-numbered editor (`CodeEditor.jsx`) — highlights the error line.
- **Right:** generated code, tabbed Express.js / MySQL (`OutputPane.jsx`).
- **Bottom — `PhasesPanel.jsx`:** one tab per phase so you can *see* the
  compiler work: `Console | Tokens | Parse Tree | Symbol Table | Quadruples | Optimization`.
  Tokens fixed by error recovery and quadruples removed by the optimizer are
  shown in muted red.
- **Design:** neutral palette from `design.md`; red is used sparingly.
- `api.js` is a thin `fetch('/compile')` wrapper.

---

## 5. The ML Error Recovery (the novel part)

When the parser expects one token but finds another, `_recoverOrThrow()` tries
to repair the token stream. A fix is one of two kinds:

- **replace** a wrong token (`GRT` → `GET`)
- **insert** a missing token (`GET /books FIND ...` → add `->`)

It tries, in order:

1. **ML call** — `attemptRecovery()` in `compiler/parser/mlRecovery.js` sends the expected
   token, the bad token and nearby tokens to an LLM (**Gemini** and/or
   **Anthropic**, whichever has a key; Gemini first) and demands **only** a small
   JSON object: `{"corrected": true, "action": "insert", "type": "ARROW", "value": "->"}`.
   The reply is validated (exact shape, real token type); anything else is rejected.
2. **Heuristic fallback** — finds the closest real keyword/symbol using
   **Levenshtein edit distance** (≤ 2) and replaces the bad token. Used when there
   is no key, the call fails, or the ML answer is invalid.
3. **Phrase-level insertion** — if exactly *one* token could have been expected
   (e.g. only `->`, or only `IN`), that token is the missing one, so it is
   inserted. No guessing: with several choices (`GET`/`POST`, `FIND`/`INSERT`) or
   a varying token (a table name), nothing is inserted. Never done at end of
   input, where the program is simply incomplete.
4. **Give up cleanly** — the parser throws a normal `ParserError`.

**Safety check:** after any fix is applied, the parser checks that the patched
token really satisfies the grammar rule. If not (e.g. the model hallucinated),
the patch is undone, so a bad fix can never reach the AST.

**Guarantee (from `rules.md`):** `attemptRecovery()` *never throws*. A timeout
(8 s), network error, bad JSON or hallucinated answer all end in a later step, so
the compiler can't be crashed by the ML service.

Each fix is recorded in `recoveryLog` with `source: 'ml' | 'heuristic'`,
`action: 'replace' | 'insert'` (and `provider` for ML), and the playground shows
it in the Console and Tokens tabs.

---

## 6. Error Types

| Error | Raised by | Example |
|---|---|---|
| `LexerError` | lexer | `GET /books @ ...` (unknown character) |
| `ParserError` | parser | a bad token recovery couldn't fix (e.g. program ends after the path, or `FIND`/`INSERT` missing) |
| `SymbolTableError` | symbol table | two `GET /books` routes |
| `CodegenError` | codegen | internal code-generation failure |

All are caught in `compile()` and returned in `result.errors` as
`{ phase, name, message, line }`.

---

## 7. Known Limitations (be upfront in the demo)

- The DSL is small: two methods, two actions, one optional `WHERE x = value`.
- A valid OptiScript program **never contains dead code** (see Q&A #14), so the
  optimizer's removal path is shown through `test-optimizer.js`, not the playground.
- The playground's **Run on DB** runs the compiler's SQL directly on MySQL; the
  generated Express code is shown but not executed. The DSL has no way to take
  values from a request: `POST /books -> INSERT INTO library_db WHERE title = "Dune"`
  always inserts the literal "Dune". Each Run on DB click inserts again (use Reset DB).
- `/run` executes whatever SQL the compiler produced against the configured
  database, with no login. That is fine for a local demo, but don't expose it
  publicly. A MySQL user with only SELECT/INSERT rights is a good extra precaution.
- `INSERT` can set only one field, and `SELECT` has no ordering or limits.
- ML mode needs `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` (see `.env.example`).
  Model names can be changed with `GEMINI_MODEL` / `ANTHROPIC_MODEL` if a
  provider retires one. The live ML call can't run in the automated tests (they
  use a fake `fetch`), so try it once by hand with your key.

---

## 8. Important Questions & Answers (Viva Prep)

**Q1. What is OptiScript and why is it a compiler and not just a converter?**
It translates a source language (the DSL) into a target language (Express.js +
SQL) through the full compiler phases: lexing, parsing, semantic analysis,
intermediate code, optimization and code generation. A plain converter would
skip the intermediate representation and analysis.

**Q2. List the phases and which syllabus module each belongs to.**
Lexer (M1), parser (M2), symbol table / semantic analysis (M3), quadruples (M4),
optimization (M5), code generation (M6). See the table in Section 3.

**Q3. Why did you hand-code the lexer?**
`rules.md` requires a hand-coded or strict Lex-style lexer to demonstrate
Module 1. It scans character by character, tracks the line number and emits
`{type, value, line}` tokens.

**Q4. What is the difference between a token, a lexeme and a pattern?**
A *lexeme* is the actual text (`GET`), a *token* is its category plus value
(`KEYWORD GET`), and a *pattern* is the rule describing it (e.g. an identifier
is `[a-zA-Z_][a-zA-Z0-9_]*`).

**Q5. What kind of parser did you build?**
A top-down **recursive-descent predictive parser (LL(1))**: one function per
grammar rule, one lookahead token, no backtracking. No parser generator (ANTLR
etc.) was used, as `rules.md` requires.

**Q6. Why is your grammar LL(1)? Is there left recursion?**
No left recursion. Every choice starts with a different terminal: `GET`/`POST`
for the method, `FIND`/`INSERT` for the action, and `WHERE` is the only token
that starts the optional where-clause. One lookahead token always decides.

**Q7. What is the difference between a parse tree and an AST?**
A parse tree records every grammar rule applied, including punctuation. An AST
keeps only the meaningful structure. Ours is an AST made of plain objects
(`RouteStatement`, `FindAction`, …); the playground's "Parse Tree" tab shows it.

**Q8. What does the symbol table store and when is it filled?**
Routes, tables (with the actions used on them) and WHERE fields (with type and
use count), in one global scope. The parser fills it *while parsing*. It catches
duplicate routes (error) and field type mismatches (warning).

**Q9. Why only one scope?**
OptiScript has no user-declared variables or nested blocks. It is modelled as a
scope object anyway, so adding nested scopes later wouldn't change the design.

**Q10. What are quadruples? Why not triples or a syntax tree?**
A quadruple is `(operator, arg1, arg2, result)`. The result is stored in an
explicit temp (`T1`, `T2`), so quadruples can be reordered or removed without
fixing up index references (which triples would need). `rules.md` also
requires quadruples.

**Q11. Show the quadruples for `GET /books/1 -> FIND all IN library_db WHERE id = 1`.**
```text
(EQ,     id,         1,     T1)
(SELECT, library_db, T1,    T2)
(ROUTE,  GET,        /books/1, T2)
```

**Q12. What is a basic block, and how many does your compiler produce?**
A basic block is a straight-line sequence of instructions with one entry and
one exit. OptiScript has no branches or loops, so every program is exactly one
block.

**Q13. How does your dead-code elimination work?**
One backward pass. `ROUTE` quadruples are always live (they're the program's
output). Another quadruple is kept only if its result temp is used by a live
quadruple; otherwise it is removed. A single pass is enough because the code is
straight-line, with each temp defined once before use.

**Q14. Your optimizer never removes anything on real programs — isn't it useless?**
For valid OptiScript input, yes: the ICG always wires every temp into exactly
one consumer, and the DSL has no unused-variable concept, so nothing is ever
dead. The optimizer is still correct, and `test-optimizer.js` proves it on
hand-built quadruple lists with real dead definitions (standard practice for
testing an IR pass on its own). It would matter as soon as the language grows
variables or conditionals.

**Q15. Is that optimization machine-independent?**
Yes. Dead-code elimination works only on quadruples, before any Express/SQL is
chosen, so it doesn't depend on the target.

**Q16. How does the ML error recovery work?**
On a parse error the parser sends the expected rule, the bad token and nearby
tokens to an LLM (Gemini or Anthropic) and asks for one fix as strict JSON: either
replace the wrong token or insert a missing one. The reply is validated. If it
fails, a Levenshtein-distance heuristic suggests the closest real keyword; if
exactly one token was expected, it is inserted. If all fail, a normal
`ParserError` is thrown.

**Q17. What if the ML model returns something wrong or the API is down?**
`attemptRecovery()` never throws. Timeouts, network errors, invalid JSON and
wrong-shape answers all fall through to the heuristic, then to a normal compiler
error. This is the fallback rule in `rules.md`.

**Q18. What is Levenshtein distance and why use it?**
The minimum number of single-character insertions, deletions or substitutions to
turn one string into another. `GRT → GET` is distance 1, so `GET` is the best
match. It makes the demo work offline with no API key.

**Q19. Is it safe to let an LLM change the program?**
It can only suggest *one token*, the answer is schema-checked, the parse
continues under the normal grammar rules afterwards (a bad guess still fails
later), and every fix is logged in `recoveryLog` and shown in the UI. It's also
optional: no key means the deterministic heuristic is used instead.

**Q20. How do you avoid SQL injection in the generated code?**
Values are never concatenated into the SQL. Every WHERE/INSERT value becomes a
`?` placeholder, and the real value is passed as a query parameter.

**Q21. Why does codegen use the *optimized* quadruples?**
So dead code never reaches the output. Codegen follows temps from each `ROUTE`
back to its `SELECT`/`INSERT`/`EQ` instead of relying on adjacency in the list.

**Q22. Why do `ROUTE` quadruples use the action's temp as their "result"?**
It's a *reference*, not a new definition. The optimizer treats it as a *use*,
and codegen only treats `EQ/SELECT/INSERT` as definitions. Mixing this up caused
real bugs in Weeks 6 and 7 (logged in `memory.md`).

**Q23. How are errors reported?**
Each phase has a typed error (`LexerError`, `ParserError`, `SymbolTableError`).
`compile()` catches them and returns `{phase, name, message, line}` in
`result.errors`, so the API always returns clean JSON and never a stack trace.
The editor highlights the error line.

**Q24. Why modular files per phase?**
Required by `rules.md` so each phase can be unit tested alone; every folder has
its own test script, and `test-compiler.js` tests the whole pipeline.

**Q25. What are the limitations and how would you extend it?**
Small DSL (two methods, two actions, one `=` condition). Possible extensions:
PUT/DELETE, more operators and multiple conditions, UPDATE/DELETE actions,
variables and scopes (which would also make dead-code elimination meaningful),
request-body values for `POST` (so one route can insert real data), and
`UPDATE`/`DELETE` routes.

---

## 9. Demo Script (5 minutes)

1. **Valid input** — `GET /books -> FIND all IN library_db`. Walk the tabs
   left to right: Tokens → Parse Tree → Symbol Table → Quadruples → Optimization → generated code.
2. **Multi-route with WHERE** — add `POST` and `GET /books/1 ... WHERE id = 1`
   and show the `?` placeholders in the generated SQL.
3. **Run on the database** — click **Run on DB**: the **DB Result** tab shows the
   SQL the compiler produced, its `?` values, and the rows MySQL returned. Run a
   `POST ... INSERT`, then a `GET`, to see the new row. Click **Reset DB** afterwards.
4. **Broken input** — change `GET` to `GRT`. Show the corrected token in the
   Tokens tab and the recovery line in the Console.
5. **Semantic error** — duplicate `GET /books`; show the `SymbolTableError`
   and the highlighted line.
6. **Dead-code elimination** — run `npm run test:optimizer` and show the
   hand-built quadruples with the removed ones (see Q14).
