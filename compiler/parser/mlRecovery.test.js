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
const { attemptRecovery, heuristicSuggest, levenshtein, suggestInsertion, configuredProviders } = require('./mlRecovery');

// Keep the suite offline + deterministic even if the developer has real
// keys set in their shell. The provider tests below use a fake fetch().
const ENV_KEYS = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY', 'ML_PROVIDER', 'GEMINI_MODEL', 'ANTHROPIC_MODEL'];
for (const k of ENV_KEYS) delete process.env[k];

// Runs fn with a fake global fetch and the given env vars, then restores both.
async function withFake(env, fakeFetch, fn) {
  const realFetch = global.fetch;
  Object.assign(process.env, env);
  global.fetch = fakeFetch;
  try {
    await fn();
  } finally {
    global.fetch = realFetch;
    for (const k of ENV_KEYS) delete process.env[k];
  }
}
const jsonResponse = (body, ok = true) => ({ ok, json: async () => body });
const geminiReply = (obj) => jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
const anthropicReply = (obj) => jsonResponse({ content: [{ type: 'text', text: JSON.stringify(obj) }] });
const ctx = { badToken: { type: 'KEYWORD', value: 'FIND' }, expected: 'ARROW', contextTokens: [{ value: '/books' }], line: 1 };

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

  // ---- Gemini / Anthropic providers (fake fetch, no network) ----

  await test('provider order: Gemini first by default, ML_PROVIDER overrides', () => {
    process.env.GEMINI_API_KEY = 'g';
    process.env.ANTHROPIC_API_KEY = 'a';
    assert.deepStrictEqual(configuredProviders().map((p) => p.name), ['gemini', 'anthropic']);
    process.env.ML_PROVIDER = 'anthropic';
    assert.deepStrictEqual(configuredProviders().map((p) => p.name), ['anthropic', 'gemini']);
    for (const k of ENV_KEYS) delete process.env[k];
    assert.deepStrictEqual(configuredProviders(), []);
  });

  await test('Gemini: valid answer is used, sent to the Gemini endpoint with the key header', async () => {
    let seen;
    await withFake({ GEMINI_API_KEY: 'test-key' }, async (url, opts) => {
      seen = { url, headers: opts.headers };
      return geminiReply({ corrected: true, action: 'insert', type: 'ARROW', value: '->' });
    }, async () => {
      const r = await attemptRecovery(ctx);
      assert.strictEqual(r.source, 'ml');
      assert.strictEqual(r.provider, 'gemini');
      assert.strictEqual(r.action, 'insert');
      assert.strictEqual(r.value, '->');
    });
    assert.ok(seen.url.includes('generativelanguage.googleapis.com'));
    assert.ok(seen.url.includes('gemini-2.5-flash'));
    assert.strictEqual(seen.headers['x-goog-api-key'], 'test-key');
  });

  await test('Gemini: GEMINI_MODEL env var changes the model used', async () => {
    let url;
    await withFake({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-2.5-flash-lite' }, async (u) => {
      url = u;
      return geminiReply({ corrected: false });
    }, async () => { await attemptRecovery(ctx); });
    assert.ok(url.includes('gemini-2.5-flash-lite'));
  });

  await test('Gemini fails (HTTP error) -> falls through to Anthropic', async () => {
    await withFake({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' }, async (url) => {
      if (url.includes('googleapis')) return jsonResponse({}, false);
      return anthropicReply({ corrected: true, type: 'KEYWORD', value: 'GET' });
    }, async () => {
      const r = await attemptRecovery(ctx);
      assert.strictEqual(r.provider, 'anthropic');
      assert.strictEqual(r.action, 'replace'); // action defaults to replace
    });
  });

  await test('hallucinated token type is rejected -> heuristic fallback', async () => {
    await withFake({ GEMINI_API_KEY: 'g' }, async () => geminiReply({ corrected: true, type: 'BANANA', value: 'x' }), async () => {
      const r = await attemptRecovery({ badToken: { value: 'GRT' }, expected: 'KEYWORD', contextTokens: [], line: 1 });
      assert.strictEqual(r.source, 'heuristic');
      assert.strictEqual(r.value, 'GET');
    });
  });

  await test('network error / garbage text never throws -> clean fallback', async () => {
    await withFake({ GEMINI_API_KEY: 'g' }, async () => { throw new Error('offline'); }, async () => {
      const r = await attemptRecovery(ctx);
      assert.strictEqual(r.corrected, false);
    });
    await withFake({ GEMINI_API_KEY: 'g' }, async () => jsonResponse({ candidates: [{ content: { parts: [{ text: 'sorry, no JSON' }] } }] }), async () => {
      const r = await attemptRecovery(ctx);
      assert.strictEqual(r.corrected, false);
    });
  });

  // ---- insertion logic ----

  await test('suggestInsertion: single expected symbol -> that symbol (ARROW -> ->)', () => {
    assert.deepStrictEqual(suggestInsertion([{ type: 'ARROW', value: undefined }]), { type: 'ARROW', value: '->' });
  });

  await test('suggestInsertion: single expected keyword -> that keyword', () => {
    assert.deepStrictEqual(suggestInsertion([{ type: 'KEYWORD', value: 'IN' }]), { type: 'KEYWORD', value: 'IN' });
  });

  await test('suggestInsertion: refuses to guess (GET|POST, or IDENTIFIER)', () => {
    assert.strictEqual(suggestInsertion([{ type: 'KEYWORD', value: 'GET' }, { type: 'KEYWORD', value: 'POST' }]), null);
    assert.strictEqual(suggestInsertion([{ type: 'IDENTIFIER', value: undefined }]), null);
  });

  await test('attemptRecovery: a stray valid keyword (FIND where -> expected) is not a "fix"', async () => {
    const r = await attemptRecovery(ctx); // heuristic matches FIND to itself -> filtered out
    assert.strictEqual(r.corrected, false);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
