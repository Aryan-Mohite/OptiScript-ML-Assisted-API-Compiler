/**
 * test-icg.js
 * -----------------------------------------------------------------------
 * Manual test runner for Week 5 (Module 4 — Intermediate Code / Quadruples).
 *
 * Each sample runs lexer -> parser -> ICG and prints the resulting
 * quadruple list, so you can eyeball that it logically matches the DSL
 * input (this is what the plan calls "verify they logically match the
 * DSL input" and is good material for the report/viva).
 *
 * Run with: node icg/test-icg.js
 * -----------------------------------------------------------------------
 */

const { tokenize } = require('../lexer/lexer');
const { parse } = require('../parser/parser');
const { generateQuadruples } = require('./icg');

const samples = [
  {
    label: 'Simple FIND, no WHERE',
    src: `GET /books -> FIND all IN library_db`,
  },
  {
    label: 'FIND with a numeric WHERE',
    src: `GET /books/1 -> FIND all IN library_db WHERE id = 1`,
  },
  {
    label: 'INSERT with a string WHERE',
    src: `POST /books -> INSERT INTO library_db WHERE title = "Dune"`,
  },
  {
    label: 'Multi-segment path + numeric WHERE',
    src: `GET /order_items/1024 -> FIND all IN order_items_table WHERE id = 1024`,
  },
  {
    label: 'Multiple routes in one program (temp counter keeps climbing)',
    src: `GET /authors -> FIND all IN authors_db
POST /authors -> INSERT INTO authors_db WHERE name = "Frank Herbert"
GET /books/2 -> FIND all IN library_db WHERE id = 2`,
  },
  {
    label: 'Same table hit by two different routes (FIND then INSERT)',
    src: `GET /books -> FIND all IN library_db WHERE id = 1
POST /books/1 -> INSERT INTO library_db WHERE id = 1`,
  },
];

async function run(src) {
  const tokens = tokenize(src);
  const { ast } = await parse(tokens);
  return generateQuadruples(ast);
}

async function main() {
  for (let idx = 0; idx < samples.length; idx++) {
    const sample = samples[idx];
    console.log(`\n=== Sample ${idx + 1}: ${sample.label} ===`);
    console.log(`Input:\n${sample.src}\n`);
    const quads = await run(sample.src);
    quads.forEach((q, i) => console.log(`  ${i + 1}.  ${q.toString()}`));
  }
  console.log('\nAll samples processed.');
}

main();
