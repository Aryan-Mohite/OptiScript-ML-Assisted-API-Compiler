/**
 * server/test-bridge.js — `npm run test:db`
 * -----------------------------------------------------------------------
 * Integration test of the whole chain with a REAL MySQL:
 *   OptiScript source -> compiler -> queries -> database -> results
 * Needs MySQL running (DB_* in .env). Uses its own database,
 * "optiscript_test", so your demo data is never touched.
 * -----------------------------------------------------------------------
 */

'use strict';

// Must be set BEFORE dbRunner reads the config. Real env vars win over .env.
process.env.DB_NAME = 'optiscript_test';
for (const k of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY']) delete process.env[k];

const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');
const { compile } = require('../compiler/compiler');
const { setupDatabase, runQueries } = require('./dbRunner');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}\n        ${err.message}`);
    failed++;
  }
}

// source -> compiler -> database, exactly like POST /run does it
async function run(source) {
  const result = await compile(source);
  assert.deepStrictEqual(result.errors, [], 'program should compile');
  return runQueries(result.queries);
}

async function main() {
  console.log('Compiler -> DB integration tests (database: optiscript_test)\n');

  try {
    await setupDatabase();
  } catch (err) {
    console.error(`Cannot reach MySQL: ${err.message}`);
    console.error('Start MySQL and set DB_USER / DB_PASSWORD in .env (see .env.example), then retry.');
    process.exit(1);
  }

  await test('plain FIND returns every sample row', async () => {
    const [r] = await run('GET /books -> FIND all IN library_db');
    assert.strictEqual(r.status, 'ok');
    assert.strictEqual(r.rowCount, 3);
  });

  await test('WHERE id = 1 returns only that row', async () => {
    const [r] = await run('GET /b/1 -> FIND all IN library_db WHERE id = 1');
    assert.deepStrictEqual(r.rows.map((x) => x.title), ['Dune']);
  });

  await test('WHERE year = 1984 (number) returns Neuromancer', async () => {
    const [r] = await run('GET /b -> FIND all IN library_db WHERE year = 1984');
    assert.deepStrictEqual(r.rows.map((x) => x.title), ['Neuromancer']);
  });

  await test('WHERE with a string value matches', async () => {
    const [r] = await run('GET /m -> FIND all IN members_db WHERE name = "Asha"');
    assert.strictEqual(r.rowCount, 1);
    assert.strictEqual(r.rows[0].email, 'asha@example.com');
  });

  await test('SQL-injection text in a value returns no rows and damages nothing', async () => {
    const [r] = await run(`GET /s -> FIND all IN library_db WHERE title = "x' OR '1'='1"`);
    assert.strictEqual(r.rowCount, 0);
    const [after] = await run('GET /books -> FIND all IN library_db');
    assert.strictEqual(after.rowCount, 3);
  });

  await test('INSERT reports insertId and the row is really there', async () => {
    const [ins] = await run('POST /b -> INSERT INTO library_db WHERE title = "Dune II"');
    assert.strictEqual(ins.kind, 'insert');
    assert.strictEqual(ins.affectedRows, 1);
    const [sel] = await run(`GET /b/${ins.insertId} -> FIND all IN library_db WHERE id = ${ins.insertId}`);
    assert.strictEqual(sel.rows[0].title, 'Dune II');
  });

  await test('several routes run in order, results line up with the routes', async () => {
    const out = await run(`GET /a -> FIND all IN authors_db
GET /m -> FIND all IN members_db`);
    assert.deepStrictEqual(out.map((r) => [r.path, r.rowCount]), [['/a', 3], ['/m', 2]]);
  });

  await test('missing table -> an error result for that query, the others still run', async () => {
    const out = await run(`GET /ghost -> FIND all IN table_that_does_not_exist
GET /a -> FIND all IN authors_db`);
    assert.strictEqual(out[0].status, 'error');
    assert.ok(out[0].error.length > 0);
    assert.strictEqual(out[1].status, 'ok');
  });

  await test('INSERT without WHERE is skipped, never sent to the database', async () => {
    const [r] = await run('POST /l -> INSERT INTO members_db');
    assert.strictEqual(r.status, 'skipped');
  });

  await test('setupDatabase() resets everything back to the sample data', async () => {
    await setupDatabase();
    const [r] = await run('GET /books -> FIND all IN library_db');
    assert.strictEqual(r.rowCount, 3); // the "Dune II" row is gone
  });

  await test('HTTP: POST /run compiles and returns dbResults', async () => {
    const app = require('./server');
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

      const ok = await (await post('/run', { source: 'GET /books -> FIND all IN library_db' })).json();
      assert.strictEqual(ok.dbError, null);
      assert.strictEqual(ok.dbResults[0].rowCount, 3);
      assert.ok(ok.expressCode.includes("app.get('/books'"), 'compile output is still returned');

      const bad = await (await post('/run', { source: 'GET /books' })).json(); // does not compile
      assert.ok(bad.errors.length > 0);
      assert.strictEqual(bad.dbResults, null); // nothing reached the database

      assert.strictEqual((await post('/run', {})).status, 400);

      await post('/run', { source: 'POST /b -> INSERT INTO library_db WHERE title = "X"' });
      assert.strictEqual((await (await post('/db/reset', {})).json()).status, 'ok');
      const after = await (await post('/run', { source: 'GET /books -> FIND all IN library_db' })).json();
      assert.strictEqual(after.dbResults[0].rowCount, 3);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await test('HTTP: database down -> compile still returned, dbError set (not a crash)', async () => {
    const script = `
      const app = require('./server/server');
      const s = app.listen(0, async () => {
        const r = await fetch('http://127.0.0.1:' + s.address().port + '/run', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'GET /books -> FIND all IN library_db' }) });
        const b = await r.json();
        console.log(JSON.stringify({ status: r.status, hasCode: !!b.expressCode, dbError: b.dbError, dbResults: b.dbResults }));
        process.exit(0);
      });`;
    const out = execFileSync(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, DB_PORT: '1' }, // nothing listens on port 1
    }).toString();
    const r = JSON.parse(out.trim().split('\n').pop());
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.hasCode, true);
    assert.ok(r.dbError && r.dbError.startsWith('Could not reach the database'));
    assert.strictEqual(r.dbResults, null);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
