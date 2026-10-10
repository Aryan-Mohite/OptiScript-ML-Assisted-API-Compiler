/**
 * mlRecovery.test.js
 * Run with: node parser/mlRecovery.test.js
 * (or wire up `npm run test:mlrecovery` — see docs/week4-integration.md)
 *
 * These tests deliberately do NOT set ANTHROPIC_API_KEY, so they always
 * exercise the offline heuristic + fallback path. That keeps the test
 * suite deterministic and runnable with no network / no API key —
 * important for a repeatable demo.
 */

'use strict';

const assert = require('assert');
const { attemptRecovery, heuristicSuggest, levenshtein } = require('./mlRecovery');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

async function run() {
  console.log('mlRecovery.js test suite\n');

  await test('levenshtein: identical strings -> 0', () => {
    assert.strictEqual(levenshtein('GET', 'GET'), 0);
  });

  await test('levenshtein: one-char typo -> 1', () => {
    assert.strictEqual(levenshtein('GRT', 'GET'), 1);
  });

  await test('heuristicSuggest: fixes a one-letter keyword typo (GRT -> GET)', () => {
    const result = heuristicSuggest('GRT');
    assert.ok(result, 'expected a suggestion');
    assert.strictEqual(result.value, 'GET');
    assert.strictEqual(result.type, 'KEYWORD');
  });

  await test('heuristicSuggest: fixes a keyword typo (INSRT -> INSERT)', () => {
    const result = heuristicSuggest('INSRT');
    assert.ok(result, 'expected a suggestion');
    assert.strictEqual(result.value, 'INSERT');
    assert.strictEqual(result.type, 'KEYWORD');
  });

  // NOTE: a lone stray character like '-' or '!' never actually reaches
  // the parser (and so never reaches this module) — lexer.js throws a
  // LexerError on any character outside its known symbol/alpha/digit/
  // quote set *before* tokenizing gets that far. So the only "symbol"
  // typos this module realistically ever sees are already-valid symbols
  // used in the wrong grammar position (e.g. '=' where '->' was
  // expected) — and those correctly fail to "self-correct" below, since
  // edit distance from a symbol to itself is 0 and there's nothing to fix.
  await test('heuristicSuggest: a symbol used in the wrong position matches itself (no-op), not something else', () => {
    const result = heuristicSuggest('=');
    assert.ok(result, 'expected a suggestion');
    assert.strictEqual(result.value, '='); // matches itself — parser.js's
    // _recoverOrThrow() detects this no-op and falls back to a normal
    // ParserError instead of looping (see parser/parser.js).
  });

  await test('heuristicSuggest: refuses to guess on something unrelated', () => {
    const result = heuristicSuggest('library_db');
    assert.strictEqual(result, null);
  });

  await test('heuristicSuggest: handles null/empty input without throwing', () => {
    assert.strictEqual(heuristicSuggest(null), null);
    assert.strictEqual(heuristicSuggest(''), null);
  });

  await test('attemptRecovery: corrects a broken script via heuristic (no API key set)', async () => {
    // Simulates: "GRT /books -> FIND all IN library_db"  (typo: GRT instead of GET)
    const result = await attemptRecovery({
      badToken: { type: 'IDENTIFIER', value: 'GRT' },
      expected: 'KEYWORD (GET|POST)',
      contextTokens: [
        { value: 'GRT' },
        { value: '/books' },
        { value: '->' },
      ],
      line: 1,
    });
    assert.strictEqual(result.corrected, true);
    assert.strictEqual(result.value, 'GET');
    assert.strictEqual(result.source, 'heuristic');
  });

  await test('attemptRecovery: falls back cleanly on an unrecoverable error (no key, no close match)', async () => {
    // Simulates something genuinely broken, not a typo of a known token
    const result = await attemptRecovery({
      badToken: { type: 'IDENTIFIER', value: '12345$$$' },
      expected: 'ROUTE PATH',
      contextTokens: [{ value: '12345$$$' }],
      line: 3,
    });
    assert.strictEqual(result.corrected, false);
    assert.strictEqual(result.source, 'none');
  });

  await test('attemptRecovery: handles EOF (badToken = null) without throwing', async () => {
    const result = await attemptRecovery({
      badToken: null,
      expected: 'SYMBOL (->)',
      contextTokens: [{ value: '/books' }],
      line: 1,
    });
    assert.strictEqual(typeof result.corrected, 'boolean');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
