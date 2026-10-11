/**
 * test-compiler.js
 * -----------------------------------------------------------------------
 * End-to-end test for compile() — the full lexer -> parser -> icg ->
 * optimizer -> codegen pipeline in one call, per the plan's Week 7
 * target ("Test end-to-end with your Library API example from the PRD
 * and 2-3 other DSL scripts. Confirm output code is actually valid").
 *
 * Covers:
 *   - the PRD's own Library API example, verbatim
 *   - a clean multi-route program
 *   - a hard error (duplicate route -> SymbolTableError) — confirms
 *     compile() returns a typed error instead of throwing
 *   - a Week-4-recoverable typo (GRT -> GET) — confirms recoveryLog
 *     comes back populated and compilation still succeeds end-to-end
 *
 * Run with: node test-compiler.js
 * -----------------------------------------------------------------------
 */

// Keep this suite offline + deterministic even if real ML keys are set.
for (const k of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY']) delete process.env[k];

const { compile } = require('./compiler');

const samples = [
  {
    label: "PRD's own Library API example (verbatim)",
    src: `GET /books -> FIND all IN library_db`,
    expectError: false,
  },
  {
    label: 'Clean multi-route program',
    src: `GET /authors -> FIND all IN authors_db
POST /authors -> INSERT INTO authors_db WHERE name = "Frank Herbert"
GET /books/2 -> FIND all IN library_db WHERE id = 2`,
    expectError: false,
  },
  {
    label: 'Hard error — duplicate route (semantic, from Week 3)',
    src: `GET /books -> FIND all IN library_db
GET /books -> FIND all IN library_db`,
    expectError: true,
  },
  {
    label: 'ML-recoverable typo (GRT -> GET, from Week 4)',
    src: `GRT /books -> FIND all IN library_db`,
    expectError: false,
    expectRecovery: true,
  },
  {
    label: "Missing token mid-line: no '->' (recovered by insertion)",
    src: `GET /books FIND all IN library_db`,
    expectError: false,
    expectRecovery: true,
    expectAction: 'insert',
  },
  {
    label: "Missing keyword: no 'IN' (recovered by insertion)",
    src: `GET /books -> FIND all library_db`,
    expectError: false,
    expectRecovery: true,
    expectAction: 'insert',
  },
  {
    label: 'Incomplete program (ends early) is NOT guessed — clear ParserError',
    src: `GET /books`,
    expectError: true,
  },
  {
    label: 'Ambiguous choice (FIND or INSERT?) is NOT guessed — clear ParserError',
    src: `GET /books -> all IN library_db`,
    expectError: true,
  },
];

async function main() {
  let allOk = true;

  for (let idx = 0; idx < samples.length; idx++) {
    const sample = samples[idx];
    console.log(`\n=== ${idx + 1}. ${sample.label} ===`);
    console.log(`Input:\n${sample.src}`);

    const result = await compile(sample.src);

    if (sample.expectError) {
      const ok = result.errors.length > 0 && result.expressCode === null;
      console.log(`Errors: ${JSON.stringify(result.errors)}`);
      console.log(ok ? 'PASS (compile() returned a typed error, did not throw)' : 'FAIL');
      if (!ok) allOk = false;
      continue;
    }

    const ok = result.errors.length === 0 && result.expressCode !== null && result.sqlCode !== null;
    console.log(`Quadruples: ${result.quadruples.length}, optimized: ${result.optimizedQuadruples.length}, removed: ${result.removedQuadruples.length}`);
    console.log(`SQL:\n${result.sqlCode}`);

    if (sample.expectRecovery) {
      const recovered = result.recoveryLog && result.recoveryLog.length > 0;
      console.log(`Recovery log: ${JSON.stringify(result.recoveryLog)}`);
      console.log(recovered ? 'PASS (ML/heuristic recovery kicked in, still compiled clean)' : 'FAIL (expected a recovery entry)');
      if (!recovered) allOk = false;
      if (sample.expectAction) {
        const actionOk = result.recoveryLog.some((r) => r.action === sample.expectAction);
        console.log(actionOk ? `PASS (recovery action was '${sample.expectAction}')` : `FAIL (expected action '${sample.expectAction}')`);
        if (!actionOk) allOk = false;
      }
    }

    console.log(ok ? 'PASS (compiled with no errors, express + SQL generated)' : 'FAIL');
    if (!ok) allOk = false;
  }

  // ---- Output contract: `queries` is what a database receives ----
  const assertEq = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) {
      console.log(`  expected ${JSON.stringify(expected)}\n  got      ${JSON.stringify(actual)}`);
      allOk = false;
    }
  };
  console.log('\n=== queries (compiler output that a database can run) ===');
  assertEq('plain FIND', (await compile('GET /books -> FIND all IN library_db')).queries,
    [{ method: 'GET', path: '/books', sql: 'SELECT * FROM `library_db`', params: [], runnable: true }]);
  assertEq('FIND with number WHERE -> params [1]', (await compile('GET /b/1 -> FIND all IN library_db WHERE id = 1')).queries[0].params, [1]);
  assertEq('INSERT with string WHERE', (await compile('POST /b -> INSERT INTO library_db WHERE title = "Dune"')).queries[0],
    { method: 'POST', path: '/b', sql: 'INSERT INTO `library_db` (`title`) VALUES (?)', params: ['Dune'], runnable: true });
  assertEq('INSERT with no WHERE is flagged not runnable', (await compile('POST /l -> INSERT INTO logs_db')).queries[0].runnable, false);
  assertEq('a broken program has no queries', (await compile('GET /a')).queries, null);

  // ---- Isolation: the compiler must know nothing about databases ----
  // Check what Node ACTUALLY loaded, not what the text says (codegen's
  // output text mentions require('./db'), but that is output, not an import).
  const path = require('path');
  const outside = Object.keys(require.cache).filter(
    (file) => !file.includes('node_modules') && !file.startsWith(__dirname + path.sep)
  );
  assertEq('every module the compiler loaded lives inside compiler/', outside, []);
  assertEq('mysql2 was never loaded by the compiler', Object.keys(require.cache).some((k) => k.includes('mysql2')), false);

  console.log(`\n${allOk ? 'All end-to-end samples behaved as expected.' : 'SOME SAMPLES FAILED — see above.'}`);
  if (!allOk) process.exit(1);
}

main();
