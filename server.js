/**
 * server.js
 * -----------------------------------------------------------------------
 * Small Express API wrapping compile() (Week 7 — "Expose it via a small
 * Express backend API endpoint"). This is the backend the Week 8 React
 * playground will call.
 *
 * POST /compile
 *   body: { "source": "<OptiScript DSL text>" }
 *   response: the full compile() result — see compiler.js for the shape.
 *   Always responds 200 with a JSON body; compilation errors are
 *   reported inside result.errors (per compiler.js's design — the
 *   pipeline never throws), so an empty errors array plus a non-null
 *   expressCode is how a caller knows compilation actually succeeded.
 * -----------------------------------------------------------------------
 */

'use strict';

const express = require('express');
const { compile } = require('./compiler');

const app = express();
app.use(express.json());

app.post('/compile', async (req, res) => {
  const { source } = req.body || {};

  if (typeof source !== 'string') {
    return res.status(400).json({
      errors: [{ phase: 'request', name: 'BadRequest', message: "Expected JSON body { source: '<OptiScript text>' }" }],
    });
  }

  try {
    const result = await compile(source);
    res.json(result);
  } catch (err) {
    // Should be unreachable — compile() catches every typed phase error
    // itself — but a defensive 500 here beats an unhandled rejection
    // taking the server down if something truly unexpected happens.
    res.status(500).json({
      errors: [{ phase: 'server', name: 'InternalError', message: err.message }],
    });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;

// Only auto-start when run directly (`node server.js`), so requiring
// this file from a test doesn't also bind a port.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`OptiScript compiler API listening on http://localhost:${PORT}`);
    console.log(`Try: curl -X POST http://localhost:${PORT}/compile -H "Content-Type: application/json" -d '{"source":"GET /books -> FIND all IN library_db"}'`);
  });
}

module.exports = app;
