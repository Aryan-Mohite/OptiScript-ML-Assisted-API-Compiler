/**
 * test-codegen.js
 * -----------------------------------------------------------------------
 * Manual test runner for Week 7 (Module 6 — Code Generation).
 *
 * Runs full DSL programs through lexer -> parser -> icg -> optimizer ->
 * codegen, prints the generated Express code + SQL for each, and
 * syntax-checks the generated JS with Node's `vm` module (compiles it
 * without executing it — we don't have a real MySQL/Express install
 * wired up here, but a SyntaxError would mean the generated code is
 * definitely broken, which is the "confirm output code is actually
 * valid" check the plan asks for at this stage).
 *
 * Run with: node codegen/test-codegen.js
 * -----------------------------------------------------------------------
 */

const vm = require('vm');
const { tokenize } = require('../lexer/lexer');
const { parse } = require('../parser/parser');
const { generateQuadruples } = require('../icg/icg');
const { eliminateDeadCode } = require('../optimizer/optimizer');
const { generateCode } = require('./codegen');

const samples = [
  {
    label: 'PRD Library API example',
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
    label: 'Multi-route program (mixed GET/POST, some with WHERE)',
    src: `GET /authors -> FIND all IN authors_db
POST /authors -> INSERT INTO authors_db WHERE name = "Frank Herbert"
GET /books/2 -> FIND all IN library_db WHERE id = 2`,
  },
];

async function compileToCode(src) {
  const tokens = tokenize(src);
  const { ast } = await parse(tokens);
  const quads = generateQuadruples(ast);
  const { optimized } = eliminateDeadCode(quads);
  return generateCode(optimized);
}

function checkSyntaxValid(code, label) {
  try {
    new vm.Script(code, { filename: `${label}.generated.js` });
    return { valid: true };
  } catch (err) {
    return { valid: false, message: err.message };
  }
}

async function main() {
  let allValid = true;

  for (let idx = 0; idx < samples.length; idx++) {
    const sample = samples[idx];
    console.log(`\n=== Sample ${idx + 1}: ${sample.label} ===`);
    console.log(`Input:\n${sample.src}\n`);

    const { expressCode, sqlStatements, routeCount } = await compileToCode(sample.src);

    console.log(`Generated SQL (${routeCount} route(s)):`);
    sqlStatements.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

    console.log('\nGenerated Express code:');
    console.log(expressCode);

    const check = checkSyntaxValid(expressCode, `sample${idx + 1}`);
    if (check.valid) {
      console.log('Syntax check: PASS (valid JavaScript)');
    } else {
      console.log(`Syntax check: FAIL — ${check.message}`);
      allValid = false;
    }
  }

  // Edge case: INSERT with no WHERE — should not crash codegen, should
  // emit the flagged TODO comment instead of invalid SQL.
  console.log(`\n=== Edge case: INSERT with no WHERE (no data to insert) ===`);
  const { expressCode, sqlStatements } = await compileToCode(`POST /logs -> INSERT INTO logs_db`);
  console.log('Generated SQL:', sqlStatements[0]);
  const edgeCheck = checkSyntaxValid(expressCode, 'edge-case');
  console.log(`Syntax check: ${edgeCheck.valid ? 'PASS' : `FAIL — ${edgeCheck.message}`}`);
  if (!edgeCheck.valid) allValid = false;

  console.log(`\n${allValid ? 'All samples produced syntactically valid Express code.' : 'SOME SAMPLES FAILED THE SYNTAX CHECK — see above.'}`);
  if (!allValid) process.exit(1);
}

main();
