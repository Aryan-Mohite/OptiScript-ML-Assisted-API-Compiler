/**
 * test-lexer.js
 * -----------------------------------------------------------------------
 * Simple manual test runner for lexer.js (Week 1 deliverable).
 * Not a formal test framework (Jest/Mocha) — just a script that runs the
 * lexer over sample DSL snippets and prints the resulting token arrays,
 * per phases.md Week 1 Day 5: "print tokens for each".
 *
 * Run with: node lexer/test-lexer.js
 * -----------------------------------------------------------------------
 */

const { tokenize } = require('./lexer');

const samples = [
  // 1. Basic GET/FIND
  `GET /books -> FIND all IN library_db`,

  // 2. POST/INSERT with a WHERE clause and string literal
  `POST /books -> INSERT INTO library_db WHERE title = "Dune"`,

  // 3. GET with numeric filter
  `GET /books/1 -> FIND all IN library_db WHERE id = 1`,

  // 4. Multiple statements across lines
  `GET /authors -> FIND all IN authors_db
POST /authors -> INSERT INTO authors_db WHERE name = "Frank Herbert"`,

  // 5. With a comment line
  `# fetch all members
GET /members -> FIND all IN members_db`,

  // 6. Extra whitespace / tabs
  `GET    /books   ->    FIND   all   IN   library_db`,

  // 7. Underscored identifiers and multi-digit numbers
  `GET /order_items/1024 -> FIND all IN order_items_table WHERE id = 1024`,

  // 8. Empty-ish program (just a comment, should yield only EOF)
  `# nothing here yet`,

  // 9. INTENTIONALLY BROKEN — unrecognized character '@'
  `GET /books -> FIND all IN library@db`,

  // 10. INTENTIONALLY BROKEN — unterminated string literal
  `POST /books -> INSERT INTO library_db WHERE title = "Dune`,
];

function printTokens(tokens) {
  tokens.forEach((t, i) => {
    const val = t.value === null ? '' : JSON.stringify(t.value);
    console.log(`  [${i}] ${t.type.padEnd(11)} ${val}  (line ${t.line})`);
  });
}

samples.forEach((src, idx) => {
  console.log(`\n=== Sample ${idx + 1} ===`);
  console.log(`Input: ${JSON.stringify(src)}`);
  try {
    const tokens = tokenize(src);
    printTokens(tokens);
  } catch (err) {
    console.log(`  -> Caught error as expected: ${err.message}`);
  }
});

console.log('\nAll samples processed.');
