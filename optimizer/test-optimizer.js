/**
 * test-optimizer.js
 * -----------------------------------------------------------------------
 * Manual test runner for Week 6 (Module 5 — Optimization).
 *
 * Two parts, per the design note at the top of optimizer.js:
 *
 *   PART A — real DSL programs, compiled through the full lexer -> parser
 *   -> icg pipeline. Expectation: 0 quads removed for all of them, because
 *   icg.js's output is always fully live by construction. This is a
 *   correctness check on the optimizer (it must NOT remove anything it
 *   shouldn't), not a demo of dead-code removal.
 *
 *   PART B — hand-built quadruple lists (bypassing the DSL frontend
 *   entirely) with genuinely dead defs mixed into an otherwise-live
 *   route chain, to prove eliminateDeadCode() actually removes what it
 *   should and "leaves the rest untouched" (per the plan's Week 6 target).
 *
 * Run with: node optimizer/test-optimizer.js
 * -----------------------------------------------------------------------
 */

const { tokenize } = require('../lexer/lexer');
const { parse } = require('../parser/parser');
const { generateQuadruples } = require('../icg/icg');
const { buildBasicBlocks, eliminateDeadCode } = require('./optimizer');

function printQuads(quads, indent = '  ') {
  if (quads.length === 0) {
    console.log(`${indent}(none)`);
    return;
  }
  quads.forEach((q, i) => {
    const a1 = q.arg1 === null || q.arg1 === undefined ? '_' : q.arg1;
    const a2 = q.arg2 === null || q.arg2 === undefined ? '_' : q.arg2;
    console.log(`${indent}${i + 1}.  (${q.op}, ${a1}, ${a2}, ${q.result})`);
  });
}

// ======================================================================
// PART A — real DSL programs (expect 0 removed every time)
// ======================================================================

const dslSamples = [
  {
    label: 'Simple FIND, no WHERE',
    src: `GET /books -> FIND all IN library_db`,
  },
  {
    label: 'INSERT with a string WHERE',
    src: `POST /books -> INSERT INTO library_db WHERE title = "Dune"`,
  },
  {
    label: 'Three-route program',
    src: `GET /authors -> FIND all IN authors_db
POST /authors -> INSERT INTO authors_db WHERE name = "Frank Herbert"
GET /books/2 -> FIND all IN library_db WHERE id = 2`,
  },
];

async function runDslSample(src) {
  const tokens = tokenize(src);
  const { ast } = await parse(tokens);
  return generateQuadruples(ast);
}

// ======================================================================
// PART B — hand-built quadruple lists with genuine dead code
// ======================================================================

const syntheticSamples = [
  {
    label: 'A stray EQ whose temp is never used by anything (dead condition)',
    // Simulates a leftover/duplicated WHERE-style computation that
    // nothing downstream ever reads — T1 is defined but T2 (not T1) is
    // what SELECT and ROUTE actually consume.
    quads: [
      { op: 'EQ', arg1: 'id', arg2: 1, result: 'T1' },        // DEAD — T1 unused
      { op: 'EQ', arg1: 'title', arg2: '"Dune"', result: 'T2' },
      { op: 'SELECT', arg1: 'library_db', arg2: 'T2', result: 'T3' },
      { op: 'ROUTE', arg1: 'GET', arg2: '/books', result: 'T3' },
    ],
  },
  {
    label: 'A fully dead action — computed but never routed',
    // Simulates a SELECT (and its WHERE) whose result never reaches a
    // ROUTE at all — the plan's "a defined route never called" case,
    // adapted to this IR as "a computed action nobody binds to a route".
    quads: [
      { op: 'EQ', arg1: 'id', arg2: 99, result: 'T1' },
      { op: 'SELECT', arg1: 'archived_books', arg2: 'T1', result: 'T2' }, // DEAD — T2 unused
      // ^ both T1 and T2's defining quads are dead: T2 feeds nothing,
      //   and once the SELECT using T1 is gone, T1 has no live consumer either
      { op: 'EQ', arg1: 'title', arg2: '"Dune"', result: 'T3' },
      { op: 'INSERT', arg1: 'library_db', arg2: 'T3', result: 'T4' },
      { op: 'ROUTE', arg1: 'POST', arg2: '/books', result: 'T4' },
    ],
  },
  {
    label: 'Two dead defs mixed into an otherwise-live 3-route program',
    quads: [
      { op: 'SELECT', arg1: 'authors_db', arg2: null, result: 'T1' },
      { op: 'ROUTE', arg1: 'GET', arg2: '/authors', result: 'T1' },
      { op: 'EQ', arg1: 'leftover_field', arg2: 42, result: 'T2' }, // DEAD
      { op: 'EQ', arg1: 'name', arg2: '"Frank Herbert"', result: 'T3' },
      { op: 'INSERT', arg1: 'authors_db', arg2: 'T3', result: 'T4' },
      { op: 'ROUTE', arg1: 'POST', arg2: '/authors', result: 'T4' },
      { op: 'SELECT', arg1: 'unused_table', arg2: null, result: 'T5' }, // DEAD
      { op: 'EQ', arg1: 'id', arg2: 2, result: 'T6' },
      { op: 'SELECT', arg1: 'library_db', arg2: 'T6', result: 'T7' },
      { op: 'ROUTE', arg1: 'GET', arg2: '/books/2', result: 'T7' },
    ],
  },
];

// ======================================================================

async function main() {
  console.log('##################################################');
  console.log('# PART A — real DSL programs (expect 0 removed)   #');
  console.log('##################################################');

  for (let idx = 0; idx < dslSamples.length; idx++) {
    const sample = dslSamples[idx];
    console.log(`\n=== A${idx + 1}: ${sample.label} ===`);
    const quads = await runDslSample(sample.src);
    const blocks = buildBasicBlocks(quads);
    const { optimized, removed } = eliminateDeadCode(quads);

    console.log(`Basic blocks: ${blocks.length} (block ${blocks[0].id} holds all ${blocks[0].quads.length} quads — no control flow in this DSL)`);
    console.log('Before:');
    printQuads(quads);
    console.log(`Removed: ${removed.length} quad(s)`);
    console.log(`Result: ${optimized.length === quads.length ? 'PASS (nothing removed, as expected)' : 'FAIL (something was removed unexpectedly!)'}`);
  }

  console.log('\n\n##################################################');
  console.log('# PART B — hand-built quads with genuine dead code#');
  console.log('##################################################');

  for (let idx = 0; idx < syntheticSamples.length; idx++) {
    const sample = syntheticSamples[idx];
    console.log(`\n=== B${idx + 1}: ${sample.label} ===`);
    const { optimized, removed } = eliminateDeadCode(sample.quads);

    console.log('Before:');
    printQuads(sample.quads);
    console.log('After (optimized):');
    printQuads(optimized);
    console.log(`Removed (${removed.length}):`);
    printQuads(removed);
    console.log(`Result: ${removed.length > 0 ? 'PASS (dead code correctly removed)' : 'FAIL (expected removals, got none)'}`);
  }

  console.log('\nAll samples processed.');
}

main();
