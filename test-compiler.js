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
    }

    console.log(ok ? 'PASS (compiled with no errors, express + SQL generated)' : 'FAIL');
    if (!ok) allOk = false;
  }

  console.log(`\n${allOk ? 'All end-to-end samples behaved as expected.' : 'SOME SAMPLES FAILED — see above.'}`);
  if (!allOk) process.exit(1);
}

main();
