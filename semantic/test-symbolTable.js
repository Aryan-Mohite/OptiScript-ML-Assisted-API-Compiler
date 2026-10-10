/**
 * test-symbolTable.js
 * -----------------------------------------------------------------------
 * Manual test runner for Week 3 (Module 3 — SDT & Symbol Table).
 *
 * Each sample runs lexer -> parser (which now also builds the symbol
 * table as it parses). Prints the AST-vs-symbol-table checkpoint: just
 * the symbol table summary + any thrown error, since parser.js's own
 * test file already covers full AST shape.
 *
 * 10 samples total: 6 valid (covering routes, tables, fields, and a
 * table reused across two different routes/actions) + 4 intentionally
 * broken (2 parser-level, 2 symbol-table-level semantic errors).
 *
 * Run with: node semantic/test-symbolTable.js
 * -----------------------------------------------------------------------
 */

const { tokenize } = require('../lexer/lexer');
const { parse } = require('../parser/parser');

const samples = [
  // 1. Basic single route, no WHERE.
  {
    label: 'GET /books, no WHERE',
    src: `GET /books -> FIND all IN library_db`,
  },
  // 2. INSERT with a WHERE clause (string literal field).
  {
    label: 'POST /books INSERT with WHERE (string)',
    src: `POST /books -> INSERT INTO library_db WHERE title = "Dune"`,
  },
  // 3. Same table reused by two different routes/actions — should NOT
  //    throw (tables can be shared); symbol table should show both
  //    'FIND' and 'INSERT' in the table's actions set.
  {
    label: 'library_db reused by GET and POST (shared table)',
    src: `GET /books -> FIND all IN library_db WHERE id = 1
POST /books/1 -> INSERT INTO library_db WHERE id = 1`,
  },
  // 4. Multiple distinct routes/tables in one program.
  {
    label: 'Multiple distinct routes + tables',
    src: `GET /authors -> FIND all IN authors_db
POST /authors -> INSERT INTO authors_db WHERE name = "Frank Herbert"
GET /order_items/1024 -> FIND all IN order_items_table WHERE id = 1024`,
  },
  // 5. Same field reused with the SAME type on the same table — should
  //    just bump `uses`, no warning.
  {
    label: 'Field reused with consistent type (no warning)',
    src: `GET /books -> FIND all IN library_db WHERE id = 1
GET /books/2 -> FIND all IN library_db WHERE id = 2`,
  },
  // 6. Same field reused with a DIFFERENT type on the same table —
  //    should parse fine but add a soft warning (not a thrown error).
  {
    label: 'Field type conflict -> soft warning, not a thrown error',
    src: `GET /books -> FIND all IN library_db WHERE id = 1
GET /books/x -> FIND all IN library_db WHERE id = "abc"`,
  },
  // 7. BROKEN (parser-level, unchanged from Week 2) — missing '->'.
  {
    label: 'BROKEN: missing -> (ParserError)',
    src: `GET /books FIND all IN library_db`,
  },
  // 8. BROKEN (parser-level) — missing table name after IN.
  {
    label: 'BROKEN: missing table name (ParserError)',
    src: `GET /books -> FIND all IN`,
  },
  // 9. BROKEN (symbol-table-level, NEW in Week 3) — exact duplicate
  //    route definition (same method + same path twice).
  {
    label: 'BROKEN: duplicate route GET /books twice (SymbolTableError)',
    src: `GET /books -> FIND all IN library_db
GET /books -> FIND all IN library_db`,
  },
  // 10. BROKEN (symbol-table-level, NEW) — duplicate route with a
  //     multi-segment path, to confirm the path-string join used for
  //     the route key handles segments correctly.
  {
    label: 'BROKEN: duplicate route GET /order_items/1024 twice (SymbolTableError)',
    src: `GET /order_items/1024 -> FIND all IN order_items_table
GET /order_items/1024 -> FIND all IN order_items_table WHERE id = 1024`,
  },
];

// NOTE (Week 4): parse() is now async (error recovery may call an API).
async function run(src) {
  const tokens = tokenize(src);
  return parse(tokens); // { ast, symbolTable, recoveryLog }
}

async function main() {
  for (let idx = 0; idx < samples.length; idx++) {
    const sample = samples[idx];
    console.log(`\n=== Sample ${idx + 1}: ${sample.label} ===`);
    console.log(`Input: ${JSON.stringify(sample.src)}`);
    try {
      const { symbolTable, recoveryLog } = await run(sample.src);
      if (recoveryLog.length > 0) {
        console.log(`  (ML recovery applied ${recoveryLog.length} fix(es))`);
      }
      console.log('Symbol Table:', JSON.stringify(symbolTable.toJSON(), null, 2));
    } catch (err) {
      console.log(`  -> Caught error as expected: [${err.name}] ${err.message}`);
    }
  }
  console.log('\nAll samples processed.');
}

main();
