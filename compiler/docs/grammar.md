# OptiScript — DSL Grammar (v1, Week 1)

This is the finalized grammar for Week 1. It only needs to be **lexically**
correct right now (i.e. the lexer must recognize every token below). The
formal CFG / BNF for the parser comes in Week 2 — but writing the token set
now keeps both weeks consistent.

## 1. Example Program

```
GET /books -> FIND all IN library_db
POST /books -> INSERT INTO library_db WHERE title = "Dune"
GET /books/1 -> FIND all IN library_db WHERE id = 1
```

## 2. Keywords (case-sensitive, reserved words)

| Keyword | Meaning |
|---|---|
| `GET`    | HTTP GET route |
| `POST`   | HTTP POST route |
| `FIND`   | Read/select action |
| `all`    | Select-all modifier |
| `IN`     | Specifies target DB table |
| `WHERE`  | Filter condition |
| `INSERT` | Insert action |
| `INTO`   | Specifies target DB table for insert |

> Note: keywords are matched exactly. `Get` or `get` are **not** keywords —
> they lex as plain identifiers. This keeps the lexer simple (no
> case-folding logic) and is a deliberate design choice for a student
> project.

## 3. Symbols / Operators

| Symbol | Token Type | Meaning |
|---|---|---|
| `->` | `ARROW` | Separates route declaration from action |
| `/`  | `SLASH` | Path segment separator |
| `(`  | `LPAREN` | (reserved for future use — function-style args) |
| `)`  | `RPAREN` | (reserved for future use) |
| `=`  | `EQUALS` | Assignment / comparison in WHERE clause |

## 4. Literals

- **IDENTIFIER**: `[a-zA-Z_][a-zA-Z0-9_]*` — table names, column names,
  route path segments (e.g. `books`, `library_db`, `title`, `id`).
- **NUMBER**: `[0-9]+` (integers only for v1 — no floats/decimals yet).
- **STRING**: anything inside double quotes, e.g. `"Dune"`.

## 5. Misc

- **Comments**: a line starting with `#` is ignored entirely by the lexer.
- **Whitespace**: spaces/tabs are skipped; newlines increment the line
  counter (used for error messages) but are otherwise not meaningful
  tokens (statements are not required to end with `;` in v1).
- **EOF**: lexer emits a final `EOF` token so the parser (Week 2) knows
  when the token stream ends.

## 6. Token Shape

Every token produced by the lexer has this shape:

```js
{ type: 'KEYWORD', value: 'GET', line: 1 }
```

## 7. Full Token Type List (for reference)

`KEYWORD, IDENTIFIER, STRING, NUMBER, ARROW, SLASH, LPAREN, RPAREN, EQUALS, EOF`
