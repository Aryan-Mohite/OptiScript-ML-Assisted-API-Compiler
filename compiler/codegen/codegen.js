/**
 * codegen.js
 * -----------------------------------------------------------------------
 * Target Code Generation (Week 7 — Module 6).
 *
 * Consumes the OPTIMIZED quadruple list (post dead-code elimination) and
 * produces:
 *   - `expressCode` — one self-contained Express.js router file (string)
 *   - `sqlStatements` — the SQL string for each route, for the report
 *   - `queries` — one { method, path, sql, params, runnable } per route:
 *     the compiler's SQL output in a form a database can execute. This
 *     is the ONLY thing the database side ever receives from the compiler.
 *
 * How it reads the quads:
 *   ROUTE quads are the entry points. Each ROUTE's `result` field is a
 *   REFERENCE to the temp its action (SELECT/INSERT) produced — same
 *   convention optimizer.js relies on (see its design note). So codegen
 *   builds a temp->defining-quad index once, then for each ROUTE quad
 *   looks up its action quad, and (if the action has a WHERE) that
 *   action quad's arg2 is itself a temp pointing at the EQ quad that
 *   defined the condition.
 *
 * SQL safety note: values are NEVER string-concatenated into the SQL
 * text. Every WHERE/INSERT value becomes a `?` placeholder with the
 * real value passed separately as a query parameter — standard
 * parameterized-query practice, avoids SQL injection in the generated
 * code even though this is a small student compiler project.
 * -----------------------------------------------------------------------
 */

'use strict';

function isTemp(v) {
  return typeof v === 'string' && /^T\d+$/.test(v);
}

// Ops whose `result` field is a genuine new definition. ROUTE's `result`
// is a REFERENCE to its action's existing temp (see optimizer.js's
// design note on the same convention) — treating it as a definition too
// would overwrite the real SELECT/INSERT entry with a self-reference to
// the ROUTE quad itself.
const DEFINING_OPS = new Set(['EQ', 'SELECT', 'INSERT']);

// temp name -> the quad that defined it (its `result` field == that temp)
function buildTempIndex(quads) {
  const definedBy = new Map();
  for (const q of quads) {
    if (DEFINING_OPS.has(q.op) && isTemp(q.result)) definedBy.set(q.result, q);
  }
  return definedBy;
}

// EQ quads store their value already pre-formatted for display
// (icg.js wraps strings in literal double quotes for readability, e.g.
// arg2 === '"Dune"'). This unwraps that back into a real JS value
// (string or number) suitable for a query parameter.
function rawValue(operand) {
  if (typeof operand === 'number') return operand;
  const str = String(operand);
  if (str.startsWith('"') && str.endsWith('"')) return str.slice(1, -1);
  const n = Number(str);
  return Number.isNaN(n) ? str : n;
}

/**
 * Resolves one action quad (SELECT/INSERT), plus its optional WHERE
 * quad, into { sql, params }.
 */
function genSqlForAction(actionQuad, definedBy) {
  const table = actionQuad.arg1;
  const whereQuad = isTemp(actionQuad.arg2) ? definedBy.get(actionQuad.arg2) : null;

  if (actionQuad.op === 'SELECT') {
    if (!whereQuad) {
      return { sql: `SELECT * FROM \`${table}\``, params: [] };
    }
    return {
      sql: `SELECT * FROM \`${table}\` WHERE \`${whereQuad.arg1}\` = ?`,
      params: [rawValue(whereQuad.arg2)],
    };
  }

  if (actionQuad.op === 'INSERT') {
    if (!whereQuad) {
      // Grammar allows INSERT with no WHERE, but there's then no
      // field/value to insert. Per rules.md's "never crash" spirit
      // applied to codegen too: emit a clearly-flagged placeholder
      // instead of generating invalid or silently-wrong SQL.
      return { sql: `/* TODO: INSERT INTO \`${table}\` — no data (add a WHERE clause to supply a field/value) */`, params: [] };
    }
    return {
      sql: `INSERT INTO \`${table}\` (\`${whereQuad.arg1}\`) VALUES (?)`,
      params: [rawValue(whereQuad.arg2)],
    };
  }

  throw new Error(`codegen.js: unknown action op '${actionQuad.op}'`);
}

/** One ROUTE quad -> one Express route handler, as a source string. */
function genExpressRoute(routeQuad, definedBy) {
  const method = routeQuad.arg1.toLowerCase();
  const path = routeQuad.arg2;
  const actionQuad = definedBy.get(routeQuad.result);

  if (!actionQuad) {
    throw new Error(`codegen.js: no action quad found for route ${routeQuad.arg1} ${path}`);
  }

  const { sql, params } = genSqlForAction(actionQuad, definedBy);
  const isInsert = actionQuad.op === 'INSERT';
  const responseLine = isInsert
    ? `    res.status(201).json({ insertedId: results.insertId });`
    : `    res.json(results);`;

  return `app.${method}('${path}', (req, res) => {
  const sql = ${JSON.stringify(sql)};
  const params = ${JSON.stringify(params)};
  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
${responseLine}
  });
});`;
}

/**
 * Main entry point.
 * @param {Array<{op,arg1,arg2,result}>} quads — pass the OPTIMIZED list
 *        (optimizer.eliminateDeadCode(...).optimized), not the raw icg
 *        output, so dead defs never reach codegen.
 * @returns {{ expressCode: string, sqlStatements: string[],
 *             queries: Array<{method, path, sql, params, runnable}>, routeCount: number }}
 */
function generateCode(quads) {
  const definedBy = buildTempIndex(quads);
  const routeQuads = quads.filter((q) => q.op === 'ROUTE');

  const routes = routeQuads.map((rq) => genExpressRoute(rq, definedBy));
  const sqlStatements = routeQuads.map((rq) => {
    const actionQuad = definedBy.get(rq.result);
    return genSqlForAction(actionQuad, definedBy).sql;
  });

  // `runnable` is false for the flagged "INSERT with no WHERE" placeholder,
  // which is a SQL comment, not a statement a database can execute.
  const queries = routeQuads.map((rq) => {
    const { sql, params } = genSqlForAction(definedBy.get(rq.result), definedBy);
    return { method: rq.arg1, path: rq.arg2, sql, params, runnable: !sql.startsWith('/*') };
  });

  const expressCode = [
    `// Auto-generated by OptiScript — do not edit by hand.`,
    `const express = require('express');`,
    `const db = require('./db'); // your MySQL connection: any object with query(sql, params, callback)`,
    ``,
    `const app = express();`,
    `app.use(express.json());`,
    ``,
    routes.join('\n\n'),
    ``,
    `module.exports = app;`,
    ``,
  ].join('\n');

  return { expressCode, sqlStatements, queries, routeCount: routes.length };
}

module.exports = { generateCode, genExpressRoute, genSqlForAction, buildTempIndex, rawValue };
