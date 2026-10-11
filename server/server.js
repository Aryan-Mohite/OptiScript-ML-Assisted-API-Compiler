/**
 * server/server.js
 * -----------------------------------------------------------------------
 * Small Express API — the one place where the compiler and the database
 * meet. The React playground talks to this.
 *
 *   POST /compile   { source }  compile only (no database involved)
 *   POST /run       { source }  compile, then run the compiler's SQL on the
 *                               database. Only SQL that the compiler
 *                               produced is ever executed.
 *   POST /db/reset              reload db/schema.sql + db/data.sql
 *   GET  /health
 *
 * Compile problems are reported inside result.errors (HTTP 200), same as
 * before. Database problems are reported as result.dbError, so the
 * compile phases still show even when MySQL is off.
 * -----------------------------------------------------------------------
 */

'use strict';

require('./loadEnv')(); // reads .env (ML + DB settings) before anything else

const express = require('express');
const { compile } = require('../compiler/compiler');
const { runQueries, setupDatabase } = require('./dbRunner');

const app = express();
app.use(express.json());

// Shared request check: the body must be { source: '<text>' }.
function readSource(req, res) {
  const { source } = req.body || {};
  if (typeof source === 'string') return source;
  res.status(400).json({
    errors: [{ phase: 'request', name: 'BadRequest', message: "Expected JSON body { source: '<OptiScript text>' }" }],
  });
  return null;
}

app.post('/compile', async (req, res) => {
  const source = readSource(req, res);
  if (source === null) return;
  try {
    res.json(await compile(source));
  } catch (err) {
    // Should be unreachable — compile() reports every phase error itself.
    res.status(500).json({ errors: [{ phase: 'server', name: 'InternalError', message: err.message }] });
  }
});

app.post('/run', async (req, res) => {
  const source = readSource(req, res);
  if (source === null) return;
  try {
    const result = await compile(source);
    result.dbResults = null;
    result.dbError = null;

    // Nothing to run if compilation failed.
    if (result.errors.length === 0 && result.queries) {
      try {
        result.dbResults = await runQueries(result.queries);
      } catch (err) {
        result.dbError = `Could not reach the database: ${err.message}`;
      }
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ errors: [{ phase: 'server', name: 'InternalError', message: err.message }] });
  }
});

app.post('/db/reset', async (_req, res) => {
  try {
    await setupDatabase();
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', message: `Could not reset the database: ${err.message}` });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;

// Only auto-start when run directly (`node server/server.js`), so requiring
// this file from a test doesn't also bind a port.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`OptiScript API listening on http://localhost:${PORT}`);
    const ml = require('../compiler/parser/mlRecovery').configuredProviders().map((p) => p.name);
    console.log(ml.length ? `ML error recovery: ${ml.join(' -> ')}` : 'ML error recovery: offline heuristic only (no API key set)');
  });
}

module.exports = app;
