/**
 * test-parser.js
 * -----------------------------------------------------------------------
 * Manual test runner for parser.js (Week 2 deliverable).
 * Runs the lexer -> parser pipeline over sample DSL snippets and prints
 * the resulting AST, per phases.md Week 2 Day 6-7: "get the parser to
 * build an AST for 1-2 simple valid inputs" (extended here to cover
 * every grammar rule + a couple of broken inputs).
 *
 * Run with: node parser/test-parser.js
 * -----------------------------------------------------------------------
 */

const { tokenize } = require('../lexer/lexer');
const { parse } = require('./parser');

const samples = [
  // 1. Basic GET/FIND, no WHERE
  `GET /books -> FIND all IN library_db`,

  // 2. POST/INSERT with WHERE + string literal
  `POST /books -> INSERT INTO library_db WHERE title = "Dune"`,

  // 3. GET with numeric WHERE filter
  `GET /books/1 -> FIND all IN library_db WHERE id = 1`,

  // 4. Multiple statements back-to-back
  `GET /authors -> FIND all IN authors_db
POST /authors -> INSERT INTO authors_db WHERE name = "Frank Herbert"`,

  // 5. Multi-segment path
  `GET /order_items/1024 -> FIND all IN order_items_table WHERE id = 1024`,

  // 6. INTENTIONALLY BROKEN — missing '->'
  `GET /books FIND all IN library_db`,

  // 7. INTENTIONALLY BROKEN — missing table name after IN
  `GET /books -> FIND all IN`,

  // 8. INTENTIONALLY BROKEN — bad method keyword
  `DELETE /books -> FIND all IN library_db`,

  // 9. RECOVERABLE (Week 4) — one-letter typo in a keyword; the
  //    heuristic fallback should fix 'GRT' -> 'GET' and parse succeeds.
  `GRT /books -> FIND all IN library_db`,

  // 10. RECOVERABLE (Week 4) — typo'd action keyword ('FYND' -> 'FIND');
  //     exercises recovery on the expectOneOf() path in parseAction(),
  //     not just the single-token expect() path sample 9 exercises.
  `GET /books -> FYND all IN library_db`,
];

// NOTE (Week 3): parse() now returns { ast, symbolTable } since the
// parser builds the symbol table as a side effect of parsing. This file
// still only exercises the AST shape (Week 2 concern); see
// semantic/test-symbolTable.js for the Week 3 symbol-table-focused tests.
// NOTE (Week 4): parse() is now async (error recovery may call an API),
// and also returns `recoveryLog` — any ML/heuristic fixes applied while
// parsing this sample. See parser/mlRecovery.test.js for recovery-focused
// tests; this file's "broken" samples now mostly demonstrate recovery
// kicking in rather than always throwing outright.
async function run(src) {
  const tokens = tokenize(src);
  return parse(tokens);
}

async function main() {
  for (let idx = 0; idx < samples.length; idx++) {
    const src = samples[idx];
    console.log(`\n=== Sample ${idx + 1} ===`);
    console.log(`Input: ${JSON.stringify(src)}`);
    try {
      const { ast, recoveryLog } = await run(src);
      if (recoveryLog.length > 0) {
        console.log(`  (ML recovery applied ${recoveryLog.length} fix(es): ` +
          recoveryLog.map((r) => `${r.source}: -> '${r.value}'`).join(', ') + ')');
      }
      console.log(JSON.stringify(ast, null, 2));
    } catch (err) {
      console.log(`  -> Caught error as expected: ${err.message}`);
    }
  }
  console.log('\nAll samples processed.');
}

main();
