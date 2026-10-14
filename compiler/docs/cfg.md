# OptiScript — Context-Free Grammar (CFG), Week 2

BNF-style grammar for the Week 2 recursive-descent (LL) parser. This
builds directly on the token set from Week 1 (`docs/grammar.md`).

## 1. Grammar Rules (BNF)

```
<program>       ::= <statement>* EOF

<statement>     ::= <routeStatement>

<routeStatement>::= <method> <path> ARROW <action>

<method>        ::= "GET" | "POST"

<path>          ::= ( SLASH <pathSegment> )+

<pathSegment>   ::= IDENTIFIER | NUMBER

<action>        ::= <findAction> | <insertAction>

<findAction>    ::= "FIND" "all" "IN" IDENTIFIER <whereClause>?

<insertAction>  ::= "INSERT" "INTO" IDENTIFIER <whereClause>?

<whereClause>   ::= "WHERE" IDENTIFIER EQUALS ( STRING | NUMBER )
```

(Quoted words like `"GET"`, `"FIND"` above represent the *value* of a
`KEYWORD` token, not a literal string token — see Week 1 grammar.)

## 2. Left Recursion / Ambiguity Check 

- **No left recursion**: every rule's alternatives start with a distinct
  terminal (`GET`/`POST` for method, `SLASH` for path, `FIND`/`INSERT`
  for action). A single lookahead token (LL(1)) is always enough to pick
  the right production — this is why a predictive recursive-descent
  parser works without backtracking.
- **`<action>` disambiguation**: `findAction` and `insertAction` are
  distinguished purely by their first token (`FIND` vs `INSERT`), so
  `parseAction()` just peeks one token and dispatches — classic LL(1)
  predictive parsing.
- **`<whereClause>?`**: optional — parser peeks for a `WHERE` keyword; if
  absent, it's simply skipped. No ambiguity because `WHERE` never starts
  any other rule.
- **`<path>` is `(SLASH pathSegment)+`** (one or more), not `*`, because
  every route must have at least one path segment (`/books`). This
  matches how `pathSegment` is used in Week 1 samples like
  `/order_items/1024`.

## 3. Parse Tree Shape (informal)

For `GET /books -> FIND all IN library_db`:

```
RouteStatement
├── method: "GET"
├── path: ["books"]
└── action: FindAction
    ├── table: "library_db"
    └── where: null
```

## 4. AST Node Types (JS object shape, per phases.md)

Plain JS objects: `{ type, ...fields, line }` — no formal AST class
hierarchy needed for a DSL this small.

| Node Type | Fields |
|---|---|
| `Program` | `body: Statement[]` |
| `RouteStatement` | `method, path, action, line` |
| `Path` | `segments: string[]` |
| `FindAction` | `table, where, line` |
| `InsertAction` | `table, where, line` |
| `WhereClause` | `field, operator, value, valueType, line` |
